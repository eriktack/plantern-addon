import { primitives, booleans, geometries } from '../lib/jscad.js';

// ASSUMED: Depth includes the fronts (20 mm); a worktop on the base housing reaches 20 mm past them, and the whole footprint is centred, as kitchen-cabinet.
// ASSUMED: Carcass panels 18 mm; the niches are open at the front, as wide as the carcass inside (width less 36 mm) and as deep as from the fronts' face to the back panel.
// ASSUMED: The appliance in a niche stands on an 18 mm shelf under it; a microwave niche has a shelf above it too.
// ASSUMED: The base housing's oven niche is right under its top (panel or worktop), with one drawer front below it.
// ASSUMED: The tall housing has a door below the oven niche and a door above the top niche; a door is at least 200 mm high, a drawer front at least 80 mm.
// ASSUMED: Fronts 20 mm thick with 3 mm gaps; plinth inset 30 mm at the sides, 60 mm at the front and 20 mm at the back; recessed pulls omitted.
// UNSURE: The niche height is the clear opening; the appliance in it is the house's (decision 284).

export const meta = {
  id: 'appliance-housing',
  name: 'Appliance housing',
  summary: 'A kitchen cabinet with an open niche for a built-in oven, under the worktop or at eye level with a microwave above.',
  description:
    'A kitchen housing cabinet, front at -y, with open niches for built-in appliances: the base housing has an oven niche under its top and a drawer below, the tall housing an oven niche at the chosen height, an optional microwave niche above it, and doors above and below. Assumed: depth includes 20 mm fronts, a worktop on the base housing overhangs them by 20 mm and the footprint is centred; carcass panels 18 mm; niches as wide as the carcass inside and as deep as from the fronts to the back panel, each on an 18 mm shelf; fronts 20 mm with 3 mm gaps; doors at least 200 mm, drawer fronts at least 80 mm; plinth inset 30 mm at the sides, 60 mm at the front and 20 mm at the back.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['base', 'tall'],
      labels: { base: 'Base: oven under the worktop', tall: 'Tall: oven at eye level' },
      default: 'base',
    },
    { key: 'width', label: 'Width', unit: 'mm', default: 600, min: 450, max: 900, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 600, min: 500, max: 700, step: 10, hint: 'Fronts included, not the worktop overhang.' },
    { key: 'height', label: 'Height', unit: 'mm', default: 880, min: 820, max: 2600, step: 10, hint: 'The carcass; a worktop lies on top.' },
    { key: 'plinth', label: 'Plinth', unit: 'mm', default: 100, min: 0, max: 150, step: 5 },
    { key: 'nicheHeight', label: 'Oven niche height', unit: 'mm', default: 600, min: 450, max: 620, step: 5, hint: '600 for an ordinary built-in oven, 455 for a compact one.' },
    {
      key: 'nicheBottom',
      label: 'Oven niche at',
      unit: 'mm',
      default: 800,
      min: 300,
      max: 1400,
      step: 10,
      hint: 'The bottom of the oven niche above the floor.',
      appliesTo: ['tall'],
    },
    { key: 'microwave', label: 'Microwave niche', type: 'boolean', default: true, hint: 'A niche for a built-in microwave above the oven.', appliesTo: ['tall'] },
    { key: 'microwaveHeight', label: 'Microwave niche height', unit: 'mm', default: 380, min: 300, max: 460, step: 5, appliesTo: ['tall'] },
    { key: 'worktop', label: 'Worktop', type: 'boolean', default: true, appliesTo: ['base'] },
    { key: 'worktopThickness', label: 'Worktop thickness', unit: 'mm', default: 30, min: 12, max: 60, step: 2, appliesTo: ['base'] },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'white-paint' },
  ],
  parts: [
    { key: 'carcass', label: 'Carcass' },
    { key: 'doors', label: 'Doors and drawer' },
    { key: 'top', label: 'Top (worktop on the base housing)', appliesTo: ['base'] },
  ],
  variantDefaults: {
    tall: { height: 2200 },
  },
  // the base housing's worktop overhangs the fronts, so its depth and height are not one option each
  sizeParams: { x: 'width', y: { default: 'depth', base: null }, z: { default: 'height', base: null } },
  placement: { mount: 'floor' },
};

const PANEL = 18;
const FRONT = 20;
const GAP = 3;
const OVERLAP = 5;
const OVERHANG = 20;

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

/** The housing's layout in mm in its own axes: its depth lines, its niches (bottom to top) and its fronts. */
function layout(p) {
  const base = p.variant === 'base';
  const worktop = base && p.worktop;
  const total = p.depth + (worktop ? OVERHANG : 0);
  const face = -total / 2 + (worktop ? OVERHANG : 0);     // the front of the fronts
  const bodyFront = face + FRONT;
  const back = total / 2;
  const top = p.height - PANEL;                          // the underside of the top panel
  const niches = [];
  const fronts = [];
  if (base) {
    const nb = top - p.nicheHeight;
    niches.push({ kind: 'oven', z0: nb, z1: top });
    fronts.push({ z0: p.plinth + GAP / 2, z1: nb - GAP / 2, min: 80, what: 'The drawer front' });
  } else {
    const nb = p.nicheBottom;
    niches.push({ kind: 'oven', z0: nb, z1: nb + p.nicheHeight });
    let above = nb + p.nicheHeight;
    if (p.microwave) {
      niches.push({ kind: 'microwave', z0: above + PANEL, z1: above + PANEL + p.microwaveHeight });
      above += PANEL + p.microwaveHeight;
    }
    fronts.push({ z0: p.plinth + GAP / 2, z1: nb - PANEL - GAP / 2, min: 200, what: 'The door below the oven' });
    fronts.push({ z0: above + PANEL + GAP / 2, z1: p.height - GAP / 2, min: 200, what: 'The door above the niches' });
  }
  for (const f of fronts) {
    if (f.z1 - f.z0 < f.min) {
      throw new Error(`${f.what} would be ${Math.round(f.z1 - f.z0)} mm high; at least ${f.min} mm is needed. Change the height, the plinth or the niches.`);
    }
  }
  return { worktop, total, face, bodyFront, back, top, niches, fronts };
}

export function build(p) {
  const L = layout(p);
  const x0 = -p.width / 2, x1 = p.width / 2;
  const carcass = [];

  // the housing, open at the front, with its bottom, back, sides and top panel
  carcass.push(booleans.subtract(
    box(x0, x1, L.bodyFront, L.back, p.plinth, p.height),
    box(x0 + PANEL, x1 - PANEL, L.bodyFront - OVERLAP, L.back - PANEL, p.plinth + PANEL, L.top)
  ));
  if (p.plinth > 0) carcass.push(box(x0 + 30, x1 - 30, L.bodyFront + 60 - FRONT, L.back - 20, 0, p.plinth + OVERLAP));

  // a shelf under each niche (and over the top niche of the tall housing), across the inside
  const shelf = z => box(x0 + PANEL - OVERLAP, x1 - PANEL + OVERLAP, L.bodyFront - FRONT, L.back - PANEL + OVERLAP, z - PANEL, z);
  for (const n of L.niches) if (n.z0 - PANEL > p.plinth + PANEL) carcass.push(shelf(n.z0));
  const last = L.niches[L.niches.length - 1];
  if (p.variant === 'tall') carcass.push(shelf(last.z1 + PANEL));

  const doors = L.fronts.map(f => box(x0 + GAP / 2, x1 - GAP / 2, L.face, L.face + FRONT + OVERLAP, f.z0, f.z1));

  let top = geometries.geom3.create();
  if (p.variant === 'base' && L.worktop) top = box(x0, x1, -L.total / 2, L.back, p.height, p.height + p.worktopThickness);
  else if (p.variant === 'base') top = box(x0, x1, L.bodyFront, L.back, p.height - PANEL, p.height);

  return {
    carcass: booleans.union(...carcass),
    doors: booleans.union(...doors),
    top,
  };
}

/**
 * The niches an appliance can be put in (decision 284), bottom to top: [{ kind, x, y, z, width, depth, height, front }] in mm in the
 * model's own axes: `kind` is what it is for ('oven', 'microwave'), x / y its middle in plan, z its bottom, `front` the y of its
 * opening (the face of the fronts), so an appliance stands with its front flush with the doors.
 */
export function niches(p) {
  const L = layout(p);
  const depth = L.back - PANEL - L.face;
  return L.niches.map(n => ({
    kind: n.kind,
    x: 0,
    y: L.face + depth / 2,
    z: n.z0,
    width: p.width - 2 * PANEL,
    depth,
    height: n.z1 - n.z0,
    front: L.face,
  }));
}
