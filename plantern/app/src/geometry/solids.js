// Solids (chimney, pillar, boxed-in pipe) bounding rooms (PLANTERN.md §4): a room edge that runs
// along a solid's face is covered by it, like by a wall face. One solid can bound several rooms, each
// along its own face or side by side along one face. Pure.
//
// A face only counts when the solid lies beyond the edge (on its left: rooms run clockwise, interior
// on the right). A chimney standing inside a room against its wall has a face on the room's outline
// too, but on the room side: the wall behind it is still needed. A stretch of edge running through a
// solid (inside its footprint, off its outline) is covered too: a wall there would stand in the solid.

import { sub, dot, cross } from './vec.js';
import { signedArea, pointInPolygon, distToSegment } from './polygon.js';

export const SOLID_FACE_TOL = 5;                          // mm a face may be off the edge's line

/** A solid that does not stand on the floor (a beam, a lintel): it neither bounds rooms nor cuts walls. */
export const raised = s => (s.base ?? 0) > 0;
/** Top of a solid above the level's floor: base + height, or the ceiling when no height is given. */
export const solidTop = (s, level) => (s.height !== undefined ? (s.base ?? 0) + s.height : level?.ceilingHeight ?? 2400);
const SIN_ANGLE = Math.sin(1 * Math.PI / 180);            // and degrees off parallel

/** Area centroid of a polygon (vertex mean when degenerate). */
function centroid(poly) {
  const A = signedArea(poly);
  if (Math.abs(A) < 1e-6) return poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
  let cx = 0, cy = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], k = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k; });
  return [cx / (6 * A), cy / (6 * A)];
}

/** Where the line a + t·e (unit e) crosses the segment p → q: t, or null when it does not. */
function crossAt(a, e, p, q) {
  const f = sub(q, p), den = cross(e, f);
  if (Math.abs(den) < 1e-9) return null;
  const w = sub(p, a), t = cross(w, f) / den, u = cross(w, e) / den;
  return u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

/** Stretches [t0, t1] of the segment p + t·e (0..L) inside polygon `poly`, off its outline. */
function throughSolid(p, e, L, poly) {
  const ts = [0, L];
  poly.forEach((a, k) => { const t = crossAt(p, e, a, poly[(k + 1) % poly.length]); if (t !== null && t > 0 && t < L) ts.push(t); });
  ts.sort((x, y) => x - y);
  const out = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const t0 = ts[k], t1 = ts[k + 1], m = [p[0] + e[0] * (t0 + t1) / 2, p[1] + e[1] * (t0 + t1) / 2];
    if (t1 - t0 > 1 && pointInPolygon(m, poly) && poly.every((a, j) => distToSegment(m, a, poly[(j + 1) % poly.length]) > SOLID_FACE_TOL)) out.push([t0, t1]);
  }
  return mergeIntervals(out);
}

/** Merge overlapping or touching intervals. */
export function mergeIntervals(iv) {
  const out = [];
  for (const [lo, hi] of [...iv].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + 1e-6) last[1] = Math.max(last[1], hi); else out.push([lo, hi]);
  }
  return out;
}

/** [lo, hi] minus the intervals in `cut` (sorted, merged): the pieces left, longer than `min`. */
export function subtractIntervals(lo, hi, cut, min = 1) {
  const out = []; let at = lo;
  for (const [a, b] of cut) {
    if (b <= at || a >= hi) continue;
    if (a > at) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (hi > at) out.push([at, hi]);
  return out.filter(([a, b]) => b - a > min);
}

/**
 * Stretches [t0, t1] (mm from p, merged) of the room edge p→q that lie along a face of a solid
 * beyond it. Each entry also names the solids: { iv: [[t0, t1]…], by: [[t0, t1, solidId]…] }.
 */
export function solidCoverDetail(p, q, solids = [], { through = true } = {}) {
  const d = sub(q, p), L = Math.hypot(d[0], d[1]), by = [];
  if (L < 1e-9) return { iv: [], by };
  const e = [d[0] / L, d[1] / L];
  for (const s of solids) {
    const poly = s.polygon;
    if (!(poly?.length >= 3) || raised(s)) continue;               // a beam overhead bounds nothing
    // a stretch of the edge running through the solid (the room measured a few mm into a chimney, or
    // under it): the solid is there, not a wall
    if (through) for (const [t0, t1] of throughSolid(p, e, L, poly)) by.push([t0, t1, s.id]);
    if (cross(e, sub(centroid(poly), p)) <= 0) continue;          // the solid is not beyond this edge
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length], f = sub(b, a), fl = Math.hypot(f[0], f[1]);
      if (fl < 1e-9 || Math.abs(cross(e, f)) / fl > SIN_ANGLE) return;
      if (Math.abs(cross(e, sub(a, p))) > SOLID_FACE_TOL || Math.abs(cross(e, sub(b, p))) > SOLID_FACE_TOL) return;
      const t0 = dot(sub(a, p), e), t1 = dot(sub(b, p), e);
      const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(L, Math.max(t0, t1));
      if (hi - lo > 1e-6) by.push([lo, hi, s.id]);
    });
  }
  return { iv: mergeIntervals(by.map(([a, b]) => [a, b])), by };
}

/** Stretches [t0, t1] of the room edge p→q covered by solids (see solidCoverDetail). */
export const solidCover = (p, q, solids, opts) => solidCoverDetail(p, q, solids, opts).iv;

/**
 * Where a solid borders each room: the stretches of its faces the room sees, for painting the solid
 * per room (`solids[].sides[roomId]`). [{ room, a, b, out, inside? }]: `out` is the unit normal
 * pointing from the solid into the room.
 *  - beyond the room (a chimney behind the wall line): the stretches along the room's edges; two rooms
 *    side by side along one face give two stretches, split where the rooms meet;
 *  - inside the room, wholly or partly (a bump in a corner, a pillar, a chimney reaching into a room
 *    measured as a plain rectangle; `inside: true`): the parts of its faces inside the room with the
 *    room in front of them, not the parts on the room's outline (those are against a wall).
 */
export function solidStretches(solid, rooms = []) {
  const out = [];
  for (const r of rooms) {
    const poly = r.polygon;
    if (!(poly?.length >= 3)) continue;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], d = sub(q, p), L = Math.hypot(d[0], d[1]);
      if (L < 1e-9) return;
      const e = [d[0] / L, d[1] / L];
      for (const [t0, t1] of solidCover(p, q, [solid], { through: false })) {          // its real sides only, not edges through it
        out.push({ room: r.id, a: [p[0] + e[0] * t0, p[1] + e[1] * t0], b: [p[0] + e[0] * t1, p[1] + e[1] * t1], out: [e[1], -e[0]] });   // rooms are clockwise: interior on the right
      }
    });
  }
  // standing inside a room, wholly or partly (a chimney reaching into a room measured as a plain
  // rectangle, a bump in a corner): the parts of its faces inside the room, off the room's outline
  const sp = solid.polygon;
  if (sp?.length >= 3) {
    const ccw = signedArea(sp) > 0;
    for (const r of rooms) {
      const poly = r.polygon;
      if (!(poly?.length >= 3)) continue;
      const offOutline = m => poly.every((p, k) => distToSegment(m, p, poly[(k + 1) % poly.length]) > SOLID_FACE_TOL);
      sp.forEach((a, i) => {
        const b = sp[(i + 1) % sp.length], d = sub(b, a), L = Math.hypot(d[0], d[1]);
        if (L < 1e-9) return;
        const e = [d[0] / L, d[1] / L], n = (ccw ? [e[1], -e[0]] : [-e[1], e[0]]).map(v => v + 0);   // outward: away from the solid (+0: no -0)
        // where the face crosses the room's outline, then which pieces lie inside the room with the room in front
        const ts = [0, L];
        poly.forEach((p, k) => { const t = crossAt(a, e, p, poly[(k + 1) % poly.length]); if (t !== null && t > 0 && t < L) ts.push(t); });
        ts.sort((x, y) => x - y);
        const keep = [];
        for (let k = 0; k + 1 < ts.length; k++) {
          const t0 = ts[k], t1 = ts[k + 1];
          if (t1 - t0 < 1) continue;
          const m = [a[0] + e[0] * (t0 + t1) / 2, a[1] + e[1] * (t0 + t1) / 2], front = [m[0] + n[0] * 2 * SOLID_FACE_TOL, m[1] + n[1] * 2 * SOLID_FACE_TOL];
          if (pointInPolygon(m, poly) && offOutline(m) && pointInPolygon(front, poly)) keep.push([t0, t1]);
        }
        for (const [t0, t1] of mergeIntervals(keep)) out.push({ room: r.id, a: [a[0] + e[0] * t0, a[1] + e[1] * t0], b: [a[0] + e[0] * t1, a[1] + e[1] * t1], out: n, inside: true });
      });
    }
  }
  return out;
}

/** The plan strip for one painted stretch (solidStretches): `depth` mm into the solid from its face. */
export function paintStrip(st, depth = 40) {
  const d = [-st.out[0] * depth, -st.out[1] * depth];
  return [st.a, st.b, [st.b[0] + d[0], st.b[1] + d[1]], [st.a[0] + d[0], st.a[1] + d[1]]];
}

/**
 * Walls give way to solids (`solids[].cutsWalls`): a chimney or a reinforcement post standing in a
 * wall cuts the wall's pieces where it stands, so rooms can be measured as the rectangles they would
 * be without it. Works in the wall's own frame (s along it from `a`, t across it, left face positive):
 * the solid's extent there (its bounding box in that frame, exact for a solid square to the wall) is
 * taken out of each piece by clipping with half-planes, so pieces stay convex. Where it covers the
 * whole thickness the piece ends at the solid; where it covers part, a thinner strip stays beside it.
 * Four-cornered results keep the order [left s0, left s1, right s1, right s0]; a piece cut inside a
 * mitred end can have three or five corners (sideStrips() then draws no colour strip on it).
 */
export function cutWallPieces(w, f, pieces, solids = []) {
  const cutters = solids.filter(s => s.cutsWalls && s.polygon?.length >= 3 && !raised(s));   // a beam overhead cuts no wall
  if (!cutters.length || !pieces.length) return pieces;
  const loc = p => { const d = sub(p, w.a); return [dot(d, f.u), dot(d, f.n)]; };
  const world = ([s, t]) => [w.a[0] + f.u[0] * s + f.n[0] * t, w.a[1] + f.u[1] * s + f.n[1] * t];
  let polys = pieces.map(pc => pc.map(loc));
  for (const sol of cutters) {
    const box = sol.polygon.map(loc), S0 = Math.min(...box.map(p => p[0])), S1 = Math.max(...box.map(p => p[0]));
    const T0 = Math.min(...box.map(p => p[1])), T1 = Math.max(...box.map(p => p[1]));
    const next = [];
    for (const P of polys) {
      const ss = P.map(p => p[0]), ts = P.map(p => p[1]);
      if (S1 <= Math.min(...ss) + 0.5 || S0 >= Math.max(...ss) - 0.5 || T1 <= Math.min(...ts) + 0.5 || T0 >= Math.max(...ts) - 0.5) { next.push(P); continue; }
      const mid = clipConvex(clipConvex(P, p => p[0] - S0), p => S1 - p[0]);
      next.push(clipConvex(P, p => S0 - p[0]), clipConvex(P, p => p[0] - S1), clipConvex(mid, p => p[1] - T1), clipConvex(mid, p => T0 - p[1]));
    }
    polys = next.filter(P => P.length >= 3 && Math.abs(area(P)) > 1);
  }
  return polys.map(P => quadOrder(P).map(world));
}

/** Sutherland–Hodgman: the part of a convex polygon where inside(p) >= 0. */
export function clipConvex(P, inside) {
  const out = [];
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length], a = inside(p), b = inside(q);
    if (a >= 0) out.push(p);
    if ((a >= 0) !== (b >= 0)) { const k = a / (a - b); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  });
  // drop points that came out (nearly) the same
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return out.length < 2 || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
}
const area = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
/** Four corners (local s, t) in the wall pieces' order: the edge along the left (higher t) face first, running +s. */
export function quadOrder(P) {
  if (P.length !== 4) return P;
  let best = 0, bt = -Infinity;
  P.forEach((p, i) => { const q = P[(i + 1) % 4]; if (q[0] > p[0] && (p[1] + q[1]) / 2 > bt) { bt = (p[1] + q[1]) / 2; best = i; } });
  return [...P.slice(best), ...P.slice(0, best)];
}
