import { primitives, booleans, transforms } from '../lib/jscad.js';

// ASSUMED: A ladder rail is two upright tubes with horizontal rungs about every 150 mm; tubes are 22 mm across (28 mm when heated).
// ASSUMED: A heated rail has a 20 mm supply pipe to the wall at the bottom of the right-hand tube; both uprights have two 12 mm wall brackets.
// ASSUMED: A wall bar is one horizontal tube 25 mm across between two brackets that hold it `depth` mm from the wall; `height` is the brackets' height.
// ASSUMED: The rear (against the wall) is at +y; the front is at -y.
// UNSURE: Water connections and valves are omitted.

export const meta = {
  id: 'towel-rail',
  name: 'Towel rail',
  summary: 'A ladder-type towel rail or a plain wall bar.',
  description:
    'A towel rail on the wall, front at -y. Assumed: a ladder has two 22 mm upright tubes (28 mm when heated) and 18 mm rungs about every 150 mm; a heated rail has a supply pipe to the wall at the bottom; a wall bar is a 25 mm tube between two brackets that hold it away from the wall by the depth; pipes and valves are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['ladder', 'wall_bar'], labels: { ladder: 'Ladder rail', wall_bar: 'Wall bar' }, default: 'ladder' },
    { key: 'width', label: 'Width', unit: 'mm', default: 500, min: 400, max: 600, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 800, min: 40, max: 1200, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 100, min: 60, max: 120, step: 10, hint: 'How far it stands out from the wall.' },
    { key: 'heated', label: 'Heated', type: 'boolean', default: true },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'metal' },
  ],
  parts: [{ key: 'frame', label: 'Rails and brackets' }],
  variantDefaults: {
    ladder: { height: 1100, width: 500, heated: true },
    wall_bar: { heated: false, height: 60 },
  },
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: { mount: 'wall', z: 900, variants: { wall_bar: { mount: 'wall', z: 1100 } } },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const vcyl = (r, z0, z1, x, y, seg = 16) => primitives.cylinder({ radius: r, height: z1 - z0, center: [x, y, (z0 + z1) / 2], segments: seg });
// a horizontal tube along x (a cylinder runs along z: turn it onto x)
const hbar = (r, x0, x1, y, z, seg = 12) => transforms.translate([(x0 + x1) / 2, y, z], transforms.rotateY(Math.PI / 2, primitives.cylinder({ radius: r, height: x1 - x0, center: [0, 0, 0], segments: seg })));

export function build(p) {
  const W = p.width, H = p.height, D = p.depth;
  if (p.variant === 'wall_bar') {
    const r = 12.5, backY = D / 2, barY = -D / 2 + r;
    const bracket = x => booleans.union(
      box(x - 8, x + 8, barY, backY, H / 2 - 12, H / 2 + 12),       // the arm from the wall to the bar
      box(x - 8, x + 8, backY - 6, backY, 0, H),                    // the plate on the wall
    );
    return { frame: booleans.union(hbar(r, -W / 2, W / 2, barY, H / 2), bracket(-W / 2 + 30), bracket(W / 2 - 30)) };
  }
  // ladder: two uprights, rungs about every 150 mm, brackets at the ends
  const tr = p.heated ? 14 : 11, x0 = -W / 2 + tr, x1 = W / 2 - tr, y = -D / 2 + tr;
  const rungs = Math.max(2, Math.round((H - 100) / 150));
  let frame = booleans.union(vcyl(tr, 0, H, x0, y), vcyl(tr, 0, H, x1, y));
  const zLow = Math.min(50, H / 2), zHigh = Math.max(H - 50, H / 2);           // the rungs stay inside the height, even for a very short rail
  for (let i = 0; i < rungs; i++) frame = booleans.union(frame, hbar(Math.min(9, zLow - 1), x0 - 3, x1 + 3, y, zLow + (i * (zHigh - zLow)) / (rungs - 1)));
  const h = Math.min(20, H / 2 - 1);                                           // half the height of a wall plate, kept inside the rail's height
  for (const x of [x0, x1]) for (const z of [Math.max(h, Math.min(80, H / 4)), Math.min(H - h, Math.max(H - 80, (H * 3) / 4))]) {
    frame = booleans.union(frame, box(x - 6, x + 6, y, D / 2, z - Math.min(6, h), z + Math.min(6, h)), box(x - 6, x + 6, D / 2 - 6, D / 2, z - h, z + h));
  }
  if (p.heated) frame = booleans.union(frame, box(x1 - 10, x1 + 10, y, D / 2, 20, 40));   // the supply pipe to the wall
  return { frame };
}

export function size(p) {
  return [p.width, p.depth, p.height];
}
