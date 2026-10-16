// What kind a material is, for grouping a list of materials (nicer dropdowns, ND3), and what it looks like as a swatch in a
// menu. Pure: the kind comes from the name first (the library's names), then from its library entry (metallic, a blended
// alpha, a texture), else Other. A name the library does not know gets a grey swatch.

/** The kinds, in the order a list shows them. */
export const MATERIAL_KINDS = Object.freeze([
  { kind: 'wood', label: 'Wood' },
  { kind: 'paint', label: 'Paint & colour' },
  { kind: 'metal', label: 'Metal' },
  { kind: 'fabric', label: 'Fabric & leather' },
  { kind: 'glass', label: 'Glass' },
  { kind: 'ceramic', label: 'Ceramic & stone' },
  { kind: 'other', label: 'Other' },
]);

const BY_NAME = Object.freeze({
  oak: 'wood', pine: 'wood', birch: 'wood', walnut: 'wood', ash: 'wood',
  'white-paint': 'paint', charcoal: 'paint', sage: 'paint', navy: 'paint',
  'black-metal': 'metal', metal: 'metal',
  fabric: 'fabric', leather: 'fabric',
  glass: 'glass',
  ceramic: 'ceramic', laminate: 'ceramic', stone: 'ceramic',
});

/** { kind, label } of a material: from its name, else from its library entry, else 'other'. */
export function materialKind(name, entry = {}) {
  let kind = BY_NAME[name];
  if (!kind) {
    if (entry.metallic > 0.3) kind = 'metal';
    else if (entry.alphaMode === 'blend') kind = 'glass';
    else kind = 'other';
  }
  return { kind, label: MATERIAL_KINDS.find(k => k.kind === kind).label };
}

/** Mixes a #rrggbb colour with another one, by a share 0..1 of the other. */
function mix(hex, other, share) {
  const a = hexParts(hex), b = hexParts(other);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * share).toString(16).padStart(2, '0')).join('');
}
function hexParts(hex) {
  const h = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '888888';
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function rgba(hex, alpha) {
  const [r, g, b] = hexParts(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The CSS background that shows a material in a menu: its colour; a metal as a light-to-dark gradient; glass as a translucent
 * colour over a checker; a texture as the image. name is only for the reader; the entry is the library's (or the house's).
 */
export function materialSwatch(entry = {}, base = '') {
  // a bare file name is in the textures folder of the library (object-designs/textures/); a path with a folder is as it is
  if (entry.texture) return `url("${base}${entry.texture.includes('/') ? '' : 'textures/'}${entry.texture}") center / cover`;
  const colour = /^#[0-9a-f]{6}$/i.test(entry.color ?? '') ? entry.color : '#888888';
  if (entry.alphaMode === 'blend') {
    return `linear-gradient(${rgba(colour, 0.55)}, ${rgba(colour, 0.55)}), repeating-conic-gradient(#8a8f98 0 25%, #d8dce2 0 50%) 0 0 / 8px 8px`;
  }
  if (entry.metallic > 0.3) return `linear-gradient(90deg, ${mix(colour, '#ffffff', 0.35)}, ${colour}, ${mix(colour, '#000000', 0.35)})`;
  return colour;
}
