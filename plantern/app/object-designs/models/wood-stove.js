import { primitives, booleans, transforms } from '../lib/jscad.js';

// ASSUMED: The stove body stands on four 40 mm square legs 100 mm high; the height is the body with its legs, without the flue.
// ASSUMED: The glass door is a recess 20 mm deep in the front, 60 % of the width and 40 % of the body height, centred, 20 % above the body's bottom (as the brief says: a recess, no separate glass).
// ASSUMED: The flue is a 300 mm pipe stub, `flueDiameter` across, rising from the middle of the top (outlet top) or leaving the middle of the back (outlet rear), 5 mm into the body.
// ASSUMED: A corner stove is the same body turned 45 degrees about its centre so that it sits in a corner; its flue always rises from the top.
// ASSUMED: The model is centred on x and y with the flue included, so a rear flue shifts the body forward by 150 mm.
// UNSURE: The firebox, the ash pan and the handle are omitted.

export const meta = {
  id: 'wood-stove',
  name: 'Wood stove',
  summary: 'A freestanding or corner wood-burning stove with a flue stub.',
  description:
    'A wood stove on legs, front at -y. Assumed: four 40 mm legs 100 mm high; a glass door recess 20 mm deep, 60 % of the width and 40 % of the body height; a 300 mm flue stub on the top or the back; a corner stove is the body turned 45 degrees; the firebox, ash pan and handle are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['freestanding', 'corner'], labels: { freestanding: 'Freestanding stove', corner: 'Corner stove (turned 45 degrees)' }, default: 'freestanding' },
    { key: 'width', label: 'Width', unit: 'mm', default: 480, min: 400, max: 600, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 480, min: 400, max: 600, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 700, min: 550, max: 850, step: 10, hint: 'The body with its legs, without the flue.' },
    { key: 'flueOutlet', label: 'Flue outlet', type: 'enum', options: ['top', 'rear'], labels: { top: 'Top', rear: 'Rear' }, default: 'top', appliesTo: ['freestanding'] },
    { key: 'flueDiameter', label: 'Flue diameter', unit: 'mm', default: 150, min: 100, max: 200, step: 10 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'charcoal' },
  ],
  parts: [
    { key: 'body', label: 'Stove' },
    { key: 'flue', label: 'Flue pipe' },
  ],
  sizeParams: { x: { default: 'width', corner: null } },   // the depth is not exact: a rear flue sticks out behind
  placement: { mount: 'floor' },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

export function build(p) {
  const W = p.width, D = p.depth, H = p.height, legs = 100, r = p.flueDiameter / 2;
  let body = booleans.union(
    box(-W / 2, W / 2, -D / 2, D / 2, legs, H),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => box(sx * (W / 2 - 25) - 20, sx * (W / 2 - 25) + 20, sy * (D / 2 - 25) - 20, sy * (D / 2 - 25) + 20, 0, legs + 5)),
  );
  const bodyH = H - legs, dw = W * 0.6, dz0 = legs + bodyH * 0.2, dz1 = dz0 + bodyH * 0.4;
  body = booleans.subtract(body, box(-dw / 2, dw / 2, -D / 2 - 1, -D / 2 + 20, dz0, dz1));

  const rear = p.variant === 'freestanding' && p.flueOutlet === 'rear';
  let flue = rear
    ? transforms.translate([0, D / 2 - 5 + 150, H - 150], transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: r, height: 310, center: [0, 0, 0], segments: 24 })))
    : primitives.cylinder({ radius: r, height: 305, center: [0, 0, H + 150 - 2.5], segments: 24 });
  if (p.variant === 'corner') {
    body = transforms.rotateZ(Math.PI / 4, body);
    flue = transforms.rotateZ(Math.PI / 4, flue);
  }
  if (rear) {
    body = transforms.translate([0, -150, 0], body);
    flue = transforms.translate([0, -150, 0], flue);
  }
  return { body, flue };
}
