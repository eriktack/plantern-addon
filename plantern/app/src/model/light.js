// The light of the 3D view (decision 283): a mode and the range of the ambient light with daylight off, shared by the
// viewer (its 3D panel, remembered in this browser) and the Lovelace card (its config). Pure: no DOM.
//
//   default   Day/night: the ambient light follows the sun at the house, from the low end at night to the high end at full sun
//   daylight  the sun on all the time, with the daylight ambient
//   set       the light stays at the low end: no sun, whatever the time
//
// The range is percentages of the ambient light (100 % is 1.0 in the 3D view). With no range chosen the low end is the
// house's `settings.render3d.nightLight` (0 to 1), so the house's own night light still counts until someone changes it.
// `cycle` was the name of Day/night before; it is read as `default`.

import { clampNightLight, DEFAULT_NIGHT_LIGHT } from './night.js';

export const LIGHT_MODES = ['default', 'daylight', 'set'];
export const LIGHT_LABELS = { default: 'Day/night (default)', daylight: 'Daylight', set: 'Set (the low end of the range)' };

/** A mode the config or the browser holds, lower case, else undefined. */
export function cleanLightMode(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'cycle') return 'default';
  return LIGHT_MODES.includes(s) ? s : undefined;
}

/** A percentage 0 to 100, rounded, for a value a browser or a page holds; anything else (empty, missing, not a number) is undefined. */
export function cleanPercent(v) {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : undefined;
}

/** A percentage from a card config: empty is undefined, anything not 0 to 100 is an error the dashboard editor shows. */
export function configPercent(v, name) {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return undefined;
  const n = Number(v);
  if (!(Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error(`${name} is a percentage, 0 to 100, not "${v}".`);
  return Math.round(n);
}

/**
 * The range in percentages { min, max }: the chosen ends, else the house's night light for the low end and 100 for the high
 * one; a low end above the high one is swapped, so the range is always in order.
 */
export function lightPercents({ min, max } = {}, render3d = {}) {
  const house = Math.round((clampNightLight(render3d?.nightLight) ?? DEFAULT_NIGHT_LIGHT) * 100);
  let lo = cleanPercent(min) ?? house, hi = cleanPercent(max) ?? 100;
  if (lo > hi) [lo, hi] = [hi, lo];
  return { min: lo, max: hi };
}

/**
 * What the 3D view should do: { daylight, sunlight, min, max } with min and max as 0 to 1 ambient values and sunlight (how much
 * daylight the house has now, 0 to 1). Day/night uses the sun (`sun` from geometry/sun.js; undefined with no position, then 0:
 * the low end all the time); Set never does, and Daylight has the sun's own light instead.
 */
export function lightFor({ mode, min, max, sun } = {}, render3d = {}) {
  const m = cleanLightMode(mode) ?? 'default';
  const range = lightPercents({ min, max }, render3d);
  return {
    daylight: m === 'daylight',
    sunlight: m === 'default' && Number.isFinite(sun) ? Math.min(1, Math.max(0, sun)) : 0,
    min: range.min / 100,
    max: range.max / 100,
  };
}

/**
 * The browser's stored light { mode, min, max } (percentages, each undefined when not chosen). Before this setting the
 * viewer kept a daylight switch (`daylight`) and a night light (`night`, 0 to 1), which still count.
 */
export function lightPrefs(prefs = {}) {
  if (prefs.light && typeof prefs.light === 'object') {
    return { mode: cleanLightMode(prefs.light.mode), min: cleanPercent(prefs.light.min), max: cleanPercent(prefs.light.max) };
  }
  return {
    mode: prefs.daylight === true ? 'daylight' : undefined,
    min: prefs.night === undefined || prefs.night === null ? undefined : cleanPercent(Number(prefs.night) * 100),
    max: undefined,
  };
}
