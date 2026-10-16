import { primitives, booleans } from '../lib/jscad.js';

// ASSUMED: A panel radiator has `panels` steel plates 12 mm thick, 5 mm apart front to back, with a 20 mm deep convector fin block behind each of the back panels (a type 22 has two panels and two fin blocks).
// ASSUMED: The radiator itself stands on z = 0 (brackets are omitted); the house hangs it at the placement height.
// ASSUMED: A column radiator is a row of oval tubes 46 mm wide (one per 46 mm of width) and `depth` deep, joined top and bottom by 30 mm manifolds.
// ASSUMED: The rear (against the wall) is at +y.
// UNSURE: Valves, pipes and brackets are omitted.

export const meta = {
  id: 'radiator',
  name: 'Radiator',
  summary: 'A panel or column radiator for the wall.',
  description:
    'A water radiator on the wall, front at -y. Assumed: a panel radiator has 12 mm steel plates 5 mm apart with a fin block behind each back panel; a column radiator is a row of 46 mm wide oval tubes with manifolds along the top and bottom; valves, pipes and brackets are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['panel', 'column'], labels: { panel: 'Panel radiator', column: 'Column radiator' }, default: 'panel' },
    { key: 'width', label: 'Width', unit: 'mm', default: 1000, min: 400, max: 2000, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 600, min: 300, max: 900, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 80, min: 60, max: 160, step: 10 },
    { key: 'panels', label: 'Panels', type: 'integer', default: 2, min: 1, max: 3, appliesTo: ['panel'] },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'white-paint' },
  ],
  parts: [{ key: 'body', label: 'Panels' }],
  variantDefaults: { column: { panels: 1, height: 600, depth: 100 } },
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: { mount: 'wall', z: 150 },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const oval = (rx, ry, z0, z1, x, seg = 16) => primitives.cylinderElliptic({ height: z1 - z0, startRadius: [rx, ry], endRadius: [rx, ry], center: [x, 0, (z0 + z1) / 2], segments: seg });

export function build(p) {
  const W = p.width, H = p.height, D = p.depth;
  if (p.variant === 'column') {
    // tubes 46 mm wide and `depth` deep (an oval section), joined by 30 mm manifolds along the top and bottom
    const rx = 23, ry = D / 2, n = Math.max(2, Math.floor(W / 46)), pitch = (W - 2 * rx) / (n - 1), m = Math.min(ry, 15);
    let body = booleans.union(box(-W / 2, W / 2, -m, m, 0, 30), box(-W / 2, W / 2, -m, m, H - 30, H));
    for (let i = 0; i < n; i++) body = booleans.union(body, oval(rx, ry, 20, H - 20, -W / 2 + rx + i * pitch));
    return { body };
  }
  // panels: plates 12 mm thick, 5 mm apart, from the front; fin blocks 20 mm deep behind the back panels
  const t = 12, gap = 5, n = p.panels;
  let body = null;
  let y = -D / 2;
  for (let i = 0; i < n; i++) {
    const plate = box(-W / 2, W / 2, y, y + t, 0, H);
    body = body ? booleans.union(body, plate) : plate;
    y += t;
    if (i < n - 1) {
      // fins between this panel and the next one (a block with 5 mm of overlap into both plates)
      body = booleans.union(body, box(-W / 2 + 15, W / 2 - 15, y - 3, y + gap + 3, 30, H - 30));
      y += gap;
    }
  }
  // the fin block behind the back panel fills the rest of the depth
  if (y < D / 2 - 4) body = booleans.union(body, box(-W / 2 + 15, W / 2 - 15, y - 3, D / 2, 30, H - 30));
  return { body };
}

export function size(p) {
  return [p.width, p.depth, p.height];
}
