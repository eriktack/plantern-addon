// reconcile(): bring walls and dependent rooms up to date after rooms changed (PLANTERN.md §4, §7
// Editing). Pure: model in, { model, report } out; nothing is written anywhere.
//
// Rooms own the geometry. A wall made from room edges carries `from` (edge refs) and follows them;
// its properties (kind, thickness of a one-room wall, height, sides, openings, …) are its own. Walls
// without `from` are hand-drawn and never moved.
//
// Steps, repeated until nothing else moves:
//  1. Match each changed room's old outline to its new one by geometry (match.js) and rewrite the
//     refs that point into it: walls' `from`, rooms' `capture.raw.origin.ref`, the model's checks.
//  2. Work out the walls the rooms ask for (generateWalls(), shared walls paired within 2°) and match
//     every bound wall to one of them: same edges first, then the same first edge, then any common
//     edge, nearest along the edge. A matched wall takes its position (and, when shared, the face
//     distance as its thickness); openings and attached things keep their place (see moveAlong()).
//  3. Re-solve rooms whose corner 0 hangs on something that moved, in dependency order. Rooms on a
//     dependency cycle are left alone and reported.
// Then:
//     Walls split by hand (`cut`) cut the wall the rooms ask for at the same distances from the room
//     corner, and each part matches its own piece.
//     Outer pieces on one line become one facade wall (facade.js); a stored piece that merges away
//     hands its openings and attached things to the facade, at the same place.
//  4. Fill room edges nothing covers with the walls the rooms ask for (shared where two rooms face
//     each other, facades merged; one-room walls get settings.wallThickness.outer and
//     `assumed: ["thickness"]`); stretches partly covered by hand-drawn walls are filled per edge.
//     Room edges along a face of a solid beyond them (a chimney) need no wall there: a bound wall
//     whose whole length now lies along solids is removed (listed under `bySolid`, and confirmed),
//     unless something is on it.
//  5. A bound wall that matches nothing is never deleted silently: if its edges are now covered by
//     another wall and nothing is on it, it is removed and listed as merged; otherwise it stays where
//     it was and the validator reports it as an orphan (an error).
//  6. Every move is listed; moves up to 5 mm are `silent`, larger ones go in `preview` for the page
//     to confirm.
//
// change = { rooms: { <roomId>: <polygon before the change> | null (new room) }, walls: [ids whose
//            properties changed (their face corners may have moved)], solids: [ids added, moved or removed] }
// Removed rooms need no entry: refs to rooms that no longer exist are dropped.

import { matchOutline, rigidMotion } from './match.js';
import { pointInPolygon } from '../geometry/polygon.js';
import { generateWalls } from '../capture/walls.js';
import { generateMissingWalls } from '../capture/edit.js';
import { mergeFacades } from './facade.js';
import { boundEdges, edgeOfRef } from '../geometry/bound.js';
import { edgeGaps } from '../model/validate.js';
import { solidCoverDetail } from '../geometry/solids.js';
import { wallFaceRooms } from '../geometry/paint.js';
import { solveCapture } from '../capture/solve.js';
import { circleFrom } from '../geometry/circle.js';
import { checkDiagonals } from '../model/checks.js';
import { resolveStart } from '../capture/start.js';
import { buildLevelGeometry } from '../geometry/level.js';
import { collectSnapPoints } from '../tools/snap.js';
import { DEFAULT_SETTINGS } from '../model/settings.js';

export const SILENT_MOVE = 5;     // mm
export const PAIR_ANGLE = 2;      // degrees: shared-wall pairing tolerance (a closing wall may tilt a little)

const EDGE_REF = /^(.+)#e(\d+)$/, CORNER_REF = /^(.+)#p(\d+)$/;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r1 = v => Math.round(v * 10) / 10;
const samePoly = (a, b) => !!a && !!b && a.length === b.length && a.every((p, i) => d2(p, b[i]) < 1e-6);
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

function edgeOf(poly, i) {
  if (!poly || !(i < poly.length)) return null;
  const p = poly[i], q = poly[(i + 1) % poly.length], L = d2(p, q) || 1;
  return { p, q, L, u: [(q[0] - p[0]) / L, (q[1] - p[1]) / L] };
}
/** Fraction (0 at the edge's start, 1 at its end) of the point's projection on edge `ref` of the given outlines. */
function fracOn(polys, ref, pt) {
  const m = EDGE_REF.exec(ref), e = m && edgeOf(polys.get(m[1]), +m[2]);
  return e ? ((pt[0] - e.p[0]) * e.u[0] + (pt[1] - e.p[1]) * e.u[1]) / e.L : 0.5;
}
const mid = w => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
const unit = w => { const L = d2(w.a, w.b) || 1; return [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/**
 * Where something placed along a wall goes when the wall moves. `offset` is measured from `a`,
 * `size` is its extent along the wall. It follows the wall end that moved less along the wall, so
 * an opening keeps its real place when the other end is re-measured, and travels with the wall when
 * the whole wall moves. When the wall now runs the other way, offset and side are mirrored.
 * Returns { offset, flipped }.
 */
export function moveAlong(oldW, newW, offset, size = 0) {
  const L0 = d2(oldW.a, oldW.b), L1 = d2(newW.a, newW.b) || 1, u = [(newW.b[0] - newW.a[0]) / L1, (newW.b[1] - newW.a[1]) / L1];
  const flipped = (oldW.b[0] - oldW.a[0]) * u[0] + (oldW.b[1] - oldW.a[1]) * u[1] < 0;
  const [a0, b0, off] = flipped ? [oldW.b, oldW.a, L0 - offset - size] : [oldW.a, oldW.b, offset];
  const da = (newW.a[0] - a0[0]) * u[0] + (newW.a[1] - a0[1]) * u[1];
  const db = (newW.b[0] - b0[0]) * u[0] + (newW.b[1] - b0[1]) * u[1];
  return { offset: r1(Math.abs(da) <= Math.abs(db) ? off : off + (L1 - L0)), flipped };
}
const flipSide = s => (s === 'left' ? 'right' : s === 'right' ? 'left' : s);

/** The rooms a ref hangs on (corner 0 placed at a point of a room, wall or opening). */
function ownersOf(ref, level) {
  const id = String(ref || '').split('#')[0];
  if (!id) return [];
  const wall = id => (level.walls || []).find(w => w.id === id);
  const roomsOfWall = w => w ? [...new Set([...(w.from || []).map(f => f.split('#')[0]), ...(w.rooms || [])])] : [];
  if ((level.rooms || []).some(r => r.id === id)) return [id];
  const w = wall(id);
  if (w) return roomsOfWall(w);
  const o = (level.openings || []).find(o => o.id === id);
  return o ? roomsOfWall(wall(o.wall)) : [];
}

/** Rooms that (through origin refs) depend on themselves. */
function cyclicRooms(level) {
  const deps = new Map((level.rooms || []).map(r => [r.id, ownersOf(r.capture?.raw?.origin?.ref, level)]));
  const out = new Set();
  for (const start of deps.keys()) {
    const seen = new Set(), stack = [...(deps.get(start) || [])];
    while (stack.length) {
      const x = stack.pop();
      if (x === start) { out.add(start); break; }
      if (seen.has(x)) continue;
      seen.add(x); stack.push(...(deps.get(x) || []));
    }
  }
  return out;
}

export function reconcile(model, levelId, change = {}, options = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(options.settings || {}) };
  const outer = settings.wallThickness?.outer ?? 300;
  const report = { renamed: [], brokenRefs: [], resolved: [], moved: [], thickness: [], tilted: [], added: [], merged: [], bySolid: [], carried: [], paintMoved: [], rehomed: [], orphans: [], flagged: [], cycles: [], warnings: [], silent: [], preview: [] };
  const li = model.levels.findIndex(l => l.id === levelId);
  if (li < 0) return { model, report: { ...report, warnings: [`no level "${levelId}"`] } };
  // where every point was before the change (a wall end can jump when walls merge into a facade)
  const snapsBefore = new Map(collectSnapPoints(model, model.levels[li], buildLevelGeometry(model.levels[li])).map(s => [s.ref, s.pos]));

  let level = model.levels[li], checks = model.checks;
  const before = { walls: new Map((level.walls || []).map(w => [w.id, w])), rooms: new Map((level.rooms || []).map(r => [r.id, r.polygon])) };
  const edited = new Set(Object.keys(change.rooms || {}));
  // the outlines the walls and refs currently follow
  const basis = new Map(before.rooms);
  for (const [id, old] of Object.entries(change.rooms || {})) { if (old) basis.set(id, old); else basis.delete(id); }
  const cyclic = cyclicRooms(level);
  for (const id of cyclic) report.cycles.push(id);
  const orphanFrom = new Map();      // wall id → its original `from`, kept when it cannot be placed
  let touched = new Set([...(change.walls || []), ...(change.solids || [])]);
  let lastIdeal = [], lastUsed = new Set(), roomsById = new Map();
  const shared = g => boundEdges(g, roomsById).facing.length > 0;
  let solidMoved = false;

  for (let round = 0; ; round++) {
    const rooms = level.rooms || [];
    const current = new Map(rooms.map(r => [r.id, r.polygon]));
    const changed = [...new Set([...current.keys(), ...basis.keys()])].filter(id => !samePoly(basis.get(id), current.get(id)));
    if (round > 0 && !changed.length && !solidMoved) break;
    solidMoved = false;
    if (round > rooms.length + 1) { report.warnings.push('rooms kept moving each other; stopped'); break; }

    // 1. rename refs into changed rooms; remember where each bound wall sat along its first edge
    const frac = new Map((level.walls || []).filter(w => w.from?.length).map(w => [w.id, fracOn(basis, w.from[0], mid(w))]));
    const span = new Map((level.walls || []).filter(w => w.from?.length).map(w => [w.id, [fracOn(basis, w.from[0], w.a), fracOn(basis, w.from[0], w.b)].sort((x, y) => x - y)]));
    const maps = new Map();
    for (const id of changed) if (basis.get(id) && current.get(id)) maps.set(id, matchOutline(basis.get(id), current.get(id)));
    const renameEdge = ref => {
      const m = EDGE_REF.exec(ref);
      if (!m || !current.has(m[1])) return null;                     // room gone
      if (!maps.has(m[1])) return ref;
      const j = maps.get(m[1]).edges.get(+m[2]);
      return j === undefined ? null : `${m[1]}#e${j}`;
    };
    // a corner that is gone returns null: its number may now name another corner, so it is never reused
    const renameCorner = (ref, where) => {
      const m = CORNER_REF.exec(ref || '');
      if (!m || !maps.has(m[1])) return ref;
      const j = maps.get(m[1]).corners.get(+m[2]);
      if (j === undefined) return null;
      const to = `${m[1]}#p${j}`;
      if (to !== ref) report.renamed.push({ ref, to, where });
      return to;
    };
    const liveFrom = new Map();
    for (const w of level.walls || []) {
      if (!w.from?.length || orphanFrom.has(w.id)) continue;         // an orphan's old refs may name other edges now
      const lf = w.from.map(renameEdge);
      w.from.forEach((ref, k) => { if (lf[k] && lf[k] !== ref) report.renamed.push({ ref, to: lf[k], where: w.id }); });
      liveFrom.set(w.id, lf.filter(Boolean));
    }
    level = { ...level, rooms: rooms.map(r => {
      const ref = r.capture?.raw?.origin?.ref, to = ref && renameCorner(ref, r.id);
      if (to === null) {
        // its start corner is gone: the room stays where it is and no longer hangs on that room
        report.brokenRefs.push({ ref, where: r.id, msg: 'start corner no longer exists; the room keeps its place and its start is now a plain position' });
        const { origin, ...raw } = r.capture.raw;
        return { ...r, capture: { ...r.capture, raw } };
      }
      return to && to !== ref ? { ...r, capture: { ...r.capture, raw: { ...r.capture.raw, origin: { ...r.capture.raw.origin, ref: to } } } } : r;
    }) };
    // round pillars measured from room walls: the walls' numbers follow the room (renumbered when re-measured)
    if ((level.solids || []).some(x => Array.isArray(x.capture?.raw?.from))) level = { ...level, solids: level.solids.map(x => {
      const from = x.capture?.raw?.from;
      if (!Array.isArray(from)) return x;
      const to = from.map(f => renameEdge(f.ref));
      if (to.some(t => t === null)) {
        // a wall it was measured from is gone: it stays where it is, its middle now a plain position
        report.brokenRefs.push({ ref: from.find((f, k) => to[k] === null).ref, where: x.id, msg: 'a wall it was measured from no longer exists; it keeps its place' });
        const { from: _gone, ...raw } = x.capture.raw;
        return { ...x, capture: { ...x.capture, raw } };
      }
      if (to.every((t, k) => t === from[k].ref)) return x;
      to.forEach((t, k) => { if (t !== from[k].ref) report.renamed.push({ ref: from[k].ref, to: t, where: x.id }); });
      return { ...x, capture: { ...x.capture, raw: { ...x.capture.raw, from: from.map((f, k) => ({ ...f, ref: to[k] })) } } };
    }) };
    // the ends of hand-drawn walls hang on points too (walls[].anchor)
    if ((level.walls || []).some(w => w.anchor)) level = { ...level, walls: level.walls.map(w => {
      if (!w.anchor) return w;
      let changed = false;
      const anchor = Object.fromEntries(Object.entries(w.anchor).map(([end, an]) => {
        const to = an?.ref && renameCorner(an.ref, w.id);
        if (to === null) { report.brokenRefs.push({ ref: an.ref, where: w.id, msg: `the point its ${end === 'a' ? 'start' : 'end'} hangs on no longer exists; it stays where it is` }); changed = true; return [end, null]; }
        if (to && to !== an.ref) { changed = true; return [end, { ...an, ref: to }]; }
        return [end, an];
      }).filter(([, an]) => an));
      return changed ? { ...w, anchor: Object.keys(anchor).length ? anchor : undefined } : w;
    }).map(w => (w.anchor === undefined && 'anchor' in w ? (({ anchor, ...rest }) => rest)(w) : w)) };
    if (checks?.length) checks = checks.map(c => {
      const a = renameCorner(c.a, c.id), b = renameCorner(c.b, c.id);
      for (const [old, to] of [[c.a, a], [c.b, b]]) if (to === null) report.brokenRefs.push({ ref: old, where: c.id, msg: 'check point no longer exists' });
      return (a && a !== c.a) || (b && b !== c.b) ? { ...c, a: a || c.a, b: b || c.b } : c;
    });

    // 2. place bound walls on the walls the rooms ask for
    const moved = updateWalls();
    function updateWalls() {
      const valid = level.rooms.filter(r => r.polygon?.length >= 3);
      roomsById = new Map(valid.map(r => [r.id, r]));
      const gen = generateWalls(valid, { angleTol: PAIR_ANGLE, defaultThickness: outer, solids: level.solids });
      const fac = mergeFacades(gen.walls, roomsById), ideal = cutIdeal(fac.walls, level.walls, liveFrom, roomsById);
      for (const m of fac.merged) if (m.offset > 1) report.warnings.push(`the faces along one facade (${m.pieces.join(', ')}) are up to ${m.offset} mm out of line; the facade follows the first`);
      const tiltOf = g => Math.max(0, ...gen.shared.filter(s => s.edges.every(e => g.from.includes(e))).map(s => s.tilt));
      const cand = [];
      for (const w of level.walls || []) {
        const lf = liveFrom.get(w.id);
        if (!lf?.length) continue;
        ideal.forEach((g, gi) => {
          // same edges, then the same first edge, then its first edge somewhere in it, then any common edge
          const tier = sameSet(lf, g.from) ? 0 : lf[0] === g.from[0] ? 1 : g.from.includes(lf[0]) ? 2 : lf.includes(g.from[0]) ? 3 : lf.some(x => g.from.includes(x)) ? 4 : -1;
          if (tier < 0) return;
          const on = lf.find(x => g.from.includes(x));
          // how much of where the wall was this piece covers (along its first edge, as a fraction of the edge),
          // so a wall that gets split keeps the larger part; the tier only breaks near-ties
          const [a0, a1] = span.get(w.id) ?? [0, 1], [b0, b1] = [fracOn(current, on, g.a), fracOn(current, on, g.b)].sort((x, y) => x - y);
          const covered = a1 - a0 > 1e-9 ? Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / (a1 - a0) : 0;
          cand.push({ w, gi, cost: tier * 0.3 + (1 - covered) * 2 + Math.abs((frac.get(w.id) ?? 0.5) - fracOn(current, on, mid(g))) });
        });
      }
      cand.sort((x, y) => x.cost - y.cost);
      const placed = new Map(), usedG = new Set();
      for (const c of cand) if (!placed.has(c.w.id) && !usedG.has(c.gi)) { placed.set(c.w.id, ideal[c.gi]); usedG.add(c.gi); }
      lastIdeal = ideal; lastUsed = usedG;

      const movedNow = new Set(), next = [], held = heldWalls(level), mergedAway = [];
      const openings = [...(level.openings || [])], things = { objects: [...(level.objects || [])], fixtures: [...(level.fixtures || [])] };
      for (const w of level.walls || []) {
        if (!w.from?.length || orphanFrom.has(w.id)) { next.push(w); continue; }
        const g = placed.get(w.id);
        if (!g) {
          // a solid now stands along its whole length (a chimney put in where a wall was guessed)
          const cover = solidCoverDetail(w.a, w.b, level.solids), L = d2(w.a, w.b);
          if (!held.has(w.id) && cover.iv.length === 1 && cover.iv[0][0] < 1 && cover.iv[0][1] > L - 1) {
            report.bySolid.push({ id: w.id, solids: [...new Set(cover.by.map(x => x[2]))] });
            continue;
          }
          // nothing for it: merged into a neighbour's wall (removed if nothing is on it), or an orphan
          const lf = liveFrom.get(w.id) || [];
          const coveredElsewhere = lf.length && lf.every(ref => [...placed.values()].some(p => p.from.includes(ref)));
          const into = coveredElsewhere && [...placed.entries()].find(([, p]) => p.from.includes(lf[0]))?.[0];
          if (into) { mergedAway.push({ w, into }); continue; }
          if (!orphanFrom.has(w.id)) orphanFrom.set(w.id, w.from);
          report.orphans.push({ id: w.id, reason: 'its room edges are gone' });
          next.push(w);
          continue;
        }
        const nw = { ...w, a: g.a, b: g.b, from: g.from, rooms: g.rooms };
        if (shared(g) && w.kind !== 'virtual') {
          nw.justify = 'left';
          if (Math.abs((w.thickness ?? 0) - g.thickness) > 0.05) report.thickness.push({ id: w.id, from: w.thickness, to: g.thickness, wasAssumed: !!w.assumed?.includes('thickness') });
          nw.thickness = g.thickness;
          const t = tiltOf(g);
          if (t > 1) report.tilted.push({ id: w.id, tilt: t });
          const assumed = (w.assumed || []).filter(x => x !== 'thickness');
          if (assumed.length) nw.assumed = assumed; else delete nw.assumed;
        }
        if (d2(w.a, nw.a) > 1e-6 || d2(w.b, nw.b) > 1e-6 || nw.thickness !== w.thickness) {
          movedNow.add(w.id);
          // openings and attached things keep their place along the wall
          openings.forEach((o, i) => {
            if (o.wall !== w.id) return;
            const m = moveAlong(w, nw, o.offset, o.width);
            const no = { ...o, offset: m.offset };
            if (m.flipped) { if (o.swing) no.swing = flipSide(o.swing); if (o.hinge) no.hinge = o.hinge === 'near' ? 'far' : 'near'; }
            if (no.offset < 0 || no.offset + o.width > d2(nw.a, nw.b) + 1) report.flagged.push({ id: o.id, wall: w.id, msg: 'no longer fits on its wall' });
            openings[i] = no;
          });
          for (const key of ['objects', 'fixtures']) things[key].forEach((x, i) => {
            if (x.attach?.wall !== w.id) return;
            const m = moveAlong(w, nw, x.attach.offset, key === 'objects' ? x.size?.[0] ?? 0 : 0);
            things[key][i] = { ...x, attach: { ...x.attach, offset: m.offset, ...(m.flipped ? { side: flipSide(x.attach.side) } : {}) } };
          });
        }
        next.push(nw);
      }
      // walls that merged into another (a facade, or a shared wall): what was on them moves along, same place
      for (const { w, into } of mergedAway) {
        const host = next.find(x => x.id === into), moved = [];
        const hu = unit(host), wu = unit(w), flipped = dot(hu, wu) < 0;
        const sOn = (s) => { const p = [w.a[0] + wu[0] * s, w.a[1] + wu[1] * s]; return (p[0] - host.a[0]) * hu[0] + (p[1] - host.a[1]) * hu[1]; };
        const place = (offset, size) => r1(Math.min(sOn(offset), sOn(offset + size)));
        openings.forEach((o, i) => {
          if (o.wall !== w.id) return;
          const no = { ...o, wall: into, offset: place(o.offset, o.width) };
          if (flipped) { if (o.swing) no.swing = flipSide(o.swing); if (o.hinge) no.hinge = o.hinge === 'near' ? 'far' : 'near'; }
          if (no.offset < 0 || no.offset + o.width > d2(host.a, host.b) + 1) report.flagged.push({ id: o.id, wall: into, msg: 'no longer fits on its wall' });
          openings[i] = no; moved.push(o.id);
        });
        for (const key of ['objects', 'fixtures']) things[key].forEach((x, i) => {
          if (x.attach?.wall !== w.id) return;
          const size = key === 'objects' ? x.size?.[0] ?? 0 : 0;
          things[key][i] = { ...x, attach: { ...x.attach, wall: into, offset: place(x.attach.offset, size), ...(flipped ? { side: flipSide(x.attach.side) } : {}) } };
          moved.push(x.id);
        });
        const thick = !w.assumed?.includes('thickness') && !host.assumed?.includes('thickness') && Math.abs((w.thickness ?? 0) - (host.thickness ?? 0)) > 0.5 ? { thickness: [w.thickness, host.thickness] } : {};
        report.merged.push({ id: w.id, into: [into], moved, ...thick });
      }
      level = { ...level, walls: next, ...(level.openings ? { openings } : {}), ...(level.objects ? { objects: things.objects } : {}), ...(level.fixtures ? { fixtures: things.fixtures } : {}) };
      return movedNow;
    }
    const polysBefore = new Map(basis);                              // the outlines before this round (a room may have turned)
    for (const id of current.keys()) basis.set(id, current.get(id));
    for (const id of [...basis.keys()]) if (!current.has(id)) basis.delete(id);
    touched = new Set([...touched, ...changed, ...moved]);

    // 3. re-solve rooms whose corner 0 hangs on something that moved
    const geo = buildLevelGeometry(level);
    const snaps = new Map(collectSnapPoints(model, level, geo).map(s => [s.ref, s.pos]));
    const snapPos = ref => snaps.get(ref);
    // A room or solid placed at a wall's end or face corner: when that end jumped away (the wall merged
    // into a facade, or a new room lengthened it) while a room corner is still where the point was, it
    // was really that corner; the start moves over to it and nothing moves.
    // A room or solid placed at a corner of a room that turned (placed against another wall, re-measured
    // with another heading) turns with it: its offset from that corner and its heading turn by the same
    // angle, so it keeps its place in the room instead of only being shifted.
    const turnWith = raw => {
      const m = /^(r_[^#]+)#p(\d+)$/.exec(raw?.origin?.ref || '');
      if (!m || !maps.has(m[1]) || !polysBefore.get(m[1]) || !current.get(m[1])) return raw;
      const N = +m[2], map = maps.get(m[1]), oi = [...map.corners].find(([, to]) => to === N)?.[0];
      if (oi === undefined) return raw;
      const was = polysBefore.get(m[1]), now = current.get(m[1]), ang = (P, i) => { const a = P[i], b = P[(i + 1) % P.length]; return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; };
      let delta = ang(now, N) - ang(was, oi);
      delta = ((delta % 360) + 540) % 360 - 180;
      if (Math.abs(delta) < 0.01) return raw;
      const r = delta * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), [ox, oy] = raw.origin.offset || [0, 0];
      return { ...raw, heading: Math.round(((((raw.heading || 0) + delta) % 360) + 360) % 360 * 100) / 100, origin: { ...raw.origin, offset: [r1(ox * c - oy * sn), r1(ox * sn + oy * c)] } };
    };
    const steady = (thing, raw) => {
      const ref = raw?.origin?.ref, old = ref && /^w_[^#]+#(a|b)(\.(left|right))?$/.test(ref) && snapsBefore.get(ref), now = old && snaps.get(ref);
      if (!now || d2(old, now) <= 0.5) return null;
      const corner = [...snaps].find(([r, p]) => /^r_[^#]+#p\d+$/.test(r) && !r.startsWith(`${thing.id}#`) && d2(p, old) <= 1);
      if (!corner) return null;
      report.renamed.push({ ref, to: corner[0], where: thing.id });
      return { ...thing, capture: { ...thing.capture, raw: { ...raw, origin: { ...raw.origin, ref: corner[0] } } } };
    };
    level = { ...level, rooms: level.rooms.map(r => {
      const raw = r.capture?.raw;
      if (!raw?.origin?.ref || edited.has(r.id) && round === 0) return r;
      const kept = steady(r, raw);
      if (kept) return kept;
      if (!ownersOf(raw.origin.ref, level).some(id => touched.has(id)) && !touched.has(raw.origin.ref.split('#')[0])) return r;
      if (cyclic.has(r.id)) return r;
      const turned = turnWith(raw);
      const st = resolveStart(snapPos, turned.origin);
      if (st.error) { report.warnings.push(`${r.id}: ${st.error}`); return r; }
      if (turned === raw && d2(st.pos, raw.start ?? [0, 0]) <= 0.05) return r;
      const capture = { ...r.capture, raw: { ...turned, start: st.pos } };
      const sol = solveCapture(capture, { diagonals: checkDiagonals(checks, r.id, capture.raw.lengths?.length) });
      if (!sol.ok) { report.warnings.push(`${r.id}: cannot re-solve after its start point moved: ${sol.errors.join('; ')}`); return r; }
      if (!report.resolved.includes(r.id)) report.resolved.push(r.id);
      return { ...r, polygon: sol.polygon, capture };
    }) };
    // solids measured from a point of a room follow it the same way (and the walls follow the solid next round)
    if (level.solids?.length) level = { ...level, solids: level.solids.map(s => {
      const raw = s.capture?.raw;
      if (s.capture?.mode === 'circle' && Array.isArray(raw?.from)) {
        // a round pillar measured from two room walls: its middle follows those walls
        if (!raw.from.some(f => touched.has(f.ref.split('#')[0]))) return s;
        const c = circleFrom(level, raw.from, raw.diameter);
        if (c.error) { report.warnings.push(`${s.id}: ${c.error}`); return s; }
        if (d2(c.center, raw.start ?? [0, 0]) <= 0.05) return s;
        const capture = { ...s.capture, raw: { ...raw, start: c.center } }, sol = solveCapture(capture);
        if (!report.resolved.includes(s.id)) report.resolved.push(s.id);
        solidMoved = true;
        return { ...s, polygon: sol.polygon, capture };
      }
      if (!raw?.origin?.ref) return s;
      const kept = steady(s, raw);
      if (kept) return kept;
      if (!ownersOf(raw.origin.ref, level).some(id => touched.has(id)) && !touched.has(raw.origin.ref.split('#')[0])) return s;
      const turned = turnWith(raw);
      const st = resolveStart(snapPos, turned.origin);
      if (st.error) { report.warnings.push(`${s.id}: ${st.error}`); return s; }
      if (turned === raw && d2(st.pos, raw.start ?? [0, 0]) <= 0.05) return s;
      const capture = { ...s.capture, raw: { ...turned, start: st.pos } }, sol = solveCapture(capture);
      if (!sol.ok) { report.warnings.push(`${s.id}: cannot re-solve after its start point moved: ${sol.errors.join('; ')}`); return s; }
      if (!report.resolved.includes(s.id)) report.resolved.push(s.id);
      solidMoved = true;
      return { ...s, polygon: sol.polygon, capture };
    }) };
    touched = new Set();
  }

  // hand-drawn walls hanging on room points follow them: each end at its point plus its offset, the
  // offset turned with the room when the room turned as a whole (`walls[].anchor`)
  if (level.walls.some(w => w.anchor)) {
    const g = buildLevelGeometry(level), pts = new Map(collectSnapPoints(model, level, g).map(s => [s.ref, s.pos]));
    const turnOf = ref => {
      // the outline before: an edited room's is in the change, a room moved along (re-solved) had it at the start
      const id = /^(r_[^#]+)#p\d+$/.exec(ref || '')?.[1], old = id && (change.rooms?.[id] ?? before.rooms.get(id)), now = id && level.rooms.find(r => r.id === id)?.polygon;
      return (old && now && rigidMotion(old, now)?.deg) || 0;
    };
    level = { ...level, walls: level.walls.map(w => {
      if (!w.anchor || w.from?.length) return w;
      const next = { ...w };
      for (const end of ['a', 'b']) {
        const an = w.anchor[end], at = an && pts.get(an.ref);
        if (!at) continue;
        const t = turnOf(an.ref) * Math.PI / 180, [ox, oy] = an.offset || [0, 0];
        const off = t ? [r1(ox * Math.cos(t) - oy * Math.sin(t)), r1(ox * Math.sin(t) + oy * Math.cos(t))] : [ox, oy];
        next[end] = [r1(at[0] + off[0]), r1(at[1] + off[1])];
        if (t) next.anchor = { ...(next.anchor || w.anchor), [end]: { ...an, offset: off } };
      }
      return d2(next.a, w.a) > 0.05 || d2(next.b, w.b) > 0.05 || next.anchor !== w.anchor ? next : w;
    }) };
  }

  // a room moved or turned as a whole takes what stands free in it along: ceiling lamps, furniture
  for (const [id, old] of Object.entries(change.rooms || {})) {
    const now = level.rooms.find(r => r.id === id)?.polygon, move = old && now && rigidMotion(old, now);
    if (!move) continue;
    const inside = p => p && pointInPolygon(p, old);
    const fixtures = (level.fixtures || []).map(x => (!x.attach && inside(x.pos) ? (report.carried.push(x.id), { ...x, pos: move.apply(x.pos) }) : x));
    const objects = (level.objects || []).map(x => (!x.attach && inside(x.pos) ? (report.carried.push(x.id), { ...x, pos: move.apply(x.pos), ...(Math.abs(move.deg) > 0.01 ? { rotationDeg: Math.round((((x.rotationDeg || 0) + move.deg) % 360 + 360) % 360 * 100) / 100 } : {}) }) : x));
    level = { ...level, ...(level.fixtures ? { fixtures } : {}), ...(level.objects ? { objects } : {}) };
  }

  // orphans keep the edges they were made from, so the validator and the Editor can show them
  if (orphanFrom.size) level = { ...level, walls: level.walls.map(w => orphanFrom.has(w.id) && !report.merged.some(m => m.id === w.id) ? { ...w, from: orphanFrom.get(w.id) } : w) };
  report.orphans = dedupeBy(report.orphans.filter(o => level.walls.some(w => w.id === o.id) && orphanFrom.has(o.id)), 'id');

  // 4. fill what nothing covers: first the walls the rooms ask for (facades merged) where none of
  //    their edges has a wall yet, then, per edge, stretches that hand-drawn walls leave open
  const usedIds = new Set(level.walls.map(w => w.id)), claimed = new Set(level.walls.flatMap(w => w.from || []));
  const uid = id => { let n = id, k = 2; while (usedIds.has(n)) n = `${id}_${k++}`; usedIds.add(n); return n; };
  const geoNow = buildLevelGeometry(level), added = [];
  lastIdeal.forEach((g, gi) => {
    if (lastUsed.has(gi) || g.from.some(ref => claimed.has(ref))) return;
    const open = boundEdges(g, roomsById).along.every(e => { const gaps = edgeGaps(e.p, e.q, geoNow, e.ref); return gaps.length === 1 && gaps[0][0] < 1 && gaps[0][1] > e.L - 1; });
    if (!open) return;
    const w = { ...g, id: uid(g.id) };
    if (w.kind !== 'virtual' && !shared(g)) w.assumed = ['thickness'];
    g.from.forEach(ref => claimed.add(ref));
    added.push(w);
  });
  level = { ...level, walls: [...level.walls, ...added] };
  const fill = generateMissingWalls(level, { defaultThickness: outer, angleTol: PAIR_ANGLE });
  level = { ...fill.level, walls: fill.level.walls.map(w => fill.added.includes(w.id) && w.kind !== 'virtual' && w.from.length === 1 ? { ...w, assumed: ['thickness'] } : w) };
  report.added = [...added.map(w => w.id), ...fill.added];
  level = rehome(level, report);
  level = movePaint(level, report);
  report.warnings = [...new Set(report.warnings)];

  // 6. what moved, and by how much
  for (const w of level.walls) {
    const o = before.walls.get(w.id);
    if (!o) continue;
    const dist = Math.min(Math.max(d2(o.a, w.a), d2(o.b, w.b)), Math.max(d2(o.a, w.b), d2(o.b, w.a)));
    if (dist <= 0.05) continue;
    // same line, one end where it was: it only got longer or shorter
    const u = unit(o), off = p => Math.abs((p[1] - o.a[1]) * u[0] - (p[0] - o.a[0]) * u[1]);
    const stretch = off(w.a) < 0.5 && off(w.b) < 0.5 && (d2(o.a, w.a) < 0.5 || d2(o.b, w.b) < 0.5) ? r1(d2(w.a, w.b) - d2(o.a, o.b)) : null;
    report.moved.push({ id: w.id, kind: 'wall', dist: r1(dist), ...(stretch !== null ? { stretch } : {}) });
  }
  const solidsBefore = new Map((model.levels[li].solids || []).map(s => [s.id, s.polygon]));
  for (const id of report.resolved) {
    const o = before.rooms.get(id) ?? solidsBefore.get(id), n = (level.rooms.find(r => r.id === id) ?? level.solids?.find(s => s.id === id))?.polygon;
    const dist = o && n && o.length === n.length ? Math.max(...o.map((p, i) => d2(p, n[i]))) : Infinity;
    report.moved.push({ id, kind: 'room', dist: r1(dist) });
  }
  // a wall that others merged into grew; it is reported as the merge, and a merge is always confirmed
  const grown = new Set(report.merged.flatMap(m => m.into));
  report.moved = report.moved.filter(m => !grown.has(m.id));
  for (const m of report.moved) (m.dist > SILENT_MOVE ? report.preview : report.silent).push(m);
  for (const m of dedupeBy(report.merged, 'id')) report.preview.push({ id: m.id, kind: 'merge', into: m.into });
  report.bySolid = dedupeBy(report.bySolid, 'id');
  for (const m of report.bySolid) report.preview.push({ id: m.id, kind: 'solid', solids: m.solids });
  // a wall re-placed in several rounds: from the first value to the last
  report.thickness = dedupeBy(report.thickness, 'id').map(t => ({ ...t, from: before.walls.get(t.id)?.thickness, wasAssumed: !!before.walls.get(t.id)?.assumed?.includes('thickness') })).filter(t => t.from !== t.to);
  for (const t of report.thickness) if (Math.abs(t.to - (t.from ?? 0)) > SILENT_MOVE) report.preview.push({ id: t.id, kind: 'thickness', dist: r1(Math.abs(t.to - (t.from ?? 0))) });
  report.tilted = dedupeBy(report.tilted, 'id');

  const levels = model.levels.map((l, i) => i === li ? level : l);
  return { model: { ...model, levels, ...(checks !== model.checks ? { checks } : {}) }, report };
}

/**
 * Paint per room follows the room (walls[].roomSides): when a wall no longer runs along a room it was
 * painted for (a facade split when a room was added beside it), that look moves to the walls on the same
 * line that now run along that room and have no look of their own for it.
 */
function movePaint(level, report) {
  if (!(level.walls || []).some(w => w.roomSides)) return level;
  const g = buildLevelGeometry(level), rooms = new Set((level.rooms || []).map(r => r.id));
  const along = new Map(level.walls.map(w => [w.id, new Set(g.frames.get(w.id) ? wallFaceRooms(w, g.frames.get(w.id), level.rooms).map(x => x.room) : [])]));
  const sameLine = (x, w) => {
    const f = g.frames.get(w.id), h = g.frames.get(x.id);
    return f && h && Math.abs(f.u[0] * h.u[1] - f.u[1] * h.u[0]) < 1e-3 && Math.abs((x.a[0] - w.a[0]) * f.n[0] + (x.a[1] - w.a[1]) * f.n[1]) <= 10;
  };
  let walls = level.walls;
  for (const w of level.walls) for (const [rid, look] of Object.entries(w.roomSides || {})) {
    if (along.get(w.id).has(rid) || !rooms.has(rid)) continue;
    const to = walls.filter(x => x.id !== w.id && along.get(x.id)?.has(rid) && !x.roomSides?.[rid] && sameLine(x, w)).map(x => x.id);
    if (!to.length) continue;                                        // nowhere to go: kept, and the validator says so
    walls = walls.map(x => {
      if (to.includes(x.id)) return { ...x, roomSides: { ...(x.roomSides || {}), [rid]: look } };
      if (x.id !== w.id) return x;
      const { [rid]: _, ...rest } = x.roomSides;
      const { roomSides, ...plain } = x;
      return Object.keys(rest).length ? { ...x, roomSides: rest } : plain;
    });
    report.paintMoved.push({ room: rid, from: w.id, to });
  }
  // a face that runs along only that one room: the look is simply that face's own (sides.left / right);
  // two looks for one face would leave the face's own selector without effect
  walls = walls.map(w => {
    if (!w.roomSides || !g.frames.get(w.id)) return w;
    const faces = wallFaceRooms(w, g.frames.get(w.id), level.rooms), next = { ...w.roomSides };
    let sides = w.sides, changed = false;
    for (const side of ['left', 'right']) {
      const on = [...new Set(faces.filter(x => x.side === side).map(x => x.room))];
      if (on.length !== 1 || !next[on[0]]) continue;
      sides = { ...(sides || {}), [side]: next[on[0]] };
      delete next[on[0]];
      changed = true;
    }
    if (!changed) return w;
    const { roomSides, ...plain } = w;
    return { ...plain, sides, ...(Object.keys(next).length ? { roomSides: next } : {}) };
  });
  return walls === level.walls ? level : { ...level, walls };
}

/**
 * Openings and attached things that no longer fit on their wall (it got shorter, or a facade split)
 * move to another wall whose reference line runs through the same place, keeping that place.
 * Whatever finds no wall stays and is flagged.
 */
function rehome(level, report) {
  const walls = level.walls || [], at = (w, s) => { const u = unit(w); return [w.a[0] + u[0] * s, w.a[1] + u[1] * s]; };
  const find = (host, s0, s1) => {
    const P0 = at(host, s0), P1 = at(host, s1), hu = unit(host);
    for (const x of walls) {
      if (x.id === host.id || x.kind === 'virtual') continue;
      const u = unit(x), off = P => Math.abs((P[1] - x.a[1]) * u[0] - (P[0] - x.a[0]) * u[1]), s = P => (P[0] - x.a[0]) * u[0] + (P[1] - x.a[1]) * u[1];
      if (off(P0) > 1 || off(P1) > 1) continue;
      const lo = Math.min(s(P0), s(P1)), hi = Math.max(s(P0), s(P1));
      if (lo >= -1 && hi <= d2(x.a, x.b) + 1) return { wall: x.id, offset: r1(Math.max(0, lo)), flipped: dot(u, hu) < 0 };
    }
    return null;
  };
  const fits = (w, s0, s1) => s0 >= -1 && s1 <= d2(w.a, w.b) + 1;
  const byId = new Map(walls.map(w => [w.id, w]));
  const openings = (level.openings || []).map(o => {
    const w = byId.get(o.wall);
    if (!w || fits(w, o.offset, o.offset + o.width)) return o;
    const to = find(w, o.offset, o.offset + o.width);
    if (!to) return o;
    report.flagged = report.flagged.filter(f => f.id !== o.id);
    report.rehomed.push({ id: o.id, from: o.wall, to: to.wall });
    const no = { ...o, wall: to.wall, offset: to.offset };
    if (to.flipped) { if (o.swing) no.swing = flipSide(o.swing); if (o.hinge) no.hinge = o.hinge === 'near' ? 'far' : 'near'; }
    return no;
  });
  const things = key => (level[key] || []).map(x => {
    const w = x.attach && byId.get(x.attach.wall), size = key === 'objects' ? x.size?.[0] ?? 0 : 0;
    if (!w || fits(w, x.attach.offset, x.attach.offset + size)) return x;
    const to = find(w, x.attach.offset, x.attach.offset + size);
    if (!to) { report.flagged.push({ id: x.id, wall: w.id, msg: 'no longer on its wall' }); return x; }
    report.rehomed.push({ id: x.id, from: w.id, to: to.wall });
    return { ...x, attach: { ...x.attach, wall: to.wall, offset: to.offset, ...(to.flipped ? { side: flipSide(x.attach.side) } : {}) } };
  });
  return { ...level, ...(level.openings ? { openings } : {}), ...(level.objects ? { objects: things('objects') } : {}), ...(level.fixtures ? { fixtures: things('fixtures') } : {}) };
}

/**
 * Hand-made splits: a wall with `cut: [s0, s1]` is one part of a wall split by hand; s0 / s1 are mm
 * along its first room edge from that edge's start corner (null = where the wall itself starts or
 * ends). Every such value on an edge cuts the walls the rooms ask for there, so each part has a piece.
 */
function cutIdeal(ideal, walls, liveFrom, roomsById) {
  const points = new Map();                                   // edge ref → [mm from its start corner]
  for (const w of walls || []) {
    const lf = liveFrom.get(w.id);
    if (!w.cut || !lf?.length) continue;
    const list = points.get(lf[0]) || [];
    for (const v of w.cut) if (v !== null && v !== undefined) list.push(v);
    points.set(lf[0], list);
  }
  if (!points.size) return ideal;
  return ideal.flatMap(g => {
    const cuts = [];
    for (const [ref, list] of points) {
      const e = g.from.includes(ref) && edgeOfRef(ref, roomsById);
      if (!e) continue;
      const t = p => (p[0] - e.p[0]) * e.u[0] + (p[1] - e.p[1]) * e.u[1];
      const [ta, tb] = [t(g.a), t(g.b)];
      for (const v of list) if (v > Math.min(ta, tb) + 1 && v < Math.max(ta, tb) - 1) cuts.push(Math.abs(v - ta));
    }
    if (!cuts.length) return [g];
    const L = d2(g.a, g.b), u = unit(g), at = s => [r1(g.a[0] + u[0] * s), r1(g.a[1] + u[1] * s)];
    const stops = [0, ...[...new Set(cuts.map(r1))].sort((a, b) => a - b), L];
    return stops.slice(1).map((s, k) => ({ ...g, a: at(stops[k]), b: k === stops.length - 2 ? g.b : at(s) }));
  });
}

/** Walls something is on: openings, attached objects and fixtures. */
function heldWalls(level) {
  return new Set([...(level.openings || []).map(o => o.wall), ...[...(level.objects || []), ...(level.fixtures || [])].map(x => x.attach?.wall)].filter(Boolean));
}
function dedupeBy(list, key) {
  const seen = new Map();
  for (const x of list) seen.set(x[key], x);
  return [...seen.values()];
}

/** reconcile()'s report as short sentences for a page (preview dialog, status line). */
export function describeReconcile(report) {
  const out = [], mm = d => `${Math.round(d)} mm`, list = xs => xs.join(', ');
  const big = report.preview.filter(p => p.kind === 'wall' || p.kind === 'room'), small = report.silent;
  if (report.resolved.length) out.push(`Placed against a changed room, re-solved: ${list(report.resolved)}.`);
  const what = m => (m.stretch > 0 ? `${m.id} ${mm(m.stretch)} longer` : m.stretch < 0 ? `${m.id} ${mm(-m.stretch)} shorter` : `${m.id} ${mm(m.dist)}`);
  if (big.length) out.push(`Changes: ${list(big.map(what))}.`);
  if (small.length) out.push(`Small moves (up to ${SILENT_MOVE} mm): ${list(small.map(m => m.id))}.`);
  for (const t of report.thickness) out.push(`${t.id}: thickness ${t.from ?? '–'} → ${t.to} mm (distance between the two rooms${t.wasAssumed ? '; replaces the assumed value' : ''}).`);
  for (const t of report.tilted) out.push(`${t.id}: the two rooms are not quite parallel here (the gap varies by ${mm(t.tilt)}).`);
  if (report.added.length) out.push(`New walls: ${list(report.added)}.`);
  for (const m of report.merged) out.push(`${m.id} merged into ${list(m.into)}, which now runs on as one wall (${m.id} removed)${m.moved?.length ? `; moved onto it: ${list(m.moved)}` : ''}${m.thickness ? `; its thickness ${m.thickness[0]} mm differs from ${m.thickness[1]} mm` : ''}.`);
  for (const p of report.paintMoved || []) out.push(`${p.from}'s look facing ${p.room} moved to ${list(p.to)}, which run along it now.`);
  if (report.carried?.length) out.push(`Moved along with their room: ${list(report.carried)}.`);
  for (const m of report.bySolid) out.push(`${m.id} removed: ${list(m.solids)} now bounds the room there.`);
  for (const o of report.orphans) out.push(`${o.id} is orphaned: ${o.reason}. Delete it or keep it as a hand-drawn wall.`);
  for (const h of report.rehomed) out.push(`${h.id} moved from ${h.from} to ${h.to}, same place.`);
  for (const f of report.flagged) out.push(`${f.id} ${f.msg} (${f.wall}).`);
  for (const b of report.brokenRefs) out.push(`${b.where}: ${b.ref} ${b.msg}.`);
  if (report.cycles.length) out.push(`Rooms placed against each other in a circle, not re-solved: ${list(report.cycles)}.`);
  out.push(...report.warnings);
  return out;
}
