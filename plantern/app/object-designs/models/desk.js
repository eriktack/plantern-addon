import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width and depth describe the main top; height includes the top (overall dimensions).
// ASSUMED: Tops are 30 mm thick (durable work surface).
// ASSUMED: Left and right are viewed from the front at -y (consistent corner selection).
// ASSUMED: The complete L-shaped footprint is centred, not just the main top (placement convention).
// ASSUMED: Straight desks have four legs; L-shaped desks have six (support at outer corners).
// ASSUMED: Leg centres are inset 65 mm from their supported top edges (stable edge clearance).
// ASSUMED: Fixed straight and L-shaped legs are 50 mm square; fixed standing legs are 70 mm square (variant construction).
// ASSUMED: Adjustable legs have 80 mm square hollow lower sleeves with 5 mm walls and 60 mm square upper columns (telescopic appearance).
// ASSUMED: Adjustable sleeve height is 55% of the top underside height (visible telescopic joint).
// ASSUMED: Upper columns enter sleeves by 5 mm; all legs enter the top by 5 mm (solid joints).
// ASSUMED: An L-shaped return must extend beyond the main depth and leave at least 300 mm of exposed main front (usable L layout).
// ASSUMED: Closed drawer pedestals are 360 mm wide, inset 100 mm from the main end and 50 mm from its front and back (compact storage).
// ASSUMED: Drawers occupy the end opposite the return, or the left end on other variants (keep the corner clear).
// ASSUMED: Drawer pedestals have 18 mm walls and bottoms, with height equal to 100 mm per drawer plus 30 mm (closed storage housing).
// ASSUMED: Drawer fronts have a 100 mm pitch, 3 mm separation gaps and 5 mm overlap into their side walls (connected closed fronts).
// ASSUMED: Recessed drawer pulls are 100 mm wide, 15 mm high and 6 mm deep, 20 mm below each front's top (no separate handles).
// ASSUMED: An L-shaped desk with drawers requires at least 560 mm of exposed main front (pedestal and corner clearance).
// UNSURE: Adjustment travel and hardware are unspecified; adjustable legs show a simplified telescopic assembly at the requested height.
// UNSURE: Drawer mechanisms are unspecified; drawers are modelled closed with a hollow shared housing.
// UNSURE: Variant defaults apply to omitted values only; supplied values always win because explicit-value provenance is unavailable.

export const meta = {
  id: 'desk',
  name: 'Desk',
  summary: 'A straight, L-shaped or standing desk, with optional drawers.',
  description:
    'A straight, L-shaped or standing desk with optional telescopic legs and closed drawers, facing -y. Assumed: width and depth describe the main top; height includes the 30 mm thick top; left/right are viewed from -y; the complete footprint is centred; four legs for straight desks and six for L-shaped desks; leg centres inset 65 mm; fixed legs 50 mm square, or 70 mm for standing; adjustable lower sleeves 80 mm square with 5 mm walls and upper columns 60 mm square; sleeve height 55% of underside height; columns enter sleeves and legs enter tops by 5 mm; return exceeds main depth and leaves at least 300 mm of exposed main front; drawer pedestal 360 mm wide, inset 100 mm from the main end and 50 mm from front/back, on the end opposite the return or otherwise left; pedestal walls and bottom 18 mm; pedestal height 100 mm per drawer plus 30 mm; drawer front pitch 100 mm with 3 mm gaps and 5 mm side-wall overlap; recessed pulls 100 by 15 by 6 mm positioned 20 mm below each front top; L-shaped desks with drawers require 560 mm of exposed main front; drawers modelled closed and adjustment hardware simplified.',
  params: [
    {
      key: 'variant',
      labels: { straight: 'Straight desk', l_shaped: 'L-shaped desk', standing: 'Standing desk' },
      label: 'Variant',
      type: 'enum',
      options: ['straight', 'l_shaped', 'standing'],
      default: 'straight',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 1400,
      min: 1000,
      max: 2000,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 700,
      min: 550,
      max: 900,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 740,
      min: 650,
      max: 1250,
      step: 10,
    },
    {
      key: 'heightAdjustable',
      label: 'Height adjustable',
      type: 'boolean',
      default: false,
    },
    {
      key: 'drawers',
      label: 'Drawers',
      type: 'integer',
      default: 0,
      min: 0,
      max: 4,
    },
    {
      key: 'cornerSide',
      appliesTo: ['l_shaped'],
      label: 'Corner side',
      type: 'enum',
      options: ['left', 'right'],
      default: 'right',
    },
    {
      key: 'returnLength',
      appliesTo: ['l_shaped'],
      label: 'Return length',
      unit: 'mm',
      default: 1200,
      min: 800,
      max: 1800,
      step: 10,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'oak',
    },
  ],
  parts: [
    { key: 'top', label: 'Top' },
    { key: 'frame', label: 'Legs and drawers' },
  ],
  variantDefaults: {
    l_shaped: { width: 1600, returnLength: 1200, cornerSide: 'right' },
    standing: { heightAdjustable: true, height: 1100 },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'straight';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error('Unknown desk variant; choose straight, l_shaped or standing.');
  }

  const defaults = meta.variantDefaults[variant] ?? {};
  const q = { variant };

  // Deliberately do not read or copy the material parameter.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'material' || key === 'variant') continue;
    q[key] = p[key] ?? defaults[key] ?? definition.default;

    if (definition.unit === 'mm') {
      if (
        !Number.isFinite(q[key]) ||
        q[key] < definition.min ||
        q[key] > definition.max
      ) {
        throw new Error(
          `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
        );
      }
    }
  }

  if (typeof q.heightAdjustable !== 'boolean') {
    throw new Error('Height adjustable must be true or false.');
  }
  if (!Number.isInteger(q.drawers) || q.drawers < 0 || q.drawers > 4) {
    throw new Error('Drawer count must be an integer from 0 to 4.');
  }
  if (!['left', 'right'].includes(q.cornerSide)) {
    throw new Error('Corner side must be left or right.');
  }

  if (variant === 'l_shaped') {
    if (q.returnLength <= q.depth) {
      throw new Error(
        `Return length ${q.returnLength} mm must exceed main depth ${q.depth} mm.`
      );
    }
    const required = q.drawers > 0 ? 560 : 300;
    if (q.width - q.depth < required) {
      throw new Error(
        `Width ${q.width} mm minus return depth ${q.depth} mm must leave at least ${required} mm of exposed main front.`
      );
    }
  }

  return q;
}

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

export function build(p) {
  const q = resolve(p);
  const isL = q.variant === 'l_shaped';
  const totalDepth = isL ? q.returnLength : q.depth;
  const x0 = -q.width / 2;
  const x1 = q.width / 2;
  const back = totalDepth / 2;
  const mainFront = back - q.depth;
  const front = -totalDepth / 2;
  const underside = q.height - 30;
  const overlap = 5;
  const inset = 65;
  const tops = [];
  const frame = [];

  tops.push(box(x0, x1, mainFront, back, underside, q.height));

  let returnX0;
  let returnX1;
  if (isL) {
    returnX0 = q.cornerSide === 'left' ? x0 : x1 - q.depth;
    returnX1 = returnX0 + q.depth;

    // The return joins the main top with a 5 mm overlap.
    tops.push(
      box(returnX0, returnX1, front, mainFront + overlap, underside, q.height)
    );
  }

  function leg(x, y) {
    if (!q.heightAdjustable) {
      const width = q.variant === 'standing' ? 70 : 50;
      frame.push(
        box(
          x - width / 2, x + width / 2,
          y - width / 2, y + width / 2,
          0, underside + overlap
        )
      );
      return;
    }

    const sleeveTop = 0.55 * underside;
    const sleeve = booleans.subtract(
      box(x - 40, x + 40, y - 40, y + 40, 0, sleeveTop),
      box(x - 35, x + 35, y - 35, y + 35, 5, sleeveTop + overlap)
    );

    // A collar connects the narrower upper column to the hollow sleeve.
    const collar = box(
      x - 40, x + 40, y - 40, y + 40,
      sleeveTop - overlap, sleeveTop
    );
    const column = box(
      x - 30, x + 30, y - 30, y + 30,
      sleeveTop - overlap, underside + overlap
    );
    frame.push(booleans.union(sleeve, collar, column));
  }

  for (const x of [x0 + inset, x1 - inset]) {
    for (const y of [mainFront + inset, back - inset]) {
      leg(x, y);
    }
  }

  if (isL) {
    for (const x of [returnX0 + inset, returnX1 - inset]) {
      leg(x, front + inset);
    }
  }

  if (q.drawers > 0) {
    const onLeft = !isL || q.cornerSide === 'right';
    const cabinetX0 = onLeft ? x0 + 100 : x1 - 100 - 360;
    const cabinetX1 = cabinetX0 + 360;
    const cabinetFront = mainFront + 50;
    const cabinetBack = back - 50;
    const cabinetBottom = underside - (q.drawers * 100 + 30);
    const wall = 18;

    if (cabinetBottom < 0) {
      throw new Error(
        `The ${q.drawers * 100 + 30} mm drawer pedestal cannot fit below a ${q.height} mm desktop.`
      );
    }

    // A housing open at the front and top; the desktop closes its top.
    const housing = booleans.subtract(
      box(
        cabinetX0, cabinetX1, cabinetFront, cabinetBack,
        cabinetBottom, underside + overlap
      ),
      box(
        cabinetX0 + wall, cabinetX1 - wall,
        cabinetFront - overlap, cabinetBack - wall,
        cabinetBottom + wall, underside + 2 * overlap
      )
    );
    frame.push(housing);

    for (let i = 0; i < q.drawers; i += 1) {
      const z0 = cabinetBottom + wall + i * 100;
      const z1 = z0 + 97;
      const frontPanel = box(
        cabinetX0 + wall - overlap,
        cabinetX1 - wall + overlap,
        cabinetFront,
        cabinetFront + wall,
        z0,
        z1
      );
      const pull = box(
        (cabinetX0 + cabinetX1) / 2 - 50,
        (cabinetX0 + cabinetX1) / 2 + 50,
        cabinetFront - overlap,
        cabinetFront + 6,
        z1 - 35,
        z1 - 20
      );
      frame.push(booleans.subtract(frontPanel, pull));
    }
  }

  return {
    top: combine(tops),
    frame: combine(frame),
  };
}