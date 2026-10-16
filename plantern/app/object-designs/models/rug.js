import { primitives } from '../lib/jscad.js';

// ASSUMED: A rug is a flat slab `pileThickness` thick; the pile and weave are not modelled, only the size.
// ASSUMED: A round rug is an oval `width` by `length` (a circle when they are equal), drawn with 48 segments.
// ASSUMED: The width is across the rug (x) and the length is along it (y).

export const meta = {
  id: 'rug',
  name: 'Rug',
  summary: 'A flat rectangular, round or runner rug.',
  description:
    'A rug lying on the floor. Assumed: a flat slab as thick as the pile; the pile and weave are not modelled; a round rug is an oval width by length (a circle when equal); the width runs across (x) and the length along (y).',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['rectangular', 'round', 'runner'], labels: { rectangular: 'Rectangular rug', round: 'Round rug', runner: 'Runner' }, default: 'rectangular' },
    { key: 'width', label: 'Width', unit: 'mm', default: 2000, min: 600, max: 3000, step: 10 },
    { key: 'length', label: 'Length', unit: 'mm', default: 3000, min: 600, max: 4000, step: 10 },
    { key: 'pileThickness', label: 'Pile thickness', unit: 'mm', default: 10, min: 3, max: 30, step: 1 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'fabric' },
  ],
  parts: [{ key: 'rug', label: 'Rug' }],
  variantDefaults: { round: { width: 1500, length: 1500 }, runner: { width: 700, length: 2000 } },
  sizeParams: { x: 'width', y: 'length', z: 'pileThickness' },
  placement: { mount: 'floor' },
};

export function build(p) {
  const t = p.pileThickness;
  if (p.variant === 'round') {
    return { rug: primitives.cylinderElliptic({ height: t, startRadius: [p.width / 2, p.length / 2], endRadius: [p.width / 2, p.length / 2], center: [0, 0, t / 2], segments: 48 }) };
  }
  return { rug: primitives.cuboid({ size: [p.width, p.length, t], center: [0, 0, t / 2] }) };
}

export function size(p) {
  return [p.width, p.length, p.pileThickness];
}
