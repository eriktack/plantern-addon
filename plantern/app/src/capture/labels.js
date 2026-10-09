// Names and plan labels for a room's walls. Pure (no DOM).
// Walls are named by letter in everything a person reads: wall A runs from corner 0 to corner 1,
// B from 1 to 2, …, Z, AA, AB, … Corners keep their numbers. The data keeps indices (`edge: 0`).

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function wallName(i) {
  let s = '', k = i + 1;
  while (k > 0) { const m = (k - 1) % 26; s = String.fromCharCode(65 + m) + s; k = Math.floor((k - 1) / 26); }
  return s;
}

/** "A" / "a" / "AA" / "0" → index, or null. Letters are wall names; plain numbers are indices. */
export function wallIndex(token) {
  const t = String(token ?? '').trim();
  if (/^\d+$/.test(t)) return +t;
  if (!/^[a-z]+$/i.test(t)) return null;
  return [...t.toUpperCase()].reduce((k, c) => k * 26 + (c.charCodeAt(0) - 64), 0) - 1;
}

/** "A, C" or "0 2" → { walls: [0, 2], errors }. */
export function parseWalls(text) {
  const walls = [], errors = [];
  for (const part of String(text ?? '').split(/[\s,;]+/).filter(Boolean)) {
    const i = wallIndex(part);
    if (i === null) errors.push(`"${part}" is not a wall (use its letter, e.g. A)`); else walls.push(i);
  }
  return { walls, errors };
}
export const wallsToText = list => (list || []).map(wallName).join(', ');

/** "wall A (0→1)" for a wall of an n-cornered room. */
export const wallLabel = (i, n) => `wall ${wallName(i)} (${i}→${(i + 1) % n})`;

/**
 * Where to write each wall's name and length on a plan: inside the room (walls run clockwise, so the
 * room is on the right of travel), a little off the wall, rotated along it and kept upright.
 * points: corners in plan mm; closed: the last corner joins corner 0; gap: how far inside (mm).
 * Returns [{ i, x, y, angle, name, length }] in plan mm; angle is in plan degrees (counter-clockwise),
 * between −90 and 90 so the text never reads upside down.
 */
export function wallLabels(points, { closed = true, gap = 150, minLength = 1 } = {}) {
  const n = points.length, out = [];
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const p = points[i], q = points[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
    if (L < minLength) continue;
    const u = [dx / L, dy / L], inside = [u[1], -u[0]];          // right of travel
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90) angle -= 180; else if (angle <= -90) angle += 180;
    out.push({ i, x: (p[0] + q[0]) / 2 + inside[0] * gap, y: (p[1] + q[1]) / 2 + inside[1] * gap, angle, name: wallName(i), length: L });
  }
  return out;
}

/**
 * SVG for those labels (plan y is flipped to SVG y here, the same flip as render2d/coords.js):
 * "A · 4000" on a dark outline so it stays readable over lines and hatching. skip: a wall number to leave out
 * (it is marked some other way).
 */
export function wallLabelsSvg(points, { closed = true, fs, fill = '#d9dde4', halo = '#14161a', lengths = true, skip = null } = {}) {
  return wallLabels(points, { closed, gap: fs * 1.1 }).filter(l => l.i !== skip).map(l => {
    const x = l.x, y = -l.y, rot = -l.angle;
    const text = lengths ? `${l.name} · ${Math.round(l.length)}` : l.name;
    return `<text x="${x}" y="${y}" transform="rotate(${rot.toFixed(2)} ${x} ${y})" fill="${fill}" font-size="${fs * 0.8}" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="${halo}" stroke-width="${fs * 0.35}" stroke-linejoin="round" pointer-events="none">${text}</text>`;
  }).join('');
}
