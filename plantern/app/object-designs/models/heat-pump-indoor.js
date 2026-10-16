import { primitives, booleans } from '../lib/jscad.js';

// ASSUMED: A wall-mounted indoor unit is a box with a 40 mm air outlet slot across the bottom front, 20 mm up, 30 mm in from each end, cut 15 mm deep.
// ASSUMED: A floor-standing (ground-source) heat pump is a tall cabinet on a 60 mm plinth inset 20 mm, with a 160 x 90 mm display recess in the upper front, 3 mm deep, centred 150 mm below the top.
// ASSUMED: The rear (against the wall) is at +y.
// UNSURE: Pipes, the remote and the unit's internal parts are omitted.

export const meta = {
  id: 'heat-pump-indoor',
  name: 'Heat pump (indoor unit)',
  summary: 'The indoor unit of an air heat pump on the wall, or a floor-standing ground-source heat pump.',
  description:
    'An indoor heat pump unit, front at -y. Assumed: a wall-mounted unit is a box with a 40 mm outlet slot along the bottom front; a floor-standing unit is a cabinet on a 60 mm plinth with a shallow display recess; pipes and internal parts are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['wall_mounted', 'floor_standing'], labels: { wall_mounted: 'Wall-mounted unit', floor_standing: 'Floor-standing heat pump' }, default: 'wall_mounted' },
    { key: 'width', label: 'Width', unit: 'mm', default: 900, min: 550, max: 1000, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 280, min: 250, max: 700, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 330, min: 300, max: 1900, step: 10 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'white-paint' },
  ],
  parts: [{ key: 'body', label: 'Body' }],
  variantDefaults: { floor_standing: { width: 600, depth: 650, height: 1800 } },
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: { mount: 'wall', z: 2000, variants: { floor_standing: { mount: 'floor' } } },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

export function build(p) {
  const W = p.width, D = p.depth, H = p.height;
  if (p.variant === 'floor_standing') {
    const plinth = 60;
    let body = booleans.union(box(-W / 2 + 20, W / 2 - 20, -D / 2 + 20, D / 2 - 20, 0, plinth + 5), box(-W / 2, W / 2, -D / 2, D / 2, plinth, H));
    body = booleans.subtract(body, box(-80, 80, -D / 2 - 1, -D / 2 + 3, H - 195, H - 105));
    return { body };
  }
  const slot = Math.min(40, H / 3);
  return { body: booleans.subtract(box(-W / 2, W / 2, -D / 2, D / 2, 0, H), box(-W / 2 + 30, W / 2 - 30, -D / 2 - 1, -D / 2 + 15, 20, 20 + slot)) };
}

export function size(p) {
  return [p.width, p.depth, p.height];
}
