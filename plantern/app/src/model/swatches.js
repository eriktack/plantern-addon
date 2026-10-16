// The colour swatches a colour input offers (nicer dropdowns, ND10): the house's palette first (named), then the colours the house
// already uses (the walls, the materials), then the library's material colours it does not have yet. Pure; the Editor's colour
// inputs draw them (addSwatchPicker in src/capture/ui.js).
import { usedColors } from './materials.js';

/** [{ value, label, hint, group, swatch }] for a model and the library's materials ({ name: { color } }), no colour twice. */
export function colourSwatches(model, library = {}) {
  const out = usedColors(model).map(c => ({
    value: c.color,
    label: c.name || c.color,
    hint: c.name ? c.color : `used ${c.count} time${c.count === 1 ? '' : 's'}`,
    group: c.name ? 'Palette' : 'Used in this house',
    swatch: c.color,
  }));
  const seen = new Set(out.map(o => o.value.toLowerCase()));
  for (const [name, m] of Object.entries(library)) {
    const c = String(m?.color ?? '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(c) || seen.has(c)) continue;
    seen.add(c);
    out.push({ value: c, label: name, hint: c, group: 'Library', swatch: c });
  }
  return out;
}
