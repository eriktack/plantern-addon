import { primitives, booleans } from '../lib/jscad.js';

// ASSUMED: The island is a carcass on an 80 mm plinth recessed 40 mm, under a 40 mm top that overhangs the carcass by 10 mm at the front, back and ends (usual kitchen top).
// ASSUMED: Depth and width are the carcass; the seating overhang is added behind the carcass (+y), so the overall depth is depth + overhang; the island is centred on its overall size.
// ASSUMED: The seating overhang is 600 mm wide per seat (all of the width for 0 seats) and is held by two 50 mm square posts at its outer corners.
// ASSUMED: A sink is a 500 x 400 mm opening through the top with a 150 mm basin sunk into the carcass; a hob is four shallow 2 mm burner rings of 90 to 140 mm diameter in the top (geometry only).
// UNSURE: Taps, hob controls and appliances are omitted.

export const meta = {
  id: 'kitchen-island',
  name: 'Kitchen island',
  summary: 'A free-standing kitchen island, plain, with a seating overhang, a sink or a hob.',
  description:
    'A kitchen island with a carcass and a top, front at -y. Assumed: the carcass stands on an 80 mm plinth recessed 40 mm; the 40 mm top overhangs by 10 mm at the front, back and ends; the seating overhang is added behind the carcass, 600 mm per seat, on two 50 mm posts; a sink is a 500 x 400 mm opening with a 150 mm basin; a hob is four 2 mm burner rings; taps, controls and appliances are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['plain', 'seating_overhang', 'with_sink', 'with_hob'], labels: { plain: 'Plain island', seating_overhang: 'With seating overhang', with_sink: 'With sink', with_hob: 'With hob' }, default: 'plain' },
    { key: 'width', label: 'Width', unit: 'mm', default: 1500, min: 1200, max: 1800, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 800, min: 600, max: 900, step: 10, hint: 'The carcass; the seating overhang is extra.' },
    { key: 'height', label: 'Height', unit: 'mm', default: 900, min: 850, max: 920, step: 10 },
    { key: 'overhang', label: 'Overhang', unit: 'mm', default: 300, min: 250, max: 350, step: 10, appliesTo: ['seating_overhang'] },
    { key: 'seats', label: 'Seats', type: 'integer', default: 0, min: 0, max: 4, hint: '0: the overhang runs the whole width.', appliesTo: ['seating_overhang'] },
    { key: 'sink', label: 'Sink', type: 'boolean', default: false },
    { key: 'hob', label: 'Hob', type: 'boolean', default: false },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'white-paint' },
  ],
  parts: [
    { key: 'carcass', label: 'Carcass' },
    { key: 'top', label: 'Top' },
  ],
  variantDefaults: {
    seating_overhang: { seats: 2, overhang: 300 },
    with_sink: { sink: true },
    with_hob: { hob: true },
  },
  sizeParams: { z: 'height' },

  placement: { mount: 'floor' },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const cyl = (r, z0, z1, x, y, seg = 24) => primitives.cylinder({ radius: r, height: z1 - z0, center: [x, y, (z0 + z1) / 2], segments: seg });

export function build(p) {
  const over = p.variant === 'seating_overhang' ? p.overhang : 0;
  const D = p.depth + over;                       // overall depth
  const y0 = -D / 2, yc0 = y0, yc1 = y0 + p.depth;  // the carcass is at the front (-y), the overhang behind it
  const W = p.width, T = 40, plinth = 80;
  const x0 = -W / 2, x1 = W / 2;

  let carcass = booleans.union(
    box(x0, x1, yc0, yc1, plinth - 5, p.height - T + 5),
    box(x0 + 40, x1 - 40, yc0 + 40, yc1 - 40, 0, plinth),
  );
  if (over) {
    // two posts hold the overhang at its outer corners
    const w = p.seats > 0 ? Math.min(W, p.seats * 600) : W, xa = -w / 2, xb = w / 2, yb = y0 + D;
    carcass = booleans.union(carcass, box(xa, xa + 50, yb - 50, yb, 0, p.height - T + 5), box(xb - 50, xb, yb - 50, yb, 0, p.height - T + 5));
  }

  // the top: carcass plus 10 mm, and the overhang behind it
  let top = box(x0 - 10, x1 + 10, yc0 - 10, yc1 + 10, p.height - T, p.height);
  if (over) {
    const w = p.seats > 0 ? Math.min(W + 20, p.seats * 600) : W + 20;
    top = booleans.union(top, box(-w / 2, w / 2, yc1 + 5, y0 + D + 10, p.height - T, p.height));
  }
  if (p.sink) {
    const cx = 0, cy = (yc0 + yc1) / 2;
    top = booleans.subtract(top, box(cx - 250, cx + 250, cy - 200, cy + 200, p.height - T - 1, p.height + 1));
    carcass = booleans.subtract(carcass, box(cx - 245, cx + 245, cy - 195, cy + 195, p.height - T - 150, p.height - T + 6));
  }
  if (p.hob) {
    const cy = (yc0 + yc1) / 2, sx = Math.min(300, W / 5), sy = Math.min(150, p.depth / 4);
    for (const [dx, dy, r] of [[-sx, -sy, 70], [sx, -sy, 55], [-sx, sy, 55], [sx, sy, 70]]) {
      top = booleans.subtract(top, cyl(r, p.height - 2, p.height + 1, dx, cy + dy, 24));
    }
  }
  return { carcass, top };
}

export function size(p) {
  const over = p.variant === 'seating_overhang' ? p.overhang : 0;
  return [p.width + 20, p.depth + 20 + over, p.height];
}
