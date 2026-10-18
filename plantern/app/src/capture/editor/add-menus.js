// Editor page: add-menus. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { pointInPolygon, labelPoint } from '../../geometry/polygon.js';
import { hostsOf, defaultsFor } from '../../../object-designs/lib/params.js';
import { wallInfo } from '../../edit/inspect.js';
import { hostedWhere } from '../../model/hosted.js';
import { startPlacement, wallInRoom, placeSpec } from '../../blueprints/place.js';
import { createMenu } from '../../menu.js';
import { addEntries } from '../add-menu.js';
import { toSvg } from '../../render2d/coords.js';
import { colourSwatches } from '../../model/swatches.js';
import { boxPosForMiddle } from '../drag.js';
import { placeInRoom, roomWalls, distancesInRoom } from '../opening-capture.js';
import { readPrefs, writePrefs } from '../../model/prefs.js';
import { openDialog } from '../dialog.js';
import { usedColors } from '../../model/materials.js';
import { nameColor } from '../../edit/ops.js';
import { ASSET_NAME, assetKey } from '../../model/assets.js';
import { $, commit, esc, level, object, opening, room, wall } from './core.js';
import { setStatus } from './session.js';
import { assetCache, optionLibrary, placeObject, showBlueprintNote } from './panel-object.js';
import { selectRoom, selectWall } from './selection.js';
import { freePoint } from './drag.js';
import { Ed } from './state.js';


// ---- the Add menus (src/menu.js; the entries are src/capture/add-menu.js): the actions the buttons used to have ----
export const act = {};        // id of an Add entry → what it does; filled in by init() where the panels are wired
export const roomSpot = poly => (Ed.addAt && pointInPolygon(Ed.addAt, poly) ? Ed.addAt.map(Math.round) : labelPoint(poly).pos.map(v => Math.round(v)));
/** Offset along wall w for a thing `width` wide: under the right-click when there was one, else in the middle. */
export function wallSpot(w, width = 0) {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  if (!Ed.addAt) return Math.max(0, Math.round((L - width) / 2));
  const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], s0 = (Ed.addAt[0] - w.a[0]) * u[0] + (Ed.addAt[1] - w.a[1]) * u[1];
  return Math.round(Math.min(Math.max(s0 - width / 2, 0), Math.max(L - width, 0)));
}

/** The room an object is placed in the middle of: the selected one, else the first of the level. */
export const placeRoom = () => (Ed.shape === 'room' ? room() : null) || level().rooms?.[0];

export function addContext(where) {
  const lv = level();
  return {
    where,
    roomSelected: Ed.shape === 'room' && !!Ed.roomId,
    hasRooms: !!lv.rooms?.length,
    levelAbove: Ed.model.levels.some(l => l.elevation > lv.elevation && (l.building ?? null) === (lv.building ?? null)),
    blueprints: Ed.blueprintList?.map(b => ({ id: b.id, name: b.meta.name, source: b.source, description: b.meta.description, summary: b.meta.summary, light: !!b.light, hosts: hostsOf(b.meta) })) ?? null,
    models: Ed.assetNameList,
  };
}

/** Does what an Add entry says, in the panel `where` it was picked. */
export function addPick(where, entry) {
  const id = entry.id;
  if (id.startsWith('blueprint:')) { const [bid, at] = id.slice('blueprint:'.length).split('@'); return placeBlueprint(bid, where, at); }
  if (id.startsWith('model:')) return act.model(id.slice('model:'.length));
  if (id === 'box') return where === 'wall' ? act.wallBox() : act.box();
  return act[id]?.();
}

/**
 * Places an object made from a blueprint with its default options: the server builds it (that gives its size), it stands in
 * the middle of the room or on the selected wall, and it opens as a new object like a box does (Apply creates it; one undo step).
 */
async function placeBlueprint(id, where, at = 'sill') {
  const spot = Ed.addAt;                                             // a right-click's place, read before the build
  const meta = Ed.blueprints?.get(id);
  if (!meta) { setStatus(`The blueprint "${id}" is not available (Plantern's server must be running)`); return; }
  const params = {};
  for (const d of meta.params) if (d.type !== 'material') params[d.key] = defaultsFor(meta)[d.key];
  setStatus(`Building ${meta.name}…`);
  let built;
  try { built = await assetCache().rebuild({ blueprint: id, params, partMaterials: {} }); }
  catch (e) { setStatus(`${meta.name} cannot be built: ${e.message}`); return; }
  // where it starts comes from the blueprint (meta.placement, decision 230): on the floor, on a wall, or under the ceiling
  let place, what, room = null;
  if (where === 'opening') {
    const o = opening();
    if (!o) return;
    // the side is the room's: the object stands on the face the rooms are on (the window's inside)
    place = { kind: 'opening', opening: o.id, at, side: wallInfo(level(), o.wall)?.sides?.right?.length ? 'right' : 'left' };
    what = `${hostedWhere(at)} of ${o.id}: its place follows the opening`;
  } else if (where === 'wall') {
    const w = wall();
    if (!w) return;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), side = wallInfo(level(), w.id)?.sides?.right?.length ? 'right' : 'left';
    Ed.addAt = spot; place = { kind: 'wall', wall: w.id, side, offset: wallSpot(w, built.size[0]) }; Ed.addAt = null;
    room = level().rooms.find(r => wallInfo(level(), w.id)?.sides?.[side]?.includes(r.id)) ?? null;
    what = 'on the wall: drag it along, or set its position';
  } else {
    room = placeRoom();
    if (!room) { setStatus('Add a room first'); return; }
    const onWall = startPlacement(meta, built.size, level(), room, params).mount === 'wall' && wallInRoom(level(), room.id, built.size[0]);
    if (onWall) {
      place = onWall;
      what = 'on the longest wall of the room: drag it along, or set its position';
    } else {
      const [cx, cy] = spot && pointInPolygon(spot, room.polygon) ? spot : labelPoint(room.polygon).pos;
      place = { kind: 'room', x: cx - built.size[0] / 2, y: cy - built.size[1] / 2, rotationDeg: 0 };
      what = spot ? 'where you clicked: drag it where it belongs' : 'in the middle of the room: drag it where it belongs';
    }
  }
  const { z } = startPlacement(meta, built.size, level(), room, params);
  const r = placeSpec({ blueprint: id, params, partMaterials: {}, size: built.size, z, place, light: built.light });
  if (r.error) { setStatus(r.error); return; }
  placeObject(r.spec, `a ${meta.name} ${what}`);
}

/** The Add menus of the house view and of the room, wall and opening panels. */
export function wireAddMenus() {
  for (const [id, where] of [['addHouse', 'house'], ['addRoom', 'room'], ['wAdd', 'wall'], ['oAdd', 'opening']]) {
    createMenu($(id), { label: 'Add', icon: 'plus', align: 'right', entries: () => addEntries(addContext(where)), onPick: e => { if (!beginPlacing(where, e)) addPick(where, e); } });
  }
}
const PLACE_IN_ROOM = id => id === 'ceilingLamp' || id === 'box' || id.startsWith('model:') || (id.startsWith('blueprint:') && !id.includes('@'));
const PLACE_ON_WALL = id => ['switch', 'wallLamp', 'strip', 'box'].includes(id) || id.startsWith('model:') || (id.startsWith('blueprint:') && !id.includes('@'));
function beginPlacing(where, entry) {
  const ok = where === 'wall' ? PLACE_ON_WALL(entry.id) : (where === 'house' || where === 'room') && PLACE_IN_ROOM(entry.id);
  if (!ok) return false;
  if (Ed.measure?.isOn()) Ed.measure.setOn(false);
  Ed.placing = { where, entry, wall: where === 'wall' ? Ed.wallId : null };
  $('preview').classList.add('placing');
  setStatus(`Click ${where === 'wall' ? 'on the wall where it goes' : 'in a room where it goes'} to place the ${entry.label.toLowerCase()} · Enter: ${where === 'wall' ? 'the middle of the wall' : 'the middle of the selected room'} · Esc: cancel`);
  return true;
}
export function stopPlacing(msg = '') {
  Ed.placing = null;
  $('preview').classList.remove('placing');
  $('preview').querySelector('#pOverlay')?.remove();
  if (msg) setStatus(msg);
}
/** Put the thing being placed at plan point p (null: where the Add entry puts it without a click). */
export function finishPlacing(p) {
  const { where, entry, wall: wid } = Ed.placing;
  if (p && where !== 'wall') {
    const r = (level().rooms || []).find(x => x.polygon?.length >= 3 && pointInPolygon(p, x.polygon));
    if (!r) { setStatus('Click inside a room (Esc cancels)'); return; }
    if (Ed.roomId !== r.id || Ed.shape !== 'room') selectRoom(r.id);
  }
  if (!p && where !== 'wall' && !(Ed.shape === 'room' && Ed.roomId)) { setStatus('Select a room first, or click in one (Esc cancels)'); return; }
  if (where === 'wall' && Ed.wallId !== wid) selectWall(wid);
  stopPlacing();
  Ed.addAt = p;
  try { addPick(where === 'house' ? 'room' : where, entry); } finally { Ed.addAt = null; }
}
/** The marker that follows the pointer while placing: in a room a dot, on a wall the spot along it. */
export function drawPlacingGhost(e) {
  const svg = $('preview');
  svg.querySelector('#pOverlay')?.remove();
  if (!Ed.placing) return;
  let p = freePoint(e);
  const w = Ed.placing.wall && level().walls.find(x => x.id === Ed.placing.wall);
  if (w) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], s0 = Math.min(Math.max((p[0] - w.a[0]) * u[0] + (p[1] - w.a[1]) * u[1], 0), L); p = [w.a[0] + u[0] * s0, w.a[1] + u[1] * s0]; }
  const inRoom = !w && (level().rooms || []).some(x => x.polygon?.length >= 3 && pointInPolygon(p, x.polygon));
  const [x, y] = toSvg(p), fs = Ed.planFs, c = w || inRoom ? '#4cc38a' : '#e5534b';
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'pOverlay'; g.setAttribute('pointer-events', 'none');
  g.innerHTML = `<circle cx="${x}" cy="${y}" r="${fs * 0.5}" fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="${fs / 8}"/><text x="${x + fs * 0.8}" y="${y - fs * 0.8}" fill="${c}" font-size="${fs * 0.75}" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.3}">${esc(Ed.placing.entry.label)}</text>`;
  svg.appendChild(g);
}
/** A swatch menu beside a colour input (ND10): picking one sets the colour and fires its input and change events, as the picker would. */
/**
 * The one colour control (ui-consistency plan UX21, R4): a colour box with a swatch menu beside it (the house's palette and
 * colours, the library's, Other colour…, and this colour's own actions). `extra()` gives more entries, each with its own
 * onPick; `onColour()` is called after a colour is picked (to switch a side to colour, or tick "a colour instead").
 */
export function addSwatchPicker(input, { extra = () => [], onColour = null } = {}) {
  const host = document.createElement('div');
  host.className = 'swatchpick';
  input.after(host);
  createMenu(host, {
    label: 'Swatches', icon: 'colour', align: 'right',
    entries: () => [
      ...colourSwatches(Ed.model, optionLibrary).map(e => ({ id: e.value, label: e.label, hint: e.hint, group: e.group, swatch: e.swatch, current: e.value.toLowerCase() === input.value.toLowerCase() })),
      { id: 'other', label: 'Other colour…', icon: 'colour', group: 'More' },
      ...extra().map(x => ({ ...x, id: `@${x.id}`, group: x.group || 'This colour' })),
    ],
    onPick: e => {
      if (e.id.startsWith('@')) { extra().find(x => `@${x.id}` === e.id)?.onPick(); return; }
      if (e.id === 'other') { onColour?.(); input.click(); return; }
      input.value = e.id;
      onColour?.();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
  });
  return host;
}
// ---- a free lamp or object measured from two walls (ui-consistency plan UX23, decision 257 point 6) ----
// Under its x and y: the room it stands in, two of its walls and the distance at right angles from each wall's face, as the
// phone measures a ceiling lamp. Typing a distance moves x and y; moving it (x, y, a drag) works the distances out again.
// Only x and y are stored (pos), so nothing new is saved. For an object the distances are to its middle.
const WALL_MEASURE = {
  x: { row: 'xXRow', x: 'xX', y: 'xY', mid: p => p, pos: p => p },
  ob: {
    row: 'obXRow', x: 'obX', y: 'obY',
    // an object's x, y is the corner it is measured from; the walls measure its middle
    mid: p => { const a = (Number($('obRot').value) || 0) * Math.PI / 180, hw = (Number($('obW').value) || 0) / 2, hd = (Number($('obD').value) || 0) / 2; return [p[0] + hw * Math.cos(a) - hd * Math.sin(a), p[1] + hw * Math.sin(a) + hd * Math.cos(a)]; },
    pos: m => boxPosForMiddle({ size: [Number($('obW').value) || 0, Number($('obD').value) || 0], rotationDeg: Number($('obRot').value) || 0 }, m),
  },
};
export function addWallMeasure(prefix) {
  const c = WALL_MEASURE[prefix], after = $(c.y).closest('label');
  const box = document.createElement('div');
  box.className = 'fromWalls'; box.id = `${prefix}Walls`; box.hidden = true;
  box.innerHTML = `<div class="help">…or measured from two walls of <b data-room></b> <small>(at right angles from each wall's face${prefix === 'ob' ? ' to its middle' : ''})</small></div>`
    + ['A', 'B'].map(k => `<label>${k === 'A' ? 'From wall' : 'and wall'} <select data-edge="${k}" data-native></select></label><label>distance <small>mm</small><input data-dist="${k}" inputmode="numeric" autocomplete="off"></label>`).join('');
  after.after(box);
  const sel = k => box.querySelector(`[data-edge="${k}"]`), dist = k => box.querySelector(`[data-dist="${k}"]`);
  const apply = () => {
    const room = box.dataset.roomId, r = room && placeInRoom(level(), room, { edgeA: Number(sel('A').value), distA: dist('A').value, edgeB: Number(sel('B').value), distB: dist('B').value });
    if (!r || r.error || !dist('A').value.trim() || !dist('B').value.trim()) { box.querySelector('.help').title = r?.error || ''; return; }
    const p = c.pos(r.pos);
    box.dataset.busy = '1';
    $(c.x).value = Math.round(p[0]); $(c.y).value = Math.round(p[1]);
    $(c.x).dispatchEvent(new Event('input', { bubbles: true }));
    delete box.dataset.busy;
  };
  for (const k of ['A', 'B']) { dist(k).addEventListener('input', apply); sel(k).addEventListener('change', () => refreshWallMeasure(prefix)); }
  for (const id of [c.x, c.y]) $(id).addEventListener('input', () => { if (!box.dataset.busy) refreshWallMeasure(prefix); });
}
/** Fill the two-walls block from x and y. */
export function refreshWallMeasure(prefix) {
  const c = WALL_MEASURE[prefix], box = $(`${prefix}Walls`);
  if (!box) return;
  const x = Number($(c.x).value), y = Number($(c.y).value), mid = Number.isFinite(x) && Number.isFinite(y) && $(c.x).value !== '' ? c.mid([x, y]) : null;
  const room = mid && (level().rooms || []).find(r => r.polygon?.length >= 3 && !r.exterior && pointInPolygon(mid, r.polygon));
  box.hidden = $(c.row).hidden || !room;
  if (box.hidden) return;
  const sel = k => box.querySelector(`[data-edge="${k}"]`), dist = k => box.querySelector(`[data-dist="${k}"]`);
  const walls = roomWalls(level(), room.id), same = box.dataset.roomId === room.id;
  if (!same) for (const k of ['A', 'B']) sel(k).innerHTML = walls.map(w => `<option value="${w.i}">Wall ${esc(w.name)} · ${w.length} mm</option>`).join('');
  box.dataset.roomId = room.id;
  box.querySelector('[data-room]').textContent = room.name || room.id;
  const edges = same ? [Number(sel('A').value), Number(sel('B').value)] : undefined;      // the walls chosen stay chosen in the same room
  const d = distancesInRoom(level(), room.id, mid, edges && edges[0] !== edges[1] ? edges : undefined);
  sel('A').value = String(d.edgeA); sel('B').value = String(d.edgeB);
  dist('A').value = d.distA; dist('B').value = d.distB;
}

/**
 * Long help paragraphs folded to their first line with More… (ui-consistency plan, UX28), so a panel's fields start near the
 * top; each one's open or closed state is remembered in this browser (by its place on the page).
 */
export function foldHelp() {
  const open = readPrefs().helpOpen || {};
  document.querySelectorAll('#cap p.help').forEach((p, i) => {
    if (p.textContent.trim().length < 110 || p.querySelector('a, button')) return;   // short, or holding a link (Keys and mouse…): left open
    const key = p.id || `${p.closest('section, details, #browse')?.id || 'cap'}:${i}`;
    p.classList.add('fold'); p.classList.toggle('open', !!open[key]);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'morehelp';
    const label = () => { b.textContent = p.classList.contains('open') ? 'Less' : 'More…'; };
    b.onclick = () => { p.classList.toggle('open'); label(); writePrefs({ helpOpen: { ...(readPrefs().helpOpen || {}), [key]: p.classList.contains('open') } }); };
    label();
    p.after(b);
  });
}

/** A line of text asked in the page's own dialog (no browser prompt box). Resolves the text, or null when cancelled. */
export async function askText(title, label, value = '') {
  const r = await openDialog({ title, fields: [{ name: 'v', label, value }], buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'OK', primary: true }] });
  return r.button === 'ok' ? r.values.v : null;
}
/** Give colour c a name in the palette (empty = no name). */
export async function nameColour(c) {
  c = c.toLowerCase();
  const name = await askText(`Name for ${c}`, 'Name (empty: no name)', usedColors(Ed.model).find(x => x.color === c)?.name || '');
  if (name === null) return;
  const r = nameColor(Ed.model, c, name);
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  commit(r.model);
  setStatus(name.trim() ? `${c} is now called "${name.trim()}" (not saved yet)` : `${c} has no name now`);
}
export function fillAssetNames() {
  const used = (Ed.model?.levels || []).flatMap(l => (l.objects || []).filter(o => o.kind === 'asset' && o.asset).map(o => o.asset));
  const names = [...new Set([...Ed.assetNameList, ...used])].sort();
  Ed.assetPickNames = names;
  $('assetNames').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}
/** A line for the object panel: where the model of an asset is, or that the field is a box. */
export function assetNote(name) {
  if (!name) return 'A box. Name a model (a folder in assets/) to draw it instead.';
  if (!ASSET_NAME.test(name)) return 'A model name is lower-case letters, digits and -.';
  const st = assetCache().status(name), meta = assetCache().meta(name);
  if (st === 'missing') return `Model "${name}" is not in this house's assets/ or the shared assets/ (a red marker until it is).`;
  if (st === 'broken') return `Model "${name}" is there but cannot be shown.`;
  if (st === 'ok' && meta) return `Model "${name}": ${meta.size.join(' × ')} mm, taken as the object's size on Apply.`;
  if (st === 'ok') return `Model "${name}" is there (no meta.json, so the size stays as it is).`;
  return `Model "${name}" is loading.`;
}

// An object made from a blueprint: which one, a link to its options on the Objects page, and (when the server's build has
// another size than the one stored) the built size with a button to take it (T7). Its model field is not used.
// The server's build of each blueprint object this session, by its settings: asked for once, and again on Rebuild.
export const builds = new Map();

/**
 * Asks the server for the build of this object now (once per settings unless `force`), then shows the panel's note again.
 * A check that is made again says whether the build changed since the last one.
 */
export async function checkBuild(o, { force = false } = {}) {
  const key = assetKey(o), before = builds.get(key);
  if (!force && before) return;
  builds.set(key, { state: 'checking' });
  try {
    const { size, light } = await assetCache().rebuild(o);
    builds.set(key, { state: 'ok', size, light: light ?? null, checked: true, changedFrom: before?.state === 'ok' && before.size.join() !== size.join() ? before.size : null });
  } catch (e) {
    builds.set(key, { state: 'error', error: e.message });
  }
  const shown = object();
  if (shown?.blueprint && assetKey(shown) === key) showBlueprintNote(shown);
}
