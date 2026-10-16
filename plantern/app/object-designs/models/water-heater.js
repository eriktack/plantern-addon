import { primitives, booleans } from '../lib/jscad.js';

// ASSUMED: The tank is a plain cylinder with two 30 mm pipe stubs, 60 mm high, on top at a quarter of the diameter either side of the middle; the height includes the stubs.
// ASSUMED: A floor-standing tank stands on three 50 mm feet, 100 mm high, spaced 120 degrees apart at 40 % of the diameter from the middle.
// ASSUMED: A wall-hung tank has a 200 x 8 mm mounting plate on its back (at +y, against the wall) from 200 mm below its top to 100 mm below it.
// UNSURE: The thermostat, the safety valve and the insulation jacket seams are omitted.

export const meta = {
  id: 'water-heater',
  name: 'Water heater',
  summary: 'A hot-water tank (varmvattenberedare), standing on feet or hung on the wall.',
  description:
    'A hot-water heater, front at -y. Assumed: a plain cylinder with two 60 mm pipe stubs on top (the height includes them); a floor-standing tank stands on three 100 mm feet; a wall-hung tank has a mounting plate on its back; the thermostat, valves and jacket seams are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['floor_standing', 'wall_hung'], labels: { floor_standing: 'Floor-standing tank', wall_hung: 'Wall-hung tank' }, default: 'floor_standing' },
    { key: 'diameter', label: 'Diameter', unit: 'mm', default: 600, min: 350, max: 750, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 1800, min: 500, max: 2000, step: 10 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'white-paint' },
  ],
  parts: [{ key: 'tank', label: 'Tank' }],
  variantDefaults: { wall_hung: { diameter: 450, height: 900 } },
  sizeParams: { x: 'diameter', y: 'diameter', z: 'height' },
  placement: { mount: 'floor', variants: { wall_hung: { mount: 'wall', z: 1000 } } },
};

const cyl = (r, z0, z1, x = 0, y = 0, seg = 40) => primitives.cylinder({ radius: r, height: z1 - z0, center: [x, y, (z0 + z1) / 2], segments: seg });

export function build(p) {
  const r = p.diameter / 2, H = p.height, stub = 60;
  const feet = p.variant === 'floor_standing' ? 100 : 0;
  let tank = cyl(r, feet, H - stub + 5);
  for (const sx of [-1, 1]) tank = booleans.union(tank, cyl(15, H - stub, H, sx * r / 2, 0, 16));
  if (p.variant === 'floor_standing') {
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 * i) / 3 + Math.PI / 2;
      tank = booleans.union(tank, cyl(25, 0, feet + 5, Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, 16));
    }
  } else {
    // the plate sits on the back; it stays inside the cylinder's overall depth
    tank = booleans.union(tank, primitives.cuboid({ size: [200, 8, 100], center: [0, r - 8 / 2 - 2, H - 150] }));
  }
  return { tank };
}

export function size(p) {
  return [p.diameter, p.diameter, p.height];
}
