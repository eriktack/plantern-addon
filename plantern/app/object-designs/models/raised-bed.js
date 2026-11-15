import { primitives, booleans, transforms } from '../lib/jscad.js';

// ASSUMED: A pallkrage (pallet collar) is the Swedish standard collar for a EUR pallet: 1200 × 800 mm outside, each collar
// 195 mm high of 20 mm boards; collars stack, so the height is layers × 195.
// ASSUMED: An odlingslåda (a box) is the same build at any length, width and height.
// ASSUMED: The soil fills the inside to 50 mm below the top edge, and goes down to the ground (no bottom).
// ASSUMED: The galvanised corner hinges of a real collar are left out (too small to matter in a yard plan).
// ASSUMED: Default wood is pine; soil #4a3a2a.

export const meta = {
  id: 'raised-bed',
  name: 'Raised bed',
  summary: 'A raised bed for growing: stacked pallet collars (pallkrage) or a wooden box (odlingslåda), with soil.',
  description:
    'A raised garden bed: an open wooden frame with soil inside, standing on the ground. Assumed: a pallet collar is 1200 × 800 mm outside and 195 mm high per collar, of 20 mm boards; a box is the same build at any size; the soil fills to 50 mm under the top and has no bottom; the corner hinges are left out; pine wood and dark soil (#4a3a2a).',
  params: [
    { key: 'variant', label: 'Kind', type: 'enum', options: ['collar', 'box'], labels: { collar: 'Pallet collars (pallkrage)', box: 'Box (odlingslåda)' }, default: 'collar' },
    { key: 'layers', label: 'Collars stacked', type: 'integer', default: 2, min: 1, max: 6, appliesTo: ['collar'] },
    { key: 'length', label: 'Length', unit: 'mm', default: 2000, min: 300, max: 6000, step: 10, appliesTo: ['box'] },
    { key: 'width', label: 'Width', unit: 'mm', default: 1000, min: 200, max: 3000, step: 10, appliesTo: ['box'] },
    { key: 'height', label: 'Height', unit: 'mm', default: 400, min: 100, max: 1200, step: 10, appliesTo: ['box'] },
    { key: 'board', label: 'Board thickness', unit: 'mm', default: 20, min: 12, max: 60, step: 1 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'pine' },
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'soil', label: 'Soil', defaultMaterial: '#4a3a2a' },
  ],
  sizeParams: { x: { default: 'length', collar: null }, y: { default: 'width', collar: null }, z: { default: 'height', collar: null } },
  placement: { mount: 'floor', hosts: ['room'] },
};

function resolve(p) {
  const variant = p.variant ?? 'collar';
  if (!meta.params[0].options.includes(variant)) throw new Error('Unknown kind; choose collar or box.');
  const q = { variant };
  for (const d of meta.params) if (d.key !== 'variant' && d.key !== 'material') q[d.key] = p[d.key] ?? d.default;
  if (variant === 'collar') Object.assign(q, { length: 1200, width: 800, height: 195 * q.layers });
  q.board = Math.min(q.board, Math.min(q.length, q.width) / 4);       // kept to a quarter of the narrower side
  return q;
}

export function size(p = {}) {
  const q = resolve(p);
  return [q.length, q.width, q.height];
}

export function build(p = {}) {
  const q = resolve(p), { length: L, width: W, height: H, board: t } = q;
  const outer = primitives.cuboid({ size: [L, W, H], center: [0, 0, H / 2] });
  const inner = primitives.cuboid({ size: [L - 2 * t, W - 2 * t, H + 2], center: [0, 0, H / 2] });
  const frame = booleans.subtract(outer, inner);
  const fill = Math.max(10, H - 50);
  const soil = primitives.cuboid({ size: [L - 2 * t, W - 2 * t, fill], center: [0, 0, fill / 2] });
  return { frame, soil };
}
