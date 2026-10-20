import { resolveElevations, describeElevationFrom } from './elevation.js';
import { checkLook } from '../ha/appearance.js';
import { solveExtra, checkCheck } from './checks.js';
import { sub, dot, cross, TOL } from '../geometry/vec.js';
import { isClockwise, convexPenetration, polygonsOverlap, pointInPolygon } from '../geometry/polygon.js';
import { solveCapture } from '../capture/solve.js';
import { facePoint, wallProfile, hasBody } from '../geometry/walls.js';
import { boundEdges, edgeOfRef } from '../geometry/bound.js';
import { PAIR_ANGLE, MAX_SHARED_GAP } from '../capture/walls.js';
import { solidCover } from '../geometry/solids.js';
import { wallFaceRooms } from '../geometry/paint.js';
import { collectSnapPoints, collectSnapPointsAround } from '../tools/snap.js';
import { STAIR_LIMITS, stairOpening, stairSolids, openingRectPoly } from '../geometry/stairs.js';
import { checkOpening } from './openings.js';
import { checkFixture } from './fixtures.js';
import { checkSolid } from './solids.js';
import { checkAnchors } from './anchors.js';
import { checkRoomOptions } from './rooms.js';
import { checkObject } from './objects.js';
import { isHosted } from './hosted.js';
import { checkName } from './names.js';
import { checkMaterials, checkPalette } from './materials.js';
import { checkSite } from './site.js';

// Issues: { severity: 'error' | 'warn', id, msg }. Never throws on bad data; reports it.

const ID_COLLECTIONS = ['rooms', 'walls', 'openings', 'solids', 'slabs', 'objects', 'fixtures', 'stairs'];
const WALL_KINDS = new Set(['wall', 'railing', 'virtual']);

/** Ids must be unique per model file (across all levels), since snap refs and checks use them. */
function checkIds(model, out) {
  const seen = new Map();
  const note = (id, where) => {
    if (!id) { out.push({ severity: 'error', id: where, msg: 'missing id' }); return; }
    if (seen.has(id)) out.push({ severity: 'error', id, msg: `duplicate id (also in ${seen.get(id)})` });
    else seen.set(id, where);
  };
  for (const lv of model.levels) {
    note(lv.id, 'levels');
    // a derived lamp (lit.js) is the object's light: it takes the object's id, so it is not a second item with an id of its own
    for (const c of ID_COLLECTIONS) (lv[c] || []).forEach(x => { if (x.derived) return; note(x.id, `${lv.id}.${c}`); out.push(...checkName(x)); });
  }
  (model.checks || []).forEach(x => note(x.id, 'checks'));
  (model.anchors || []).forEach(x => note(x.id, 'anchors'));
}

/**
 * Uncovered intervals [t0, t1] along room edge p→q (unit e, length l): not covered by any wall face,
 * virtual line or face of a solid beyond the edge, nor by a wall bound to this edge (`from` lists `key`; such a wall may be up to 2° off,
 * see reconcile(), so its span is projected onto the edge).
 */
function edgeCoverage(p, e, l, geo, key) {
  const iv = solidCover(p, [p[0] + e[0] * l, p[1] + e[1] * l], geo.level?.solids);
  for (const w of geo.walls) {
    if (key && w.from?.includes(key)) {
      const t0 = dot(sub(w.a, p), e), t1 = dot(sub(w.b, p), e);
      const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(l, Math.max(t0, t1));
      if (hi > lo) iv.push([lo, hi]);                               // its faces still count below (a mitred end reaches further)
    }
    const f = geo.frames.get(w.id);
    if (!f.L || Math.abs(cross(f.u, e)) > 1e-6) continue;
    const cap = geo.caps.get(w.id);
    const lines = hasBody(w)
      ? ['left', 'right'].map(side => [facePoint(w, f, side, cap.a[side]), facePoint(w, f, side, cap.b[side])])
      : [[w.a, w.b]];
    for (const [s, t] of lines) {
      if (Math.abs(cross(e, sub(s, p))) > TOL) continue;               // not on the edge's line
      const t0 = dot(sub(s, p), e), t1 = dot(sub(t, p), e);
      const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(l, Math.max(t0, t1));
      if (hi > lo) iv.push([lo, hi]);
    }
  }
  iv.sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let at = 0;
  for (const [lo, hi] of iv) { if (lo > at + TOL) gaps.push([at, lo]); at = Math.max(at, hi); }
  if (l > at + TOL) gaps.push([at, l]);
  return gaps;
}

/** Gaps [t0, t1] (mm from p) along the edge p→q not covered by any wall face or virtual wall (or a wall bound to edge `key`). */
export function edgeGaps(p, q, geo, key) {
  const d = sub(q, p), l = Math.hypot(d[0], d[1]);
  return l < TOL ? [] : edgeCoverage(p, [d[0] / l, d[1] / l], l, geo, key);
}

/**
 * A wall bound to room edges (`from`) must still follow them: every ref names an existing edge, and
 * the wall's reference line lies on the first one. Otherwise it is an orphan (an error: reconcile()
 * could not place it; delete it or turn it into a hand-drawn wall).
 */
function checkBound(w, rooms, out) {
  const SIN2 = Math.sin(2 * Math.PI / 180), FACADE_TOL = 10;      // rooms along one facade may be a few mm out of line
  const { along, missing } = boundEdges(w, rooms);
  if (missing.length) { out.push({ severity: 'error', id: w.id, msg: `bound to room edge ${missing[0]}, which does not exist (orphaned wall: delete it or keep it as a hand-drawn wall)` }); return; }
  const first = along.find(e => e.ref === w.from[0]);
  const bad = () => out.push({ severity: 'error', id: w.id, msg: `no longer follows room edge ${w.from[0]} (orphaned wall: open it in the Editor and choose Keep as hand-drawn, or Delete it)` });
  if (!first) return bad();
  const off = (e, pt) => Math.abs(cross(e.u, sub(pt, e.p))), t = pt => dot(sub(pt, first.p), first.u);
  if (along.some(e => Math.abs(cross(e.u, first.u)) > SIN2) || off(first, w.a) > TOL || off(first, w.b) > TOL) return bad();
  if (along.some(e => off(first, e.p) > FACADE_TOL || off(first, e.q) > FACADE_TOL)) return bad();
  const ends = along.flatMap(e => [t(e.p), t(e.q)]);
  if (Math.min(t(w.a), t(w.b)) < Math.min(...ends) - TOL || Math.max(t(w.a), t(w.b)) > Math.max(...ends) + TOL) bad();
}

/**
 * Why two overlapping walls bound to rooms did not become one shared wall, when it is the angle: an edge of
 * each (its own, or the next one round its room: the overlap is often at the corner wall beside the slanted
 * edge) faces the other within MAX_SHARED_GAP but more than PAIR_ANGLE (and at most 10°) off parallel, a room
 * that does not close square. Returns { kind: 'not-parallel', edges: [refA, refB], angle } or null.
 */
function notParallelCause(a, b, roomsById) {
  const near = w => [...new Set(w.from.flatMap(ref => {
    const m = /^(.+)#e(\d+)$/.exec(ref), n = m && roomsById.get(m[1])?.polygon.length;
    return n ? [ref, `${m[1]}#e${(+m[2] + 1) % n}`, `${m[1]}#e${(+m[2] + n - 1) % n}`] : [];
  }))];
  for (const ra of near(a)) for (const rb of near(b)) {
    const A = edgeOfRef(ra, roomsById), B = edgeOfRef(rb, roomsById);
    if (!A || !B || A.room === B.room || dot(A.u, B.u) >= 0) continue;          // facing edges run opposite ways
    const angle = Math.acos(Math.min(1, Math.abs(dot(A.u, B.u)))) * 180 / Math.PI;
    if (angle <= PAIR_ANGLE || angle > 10) continue;
    const t0 = dot(sub(B.p, A.p), A.u), t1 = dot(sub(B.q, A.p), A.u);
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(A.L, Math.max(t0, t1));
    if (hi - lo < 100) continue;
    // the gap (B on A's wall side, its left) at the middle of the overlap
    const tm = (lo + hi) / 2, k = (tm - t0) / (t1 - t0), mid = [B.p[0] + (B.q[0] - B.p[0]) * k, B.p[1] + (B.q[1] - B.p[1]) * k];
    const gap = cross(A.u, sub(mid, A.p));
    if (gap < -0.5 || gap > MAX_SHARED_GAP) continue;
    return { kind: 'not-parallel', edges: [ra, rb], angle: Math.round(angle * 10) / 10 };
  }
  return null;
}

/** Validate one level using its derived geometry (from buildLevelGeometry). */
export function validateLevel(level, geo, below = true, checks = [], blueprints) {
  const out = [...geo.issues];
  for (const r of level.rooms || []) {
    const opt = checkRoomOptions(r, level, below);
    for (const m of opt.errors) out.push({ severity: 'error', id: r.id, msg: m });
    for (const m of opt.warnings) out.push({ severity: 'warn', id: r.id, msg: m });
    const poly = r.polygon || [];
    if (poly.length < 3) { out.push({ severity: 'error', id: r.id, msg: 'room polygon has fewer than 3 points' }); continue; }
    if (r.capture) {                                   // polygon must still be what the raw data solves to
      const sol = solveCapture(r.capture, solveExtra({ checks }, r));         // checks that join its solve count too
      if (!sol.ok) out.push({ severity: 'warn', id: r.id, msg: `capture data cannot be solved: ${sol.errors.join('; ')}` });
      else if (sol.polygon.length !== poly.length || sol.polygon.some((p, i) => Math.hypot(p[0] - poly[i][0], p[1] - poly[i][1]) > 5)) {
        out.push({ severity: 'warn', id: r.id, msg: 'polygon differs from what capture.raw solves to (hand-edited? re-solve or update the raw data)' });
      }
    }
    // Orientation is reported, not silently fixed: corner refs (r#p0…) depend on vertex order.
    if (!isClockwise(poly)) out.push({ severity: 'warn', id: r.id, msg: 'room polygon is counter-clockwise (should be clockwise, interior on the right)' });
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], d = sub(q, p), l = Math.hypot(d[0], d[1]);
      if (l < TOL) return;
      const gaps = edgeCoverage(p, [d[0] / l, d[1] / l], l, geo, `${r.id}#e${i}`);
      if (gaps.length) out.push({ severity: 'warn', id: r.id, msg: `edge p${i}→p${(i + 1) % poly.length} not covered by a wall face, solid or virtual wall at ${gaps.map(([a, b]) => `${Math.round(a)}–${Math.round(b)}`).join(', ')} mm` });
    });
  }
  // Rooms must not share floor area with each other or with a wall body (walls that bound the room sit on its outline)
  const roomsOk = (level.rooms || []).filter(r => r.polygon?.length >= 3);
  roomsOk.forEach((r, i) => {
    for (const o of roomsOk.slice(i + 1)) if (polygonsOverlap(r.polygon, o.polygon)) out.push({ severity: 'warn', id: r.id, msg: `room overlaps room ${o.id}` });
    for (const w of level.walls || []) {
      if (!w.from?.length) continue;                                  // a hand-drawn wall may stand in a room (a divider, a lintel)
      const own = (w.rooms || []).includes(r.id), tol = own ? 5 + (w.thickness || 0) : 5;      // a wall listed for the room may sit on its side of the outline (justify right)
      if ((geo.pieces.get(w.id) || []).some(pc => polygonsOverlap(r.polygon, pc, tol))) out.push({ severity: 'warn', id: r.id, msg: `room overlaps wall ${w.id}` });
    }
  });
  const roomById = new Map((level.rooms || []).filter(r => r.polygon?.length >= 3).map(r => [r.id, r]));
  let refs = null;                                                    // snap refs, when a wall hangs on one
  for (const w of level.walls || []) {
    if (w.from) checkBound(w, roomById, out);
    if (w.roomSides !== undefined) {
      // painted per room: the rooms must exist and lie along one of its faces (looks are checked with the materials)
      if (typeof w.roomSides !== 'object' || Array.isArray(w.roomSides) || !w.roomSides) out.push({ severity: 'error', id: w.id, msg: 'roomSides must be { roomId: { color } or { material } }' });
      else {
        const along = new Set(wallFaceRooms(w, geo.frames.get(w.id), level.rooms).map(x => x.room));
        for (const id of Object.keys(w.roomSides)) if (!along.has(id)) out.push({ severity: 'warn', id: w.id, msg: (level.rooms || []).some(r => r.id === id) ? `painted for room ${id}, which no face of it runs along` : `painted for room ${id}, which does not exist` });
      }
    }
    if (w.anchor !== undefined) {
      // a hand-drawn wall's ends hang on points: { a?, b? } each { ref, offset: [dx, dy] }
      if (w.from?.length) out.push({ severity: 'warn', id: w.id, msg: 'anchor is ignored on a wall that follows room edges' });
      for (const [end, an] of Object.entries(w.anchor || {})) {
        if (!['a', 'b'].includes(end) || !an?.ref || !Array.isArray(an.offset) || an.offset.length !== 2 || !an.offset.every(Number.isFinite)) { out.push({ severity: 'error', id: w.id, msg: `anchor.${end} must be { ref, offset: [dx, dy] }` }); continue; }
        refs ??= new Set(collectSnapPoints({ anchors: [] }, level, geo).map(p => p.ref));
        if (!refs.has(an.ref)) out.push({ severity: 'warn', id: w.id, msg: `its ${end === 'a' ? 'start' : 'end'} hangs on ${an.ref}, which does not exist` });
      }
    }
    if (w.lock !== undefined) {
      // kept along x or y when an end is dragged (hand-drawn walls; bound ones lock through their room)
      if (w.lock !== 'axis') out.push({ severity: 'error', id: w.id, msg: `lock must be "axis" (got ${JSON.stringify(w.lock)})` });
      else if (w.from?.length) out.push({ severity: 'warn', id: w.id, msg: 'lock is ignored on a wall that follows room edges (lock the room\'s wall instead)' });
      else if (Math.abs(w.a[0] - w.b[0]) > 0.5 && Math.abs(w.a[1] - w.b[1]) > 0.5) out.push({ severity: 'warn', id: w.id, msg: 'kept along x or y (lock), but it runs at an angle (the room it hangs on turned?)' });
    }
    if (w.cut !== undefined && (!w.from || !Array.isArray(w.cut) || w.cut.length !== 2 || w.cut.some(v => v !== null && !Number.isFinite(v)))) out.push({ severity: 'error', id: w.id, msg: 'cut must be [mm or null, mm or null] on a wall that follows a room edge' });
    if (!WALL_KINDS.has(w.kind)) out.push({ severity: 'error', id: w.id, msg: `unknown wall kind "${w.kind}"` });
    if (geo.frames.get(w.id).L < TOL) out.push({ severity: 'error', id: w.id, msg: 'wall has zero length' });
    if (w.kind === 'wall' && w.height === 0) out.push({ severity: 'error', id: w.id, msg: 'wall with height 0: leave the height out to reach the ceiling, or use kind "virtual"' });
    if (!w.top && !w.bottom && w.height !== undefined && (w.base ?? 0) + w.height > (level.ceilingHeight ?? 2400) + 1) out.push({ severity: 'warn', id: w.id, msg: `rises to ${(w.base ?? 0) + w.height} mm, above the ceiling (${level.ceilingHeight ?? 2400} mm)` });
    if (!w.top && !w.bottom && w.height === undefined && (w.base ?? 0) >= (level.ceilingHeight ?? 2400)) out.push({ severity: 'error', id: w.id, msg: `its base (${w.base} mm) is at or above the ceiling` });
    if (w.top || w.bottom) {
      // a sloped wall: heights at both ends, the top above the bottom, warned when above the ceiling
      const bad = ['top', 'bottom'].filter(k => w[k] !== undefined && !(w[k] && Number.isFinite(w[k].a) && Number.isFinite(w[k].b) && w[k].a >= 0 && w[k].b >= 0));
      if (bad.length) out.push({ severity: 'error', id: w.id, msg: `${bad.join(' and ')} must be { a, b }: heights in mm (0 or more) at the wall's two ends` });
      else {
        const p = wallProfile(w, level);
        // level stretches at the ends: numbers, not longer than the wall together
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        for (const k of ['top', 'bottom']) for (const fk of ['flatA', 'flatB']) if (w[k]?.[fk] !== undefined && !(Number.isFinite(w[k][fk]) && w[k][fk] >= 0)) out.push({ severity: 'error', id: w.id, msg: `${k}.${fk} must be 0 or more mm` });
        for (const k of ['top', 'bottom']) if ((w[k]?.flatA ?? 0) + (w[k]?.flatB ?? 0) > L + 0.5) out.push({ severity: 'error', id: w.id, msg: `the level stretches of its ${k} are longer than the wall (${Math.round(L)} mm)` });
        // the top above the bottom everywhere: at the ends and where a slope starts or ends
        if ([0, L, ...p.breaks].some(s => !(p.at(s).top > p.at(s).base))) out.push({ severity: 'error', id: w.id, msg: 'the top must be above the bottom along the whole wall' });
        if (p.top > (level.ceilingHeight ?? 2400) + 1) out.push({ severity: 'warn', id: w.id, msg: `rises to ${p.top} mm, above the ceiling (${level.ceilingHeight ?? 2400} mm)` });
      }
    }
  }
  for (const o of level.openings || []) {
    const w = geo.wallById.get(o.wall);
    if (!w) { out.push({ severity: 'error', id: o.id, msg: `opening references missing wall "${o.wall}"` }); continue; }
    if (w.kind === 'virtual') out.push({ severity: 'warn', id: o.id, msg: `opening on virtual wall ${w.id}` });
    for (const e of checkOpening(o, w, level, (level.openings || []).filter(x => x.wall === w.id))) out.push({ severity: 'error', id: o.id, msg: e });
  }
  for (const x of level.objects || []) {
    // a hosted object is on its opening, and checkObject (below) checks that opening; a wall attachment must name a wall
    if (x.attach && !isHosted(x) && !geo.wallById.get(x.attach.wall)) out.push({ severity: 'error', id: x.id, msg: `attached to missing wall "${x.attach.wall}"` });
  }
  for (const fx of level.fixtures || []) {
    // a derived lamp is a lit object's light (lit.js): the object is checked (checkObject), so its light is not checked again (issue #24)
    if (fx.derived) continue;
    const { errors, warnings } = checkFixture(fx, level);
    for (const e of errors) out.push({ severity: 'error', id: fx.id, msg: e });
    for (const w of warnings) out.push({ severity: 'warn', id: fx.id, msg: w });
  }
  // Solids: their own rules, measurements that still solve to the footprint, and no wall built into them
  for (const s of level.solids || []) {
    const { errors, warnings } = checkSolid(s, level);
    for (const e of errors) out.push({ severity: 'error', id: s.id, msg: e });
    for (const w of warnings) out.push({ severity: 'warn', id: s.id, msg: w });
    if (errors.length) continue;
    if (s.capture) {
      const sol = solveCapture(s.capture), poly = s.polygon;
      if (!sol.ok) out.push({ severity: 'warn', id: s.id, msg: `capture data cannot be solved: ${sol.errors.join('; ')}` });
      else if (sol.polygon.length !== poly.length || sol.polygon.some((p, i) => Math.hypot(p[0] - poly[i][0], p[1] - poly[i][1]) > 5)) out.push({ severity: 'warn', id: s.id, msg: 'footprint differs from what capture.raw solves to' });
    }
    const z0 = s.base ?? 0, z1 = z0 + (s.height ?? level.ceilingHeight ?? 2400);
    for (const w of (level.walls || []).filter(hasBody)) {
      const p = wallProfile(w, level);
      if (Math.min(p.top, z1) - Math.max(p.base, z0) <= TOL) continue;
      if ((geo.pieces.get(w.id) || []).some(pc => polygonsOverlap(pc, s.polygon, 5))) out.push({ severity: 'warn', id: w.id, msg: `wall stands inside ${s.id}${s.cutsWalls ? '' : ' (if it really stands in the wall, let walls give way to it: tick that on the solid)'}` });
    }
  }
  for (const o of level.objects || []) {
    const { errors, warnings } = checkObject(o, level, blueprints);
    for (const m of errors) out.push({ severity: 'error', id: o.id, msg: m });
    for (const m of warnings) out.push({ severity: 'warn', id: o.id, msg: m });
  }
  // Overlapping wall volumes (z-fighting): pieces of different walls that intersect in plan and in height.
  const solid = (level.walls || []).filter(hasBody);
  const roomsById = new Map((level.rooms || []).filter(r => r.polygon?.length >= 3).map(r => [r.id, r]));
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j], pa = wallProfile(a, level), pb = wallProfile(b, level);
    if (Math.min(pa.top, pb.top) - Math.max(pa.base, pb.base) <= TOL) continue;
    const hit = geo.pieces.get(a.id).some(p => geo.pieces.get(b.id).some(q => convexPenetration(p, q) > TOL));
    if (!hit) continue;
    const cause = a.from?.length && b.from?.length ? notParallelCause(a, b, roomsById) : null;
    const why = !a.from?.length || !b.from?.length ? ''
      : cause ? `: room edges ${cause.edges[0]} and ${cause.edges[1]} face each other but are ${cause.angle}° off parallel, so they did not become one shared wall; check their measurements, or lock them to an axis`
      : ': both follow room edges, so neither can be cut; check the rooms';
    out.push({ severity: 'warn', id: a.id, pair: [a.id, b.id], ...(cause ? { cause } : {}), msg: `wall volume overlaps ${b.id}${why}` });
  }
  return out;
}

/**
 * Stairs (PLANTERN.md §6.4): they must be well formed, go up to a level above, have plausible steps, stand on a
 * floor, and arrive at the edge of the opening they make in the floor above. A stair that cannot be worked out is an
 * error; things that look wrong but may be what was built are warnings.
 */
function validateStairs(model, geos) {
  const out = [], centroid = poly => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  const floorAt = (lv, holes, p) => (lv?.rooms || []).some(r => r.floor !== 'none' && pointInPolygon(p, r.polygon)) && !(holes || []).some(h => pointInPolygon(p, h.poly));
  for (const lv of model.levels) {
    for (const s of geos.get(lv.id)?.stairs || []) {
      const err = msg => out.push({ severity: 'error', id: s.id, level: lv.id, msg }), warn = msg => out.push({ severity: 'warn', id: s.id, level: lv.id, msg });
      if (s.error) { err(s.error); continue; }
      const to = model.levels.find(l => l.id === s.to), L = s.layout;
      if ((to.building ?? null) !== (lv.building ?? null)) { err(`it goes to ${to.id}, which is in another building`); continue; }
      if (L.riser < STAIR_LIMITS.riser[0] || L.riser > STAIR_LIMITS.riser[1]) warn(`step height ${L.riser} mm (usual ${STAIR_LIMITS.riser.join('–')}): check the risers against the rise of ${s.rise} mm`);
      const bad = [...new Set((L.treadDepths || L.depths).filter(d => d < STAIR_LIMITS.tread[0] || d > STAIR_LIMITS.tread[1]))];
      s.stairs.flights.forEach((f, i) => {
        // measured treads and a measured run: the run is a check on them
        if (Array.isArray(f.treads) && f.length > 0) { const sum = f.treads.reduce((a, b) => a + b, 0); if (Math.abs(sum - f.length) > 5) warn(`flight ${i + 1}: its treads add up to ${Math.round(sum)} mm, its measured run is ${f.length} mm`); }
      });
      // ignoreDepthWarning: the person checked the steps and they are right (fixes list 28); only this warning is silenced
      if (bad.length && s.stairs.ignoreDepthWarning !== true) warn(`step depth ${bad.map(d => Math.round(d)).join(', ')} mm (usual ${STAIR_LIMITS.tread.join('–')})`);
      // a moved winder pivot fans equal angles; the further it is from the landing the more uneven the treads get
      if (s.stairs.winderPivot) {
        const areas = L.steps.filter(st => st.kind === 'winder').map(st => Math.abs(st.poly.reduce((t, q, i) => { const r = st.poly[(i + 1) % st.poly.length]; return t + q[0] * r[1] - r[0] * q[1]; }, 0) / 2));
        if (areas.length > 1 && Math.max(...areas) > 3 * Math.min(...areas)) warn(`the winders are very uneven with this pivot (the largest is ${(Math.max(...areas) / Math.min(...areas)).toFixed(1)} times the smallest): move the winder pivot closer to the landing`);
      }
      const here = geos.get(lv.id);
      // the first step stands on the floor; further ones may run over an opening or past the floor's edge when the steps are carried by a sloped underside, otherwise they would hang in the air
      const off = L.steps.filter((st, i) => (i === 0 || s.stairs.underside !== 'sloped') && !floorAt(lv, here.holes, centroid(st.poly)));
      // named, and says what to do (fixes list 8): move the stairs, give the floor, or open only part of the hole
      const label = s.stairs.name ? `"${s.stairs.name}" (${s.id})` : s.id;
      if (off.length) warn(`${label}: ${off.length === 1 ? 'a step stands' : off.length + ' steps stand'} where there is no floor on ${lv.id} (outside the rooms, or over the opening of stairs arriving from below${s.stairs.underside === 'sloped' ? '' : '; a sloped underside can carry steps over an opening'}). Move the stairs, or give ${lv.id} a floor there, or open only the part of the hole that has one (a rectangle, openingRect)`);
      const beyond = [L.arrival.pos[0] + L.arrival.dir[0] * 200, L.arrival.pos[1] + L.arrival.dir[1] * 200], up = geos.get(to.id);
      if (!floorAt(to, up?.holes?.filter(h => h.id !== s.id), beyond)) warn(`its top step does not meet a floor on ${to.id}: nothing to step onto past the arrival edge`);
      // headroom: with an opening given by hand, every step that would hit the slab must lie inside it
      // an opening that does not clear every step is the person's choice: steps may touch the slab (a bottom step does not), so no error (BBV28)
      // the opening is cut at the edge of the floor above (geometry); where it was cut, the stair does not fit this floor plan: a warning, which the stair can switch off (fixes list 8, BBV28)
      if (s.trimmed && s.stairs.ignoreEdgeWarning !== true) warn(`${label}: its opening in the floor of ${to.id} reaches past the edge of the rooms there, so it is cut at that edge. Move the stairs, change the rooms above, or tick "opening past the edge is fine" for this stair`);
    }
  }
  out.push(...stairsHeadroom(model, geos));
  return out;
}

/**
 * Headroom between stairs (PLANTERN.md §6.4): somebody on a step needs `headroom` of clear height above it. What can be
 * in the way besides the slab (handled by the opening in the floor above) is the solid of other stairs: a stair
 * crossing over another one (a sloped underside leaves room; closed blocks and thin treads do not). Checked at the middle
 * of every step against every step of every other stair, in absolute heights.
 */
function stairsHeadroom(model, geos) {
  const out = [], all = [];
  for (const lv of model.levels) for (const s of geos.get(lv.id)?.stairs || []) if (s.layout) all.push({ s, lv, solids: stairSolids(s.layout, s.stairs, { dz: lv.elevation }) });
  if (all.length < 2) return out;
  const inside = (p, poly) => pointInPolygon(p, poly);
  const soffit = (b, p) => {                      // height of the underside of a prism at plan point p
    const e = b.slope?.bottom;
    if (!e) return b.z0;
    return e.a + (e.b - e.a) * (((p[0] - e.origin[0]) * e.u[0] + (p[1] - e.origin[1]) * e.u[1]) / (e.L || 1));
  };
  for (const { s, lv } of all) {
    const seen = new Set();
    s.layout.steps.forEach((st, i) => {
      const c = [st.poly.reduce((a, p) => a + p[0], 0) / st.poly.length, st.poly.reduce((a, p) => a + p[1], 0) / st.poly.length];
      const feet = lv.elevation + st.top, head = feet + (s.headroom ?? 2000);
      for (const o of all) {
        if (o.s === s || seen.has(o.s.id)) continue;
        const hit = o.solids.find(b => !b.side && inside(c, b.poly) && soffit(b, c) < head - 1 && b.z1 > feet + 1);
        if (hit) { seen.add(o.s.id); out.push({ severity: 'warn', id: s.id, level: lv.id, msg: soffit(hit, c) < feet ? `step ${i + 1} runs into the stairs ${o.s.id}` : `head room on step ${i + 1}: only ${Math.round(soffit(hit, c) - feet)} mm under the stairs ${o.s.id} (needs ${s.headroom ?? 2000})` }); }
      }
    });
  }
  return out;
}

/**
 * Heights across levels (PLANTERN.md §5): what was measured (`levels[].capture`) must agree with the stored
 * elevation, floor build-up and ceiling height, and a room or solid placed at a point of another level
 * (`capture.raw.origin.ref`) needs that point to exist on the level below or above.
 */
function validateLevels(model, geos) {
  const out = [], byElev = [...model.levels].sort((a, b) => a.elevation - b.elevation), mm = 1;
  // parts of one floor: levels joined by "level with" (elevationFrom relation 'same'), whatever their offset
  const group = new Map(model.levels.map(l => [l.id, l.id])), root = id => (group.get(id) === id ? id : root(group.get(id)));
  for (const l of model.levels) if (l.elevationFrom?.relation === 'same' && group.has(l.elevationFrom.level)) group.set(root(l.id), root(l.elevationFrom.level));
  const partsOfOne = (a, b) => root(a.id) === root(b.id);
  byElev.forEach((lv, i) => {
    // the level above: strictly higher (a level at the same height is a part of this floor, beside it)
    const cap = lv.capture, above = byElev.slice(i + 1).find(l => l.elevation > lv.elevation && !partsOfOne(l, lv) && (l.building ?? null) === (lv.building ?? null));
    if (cap?.ceilingHeight !== undefined && lv.ceilingHeight !== undefined && Math.abs(cap.ceilingHeight - lv.ceilingHeight) > mm) out.push({ severity: 'warn', id: lv.id, msg: `ceiling height ${lv.ceilingHeight} mm differs from the measured ${cap.ceilingHeight} mm` });
    if (cap?.floorToFloor !== undefined && above) {
      if (Math.abs(lv.elevation + cap.floorToFloor - above.elevation) > mm) out.push({ severity: 'warn', id: above.id, msg: `elevation ${above.elevation} mm differs from ${lv.id}'s elevation + measured floor-to-floor (${lv.elevation + cap.floorToFloor} mm)` });
      const ft = cap.floorToFloor - (cap.ceilingHeight ?? lv.ceilingHeight);
      if (Number.isFinite(ft) && above.floorThickness !== undefined && Math.abs(ft - above.floorThickness) > mm) out.push({ severity: 'warn', id: above.id, msg: `floor build-up ${above.floorThickness} mm differs from floor-to-floor minus ceiling height of ${lv.id} (${ft} mm)` });
    }
    if (above && above.elevation - above.floorThickness < lv.elevation + (lv.ceilingHeight ?? 0) - mm) out.push({ severity: 'warn', id: above.id, msg: `its floor slab starts below the ceiling of ${lv.id}: levels overlap` });
  });
  // a level whose height follows another (decision 110): it must exist, no cycles, and the stored value agree
  const resolved = resolveElevations(model);
  for (const e of resolved.errors) out.push({ severity: 'error', id: e.split(':')[0], msg: e.slice(e.indexOf(':') + 1).trim() });
  for (const c of resolved.changed) out.push({ severity: 'warn', id: c.level, msg: `elevation ${c.from} mm differs from the level it follows (${describeElevationFrom(model, model.levels.find(l => l.id === c.level))}: ${c.to} mm): edit the level to update it` });
  for (const lv of model.levels) {
    const geo = geos.get(lv.id);
    if (!geo) continue;
    let refs = null;
    for (const thing of [...(lv.rooms || []), ...(lv.solids || [])]) {
      const ref = thing.capture?.raw?.origin?.ref;
      if (!ref) continue;
      refs ??= new Set(collectSnapPointsAround(model, lv, l => geos.get(l.id) || geo).map(p => p.ref));
      if (!refs.has(ref)) out.push({ severity: 'warn', id: thing.id, level: lv.id, msg: `corner 0 hangs on ${ref}, which does not exist on this level or the ones next to it` });
    }
  }
  return out;
}

/**
 * `options.blueprints`: optional Map of blueprint id to its meta (from src/blueprints/load.js). Without it, the
 * blueprint rules of objects are skipped, so the card and a plain static server validate the same model.
 */
// validateModelCached(): the same, with the result kept per model object (and the blueprints and library it was checked
// with). For callers whose models are never changed once made: the edit operations (every edit makes a new model) and
// the Editor, so an operation and the page that shows its issues share one run, and selecting, undo and redo do not
// validate again (ui-consistency plan, UX4). Code that changes a model in place must call validateModel().
const memo = new WeakMap();
const NONE = {};
export function validateModelCached(model, geos, options = {}) {
  let byBp = memo.get(model);
  if (!byBp) memo.set(model, (byBp = new Map()));
  const bp = options.blueprints || NONE, lib = options.library || NONE;
  let byLib = byBp.get(bp);
  if (!byLib) byBp.set(bp, (byLib = new Map()));
  if (!byLib.has(lib)) byLib.set(lib, validateModel(model, geos, options));
  return byLib.get(lib);
}

/** Every issue, with the name of the thing it is about (issue #25): `name` on the issue, and "Name (id)" in its message. */
export function validateModel(model, geos, options = {}) {
  return withNames(validateAll(model, geos, options), model);
}

/** The names of the entities an issue points at. A thing without a name keeps its id alone; ids are matched as whole words. */
export function withNames(issues, model) {
  const names = new Map(), add = e => { if (e?.id && typeof e.name === 'string' && e.name.trim()) names.set(e.id, e.name.trim()); };
  for (const lv of model.levels || []) for (const c of ID_COLLECTIONS) (lv[c] || []).forEach(add);
  (model.checks || []).forEach(add);
  (model.anchors || []).forEach(add);
  if (!names.size) return issues;
  const ids = [...names.keys()].sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // an id already in brackets, as some messages write it ("Trapp" (st_main)), is left as it is
  const word = new RegExp(`(?<![\\w#(])(${ids.join('|')})(?![\\w#)])`, 'g');
  return issues.map(i => {
    const name = names.get(i.id);
    const msg = typeof i.msg === 'string' ? i.msg.replace(word, (id) => `${names.get(id)} (${id})`) : i.msg;
    return name ? { ...i, name, msg } : (msg === i.msg ? i : { ...i, msg });
  });
}

function validateAll(model, geos, { blueprints, library } = {}) {
  const out = [];
  if (model.units && model.units !== 'mm') out.push({ severity: 'error', id: 'model', msg: `units must be "mm" (got "${model.units}")` });
  checkIds(model, out);
  out.push(...checkMaterials(model, library), ...checkPalette(model), ...checkSite(model.site));
  for (const lv of model.levels) out.push(...validateLevel(lv, geos.get(lv.id), model.levels.some(l => l.id !== lv.id && l.elevation < lv.elevation && (l.building ?? null) === (lv.building ?? null)), model.checks, blueprints).map(x => ({ ...x, level: lv.id })));
  out.push(...validateLevels(model, geos), ...validateStairs(model, geos), ...checkAnchors(model, geos));
  const rooms = model.levels.flatMap(l => l.rooms || []);
  for (const c of model.checks || []) {
    const r = checkCheck(c, rooms);
    for (const m of r.errors) out.push({ severity: 'error', id: c.id, msg: m });
    for (const m of r.warnings) out.push({ severity: 'warn', id: c.id, msg: m });
  }
  return out;
}

/** Bindings (location.json) must reference existing fixtures, or doors (their sensor, PLANTERN.md §6.1). */
export function validateBindings(location, model) {
  // a link is for a lamp, a door's sensor, or a lit object (its light, LA4): the lit object's id is the id of its light
  const out = [], fx = new Set(model.levels.flatMap(l => [...(l.fixtures || []), ...(l.objects || [])].map(f => f.id)));
  // only an object that can give light (a blueprint, or one with a stored light) takes a link of its own
  const lit = new Set(model.levels.flatMap(l => (l.objects || []).filter(o => o.blueprint !== undefined || o.light !== undefined).map(o => o.id)));
  const isObject = new Set(model.levels.flatMap(l => (l.objects || []).map(o => o.id)));
  const openings = new Map(model.levels.flatMap(l => (l.openings || []).map(o => [o.id, o])));
  for (const [id, b] of Object.entries(location.bindings || {})) {
    const op = openings.get(id);
    if (op && op.type !== 'door') out.push({ severity: 'error', id, msg: 'only a door can be bound to a Home Assistant sensor' });
    else if (!op && !fx.has(id)) out.push({ severity: 'error', id, msg: 'binding references a fixture or door that does not exist in the model' });
    else if (isObject.has(id) && !lit.has(id)) out.push({ severity: 'error', id, msg: 'only a lit object (a library lamp) can be bound to a Home Assistant light' });
    for (const c of b.controls || []) if (!fx.has(c)) out.push({ severity: 'error', id, msg: `controls missing fixture "${c}"` });
    if (b.entity && !/^[a-z_]+\.[a-z0-9_]+$/.test(b.entity)) out.push({ severity: 'warn', id, msg: `"${b.entity}" does not look like an HA entity id` });
    for (const m of checkLook(b.look)) out.push({ severity: 'error', id, msg: m });
  }
  return out;
}

/** After the first state load: bound entities that HA does not know. */
export function validateEntities(location, ha) {
  return Object.entries(location.bindings || {})
    .filter(([, b]) => b.entity && !ha.getState(b.entity))
    .map(([id, b]) => ({ severity: 'warn', id, msg: `entity ${b.entity} not found in Home Assistant` }));
}
