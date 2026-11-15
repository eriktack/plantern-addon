// What grows in a flower bed (decision 304): plant spots scattered over a yard area of surface `bed`, the same every time. Pure.
//   area.planting: 'flowers' (the default for a bed) | 'low' (low green plants) | 'soil' (bare soil: nothing drawn).

import { pointInPolygon } from '../geometry/polygon.js';

export const PLANTINGS = ['flowers', 'low', 'soil'];
export const PLANTING_LABEL = { flowers: 'Flowers', low: 'Low plants', soil: 'Bare soil' };
// ASSUMED: blossom colours of a mixed summer bed; a clump is one of them, chosen by the spot's own hash
export const BLOSSOMS = ['#d8443c', '#f2c230', '#f4f1ea', '#c45aa8', '#7f6ad0', '#ef8a3c', '#e889b0'];

/** The planting of an area: null for anything but a bed. */
export const plantingOf = a => (a?.surface === 'bed' ? (PLANTINGS.includes(a.planting) ? a.planting : 'flowers') : null);

// a small hash: the same text and numbers always give the same number in [0, 1)
function rand(seed, i, j, k) {
  let h = 2166136261;
  for (const c of `${seed}|${i}|${j}|${k}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 2246822507); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The plant spots of one area: [{ at: [x, y], r, h, blossom }] (r the clump's radius, h its height in mm, blossom a colour or
 * null for green only). A jittered grid (300 mm for flowers, 250 for low plants) keyed to the area's id, so a bed looks the same
 * on every redraw and its spots stay put when another area changes; spots under `covered` (later areas lying on top) are left out.
 */
export function plantSpots(a, { covered = () => false } = {}) {
  const kind = plantingOf(a);
  if (!kind || kind === 'soil' || !(a.polygon?.length >= 3)) return [];
  const step = kind === 'flowers' ? 300 : 250, xs = a.polygon.map(p => p[0]), ys = a.polygon.map(p => p[1]);
  const out = [];
  for (let i = Math.floor(Math.min(...xs) / step); i * step <= Math.max(...xs); i++) {
    for (let j = Math.floor(Math.min(...ys) / step); j * step <= Math.max(...ys); j++) {
      const at = [Math.round((i + 0.15 + 0.7 * rand(a.id, i, j, 'x')) * step), Math.round((j + 0.15 + 0.7 * rand(a.id, i, j, 'y')) * step)];
      if (!pointInPolygon(at, a.polygon) || covered(at)) continue;
      const s = rand(a.id, i, j, 's');
      if (kind === 'flowers') out.push({ at, r: 90 + 60 * s, h: 200 + 250 * rand(a.id, i, j, 'h'), blossom: BLOSSOMS[Math.floor(rand(a.id, i, j, 'c') * BLOSSOMS.length)] });
      else out.push({ at, r: 80 + 50 * s, h: 100 + 80 * rand(a.id, i, j, 'h'), blossom: null });
    }
  }
  return out;
}

/** The spots of every bed in the yard, each left out where a later area lies over it. */
export function yardPlantSpots(yard) {
  const areas = yard?.areas || [];
  return areas.flatMap((a, k) => plantSpots(a, { covered: p => areas.slice(k + 1).some(b => b.polygon?.length >= 3 && pointInPolygon(p, b.polygon)) }));
}
