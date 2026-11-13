// The inputs of the Wi-Fi estimate for one level (docs/plans/devices.md DV7): its access points and those of the other levels
// of the same building (a floor's loss for each level between), its walls with their losses, and the area to cover. Pure.

import { DEFAULT_SETTINGS } from './settings.js';

const MARGIN = 8000;        // mm beyond the house, its access points and its devices
const MAX_SIDE = 90000;     // mm: a larger area is cut to this, around the house

/**
 * { aps, walls, bounds, band, limits, cell } for wifiGrid() and wifiStep(), or null when no access point has the band.
 * geos = buildModelGeometry(model); settings = resolveSettings(location, level); bandId '2.4' | '5' | '6'.
 */
export function wifiInputs(model, levelId, geos, settings, bandId = '2.4') {
  const W = { ...DEFAULT_SETTINGS.wifi, ...(settings?.wifi || {}) };
  const band = W[bandId] || DEFAULT_SETTINGS.wifi[bandId] || DEFAULT_SETTINGS.wifi['2.4'];
  const level = model.levels.find(l => l.id === levelId);
  if (!level) return null;
  const building = level.building ?? null;
  const stack = model.levels.filter(l => (l.building ?? null) === building).sort((a, b) => a.elevation - b.elevation);
  const at = stack.findIndex(l => l.id === levelId);
  const aps = [];
  stack.forEach((l, i) => {
    const geo = geos.get(l.id);
    for (const fx of l.fixtures || []) {
      if (fx.kind !== 'ap' || (fx.bands && !fx.bands.includes(bandId))) continue;
      const pos = geo?.fixturePos(fx);
      if (pos) aps.push({ id: fx.id, pos: [pos[0], pos[1]], z: (fx.z ?? 2400) + l.elevation - level.elevation, floors: Math.abs(i - at) });
    }
  });
  if (!aps.length) return null;
  const walls = (level.walls || []).filter(w => w.kind === 'wall' || w.kind === undefined)
    .map(w => ({ a: w.a, b: w.b, loss: (w.thickness ?? 0) >= W.outerFrom ? band.outerWall : band.innerWall }));
  // the house, its access points and the level's other devices (a camera on the carport is where signal matters), with a margin
  const geo = geos.get(levelId);
  const devicePts = (level.fixtures || []).filter(f => ['camera', 'device', 'ap'].includes(f.kind)).map(f => geo?.fixturePos(f)).filter(Boolean);
  const pts = [...(level.rooms || []).flatMap(r => r.polygon || []), ...aps.filter(a => !a.floors).map(a => a.pos), ...devicePts];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let bounds = { minx: Math.min(...xs) - MARGIN, miny: Math.min(...ys) - MARGIN, maxx: Math.max(...xs) + MARGIN, maxy: Math.max(...ys) + MARGIN };
  for (const [lo, hi] of [['minx', 'maxx'], ['miny', 'maxy']]) if (bounds[hi] - bounds[lo] > MAX_SIDE) { const m = (bounds[hi] + bounds[lo]) / 2; bounds[lo] = m - MAX_SIDE / 2; bounds[hi] = m + MAX_SIDE / 2; }
  return { aps, walls, bounds, band, limits: { good: W.good, fair: W.fair, weak: W.weak }, cell: W.cell };
}
