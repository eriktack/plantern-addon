// Viewer preferences remembered in this browser (2D or 3D, daylight, projection, the 3D camera per
// house and level). A per-browser convenience like current.js: every access is guarded, so private
// mode or blocked storage just means nothing is remembered.

const KEY = 'plantern.viewer';

export function readPrefs() {
  try { const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** Merge `patch` into the stored preferences (`cameras` entries are merged too); returns the result. */
export function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch };
  if (patch.cameras) next.cameras = { ...(readPrefs().cameras || {}), ...patch.cameras };
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

/** Key of the camera kept for a house and level. */
export const cameraKey = (locId, levelId) => `${locId}|${levelId}`;
