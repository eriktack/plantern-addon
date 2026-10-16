import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// FIX: The frame part is marked appliesTo: ['utility_tub'], so the default
// unsupported sink does not advertise an active Legs material control.
// Optional legs still follow the legs parameter on every variant.
// When legs are disabled, frame remains an empty geometry as required.

// ASSUMED: Width and depth describe the outside rim; height is the rim elevation above the model bottom (consistent overall dimensions).
// ASSUMED: With legs enabled, height includes the legs for every variant; without legs, height describes the basin alone (consistent legs option).
// ASSUMED: Supported utility basins are nominally 300 mm deep; other supported basins are nominally 200 mm deep (typical sink proportions).
// ASSUMED: Supported basin depth is limited to height minus 80 mm (preserves positive floor supports at low heights).
// ASSUMED: The outside rim is 8 mm thick with 20 mm corner radii (rounded mounting flange).
// ASSUMED: Bowl openings are inset 20 mm from the overall rim edges and separated by a 24 mm bridge (mounting surface and bowl separation).
// ASSUMED: Bowl walls are 5 mm thick and bottoms 6 mm thick (robust simplified metal basin).
// ASSUMED: Internal bowl corners have 20 mm radius; external bowl corners have 25 mm radius (consistent wall thickness).
// ASSUMED: Bowl bodies enter the rim by 5 mm (connected overlapping joints).
// ASSUMED: Drain holes are 45 mm in diameter and located 15% of the opening depth behind its centre (recognisable outlets).
// ASSUMED: Left and right drains are offset by 22% of each opening width; centre drains are centred in x (effective drainSide control).
// ASSUMED: Four legs are 30 mm square, with centres 45 mm inside the outside rim edges (floor-standing support).
// ASSUMED: Legs enter basin bottoms by 5 mm (connected support).
// ASSUMED: Four 20 mm square frame rails sit between 35 mm and 15 mm below the basin bottom and enter the legs by 5 mm (rigid support frame).
// ASSUMED: All rounded basin components and drain holes use 32 segments (round furniture-part resolution).
// ASSUMED: Taps, waste pipes, strainers, worktops and installation hardware are omitted (sink only).
// UNSURE: drainSide could refer to a draining board; here it selects the outlet position within each bowl.
// UNSURE: bowls is authoritative even when it differs from the variant name (explicit parameter overrides).
// UNSURE: Utility legs can be explicitly disabled, in which case height describes the unsupported basin alone.
// UNSURE: The Legs material control is exposed only for utility_tub, although optional legs on other variants still return frame geometry.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'sink',
  name: 'Sink',
  summary: 'A single-bowl, double-bowl or freestanding utility sink with optional legs.',
  description:
    'An open sink basin with configurable bowls and drain positions, optionally supported on four legs, facing -y. Assumed: width and depth describe the outside rim; height includes supports when legs are enabled and otherwise describes the basin alone; supported basin depth is nominally 300 mm for utility tubs and 200 mm otherwise, limited to height minus 80 mm; rim thickness 8 mm and outside corner radius 20 mm; openings inset 20 mm with a 24 mm bridge between bowls; walls 5 mm and bottoms 6 mm thick; internal/external bowl corner radii 20/25 mm; bowl bodies overlap the rim by 5 mm; drain diameter 45 mm, positioned 15% of opening depth behind centre and offset in x by 22% of opening width for left/right drains; four 30 mm square legs centred 45 mm inside rim edges and entering basin bottoms by 5 mm; frame rails 20 mm square, located between 35 mm and 15 mm below the basin bottom, entering legs by 5 mm; rounded basin components and drain holes use 32 segments; taps, waste pipes, strainers, worktops and installation hardware omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['single_bowl', 'double_bowl', 'utility_tub'],
      labels: {
        single_bowl: 'Single bowl',
        double_bowl: 'Double bowl',
        utility_tub: 'Utility tub',
      },
      default: 'single_bowl',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 600,
      min: 400,
      max: 1000,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 450,
      min: 380,
      max: 500,
      step: 10,
    },
    {
      key: 'bowls',
      label: 'Bowls',
      type: 'integer',
      default: 1,
      min: 1,
      max: 2,
    },
    {
      key: 'drainSide',
      label: 'Drain side',
      type: 'enum',
      options: ['left', 'center', 'right'],
      default: 'center',
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 200,
      min: 150,
      max: 950,
      step: 10,
    },
    {
      key: 'legs',
      label: 'Legs',
      type: 'boolean',
      default: false,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'metal',
    },
  ],
  parts: [
    { key: 'basin', label: 'Basin' },
    {
      key: 'frame',
      label: 'Legs',
      appliesTo: ['utility_tub'],
      needs: 'legs',
    },
  ],
  variantDefaults: {
    double_bowl: { bowls: 2, width: 800 },
    utility_tub: {
      width: 600,
      depth: 500,
      height: 900,
      legs: true,
      bowls: 1,
    },
  },
  placement: {
    mount: 'floor',
    z: 710,
    variants: { utility_tub: { mount: 'floor' } },
  },
};

function resolve(p) {
  const variant = p.variant ?? 'single_bowl';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown sink variant; choose single_bowl, double_bowl or utility_tub.'
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

    if (definition.type === 'enum') {
      if (!definition.options.includes(value)) {
        throw new Error(
          `${definition.label} must be one of: ${definition.options.join(', ')}.`
        );
      }
    } else if (definition.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new Error(`${definition.label} must be true or false.`);
      }
    } else if (definition.type === 'integer') {
      if (
        !Number.isInteger(value) ||
        value < definition.min ||
        value > definition.max
      ) {
        throw new Error('Bowls must be an integer from 1 to 2.');
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

function roundedPrism(width, depth, radius, centerX, bottom, top) {
  const height = top - bottom;
  const centerZ = (bottom + top) / 2;
  const pieces = [
    primitives.cuboid({
      size: [width - 2 * radius, depth, height],
      center: [centerX, 0, centerZ],
    }),
    primitives.cuboid({
      size: [width, depth - 2 * radius, height],
      center: [centerX, 0, centerZ],
    }),
  ];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      pieces.push(
        primitives.cylinder({
          radius,
          height,
          center: [
            centerX + sx * (width / 2 - radius),
            sy * (depth / 2 - radius),
            centerZ,
          ],
          segments: 32,
        })
      );
    }
  }

  return booleans.union(...pieces);
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

export function build(p = {}) {
  const q = resolve(p);
  const overlap = 5;
  const rimThickness = 8;
  const rimMargin = 20;
  const bridge = 24;
  const wall = 5;
  const floorThickness = 6;
  const innerRadius = 20;
  const outerRadius = 25;
  const drainRadius = 22.5;

  const nominalBasinDepth = q.variant === 'utility_tub' ? 300 : 200;
  const basinDepth = q.legs
    ? Math.min(nominalBasinDepth, q.height - 80)
    : q.height;
  const basinBottom = q.height - basinDepth;

  const openingWidth =
    (q.width - 2 * rimMargin - (q.bowls - 1) * bridge) / q.bowls;
  const openingDepth = q.depth - 2 * rimMargin;

  if (
    openingWidth <= 2 * innerRadius ||
    openingDepth <= 2 * innerRadius ||
    basinDepth <= floorThickness + rimThickness
  ) {
    throw new Error(
      `A ${q.width} mm by ${q.depth} mm sink with ${q.bowls} bowls and ${basinDepth} mm basin depth cannot fit the 20 mm rim margins, 24 mm bridge and 6 mm bottom.`
    );
  }

  const solids = [
    roundedPrism(
      q.width,
      q.depth,
      20,
      0,
      q.height - rimThickness,
      q.height
    ),
  ];
  const cuts = [];
  const frame = [];

  const drainOffset = q.drainSide === 'left'
    ? -0.22
    : q.drainSide === 'right' ? 0.22 : 0;

  for (let i = 0; i < q.bowls; i += 1) {
    const centerX =
      -q.width / 2 +
      rimMargin +
      openingWidth / 2 +
      i * (openingWidth + bridge);

    // Each separate bowl body enters the common rim by 5 mm.
    solids.push(
      roundedPrism(
        openingWidth + 2 * wall,
        openingDepth + 2 * wall,
        outerRadius,
        centerX,
        basinBottom,
        q.height - rimThickness + overlap
      )
    );

    cuts.push(
      roundedPrism(
        openingWidth,
        openingDepth,
        innerRadius,
        centerX,
        basinBottom + floorThickness,
        q.height + overlap
      ),
      primitives.cylinder({
        radius: drainRadius,
        height: floorThickness + 2 * overlap,
        center: [
          centerX + drainOffset * openingWidth,
          0.15 * openingDepth,
          basinBottom + floorThickness / 2,
        ],
        segments: 32,
      })
    );
  }

  const basin = booleans.subtract(combine(solids), ...cuts);

  if (q.legs) {
    const legSize = 30;
    const legX = q.width / 2 - 45;
    const legY = q.depth / 2 - 45;
    const legTop = basinBottom + overlap;

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        frame.push(
          primitives.cuboid({
            size: [legSize, legSize, legTop],
            center: [sx * legX, sy * legY, legTop / 2],
          })
        );
      }
    }

    const railBottom = basinBottom - 35;
    const railTop = basinBottom - 15;
    const railStartX = -legX + legSize / 2 - overlap;
    const railEndX = legX - legSize / 2 + overlap;
    const railStartY = -legY + legSize / 2 - overlap;
    const railEndY = legY - legSize / 2 + overlap;

    for (const y of [-legY, legY]) {
      frame.push(
        box(
          railStartX, railEndX,
          y - 10, y + 10,
          railBottom, railTop
        )
      );
    }

    for (const x of [-legX, legX]) {
      frame.push(
        box(
          x - 10, x + 10,
          railStartY, railEndY,
          railBottom, railTop
        )
      );
    }
  }

  return {
    basin,
    frame: combine(frame),
  };
}