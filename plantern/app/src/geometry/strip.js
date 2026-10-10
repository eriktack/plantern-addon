// LED strips (PLANTERN.md §6.1, decision 121): a strip is a polyline, and its light is worked out from sample points along it.
// Pure helpers on [[x, y], …] in plan mm.

/** Length of a polyline. */
export const polylineLength = line => line.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0);

/** The point `d` mm along the polyline from its start (clamped to its ends). */
export function pointAlong(line, d) {
  let left = Math.max(0, d);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= L || i === line.length - 1) { const t = L ? Math.min(1, left / L) : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    left -= L;
  }
  return line[0];
}

/** The middle of a polyline, by length. */
export const polylineMid = line => pointAlong(line, polylineLength(line) / 2);

/**
 * Points along a strip where its light is worked out: both ends and evenly spaced between, about `step` mm apart,
 * at most `max` (a long strip gets fewer, wider-spaced samples, so its cost stays bounded).
 */
export function stripSamples(line, { step = 400, max = 12 } = {}) {
  const L = polylineLength(line);
  if (!(L > 0)) return [line[0]];
  const n = Math.min(max, Math.max(2, Math.round(L / step) + 1));
  return Array.from({ length: n }, (_, i) => pointAlong(line, L * i / (n - 1)));
}
