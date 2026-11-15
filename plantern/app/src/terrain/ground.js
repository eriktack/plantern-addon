// The yard's ground from measured spot heights (docs/plans/yard.md Y11): a surface through `yard.ground` points (mm in plan,
// heights in mm relative to the plan datum, the ground floor's finished floor = 0), with each retaining wall's step, and a
// coloured mesh of it for the 3D view: the yard's areas (lawn, paving, gravel …) draped on it. Pure.
//
//   yard.ground = [{ id: "yg_…", name?, pos: [x, y], z }]     z: mm above (−: below) the datum
//
// The surface is a triangulation (Delaunay) of the points: between points it is flat, and it honours every point exactly.
// Outside the points' hull it takes the inverse-distance mean of the nearest points. A retaining wall (yard.lines kind
// "retaining") adds its step: along the wall, the ground on its high side is the low side's plus `drop`. Heights near a
// retaining wall come from the points on the same side of it only, so the step stays sharp.
// Later, a fetched Lantmäteriet heightmap (docs/plans/terrain.md) can be laid under these points; the points win where
// they are.

const ID = /^yg_[a-z0-9_]+$/;

/** Problems with the ground points: messages. */
export function groundErrors(ground) {
  if (ground === undefined) return [];
  if (!Array.isArray(ground)) return ['yard.ground must be a list of { pos, z }'];
  const e = [], seen = new Set();
  ground.forEach((g, i) => {
    const at = g?.id ? `ground ${g.id}` : `ground point ${i + 1}`;
    if (!g || typeof g !== 'object') { e.push(`${at}: must be { pos, z }`); return; }
    if (g.id !== undefined && !ID.test(g.id)) e.push(`${at}: id must look like yg_…`);
    if (g.id && seen.has(g.id)) e.push(`${at}: id used twice`);
    seen.add(g.id);
    if (!(Array.isArray(g.pos) && g.pos.length === 2 && g.pos.every(Number.isFinite))) e.push(`${at}: pos must be [x, y] in mm`);
    if (!Number.isFinite(g.z)) e.push(`${at}: z must be mm above the datum`);
  });
  return e;
}

// ---- triangulation (Bowyer–Watson) -------------------------------------------------------------------------------
export function delaunay(pts) {
  const n = pts.length;
  if (n < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const d = Math.max(maxX - minX, maxY - minY) * 20 || 1, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const P = [...pts, [cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]];
  const circ = (a, b, c) => {
    const [ax, ay] = P[a], [bx, by] = P[b], [qx, qy] = P[c], D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
    if (Math.abs(D) < 1e-12) return { x: 0, y: 0, r2: Infinity };
    const ux = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / D;
    return { x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris = [{ v: [n, n + 1, n + 2], c: circ(n, n + 1, n + 2) }];
  for (let i = 0; i < n; i++) {
    const [px, py] = P[i], bad = [], keep = [];
    for (const t of tris) ((px - t.c.x) ** 2 + (py - t.c.y) ** 2 < t.c.r2 ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) for (const [a, b] of [[t.v[0], t.v[1]], [t.v[1], t.v[2]], [t.v[2], t.v[0]]]) {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(k, edges.has(k) ? null : [a, b]);
    }
    for (const e of edges.values()) if (e) keep.push({ v: [e[0], e[1], i], c: circ(e[0], e[1], i) });
    tris = keep;
  }
  return tris.filter(t => t.v.every(k => k < n)).map(t => t.v);
}

// ---- the surface ---------------------------------------------------------------------------------------------------
const side = (p, a, b) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t };
}

/**
 * The ground as a function of a plan point: { at(p) → z | null, points, walls }. `reach` (mm): how near a retaining wall a
 * point must be for the wall to split its neighbours by side.
 */
export function groundSurface(yard, { reach = 6000 } = {}) {
  const pts = (yard?.ground || []).filter(g => Array.isArray(g.pos) && Number.isFinite(g.z));
  if (!pts.length) return null;
  const walls = (yard.lines || []).filter(l => l.kind === 'retaining' && l.points?.length >= 2 && l.drop > 0);
  // which side of a wall a point is on: +1 its high side, −1 its low side, 0 not near it
  const wallSide = (w, p) => {
    let best = null;
    for (let i = 0; i + 1 < w.points.length; i++) { const s = segDist(p, w.points[i], w.points[i + 1]); if (!best || s.d < best.d) best = { ...s, i }; }
    if (!best || best.d > reach || best.t <= 0 || best.t >= 1) return 0;
    const sgn = Math.sign(side(p, w.points[best.i], w.points[best.i + 1]));       // + left of the line's direction
    return (w.high === 'left' ? sgn : -sgn) || 0;
  };
  const xy = pts.map(g => g.pos), tris = delaunay(xy);
  const bary = (p, [a, b, c]) => {
    const A = xy[a], B = xy[b], C = xy[c], D = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(D) < 1e-9) return null;
    const l1 = ((B[1] - C[1]) * (p[0] - C[0]) + (C[0] - B[0]) * (p[1] - C[1])) / D, l2 = ((C[1] - A[1]) * (p[0] - C[0]) + (A[0] - C[0]) * (p[1] - C[1])) / D;
    return [l1, l2, 1 - l1 - l2];
  };
  const idw = (p, cand) => {
    const near = cand.map(g => ({ g, d: Math.hypot(g.pos[0] - p[0], g.pos[1] - p[1]) })).sort((a, b) => a.d - b.d).slice(0, 4);
    if (!near.length) return null;
    if (near[0].d < 1) return near[0].g.z;
    let s = 0, w = 0; for (const { g, d } of near) { const k = 1 / (d * d); s += g.z * k; w += k; }
    return s / w;
  };
  const at = p => {
    // near a retaining wall: only the points on this side of it count (the step stays a step)
    for (const w of walls) {
      const s = wallSide(w, p);
      if (!s) continue;
      const same = pts.filter(g => wallSide(w, g.pos) === s);
      if (same.length) return idw(p, same);
    }
    for (const t of tris) {
      const l = bary(p, t);
      if (l && l.every(v => v >= -1e-9)) return l[0] * pts[t[0]].z + l[1] * pts[t[1]].z + l[2] * pts[t[2]].z;
    }
    return idw(p, pts);
  };
  return { at, points: pts, walls };
}

// ---- the mesh for 3D -----------------------------------------------------------------------------------------------
function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * A grid mesh of the ground over the yard's boundary: { positions: [x, y, z]… (plan mm), triangles: [i, j, k]…,
 * colors: [r, g, b]… (0–1, per vertex: the surface of the area it lies in, later areas over earlier) } or null.
 * `cell` (mm), `holes`: polygons where no ground is drawn (inside buildings), `colorOf(surface, area)` → '#rrggbb'.
 */
export function groundMesh(yard, { cell = 400, holes = [], colorOf = () => '#6f8f55', fallback = '#6f8f55' } = {}) {
  const surf = groundSurface(yard);
  const bound = yard?.boundary;
  if (!surf || !(bound?.length >= 3)) return null;
  const xs = bound.map(p => p[0]), ys = bound.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), nx = Math.ceil((Math.max(...xs) - x0) / cell), ny = Math.ceil((Math.max(...ys) - y0) / cell);
  const rgb = hex => { const v = parseInt(String(hex).slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
  const areas = yard.areas || [];
  const colourAt = p => { for (let k = areas.length - 1; k >= 0; k--) if (areas[k].polygon?.length >= 3 && inside(p, areas[k].polygon)) return colorOf(areas[k].surface, areas[k]); return fallback; };
  const index = new Map(), positions = [], colors = [], triangles = [];
  const vert = (i, j) => {
    const k = i * (ny + 1) + j;
    if (!index.has(k)) {
      const p = [x0 + i * cell, y0 + j * cell];
      index.set(k, positions.length);
      positions.push([p[0], p[1], surf.at(p)]);
      colors.push(rgb(colourAt(p)));
    }
    return index.get(k);
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const c = [x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell];
    if (!inside(c, bound) || holes.some(h => inside(c, h))) continue;
    const a = vert(i, j), b = vert(i + 1, j), d = vert(i + 1, j + 1), e = vert(i, j + 1);
    triangles.push([a, b, d], [a, d, e]);
  }
  return { positions, triangles, colors, at: surf.at };
}
