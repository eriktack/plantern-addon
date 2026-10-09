import { add, sub, mul, cross } from './vec.js';
import { dedupe, dropCollinear } from './polygon.js';

/** Ray o + t·d against segment p–q; returns t ≥ 0 or null. */
function ray(o, d, p, q) {
  const e = sub(q, p), den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const w = sub(p, o), t = cross(w, e) / den, s = cross(w, d) / den;
  // t > ε: a light sitting exactly on an occluder (e.g. a wall lamp with gap 0) is not blocked by that occluder itself.
  return t > 1e-6 && s >= 0 && s <= 1 ? t : null;
}

/**
 * Visibility polygon of a point light with radius R against occluder segments.
 * Rays are cast at every nearby segment endpoint (±ε) plus a fixed fan for the circular rim.
 * Near-duplicate vertices are removed (they were the bulk of the prototype's output).
 */
export function visibility(c, R, segs, { fan = 72 } = {}) {
  const angs = [];
  for (const [p, q] of segs) for (const e of [p, q]) {
    const dx = e[0] - c[0], dy = e[1] - c[1];
    if (dx * dx + dy * dy < R * R * 1.2) { const a = Math.atan2(dy, dx); angs.push(a - 1e-4, a, a + 1e-4); }
  }
  for (let i = 0; i < fan; i++) angs.push((i / fan) * 2 * Math.PI - Math.PI);
  angs.sort((a, b) => a - b);
  const pts = angs.map(a => {
    const d = [Math.cos(a), Math.sin(a)];
    let t = R;
    for (const [p, q] of segs) { const r = ray(c, d, p, q); if (r !== null && r < t) t = r; }
    const v = add(c, mul(d, t));
    return [Math.round(v[0] * 10) / 10, Math.round(v[1] * 10) / 10];
  });
  return dropCollinear(dedupe(pts, 0.5));
}
