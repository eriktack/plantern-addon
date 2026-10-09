// Copy from another one (PLANTERN.md §7, decision 109): a new room or solid with the shape of one
// already measured, an object, opening, lamp or stairs with another's sizes, and Duplicate. Pure: the
// drafts go through the room form (nothing is stored until Apply); duplicates go through the edit
// operations, so reconcile() and validation run as for anything else.

import { captureFromPolygon } from '../capture/edit.js';
import { adjacentLevels } from '../tools/snap.js';
import { polygonsOverlap } from '../geometry/polygon.js';
import { addObject, addOpening, addFixture, addWall, setWallProps } from './ops.js';

const clone = v => JSON.parse(JSON.stringify(v));

/** A name not used yet: "Kitchen" → "Kitchen 2", "Kitchen 2" → "Kitchen 3". taken = names in use. */
export function copyName(name, taken = []) {
  const used = new Set([...taken].filter(Boolean).map(n => String(n).trim().toLowerCase()));
  const m = /^(.*?)\s+(\d+)$/.exec(String(name || '').trim()), base = m ? m[1] : String(name || '').trim();
  if (!base) return '';
  let k = m ? Number(m[2]) + 1 : 2;
  while (used.has(`${base} ${k}`.toLowerCase())) k++;
  return `${base} ${k}`;
}

/** Where an entity of a collection is: { level, item } or null (ids are unique per file). */
export function findIn(model, coll, id) {
  for (const level of model.levels || []) { const item = (level[coll] || []).find(x => x.id === id); if (item) return { level, item }; }
  return null;
}

/**
 * What can be copied for a new `coll` thing on `levelId`, grouped: this level first, then the level
 * below and above, then the others. [{ level, relation: 'here' | 'below' | 'above' | 'other', items }].
 */
export function copySources(model, coll, levelId, keep = () => true) {
  const here = model.levels.find(l => l.id === levelId);
  if (!here) return [];
  const near = adjacentLevels(model, here), rel = l => (l.id === levelId ? 'here' : near.includes(l) ? (l.elevation < here.elevation ? 'below' : 'above') : 'other');
  const order = { here: 0, below: 1, above: 2, other: 3 };
  return model.levels.map(l => ({ level: l, relation: rel(l), items: (l[coll] || []).filter(keep) }))
    .filter(g => g.items.length)
    .sort((a, b) => order[a.relation] - order[b.relation] || b.level.elevation - a.level.elevation);
}

// The measurements that describe a shape (raw minus where it is, and minus checks of the source's own walls)
const SHAPE = ['lengths', 'turns', 'corners', 'diagonals', 'closure', 'locks', 'exact', 'derived', 'heading'];

/**
 * A new room (coll 'rooms') or solid (coll 'solids') on `targetLevelId` with the shape of `srcId`:
 * { kind: 'room' | 'solid', name, …its options, capture, placed: 'stacked' | 'beside' | 'absolute' }.
 * - From the level just below or above: hung on the source's corner 0 with no offset, so it sits exactly
 *   on top (or under) and follows it when that is re-measured (followLevels).
 * - From the same level: hung on the source's corner 0 but moved 500 mm clear of it, east, west, north or
 *   south: the first side where it overlaps no room (else east), until a start point is picked.
 * - From a level further away (its corners are no start points here): at the same plan position.
 * A source without measurements gets them from its outline (captureFromPolygon). Returns { error } when
 * there is no such source.
 */
export function shapeDraftFrom(model, coll, srcId, targetLevelId) {
  const found = findIn(model, coll, srcId), target = model.levels.find(l => l.id === targetLevelId);
  if (!found || !target) return { error: `nothing to copy: no ${coll === 'solids' ? 'solid' : 'room'} "${srcId}"` };
  const { level: from, item: src } = found;
  if (!(src.polygon?.length >= 3)) return { error: `${srcId} has no outline yet` };
  const cap = src.capture?.raw ? src.capture : captureFromPolygon(src.polygon);
  const raw = {};
  for (const k of SHAPE) if (cap.raw[k] !== undefined) raw[k] = clone(cap.raw[k]);
  const c0 = src.polygon[0], xs = src.polygon.map(p => p[0]);
  const near = adjacentLevels(model, target).some(l => l.id === from.id);
  let placed;
  if (from.id === targetLevelId) {
    placed = 'beside';
    const ys = src.polygon.map(p => p[1]), W = Math.round(Math.max(...xs) - Math.min(...xs) + 500), H = Math.round(Math.max(...ys) - Math.min(...ys) + 500);
    const free = ([dx, dy]) => !(target.rooms || []).some(r => r.polygon?.length >= 3 && polygonsOverlap(src.polygon.map(p => [p[0] + dx, p[1] + dy]), r.polygon));
    const off = [[W, 0], [-W, 0], [0, H], [0, -H]].find(free) || [W, 0];
    raw.origin = { ref: `${src.id}#p0`, offset: off };
    raw.start = [c0[0] + off[0], c0[1] + off[1]];
  } else if (near) {
    placed = 'stacked';
    raw.origin = { ref: `${src.id}#p0`, offset: [0, 0] };
    raw.start = [c0[0], c0[1]];
  } else {
    placed = 'absolute';
    raw.start = [c0[0], c0[1]];
  }
  if (cap.mode === 'circle') {
    // a round pillar: its diameter, and its middle where corner 0's place puts it (no start point: the round form types it)
    const c = cap.raw.start;
    raw.diameter = cap.raw.diameter;
    raw.start = [raw.start[0] + c[0] - c0[0], raw.start[1] + c[1] - c0[1]];
    delete raw.origin;
  }
  const capture = { mode: cap.mode, raw };
  const names = coll === 'rooms' ? (target.rooms || []).map(r => r.name) : (target.solids || []).map(s => s.name);
  // stacked on another level the same name reads right ("Hall" over "Hall"); beside it, a number tells them apart
  const name = src.name ? (from.id === targetLevelId ? copyName(src.name, names) : src.name) : '';
  if (coll === 'solids') {
    return { kind: 'solid', name, solidKind: src.kind || 'chimney', color: src.color, base: src.base ?? null, height: src.height ?? null, cutsWalls: !!src.cutsWalls, capture, placed, from: from.id };
  }
  return { kind: 'room', name, exterior: !!src.exterior, floor: src.floor, floorOffset: src.floorOffset, ceilingHeight: src.ceilingHeight, capture, placed, from: from.id };
}

/** An object's sizes and look (not where it is). */
export const objectSpecFrom = o => ({
  size: [...o.size], z: o.z, ...(o.color ? { color: o.color } : {}), assumed: [...(o.assumed || [])],
});

/** An opening's kind and sizes (not the wall or the position along it). */
export function openingSpecFrom(o) {
  const out = { type: o.type, width: o.width, sill: o.sill, head: o.head, assumed: [...(o.assumed || [])] };
  for (const k of ['hinge', 'swing', 'opens', 'slide', 'leaves', 'thickness']) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/** A lamp's or switch's height and reach (not where it is). */
export function fixtureSpecFrom(x) {
  const out = { kind: x.kind, z: x.z, assumed: [...(x.assumed || [])] };
  if (x.radius !== undefined) out.radius = x.radius;
  return out;
}

/** Stairs' shape (not where they start, nor where they go): the flights, landing, underside. A hand-given opening is dropped. */
export function stairsSpecFrom(st) {
  const out = { heading: st.heading, width: st.width, flights: clone(st.flights) };
  for (const k of ['turn', 'landing', 'winders', 'underside', 'sides', 'waist']) if (st[k] !== undefined) out[k] = st[k];
  return out;
}

/** Stairs `st` with the shape of `src`, keeping its own id, name, start and destination. */
export function stairsWithShapeOf(st, src) {
  const next = { ...st };
  for (const k of ['turn', 'landing', 'winders', 'underside', 'sides', 'waist', 'opening']) delete next[k];
  return { ...next, ...stairsSpecFrom(src) };
}

const named = (item, list) => (item.name ? { name: copyName(item.name, list.map(x => x.name)) } : {});

/**
 * Duplicate an object, opening, fixture or hand-drawn wall next to the original (decision 109):
 * an object on a wall right after it on the same wall (else before it), a free one beside it to the
 * east; an opening in the widest free stretch of the same wall; a lamp or switch a bit along the wall
 * (or 500 mm east); a hand-drawn wall moved out by its thickness, free of the corners the original
 * hangs on. Returns { model, report, id } like the operation it goes through, or { report: { errors } }.
 */
export function duplicate(model, levelId, kind, id, options = {}) {
  const lv = model.levels.find(l => l.id === levelId), no = msg => ({ model, report: { errors: [msg] } });
  if (!lv) return no(`no level "${levelId}"`);
  if (kind === 'object') {
    const o = (lv.objects || []).find(x => x.id === id);
    if (!o) return no(`no object "${id}"`);
    const spec = { ...objectSpecFrom(o), ...named(o, lv.objects) };
    if (o.attach) {
      const gap = 100;
      for (const offset of [o.attach.offset + o.size[0] + gap, o.attach.offset - o.size[0] - gap]) {
        if (offset < 0) continue;
        const r = addObject(model, levelId, { ...spec, attach: { ...o.attach, offset } }, options);
        if (!r.report.errors.length) return { ...r, id: r.object.id };
      }
      return no(`no room on the wall beside ${id} for another one`);
    }
    const a = (o.rotationDeg || 0) * Math.PI / 180, step = o.size[0] + 200;
    const r = addObject(model, levelId, { ...spec, pos: [Math.round(o.pos[0] + Math.cos(a) * step), Math.round(o.pos[1] + Math.sin(a) * step)], rotationDeg: o.rotationDeg ?? 0 }, options);
    return r.report.errors.length ? r : { ...r, id: r.object.id };
  }
  if (kind === 'opening') {
    const o = (lv.openings || []).find(x => x.id === id);
    if (!o) return no(`no opening "${id}"`);
    const { type, ...spec } = openingSpecFrom(o);
    const r = addOpening(model, levelId, o.wall, type, { ...spec, ...named(o, lv.openings) }, options);
    return r.report.errors.length ? r : { ...r, id: r.opening.id };
  }
  if (kind === 'fixture') {
    const x = (lv.fixtures || []).find(f => f.id === id);
    if (!x) return no(`no fixture "${id}"`);
    const spec = { ...fixtureSpecFrom(x), ...named(x, lv.fixtures) };
    let r;
    if (x.attach) {
      for (const offset of [x.attach.offset + 300, x.attach.offset - 300]) {
        if (offset < 0) continue;
        r = addFixture(model, levelId, { ...spec, attach: { ...x.attach, offset } }, options);
        if (!r.report.errors.length) break;
      }
    } else r = addFixture(model, levelId, { ...spec, pos: [x.pos[0] + 500, x.pos[1]] }, options);
    return !r || r.report.errors.length ? (r || no(`no room beside ${id}`)) : { ...r, id: r.fixture.id };
  }
  if (kind === 'wall') {
    const w = (lv.walls || []).find(v => v.id === id);
    if (!w) return no(`no wall "${id}"`);
    if (w.from?.length) return no(`${id} follows its rooms: a copy of it would stand in the same place. Draw a new one with + Wall`);
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, n = [-(w.b[1] - w.a[1]) / L, (w.b[0] - w.a[0]) / L];
    const d = Math.max(w.thickness || 0, 50) * (w.justify === 'right' ? -1 : 1);   // out to the side its thickness goes
    const move = p => [Math.round((p[0] + n[0] * d) * 10) / 10, Math.round((p[1] + n[1] * d) * 10) / 10];
    const spec = { a: move(w.a), b: move(w.b), thickness: w.thickness, justify: w.justify, kind: w.kind, base: w.base, height: w.height, sides: w.sides ? clone(w.sides) : undefined };
    let r = addWall(model, levelId, spec, options);
    if (r.report.errors.length) return r;
    const extra = {};
    for (const k of ['bottom', 'top', 'lightBlocking', 'style', 'roomSides']) if (w[k] !== undefined) extra[k] = clone(w[k]);
    if (w.name) extra.name = copyName(w.name, lv.walls.map(v => v.name));
    if (w.assumed?.length) extra.assumed = [...w.assumed];
    if (Object.keys(extra).length) {
      const r2 = setWallProps(r.model, levelId, r.wall.id, extra, options);
      if (!r2.report.errors.length) r = { ...r2, wall: r.wall };
    }
    return { ...r, id: r.wall.id };
  }
  return no(`${kind} cannot be duplicated`);
}
