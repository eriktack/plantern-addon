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

// ---- Wi-Fi: an estimate of the signal (DV7) ----

/** Do segments p1–p2 and q1–q2 cross (touching ends do not count)? */
function crosses(p1, p2, q1, q2) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1), d2 = d(q1, q2, p2), d3 = d(p1, p2, q1), d4 = d(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * The estimated signal (dBm) of the strongest access point at each cell of a grid: log-distance path loss,
 * at1m − 10·exponent·log10(d / 1 m), less a loss for every wall crossed on the straight line to the cell and a floor's loss
 * per level between (`floors`). aps = [{ pos: [x, y], z, floors }]; walls = [{ a, b, loss }] (the level's own walls);
 * band = { at1m, exponent, floor }; bounds = { minx, miny, maxx, maxy } mm; cell mm. Heights count in the distance.
 * Returns { x0, y0, cell, cols, rows, dbm: Float32Array (row-major from the south-west, -Infinity with no access point) }.
 */
export function wifiGrid({ aps, walls, band, bounds, cell = 600, z = 1000 }) {
  const cols = Math.max(1, Math.ceil((bounds.maxx - bounds.minx) / cell)), rows = Math.max(1, Math.ceil((bounds.maxy - bounds.miny) / cell));
  const dbm = new Float32Array(cols * rows).fill(-Infinity);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const p = [bounds.minx + (c + 0.5) * cell, bounds.miny + (r + 0.5) * cell];
    let best = -Infinity;
    for (const ap of aps) {
      const d = Math.max(500, Math.hypot(p[0] - ap.pos[0], p[1] - ap.pos[1], (ap.z ?? 2400) - z)) / 1000;
      let s = band.at1m - 10 * band.exponent * Math.log10(d) - (ap.floors || 0) * band.floor;
      if (s <= best) continue;                                       // walls only lower it: no need to count them
      for (const w of walls) if (crosses(ap.pos, p, w.a, w.b)) { s -= w.loss; if (s <= best) break; }
      if (s > best) best = s;
    }
    dbm[r * cols + c] = best;
  }
  return { x0: bounds.minx, y0: bounds.miny, cell, cols, rows, dbm };
}

/** 3 good, 2 fair, 1 weak, 0 none, from limits { good, fair, weak } in dBm. */
export const wifiStep = (dbm, { good, fair, weak }) => (dbm >= good ? 3 : dbm >= fair ? 2 : dbm >= weak ? 1 : 0);
