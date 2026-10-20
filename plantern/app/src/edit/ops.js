// Edit operations: the one way the model changes (PLANTERN.md §7 Editing). Pure. Each returns
// { model, report }: the new model (the input is never mutated) and what happened, including
// reconcile()'s moves and `report.issues` from validateModel(). A refused operation returns the
// model unchanged with `report.errors`.

import { checkCheck, checkCorners, solveExtra } from '../model/checks.js';
import { freedPlacement } from '../model/hosted.js';
import { solveCapture } from '../capture/solve.js';
import { reconcile } from './reconcile.js';
import { nameFirst } from '../model/names.js';
import { bindWalls } from './bind.js';
import { upsertRoom, removeRoom as dropRoom, newRoomId } from '../capture/edit.js';
import { validateModelCached as validateModel } from '../model/validate.js';
import { checkSite, GEOREF_CRS } from '../model/site.js';
import { buildLevelGeometry, buildModelGeometry } from '../geometry/level.js';
import { collectSnapPoints } from '../tools/snap.js';
import { followLevels, levelOfRef } from './levels.js';
import { DEFAULT_CEILING, DEFAULT_FLOOR_THICKNESS, resolveElevations, checkElevationFrom, RELATIONS } from '../model/elevation.js';
import { shiftLevelGeometry } from './align.js';
import { anchorStatus, newAnchorId } from '../model/anchors.js';
import { isShared, edgeOfRef } from '../geometry/bound.js';
import { wallProfile } from '../geometry/walls.js';
import { OPENING_TYPES, OPENING_DEFAULTS, checkOpening, openingAssumed, DOOR_OPENS, WINDOW_OPENS } from '../model/openings.js';
import { FIXTURE_KINDS, FIXTURE_DEFAULTS, checkFixture, stripForm } from '../model/fixtures.js';
import { checkMaterials, materialUse } from '../model/materials.js';
import { checkSolid } from '../model/solids.js';
import { checkStairs } from '../model/stairs.js';
import { checkObject, OBJECT_DEFAULTS } from '../model/objects.js';
import { roomCeiling, roomAt } from '../model/rooms.js';
import { pointInPolygon } from '../geometry/polygon.js';
export { SOLID_KINDS } from '../model/solids.js';
export { FIXTURE_KINDS, FIXTURE_DEFAULTS, checkFixture } from '../model/fixtures.js';

const validate = (model, options = {}) => validateModel(model, buildModelGeometry(model), options.blueprints ? { blueprints: options.blueprints } : {});
const levelOf = (model, levelId) => model.levels.find(l => l.id === levelId);
const refuse = (model, ...errors) => ({ model, report: { errors, issues: [] } });

function finish(model, levelId, change, options, extra = {}) {
  const r = reconcile(model, levelId, change, options);
  // options.checkOnly (the overlap check, PF11): the level as reconcile makes it is all that is wanted: not the other levels that follow, not the validation
  if (options?.checkOnly) return { model: r.model, report: { ...extra, ...r.report, errors: [], issues: [] } };
  // rooms on other levels that hang on this level's points follow it (levels.js)
  const f = followLevels(r.model, levelId, options);
  const warnings = [...(r.report.warnings || []), ...f.report.warnings];
  return { model: f.model, report: { ...extra, ...r.report, warnings, ...(f.report.followed.length ? { followed: f.report.followed } : {}), errors: [], issues: validate(f.model, options) } };
}

/** Add a room, or replace a room's outline, measurements and other fields (same id). */
export function applyRoom(model, levelId, room, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  if (!room?.id || !(room.polygon?.length >= 3)) return refuse(model, 'a room needs an id and a polygon of 3 or more corners');
  const old = (lv.rooms || []).find(r => r.id === room.id);
  return finish(upsertRoom(model, levelId, room), levelId, { rooms: { [room.id]: old?.polygon ?? null } }, options);
}

/** Unique solid id from a name: "Chimney" → s_chimney (s_chimney_2 if taken). */
export function newSolidId(model, name) {
  const used = allIds(model);
  const slug = String(name || 'solid').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'solid';
  let id = `s_${slug}`, k = 2;
  while (used.has(id)) id = `s_${slug}_${k++}`;
  return id;
}
const allIds = model => new Set(model.levels.flatMap(l => [l.id, ...['rooms', 'walls', 'openings', 'solids', 'slabs', 'objects', 'fixtures', 'stairs'].flatMap(c => (l[c] || []).map(x => x.id))]));

/**
 * Add a solid (chimney, pillar, boxed-in pipe), or replace one (same id): footprint, measurements,
 * kind, name, base, height, colour. Then reconcile: room edges along its faces lose their walls there
 * (a wall it fully replaces is removed, unless something is on it), rooms placed at its corners follow.
 */
export function applySolid(model, levelId, solid, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  if (!/^s_[a-z0-9_]+$/.test(solid?.id || '')) return refuse(model, 'a solid needs an id like s_chimney');
  const old = (lv.solids || []).find(s => s.id === solid.id);
  if (!old && allIds(model).has(solid.id)) return refuse(model, `the id ${solid.id} is already used`);
  const s = { kind: 'chimney', ...solid };
  for (const k of Object.keys(s)) if (s[k] === null || s[k] === undefined) delete s[k];
  const { errors } = checkSolid(s, lv);
  if (errors.length) return refuse(model, ...errors.map(e => `${s.id}: ${e}`));
  const solids = old ? lv.solids.map(x => x.id === s.id ? s : x) : [...(lv.solids || []), s];
  const levels = model.levels.map(l => l.id === levelId ? { ...l, solids } : l);
  return finish({ ...model, levels }, levelId, { solids: [s.id] }, options);
}

// ---- anchors and aligning levels (PLANTERN.md §5) ----

/**
 * Add an anchor: the same physical point on two or more levels. spec = { name?, id?, refs: [ref, ref, …] } where each
 * ref is a snap point of a different level (the level is found from the ref), or points: { level: ref | [x, y] }.
 */
export function addAnchor(model, spec = {}) {
  let points = spec.points;
  if (!points) {
    points = {};
    for (const ref of spec.refs || []) {
      const lv = levelOfRef(model, ref);
      if (!lv) return refuse(model, `${ref}: no such point on any level`);
      if (points[lv]) return refuse(model, `two points of level ${lv}: an anchor has one point per level`);
      points[lv] = ref;
    }
  }
  if (Object.keys(points).length < 2) return refuse(model, 'an anchor needs points on two different levels');
  const used = new Set([...allIds(model), ...(model.anchors || []).map(a => a.id)]);
  const id = spec.id ?? newAnchorId(model, spec.name, used);
  if (!/^an_[a-z0-9_]+$/.test(id)) return refuse(model, 'an anchor id looks like an_stairwell');
  if (used.has(id)) return refuse(model, `the id ${id} is already used`);
  const an = { id, ...(spec.name ? { name: spec.name } : {}), points };
  const next = { ...model, anchors: [...(model.anchors || []), an] };
  return { model: next, report: { errors: [], issues: validate(next) }, anchor: an };
}

// ---- checks: control measurements between two snap points (PLANTERN.md §8) ----
/**
 * A room whose solve a check takes part in (it lies between two of its corners and is marked solve):
 * re-solved with it, then applied, so its walls (and what hangs on it) follow.
 */
function resolveForCheck(model, before, c, options) {
  const k = checkCorners(c) || checkCorners(before);
  if (!k) return { model, report: { errors: [], issues: validate(model) } };
  const lv = model.levels.find(l => (l.rooms || []).some(r => r.id === k.room)), room = lv?.rooms.find(r => r.id === k.room);
  if (!room?.capture || room.capture.mode !== 'lengths') return { model, report: { errors: [], issues: validate(model) } };
  const sol = solveCapture(room.capture, solveExtra(model, room));
  if (!sol.ok) return refuse(model, `${room.id} cannot be solved with this check: ${sol.errors.join('; ')}`);
  return applyRoom(model, lv.id, { ...room, polygon: sol.polygon }, options);
}

/** A new check: { a, b, measured, note?, solve? } (a and b snap refs). Returns { model, report, check }. */
export function addCheck(model, spec = {}, options = {}) {
  const used = new Set([...allIds(model), ...(model.checks || []).map(c => c.id), ...(model.anchors || []).map(a => a.id)]);
  let id = spec.id;
  if (!id) { const base = `c_${String(spec.a || '').split('#')[0].replace(/^[a-z]+_/, '')}`.replace(/[^a-z0-9_]/g, '_'); id = base; for (let k = 2; used.has(id); k++) id = `${base}_${k}`; }
  if (used.has(id)) return refuse(model, `the id ${id} is already used`);
  const c = { id, a: spec.a, b: spec.b, measured: spec.measured, ...(spec.note ? { note: spec.note } : {}), ...(spec.solve ? { solve: true } : {}) };
  const bad = checkCheck(c).errors;
  if (bad.length) return refuse(model, ...bad);
  const next = { ...model, checks: [...(model.checks || []), c] };
  return { ...(c.solve ? resolveForCheck(next, c, c, options) : { model: next, report: { errors: [], issues: validate(next) } }), check: c };
}

/** Change a check (measured, note, solve); null removes a field. A check that joins a room's solve re-solves it. */
export function setCheck(model, id, props, options = {}) {
  const old = (model.checks || []).find(c => c.id === id);
  if (!old) return refuse(model, `no check "${id}"`);
  const c = { ...old };
  for (const [k, v] of Object.entries(props || {})) { if (k === 'id') continue; if (v === null || v === false && k === 'solve') delete c[k]; else c[k] = v; }
  const bad = checkCheck(c).errors;
  if (bad.length) return refuse(model, ...bad);
  const next = { ...model, checks: model.checks.map(x => (x.id === id ? c : x)) };
  return c.solve || old.solve ? resolveForCheck(next, old, c, options) : { model: next, report: { errors: [], issues: validate(next) } };
}

export function deleteCheck(model, id, options = {}) {
  const old = (model.checks || []).find(c => c.id === id);
  if (!old) return refuse(model, `no check "${id}"`);
  const next = { ...model, checks: model.checks.filter(c => c.id !== id) };
  return old.solve ? resolveForCheck(next, old, old, options) : { model: next, report: { errors: [], issues: validate(next) } };
}

export function deleteAnchor(model, id) {
  if (!(model.anchors || []).some(a => a.id === id)) return refuse(model, `no anchor "${id}"`);
  const next = { ...model, anchors: model.anchors.filter(a => a.id !== id) };
  return { model: next, report: { errors: [], issues: validate(next) } };
}

/** Move every level-wide thing of `levelId` by [dx, dy] (see align.js); rooms of other levels hung on it follow. */
export function shiftLevel(model, levelId, delta, options = {}) {
  if (!levelOf(model, levelId)) return refuse(model, `no level "${levelId}"`);
  if (!Array.isArray(delta) || delta.length !== 2 || !delta.every(Number.isFinite)) return refuse(model, 'the shift must be [dx, dy] in mm');
  const moved = shiftLevelGeometry(model, levelId, delta), f = followLevels(moved, levelId, options);
  return { model: f.model, report: { errors: [], warnings: f.report.warnings, ...(f.report.followed.length ? { followed: f.report.followed } : {}), issues: validate(f.model) } };
}

/**
 * Line a level up with an anchor: shift `levelId` (default: the highest level of the anchor) so that its point of the
 * anchor is where the lowest level of it has it. Returns { model, report, delta }.
 */
export function alignLevel(model, anchorId, levelId, options = {}) {
  const st = anchorStatus(model, buildModelGeometry(model)).find(a => a.id === anchorId);
  if (!st) return refuse(model, `no anchor "${anchorId}" with points on several levels`);
  const lv = levelId ?? Object.keys(st.deltas).at(-1);
  const d = st.deltas[lv];
  if (!d) return refuse(model, `${lv} is the reference of ${anchorId} (or has no point in it): align a level above it`);
  const r = shiftLevel(model, lv, [-d[0], -d[1]], options);
  return { ...r, delta: [-d[0], -d[1]] };
}

/** Unique stairs id from a name: "Main stairs" → st_main_stairs (st_main_stairs_2 if taken). */
export function newStairsId(model, name) {
  const slug = String(name || 'stairs').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'stairs';
  let id = `st_${slug}`, k = 2;
  while (allIds(model).has(id)) id = `st_${slug}_${k++}`;
  return id;
}

/**
 * Add stairs to level `levelId` (where they start) or replace the ones with the same id (PLANTERN.md §6.4).
 * The stair's position follows its start point (a corner of a room, wall or solid, also one of the level
 * below or above) at every build, so nothing needs re-solving when rooms move. Returns { model, report }.
 */
export function applyStairs(model, levelId, stairs, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  const old = (lv.stairs || []).find(s => s.id === stairs?.id);
  if (!old && allIds(model).has(stairs?.id)) return refuse(model, `the id ${stairs.id} is already used`);
  let st = { ...stairs };
  for (const k of Object.keys(st)) if (st[k] === null || st[k] === undefined) delete st[k];
  st = nameFirst(st);
  const { errors } = checkStairs(st, model, lv);
  if (errors.length) return refuse(model, ...errors.map(e => `${st.id}: ${e}`));
  const list = old ? lv.stairs.map(s => s.id === st.id ? st : s) : [...(lv.stairs || []), st];
  const levels = model.levels.map(l => l.id === levelId ? { ...l, stairs: list } : l);
  return { ...finish({ ...model, levels }, levelId, {}, options), stairs: st };
}

/** Remove stairs; the opening in the floor above goes with them. */
export function removeStairs(model, levelId, id, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv?.stairs?.some(s => s.id === id)) return refuse(model, `no stairs "${id}" on level "${levelId}"`);
  const levels = model.levels.map(l => l.id === levelId ? { ...l, stairs: l.stairs.filter(s => s.id !== id) } : l);
  return finish({ ...model, levels }, levelId, {}, options);
}

/** Remove a solid; the room edges along it get walls again (thickness assumed). Rooms placed at its corners are listed (`dependents`). */
export function removeSolid(model, levelId, solidId, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv?.solids?.some(s => s.id === solidId)) return refuse(model, `no solid "${solidId}" on level "${levelId}"`);
  const dependents = (lv.rooms || []).filter(r => String(r.capture?.raw?.origin?.ref || '').split('#')[0] === solidId).map(r => r.id);
  const levels = model.levels.map(l => l.id === levelId ? { ...l, solids: l.solids.filter(s => s.id !== solidId) } : l);
  return finish({ ...model, levels }, levelId, { solids: [solidId] }, options, { dependents });
}

/**
 * Remove a room (see capture/edit.js removeRoom for what goes with it), then reconcile: a wall it
 * shared is re-bound to the neighbour's edge.
 */
export function removeRoom(model, levelId, roomId, options = {}) {
  if (!levelOf(model, levelId)?.rooms?.some(r => r.id === roomId)) return refuse(model, `no room "${roomId}" on level "${levelId}"`);
  const { model: next, ...dropped } = dropRoom(model, levelId, roomId);
  return finish(next, levelId, {}, options, dropped);
}

const POSITION = ['id', 'a', 'b', 'from', 'rooms', 'cut'];

/**
 * Change a wall's own properties (kind, thickness, height, base, sides, lightBlocking, style, …).
 * A value set here counts as measured: its name leaves `assumed`. Position belongs to the rooms for
 * a bound wall and is refused; so is the thickness of a shared wall (it is the face distance
 * between the two rooms: move a room instead). `null` removes a property.
 */
export function setWallProps(model, levelId, wallId, props, options = {}) {
  const lv = levelOf(model, levelId), w = lv?.walls?.find(x => x.id === wallId);
  if (!w) return refuse(model, `no wall "${wallId}" on level "${levelId}"`);
  const keys = Object.keys(props || {});
  const bad = keys.filter(k => k === 'id' || (w.from?.length && POSITION.includes(k)));
  if (bad.length) return refuse(model, `${wallId}: ${bad.join(', ')} cannot be set here (${w.from?.length ? 'its position follows its rooms' : 'ids never change'})`);
  if ('thickness' in props && w.kind !== 'virtual' && isShared(w, new Map((lv.rooms || []).map(r => [r.id, r])))) return refuse(model, `${wallId} is shared by two rooms: its thickness is the distance between their faces; move a room to change it`);
  if ('thickness' in props && !(props.thickness >= 0)) return refuse(model, 'thickness must be 0 or more');
  const nw = { ...w };
  for (const k of keys) { if (props[k] === null) delete nw[k]; else nw[k] = props[k]; }
  // a virtual boundary on a room edge turned into a wall: its face stays on the room edge and the thickness goes away
  // from the room (PLANTERN §4), not centred on the line it was drawn on (fixes list 44)
  if ('kind' in props && w.kind === 'virtual' && props.kind !== 'virtual' && w.from?.length && w.justify === 'center' && !('justify' in props)) nw.justify = 'left';
  // a hand-drawn wall moved by hand keeps hanging on its points: the offsets change, not the points
  if (nw.anchor && ('a' in props || 'b' in props) && !('anchor' in props)) {
    const g = buildLevelGeometry(lv), pts = new Map(collectSnapPoints(model, lv, g).map(s => [s.ref, s.pos])), r1 = v => Math.round(v * 10) / 10;
    nw.anchor = Object.fromEntries(Object.entries(nw.anchor).map(([end, an]) => { const at = pts.get(an.ref); return [end, at ? { ...an, offset: [r1(nw[end][0] - at[0]), r1(nw[end][1] - at[1])] } : an]; }));
  }
  const assumed = keys.includes('assumed') ? props.assumed || [] : (w.assumed || []).filter(k => !keys.includes(k));
  if (assumed.length) nw.assumed = assumed; else delete nw.assumed;
  const levels = model.levels.map(l => l.id === levelId ? { ...l, walls: l.walls.map(x => x.id === wallId ? nameFirst(nw) : x) } : l);
  return finish({ ...model, levels }, levelId, { walls: [wallId] }, options);
}

/** Link hand-drawn walls to the room edges they sit on, only where that moves nothing (see bind.js). */
export function linkWalls(model, levelId, options = {}) {
  if (!levelOf(model, levelId)) return refuse(model, `no level "${levelId}"`);
  const r = bindWalls(model, levelId, options);
  return { model: r.model, report: { ...r.report, errors: [], issues: validate(r.model) } };
}

/** A newly measured room (wizard Done, editor Import): new unique id from its name, then applyRoom(). Returns { model, report, room }. */
export function addRoom(model, levelId, { name, exterior }, polygon, capture, options = {}) {
  const id = newRoomId(model, name);
  const room = { id, name: String(name || '').trim() || id, exterior: !!exterior, polygon, capture };
  return { ...applyRoom(model, levelId, room, options), room };
}

/** Validation errors block saving (Download still works, so work is never trapped). */
export const blockingErrors = report => (report.issues || []).filter(i => i.severity === 'error');

/**
 * Delete a wall and the openings in it. Refused while an object or fixture is attached to it (move
 * or delete those first), so nothing is left pointing at a missing wall. A bound wall's edges are
 * then covered again by reconcile() (a new wall), unless that is what you want to avoid: use it for
 * orphans and hand-drawn walls.
 */
export function deleteWall(model, levelId, wallId, options = {}) {
  const lv = levelOf(model, levelId), w = lv?.walls?.find(x => x.id === wallId);
  if (!w) return refuse(model, `no wall "${wallId}" on level "${levelId}"`);
  const gone = new Set((lv.openings || []).filter(o => o.wall === wallId).map(o => o.id));
  const held = [...(lv.objects || []), ...(lv.fixtures || [])].filter(x => x.attach?.wall === wallId || gone.has(x.attach?.opening) || (x.kind === 'strip' && gone.has(x.attach?.opening))).map(x => x.id);
  if (held.length) return refuse(model, `${wallId}: ${held.join(', ')} ${held.length > 1 ? 'are' : 'is'} attached to it; move or delete ${held.length > 1 ? 'them' : 'it'} first`);
  const removedOpenings = (lv.openings || []).filter(o => o.wall === wallId).map(o => o.id);
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, walls: l.walls.filter(x => x.id !== wallId), ...(l.openings ? { openings: l.openings.filter(o => o.wall !== wallId) } : {}) });
  return finish({ ...model, levels }, levelId, {}, options, { removedOpenings });
}

/**
 * Split a wall in two at `at` mm from its `a` end (PLANTERN.md §6.2 `cut`). Both parts keep every
 * property (thickness, kind, sides, assumed, …) and can then be changed on their own; openings and
 * attached things go to the part they are on, and a split through one is refused. A wall that
 * follows its rooms stays bound: each part records where it is cut, in mm from the start corner of
 * its first room edge, so the split stays put when the room is re-measured. Returns { model, report }
 * with report.parts = [id of the a-side part (the old id), id of the new part].
 */
export function splitWall(model, levelId, wallId, at, options = {}) {
  const lv = levelOf(model, levelId), w = lv?.walls?.find(x => x.id === wallId);
  if (!w) return refuse(model, `no wall "${wallId}" on level "${levelId}"`);
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), s = Number(at);
  if (!(s >= 1 && s <= L - 1)) return refuse(model, `split point must be between 1 and ${Math.floor(L - 1)} mm from the wall's start`);
  const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], P = [Math.round((w.a[0] + u[0] * s) * 10) / 10, Math.round((w.a[1] + u[1] * s) * 10) / 10];
  const ops = (lv.openings || []).filter(o => o.wall === wallId);
  const across = ops.find(o => o.offset < s - 0.5 && o.offset + o.width > s + 0.5);
  if (across) return refuse(model, `${wallId}: the split would cut through ${across.id}; split beside it`);
  const used = new Set(model.levels.flatMap(l => (l.walls || []).map(x => x.id)));
  let id2 = `${wallId}_2`, k = 3;
  while (used.has(id2)) id2 = `${wallId}_${k++}`;
  const part1 = { ...w, b: P }, part2 = { ...w, id: id2, a: P };
  if (w.from?.length) {
    const e = edgeOfRef(w.from[0], new Map((lv.rooms || []).map(r => [r.id, r])));
    if (!e) return refuse(model, `${wallId} follows a room edge that no longer exists; delete it or keep it as a hand-drawn wall first`);
    const tS = Math.round(((P[0] - e.p[0]) * e.u[0] + (P[1] - e.p[1]) * e.u[1]) * 10) / 10;
    const [c0, c1] = w.cut || [null, null];
    part1.cut = [c0 ?? null, tS];
    part2.cut = [tS, c1 ?? null];
  }
  const openings = (lv.openings || []).map(o => (o.wall === wallId && o.offset >= s - 0.5 ? { ...o, wall: id2, offset: Math.round((o.offset - s) * 10) / 10 } : o));
  const move = key => (lv[key] || []).map(x => {
    if (x.attach?.wall !== wallId) return x;
    const size = key === 'objects' ? x.size?.[0] ?? 0 : 0;
    if (x.attach.offset < s - 0.5 && x.attach.offset + size > s + 0.5) return x;     // straddles: stays on the a side
    return x.attach.offset >= s - 0.5 ? { ...x, attach: { ...x.attach, wall: id2, offset: Math.round((x.attach.offset - s) * 10) / 10 } } : x;
  });
  const walls = lv.walls.flatMap(x => (x.id === wallId ? [part1, part2] : [x]));
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, walls, ...(l.openings ? { openings } : {}), ...(l.objects ? { objects: move('objects') } : {}), ...(l.fixtures ? { fixtures: move('fixtures') } : {}) });
  const r = finish({ ...model, levels }, levelId, { walls: [wallId, id2] }, options);
  return { model: r.model, report: { ...r.report, parts: [wallId, id2] } };
}

/**
 * Walls `wallId` can be joined with: the other part of a wall split by hand (same room edges, the
 * cuts meeting), or a hand-drawn wall continuing it on the same line. [{ id, side: 'a' | 'b' }]:
 * which end of `wallId` it continues from.
 */
export function joinableWalls(level, wallId) {
  const w = level?.walls?.find(x => x.id === wallId);
  if (!w) return [];
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1;
  const u = v => { const L = Math.hypot(v.b[0] - v.a[0], v.b[1] - v.a[1]) || 1; return [(v.b[0] - v.a[0]) / L, (v.b[1] - v.a[1]) / L]; };
  const same = (x, y) => x.length === y.length && x.every(r => y.includes(r));
  const out = [];
  for (const v of level.walls) {
    if (v.id === w.id || v.kind !== w.kind) continue;
    const [uw, uv] = [u(w), u(v)];
    if (Math.abs(uw[0] * uv[1] - uw[1] * uv[0]) > 1e-3 || uw[0] * uv[0] + uw[1] * uv[1] < 0) continue;     // not the same way on one line
    const side = near(w.b, v.a) ? 'b' : near(w.a, v.b) ? 'a' : null;
    if (!side) continue;
    if (w.from?.length || v.from?.length) {
      // two parts of one split wall: the same edges, and the cut where they meet
      if (!w.from?.length || !v.from?.length || !same(w.from, v.from) || !w.cut || !v.cut) continue;
      const [first, second] = side === 'b' ? [w, v] : [v, w];
      if (first.cut[1] === null || second.cut[0] === null || Math.abs(first.cut[1] - second.cut[0]) > 1) continue;
    }
    out.push({ id: v.id, side });
  }
  return out;
}

/**
 * Join `otherId` into `wallId` (the reverse of splitWall): one wall from the start of the first to the
 * end of the second, with `wallId`'s own properties (thickness, kind, colours, …; the other's are
 * dropped and listed in `report.dropped`). Openings and attached things on the other wall move onto
 * it at the same place. Refused unless joinableWalls() offers the pair.
 */
export function joinWalls(model, levelId, wallId, otherId, options = {}) {
  const lv = levelOf(model, levelId), w = lv?.walls?.find(x => x.id === wallId), v = lv?.walls?.find(x => x.id === otherId);
  if (!w || !v) return refuse(model, `no wall "${!w ? wallId : otherId}" on level "${levelId}"`);
  const pair = joinableWalls(lv, wallId).find(x => x.id === otherId);
  if (!pair) return refuse(model, `${wallId} and ${otherId} do not continue each other (only two parts of a split wall, or walls on one line meeting end to end, can be joined)`);
  const len = x => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]);
  const [first, second] = pair.side === 'b' ? [w, v] : [v, w];
  const merged = { ...w, a: first.a, b: second.b };
  if (w.from?.length) {
    const cut = [first.cut[0] ?? null, second.cut[1] ?? null];
    if (cut[0] === null && cut[1] === null) delete merged.cut; else merged.cut = cut;
  }
  // where things on each part land on the joined wall
  const shift = id => (id === first.id ? 0 : len(first));
  const r1 = x => Math.round(x * 10) / 10;
  const openings = (lv.openings || []).map(o => (o.wall === w.id || o.wall === v.id ? { ...o, wall: w.id, offset: r1(o.offset + shift(o.wall)) } : o));
  const move = key => (lv[key] || []).map(x => (x.attach && (x.attach.wall === w.id || x.attach.wall === v.id) ? { ...x, attach: { ...x.attach, wall: w.id, offset: r1(x.attach.offset + shift(x.attach.wall)) } } : x));
  const IGNORE = new Set(['id', 'a', 'b', 'cut', 'from', 'rooms', 'assumed']);
  const dropped = [...new Set([...Object.keys(w), ...Object.keys(v)])].filter(k => !IGNORE.has(k) && JSON.stringify(w[k]) !== JSON.stringify(v[k]));
  const walls = lv.walls.filter(x => x.id !== v.id).map(x => (x.id === w.id ? merged : x));
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, walls, ...(l.openings ? { openings } : {}), ...(l.objects ? { objects: move('objects') } : {}), ...(l.fixtures ? { fixtures: move('fixtures') } : {}) });
  const r = finish({ ...model, levels }, levelId, { walls: [w.id] }, options);
  return { model: r.model, report: { ...r.report, joined: [w.id, v.id], dropped } };
}

/**
 * Draw a wall by hand (PLANTERN.md §4, §6.2): a wall not made from a room edge (no `from`), so room
 * changes never move it. A room divider, a half wall, a sloped wall beside stairs, a lintel (a wall
 * with its `base` up near the ceiling). spec = { a, b, thickness?, justify?, kind?, base?, height?, name? };
 * the reference line runs a → b and is a face: `justify` "left" by default (thickness to the left of a → b). Returns
 * { model, report, wall }.
 */
export function addWall(model, levelId, spec = {}, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  const ok = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  if (!ok(spec.a) || !ok(spec.b)) return refuse(model, 'a wall needs a start and an end point (a, b)');
  if (Math.hypot(spec.b[0] - spec.a[0], spec.b[1] - spec.a[1]) < 10) return refuse(model, 'the wall is shorter than 10 mm');
  const kind = spec.kind ?? 'wall', thickness = spec.thickness ?? (kind === 'railing' ? 40 : 100);
  if (!['wall', 'railing', 'virtual'].includes(kind)) return refuse(model, `unknown wall kind "${kind}"`);
  if (!(thickness >= 0)) return refuse(model, 'thickness must be 0 or more');
  // named after the point its start hangs on (w_kitchen_p0), unless given a name; ids never change afterwards
  const fromAnchor = !spec.name && spec.anchor?.a?.ref ? spec.anchor.a.ref.replace(/^[a-z]+_/, '').replace('#', '_') : null;
  const used = allIds(model), slug = String(spec.name || fromAnchor || 'wall').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'wall';
  let id = `w_${slug}`, k = 2;
  while (used.has(id)) id = `w_${slug}_${k++}`;
  const r1 = v => Math.round(v * 10) / 10;
  // the drawn line is a face (thickness to its left), as walls are measured; centred only when asked
  const wall = { id, kind, a: spec.a.map(r1), b: spec.b.map(r1), thickness: kind === 'virtual' ? 0 : thickness, justify: spec.justify ?? 'left',
    ...(spec.base ? { base: spec.base } : {}), ...(spec.height !== undefined ? { height: spec.height } : {}), ...(spec.sides ? { sides: spec.sides } : {}),
    ...(spec.anchor && Object.keys(spec.anchor).length ? { anchor: spec.anchor } : {}),
    ...(spec.thickness === undefined && kind !== 'virtual' ? { assumed: ['thickness'] } : {}) };
  const levels = model.levels.map(l => l.id === levelId ? { ...l, walls: [...(l.walls || []), wall] } : l);
  const r = finish({ ...model, levels }, levelId, { walls: [id] }, options);
  return { ...r, wall: levelOf(r.model, levelId).walls.find(w => w.id === id) };
}

/** Keep a bound wall as a hand-drawn wall: it stops following its rooms and is never moved again. */
export function unbindWall(model, levelId, wallId, options = {}) {
  const lv = levelOf(model, levelId), w = lv?.walls?.find(x => x.id === wallId);
  if (!w) return refuse(model, `no wall "${wallId}" on level "${levelId}"`);
  if (!w.from) return refuse(model, `${wallId} is already hand-drawn`);
  const { from, ...rest } = w;
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, walls: l.walls.map(x => x.id === wallId ? rest : x) });
  return finish({ ...model, levels }, levelId, {}, options);
}

/** Fill room edges that no wall covers (and bring bound walls up to date), without any room change. */
export function fillWalls(model, levelId, options = {}) {
  if (!levelOf(model, levelId)) return refuse(model, `no level "${levelId}"`);
  return finish(model, levelId, {}, options);
}

/** House orientation: how far plan north is from true north, clockwise (PLANTERN.md §3). */
export function setNorthAngle(model, deg) {
  if (!Number.isFinite(deg)) return refuse(model, 'the angle must be a number');
  const next = { ...model, site: { ...(model.site || { origin: [0, 0] }), northAngleDeg: deg } };
  return { model: next, report: { errors: [], issues: validate(next) } };
}

const SITE_PROPS = ['northAngleDeg', 'georef'];
const GEOREF_EDIT_KEYS = ['origin', 'groundFloorHeight', 'accuracy', 'source'];
const emptyValue = v => v === null || v === undefined || v === '';
const roundMm = v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);   // metres to the millimetre: no float noise in the file

/**
 * Where the house is and which way it faces (PLANTERN.md §14.4, `src/model/site.js`): the north angle and `site.georef`.
 *   props.northAngleDeg   number of degrees; null removes it
 *   props.georef          { origin?: [east, north] metres (SWEREF 99 TM), groundFloorHeight?: metres (RH 2000), accuracy?: metres,
 *                           source?: 'typed' | 'map' | 'gps' }: only the keys given change, null (or an empty value) removes one;
 *                         the whole value null removes the georef. `crs` is set to EPSG:3006 with the origin.
 * A value of the wrong kind refuses the whole change (errors say why); a believable-but-odd value (outside Sweden) is
 * accepted and shows in `report.issues` as a warning. Returns { model, report: { errors, changed, issues } }.
 */
export function setSite(model, props = {}) {
  const unknown = Object.keys(props).filter(k => !SITE_PROPS.includes(k));
  if (unknown.length) return refuse(model, ...unknown.map(k => `${k} cannot be set here`));
  const site = { ...(model.site || { origin: [0, 0] }) };
  const errors = [];
  if ('northAngleDeg' in props) {
    if (emptyValue(props.northAngleDeg)) delete site.northAngleDeg; else site.northAngleDeg = props.northAngleDeg;
  }
  if ('georef' in props) {
    const g = props.georef;
    if (emptyValue(g)) delete site.georef;
    else if (typeof g !== 'object' || Array.isArray(g)) errors.push('georef must be an object');
    else {
      const next = { ...(site.georef || {}) };
      for (const [k, v] of Object.entries(g)) {
        if (!GEOREF_EDIT_KEYS.includes(k)) errors.push(`georef.${k} cannot be set here`);
        else if (emptyValue(v)) delete next[k];
        else next[k] = k === 'origin' && Array.isArray(v) ? v.map(roundMm) : roundMm(v);
      }
      if (next.origin) next.crs = GEOREF_CRS;
      else { delete next.crs; delete next.accuracy; delete next.source; }   // how well and how the position was set mean nothing without it
      const ordered = {};
      for (const k of ['crs', 'origin', 'groundFloorHeight', 'accuracy', 'source']) if (k in next) ordered[k] = next[k];
      if (Object.keys(ordered).length) site.georef = ordered; else delete site.georef;
    }
  }
  const bad = checkSite(site).filter(i => i.severity === 'error').map(i => i.msg);
  if (errors.length || bad.length) return refuse(model, ...errors, ...bad);
  const next = { ...model, site };
  const flat = (s, p = '') => Object.entries(s || {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${p}${k}.`) : [[`${p}${k}`, JSON.stringify(v)]]));
  const before = new Map(flat(model.site)), after = new Map(flat(site));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(k => before.get(k) !== after.get(k));
  return { model: next, report: { errors: [], changed, issues: validate(next) } };
}

export { DEFAULT_CEILING, DEFAULT_FLOOR_THICKNESS } from '../model/elevation.js';

/** Level id from a name: "Ground floor" → ground_floor; unique across every id in the model file. */
export function newLevelId(model, name) {
  const used = new Set(model.levels.flatMap(l => [l.id, ...['rooms', 'walls', 'openings', 'solids', 'slabs', 'objects', 'fixtures', 'stairs'].flatMap(c => (l[c] || []).map(x => x.id))]));
  const slug = String(name || 'level').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'level';
  const base = /^[a-z]/.test(slug) ? slug : `level_${slug}`;
  let id = base, k = 2;
  while (used.has(id)) id = `${base}_${k++}`;
  return id;
}

/**
 * Add a level (PLANTERN.md §5). spec = { name, id?, ceilingHeight?, elevation?, floorThickness?,
 * elevationFrom? } in mm. The first level is the datum (elevation 0). Values not given get defaults and
 * are listed in `assumed`: ceiling height 2400, floor build-up 250, and for a later level the elevation
 * just above the highest level. With `elevationFrom` ({ level, relation: 'above' | 'below' | 'same',
 * offset? }, decision 110) the elevation follows that level and is worked out, never assumed. Two
 * levels may share an elevation (a part of a floor kept as its own level). Levels stay ordered by
 * elevation. Returns { model, report, level }.
 */
export function addLevel(model, spec = {}) {
  const name = String(spec.name ?? '').trim();
  if (!name) return refuse(model, 'a level needs a name');
  const id = spec.id ? String(spec.id).trim() : newLevelId(model, name);
  if (!/^[a-z][a-z0-9_]*$/.test(id)) return refuse(model, `level id "${id}": use lowercase letters, digits and _ (starting with a letter)`);
  if (model.levels.some(l => l.id === id) || newLevelId(model, id) !== id) return refuse(model, `id "${id}" is already used in this model`);
  const given = k => spec[k] !== undefined && spec[k] !== null && spec[k] !== '';
  for (const k of ['ceilingHeight', 'elevation', 'floorThickness']) if (given(k) && !Number.isFinite(Number(spec[k]))) return refuse(model, `${k} must be a number of mm`);
  if (given('ceilingHeight') && !(Number(spec.ceilingHeight) > 0)) return refuse(model, 'ceiling height must be more than 0');
  if (given('floorThickness') && !(Number(spec.floorThickness) >= 0)) return refuse(model, 'floor build-up must be 0 or more');
  const assumed = [];
  const value = (k, fallback) => { if (given(k)) return Number(spec[k]); assumed.push(k); return fallback; };
  const top = [...model.levels].sort((a, b) => b.elevation - a.elevation)[0];
  const ceilingHeight = value('ceilingHeight', DEFAULT_CEILING);
  const floorThickness = value('floorThickness', DEFAULT_FLOOR_THICKNESS);
  const from = spec.elevationFrom ? cleanElevationFrom(spec.elevationFrom) : null;
  let elevation;
  if (!top) {
    if (given('elevation') && Number(spec.elevation) !== 0) return refuse(model, 'the first level is the datum: its elevation is 0');
    if (from) return refuse(model, 'the first level is the datum: it follows no other level');
    elevation = 0;                                   // the datum is a definition, not an assumption
  } else if (from) elevation = 0;                    // worked out below, from the level it follows
  else elevation = value('elevation', top.elevation + (top.ceilingHeight ?? DEFAULT_CEILING) + floorThickness);
  const level = { id, name, elevation, floorThickness, ceilingHeight, ...(from ? { elevationFrom: from } : {}), ...(assumed.length ? { assumed } : {}), rooms: [], walls: [], openings: [], solids: [], objects: [], fixtures: [] };
  if (from) { const errs = checkElevationFrom({ ...model, levels: [...model.levels, level] }, level); if (errs.length) return refuse(model, ...errs); }
  const r = resolveElevations({ ...model, levels: [...model.levels, level].sort((a, b) => a.elevation - b.elevation) });
  if (r.errors.length) return refuse(model, ...r.errors);
  const next = { ...r.model, levels: [...r.model.levels].sort((a, b) => a.elevation - b.elevation) };
  return { model: next, report: { errors: [], issues: validate(next) }, level: next.levels.find(l => l.id === id) };
}

/** An elevationFrom as stored: { level, relation, offset? } (offset left out when 0). */
function cleanElevationFrom(f) {
  const out = { level: String(f.level ?? ''), relation: f.relation ?? 'above' };
  const off = f.offset === undefined || f.offset === null || f.offset === '' ? 0 : Number(f.offset);
  if (off !== 0 || !Number.isFinite(off)) out.offset = off;
  return out;
}

/**
 * Change a level (PLANTERN.md §5): props = { name?, elevation?, ceilingHeight?, floorThickness?, capture?: { ceilingHeight?,
 * floorToFloor? }, elevationFrom? } in mm (null removes a field; capture fields null remove that measurement). A value set
 * here counts as measured (it leaves the level's `assumed`). The level with elevation 0 is the datum: its elevation stays 0
 * and it follows no other level. `elevationFrom` ({ level, relation: 'above' | 'below' | 'same', offset? }, decision 110)
 * makes the elevation follow another level; a typed elevation ends that. Afterwards every following level is worked out
 * again (resolveElevations), so the floors on top of this one move with it; a cycle is refused. Two levels may share an
 * elevation (a part of a floor). Levels stay ordered by elevation; stairs and anchors follow by id, so nothing else needs
 * fixing (the validator reports what no longer fits, e.g. a stair whose rise changed).
 * Returns { model, report: { errors, moved: [{ level, from, to }], issues } }.
 */
export function setLevel(model, levelId, props = {}) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  const keys = Object.keys(props);
  if (keys.includes('id')) return refuse(model, 'ids never change');
  const next = { ...lv }, num = (k, v) => { if (v !== null && !Number.isFinite(Number(v))) throw new Error(`${k} must be a number of mm`); return v === null ? null : Number(v); };
  try {
    for (const k of keys) {
      if (k === 'name') { const n = String(props.name ?? '').trim(); if (!n) throw new Error('a level needs a name'); next.name = n; }
      else if (k === 'elevationFrom') {
        if (!props.elevationFrom) delete next.elevationFrom;
        else if (lv.elevation === 0 && !lv.elevationFrom) throw new Error('this is the datum level (elevation 0): the other levels follow it, not the other way round');
        else next.elevationFrom = cleanElevationFrom(props.elevationFrom);
      } else if (k === 'capture') {
        const cap = { ...(lv.capture || {}) };
        for (const [ck, cv] of Object.entries(props.capture || {})) {
          if (!['ceilingHeight', 'floorToFloor'].includes(ck)) throw new Error(`capture.${ck} is not a measurement of a level`);
          const v = num(`capture.${ck}`, cv);
          if (v === null) delete cap[ck]; else if (!(v > 0)) throw new Error(`capture.${ck} must be more than 0`); else cap[ck] = v;
        }
        if (Object.keys(cap).length) next.capture = cap; else delete next.capture;
      } else if (['elevation', 'ceilingHeight', 'floorThickness'].includes(k)) {
        const v = num(k, props[k]);
        if (v === null) throw new Error(`${k} cannot be removed`);
        if (k === 'ceilingHeight' && !(v > 0)) throw new Error('ceiling height must be more than 0');
        if (k === 'floorThickness' && !(v >= 0)) throw new Error('floor build-up must be 0 or more');
        if (k === 'elevation' && lv.elevation === 0 && !lv.elevationFrom && v !== 0) throw new Error('this is the datum level (elevation 0): the other levels are measured from it');
        next[k] = v;
      } else throw new Error(`${k} cannot be set here`);
    }
  } catch (e) { return refuse(model, e.message); }
  if ('elevation' in props && !('elevationFrom' in props)) delete next.elevationFrom;   // typed: it stays where it is put
  if (next.elevationFrom) { const errs = checkElevationFrom(model, next); if (errs.length) return refuse(model, ...errs.map(e => `${levelId}: ${e}`)); }
  const assumed = (lv.assumed || []).filter(k => !keys.includes(k) && !(k === 'elevation' && next.elevationFrom));
  if (assumed.length) next.assumed = assumed; else delete next.assumed;
  const r = resolveElevations({ ...model, levels: model.levels.map(l => (l.id === levelId ? next : l)) });
  if (r.errors.length) return refuse(model, ...r.errors);
  // what moved: the levels worked out again, and this one when its elevation was typed
  const moved = [...r.changed];
  if (!next.elevationFrom && next.elevation !== lv.elevation) moved.unshift({ level: levelId, from: lv.elevation, to: next.elevation });
  else { const c = moved.find(x => x.level === levelId); if (c) c.from = lv.elevation; }
  const out = { ...r.model, levels: r.model.levels.map((l, i) => [l, i]).sort((x, y) => x[0].elevation - y[0].elevation || x[1] - y[1]).map(x => x[0]) };
  return { model: out, report: { errors: [], moved, issues: validate(out) } };
}

const INVERSE = { above: 'below', below: 'above', same: 'same' };
/**
 * Make `levelId` the datum: its floor becomes elevation 0 and every level moves by the same amount, so
 * nothing changes height relative to the others (rooms, walls and stairs are measured from their own
 * floor, so they need nothing). The chain it followed is turned round (decision 111): a ground floor that
 * was "on top of" a basement created first makes that basement "under" the ground floor, with the same
 * floor-to-floor (the formulas for above and below use the same measurement), so the basement then
 * follows the ground floor like any other level. Returns { model, report: { errors, shift, flipped, issues } }.
 */
export function setDatum(model, levelId) {
  const r0 = resolveElevations(model);
  if (r0.errors.length) return refuse(model, ...r0.errors);
  const lv = levelOf(r0.model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  if (lv.elevation === 0 && !lv.elevationFrom) return refuse(model, `${lv.name || levelId} already is the datum (elevation 0)`);
  const shift = -lv.elevation, byId = new Map(r0.model.levels.map(l => [l.id, { ...l, elevation: Math.round((l.elevation + shift) * 10) / 10 }]));
  // walk the chain this level followed up to the level that follows nothing, and turn every link round
  const flipped = [];
  let cur = byId.get(levelId), from = cur.elevationFrom;
  delete cur.elevationFrom;
  while (from) {
    const ref = byId.get(from.level), next = ref.elevationFrom;
    ref.elevationFrom = { level: cur.id, relation: INVERSE[from.relation], ...(from.offset ? { offset: -from.offset } : {}) };
    flipped.push({ level: ref.id, follows: cur.id, relation: ref.elevationFrom.relation });
    cur = ref; from = next;
  }
  const self = byId.get(levelId);
  if (self.assumed) { self.assumed = self.assumed.filter(k => k !== 'elevation'); if (!self.assumed.length) delete self.assumed; }
  const r = resolveElevations({ ...r0.model, levels: r0.model.levels.map(l => byId.get(l.id)) });
  if (r.errors.length) return refuse(model, ...r.errors);
  const out = { ...r.model, levels: [...r.model.levels].sort((a, b) => a.elevation - b.elevation) };
  return { model: out, report: { errors: [], shift, flipped, issues: validate(out) } };
}

/** Delete a level that is empty (no rooms, walls, solids, objects, fixtures or stairs); one with measurements is never deleted silently. */
export function deleteLevel(model, levelId) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  const held = ['rooms', 'walls', 'openings', 'solids', 'objects', 'fixtures', 'stairs'].filter(c => (lv[c] || []).length);
  if (held.length) return refuse(model, `${lv.name || levelId} still has ${held.join(', ')}: delete those first (measurements are never removed with a level)`);
  const used = model.levels.filter(l => l.id !== levelId && (l.stairs || []).some(s => s.to === levelId)).map(l => l.id);
  if (used.length) return refuse(model, `stairs on ${used.join(', ')} go up to it`);
  const out = { ...model, levels: model.levels.filter(l => l.id !== levelId), ...(model.anchors ? { anchors: model.anchors.filter(a => !(a.points && levelId in a.points) && a.level !== levelId) } : {}) };
  return { model: out, report: { errors: [], issues: validate(out) } };
}

// ---- openings (PLANTERN.md §6.1) -------------------------------------------------------------

export { OPENING_TYPES, WINDOW_OPENS, OPENING_DEFAULTS, checkOpening } from '../model/openings.js';
const MEASURES = ['offset', 'width', 'sill', 'head'];

/** The first stretch of the wall where an opening of `width` fits, centred in it (null if none). */
/** The longest stretch of `wall` no opening is on, in mm. */
function widestFree(wall, others) {
  const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const taken = others.map(o => [o.offset, o.offset + o.width]).sort((x, y) => x[0] - y[0]);
  let at = 0, best = 0;
  for (const [lo, hi] of taken) { best = Math.max(best, lo - at); at = Math.max(at, hi); }
  return Math.max(best, L - at);
}

function freeSpot(wall, others, width) {
  const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const taken = others.map(o => [o.offset, o.offset + o.width]).sort((x, y) => x[0] - y[0]);
  const gaps = []; let at = 0;
  for (const [lo, hi] of taken) { if (lo > at) gaps.push([at, lo]); at = Math.max(at, hi); }
  if (L > at) gaps.push([at, L]);
  const g = gaps.filter(([lo, hi]) => hi - lo >= width).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  return g ? Math.round((g[0] + g[1] - width) / 2) : null;
}

/**
 * Add a door, window or passage to a wall. spec may give offset, width, sill, head, hinge, swing,
 * opens; what it does not give gets a default (centred in the widest free stretch, OPENING_DEFAULTS)
 * and is listed in `assumed`. A door defaults to hinge "near" and opening into the room on the
 * wall's right (the room a wall made from a room edge bounds). Returns { model, report, opening }.
 */
export function addOpening(model, levelId, wallId, type, spec = {}, options = {}) {
  const lv = levelOf(model, levelId), w = lv?.walls?.find(x => x.id === wallId);
  if (!w) return refuse(model, `no wall "${wallId}" on level "${levelId}"`);
  if (!OPENING_TYPES.includes(type)) return refuse(model, `type must be ${OPENING_TYPES.join(', ')}`);
  if (w.kind === 'virtual') return refuse(model, `${wallId} is a virtual wall (no body to open): make it a wall first`);
  const others = (lv.openings || []).filter(o => o.wall === wallId), top = wallProfile(w, lv).top;
  const d = { ...OPENING_DEFAULTS[type], head: Math.min(OPENING_DEFAULTS[type].head, top) };
  let width = Number(spec.width ?? d.width);
  // a short wall (a door in a small partition): without a measured width the opening fills its widest
  // free stretch instead of being refused; the width stays a guess (assumed) until measured
  if (spec.width === undefined && spec.offset === undefined && freeSpot(w, others, width) === null) {
    const widest = widestFree(w, others);
    if (widest >= 300) width = Math.floor(widest);
  }
  const offset = spec.offset ?? freeSpot(w, others, width);
  if (offset === null) return refuse(model, `no room for a ${width} mm ${type} on ${wallId}`);
  const used = new Set(model.levels.flatMap(l => (l.openings || []).map(o => o.id)));
  let n = 1; while (used.has(`o_${type}_${n}`)) n++;
  const o = { id: `o_${type}_${n}`, ...(spec.name ? { name: String(spec.name).trim() } : {}), wall: wallId, type, offset: Number(offset), width, sill: Number(spec.sill ?? d.sill), head: Number(spec.head ?? d.head) };
  if (type === 'door' && DOOR_OPENS.includes(spec.opens)) { o.opens = spec.opens; o.slide = spec.slide ?? 'near'; o.swing = spec.swing ?? 'right'; }   // sliding or pocket
  else if (type === 'door') { o.hinge = spec.hinge ?? 'near'; o.swing = spec.swing ?? 'right'; }
  if (type === 'window') { o.opens = spec.opens ?? 'fixed'; if (spec.hinge) o.hinge = spec.hinge; if (spec.swing) o.swing = spec.swing; }
  if ((type === 'door' || type === 'window') && spec.leaves === 2) o.leaves = 2;
  if ((type === 'door' || type === 'window') && spec.thickness !== undefined) o.thickness = Number(spec.thickness);
  const assumed = openingAssumed({ ...o, assumed: Array.isArray(spec.assumed) ? spec.assumed : MEASURES.filter(k => spec[k] === undefined) });   // a door or passage on the floor: sill 0 is not a guess; a copy keeps its source's
  if (assumed.length) o.assumed = assumed;
  const err = checkOpening(o, w, lv, others);
  if (err.length) return refuse(model, ...err.map(e => `${o.id}: ${e}`));
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, openings: [...(l.openings || []), o] });
  return { ...finish({ ...model, levels }, levelId, {}, options), opening: o };
}

/** Change an opening (null removes a field). A value set here counts as measured. */
export function setOpening(model, levelId, id, props, options = {}) {
  const lv = levelOf(model, levelId), o = lv?.openings?.find(x => x.id === id);
  if (!o) return refuse(model, `no opening "${id}" on level "${levelId}"`);
  const keys = Object.keys(props || {});
  if (keys.includes('id')) return refuse(model, 'ids never change');
  const next = { ...o };
  for (const k of keys) { if (props[k] === null) delete next[k]; else next[k] = props[k]; }
  // a door or window turned into a passage loses what a passage does not have; set directly, it is refused below
  if (keys.includes('type') && next.type !== 'door' && next.type !== 'window') { for (const k of ['hinge', 'swing', 'leaves', 'thickness']) if (!keys.includes(k)) delete next[k]; }
  const sliding = next.type === 'door' && DOOR_OPENS.includes(next.opens);
  if (next.type !== 'window' && !sliding) delete next.opens;
  if (next.type !== 'door' || !sliding) delete next.slide;
  if (sliding) { next.slide ??= 'near'; next.swing ??= 'right'; delete next.hinge; }               // a sliding door has no hinges
  else if (next.type === 'door') { next.hinge ??= 'near'; next.swing ??= 'right'; }
  if (next.type === 'window' && !WINDOW_OPENS.includes(next.opens)) next.opens = 'fixed';
  const assumed = openingAssumed({ ...next, assumed: keys.includes('assumed') ? props.assumed || [] : (o.assumed || []).filter(k => !keys.includes(k)) });
  if (assumed.length) next.assumed = assumed; else delete next.assumed;
  const w = lv.walls.find(x => x.id === next.wall);
  if (!w) return refuse(model, `${id}: no wall "${next.wall}"`);
  const err = checkOpening(next, w, lv, (lv.openings || []).filter(x => x.wall === next.wall));
  if (err.length) return refuse(model, ...err.map(e => `${id}: ${e}`));
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, openings: l.openings.map(x => x.id === id ? nameFirst(next) : x) });
  return finish({ ...model, levels }, levelId, {}, options);
}

export function deleteOpening(model, levelId, id, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv?.openings?.some(x => x.id === id)) return refuse(model, `no opening "${id}" on level "${levelId}"`);
  const held = (lv.fixtures || []).filter(x => x.kind === 'strip' && x.attach?.opening === id && x.attach.wall === undefined).map(x => x.id);
  if (held.length) return refuse(model, `${id}: ${held.join(', ')} ${held.length > 1 ? 'are' : 'is'} attached to it; delete ${held.length > 1 ? 'them' : 'it'} first`);
  // lamps that stood in it stay on the wall face (they only lose the "stands in" link)
  const freed = (lv.fixtures || []).filter(x => x.attach?.opening === id).map(x => x.id);
  // an object hosted by it (hosted.js) keeps its place on the wall, as a wall object: it is not deleted
  const op = lv.openings.find(x => x.id === id), hostedObjects = (lv.objects || []).filter(o => o.attach?.opening === id).map(o => o.id);
  const levels = model.levels.map(l => l.id !== levelId ? l : {
    ...l, openings: l.openings.filter(x => x.id !== id),
    ...(hostedObjects.length ? { objects: l.objects.map(o => { if (o.attach?.opening !== id) return o; const p = freedPlacement(o, op, lv.ceilingHeight); return { ...o, attach: p.attach, z: p.z }; }) } : {}),
    ...(freed.length ? { fixtures: l.fixtures.map(x => { if (x.attach?.opening !== id) return x; const { opening: _o, ...attach } = x.attach; return { ...x, attach }; }) } : {}),
  });
  return finish({ ...model, levels }, levelId, {}, options, { freed, hostedFreed: hostedObjects });
}

// ---- fixtures (lamps, switches; PLANTERN.md §6.1) ----------------------------------------------

/**
 * Add a lamp, switch or LED strip. spec = { kind, pos?: [x, y] | attach?: { wall, side?, offset, gap?, length? (a strip) }, z?, radius? }.
 * A strip is attached to a wall (`wall`, `offset`, `length`), an object (`object`, `edge` 0-3, `at` bottom | top) or an opening
 * (`opening`, `side`, `at` sill | head), so it follows it; on an object or an opening its height comes from that (no `z`). A wall fixture's side defaults to the room side of the wall (the right of a wall made
 * from a room edge); a ceiling lamp's z defaults to the ceiling. Heights not given are listed in
 * `assumed`. Returns { model, report, fixture }.
 */
export function addFixture(model, levelId, spec = {}, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  const kind = spec.kind;
  if (!FIXTURE_KINDS.includes(kind)) return refuse(model, `kind must be ${FIXTURE_KINDS.join(' or ')}`);
  const used = new Set(model.levels.flatMap(l => (l.fixtures || []).map(f => f.id)));
  let n = 1; while (used.has(`f_${kind}_${n}`)) n++;
  const fx = { id: `f_${kind}_${n}`, ...(spec.name ? { name: String(spec.name).trim() } : {}), kind };
  const form = stripForm({ kind, attach: spec.attach });
  if (form === 'object') fx.attach = { object: spec.attach.object, edge: spec.attach.edge ?? 0, at: spec.attach.at ?? 'bottom', ...(spec.attach.offset ? { offset: spec.attach.offset } : {}), ...(spec.attach.length !== undefined ? { length: spec.attach.length } : {}), ...(spec.attach.inset ? { inset: spec.attach.inset } : {}) };
  else if (form === 'opening') fx.attach = { opening: spec.attach.opening, side: spec.attach.side ?? 'right', at: spec.attach.at ?? 'sill' };
  else if (spec.attach) fx.attach = { side: 'right', ...spec.attach };
  else if (spec.pos) fx.pos = spec.pos.map(Number);
  const derived = form === 'object' || form === 'opening';           // its height is the height of what it follows
  const zDefault = kind === 'strip' ? FIXTURE_DEFAULTS.strip.wallZ : kind === 'switch' ? FIXTURE_DEFAULTS.switch.z : spec.attach ? FIXTURE_DEFAULTS.wallLamp.z : (spec.pos ? roomCeiling(lv, roomAt(lv, spec.pos, pointInPolygon)) : lv.ceilingHeight ?? 2400);
  if (!derived) fx.z = Number(spec.z ?? zDefault);
  if (kind === 'lamp') fx.radius = Number(spec.radius ?? FIXTURE_DEFAULTS.lamp.radius);
  if (kind === 'strip') fx.radius = Number(spec.radius ?? FIXTURE_DEFAULTS.strip.radius);
  if (Array.isArray(spec.assumed)) { if (spec.assumed.length) fx.assumed = [...spec.assumed]; }   // a copy keeps what its source still had as defaults
  else if (!derived && spec.z === undefined && !(kind === 'lamp' && !spec.attach)) fx.assumed = ['z'];
  const { errors } = checkFixture(fx, lv);
  if (errors.length) return refuse(model, ...errors.map(e => `${fx.id}: ${e}`));
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, fixtures: [...(l.fixtures || []), fx] });
  return { ...finish({ ...model, levels }, levelId, {}, options), fixture: fx };
}

// ---- objects (PLANTERN.md §6.1): boxes with a size, on a wall or standing in a room ----

/**
 * Add an object. spec = { name?, size?, z?, color?, attach: { wall, side?, offset?, gap? } | pos: [x, y], rotationDeg? }.
 * Sizes and heights not given take defaults (a wall cabinet 900 × 350 × 700 at 1400, a box on the floor
 * 800 × 800 × 800) and are listed in `assumed` until measured. Returns { model, report, object }.
 */
export function addObject(model, levelId, spec = {}, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  const wall = !!spec.attach, d = wall ? OBJECT_DEFAULTS.wall : OBJECT_DEFAULTS.free;
  const used = new Set(model.levels.flatMap(l => (l.objects || []).map(o => o.id)));
  const made = spec.blueprint ?? spec.asset;        // what it is made of: a blueprint (params, partMaterials) or a model in assets/
  const prefix = made ? `ob_${String(made).replace(/-/g, '_')}` : 'ob_box';
  let n = 1; while (used.has(`${prefix}_${n}`) || allIds(model).has(`${prefix}_${n}`)) n++;
  const o = {
    id: `${prefix}_${n}`, kind: made ? 'asset' : 'box', ...(spec.asset ? { asset: String(spec.asset) } : {}),
    ...(spec.blueprint ? { blueprint: String(spec.blueprint), params: { ...spec.params }, ...(spec.partMaterials && Object.keys(spec.partMaterials).length ? { partMaterials: { ...spec.partMaterials } } : {}) } : {}),
    ...(spec.name ? { name: spec.name } : {}),
  };
  // a hosted object keeps its attachment as given: no offset 0 (that would not centre it on its opening)
  if (wall) o.attach = spec.attach?.opening !== undefined ? { ...spec.attach } : { side: 'right', offset: 0, ...spec.attach };
  else if (spec.pos) { o.pos = spec.pos.map(Number); o.rotationDeg = Number(spec.rotationDeg ?? 0); }
  o.size = (spec.size ?? d.size).map(Number);
  const hosted = spec.attach?.opening !== undefined;   // hosted by an opening: its height is the opening's, nothing is stored (hosted.js)
  if (!hosted) o.z = Number(spec.z ?? d.z);
  if (spec.color) o.color = spec.color;
  const assumed = Array.isArray(spec.assumed) ? spec.assumed : [...(spec.size ? [] : ['size']), ...(spec.z === undefined && wall && !hosted ? ['z'] : [])];
  if (assumed.length) o.assumed = assumed;
  const { errors } = checkObject(o, lv);
  if (errors.length) return refuse(model, ...errors.map(e => `${o.id}: ${e}`));
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, objects: [...(l.objects || []), o] });
  return { ...finish({ ...model, levels }, levelId, {}, options), object: o };
}

/** Change an object (null removes a field; `pos` and `attach` replace each other). A value set here counts as measured. */
export function setObject(model, levelId, id, props, options = {}) {
  const lv = levelOf(model, levelId), ob = lv?.objects?.find(x => x.id === id);
  if (!ob) return refuse(model, `no object "${id}" on level "${levelId}"`);
  const keys = Object.keys(props || {});
  if (keys.includes('id')) return refuse(model, 'ids never change');
  const next = { ...ob };
  for (const k of keys) { if (props[k] === null) delete next[k]; else next[k] = props[k]; }
  if (props.pos) { delete next.attach; next.rotationDeg ??= 0; }
  if (props.attach) { delete next.pos; delete next.rotationDeg; }
  const assumed = keys.includes('assumed') ? props.assumed || [] : (ob.assumed || []).filter(k => !keys.includes(k));   // a copy brings its source's
  if (assumed.length) next.assumed = assumed; else delete next.assumed;
  const { errors } = checkObject(next, lv);
  if (errors.length) return refuse(model, ...errors.map(e => `${id}: ${e}`));
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, objects: l.objects.map(x => x.id === id ? next : x) });
  return finish({ ...model, levels }, levelId, {}, options);
}

export function deleteObject(model, levelId, id, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv?.objects?.some(x => x.id === id)) return refuse(model, `no object "${id}" on level "${levelId}"`);
  const held = (lv.fixtures || []).filter(x => x.kind === 'strip' && x.attach?.object === id).map(x => x.id);
  if (held.length) return refuse(model, `${id}: ${held.join(', ')} ${held.length > 1 ? 'are' : 'is'} attached to it; delete ${held.length > 1 ? 'them' : 'it'} first`);
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, objects: l.objects.filter(x => x.id !== id) });
  return finish({ ...model, levels }, levelId, {}, options);
}

/** Confirm one item as measured (Still to measure): its `assumed` list goes, its values stay. One item per call; a level's own list
 *  is confirmed with the level's id. Nothing else changes, so the values are the ones that were there. */
export function confirmMeasured(model, levelId, id, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv) return refuse(model, `no level "${levelId}"`);
  const strip = x => { const { assumed, ...rest } = x; return rest; };
  let hit = false;
  const levels = model.levels.map(l => {
    if (l.id !== levelId) return l;
    const out = { ...l };
    if (id === l.id && l.assumed?.length) { hit = true; delete out.assumed; }
    for (const k of ["walls", "rooms", "openings", "solids", "objects", "fixtures"]) {
      if ((l[k] || []).some(x => x.id === id && x.assumed)) { hit = true; out[k] = l[k].map(x => (x.id === id ? strip(x) : x)); }
    }
    return out;
  });
  if (!hit) return refuse(model, `${id} has nothing to confirm`);
  return finish({ ...model, levels }, levelId, {}, options);
}

/** Change a fixture (null removes a field; `pos` and `attach` replace each other). A value set here counts as measured. */
export function setFixture(model, levelId, id, props, options = {}) {
  props = { ...(props || {}) };
  const lv = levelOf(model, levelId), fx = lv?.fixtures?.find(x => x.id === id);
  if (!fx) return refuse(model, `no fixture "${id}" on level "${levelId}"`);
  const keys = Object.keys(props || {});
  if (keys.includes('id')) return refuse(model, 'ids never change');
  const next = { ...fx };
  for (const k of keys) { if (props[k] === null) delete next[k]; else next[k] = props[k]; }
  if (props.pos) delete next.attach;
  if (props.attach) delete next.pos;
  let zDefaulted = false;
  if (next.kind === 'strip') {                                    // on an object or an opening its height is theirs; on a wall it is its own
    const derived = stripForm(next) === 'object' || stripForm(next) === 'opening';
    if (derived) delete next.z;
    else if (!Number.isFinite(next.z)) { next.z = FIXTURE_DEFAULTS.strip.wallZ; zDefaulted = true; }
  }
  const assumed = keys.includes('assumed') ? props.assumed || [] : (fx.assumed || []).filter(k => !keys.includes(k));
  if (assumed.length) next.assumed = assumed; else delete next.assumed;
  if (next.kind === 'strip' && next.z === undefined && next.assumed) { const k = next.assumed.filter(a => a !== 'z'); if (k.length) next.assumed = k; else delete next.assumed; }
  if (zDefaulted) next.assumed = [...new Set([...(next.assumed || []), 'z'])];
  const { errors } = checkFixture(next, lv);
  if (errors.length) return refuse(model, ...errors.map(e => `${id}: ${e}`));
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, fixtures: l.fixtures.map(x => x.id === id ? nameFirst(next) : x) });
  return finish({ ...model, levels }, levelId, {}, options);
}

/** Delete a fixture. Its binding in location.json (if any) is then reported by the viewer's validation. */
export function deleteFixture(model, levelId, id, options = {}) {
  const lv = levelOf(model, levelId);
  if (!lv?.fixtures?.some(x => x.id === id)) return refuse(model, `no fixture "${id}" on level "${levelId}"`);
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, fixtures: l.fixtures.filter(x => x.id !== id) });
  return finish({ ...model, levels }, levelId, {}, options);
}

/**
 * A wall's thickness measured at a door or window reveal (the depth of its side, face to face through the wall). It sets
 * the thickness and takes it off the still-to-measure list. A wall with a room on its far face is
 * as thick as the gap between the two rooms: there the measurement is only compared, never forced,
 * and report.reveal says by how much the rooms disagree with it.
 * Returns { model, report } with report.reveal = { wall, measured, was, applied, diff? }.
 */
export function revealThickness(model, levelId, wallId, measured, options = {}) {
  const lv = levelOf(model, levelId), w = lv?.walls?.find(x => x.id === wallId), t = Number(measured);
  if (!w) return refuse(model, `no wall "${wallId}" on level "${levelId}"`);
  if (!(t > 0)) return refuse(model, 'the thickness must be a number of mm');
  if (isShared(w, new Map((lv.rooms || []).map(r => [r.id, r])))) {
    const diff = Math.round((t - (w.thickness ?? 0)) * 10) / 10;
    return { model, report: { errors: [], issues: [], reveal: { wall: wallId, measured: t, was: w.thickness, applied: false, diff } } };
  }
  const r = setWallProps(model, levelId, wallId, { thickness: t }, options);
  return { model: r.model, report: { ...r.report, reveal: { wall: wallId, measured: t, was: w.thickness, applied: !r.report.errors.length } } };
}

// ---- materials (PLANTERN.md §6.2) ------------------------------------------------------------------

/** Material id from a name: "Oak panel" → m_oak_panel, unique in the model. */
export function newMaterialId(model, name) {
  const slug = String(name || 'material').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'material';
  let id = `m_${slug}`, k = 2;
  while (model.materials?.[id]) id = `m_${slug}_${k++}`;
  return id;
}

/** Add or change a material: props = { name?, color?, texture?, uvScale? } (null removes a field). Returns { model, report, id }. */
export function setMaterial(model, id, props) {
  const mid = id || newMaterialId(model, props?.name);
  const m = { ...(model.materials?.[mid] || {}) };
  for (const [k, v] of Object.entries(props || {})) { if (v === null || v === '') delete m[k]; else m[k] = k === 'uvScale' ? Number(v) : v; }
  const next = { ...model, materials: { ...(model.materials || {}), [mid]: m } };
  const errs = checkMaterials(next).filter(i => i.severity === 'error' && i.id === mid);
  if (errs.length) return refuse(model, ...errs.map(e => `${mid}: ${e.msg}`));
  return { model: next, report: { errors: [], issues: validate(next) }, id: mid };
}

/** Delete a material; refused while a wall side uses it. */
export function deleteMaterial(model, id) {
  if (!model.materials?.[id]) return refuse(model, `no material "${id}"`);
  const users = materialUse(model).get(id);
  if (users.length) return refuse(model, `${id} is used by ${users.join(', ')}: give those sides another colour or material first`);
  const { [id]: _, ...rest } = model.materials;
  const next = { ...model, materials: rest };
  return { model: next, report: { errors: [], issues: validate(next) } };
}

/** Name a colour in the palette (an empty name removes it from the palette; walls keep their colours). */
export function nameColor(model, color, name) {
  const c = String(color || '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(c)) return refuse(model, 'colour must look like #rrggbb');
  const rest = (model.palette || []).filter(p => p.color.toLowerCase() !== c), n = String(name ?? '').trim();
  const palette = n ? [...rest, { color: c, name: n }] : rest;
  const next = { ...model, palette };
  if (!palette.length) delete next.palette;
  return { model: next, report: { errors: [], issues: validate(next) } };
}

/**
 * Make a material from a colour: a new material with that colour (named `name`), and, for each
 * wall side in `sides` ([{ level, wall, side }]; by default every side painted exactly that colour),
 * the side switched to the material, so they all follow it from now on.
 * Returns { model, report: { replaced: [{ level, wall, side }] }, id }.
 */
export function materialFromColor(model, color, name, sides) {
  const c = String(color || '').toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(c)) return refuse(model, 'colour must look like #rrggbb');
  const made = setMaterial(model, null, { name: String(name || '').trim() || c, color: c });
  if (made.report.errors.length) return made;
  const want = sides ?? model.levels.flatMap(lv => (lv.walls || []).flatMap(w => ['left', 'right', 'top', 'ends']
    .filter(s => w.sides?.[s]?.color?.toLowerCase() === c && !w.sides[s].material).map(side => ({ level: lv.id, wall: w.id, side }))));
  const replaced = [];
  const levels = made.model.levels.map(lv => ({ ...lv, walls: (lv.walls || []).map(w => {
    const mine = want.filter(x => x.level === lv.id && x.wall === w.id);
    if (!mine.length) return w;
    const sidesNext = { ...(w.sides || {}) };
    for (const { side } of mine) { const { color: _c, ...rest } = sidesNext[side] || {}; sidesNext[side] = { ...rest, material: made.id }; replaced.push({ level: lv.id, wall: w.id, side }); }
    return { ...w, sides: sidesNext };
  }) }));
  // without a list: chimney sides and walls painted per room in that colour switch too
  const perRoom = (x, key, kind) => {
    const hit = Object.entries(x[key] || {}).filter(([, s]) => s?.color?.toLowerCase() === c && !s.material);
    if (!hit.length) return x;
    const next = { ...x[key] };
    for (const [room] of hit) { next[room] = { material: made.id }; replaced.push({ [kind]: x.id, room }); }
    return { ...x, [key]: next };
  };
  const levels1 = sides ? levels : levels.map(lv => ({ ...lv, walls: (lv.walls || []).map(x => perRoom(x, 'roomSides', 'wall')) }));
  const levels2 = sides ? levels1 : levels1.map(lv => ({ ...lv, ...(lv.solids ? { solids: lv.solids.map(so => {
    const hit = Object.entries(so.sides || {}).filter(([, s]) => s?.color?.toLowerCase() === c && !s.material);
    if (!hit.length) return so;
    const next = { ...so.sides };
    for (const [room] of hit) { next[room] = { material: made.id }; replaced.push({ level: lv.id, solid: so.id, room }); }
    return { ...so, sides: next };
  }) } : {}) }));
  const next = { ...made.model, levels: levels2 };
  return { model: next, report: { errors: [], issues: validate(next), replaced }, id: made.id };
}

// ---- ids from names, for things made in the Editor (a new thing gets its id when it is first applied) ----

const NAMED = { object: ['ob_', 'objects'], fixture: ['f_', 'fixtures'], opening: ['o_', 'openings'], wall: ['w_', 'walls'], stairs: ['st_', 'stairs'] };

/** The id a thing of `kind` would get from its name ("Kitchen cabinet" → ob_kitchen_cabinet; _2, _3 when taken), or null without a usable name. */
export function idFromName(model, kind, name) {
  const slug = String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug || !NAMED[kind]) return null;
  const used = allIds(model);
  let id = `${NAMED[kind][0]}${slug}`, k = 2;
  while (used.has(id)) id = `${NAMED[kind][0]}${slug}_${k++}`;
  return id;
}

/**
 * Give a thing the id its name makes (see idFromName), when nothing else refers to its old id (an opening in a
 * wall, a lamp in an opening, a snap point `<id>#…`): a thing that is new has nothing referring to it, so its id
 * can still change; an old one keeps the id it has. Returns { model, report, id, renamed }.
 */
export function renameFromName(model, levelId, kind, id, options = {}) {
  const lv = levelOf(model, levelId), coll = NAMED[kind]?.[1], x = coll && lv?.[coll]?.find(v => v.id === id);
  if (!x) return { ...refuse(model, `no ${kind} "${id}" on level "${levelId}"`), id, renamed: false };
  const next = idFromName(model, kind, x.name);
  if (!next || next === id) return { model, report: { errors: [], issues: [] }, id, renamed: false };
  const text = JSON.stringify(model);
  if (text.split(`"${id}"`).length - 1 > 1 || text.includes(`"${id}#`)) return { model, report: { errors: [], issues: [] }, id, renamed: false };   // referred to elsewhere
  const levels = model.levels.map(l => l.id !== levelId ? l : { ...l, [coll]: l[coll].map(v => v.id === id ? { ...v, id: next } : v) });
  return { ...finish({ ...model, levels }, levelId, {}, options), id: next, renamed: true };
}

// ---- cutting one of two overlapping walls (docs/archive/2026-10-14-overlapping-walls.md, O2) ----

/** The part of the segment a→b (t in [0, 1]) inside a convex polygon, as [t0, t1], or null (Cyrus–Beck). */
function segmentInside(a, b, poly) {
  // orientation: counter-clockwise, so a point is inside when it lies left of every edge
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const pts = area < 0 ? [...poly].reverse() : poly;
  const d = [b[0] - a[0], b[1] - a[1]];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const e = [q[0] - p[0], q[1] - p[1]];
    const num = e[0] * (a[1] - p[1]) - e[1] * (a[0] - p[0]);   // cross(e, a - p)
    const den = e[0] * d[1] - e[1] * d[0];                     // cross(e, d)
    if (den === 0) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t1 - t0 > 1e-9 ? [t0, t1] : null;
}

/** Merges intervals that touch or overlap: [[s0, s1], …] sorted, disjoint. */
function unionIntervals(list) {
  const out = [];
  for (const [s0, s1] of [...list].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && s0 <= last[1] + 1e-9) last[1] = Math.max(last[1], s1); else out.push([s0, s1]);
  }
  return out;
}

/**
 * Cut the wall `cutId` where it runs into the wall `keepId` (both on `levelId`). The cut wall's reference line is trimmed to
 * the face of `keepId` and keeps the side it starts from, so its own thickness stops at that face. Refused, with the reason,
 * when that would lose something silently: a wall bound to its rooms (their edges decide its position), a wall wholly inside
 * `keepId` (delete it instead), a wall that crosses `keepId` (split it there first), an end that hangs on a room corner
 * (change its anchor first), or an opening or an attached object that would fall off the part kept. Openings and attached
 * items move with the start point. Returns { model, report } and report.cut = { kept: 'a' | 'b', removed: mm }.
 */
export function cutWall(model, levelId, cutId, keepId, options = {}) {
  const lv = levelOf(model, levelId);
  const cut = lv?.walls?.find(x => x.id === cutId), keep = lv?.walls?.find(x => x.id === keepId);
  if (!cut) return refuse(model, `no wall "${cutId}" on level "${levelId}"`);
  if (!keep) return refuse(model, `no wall "${keepId}" on level "${levelId}"`);
  if (cutId === keepId) return refuse(model, 'a wall cannot be cut by itself');
  if (cut.from?.length) return refuse(model, `${cutId} is bound to its rooms: the rooms decide where it is. Cut ${keepId} instead, or change the rooms`);
  const L = Math.hypot(cut.b[0] - cut.a[0], cut.b[1] - cut.a[1]);
  if (!(L > 0)) return refuse(model, `${cutId} has no length`);

  const g = buildLevelGeometry(lv);
  const runs = unionIntervals((g.pieces.get(keepId) || []).map(p => segmentInside(cut.a, cut.b, p)).filter(Boolean));
  if (!runs.length) return refuse(model, `${cutId} does not run into ${keepId}`);
  if (runs.length > 1) return refuse(model, `${cutId} runs into ${keepId} in more than one place: split it at each crossing first (Split wall here), then cut the parts`);
  const [s0, s1] = runs[0];
  const eps = 1e-6;
  if (s0 <= eps && s1 >= 1 - eps) return refuse(model, `${cutId} lies wholly inside ${keepId}: delete it instead`);
  if (s0 > eps && s1 < 1 - eps) return refuse(model, `${cutId} crosses ${keepId}: split it where it crosses, then cut the part that runs into it`);

  // the start is inside the other wall: the part from s1 to the end is kept and the a end moves; otherwise 0 .. s0 is kept and the b end moves
  const startInside = s0 <= eps;
  const end = startInside ? 'a' : 'b';
  if (cut.anchor?.[end]) return refuse(model, `${cutId}: its ${end === 'a' ? 'start' : 'end'} hangs on a room corner; change its anchor first`);
  const from = startInside ? s1 : 0, to = startInside ? 1 : s0;                  // the part kept, as t
  const at = t => [Math.round((cut.a[0] + (cut.b[0] - cut.a[0]) * t) * 10) / 10, Math.round((cut.a[1] + (cut.b[1] - cut.a[1]) * t) * 10) / 10];
  const shift = startInside ? from * L : 0;                                     // mm the start moves along the wall
  const keptFrom = from * L, keptTo = to * L;

  // what sits on the wall must stay on the part kept
  const onWall = [...(lv.openings || []).filter(o => o.wall === cutId).map(o => ({ id: o.id, from: o.offset, to: o.offset + o.width })),
    ...[...(lv.objects || []), ...(lv.fixtures || [])].filter(x => x.attach?.wall === cutId).map(x => ({ id: x.id, from: x.attach.offset ?? 0, to: (x.attach.offset ?? 0) + (x.kind === 'box' || x.kind === 'asset' ? (x.size?.[0] ?? 0) : 0) }))];
  const lost = onWall.filter(x => x.from < keptFrom - 1 || x.to > keptTo + 1).map(x => x.id);
  if (lost.length) return refuse(model, `${cutId}: ${lost.join(', ')} would fall off the part kept; move ${lost.length > 1 ? 'them' : 'it'} first`);

  const newWall = { ...cut, [end]: at(startInside ? from : to) };
  const shiftAt = o => (startInside ? { ...o, offset: Math.round((o.offset - shift) * 10) / 10 } : o);
  const levels = model.levels.map(l => {
    if (l.id !== levelId) return l;
    return {
      ...l,
      walls: l.walls.map(x => (x.id === cutId ? nameFirst(newWall) : x)),
      ...(startInside ? {
        openings: (l.openings || []).map(o => (o.wall === cutId ? shiftAt(o) : o)),
        objects: (l.objects || []).map(o => (o.attach?.wall === cutId ? { ...o, attach: { ...o.attach, offset: Math.round((o.attach.offset - shift) * 10) / 10 } } : o)),
        fixtures: (l.fixtures || []).map(o => (o.attach?.wall === cutId ? { ...o, attach: { ...o.attach, offset: Math.round((o.attach.offset - shift) * 10) / 10 } } : o)),
      } : {}),
    };
  });
  const removed = Math.round((L - (keptTo - keptFrom)) * 10) / 10;
  const r = finish({ ...model, levels }, levelId, { walls: [cutId] }, options);
  return { ...r, report: { ...r.report, cut: { kept: startInside ? 'b' : 'a', removed } } };
}
