// models/_template.js
// TEMPLATE. Copy this file to models/<kebab-name>.js and change it. Files starting with _ are
// not shown in the catalog. See AGENT_INSTRUCTIONS.md for the rules.
//
// A block 600 x 400 x 300 mm: a body with a lid on top. Feet on z = 0, centred on x and y.

import { primitives, booleans } from '../lib/jscad.js';

export const meta = {
  id: 'template',                    // the file name without the leading _ (rule: meta.id = file name)
  name: 'Template block',
  description: 'A box with a lid. Copy this file as the starting point for a new model.',
  params: [
    // A variant: an enum with key 'variant'. Its defaults are below; the library applies them when it is picked.
    { key: 'variant', label: 'Variant', type: 'enum', default: 'low', options: ['low', 'tall'] },
    { key: 'width', label: 'Width (X)', unit: 'mm', default: 600, min: 100, max: 2000, step: 10 },
    { key: 'depth', label: 'Depth (Y)', unit: 'mm', default: 400, min: 100, max: 2000, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 300, min: 50, max: 1500, step: 5 },
    { key: 'lidThickness', label: 'Lid thickness', unit: 'mm', default: 20, min: 5, max: 60, step: 1 },
    { key: 'material', label: 'Material (whole block)', type: 'material', default: 'white-paint' },
  ],
  // The values that differ in a variant: the picked variant's entry replaces the defaults above.
  variantDefaults: { tall: { height: 900 } },
  parts: [
    { key: 'body', label: 'Body' },
    { key: 'lid', label: 'Lid' },
  ],
  // Where a new one starts in a house: { mount: 'floor' } (z 0), { mount: 'wall', z: <bottom, mm> } or
  // { mount: 'ceiling' }; a variant that starts elsewhere has its own entry in `variants` (AGENT_INSTRUCTIONS §3.1).
  placement: { mount: 'floor' },
};

// Overlap parts a little where they meet, instead of touching face to face.
const OVERLAP = 5;

export function build(p) {
  const bodyHeight = p.height - p.lidThickness + OVERLAP;
  return {
    body: primitives.cuboid({ size: [p.width, p.depth, bodyHeight], center: [0, 0, bodyHeight / 2] }),
    lid: primitives.cuboid({
      size: [p.width, p.depth, p.lidThickness],
      center: [0, 0, p.height - p.lidThickness / 2],
    }),
  };
}

/** Overall size [x, y, z] in mm, checked against the built bounds. */
export function size(p) {
  return [p.width, p.depth, p.height];
}
