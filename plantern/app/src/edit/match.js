// Match a room's old outline to its new one by geometry, not by number (PLANTERN.md §7 Editing).
// Pure. Used by reconcile() to rewrite edge refs (`r_x#e3`) and corner refs (`r_x#p2`) when a room
// is re-measured from another corner, gets a corner more or less, or moves.

const DIR_TOL = Math.sin(15 * Math.PI / 180);   // edges whose directions differ more are never the same edge
const MAX_DIST = 2000;                           // mm: an edge that moved further is not matched (greedy fallback)

const edgesOf = poly => poly.map((p, i) => {
  const q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
  return { p, q, u: [dx / L, dy / L], L, mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] };
});
const sameDir = (a, b) => a.u[0] * b.u[0] + a.u[1] * b.u[1] > 0 && Math.abs(a.u[0] * b.u[1] - a.u[1] * b.u[0]) < DIR_TOL;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Old polygon → new polygon. Returns { edges, corners, shift } where `edges` and `corners` are Maps
 * old index → new index (missing = no counterpart). With the same number of corners, the cyclic
 * renumbering whose edges all keep their direction and move least wins (`shift` = how far the
 * numbering turned), so a rigid move or a new corner 0 keeps every ref. Otherwise edges are paired
 * greedily by direction and distance, and a corner maps when both of its edges map consistently.
 */
/**
 * The same outline moved and/or turned as a whole (same edge lengths and corner angles, in the same
 * order): then edge i is still edge i, whatever directions they now point in. Geometric matching would
 * lose walls when a room is turned (every direction changes).
 */
export function sameShape(oldPoly, newPoly, tol = 1) {
  const n = oldPoly.length;
  if (n !== newPoly.length || n < 3) return false;
  const len = (P, i) => { const a = P[i], b = P[(i + 1) % n]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
  const turn = (P, i) => {
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
  };
  for (let i = 0; i < n; i++) {
    if (Math.abs(len(oldPoly, i) - len(newPoly, i)) > tol) return false;
    if (Math.abs(turn(oldPoly, i) - turn(newPoly, i)) > 1e-3) return false;
  }
  return true;
}

/**
 * The rigid motion that took `oldPoly` to `newPoly` when the room was moved and/or turned as a whole
 * (same shape, same numbering, not just renumbered in place): { apply(p), deg }, else null.
 */
export function rigidMotion(oldPoly, newPoly) {
  const n = oldPoly.length;
  if (n !== newPoly?.length) return null;
  const inPlace = oldPoly.some((_, k) => oldPoly.every((p, i) => Math.hypot(p[0] - newPoly[(i + k) % n][0], p[1] - newPoly[(i + k) % n][1]) < 50));
  if (inPlace || !sameShape(oldPoly, newPoly)) return null;
  const ang = P => Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]);
  const r = ang(newPoly) - ang(oldPoly), c = Math.cos(r), s = Math.sin(r), o = oldPoly[0], q = newPoly[0];
  const r1 = v => Math.round(v * 10) / 10;
  return { deg: r * 180 / Math.PI, apply: p => [r1(q[0] + (p[0] - o[0]) * c - (p[1] - o[1]) * s), r1(q[1] + (p[0] - o[0]) * s + (p[1] - o[1]) * c)] };
}

export function matchOutline(oldPoly, newPoly) {
  // moved or turned as a whole (not the same outline renumbered in place, e.g. re-measured from
  // another corner): every edge and corner keeps its number
  if (rigidMotion(oldPoly, newPoly)) {
    const ids = new Map(oldPoly.map((_, i) => [i, i]));
    return { edges: ids, corners: new Map(ids), shift: 0 };
  }
  const A = edgesOf(oldPoly), B = edgesOf(newPoly), n = A.length, m = B.length;
  const edges = new Map(), corners = new Map();
  if (n === m) {
    let best = null;
    for (let k = 0; k < n; k++) {
      let cost = 0, ok = true;
      for (let i = 0; i < n && ok; i++) { const b = B[(i + k) % n]; ok = sameDir(A[i], b); cost += d2(A[i].mid, b.mid); }
      if (ok && (!best || cost < best.cost - 1e-6)) best = { k, cost };
    }
    if (best) {
      for (let i = 0; i < n; i++) { edges.set(i, (i + best.k) % n); corners.set(i, (i + best.k) % n); }
      return { edges, corners, shift: best.k };
    }
  }
  // corners added or removed: pair edges by direction, then by how far the new edge lies from the old line
  const cand = [];
  A.forEach((a, i) => B.forEach((b, j) => {
    if (!sameDir(a, b)) return;
    const off = Math.abs((b.mid[0] - a.p[0]) * -a.u[1] + (b.mid[1] - a.p[1]) * a.u[0]);
    const t0 = (b.p[0] - a.p[0]) * a.u[0] + (b.p[1] - a.p[1]) * a.u[1], t1 = (b.q[0] - a.p[0]) * a.u[0] + (b.q[1] - a.p[1]) * a.u[1];
    const apart = Math.max(0, Math.min(t0, t1) - a.L, -Math.max(t0, t1));      // gap along the line, 0 when they overlap
    const cost = off + apart;
    if (cost <= MAX_DIST) cand.push({ i, j, cost, overlap: Math.min(a.L, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)) });
  }));
  cand.sort((x, y) => x.cost - y.cost || y.overlap - x.overlap);
  const usedB = new Set();
  for (const c of cand) if (!edges.has(c.i) && !usedB.has(c.j)) { edges.set(c.i, c.j); usedB.add(c.j); }
  for (let i = 0; i < n; i++) {
    const out = edges.get(i), inn = edges.get((i + n - 1) % n);
    if (out !== undefined && inn !== undefined && (inn + 1) % m === out) corners.set(i, out);
  }
  return { edges, corners, shift: null };
}
