// Per-location settings with per-level overrides. Code never hardcodes these values.

export const DEFAULT_SETTINGS = Object.freeze({
  cutPlane: 1200,                         // mm above finished floor; objects above are drawn dashed
  checkTolerance: { ok: 5, warn: 15 },    // mm; |delta| ≤ ok → green, ≤ warn → amber, else red
  snapRadiusPx: 12,
  wallThickness: { outer: 300, inner: 200 },   // mm, default for generated walls (listed in `assumed` until measured)
  stairHeadroom: 2000,                    // mm of clear height above a step (derived slab holes, headroom check)
  // the Wi-Fi coverage estimate (docs/plans/devices.md DV7, geometry/coverage.js wifiGrid): signal at 1 m (dBm), how fast it
  // falls with distance (path-loss exponent), the loss through an inner and an outer wall (dB; a wall at least outerFrom mm
  // thick counts as outer) and through a floor, per band; and the dBm limits of good, fair and weak
  wifi: {
    '2.4': { at1m: -30, exponent: 2.5, innerWall: 5, outerWall: 12, floor: 15 },
    '5': { at1m: -36, exponent: 2.7, innerWall: 7, outerWall: 18, floor: 20 },
    outerFrom: 280, good: -60, fair: -70, weak: -80, cell: 600,
  },
  render3d: { lampIntensity: 80, shadows: { desktop: 'average', mobile: 'few' }, nightLight: 0.3 },   // lampMask: false turns off the masks that stop lamp light at walls (render3d/lamp-mask.js); candela at full brightness; how many lit lamps cast shadows per kind of device (shadows.js); the light of the 3D view at night, 0 to 1 (night.js)
});

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  const out = { ...a };
  for (const k in b || {}) out[k] = isObj(a?.[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k];
  return out;
}

/** defaults ← location.settings ← level.settings */
export const resolveSettings = (location, level) => merge(merge(DEFAULT_SETTINGS, location?.settings), level?.settings);
