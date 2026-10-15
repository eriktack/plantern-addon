import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width, depth and height are overall dimensions, including closed drawer fronts and floor supports (predictable sizing).
// ASSUMED: Carcass sides, top, bottom and column dividers are 18 mm thick; backs are 12 mm thick (typical cabinetry).
// ASSUMED: Drawer fronts are 20 mm thick and enter the carcass by 5 mm (connected closed fronts).
// ASSUMED: Fronts overlap each opening edge by 5 mm; adjacent rows have 3 mm gaps (inset drawer layout).
// ASSUMED: Columns have equal clear widths and rows have equal front heights (regular drawer grid).
// ASSUMED: Chest and tall-boy variants have a 60 mm high solid plinth, inset 25 mm at the sides, 40 mm at the front and 20 mm at the back (recessed floor support).
// ASSUMED: Low-boy variants have four 45 mm square legs, 100 mm high and inset 25 mm from the overall edges (distinct raised construction).
// ASSUMED: The carcass begins 5 mm below the support tops; dividers enter adjacent panels by 5 mm (overlapping joints).
// ASSUMED: Each front has a centred recessed pull 80 mm wide, 12 mm high and 6 mm deep, with its upper edge 18 mm below the front top (integrated handles).
// ASSUMED: Drawers are shown closed; trays, runners, fasteners and anti-tip fittings are omitted (front-focused solid model).
// UNSURE: Variant styling is unspecified; the low boy has exposed legs while the chest and tall boy have recessed plinths.
// UNSURE: Rows and columns are interpreted as a complete rectangular grid rather than a mixture of drawer sizes.
// UNSURE: Variant defaults apply only to omitted parameters; explicitly supplied values always win.
// UNSURE: Tall furniture requires suitable real-world stability and anchoring assessment; this model is not a structural specification.

export const meta = {
  id: 'chest-of-drawers',
  name: 'Chest of drawers',
  summary: 'A chest of drawers with configurable rows and columns in chest, low-boy and tall-boy variants.',
  description:
    'A floor-standing storage chest with closed drawer fronts and recessed pulls. Assumed: width, depth and height are overall dimensions including fronts and supports; carcass sides, top, bottom and dividers 18 mm thick, backs 12 mm thick; fronts 20 mm thick with 5 mm carcass penetration and opening-edge overlap; row gaps 3 mm; columns have equal clear widths and rows equal front heights; chest and tall-boy plinths are solid, 60 mm high and inset 25 mm at the sides, 40 mm at the front and 20 mm at the back; low-boy legs are four 45 mm square posts, 100 mm high and inset 25 mm from overall edges; carcass starts 5 mm below support tops and dividers enter adjacent panels by 5 mm; centred recessed pulls are 80 mm wide, 12 mm high and 6 mm deep with upper edges 18 mm below front tops; drawers are closed and trays, runners, fasteners and anti-tip fittings are omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['chest', 'low_boy', 'tall_boy'],
      labels: {
        chest: 'Chest',
        low_boy: 'Low boy',
        tall_boy: 'Tall boy',
      },
      default: 'chest',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 1000,
      min: 600,
      max: 1800,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 450,
      min: 350,
      max: 550,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 900,
      min: 600,
      max: 2000,
      step: 10,
    },
    {
      key: 'columns',
      label: 'Columns',
      type: 'integer',
      default: 1,
      min: 1,
      max: 3,
    },
    {
      key: 'rows',
      label: 'Rows',
      type: 'integer',
      default: 4,
      min: 2,
      max: 7,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'white-paint',
    },
  ],
  parts: [
    { key: 'carcass', label: 'Carcass' },
    { key: 'drawers', label: 'Drawer fronts' },
  ],
  variantDefaults: {
    low_boy: { height: 700, rows: 3 },
    tall_boy: { height: 1600, rows: 6 },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'chest';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown chest-of-drawers variant; choose chest, low_boy or tall_boy.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Material is deliberately never read or copied.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;

    const value = p[key] ?? defaults[key] ?? definition.default;
    q[key] = value;

    if (definition.type === 'integer') {
      if (
        !Number.isInteger(value) ||
        value < definition.min ||
        value > definition.max
      ) {
        throw new Error(
          `${definition.label} must be an integer from ${definition.min} to ${definition.max}.`
        );
      }
    } else if (
      !Number.isFinite(value) ||
      value < definition.min ||
      value > definition.max
    ) {
      throw new Error(
        `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
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

export function build(p = {}) {
  const q = resolve(p);
  const panel = 18;
  const backThickness = 12;
  const frontThickness = 20;
  const overlap = 5;
  const rowGap = 3;

  const x0 = -q.width / 2;
  const x1 = q.width / 2;
  const front = -q.depth / 2;
  const back = q.depth / 2;

  const raised = q.variant === 'low_boy';
  const supportHeight = raised ? 100 : 60;
  const bodyBottom = supportHeight - overlap;
  const bodyFront = front + frontThickness - overlap;

  const bayWidth = (q.width - (q.columns + 1) * panel) / q.columns;
  const bayPitch = bayWidth + panel;
  const faceBottom = bodyBottom + panel - overlap;
  const faceTop = q.height - panel + overlap;
  const frontHeight =
    (faceTop - faceBottom - (q.rows - 1) * rowGap) / q.rows;

  if (bayWidth <= 0 || frontHeight <= 0) {
    throw new Error(
      `A ${q.width} mm wide, ${q.height} mm high chest cannot fit this grid with ${panel} mm panels and ${rowGap} mm row gaps.`
    );
  }

  const carcassParts = [];
  const drawerParts = [];

  // Open-front hollow housing with continuous side, back, top and bottom panels.
  carcassParts.push(
    booleans.subtract(
      box(x0, x1, bodyFront, back, bodyBottom, q.height),
      box(
        x0 + panel,
        x1 - panel,
        bodyFront - overlap,
        back - backThickness,
        bodyBottom + panel,
        q.height - panel
      )
    )
  );

  if (raised) {
    const legWidth = 45;
    for (const x of [x0 + 25, x1 - 25 - legWidth]) {
      for (const y of [front + 25, back - 25 - legWidth]) {
        carcassParts.push(
          box(x, x + legWidth, y, y + legWidth, 0, supportHeight)
        );
      }
    }
  } else {
    carcassParts.push(
      box(
        x0 + 25,
        x1 - 25,
        front + 40,
        back - 20,
        0,
        supportHeight
      )
    );
  }

  // Interior dividers overlap the top, bottom and back by 5 mm.
  for (let column = 1; column < q.columns; column += 1) {
    const left = x0 + column * bayPitch;
    carcassParts.push(
      box(
        left,
        left + panel,
        bodyFront,
        back - backThickness + overlap,
        bodyBottom + panel - overlap,
        q.height - panel + overlap
      )
    );
  }

  for (let column = 0; column < q.columns; column += 1) {
    const clearLeft = x0 + panel + column * bayPitch;
    const clearRight = clearLeft + bayWidth;
    const leafLeft = clearLeft - overlap;
    const leafRight = clearRight + overlap;
    const pullX = (leafLeft + leafRight) / 2;

    for (let row = 0; row < q.rows; row += 1) {
      const bottom = faceBottom + row * (frontHeight + rowGap);
      const top = bottom + frontHeight;

      const drawerFront = box(
        leafLeft,
        leafRight,
        front,
        front + frontThickness,
        bottom,
        top
      );

      const recessedPull = box(
        pullX - 40,
        pullX + 40,
        front - overlap,
        front + 6,
        top - 18 - 12,
        top - 18
      );

      drawerParts.push(booleans.subtract(drawerFront, recessedPull));
    }
  }

  return {
    carcass: combine(carcassParts),
    drawers: combine(drawerParts),
  };
}