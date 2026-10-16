import { primitives, booleans, extrusions, geometries, transforms } from '../lib/jscad.js';

// ASSUMED: A tile stove (kakelugn) is a body 15 mm inside a 120 mm plinth and a 100 mm cornice (both as wide as the stove); a 220 mm tall, 260 mm wide stoking door recessed 20 mm into the front, 400 mm above the floor (usual proportions).
// ASSUMED: A corner stove has its front corner cut at 45 degrees; the cut takes a third of each side.
// ASSUMED: A round stove is a cylinder `width` across (the depth is ignored) with a round plinth and cornice.
// UNSURE: Tile joints, the flue and the damper are omitted.

export const meta = {
  id: 'tile-stove',
  name: 'Tile stove',
  summary: 'A tall tiled stove (kakelugn): corner, freestanding or round.',
  description:
    'A tile stove standing on the floor, front at -y. Assumed: a body 15 mm inside a 120 mm plinth and a 100 mm cornice, both as wide as the stove; a 260 x 220 mm stoking recess 400 mm above the floor, 20 mm deep; a corner stove has its front corner cut at 45 degrees (a third of each side); a round stove uses the width as its diameter; tile joints, the flue and the damper are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['corner', 'freestanding', 'round'], labels: { corner: 'Corner stove', freestanding: 'Freestanding stove', round: 'Round stove' }, default: 'corner' },
    { key: 'width', label: 'Width', unit: 'mm', default: 1200, min: 700, max: 1800, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 600, min: 450, max: 900, step: 10, appliesTo: ['corner', 'freestanding'] },
    { key: 'height', label: 'Height', unit: 'mm', default: 2300, min: 2100, max: 2500, step: 10 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'ceramic' },
  ],
  parts: [{ key: 'body', label: 'Stove' }],
  variantDefaults: { corner: { width: 900, depth: 900 }, round: { width: 800, depth: 800 } },
  sizeParams: { x: 'width', y: { default: 'depth', round: 'width' }, z: 'height' },
  placement: { mount: 'floor' },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const cyl = (r, z0, z1, seg = 40) => primitives.cylinder({ radius: r, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: seg });

// a footprint extruded between z0 and z1; the corner stove cuts its front-left corner at 45 degrees (cut: the share of the shorter side)
function slab(w, d, z0, z1, cut) {
  const x = w / 2, y = d / 2, c = Math.min(w, d) * cut;
  const pts = cut ? [[-x + c, -y], [x, -y], [x, y], [-x, y], [-x, -y + c]] : [[-x, -y], [x, -y], [x, y], [-x, y]];
  return transforms.translate([0, 0, z0], extrusions.extrudeLinear({ height: z1 - z0 }, geometries.geom2.fromPoints(pts)));
}

export function build(p) {
  const H = p.height, plinth = 120, cornice = 100;
  if (p.variant === 'round') {
    const r = p.width / 2;
    const body = booleans.union(cyl(r, 0, plinth), cyl(r - 15, plinth - 5, H - cornice + 5), cyl(r, H - cornice, H));
    // the stoking recess is cut into the front of the body
    return { body: booleans.subtract(body, box(-130, 130, -r - 1, -r + 15 + 20, 400, 620)) };
  }
  const w = p.width, d = p.depth, cut = p.variant === 'corner' ? 1 / 3 : 0;
  const body = booleans.union(
    slab(w, d, 0, plinth, cut),
    slab(w - 30, d - 30, plinth - 5, H - cornice + 5, cut),
    slab(w, d, H - cornice, H, cut),
  );
  // the recess is centred on the flat part of the front and 20 mm deep into the body
  const c = cut ? Math.min(w, d) * cut : 0, half = Math.min(130, (w - c) / 2 - 20), cx = c / 2;
  return { body: booleans.subtract(body, box(cx - half, cx + half, -d / 2 - 1, -d / 2 + 15 + 20, 400, 620)) };
}

export function size(p) {
  return p.variant === 'round' ? [p.width, p.width, p.height] : [p.width, p.depth, p.height];
}
