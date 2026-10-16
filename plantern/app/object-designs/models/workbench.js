import { primitives, booleans } from '../lib/jscad.js';

// ASSUMED: The top is 40 mm thick and covers the whole length and depth; the four legs are 70 mm square, inset 20 mm from the top's edges.
// ASSUMED: Rails 22 mm thick and 80 mm high join the legs under the top at the front, back and ends.
// ASSUMED: The optional lower shelf is 20 mm thick with its top 150 mm above the floor, between the legs.
// ASSUMED: Drawers sit in a case under the top at the front: the case runs 90 mm in from each end and 30 mm in from the front and back, 80 mm high; each drawer front is the front rail cut by 3 mm slots into `drawers` equal panels.
// UNSURE: Handles, vices and a pegboard are omitted.

export const meta = {
  id: 'workbench',
  name: 'Workbench',
  summary: 'A workshop bench (arbetsbänk) with a thick top, an optional shelf and drawers.',
  description:
    'A workbench, front at -y. Assumed: a 40 mm top over four 70 mm legs inset 20 mm; 80 mm rails under the top; an optional 20 mm lower shelf 150 mm above the floor; drawers as a case under the top at the front with the front rail cut into equal panels by 3 mm slots; handles, vices and a pegboard omitted.',
  params: [
    { key: 'length', label: 'Length', unit: 'mm', default: 1600, min: 1000, max: 2400, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 600, min: 500, max: 800, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 900, min: 800, max: 1000, step: 10 },
    { key: 'shelf', label: 'Lower shelf', type: 'boolean', default: true },
    { key: 'drawers', label: 'Drawers', type: 'integer', default: 0, min: 0, max: 4 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'pine' },
  ],
  parts: [
    { key: 'top', label: 'Top' },
    { key: 'frame', label: 'Frame and shelf' },
  ],
  sizeParams: { x: 'length', y: 'depth', z: 'height' },
  placement: { mount: 'floor' },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

export function build(p) {
  const L = p.length, D = p.depth, H = p.height, T = 40, leg = 70, inset = 20, rail = 80, rt = 22;
  const top = box(-L / 2, L / 2, -D / 2, D / 2, H - T, H);
  const lx0 = -L / 2 + inset, lx1 = L / 2 - inset - leg, ly0 = -D / 2 + inset, ly1 = D / 2 - inset - leg;
  const zr = H - T - rail;                                                   // the rails' lower edge
  let frame = booleans.union(
    ...[[lx0, ly0], [lx1, ly0], [lx0, ly1], [lx1, ly1]].map(([x, y]) => box(x, x + leg, y, y + leg, 0, H - T + 5)),
    box(lx0 + 5, lx1 + leg - 5, ly0, ly0 + rt, zr, H - T + 5),               // front rail
    box(lx0 + 5, lx1 + leg - 5, ly1 + leg - rt, ly1 + leg, zr, H - T + 5),   // back rail
    box(lx0, lx0 + rt, ly0 + 5, ly1 + leg - 5, zr, H - T + 5),               // left end rail
    box(lx1 + leg - rt, lx1 + leg, ly0 + 5, ly1 + leg - 5, zr, H - T + 5),   // right end rail
  );
  if (p.shelf) frame = booleans.union(frame, box(lx0 + 5, lx1 + leg - 5, ly0 + 5, ly1 + leg - 5, 130, 150));
  if (p.drawers > 0) {
    // the case under the top, and the front rail cut into panels
    frame = booleans.union(frame, box(-L / 2 + 90, L / 2 - 90, -D / 2 + 30, D / 2 - 30, zr, H - T + 5));
    const x0 = lx0 + 5, x1 = lx1 + leg - 5, w = (x1 - x0) / p.drawers;
    for (let i = 1; i < p.drawers; i++) {
      frame = booleans.subtract(frame, box(x0 + i * w - 1.5, x0 + i * w + 1.5, ly0 - 1, ly0 + rt, zr + 10, H - T - 10));
    }
  }
  return { top, frame };
}

export function size(p) {
  return [p.length, p.depth, p.height];
}
