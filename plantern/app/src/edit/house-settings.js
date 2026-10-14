// The house's settings (location.json → settings) as the Editor's House view changes them: the wall and stair
// defaults, the check tolerances, the cut plane, and the 3D look (lamp intensity, night light, shadows per device).
// Pure: returns a new location document and never edits the one it was given. A blank value (null, '' or undefined)
// removes the setting, so the default from settings.js applies again. Refused as a whole when one value is wrong.

import { SHADOW_LEVELS } from '../model/shadows.js';

// key (dotted path inside `settings`) → the range a number may take. The shadow levels are checked separately.
export const HOUSE_SETTING_LIMITS = {
  'cutPlane': { lo: 0, hi: 5000, label: 'Cut plane' },
  'stairHeadroom': { lo: 1000, hi: 3000, label: 'Stair headroom' },
  'wallThickness.outer': { lo: 10, hi: 2000, label: 'Outer wall thickness' },
  'wallThickness.inner': { lo: 10, hi: 2000, label: 'Inner wall thickness' },
  'checkTolerance.ok': { lo: 0, hi: 200, label: 'Check tolerance (green)' },
  'checkTolerance.warn': { lo: 0, hi: 500, label: 'Check tolerance (amber)' },
  'render3d.lampIntensity': { lo: 0, hi: 10000, label: 'Lamp intensity' },
  'render3d.nightLight': { lo: 0, hi: 1, label: 'Night light' },
};
export const HOUSE_SHADOW_KEYS = ['render3d.shadows.desktop', 'render3d.shadows.mobile'];

const isBlank = v => v === null || v === undefined || v === '';

/** Set or remove one dotted key in a plain object; empty parents are removed with it. */
function putPath(obj, path, value) {
  const [head, ...rest] = path.split('.');
  if (!rest.length) {
    if (value === undefined) delete obj[head]; else obj[head] = value;
    return;
  }
  obj[head] = obj[head] && typeof obj[head] === 'object' ? obj[head] : {};
  putPath(obj[head], rest.join('.'), value);
  if (!Object.keys(obj[head]).length) delete obj[head];
}

/**
 * changes: { 'cutPlane': 1200, 'render3d.nightLight': 0.4, 'render3d.shadows.mobile': 'few', 'wallThickness.outer': null }
 * Returns { loc, errors, changed }. On errors the document comes back unchanged.
 */
export function setHouseSettings(loc, changes = {}) {
  const errors = [], changed = [];
  const next = structuredClone(loc);
  next.settings = next.settings || {};
  for (const [key, raw] of Object.entries(changes)) {
    const shadow = HOUSE_SHADOW_KEYS.includes(key), limit = HOUSE_SETTING_LIMITS[key];
    if (!shadow && !limit) { errors.push(`${key} is not a house setting`); continue; }
    if (isBlank(raw)) { putPath(next.settings, key, undefined); changed.push(key); continue; }
    if (shadow) {
      if (!SHADOW_LEVELS.includes(raw)) { errors.push(`${key === HOUSE_SHADOW_KEYS[0] ? 'Shadows on the computer' : 'Shadows on a phone'} must be one of ${SHADOW_LEVELS.join(', ')}`); continue; }
      putPath(next.settings, key, raw);
    } else {
      const n = typeof raw === 'string' ? Number(raw.trim().replace(',', '.')) : raw;
      if (!Number.isFinite(n) || n < limit.lo || n > limit.hi) { errors.push(`${limit.label} must be a number from ${limit.lo} to ${limit.hi}`); continue; }
      putPath(next.settings, key, n);
    }
    changed.push(key);
  }
  const ok = next.settings.checkTolerance?.ok, warn = next.settings.checkTolerance?.warn;
  if (Number.isFinite(ok) && Number.isFinite(warn) && ok > warn) errors.push('The green tolerance cannot be larger than the amber one');
  if (errors.length) return { loc, errors, changed: [] };
  if (!Object.keys(next.settings).length) delete next.settings;
  return { loc: next, errors, changed };
}
