// Map an HA state object to how a lamp looks. Pure.

const DEFAULT_RGB = [255, 214, 170];

/** Tanner Helland's approximation, valid ~1000–40000 K. */
export function kelvinToRgb(k) {
  const t = k / 100, c = v => Math.max(0, Math.min(255, Math.round(v)));
  if (t <= 66) return [255, c(99.4708025861 * Math.log(t) - 161.1195681661), t <= 19 ? 0 : c(138.5177312231 * Math.log(t - 10) - 305.0447927307)];
  return [c(329.698727446 * Math.pow(t - 60, -0.1332047592)), c(288.1221695283 * Math.pow(t - 60, -0.0755148492)), 255];
}

const hexRgb = h => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null);

/**
 * { available, on, brightness 0..1, rgb } for a light/switch state (undefined → unavailable).
 * `look.lumens` is the lamp's rating (1000 lm = the house's default lamp); it only scales the 3D light.
 * `look` (location.json → bindings[id].look: { brightness: %, kelvin, color: "#rrggbb" }) is how the
 * lamp looks when on, for what HA does not report: a smart outlet or relay driving an ordinary lamp,
 * or a light without colour. What HA reports wins.
 */
export function appearance(state, look = {}) {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return { available: false, on: false, brightness: 0, rgb: DEFAULT_RGB };
  const a = state.attributes || {}, on = state.state === 'on';
  const rgb = a.rgb_color || (a.color_temp_kelvin ? kelvinToRgb(a.color_temp_kelvin) : hexRgb(look?.color) || (look?.kelvin ? kelvinToRgb(look.kelvin) : DEFAULT_RGB));
  const full = a.brightness ?? (Number.isFinite(look?.brightness) ? look.brightness / 100 * 255 : 255);
  const out = { available: true, on, brightness: on ? full / 255 : 0, rgb };
  if (look?.lumens > 0) out.lumens = look.lumens;
  return out;
}

/** How strong a lamp rated `lumens` is next to the default lamp (LUMENS_DEFAULT lm = the house's lampIntensity); 1 when it has no rating. */
export const LUMENS_DEFAULT = 1000;
export const lumensScale = lumens => (lumens > 0 ? lumens / LUMENS_DEFAULT : 1);

/** Problems with a binding's look: [message]. */
export function checkLook(look) {
  if (look === undefined) return [];
  if (!look || typeof look !== 'object') return ['look must be { brightness, kelvin, color }'];
  const err = [];
  if (look.brightness !== undefined && !(look.brightness > 0 && look.brightness <= 100)) err.push('look.brightness is a percentage, 1–100');
  if (look.kelvin !== undefined && !(look.kelvin >= 1000 && look.kelvin <= 10000)) err.push('look.kelvin is a colour temperature, 1000–10000 K');
  if (look.lumens !== undefined && !(look.lumens > 0 && look.lumens <= 20000)) err.push('look.lumens is the lamp\'s rating, 1–20000 lm');
  if (look.color !== undefined && !hexRgb(look.color)) err.push('look.color must look like #rrggbb');
  return err;
}
