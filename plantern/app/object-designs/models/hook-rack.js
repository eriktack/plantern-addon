import { primitives, booleans } from '../lib/jscad.js';

// ASSUMED: width, depth and height are the overall rack: a board against the wall (back at +y) with hooks pointing out (towards -y); depth is the board plus how far the hooks reach.
// ASSUMED: the board is 18 mm thick and `height` tall; the hooks are 8 mm stems of equal length, 40 mm up the board from its middle, spaced evenly with half a pitch at each end, each ending in an upturned 25 mm tip and a 16 mm knob.
// ASSUMED: the hooks never stick out of the top of the board (the tip ends 33 mm above the stem; the board must be at least 80 mm tall).
// UNSURE: a rail on brackets, a cloud-shaped or double-hook rack and a shelf above are not built (use wall-shelf, hat_shelf, for a shelf with hooks).

export const meta = {
  id: 'hook-rack',
  name: 'Hook rack',
  summary: 'A board on the wall with a row of coat hooks.',
  description:
    'A coat hook rack: a board on the wall with a row of hooks, back at +y, hooks towards -y. Assumed: overall size is width, depth (the board and the reach of the hooks) and height (the board); the board is 18 mm thick; hooks are 8 mm stems, evenly spaced with half a pitch at each end, 40 mm above the middle of the board, each with a 25 mm upturned tip and a 16 mm knob; no shelf, brackets or screws.',
  params: [
    { key: 'width', label: 'Width', unit: 'mm', default: 600, min: 200, max: 1500, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 120, min: 80, max: 400, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 90, min: 60, max: 150, step: 10, hint: 'The board and how far the hooks reach out from the wall.' },
    { key: 'hooks', label: 'Hooks', type: 'integer', default: 5, min: 1, max: 10 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'oak' },
  ],
  parts: [
    { key: 'board', label: 'Board' },
    { key: 'hooks', label: 'Hooks', defaultMaterial: 'metal' },
  ],
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: { mount: 'wall', z: 1500 },
};

const BOARD = 18, STEM = 4, TIP = 25, KNOB = 8;

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

export function build(p) {
  const W = p.width, H = p.height, D = p.depth, n = p.hooks;
  const board = box(-W / 2, W / 2, D / 2 - BOARD, D / 2, 0, H);
  const z = H / 2 + 40 > H - TIP - KNOB - 5 ? H / 2 : H / 2 + 40;     // a hook's stem height, kept so its tip stays on the board's height
  const frontY = -D / 2 + KNOB - STEM;                                  // the stem's front: the knob (a sphere at the tip) then reaches the front of the rack
  const hooks = [];
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (W * (i + 0.5)) / n;
    // the stem runs from 5 mm inside the board out to the tip, which turns up with a knob on it
    const along = booleans.union(
      box(x - STEM, x + STEM, frontY, D / 2 - BOARD + 5, z - STEM, z + STEM),
      box(x - STEM, x + STEM, frontY, frontY + 2 * STEM, z - STEM, z + TIP),
      primitives.sphere({ radius: KNOB, center: [x, frontY + STEM, z + TIP], segments: 12 }),
    );
    hooks.push(along);
  }
  return { board, hooks: hooks.length === 1 ? hooks[0] : booleans.union(...hooks) };
}

export function size(p) {
  return [p.width, p.depth, p.height];
}
