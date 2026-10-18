import { sub, dot, len, TOL } from './vec.js';

/** Shoelace signed area. In plan view (y north) clockwise polygons are negative. */
export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export const isClockwise = poly => signedArea(poly) < 0;

/**
 * Penetration depth of two convex polygons (separating axis theorem).
 * Returns 0 when they are separated or only touching.
 */
export function convexPenetration(p, q) {
  let min = Infinity;
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length], poly[i]), l = len(e);
      if (l < 1e-9) continue;
      const ax = [-e[1] / l, e[0] / l];
      const pr = s => { let lo = Infinity, hi = -Infinity; for (const v of s) { const d = dot(v, ax); lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; };
      const [a0, a1] = pr(p), [b0, b1] = pr(q);
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return 0;
      min = Math.min(min, o);
    }
  }
  return min;
}

/** Remove consecutive (and wrap-around) vertices closer than `tol`. */
export function dedupe(poly, tol = TOL) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > tol) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= tol) out.pop();
  return out;
}

/**
 * Drop vertices where the outline does not change direction (sin of the turn < `sinTol`).
 * Uses the turn angle rather than distance-to-chord so corners are never eroded step by step.
 */
export function dropCollinear(poly, sinTol = 1e-3) {
  if (poly.length < 4) return poly;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = out.length ? out[out.length - 1] : poly[poly.length - 1], b = poly[i], c = poly[(i + 1) % poly.length];
    const ab = sub(b, a), bc = sub(c, b), lab = len(ab), lbc = len(bc);
    if (lab < 1e-9 || lbc < 1e-9) continue;
    const sin = (ab[0] * bc[1] - ab[1] * bc[0]) / (lab * lbc);
    if (Math.abs(sin) < sinTol && dot(ab, bc) > 0) continue;
    out.push(b);
  }
  return out;
}

/** Distance from point `p` to segment a–b. */
export function distToSegment(p, a, b) {
  const ab = sub(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
}

/** Distance from `p` to the polygon outline. */
export const distToOutline = (p, poly) => Math.min(...poly.map((a, i) => distToSegment(p, a, poly[(i + 1) % poly.length])));

/** Ray-casting point-in-polygon (points exactly on the outline may go either way; use distToOutline for margins). */
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// PF2: the box of a polygon, worked out once per polygon (the arrays of a model and of its derived geometry are not changed once made, so the
// array itself is the key). Every overlap test of a room, a wall piece or a solid against the others asks for the same few boxes.
const BOXES = new WeakMap();
/** [minX, minY, maxX, maxY] of a polygon (an array of [x, y]); the same array is returned for the same polygon. */
export function polygonBounds(poly) {
  let b = BOXES.get(poly);
  if (!b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    b = [x0, y0, x1, y1];
    BOXES.set(poly, b);
  }
  return b;
}

/**
 * Do two simple polygons share floor area? Touching edges and overlaps thinner than `tol` mm do not
 * count. Samples the outline of each polygon (every ~50 mm, plus points nudged just inside, which
 * catches identical or nested outlines) and asks whether any lies more than `tol` inside the other.
 */
export function polygonsOverlap(a, b, tol = 5) {
  // PF1: a cheap rejection first. A point more than tol inside B lies more than tol inside B's box, so when the boxes meet by tol or
  // less on either axis no point can be inside both by more than tol: the answer is no, without sampling the outlines.
  if (a.length && b.length) {
    const [ax0, ay0, ax1, ay1] = polygonBounds(a), [bx0, by0, bx1, by1] = polygonBounds(b);
    if (Math.min(ax1, bx1) - Math.max(ax0, bx0) <= tol || Math.min(ay1, by1) - Math.max(ay0, by0) <= tol) return false;
  }
  const strictlyInside = (p, poly) => pointInPolygon(p, poly) && distToOutline(p, poly) > tol;
  const probe = (A, B) => {
    const cw = signedArea(A) < 0;
    for (let i = 0; i < A.length; i++) {
      const p = A[i], q = A[(i + 1) % A.length], d = sub(q, p), L = len(d);
      if (L < 1e-9) continue;
      const u = [d[0] / L, d[1] / L], inward = cw ? [u[1], -u[0]] : [-u[1], u[0]], k = Math.max(2, Math.ceil(L / 50));
      for (let s = 0; s <= k; s++) {
        const pt = [p[0] + d[0] * s / k, p[1] + d[1] * s / k];
        if (strictlyInside(pt, B)) return true;
        const nudged = [pt[0] + inward[0] * (tol + 1), pt[1] + inward[1] * (tol + 1)];
        if (pointInPolygon(nudged, A) && strictlyInside(nudged, B)) return true;       // still inside A (thin pieces are skipped)
      }
    }
    return false;
  };
  return probe(a, b) || probe(b, a);
}

/**
 * Where to put a room's name: the point inside the polygon farthest from its outline (a coarse
 * grid, refined around the best spot), so an L-shaped room gets its name in the middle of the
 * larger part, not in a notch. Returns { pos, radius } (radius = distance to the outline).
 */
export function labelPoint(poly) {
  // PF6: a grid search per call, and the same room is asked for again on every draw: the answer is kept per polygon array (a model's rooms are
  // never changed once made, so the array is the key; a copy of the polygon is a new key). The same object is returned: read it, do not change it.
  let r = LABELS.get(poly);
  if (!r) LABELS.set(poly, (r = computeLabelPoint(poly)));
  return r;
}
const LABELS = new WeakMap();

function computeLabelPoint(poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const mid = [(x0 + x1) / 2, (y0 + y1) / 2];
  let best = { pos: mid, radius: -1, score: -Infinity };
  for (let round = 0; round < 4; round++) {
    const N = 24, dx = (x1 - x0) / N, dy = (y1 - y0) / N;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const p = [x0 + i * dx, y0 + j * dy];
      if (!pointInPolygon(p, poly)) continue;
      const r = distToOutline(p, poly), score = r - 1e-3 * Math.hypot(p[0] - mid[0], p[1] - mid[1]);   // ties go to the middle
      if (score > best.score) best = { pos: p, radius: r, score };
    }
    [x0, x1, y0, y1] = [best.pos[0] - 2 * dx, best.pos[0] + 2 * dx, best.pos[1] - 2 * dy, best.pos[1] + 2 * dy];
  }
  return { pos: best.pos.map(v => Math.round(v)), radius: Math.max(0, best.radius) };
}

/**
 * A room name laid out to fit: one line, or two when that allows a bigger font. size in mm,
 * capped at maxSize; long names in small rooms get smaller text, never below minSize.
 * `avoid`: what the text must not cover, each a point (a ceiling lamp, placed in the middle of the
 * room by default; the lamp symbol's size is kept clear around it) or a polygon (furniture, a
 * chimney, stairs). The name then moves to the nearest free place inside the room, up or down
 * first (below before above), then sideways; if there is none it gets smaller, and if it still
 * does not fit anywhere it stays in the middle.
 */
export function roomNameLayout(poly, name, { maxSize = 240, minSize = 60, avoid = [] } = {}) {
  const lay = roomNameFit(poly, name, maxSize, minSize);
  const points = avoid.filter(a => typeof a?.[0] === 'number'), boxes = avoid.filter(a => Array.isArray(a?.[0])).map(bbox);
  const box = (pos, size) => {
    const halfW = Math.max(...lay.lines.map(l => l.length)) * 0.56 * size / 2, halfH = lay.lines.length * 1.25 * size / 2;
    return { x0: pos[0] - halfW, x1: pos[0] + halfW, y0: pos[1] - halfH, y1: pos[1] + halfH };
  };
  const free = (pos, size) => {
    const t = box(pos, size), clear = size * 0.9;                 // room for the lamp symbol itself
    if (points.some(p => p[0] > t.x0 - clear && p[0] < t.x1 + clear && p[1] > t.y0 - clear && p[1] < t.y1 + clear)) return false;
    return !boxes.some(o => o.x0 < t.x1 && o.x1 > t.x0 && o.y0 < t.y1 && o.y1 > t.y0);
  };
  const inside = (pos, size) => { const t = box(pos, size); return [[t.x0, t.y0], [t.x1, t.y0], [t.x1, t.y1], [t.x0, t.y1]].every(c => pointInPolygon(c, poly)); };
  if (free(lay.pos, lay.size)) return lay;
  const rb = bbox(poly);
  for (const size of [lay.size, lay.size * 0.8, lay.size * 0.65].filter(v => v >= minSize - 1e-9)) {
    // candidates around the middle, nearest first; vertical moves cost less than sideways ones, below before above
    const step = Math.max(size * 0.25, 1), cands = [];
    for (let dy = Math.floor((rb.y0 - lay.pos[1]) / step); dy * step <= rb.y1 - lay.pos[1]; dy++)
      for (let dx = Math.floor((rb.x0 - lay.pos[0]) / step); dx * step <= rb.x1 - lay.pos[0]; dx++)
        cands.push({ pos: [lay.pos[0] + dx * step, lay.pos[1] + dy * step], cost: Math.abs(dy) + 2 * Math.abs(dx) + (dy > 0 ? 0.5 : 0) });
    cands.sort((a, b) => a.cost - b.cost);
    const hit = cands.find(c => free(c.pos, size) && inside(c.pos, size));
    if (hit) return { ...lay, pos: hit.pos.map(v => Math.round(v)), size };
  }
  return lay;
}

const bbox = pts => ({ x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) });

function roomNameFit(poly, name, maxSize, minSize) {
  const { pos, radius } = labelPoint(poly), w = 2 * radius * 1.5, h = 2 * radius * 1.2, cw = 0.56;   // rough text metrics
  const fit = lines => Math.min(maxSize, w / (Math.max(...lines.map(l => l.length)) * cw), h / (lines.length * 1.25));
  const one = [String(name)];
  const words = String(name).split(' ');
  let two = null;
  if (words.length > 1) {
    let k = 1, bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) { const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < bestDiff) { bestDiff = d; k = i; } }
    two = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
  }
  const lines = two && fit(two) > fit(one) * 1.15 ? two : one;
  return { pos, lines, size: Math.max(minSize, fit(lines)) };
}

/** True when the polygon is convex (every turn goes the same way; collinear corners allowed). */
export function isConvex(poly) {
  const n = poly.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], c = poly[(i + 2) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/**
 * A simple polygon cut into triangles (ear clipping), so that each part is convex and the parts do not overlap. Used to
 * cut a stair's opening to an L-shaped room (fixes the cellar stair's opening vanishing in farstu, BBV28).
 */
export function triangulate(poly) {
  const ccw = signedArea(poly) >= 0 ? poly.slice() : poly.slice().reverse();
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inTri = (p, a, b, c) => { const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p); return d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9; };
  const idx = ccw.map((_, i) => i), tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = ccw[i0], b = ccw[i1], c = ccw[i2];
      if (cross(a, b, c) <= 1e-9) continue;                       // a reflex or flat corner is no ear
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inTri(ccw[j], a, b, c))) continue;
      tris.push([a, b, c]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push(idx.map(i => ccw[i]));
  return tris;
}
