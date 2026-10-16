// What a row of the Home Assistant entity search shows before its name (nicer dropdowns, ND8): an icon for its domain and a dot
// for its state (on, off, unavailable). Pure; the Editor's pick list (showEntityPick in src/capture/ui.js) uses them.

/** The icon name (src/icons.js) for an entity's domain, or '' for a domain without one. */
export function domainIcon(entityId) {
  const domain = String(entityId ?? '').split('.')[0];
  return { light: 'light', switch: 'switch', input_boolean: 'switch', binary_sensor: 'sensor' }[domain] ?? '';
}

/** 'on', 'off', 'unavailable' for the dot; '' when the entity is not known to the page (no dot). */
export function stateClass(state) {
  if (!state) return '';
  if (state === 'unavailable' || state === 'unknown') return 'unavailable';
  return state === 'on' || state === 'open' || state === 'home' ? 'on' : 'off';
}
