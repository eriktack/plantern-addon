// The Devices layers of the viewer and the card (docs/plans/devices.md DV4, rules V1 to V3). Pure.
// One layer per subject, each "off", "icons" or "coverage" (where the layer has a coverage), all off until switched on, and
// only one layer's coverage at a time: switching one on puts another layer's coverage back to icons.

export const DEVICE_LAYERS = [
  { id: 'cameras', label: 'Cameras', coverage: true },
  { id: 'wifi', label: 'Wi-Fi', coverage: true },
  { id: 'zigbee', label: 'Zigbee', coverage: false },
  { id: 'bluetooth', label: 'Bluetooth', coverage: true },
  { id: 'smoke', label: 'Smoke detectors', coverage: false },
  { id: 'climate', label: 'Climate', coverage: false },
  { id: 'speakers', label: 'Speakers', coverage: false },
  { id: 'other', label: 'Other devices', coverage: false },
];
export const LAYER_STEPS = ['off', 'icons', 'coverage'];
const ROLE_LAYER = { 'zigbee-coordinator': 'zigbee', 'zigbee-router': 'zigbee', 'bt-proxy': 'bluetooth', smoke: 'smoke', climate: 'climate', speaker: 'speakers' };

/** The layer a fixture is drawn on, or null for a lamp, switch or strip. */
export function layerOf(fx) {
  if (fx?.kind === 'camera') return 'cameras';
  if (fx?.kind === 'ap') return 'wifi';
  if (fx?.kind === 'device') return ROLE_LAYER[fx.role] || 'other';
  return null;
}

/** Every layer's step from what a browser stored (anything unknown or missing is off). */
export function normalizeLayers(stored) {
  const out = {};
  for (const l of DEVICE_LAYERS) {
    const v = stored?.[l.id];
    out[l.id] = LAYER_STEPS.includes(v) && (v !== 'coverage' || l.coverage) ? v : 'off';
  }
  return out;
}

/** Set one layer's step; coverage on one layer puts any other layer's coverage back to icons (V3). */
export function setLayerStep(state, id, step) {
  const layer = DEVICE_LAYERS.find(l => l.id === id);
  if (!layer || !LAYER_STEPS.includes(step)) return state;
  const next = { ...normalizeLayers(state), [id]: step === 'coverage' && !layer.coverage ? 'icons' : step };
  if (next[id] === 'coverage') for (const l of DEVICE_LAYERS) if (l.id !== id && next[l.id] === 'coverage') next[l.id] = 'icons';
  return next;
}

/** The layers that have devices in the model (any level), in menu order: what the menu offers. */
export function layersInModel(model) {
  const used = new Set((model?.levels || []).flatMap(l => (l.fixtures || []).map(layerOf)).filter(Boolean));
  return DEVICE_LAYERS.filter(l => used.has(l.id));
}
