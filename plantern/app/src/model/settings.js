// Per-location settings with per-level overrides. Code never hardcodes these values.

export const DEFAULT_SETTINGS = Object.freeze({
  cutPlane: 1200,                         // mm above finished floor; objects above are drawn dashed
  checkTolerance: { ok: 5, warn: 15 },    // mm; |delta| ≤ ok → green, ≤ warn → amber, else red
  snapRadiusPx: 12,
  wallThickness: { outer: 300, inner: 200 },   // mm, default for generated walls (listed in `assumed` until measured)
  stairHeadroom: 2000,                    // mm of clear height above a step (derived slab holes, headroom check)
  render3d: { lampIntensity: 80, shadows: { desktop: 'average', mobile: 'few' }, nightLight: 0.3 },   // candela at full brightness; how many lit lamps cast shadows per kind of device (shadows.js); the light of the 3D view at night, 0 to 1 (night.js)
});

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  const out = { ...a };
  for (const k in b || {}) out[k] = isObj(a?.[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k];
  return out;
}

/** defaults ← location.settings ← level.settings */
export const resolveSettings = (location, level) => merge(merge(DEFAULT_SETTINGS, location?.settings), level?.settings);
