// Distances shown while a thing is dragged on the plan (ui-consistency plan, UX12; PLANTERN §8 "Use while editing").
// Pure, no DOM: the page draws the lines it returns.

const EPS = 1e-9;

/** Where the ray from p along unit vector d first meets one of the segments ([[ax, ay], [bx, by]]), within max mm: { t, at } or null. */
export function rayHit(p, d, segments, max = Infinity) {
  let best = null;
  for (const [a, b] of segments) {
    const e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < EPS) continue;                               // parallel
    const w = [a[0] - p[0], a[1] - p[1]];
    const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (t > 0.5 && t <= max && u >= -EPS && u <= 1 + EPS && (!best || t < best.t)) best = { t, at: [p[0] + d[0] * t, p[1] + d[1] * t] };
  }
  return best;
}

/** The edges of polygons as segments. */
export const edgesOf = polys => polys.flatMap(poly => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]));

/**
 * From a free thing (its footprint polygon, or a point for a lamp) to the nearest wall face east, west, north and south:
 * [{ from, to, distance }], each from the middle of the footprint's side that faces that way (the point itself for a lamp).
 * Only hits within `max` mm; the footprint's own edges are not walls, so pass only wall bodies in `segments`.
 */
export function clearances(shape, segments, { max = 6000 } = {}) {
  const pts = Array.isArray(shape[0]) ? shape : [shape];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const out = [];
  for (const [from, d] of [[[x1, cy], [1, 0]], [[x0, cy], [-1, 0]], [[cx, y1], [0, 1]], [[cx, y0], [0, -1]]]) {
    const h = rayHit(from, d, segments, max);
    if (h) out.push({ from, to: h.at, distance: Math.round(h.t) });
  }
  return out;
}

/** A thing from s0 to s1 mm along a wall of length L: its distances to the wall's two ends, [{ s0, s1, distance }] (none when 0). */
export function alongWallGaps(s0, s1, L) {
  return [[0, s0], [s1, L]].filter(([a, b]) => b - a >= 1).map(([a, b]) => ({ s0: a, s1: b, distance: Math.round(b - a) }));
}

/**
 * A length typed while drawing a wall (UX12): "1250", "1,25 m", "125 cm" → mm, or null. Only a plain amount with an
 * optional unit; nothing else is read.
 */
export function typedLength(text) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const v = Number(m[1].replace(',', '.')) * ({ mm: 1, cm: 10, m: 1000 }[(m[2] || 'mm').toLowerCase()]);
  return v > 0 ? Math.round(v * 10) / 10 : null;
}
