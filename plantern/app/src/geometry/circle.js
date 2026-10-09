// Round solids (PLANTERN.md §6.1, roadmap 8b): a pillar with a circle footprint. The circle is what
// was measured (its diameter, and where its middle is: typed, or worked out from two room walls);
// `polygon` stays the footprint every other piece of geometry uses (rooms it bounds, walls it cuts,
// light it stops), a 32-gon through the circle. Plans draw the true circle, 3D a smooth cylinder. Pure.

export const CIRCLE_SEGMENTS = 32;
const r1 = v => Math.round(v * 10) / 10;

/** The footprint of a circle: n corners on it, clockwise (like rooms and other solids), corner 0 due east. */
export function circlePolygon(center, diameter, n = CIRCLE_SEGMENTS) {
  const R = diameter / 2;
  return Array.from({ length: n }, (_, i) => { const a = -2 * Math.PI * i / n; return [r1(center[0] + R * Math.cos(a)), r1(center[1] + R * Math.sin(a))]; });
}

/** A solid's circle { center, diameter } when it is round (capture mode "circle"), else null. */
export function solidCircle(s) {
  const raw = s?.capture?.mode === 'circle' ? s.capture.raw : null;
  return raw && raw.diameter > 0 && Array.isArray(raw.start) ? { center: raw.start, diameter: raw.diameter } : null;
}

/** Edge `ref` ("r_x#e2") of a room on the level: { a, b } (the room on its right), or null. */
export function roomEdge(level, ref) {
  const m = /^(r_[^#]+)#e(\d+)$/.exec(ref || ''), room = m && (level.rooms || []).find(r => r.id === m[1]);
  if (!room?.polygon?.[+m[2]]) return null;
  return { a: room.polygon[+m[2]], b: room.polygon[(+m[2] + 1) % room.polygon.length] };
}

/**
 * The middle of a circle of `diameter` measured from two room walls: from = [{ ref: "r_x#e0", distance },
 * { ref, distance }], each the distance at right angles from that wall's face (into the room) to the
 * circle's surface. Returns { center } or { error }.
 */
export function circleFrom(level, from, diameter) {
  if (!Array.isArray(from) || from.length !== 2) return { error: 'measure it from two walls' };
  const lines = from.map(f => {
    const e = roomEdge(level, f.ref);
    if (!e) return null;
    const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), u = [(e.b[0] - e.a[0]) / L, (e.b[1] - e.a[1]) / L], inward = [u[1], -u[0]], d = Number(f.distance) + diameter / 2;
    return { p: [e.a[0] + inward[0] * d, e.a[1] + inward[1] * d], u };
  });
  if (lines.some(l => !l)) return { error: `wall ${from.find((f, i) => !lines[i]).ref} does not exist (any more)` };
  const [a, b] = lines, den = a.u[0] * b.u[1] - a.u[1] * b.u[0];
  if (Math.abs(den) < 1e-6) return { error: 'the two walls are parallel: measure from two walls at an angle' };
  const t = ((b.p[0] - a.p[0]) * b.u[1] - (b.p[1] - a.p[1]) * b.u[0]) / den;
  return { center: [r1(a.p[0] + a.u[0] * t), r1(a.p[1] + a.u[1] * t)] };
}
