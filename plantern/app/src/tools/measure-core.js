// Measuring in the plan (PLANTERN.md §8, measure tool). Pure: points and lines in, numbers out.
// Points come from collectSnapPoints(), lines ("planes" in plan: a wall face, a room edge, a face of a
// solid) from collectSnapLines(); the page only draws what these return.

import { sub, add, mul, dot, cross, len } from '../geometry/vec.js';

const PARALLEL = Math.sin(1 * Math.PI / 180);       // lines within 1° count as parallel
const unit = (a, b) => { const d = sub(b, a), l = len(d) || 1; return [d[0] / l, d[1] / l]; };

/**
 * Point to point: the distance and the right triangle it is the long side of, with its legs along the
 * plan axes (dx, dy). Corner = where the legs meet (x of b, y of a).
 */
export function pointToPoint(a, b) {
  const d = sub(b, a);
  return { kind: 'pp', a, b, dist: len(d), dx: Math.abs(d[0]), dy: Math.abs(d[1]), corner: [b[0], a[1]] };
}

/**
 * Point to plane: the perpendicular distance from p to the line through `line` (a → b), the foot of
 * the perpendicular, how far along the line the foot is from a, and whether it falls on the segment.
 */
export function pointToLine(p, line) {
  const u = unit(line.a, line.b), L = len(sub(line.b, line.a)), s = dot(sub(p, line.a), u);
  const foot = add(line.a, mul(u, s));
  return { kind: 'pl', p, line, foot, dist: Math.abs(cross(u, sub(p, line.a))), along: s, onSegment: s >= -0.5 && s <= L + 0.5 };
}

/**
 * Plane to plane. Parallel (within 1°): the distance between the two lines, measured where they
 * overlap (`at`: a pair of points across the gap) and the overlap length (0 when they do not face each
 * other). Not parallel: the angle between them and the distances from the second line's ends to the
 * first line (the gap opens or closes along it).
 */
export function lineToLine(l1, l2) {
  const u = unit(l1.a, l1.b), v = unit(l2.a, l2.b), sin = Math.abs(cross(u, v));
  const angle = Math.asin(Math.min(1, sin)) * 180 / Math.PI;
  const dA = pointToLine(l2.a, l1), dB = pointToLine(l2.b, l1);
  if (sin > PARALLEL) return { kind: 'll', parallel: false, angle, ends: [dA.dist, dB.dist], l1, l2 };
  // overlap of l2 projected onto l1
  const L1 = len(sub(l1.b, l1.a)), s0 = Math.max(0, Math.min(dA.along, dB.along)), s1 = Math.min(L1, Math.max(dA.along, dB.along));
  const overlap = Math.max(0, s1 - s0), mid = overlap > 0 ? (s0 + s1) / 2 : (dA.along + dB.along) / 2;
  const p = add(l1.a, mul(u, mid)), n = [-u[1], u[0]], side = Math.sign(cross(u, sub(l2.a, l1.a))) || 1;
  const dist = (dA.dist + dB.dist) / 2;
  return { kind: 'll', parallel: true, angle, dist, overlap, at: [p, add(p, mul(n, side * dist))], l1, l2 };
}

/**
 * A right triangle with long side `diagonal` (measured for real) and one leg known: the other leg,
 * or null when the leg is not shorter than the diagonal.
 */
export function otherLeg(diagonal, leg) {
  return diagonal > leg && leg >= 0 ? Math.sqrt(diagonal * diagonal - leg * leg) : null;
}

/** The nearest of `items` to p within `radius` (mm): points by distance, lines by distance to the segment. */
export function nearestPoint(p, points, radius) {
  let best = null, bd = radius;
  for (const s of points) { const d = len(sub(s.pos, p)); if (d <= bd && (d < bd - 1e-9 || !best || s.pri < best.pri)) { best = s; bd = d; } }
  return best;
}
export function nearestLine(p, lines, radius) {
  let best = null, bd = radius;
  for (const l of lines) {
    const r = pointToLine(p, l), L = len(sub(l.b, l.a));
    const d = r.along < 0 ? len(sub(p, l.a)) : r.along > L ? len(sub(p, l.b)) : r.dist;
    if (d < bd) { best = l; bd = d; }
  }
  return best;
}
