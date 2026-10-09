// The round pillar form in the Editor (roadmap 8b): a diameter, and where it stands measured like a
// ceiling lamp, from two walls of the room it is in (at right angles from each wall's face to the
// pillar's surface), or its middle typed as x, y. Pure: form strings ↔ capture { mode: 'circle', raw }.

import { circleFrom, roomEdge } from '../geometry/circle.js';

const r1 = v => Math.round(v * 10) / 10;

/** Form values { diameter, room, edgeA, distA, edgeB, distB, x, y } → { capture, errors }. */
export function roundCapture(form, level) {
  const errors = [], num = (name, t) => { const v = Number(String(t ?? '').trim() === '' ? NaN : t); if (!Number.isFinite(v)) errors.push(`${name}: a number of mm`); return v; };
  const diameter = num('diameter', form.diameter);
  if (Number.isFinite(diameter) && !(diameter > 0)) errors.push('diameter: more than 0 mm');
  if (form.room) {
    const from = [{ ref: `${form.room}#e${form.edgeA}`, distance: num('distance from the first wall', form.distA) }, { ref: `${form.room}#e${form.edgeB}`, distance: num('distance from the second wall', form.distB) }];
    if (from.some(f => f.distance < 0)) errors.push('distances: 0 or more mm');
    if (errors.length) return { capture: null, errors };
    const c = circleFrom(level, from, diameter);
    if (c.error) return { capture: null, errors: [c.error] };
    return { capture: { mode: 'circle', raw: { diameter, start: c.center, from } }, errors };
  }
  const start = [num('middle x', form.x), num('middle y', form.y)];
  return errors.length ? { capture: null, errors } : { capture: { mode: 'circle', raw: { diameter, start } }, errors };
}

/** A round capture → form values (strings); the room and walls it was measured from, else its middle. */
export function roundToForm(capture) {
  const raw = capture?.raw || {}, edge = ref => Number(/#e(\d+)$/.exec(ref || '')?.[1] ?? 0);
  const out = { diameter: raw.diameter ?? '', room: '', edgeA: 0, distA: '', edgeB: 1, distB: '', x: raw.start?.[0] ?? '', y: raw.start?.[1] ?? '' };
  if (Array.isArray(raw.from) && raw.from.length === 2) Object.assign(out, { room: raw.from[0].ref.split('#')[0], edgeA: edge(raw.from[0].ref), distA: raw.from[0].distance, edgeB: edge(raw.from[1].ref), distB: raw.from[1].distance });
  return out;
}

/** The distances a round pillar of `diameter` with its middle at `center` has from walls A and B of the form's room. */
export function roundMovedTo(form, level, center, diameter) {
  if (!form.room) return { ...form, x: r1(center[0]), y: r1(center[1]) };
  const dist = k => {
    const e = roomEdge(level, `${form.room}#e${k}`);
    if (!e) return '';
    const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), inward = [(e.b[1] - e.a[1]) / L, -(e.b[0] - e.a[0]) / L];
    return r1((center[0] - e.a[0]) * inward[0] + (center[1] - e.a[1]) * inward[1] - diameter / 2);
  };
  return { ...form, distA: dist(form.edgeA), distB: dist(form.edgeB) };
}

/** The first wall of `room` that is not parallel to wall k (for a second distance). */
export function crossWall(room, k) {
  const p = room.polygon, n = p.length, d = i => [p[(i + 1) % n][0] - p[i][0], p[(i + 1) % n][1] - p[i][1]];
  for (let j = 1; j < n; j++) { const i = (k + j) % n, a = d(k), b = d(i); if (Math.abs(a[0] * b[1] - a[1] * b[0]) > 1e-3 * Math.hypot(...a) * Math.hypot(...b)) return i; }
  return (k + 1) % n;
}
