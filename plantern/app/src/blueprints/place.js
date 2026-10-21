// Placing a blueprint into a house (docs/archive/2026-10-14-object-templates.md, T6): what the Objects page offers for a level and
// what it hands to addObject() / setObject(). Pure.

import { labelPoint } from '../geometry/polygon.js';
import { displayName } from '../model/names.js';
import { wallInfo } from '../edit/inspect.js';
import { placementOf } from '../../object-designs/lib/params.js';

/**
 * Where a new object of a blueprint starts (decision 230, the blueprint's meta.placement, for the chosen variant):
 * { mount, z }. A ceiling item's z puts its top at the ceiling of `room` (its own ceiling height, else the level's),
 * from the built height size[2].
 */
export function startPlacement(meta, size, level, room, params = {}) {
  const pl = placementOf(meta, params.variant);
  if (pl.mount !== 'ceiling') return pl;
  const ceiling = room?.ceilingHeight ?? level?.ceilingHeight ?? 2400;
  return { mount: 'ceiling', z: Math.max(0, Math.round(ceiling - (size?.[2] ?? 0))) };
}

/**
 * The wall a wall item starts on when it is added from a room: the longest wall face that looks into the room, with the
 * object in the middle of it. Returns { kind: 'wall', wall, side, offset } or null when the room has no such wall.
 */
export function wallInRoom(level, roomId, width = 0) {
  let best = null;
  for (const w of level.walls || []) {
    if (w.kind === 'virtual') continue;
    const info = wallInfo(level, w.id);
    const side = info?.sides.right.includes(roomId) ? 'right' : info?.sides.left.includes(roomId) ? 'left' : null;
    if (side && (!best || info.length > best.length)) best = { wall: w.id, side, length: info.length };
  }
  return best && { kind: 'wall', wall: best.wall, side: best.side, offset: Math.max(0, Math.round((best.length - width) / 2)) };
}

/** Map of blueprint id to meta, for checkObject() and validateModel() (decision 188), from the list the server answers. */
export function blueprintMap(list) {
  return new Map((list?.blueprints ?? []).map(b => [b.id, b.meta]));
}

/** Where an object can go on `level`: its rooms (with their middle) and its walls (with their length and rooms). */
/** The area of a polygon in square metres (mm in, shoelace formula), for a hint such as "12.4 m²". */
export function polygonAreaM2(polygon) {
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i], [x1, y1] = polygon[(i + 1) % polygon.length];
    twice += x0 * y1 - x1 * y0;
  }
  return Math.round(Math.abs(twice) / 2 / 1e4) / 100;
}

export function placeOptions(level) {
  const rooms = (level.rooms || []).filter(r => r.polygon?.length >= 3).map(r => ({ id: r.id, name: displayName(r), centre: labelPoint(r.polygon).pos, hint: `${polygonAreaM2(r.polygon)} m²` }));
  const roomName = new Map((level.rooms || []).map(r => [r.id, displayName(r)]));
  const walls = (level.walls || []).filter(w => w.kind !== 'virtual').map(w => {
    const length = Math.round(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]));
    const where = (w.rooms || []).map(id => roomName.get(id) ?? id).join(' / ');
    return { id: w.id, length, label: `${displayName(w)}${where ? ` · ${where}` : ''} · ${length} mm`, hint: where || 'no room' };
  });
  const openings = (level.openings || []).map(o => {
    const w = (level.walls || []).find(x => x.id === o.wall), where = (w?.rooms || []).map(id => roomName.get(id) ?? id).join(' / ');
    return { id: o.id, label: `${displayName(o)} · ${o.type}${where ? ` · ${where}` : ''} · ${Math.round(o.width ?? 0)} mm wide`, hint: `${o.type} ${Math.round(o.width ?? 0)} mm` };
  });
  return { rooms, walls, openings };
}

const num = v => (typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : v);

/**
 * The spec for addObject() from the Place form. `place` is { kind: 'room', x, y, rotationDeg } (standing in the plan) or
 * { kind: 'wall', wall, side, offset, gap } (on a wall face) or { kind: 'opening', opening, at: 'sill' | 'head', offset?, depth? } (hosted by an opening); `z` is the bottom above the floor, `size` the built size
 * [w, d, h] the server answered. Returns { spec } or { error } with a message for the form.
 */
export function placeSpec({ blueprint, params, partMaterials, size, z, name, place, light, hangs }) {
  if (!blueprint) return { error: 'Pick a blueprint first.' };
  if (!Array.isArray(size) || size.length !== 3 || !size.every(v => Number.isFinite(v) && v > 0)) return { error: 'The size of the object is not known yet.' };
  const bottom = num(z ?? 0);
  if (!Number.isFinite(bottom) || bottom < 0) return { error: 'The bottom (mm above the floor) must be 0 or more.' };
  // the size is the build's bounding box (decision 189); it stays listed as assumed until the person has checked it
  const spec = { blueprint, params: { ...params }, partMaterials: { ...partMaterials }, size, z: bottom, assumed: ['size'] };
  if (name && String(name).trim()) spec.name = String(name).trim();
  if (Array.isArray(light) && light.length === 3 && light.every(Number.isFinite)) spec.light = light;   // the built light point (LA2)
  if (place?.kind === 'opening') {
    // hosted by an opening (hosted.js): on its sill or hanging from its head; its place and height come from the opening, so no z is stored
    if (!place.opening) return { error: 'Pick the opening.' };
    const at = place.at === 'head' ? 'head' : place.at === 'frame' ? 'frame' : 'sill', blank = v => v === undefined || (typeof v === 'string' && v.trim() === '');
    const offset = blank(place.offset) ? undefined : num(place.offset), depth = blank(place.depth) ? undefined : num(place.depth);
    if (offset !== undefined && !(offset >= 0)) return { error: 'The distance along the opening must be 0 or more (empty: centred).' };
    if (depth !== undefined && !(depth >= 0)) return { error: 'The depth out from the wall must be 0 or more.' };
    spec.attach = { opening: place.opening, at, ...(place.side ? { side: place.side === 'left' ? 'left' : 'right' } : {}), ...(offset !== undefined ? { offset } : {}), ...(depth !== undefined ? { depth } : {}) };
    delete spec.z;
    return { spec };
  }
  if (place?.kind === 'wall') {
    const blank = v => v === undefined || (typeof v === 'string' && v.trim() === '');   // an empty box means 0
    const offset = blank(place.offset) ? 0 : num(place.offset), gap = blank(place.gap) ? 0 : num(place.gap);
    if (!place.wall) return { error: 'Pick the wall.' };
    if (!(offset >= 0)) return { error: 'The distance along the wall must be 0 or more.' };
    if (!(gap >= 0)) return { error: 'The gap to the wall must be 0 or more.' };
    spec.attach = { wall: place.wall, side: place.side === 'left' ? 'left' : 'right', offset, ...(gap > 0 ? { gap } : {}) };
    return { spec };
  }
  const x = num(place?.x), y = num(place?.y), rotationDeg = num(place?.rotationDeg ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Enter where it stands: x and y in mm, or pick a room.' };
  if (!Number.isFinite(rotationDeg)) return { error: 'The turn must be a number of degrees.' };
  spec.pos = [Math.round(x), Math.round(y)];
  if (hangs === 'ceiling') spec.hangs = 'ceiling';
  spec.rotationDeg = rotationDeg;
  return { spec };
}

/**
 * The changes for setObject() when the options of a placed object are applied: the blueprint's values, and the size the
 * server built (so the box in the plan is the object's real size). `assumed` is cleared of "size" by setObject itself.
 */
export function optionProps({ params, partMaterials, size }) {
  return {
    params: { ...params },
    partMaterials: partMaterials && Object.keys(partMaterials).length ? { ...partMaterials } : null,
    ...(Array.isArray(size) ? { size } : {}),
  };
}

/** Finds a placed object by id: { level, object } or null. */
export function findObject(model, id) {
  for (const level of model.levels || []) {
    const object = (level.objects || []).find(o => o.id === id);
    if (object) return { level, object };
  }
  return null;
}
