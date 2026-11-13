// What a device covers in the plan (docs/plans/devices.md DV6, DV13): a camera's view as a sector cut by walls, a pan-tilt
// camera's span, a reach circle cut by walls. Pure. Angles in plan headings (degrees anticlockwise from plan east, as walls);
// a device's compass bearing becomes one with headingFromBearing() (model/orientation.js).

import { ray, visibility } from './visibility.js';

const RAD = Math.PI / 180;

/**
 * A camera's view from c: the sector heading ± fov/2 out to range R, cut where a ray meets an occluder segment
 * (occluders() in level.js: walls, closed doors and windows; an open door lets the view through). Returns the polygon
 * [c, …rim], anticlockwise. Rays every `step` degrees, plus just either side of every segment end inside the sector.
 */
export function cameraCone(c, heading, fov, R, segs, { step = 1.5 } = {}) {
  const a0 = (heading - fov / 2) * RAD, a1 = (heading + fov / 2) * RAD, angs = [];
  const n = Math.max(2, Math.ceil(fov / step));
  for (let i = 0; i <= n; i++) angs.push(a0 + (a1 - a0) * i / n);
  for (const [p, q] of segs) for (const e of [p, q]) {
    const dx = e[0] - c[0], dy = e[1] - c[1];
    if (dx * dx + dy * dy > R * R * 1.2) continue;
    const a = a0 + wrap(Math.atan2(dy, dx) - a0);
    if (a > a0 && a < a1) angs.push(a - 1e-4, a, a + 1e-4);
  }
  angs.sort((x, y) => x - y);
  const rim = angs.map(a => {
    const d = [Math.cos(a), Math.sin(a)];
    let t = R;
    for (const [p, q] of segs) { const r = ray(c, d, p, q); if (r !== null && r < t) t = r; }
    return [round1(c[0] + d[0] * t), round1(c[1] + d[1] * t)];
  });
  return [[c[0], c[1]], ...rim];
}

/** The outline of a sector from heading `from` anticlockwise by `sweep` degrees, out to R, not cut by anything (a pan span). */
export function sectorOutline(c, from, sweep, R, { step = 3 } = {}) {
  const n = Math.max(2, Math.ceil(sweep / step)), out = [[c[0], c[1]]];
  for (let i = 0; i <= n; i++) { const a = (from + sweep * i / n) * RAD; out.push([round1(c[0] + Math.cos(a) * R), round1(c[1] + Math.sin(a) * R)]); }
  return out;
}

/**
 * A pan-tilt camera's span as headings: pan = [from, to] compass bearings, turning clockwise from the first to the second.
 * Returns { from, sweep } for sectorOutline() (anticlockwise from the second bearing's heading), given headingOf(bearing).
 */
export function panSpan(pan, headingOf) {
  const sweep = ((pan[1] - pan[0]) % 360 + 360) % 360 || 360;
  return { from: headingOf(pan[1]), sweep };
}

/** A reach circle of radius R from c, cut by occluders (a Bluetooth proxy). */
export const reachArea = (c, R, segs) => visibility(c, R, segs);

const wrap = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const round1 = v => Math.round(v * 10) / 10;
