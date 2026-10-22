// How many lamps cast shadows in the 3D view (decision 113). Shadows are the expensive part of a lamp: one
// shadow-casting point light draws the scene six more times. The amount is a level, None · Few · Average ·
// Lots · All, set per kind of device in the house's settings (`settings.render3d.shadows = { desktop,
// mobile }`) and changed with a slider in the viewer, remembered in that browser. Shadows go to the
// lamps that are on, brightest first; a lamp that is off is no light at all (it costs nothing).

export const SHADOW_LEVELS = ['none', 'few', 'average', 'lots', 'all'];
export const SHADOW_COUNT = { none: 0, few: 2, average: 4, lots: 8, all: Infinity };
export const SHADOW_LABEL = { none: 'None', few: 'Few', average: 'Average', lots: 'Lots', all: 'All' };
export const DEFAULT_SHADOWS = { desktop: 'average', mobile: 'few' };   // lighter on phones and wall tablets

/**
 * The shadow level for `device` ('desktop' | 'mobile'): what this browser chose (`pref`), else the house's
 * setting, else the default. A legacy `render3d.shadowLamps` count (before levels) still counts on a desktop.
 */
export function shadowLevel(render3d = {}, device = 'desktop', pref) {
  if (SHADOW_LEVELS.includes(pref)) return pref;
  const set = render3d.shadows?.[device];
  if (SHADOW_LEVELS.includes(set)) return set;
  if (device === 'desktop' && Number.isFinite(render3d.shadowLamps)) return levelForCount(render3d.shadowLamps);
  return DEFAULT_SHADOWS[device] ?? DEFAULT_SHADOWS.desktop;
}

/** The level closest to (not above) a count of shadow lamps: 0 → none, 3 → few, 4 → average, 20 → lots. */
export function levelForCount(n) {
  return [...SHADOW_LEVELS].reverse().find(l => SHADOW_COUNT[l] <= n && l !== 'all') ?? 'none';
}

/**
 * Which lamps cast shadows: up to `count` of the lamps that are on. They are ranked by what a shadow stops: the part of
 * the lamp's reach that walls hide (`leak`, mm², geometry/leak.js) times its brightness, then brightness, then file order.
 * A lamp with no leak (no wall in its way) comes after the lamps whose light goes through walls. Without `leak` the
 * ranking is brightness alone. lamps = [{ id, on, brightness, leak? }]; returns a Set of ids.
 */
export function pickShadowLamps(lamps, count) {
  const score = l => (l.leak ?? 1) * (l.brightness ?? 1);
  return new Set(lamps.map((l, i) => ({ ...l, i })).filter(l => l.on)
    .sort((a, b) => score(b) - score(a) || (b.brightness ?? 1) - (a.brightness ?? 1) || a.i - b.i)
    .slice(0, Math.max(0, count)).map(l => l.id));
}

/** What a lamp's shadow is worth when it sits inside an object (a light in a cabinet, on a shelf): its light would shine through the object's solid
 * walls without a shadow, so these lamps come before any lamp whose only wall is the house's. Everything else keeps the plan's own number. */
export const OBJECT_LIGHT_LEAK = 1e9;
export function leakOfLamp(fixture, planLeak) {
  return fixture?.attach?.object ? OBJECT_LIGHT_LEAK : planLeak;
}
