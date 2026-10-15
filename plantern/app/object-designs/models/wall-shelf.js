import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width and depth are the complete model footprint (predictable sizing).
// ASSUMED: All shelf boards and hat-shelf slats are 20 mm thick (timber construction).
// ASSUMED: shelfSpacing is measured between successive shelf bottoms (consistent vertical pitch).
// ASSUMED: Plain shelves use two upward-mounted L brackets per board, centred 50 mm from the ends (keeps the model bottom at the lowest shelf).
// ASSUMED: Plain bracket arms are 20 mm wide and 10 mm high, starting 15 mm behind the shelf front and overlapping the shelf top by 5 mm (connected support).
// ASSUMED: Plain bracket wall tabs are 10 mm deep and rise 100 mm above the shelf top, overlapping the arms by 5 mm (wall attachment).
// ASSUMED: String side panels use 10 mm diameter wires; their centre lines are 5 mm inside the overall footprint (thin wire construction).
// ASSUMED: String boards end at the wire centre lines, leaving 5 mm edge insets (boards between the panels).
// ASSUMED: String panels extend 80 mm above the highest shelf, starting at z = 0 (continuous side frames).
// ASSUMED: String rungs are centred halfway through each shelf, with intermediate rungs at no more than 100 mm pitch and a final rung 10 mm below the panel top (ladder-like panels).
// ASSUMED: Hat shelves have one slatted surface with its bottom at 140 mm (space for coats and hooks below).
// ASSUMED: Hat-shelf slats run along x, are at most 60 mm wide in y and have 10 mm gaps (ventilated hat storage).
// ASSUMED: The hat-shelf hook rail is 30 mm high and 20 mm deep, inset 20 mm from each side (low mounting rail).
// ASSUMED: Hat-shelf uprights and support arms are 20 mm wide; uprights are 20 mm deep and arms 10 mm high (simple wall brackets).
// ASSUMED: Hat-shelf supports are centred 35 mm from the ends, overlapping the rail, arms and slats by 5 mm (connected support).
// ASSUMED: Hooks have 5 mm radius; their horizontal arms run from 15 mm to 100 mm forward of the back, at z = 15 mm (usable coat hooks).
// ASSUMED: Hook upturns run from z = 15 mm to 45 mm, overlapping the horizontal arms by 5 mm (raised hook tips).
// ASSUMED: Multiple hooks span between positions 40 mm from each end; a single hook is centred (even distribution).
// ASSUMED: Small round wire and hook parts use 16 segments (small-part resolution).
// ASSUMED: Fasteners, screw holes and decorative end caps are omitted (simplified solid geometry).
// UNSURE: Ordinary shelf brackets usually extend below the boards; upward-mounted brackets are used to honour the specified lowest-shelf bottom.
// UNSURE: Hat-shelf shelf count and spacing are not meaningful; those controls apply only to plain and String variants.
// UNSURE: String wire dimensions and hat-shelf rail elevation are unspecified; realistic fixed construction sizes are chosen.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'wall-shelf',
  name: 'Wall shelf',
  summary: 'Wall-mounted shelves with bracketed, String-style and hooked hat-shelf variants.',
  description:
    'A wall shelf facing -y, with its back against the wall at +y and its bottom at the lowest shelf or hat-shelf hook rail. Assumed: width and depth describe the complete footprint; boards and slats 20 mm thick; shelfSpacing measured between shelf bottoms; plain shelves use two upward-mounted L brackets centred 50 mm from the ends, with 20 mm wide by 10 mm high arms starting 15 mm behind the front and overlapping shelf tops by 5 mm; wall tabs 10 mm deep and rising 100 mm above shelf tops with 5 mm arm overlap; String wires 10 mm diameter with centre lines 5 mm inside the footprint, and boards ending at those centre lines; String panels start at z = 0 and extend 80 mm above the highest shelf; rungs centred halfway through boards with intermediate pitch no greater than 100 mm and the final rung 10 mm below the panel top; hat-shelf slat bottoms at 140 mm, slats running along x with widths at most 60 mm and 10 mm gaps; hook rail 30 mm high and 20 mm deep, inset 20 mm from the sides; hat-shelf supports 20 mm wide, uprights 20 mm deep and arms 10 mm high, centred 35 mm from the ends with 5 mm overlaps at rail, arm and slat joints; hooks radius 5 mm with horizontal arms from 15 mm to 100 mm forward of the back at z = 15 mm and upturns from z = 15 mm to 45 mm; multiple hooks distributed between positions 40 mm from the ends and a single hook centred; small round parts use 16 segments; fasteners, screw holes and decorative caps omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['plain', 'string', 'hat_shelf'],
      labels: {
        plain: 'Bracketed shelves',
        string: 'String-style shelves',
        hat_shelf: 'Hat shelf',
      },
      default: 'plain',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 800,
      min: 400,
      max: 2000,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 250,
      min: 150,
      max: 400,
      step: 10,
    },
    {
      key: 'shelves',
      label: 'Shelves',
      type: 'integer',
      default: 1,
      min: 1,
      max: 5,
      appliesTo: ['plain', 'string'],
    },
    {
      key: 'shelfSpacing',
      label: 'Shelf spacing',
      unit: 'mm',
      default: 300,
      min: 200,
      max: 400,
      step: 10,
      appliesTo: ['plain', 'string'],
    },
    {
      key: 'hooks',
      label: 'Hooks',
      type: 'integer',
      default: 0,
      min: 0,
      max: 12,
      appliesTo: ['hat_shelf'],
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'oak',
    },
  ],
  parts: [
    { key: 'shelves', label: 'Shelves' },
    { key: 'brackets', label: 'Brackets, side panels and hooks' },
  ],
  variantDefaults: {
    string: { shelves: 3, depth: 300 },
    hat_shelf: { width: 1000, depth: 300, shelves: 1, hooks: 6 },
  },
  placement: {
    mount: 'wall',
    z: 1500,
    variants: {
      string: { mount: 'wall', z: 900 },
      hat_shelf: { mount: 'wall', z: 1650 },
    },
  },
};

function resolve(p) {
  const variant = p.variant ?? 'plain';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error('Unknown wall-shelf variant; choose plain, string or hat_shelf.');
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Material and parameters hidden for this variant are never read.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;
    if (definition.appliesTo && !definition.appliesTo.includes(variant)) continue;

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

function verticalRod(radius, x, y, bottom, top) {
  return primitives.cylinder({
    radius,
    height: top - bottom,
    center: [x, y, (bottom + top) / 2],
    segments: 16,
  });
}

function depthRod(radius, x, front, back, z) {
  const rod = primitives.cylinder({
    radius,
    height: back - front,
    center: [0, 0, 0],
    segments: 16,
  });
  return transforms.translate(
    [x, (front + back) / 2, z],
    transforms.rotateX(Math.PI / 2, rod)
  );
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

export function build(p = {}) {
  const q = resolve(p);
  const x0 = -q.width / 2;
  const x1 = q.width / 2;
  const front = -q.depth / 2;
  const back = q.depth / 2;
  const thickness = 20;
  const overlap = 5;
  const shelves = [];
  const brackets = [];

  if (q.variant === 'plain') {
    for (let i = 0; i < q.shelves; i += 1) {
      const bottom = i * q.shelfSpacing;
      const top = bottom + thickness;
      shelves.push(box(x0, x1, front, back, bottom, top));

      for (const x of [x0 + 50, x1 - 50]) {
        // Above-board bracket arms overlap the shelf by 5 mm.
        brackets.push(
          box(x - 10, x + 10, front + 15, back, top - overlap, top + 5),
          box(x - 10, x + 10, back - 10, back, top, top + 100)
        );
      }
    }
  } else if (q.variant === 'string') {
    const wireRadius = 5;
    const panelTop = (q.shelves - 1) * q.shelfSpacing + thickness + 80;
    const rungAnchors = [];

    for (let i = 0; i < q.shelves; i += 1) {
      const bottom = i * q.shelfSpacing;
      shelves.push(
        box(
          x0 + wireRadius,
          x1 - wireRadius,
          front + wireRadius,
          back - wireRadius,
          bottom,
          bottom + thickness
        )
      );
      rungAnchors.push(bottom + thickness / 2);
    }
    rungAnchors.push(panelTop - 10);

    // Include each shelf-support rung and subdivide longer gaps.
    const rungHeights = [rungAnchors[0]];
    for (let i = 1; i < rungAnchors.length; i += 1) {
      const lower = rungAnchors[i - 1];
      const upper = rungAnchors[i];
      const intervals = Math.ceil((upper - lower) / 100);

      for (let j = 1; j <= intervals; j += 1) {
        rungHeights.push(lower + (upper - lower) * j / intervals);
      }
    }

    for (const x of [x0 + wireRadius, x1 - wireRadius]) {
      for (const y of [front + wireRadius, back - wireRadius]) {
        brackets.push(verticalRod(wireRadius, x, y, 0, panelTop));
      }
      for (const z of rungHeights) {
        brackets.push(
          depthRod(wireRadius, x, front + wireRadius, back - wireRadius, z)
        );
      }
    }
  } else {
    const shelfBottom = 140;
    const slatGap = 10;
    const slatCount = Math.ceil((q.depth + slatGap) / (60 + slatGap));
    const slatWidth = (q.depth - (slatCount - 1) * slatGap) / slatCount;

    for (let i = 0; i < slatCount; i += 1) {
      const y = front + i * (slatWidth + slatGap);
      shelves.push(
        box(x0, x1, y, y + slatWidth, shelfBottom, shelfBottom + thickness)
      );
    }

    // The hook rail defines the bottom of the complete model.
    brackets.push(box(x0 + 20, x1 - 20, back - 20, back, 0, 30));

    for (const x of [x0 + 35, x1 - 35]) {
      brackets.push(
        // Upright overlaps the rail by 5 mm.
        box(x - 10, x + 10, back - 20, back, 25, shelfBottom),
        // Support arm overlaps both upright and slats by 5 mm.
        box(
          x - 10, x + 10,
          front, back,
          shelfBottom - overlap, shelfBottom + overlap
        )
      );
    }

    for (let i = 0; i < q.hooks; i += 1) {
      const x = q.hooks === 1
        ? 0
        : x0 + 40 + (q.width - 80) * i / (q.hooks - 1);

      brackets.push(
        depthRod(5, x, back - 100, back - 15, 15),
        verticalRod(5, x, back - 100, 15, 45)
      );
    }
  }

  return {
    shelves: combine(shelves),
    brackets: combine(brackets),
  };
}