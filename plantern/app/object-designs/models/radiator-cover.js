import { primitives, booleans, geometries } from '../lib/jscad.js';

// ASSUMED: width, depth and height are the overall casing, standing on the floor with its back (+y) against the wall.
// ASSUMED: the casing has 20 mm side panels, a 60 mm bottom rail (toe) and a 60 mm top rail, open at the back; the front panel is 12 mm thick, between the rails and the sides.
// ASSUMED: a grille front has horizontal slots 14 mm high at a 30 mm pitch; a slat front has vertical slats 14 mm wide at a 30 mm pitch (a 16 mm gap); a cane front is a weave of 8 mm bars crossing at a pitch of 24 mm, never more than 40 bars either way.
// ASSUMED: a shelf is a 24 mm board over the whole top; without it the top is the 60 mm rail.
// UNSURE: a hinged or removable front, a radiator inside it, and the back panel are omitted.

export const meta = {
  id: 'radiator-cover',
  name: 'Radiator cover',
  summary: 'A casing over a wall radiator with a grille, slat or cane front and an optional shelf on top.',
  description:
    'A radiator cover standing on the floor against the wall (back at +y, front at -y), a casing with side panels, a bottom and a top rail, an open back and a perforated front. Assumed: overall size is width, depth and height; sides 20 mm, bottom rail 60 mm, top rail 60 mm; the front panel is 12 mm thick; a grille has horizontal slots 14 mm high at a 30 mm pitch, slats are 14 mm wide at a 30 mm pitch, a cane front is a weave of 8 mm bars at a 24 mm pitch (at most 40 bars each way); a shelf is a 24 mm board over the whole top; a hinged front, the radiator and the back panel are omitted.',
  params: [
    { key: 'width', label: 'Width', unit: 'mm', default: 900, min: 400, max: 2000, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 900, min: 300, max: 1200, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 180, min: 100, max: 300, step: 10 },
    { key: 'frontStyle', label: 'Front', type: 'enum', options: ['grille', 'slats', 'cane'], labels: { grille: 'Grille (slots)', slats: 'Slats', cane: 'Cane weave' }, default: 'grille' },
    { key: 'shelf', label: 'Shelf on top', type: 'boolean', default: true },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'white-paint' },
  ],
  parts: [
    { key: 'frame', label: 'Casing' },
    { key: 'front', label: 'Front panel' },
    { key: 'top', label: 'Shelf', needs: 'shelf' },
  ],
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: { mount: 'floor' },
};

const SIDE = 20, RAIL = 60, PANEL = 12, SHELF = 24;

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const combine = shapes => (shapes.length === 0 ? geometries.geom3.create() : shapes.length === 1 ? shapes[0] : booleans.union(...shapes));

export function build(p) {
  const W = p.width, H = p.height, D = p.depth;
  const frontY = -D / 2, x0 = -W / 2 + SIDE, x1 = W / 2 - SIDE, z0 = RAIL, z1 = H - RAIL;
  if (x1 - x0 < 100 || z1 - z0 < 100) throw new Error(`A ${W} x ${H} mm cover leaves less than 100 mm for its front (sides ${SIDE} mm, rails ${RAIL} mm).`);

  // the casing: two sides, a bottom rail and a top rail, open at the back; the rails run 5 mm into the sides
  const frame = combine([
    box(-W / 2, -W / 2 + SIDE, -D / 2, D / 2, 0, H),
    box(W / 2 - SIDE, W / 2, -D / 2, D / 2, 0, H),
    box(x0 - 5, x1 + 5, -D / 2, D / 2, 0, RAIL),
    box(x0 - 5, x1 + 5, -D / 2, D / 2, H - RAIL, p.shelf ? H - SHELF + 5 : H),
  ]);

  // the front panel between the rails, perforated by the front style; its 12 mm sit at the front, 5 mm into the rails
  const py0 = frontY + 2, py1 = frontY + 2 + PANEL;
  const pz0 = z0 - 5, pz1 = z1 + 5, ox0 = x0 - 5, ox1 = x1 + 5;
  const across = ox1 - ox0, up = pz1 - pz0;
  let front;
  if (p.frontStyle === 'grille') {
    const slots = [];
    for (let z = z0 + 20; z + 14 <= z1 - 20; z += 30) slots.push(box(x0 + 20, x1 - 20, py0 - 1, py1 + 1, z, z + 14));
    front = slots.length ? booleans.subtract(box(ox0, ox1, py0, py1, pz0, pz1), combine(slots)) : box(ox0, ox1, py0, py1, pz0, pz1);
  } else if (p.frontStyle === 'slats') {
    const slats = [];
    for (let x = x0 + 4; x + 14 <= x1 - 4; x += 30) slats.push(box(x, x + 14, py0, py1, pz0, pz1));
    slats.push(box(ox0, ox0 + 14, py0, py1, pz0, pz1), box(ox1 - 14, ox1, py0, py1, pz0, pz1));
    front = combine(slats);
  } else {
    // a weave: bars one way in front of bars the other way, at most 40 of each
    const nx = Math.min(40, Math.max(2, Math.floor(across / 24))), nz = Math.min(40, Math.max(2, Math.floor(up / 24)));
    const bars = [box(ox0, ox0 + 14, py0, py1, pz0, pz1), box(ox1 - 14, ox1, py0, py1, pz0, pz1), box(ox0, ox1, py0, py1, pz0, pz0 + 14), box(ox0, ox1, py0, py1, pz1 - 14, pz1)];
    for (let i = 0; i < nx; i++) { const x = ox0 + ((across - 8) * (i + 0.5)) / nx; bars.push(box(x, x + 8, py0, py0 + PANEL / 2 + 1, pz0, pz1)); }
    for (let i = 0; i < nz; i++) { const z = pz0 + ((up - 8) * (i + 0.5)) / nz; bars.push(box(ox0, ox1, py0 + PANEL / 2, py1, z, z + 8)); }
    front = combine(bars);
  }

  const top = p.shelf ? box(-W / 2, W / 2, -D / 2, D / 2, H - SHELF, H) : geometries.geom3.create();
  return { frame, front, top };
}

export function size(p) {
  return [p.width, p.depth, p.height];
}
