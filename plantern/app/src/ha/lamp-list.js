// The viewer's list of lamps (ui-consistency plan UX33): every Home Assistant entity the house is bound to, grouped by level
// (highest first) and the room its first lamp stands in, each with a name a person reads (UX29). Pure: the page draws it.

import { fallbackName } from '../model/names.js';
import { pointInPolygon, distToOutline } from '../geometry/polygon.js';

// the room a point is in; a lamp on a wall face sits on the room's edge, so the nearest room within 500 mm counts too
function roomAt(lv, p) {
  if (!p) return null;
  const rooms = (lv.rooms || []).filter(r => r.polygon?.length >= 3);
  return rooms.find(r => pointInPolygon(p, r.polygon)) ?? rooms.map(r => ({ r, d: distToOutline(p, r.polygon) })).filter(x => x.d <= 500).sort((a, b) => a.d - b.d)[0]?.r ?? null;
}

/**
 * groups: [{ key, level, room, entities: [{ id, name }] }]. model: the house (its levels' fixtures, derived lit lamps included);
 * bindings: location.json's; posOf(level, fixture) → its plan point or null (from the level's geometry). An entity no lamp is
 * bound to (a door sensor) goes under "Other". objectPosOf(level, object) → the middle of a bound object (a lit object).
 */
export function lampGroups(model, bindings, posOf = (lv, x) => x.pos ?? null, objectPosOf = () => null) {
  const byEntity = new Map();
  const levels = [...(model.levels || [])].sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
  for (const lv of levels) for (const x of lv.fixtures || []) {
    const ent = bindings?.[x.id]?.entity;
    if (!ent) continue;
    const room = roomAt(lv, posOf(lv, x));
    const obj = x.derived && (lv.objects || []).find(o => o.id === x.id);       // a lit object: its own name
    const name = obj ? fallbackName(obj, 'object') : fallbackName(x, 'fixture', { roomName: room?.name || '' });
    if (!byEntity.has(ent)) byEntity.set(ent, { level: lv, room, names: [] });
    const e = byEntity.get(ent);
    if (!e.names.includes(name)) e.names.push(name);
  }
  // a lit object bound to a light is a lamp even before its model has loaded (its derived lamp is added then)
  for (const lv of levels) for (const o of lv.objects || []) {
    const ent = bindings?.[o.id]?.entity;
    if (!ent || (lv.fixtures || []).some(x => x.id === o.id)) continue;
    const room = roomAt(lv, objectPosOf(lv, o));
    if (!byEntity.has(ent)) byEntity.set(ent, { level: lv, room, names: [] });
    const e = byEntity.get(ent), name = fallbackName(o, 'object');
    if (!e.names.includes(name)) e.names.push(name);
  }
  const groups = new Map();
  const add = (key, level, room, entity) => { if (!groups.has(key)) groups.set(key, { key, level, room, entities: [] }); groups.get(key).entities.push(entity); };
  for (const [id, e] of byEntity) add(`${e.level.id}/${e.room?.id ?? ''}`, e.level, e.room ?? null, { id, name: e.names.join(', ') });
  for (const id of new Set(Object.values(bindings || {}).map(b => b.entity).filter(Boolean))) if (!byEntity.has(id)) add('other', null, null, { id, name: id });
  const order = new Map(levels.map((l, i) => [l.id, i]));
  const rank = g => (g.level ? order.get(g.level.id) : 1e9);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || String(a.room?.name ?? '~').localeCompare(String(b.room?.name ?? '~')));
}

const CONTROLLABLE = new Set(['light', 'switch', 'fan', 'input_boolean']);
const OPENINGS = new Set(['door', 'window', 'opening', 'garage_door']);

/** Whether the viewer can switch this entity (the services Plantern's server calls); sensors and locks are only shown. */
export const isControllable = id => CONTROLLABLE.has(String(id).split('.')[0]);

/**
 * What a read-only entity (a sensor, a lock) shows instead of a switch: { text, tone } with tone `on`, `off`, `warn` or `missing`, or null when
 * the entity can be switched. A binary sensor on a door (isDoor: the house binds it to a door opening, or its device class says door, window or
 * opening) says Open (on) or Closed (off); any other binary sensor On or Off; a lock Locked or Unlocked.
 */
export function readOnlyStatus(id, state, isDoor = false) {
  if (isControllable(id)) return null;
  const domain = String(id).split('.')[0], s = state?.state;
  if (!state || s === 'unavailable' || s === 'unknown') return { text: !state ? 'Not found' : s === 'unknown' ? 'Unknown' : 'Unavailable', tone: 'missing' };
  if (domain === 'lock') return { text: { locked: 'Locked', unlocked: 'Unlocked', locking: 'Locking…', unlocking: 'Unlocking…', open: 'Open', jammed: 'Jammed' }[s] ?? s, tone: s === 'locked' ? 'off' : s === 'jammed' ? 'warn' : 'on' };
  if (domain === 'binary_sensor') {
    const opening = isDoor || OPENINGS.has(state.attributes?.device_class);
    return s === 'on' ? { text: opening ? 'Open' : 'On', tone: 'on' } : { text: opening ? 'Closed' : 'Off', tone: 'off' };
  }
  return { text: [s, state.attributes?.unit_of_measurement].filter(Boolean).join(' '), tone: 'off' };       // any other sensor: its value
}
