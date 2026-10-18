// The main colour of a built blueprint (PF14): the colour of the part that shows most from above, which is what the Editor paints the object's
// footprint with. The server works it out from the mesh it just built and sends it with the hash and size, so the Editor needs neither the
// model file nor three.js to colour a footprint. The same rule as render3d/assets.js mainColour() (which reads the loaded model): the largest
// area of up-facing triangles, projected on the floor. Pure.

import { mainColourOf } from '../model/assets.js';

/** The projected area (mm²) of the triangles of a mesh that face up. mesh: { pos: [[x, y, z], …], idx: [i, …] } with z up. */
export function areaFromAbove(mesh) {
  const { pos, idx } = mesh;
  let area = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = pos[idx[t]], b = pos[idx[t + 1]], c = pos[idx[t + 2]];
    const up = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);   // the z of the triangle's normal, twice its projected area
    if (up > 0) area += up / 2;
  }
  return area;
}

/** '#rrggbb' of a material colour as the build keeps it: linear red, green, blue (0 to 1) and alpha. Null for anything else. */
export function hexOfLinear(color) {
  if (!Array.isArray(color) || color.length < 3) return null;
  const toSrgb = v => { const x = Math.max(0, Math.min(1, v)); return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
  return '#' + [0, 1, 2].map(i => Math.round(toSrgb(color[i]) * 255).toString(16).padStart(2, '0')).join('');
}

/** The main colour of a build: parts = [{ key, mesh }], materials = { [part key]: { color } } as the build resolved them. Null when no part has a colour. */
export function mainColourOfBuild(parts, materials) {
  return mainColourOf(parts.map(p => ({ weight: areaFromAbove(p.mesh), colour: hexOfLinear(materials?.[p.key]?.color) })));
}
