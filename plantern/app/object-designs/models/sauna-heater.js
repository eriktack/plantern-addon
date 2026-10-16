import { primitives, booleans } from '../lib/jscad.js';

// ASSUMED: The height includes the stones: the stones are the top 120 mm (a 30 mm rim and a heap inside it), the body is the rest.
// ASSUMED: The heap is a cylinder of stones up to the top, 80 % of the shorter side across, on a rim of 30 mm that follows the body's outline inset 15 mm.
// ASSUMED: An electric heater hangs on the wall (its back at +y) and has a grille of three 12 mm slots across the front.
// ASSUMED: A wood-fired heater stands on the floor, with a fire door recess (50 % of the width, 30 % of the body height, 20 mm deep) in the front and a 110 mm flue stub at the back of the top (through the rim, 5 mm into the body), reaching 30 mm above the stones.
// UNSURE: The stone shapes, the control unit, the rails and the door handle are omitted.

export const meta = {
  id: 'sauna-heater',
  name: 'Sauna heater',
  summary: 'An electric wall-hung or a wood-fired sauna heater (bastuaggregat) with its stones.',
  description:
    'A sauna heater, front at -y. Assumed: the height includes the stones (the top 120 mm: a 30 mm rim and a heap up to the top); an electric heater hangs on the wall and has three grille slots; a wood-fired heater stands on the floor with a door recess and a 110 mm flue stub; the stones are one cylinder, the control unit, rails and handle are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['electric', 'wood_fired'], labels: { electric: 'Electric heater', wood_fired: 'Wood-fired heater' }, default: 'electric' },
    { key: 'width', label: 'Width', unit: 'mm', default: 400, min: 300, max: 600, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 300, min: 250, max: 650, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 650, min: 450, max: 950, step: 10, hint: 'With the stones on top.' },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'black-metal' },
  ],
  parts: [
    { key: 'body', label: 'Heater' },
    { key: 'stones', label: 'Stones', defaultMaterial: 'stone' },
  ],
  variantDefaults: { wood_fired: { width: 450, depth: 550, height: 800 } },
  sizeParams: { x: 'width', y: 'depth', z: { default: 'height', wood_fired: null } },
  placement: { mount: 'wall', z: 200, variants: { wood_fired: { mount: 'floor' } } },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const cyl = (r, z0, z1, x = 0, y = 0, seg = 24) => primitives.cylinder({ radius: r, height: z1 - z0, center: [x, y, (z0 + z1) / 2], segments: seg });

export function build(p) {
  const W = p.width, D = p.depth, H = p.height, top = H - 120, rim = 30;
  let body = box(-W / 2, W / 2, -D / 2, D / 2, 0, top);
  // the rim: a frame round the top of the body, inset 15 mm
  const rimFrame = booleans.subtract(
    box(-W / 2 + 15, W / 2 - 15, -D / 2 + 15, D / 2 - 15, top - 5, top + rim),
    box(-W / 2 + 15 + 12, W / 2 - 15 - 12, -D / 2 + 15 + 12, D / 2 - 15 - 12, top - 6, top + rim + 1),
  );
  body = booleans.union(body, rimFrame);
  if (p.variant === 'electric') {
    for (const dz of [-1, 0, 1]) body = booleans.subtract(body, box(-W / 2 + 40, W / 2 - 40, -D / 2 - 1, -D / 2 + 10, top / 2 + dz * 40 - 6, top / 2 + dz * 40 + 6));
  } else {
    body = booleans.subtract(body, box(-W * 0.25, W * 0.25, -D / 2 - 1, -D / 2 + 20, top * 0.15, top * 0.15 + top * 0.3));
    body = booleans.union(body, cyl(55, top - 5, H + 30, 0, D / 2 - 90, 24));       // the flue stub through the rim, 30 mm above the heap
  }
  const heapR = Math.min(W, D) * 0.4 - 12, heapY = p.variant === 'wood_fired' ? -D * 0.08 : 0;
  const stones = cyl(Math.max(40, Math.min(heapR, p.variant === "wood_fired" ? D / 2 - 160 : heapR)), top, H, 0, heapY, 24);
  return { body, stones };
}

export function size(p) {
  return [p.width, p.depth, p.height + (p.variant === 'wood_fired' ? 30 : 0)];
}
