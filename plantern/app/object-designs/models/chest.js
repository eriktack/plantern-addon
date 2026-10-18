import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: A blanket chest has a 30 mm flat lid and stands on a 60 mm plinth inset 15 mm; its fittings are a 70 x 90 mm lock plate in the middle of the front and two 50 mm wide hinge plates on the back, 3 mm proud of a body and lid that are 3 mm short at the front and back.
// ASSUMED: A trunk has an arched lid whose rise is 30 % of the depth (at most 40 % of the height); two 40 mm wide straps, 3 mm proud, run over the lid and down the front and back, 60 mm in from each end; the lock plate is as on the blanket chest.
// ASSUMED: A toy box is a plain box with a 30 mm flat lid and a 120 mm wide, 35 mm tall hand slot 25 mm below the lid in each end; it has no fittings.
// ASSUMED: The lid is closed and solid, the body is a solid block (the inside is not modelled); the overall width, depth and height are exactly the parameters.
// UNSURE: Hinges, handles and feet of a real trunk are simplified to plates.

export const meta = {
  id: 'chest',
  name: 'Chest',
  summary: 'A storage chest (kista): a blanket chest, a trunk with an arched lid, or a toy box.',
  description:
    'A storage chest with the front at -y. Assumed: a blanket chest has a 30 mm lid on a 60 mm plinth, a lock plate and two hinge plates; a trunk has an arched lid with two straps over it and a lock plate; a toy box is a plain box with a 30 mm lid and a hand slot in each end; the lid is closed and the body solid; hinges, handles and feet are simplified.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['blanket_chest', 'trunk', 'toy_box'], labels: { blanket_chest: 'Blanket chest', trunk: 'Trunk (arched lid)', toy_box: 'Toy box' }, default: 'blanket_chest' },
    { key: 'width', label: 'Width', unit: 'mm', default: 1000, min: 400, max: 1500, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 450, min: 300, max: 700, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 450, min: 300, max: 900, step: 10 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'pine' },
  ],
  parts: [
    { key: 'body', label: 'Body' },
    { key: 'lid', label: 'Lid' },
    { key: 'fittings', label: 'Bands and lock', defaultMaterial: 'black-metal', appliesTo: ['blanket_chest', 'trunk'] },
  ],
  variantDefaults: { trunk: { width: 900, depth: 500, height: 600 }, toy_box: { width: 800, depth: 400, height: 450 } },
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: { mount: 'floor' },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
// an elliptic cylinder along x with radii ry (across y) and rz (up), its middle at height zc
const archX = (len, ry, rz, zc, x = 0) => transforms.translate([x, 0, zc], transforms.rotateY(Math.PI / 2, primitives.cylinderElliptic({ height: len, startRadius: [rz, ry], endRadius: [rz, ry], center: [0, 0, 0], segments: 32 })));

export function build(p) {
  const W = p.width, D = p.depth, H = p.height, none = geometries.geom3.create();
  if (p.variant === 'trunk') {
    const R = D / 2, rise = Math.min(D * 0.3, H * 0.4), zc = H - rise, t = 3;
    const body = box(-W / 2, W / 2, -R + t, R - t, 0, zc + 5);
    const lid = booleans.intersect(archX(W, R - t, rise - t, zc), box(-W / 2 - 1, W / 2 + 1, -R, R, zc, H));
    let straps = null;
    for (const x of [-W / 2 + 60, W / 2 - 60]) {
      const ring = booleans.intersect(booleans.subtract(archX(40, R, rise, zc, x), archX(42, R - t, rise - t, zc, x)), box(x - 21, x + 21, -R - 1, R + 1, zc, H + 1));
      const sides = [box(x - 20, x + 20, -R, -R + t + 1, 0, zc + 1), box(x - 20, x + 20, R - t - 1, R, 0, zc + 1)];
      const strap = booleans.union(ring, ...sides);
      straps = straps ? booleans.union(straps, strap) : strap;
    }
    straps = booleans.union(straps, box(-35, 35, -R, -R + t + 2, zc - 90, zc - 10));
    return { body, lid, fittings: straps };
  }
  const lidT = 30;
  if (p.variant === 'toy_box') {
    let body = box(-W / 2, W / 2, -D / 2, D / 2, 0, H - lidT + 5);
    for (const sx of [-1, 1]) body = booleans.subtract(body, box(sx * W / 2 - (sx > 0 ? 20 : -1), sx * W / 2 + (sx > 0 ? 1 : 20), -60, 60, H - lidT - 60, H - lidT - 25));
    return { body, lid: box(-W / 2, W / 2, -D / 2, D / 2, H - lidT, H), fittings: none };
  }
  // blanket chest: a body on a plinth, a flat lid, a lock plate and two hinge plates; body and lid are 3 mm short at the front and back
  // so that the plates are proud of them and the whole chest is exactly `depth` deep
  const plinth = 60, d = D / 2 - 3;
  const body = booleans.union(box(-W / 2 + 15, W / 2 - 15, -d + 15, d - 15, 0, plinth + 5), box(-W / 2, W / 2, -d, d, plinth, H - lidT + 5));
  const fittings = booleans.union(
    box(-35, 35, -D / 2, -d + 1, H - lidT - 100, H - lidT - 10),
    ...[-W / 3, W / 3].map(x => box(x - 25, x + 25, d - 1, D / 2, H - lidT - 40, H - 5)),
  );
  return { body, lid: box(-W / 2, W / 2, -d, d, H - lidT, H), fittings };
}

export function size(p) {
  return [p.width, p.depth, p.height];
}
