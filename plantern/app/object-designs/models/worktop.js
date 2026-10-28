import { primitives, booleans, extrusions, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Length and depth are the whole slab; a front overhang over the cabinets is part of the depth (the house places it, decision 284).
// ASSUMED: Default 1800 × 620 × 30 mm: a 600 mm deep cabinet run with the 20 mm front overhang of kitchen-cabinet's own worktop, 30 mm laminate.
// ASSUMED: The upstand is 12 mm thick, along the whole back edge, standing on the slab and entering it by 5 mm.
// ASSUMED: The edges are square; no edge profile, no seams.
// ASSUMED: The holes (cutouts) go straight through the slab, and through the upstand where they reach it; a hole is cut only where it lies on the slab.
// UNSURE: A worktop on a wall has its back on the wall; any gap behind it is the house's (the object's gap).

export const meta = {
  id: 'worktop',
  name: 'Worktop',
  summary: 'A kitchen worktop in one piece over a run of cabinets, with an optional upstand at the back.',
  description:
    'A straight worktop slab, front at -y, laid over a run of base cabinets without their own tops, with an optional upstand along the back edge. Assumed: length and depth are the whole slab (a front overhang is part of the depth); default 1800 × 620 × 30 mm (a 600 mm cabinet run with a 20 mm front overhang); upstand 12 mm thick along the whole back edge, entering the slab by 5 mm; square edges, no seams.',
  params: [
    {
      key: 'length',
      label: 'Length',
      unit: 'mm',
      default: 1800,
      min: 300,
      max: 4200,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 620,
      min: 300,
      max: 1200,
      step: 10,
      hint: 'Front overhang included.',
    },
    {
      key: 'thickness',
      label: 'Thickness',
      unit: 'mm',
      default: 30,
      min: 12,
      max: 60,
      step: 2,
    },
    {
      key: 'upstand',
      label: 'Upstand',
      type: 'boolean',
      default: false,
      hint: 'A strip along the back edge, against the wall.',
    },
    {
      key: 'upstandHeight',
      label: 'Upstand height',
      unit: 'mm',
      default: 50,
      min: 20,
      max: 150,
      step: 5,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'laminate',
    },
  ],
  parts: [
    { key: 'top', label: 'Worktop' },
    { key: 'upstand', label: 'Upstand', needs: 'upstand' },
  ],
  // The holes of the sink and hob set into it (decision 284): the house works them out, they are not a form option.
  cutouts: { max: 8 },
  // What stands on it stands on the slab, not on the upstand.
  surface: 'thickness',
  // The upstand stands above the slab, so the height is not one option.
  sizeParams: { x: 'length', y: 'depth' },
  placement: { mount: 'floor', z: 880 },
};

const UPSTAND = 12;
const OVERLAP = 5;

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

/** A hole as a prism from z0 to z1: a rectangle with rounded corners, `radius` mm. */
function hole(h, z0, z1) {
  const r = Math.min(h.radius ?? 0, h.width / 2 - 0.01, h.depth / 2 - 0.01);
  const shape = r > 0.5
    ? primitives.roundedRectangle({ size: [h.width, h.depth], roundRadius: r, segments: 32 })
    : primitives.rectangle({ size: [h.width, h.depth] });
  return transforms.translate([h.x, h.y, z0], extrusions.extrudeLinear({ height: z1 - z0 }, shape));
}

export function build(p) {
  const x = p.length / 2;
  const y = p.depth / 2;
  const holes = (p.cutouts ?? []).map(h => hole(h, -OVERLAP, p.thickness + (p.upstand ? p.upstandHeight : 0) + OVERLAP));
  let top = box(-x, x, -y, y, 0, p.thickness);
  let upstand = p.upstand
    ? box(-x, x, y - UPSTAND, y, p.thickness - OVERLAP, p.thickness + p.upstandHeight)
    : geometries.geom3.create();
  if (holes.length) {
    top = booleans.subtract(top, ...holes);
    if (p.upstand) upstand = booleans.subtract(upstand, ...holes);
  }
  return { top, upstand };
}

export function size(p) {
  return [p.length, p.depth, p.thickness + (p.upstand ? p.upstandHeight : 0)];
}
