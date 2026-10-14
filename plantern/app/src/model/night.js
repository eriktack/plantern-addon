// The light of the 3D view at night (daylight off): the ambient light the house has without daylight, before any
// lamp is counted (ticket #16). A number from 0 (pitch black: only the lamps that are on light the rooms) to 1
// (bright); the default is 0.3. Set per house in the house's settings (`settings.render3d.nightLight`)
// and changed with a slider in the viewer, remembered in that browser. The browser's choice wins over the house's.

export const DEFAULT_NIGHT_LIGHT = 0.3;

/** A usable night light: a finite number clamped to 0…1, else undefined. */
export function clampNightLight(v) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
}

/** The night light to use: the browser's choice, else the house's setting, else the default. */
export function nightLight(render3d = {}, pref) {
  return clampNightLight(pref) ?? clampNightLight(render3d?.nightLight) ?? DEFAULT_NIGHT_LIGHT;
}
