// Walls painted per room (PLANTERN.md §6.2, `walls[].roomSides`): a wall side running along several
// rooms (a facade, a long inner wall) can look different in each. Pure.
//
// roomSides: { <roomId>: { color } | { material } } applies to every stretch of the wall's faces that
// runs along that room's edge (the room beyond that face); the rest keeps sides.left / sides.right.
// Renderers do not split walls themselves: wallLookPieces() hands them the wall's pieces cut where
// the look changes, each with the side specs to use, for the plan's strips and the 3D faces alike.

import { sub, dot, cross } from './vec.js';
import { clipConvex, quadOrder } from './solids.js';

const TOL = 5, SIN = Math.sin(1 * Math.PI / 180);

/**
 * Where each face of wall `w` (frame `f`) runs along a room's edge, with the room beyond that face:
 * [{ room, side: 'left' | 'right', s0, s1 }], s in mm along the wall from `a`.
 */
export function wallFaceRooms(w, f, rooms = []) {
  const out = [];
  for (const r of rooms) {
    const poly = r.polygon;
    if (!(poly?.length >= 3)) continue;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], d = sub(q, p), L = Math.hypot(d[0], d[1]);
      if (L < 1e-9 || Math.abs(cross(f.u, d)) / L > SIN) return;
      const inward = [d[1] / L, -d[0] / L];                       // rooms are clockwise: the room is on the right of its edges
      const side = dot(inward, f.n) > 0.99 ? 'left' : dot(inward, f.n) < -0.99 ? 'right' : null;
      if (!side) return;
      const t = side === 'left' ? f.offL : -f.offR, tp = dot(sub(p, w.a), f.n), tq = dot(sub(q, w.a), f.n);
      if (Math.abs(tp - t) > TOL || Math.abs(tq - t) > TOL) return;   // not on this face's line
      const s0 = Math.min(dot(sub(p, w.a), f.u), dot(sub(q, w.a), f.u)), s1 = Math.max(dot(sub(p, w.a), f.u), dot(sub(q, w.a), f.u));
      const lo = Math.max(s0, -Math.max(f.offL, f.offR) - 1), hi = Math.min(s1, f.L + Math.max(f.offL, f.offR) + 1);
      // it must run along the room within its own length; the stretch may reach into its mitred corners
      if (hi - lo > 1 && Math.min(hi, f.L) - Math.max(lo, 0) > 1) out.push({ room: r.id, side, s0: lo, s1: hi });
    });
  }
  return out;
}

/**
 * The wall's pieces split where its look changes along it, each with the side specs to use:
 * [{ poly, left, right }] (left / right = { color } | { material } | undefined, as in sides.left).
 * Without roomSides the pieces come back unchanged with sides.left / sides.right.
 */
export function wallLookPieces(w, f, pieces, rooms = []) {
  const base = { left: w.sides?.left, right: w.sides?.right };
  const st = w.roomSides && Object.keys(w.roomSides).length ? wallFaceRooms(w, f, rooms).filter(x => w.roomSides[x.room]) : [];
  if (!st.length) return pieces.map(poly => ({ poly, ...base }));
  const loc = p => { const d = sub(p, w.a); return [dot(d, f.u), dot(d, f.n)]; };
  const world = ([s, t]) => [w.a[0] + f.u[0] * s + f.n[0] * t, w.a[1] + f.u[1] * s + f.n[1] * t];
  const cuts = [...new Set(st.flatMap(x => [x.s0, x.s1]))].sort((a, b) => a - b);
  const lookAt = (side, s) => { const x = st.find(y => y.side === side && s >= y.s0 - 0.5 && s <= y.s1 + 0.5); return x ? w.roomSides[x.room] : base[side]; };
  const out = [];
  for (const pc of pieces) {
    let parts = [pc.map(loc)];
    for (const c of cuts) parts = parts.flatMap(P => [clipConvex(P, p => c - p[0]), clipConvex(P, p => p[0] - c)]).filter(P => P.length >= 3 && Math.max(...P.map(p => p[0])) - Math.min(...P.map(p => p[0])) > 0.5);
    for (const P of parts) {
      const s = (Math.min(...P.map(p => p[0])) + Math.max(...P.map(p => p[0]))) / 2;
      out.push({ poly: quadOrder(P).map(world), left: lookAt('left', s), right: lookAt('right', s) });
    }
  }
  return out;
}
