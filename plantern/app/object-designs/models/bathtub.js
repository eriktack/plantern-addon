import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: The tub is a shell with a 70 mm rim and a basin 80 mm above the bottom; the basin is a rounded oval (alcove: a box with 120 mm rounding approximated by an oval-ended box) (typical bath).
// ASSUMED: The front panel is 20 mm thick and 100 mm below the rim; it closes the side away from the wall of an alcove or corner bath (wall side back: the front; left: the right-hand end; right: the left-hand end; none: the front).
// ASSUMED: A freestanding bath is an oval shell on a 40 mm base ring, with no front panel.
// ASSUMED: A corner bath is a square shell whose basin is a circle; two sides are against the walls.
// UNSURE: Taps, overflow and drain are omitted.

export const meta = {
  id: 'bathtub',
  name: 'Bathtub',
  summary: 'An alcove, freestanding or corner bathtub.',
  description:
    'A bathtub, front at -y. Assumed: a 70 mm rim and a basin that starts 80 mm above the bottom; an alcove tub is a box with an oval basin and a 20 mm front panel on the side away from the wall; a freestanding tub is an oval shell on a 40 mm base ring; a corner tub is a square shell with a round basin; taps, overflow and drain are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['alcove', 'freestanding', 'corner'], labels: { alcove: 'Alcove bath', freestanding: 'Freestanding bath', corner: 'Corner bath' }, default: 'alcove' },
    { key: 'length', label: 'Length', unit: 'mm', default: 1700, min: 1400, max: 1900, step: 10 },
    { key: 'width', label: 'Width', unit: 'mm', default: 750, min: 650, max: 1500, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 550, min: 450, max: 650, step: 10 },
    { key: 'wallSide', label: 'Wall side', type: 'enum', options: ['left', 'right', 'back', 'none'], labels: { left: 'Left', right: 'Right', back: 'Back', none: 'None (free)' }, default: 'back', appliesTo: ['alcove', 'corner'], hint: 'The side the bath is against; the front panel closes the side away from it.' },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'ceramic' },
  ],
  parts: [
    { key: 'tub', label: 'Tub' },
    { key: 'panel', label: 'Front panel', appliesTo: ['alcove', 'corner'] },
  ],
  variantDefaults: {
    freestanding: { wallSide: 'none', length: 1700, width: 800 },
    corner: { wallSide: 'back', length: 1500, width: 1500 },
  },
  sizeParams: { x: 'length', y: { default: 'width', alcove: null, corner: null }, z: 'height' },

  placement: { mount: 'floor' },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const oval = (rx, ry, z0, z1, seg = 32) => primitives.cylinderElliptic({ height: z1 - z0, startRadius: [rx, ry], endRadius: [rx, ry], center: [0, 0, (z0 + z1) / 2], segments: seg });

export function build(p) {
  const L = p.length, W = p.width, H = p.height, rim = 70, floor = 80;
  let tub, panel;
  if (p.variant === 'freestanding') {
    const base = 40;
    tub = booleans.union(
      booleans.subtract(oval(L / 2, W / 2, base - 5, H), oval(L / 2 - rim, W / 2 - rim, floor + base, H + 1)),
      booleans.subtract(oval(L / 2 - 80, W / 2 - 80, 0, base + 5), oval(L / 2 - 120, W / 2 - 120, -1, base + 6)),
    );
  } else if (p.variant === 'corner') {
    const shell = box(-L / 2, L / 2, -W / 2, W / 2, 0, H);
    tub = booleans.subtract(shell, oval(Math.min(L, W) / 2 - rim, Math.min(L, W) / 2 - rim, floor, H + 1));
  } else {
    const shell = box(-L / 2, L / 2, -W / 2, W / 2, 0, H);
    tub = booleans.subtract(shell, oval(L / 2 - rim, W / 2 - rim, floor, H + 1));
  }
  if (p.variant !== 'freestanding') {
    // the panel closes the side away from the wall; it stands 100 mm below the rim, 20 mm thick, and overlaps the shell by 5 mm
    const end = p.wallSide === 'left' ? 'right' : p.wallSide === 'right' ? 'left' : 'front';
    const z1 = H - 100;
    panel = end === 'front' ? box(-L / 2, L / 2, -W / 2 - 20, -W / 2 + 5, 0, z1)
      : end === 'right' ? box(L / 2 - 5, L / 2 + 20, -W / 2, W / 2, 0, z1)
        : box(-L / 2 - 20, -L / 2 + 5, -W / 2, W / 2, 0, z1);
    // keep the model centred on x and y with the panel included
    const sx = end === 'right' ? -10 : end === 'left' ? 10 : 0, sy = end === 'front' ? 10 : 0;
    const move = g => transforms.translate([sx, sy, 0], g);
    return { tub: move(tub), panel: move(panel) };
  }
  return { tub, panel: geometries.geom3.create() };
}
