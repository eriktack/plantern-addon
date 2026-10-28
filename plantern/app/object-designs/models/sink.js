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
// ASSUMED: With a tap the deck behind the bowls is 70 mm deep, so the tap stands on the sink (kitchen sinks with a tap hole); the outer size does not change.
// ASSUMED: Bowl walls are 5 mm thick and bottoms 6 mm thick (robust simplified metal basin).
// ASSUMED: Internal bowl corners have 20 mm radius; external bowl corners have 25 mm radius (consistent wall thickness).
// ASSUMED: Bowl bodies enter the rim by 5 mm (connected overlapping joints).
// ASSUMED: Drain holes are 45 mm in diameter and located 15% of the opening depth behind its centre (recognisable outlets).
// ASSUMED: Left and right drains are offset by 22% of each opening width; centre drains are centred in x (effective drainSide control).
// ASSUMED: Each drain is covered by a 60 mm strainer plate, 2 mm proud of the bowl bottom, with six 6 mm holes.
// ASSUMED: The drainer runs from the rim end to 24 mm short of the bowls, is pressed 3 mm into the rim and has 2 mm deep grooves every 30 mm, running toward the bowls.
// ASSUMED: Tap sizes: a 50 mm base disc 10 mm high; lever mixer body 44 mm across and 150 mm high, spout 22 mm across reaching 200 mm, lever 80 mm long;
//          gooseneck riser 200 mm high with a 90 mm bend radius (80 mm on the bridge) and a 40 mm outlet; bridge pillars 200 mm apart, 90 mm high, with cross handles and a gooseneck from the bridge.
// ASSUMED: A corner tap stands 45 mm in from the rim end; a bridge tap is kept inside the rim.
// ASSUMED: An inset sink rests 15 mm of its rim on the worktop, so its cutout is the rim less 15 mm on every side with 5 mm corners; a freestanding utility tub needs no cutout.
// ASSUMED: All rounded basin components and drain holes use 32 segments; the tap 16 to 24.
// ASSUMED: Waste pipes and installation hardware are omitted.
// UNSURE: drainSide could refer to a draining board; here it selects the outlet position within each bowl (the draining board is drainer).
// UNSURE: bowls is authoritative even when it differs from the variant name (explicit parameter overrides).
// UNSURE: Utility legs can be explicitly disabled, in which case height describes the unsupported basin alone.
// UNSURE: The Legs material control is exposed only for utility_tub, although optional legs on other variants still return frame geometry.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'sink',
  name: 'Sink',
  summary: 'A kitchen sink with one or two bowls, a drainer and a mixer tap, or a freestanding utility sink.',
  description:
    'An open sink basin with configurable bowls, drain positions, an optional ribbed drainer and a mixer tap (lever, gooseneck or bridge), optionally supported on four legs, facing -y. Assumed: width and depth describe the outside rim; height is the rim (the tap stands above it) and includes supports when legs are enabled, otherwise it describes the basin alone; supported basin depth is nominally 300 mm for utility tubs and 200 mm otherwise, limited to height minus 80 mm; rim thickness 8 mm and outside corner radius 20 mm; openings inset 20 mm (70 mm at the back with a tap, the tap deck) with a 24 mm bridge between bowls; walls 5 mm and bottoms 6 mm thick; internal/external bowl corner radii 20/25 mm; bowl bodies overlap the rim by 5 mm; drain diameter 45 mm, positioned 15% of opening depth behind centre and offset in x by 22% of opening width for left/right drains, covered by a 60 mm strainer plate; the drainer is pressed 3 mm into the rim with 2 mm grooves every 30 mm; tap base 50 mm, lever mixer 150 mm high with a 200 mm spout, gooseneck 200 mm riser and 90 mm bend, bridge pillars 200 mm apart; a corner tap stands 45 mm in from the rim end; an inset sink needs a cutout of the rim less 15 mm per side; four 30 mm square legs centred 45 mm inside rim edges and entering basin bottoms by 5 mm; frame rails 20 mm square, located between 35 mm and 15 mm below the basin bottom, entering legs by 5 mm; waste pipes and installation hardware omitted.',
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
      max: 1400,
      step: 10,
      hint: 'The whole rim, drainer included.',
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 450,
      min: 380,
      max: 600,
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
      labels: { left: 'Left', center: 'Centre', right: 'Right' },
      default: 'center',
    },
    {
      key: 'drainer',
      label: 'Drainer',
      type: 'enum',
      options: ['none', 'left', 'right'],
      labels: { none: 'None', left: 'Left', right: 'Right' },
      default: 'none',
      hint: 'A ribbed draining board beside the bowls.',
      appliesTo: ['single_bowl', 'double_bowl'],
    },
    {
      key: 'drainerWidth',
      label: 'Drainer width',
      unit: 'mm',
      default: 400,
      min: 250,
      max: 600,
      step: 10,
      hint: 'From the end of the rim to the bowls.',
      appliesTo: ['single_bowl', 'double_bowl'],
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 200,
      min: 150,
      max: 950,
      step: 10,
      hint: 'To the rim; the tap stands above it.',
    },
    {
      key: 'legs',
      label: 'Legs',
      type: 'boolean',
      default: false,
    },
    {
      key: 'tap',
      label: 'Tap',
      type: 'boolean',
      default: true,
    },
    {
      key: 'tapStyle',
      label: 'Tap style',
      type: 'enum',
      options: ['lever', 'high_spout', 'bridge'],
      labels: { lever: 'Single lever', high_spout: 'High spout (gooseneck)', bridge: 'Bridge (two handles)' },
      default: 'lever',
    },
    {
      key: 'tapPosition',
      label: 'Tap position',
      type: 'enum',
      options: ['behind', 'left', 'right'],
      labels: { behind: 'Behind the bowls', left: 'Back left corner', right: 'Back right corner' },
      default: 'behind',
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
    { key: 'tap', label: 'Tap', needs: 'tap', defaultMaterial: 'metal' },
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
  // The tap stands above the rim, so the height is an option but not the model's height.
  sizeParams: { x: 'width', y: 'depth' },
  // a kitchen sink is set into a worktop (a surface, decision 284); the utility tub stands on the floor
  placement: {
    mount: 'floor',
    z: 710,
    hosts: ['room', 'wall', 'surface'],
    variants: { utility_tub: { mount: 'floor', hosts: ['room', 'wall'] } },
  },
};

const RIM_MARGIN = 20;
const TAP_DECK = 70;
const BRIDGE = 24;
const CUTOUT_REST = 15;

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

    // An option that does not apply to this variant keeps its default and is not checked.
    if (definition.appliesTo && !definition.appliesTo.includes(variant)) {
      q[key] = definition.default;
      continue;
    }

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

/** Where the bowls and the drainer lie on the rim, in mm in the model's own axes. */
function layout(q) {
  const w = q.width;
  const d = q.depth;
  const back = q.tap ? TAP_DECK : RIM_MARGIN;
  const frontY = -d / 2 + RIM_MARGIN;
  const backY = d / 2 - back;

  // The bowls take the rim between its margins, less the drainer and the bridge beside it.
  let bowlsX0 = -w / 2 + RIM_MARGIN;
  let bowlsX1 = w / 2 - RIM_MARGIN;
  let drainer = null;
  if (q.drainer === 'left') {
    drainer = { x0: -w / 2 + RIM_MARGIN, x1: -w / 2 + q.drainerWidth - BRIDGE };
    bowlsX0 = -w / 2 + q.drainerWidth;
  } else if (q.drainer === 'right') {
    drainer = { x0: w / 2 - q.drainerWidth + BRIDGE, x1: w / 2 - RIM_MARGIN };
    bowlsX1 = w / 2 - q.drainerWidth;
  }

  const openingWidth = (bowlsX1 - bowlsX0 - (q.bowls - 1) * BRIDGE) / q.bowls;
  const openingDepth = backY - frontY;
  const centersX = [];
  for (let i = 0; i < q.bowls; i += 1) {
    centersX.push(bowlsX0 + openingWidth / 2 + i * (openingWidth + BRIDGE));
  }

  return {
    openingWidth,
    openingDepth,
    openingY: (frontY + backY) / 2,
    centersX,
    bowlsX: [bowlsX0, bowlsX1],
    drainer,
    tapY: d / 2 - back / 2,
  };
}

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function roundedPrism(width, depth, radius, centerX, bottom, top, centerY = 0) {
  const height = top - bottom;
  const centerZ = (bottom + top) / 2;
  const pieces = [
    primitives.cuboid({
      size: [width - 2 * radius, depth, height],
      center: [centerX, centerY, centerZ],
    }),
    primitives.cuboid({
      size: [width, depth - 2 * radius, height],
      center: [centerX, centerY, centerZ],
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
            centerY + sy * (depth / 2 - radius),
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

function column(radius, x, y, z0, z1, segments = 24) {
  return primitives.cylinder({ radius, height: z1 - z0, center: [x, y, (z0 + z1) / 2], segments });
}

/**
 * A gooseneck: a half bend of radius `bend` that starts going up at (x, y, z) and comes down `2 × bend` toward the front, then an
 * outlet `drop` mm down. The pipe is `radius` thick.
 */
function gooseneck(radius, bend, x, y, z, drop) {
  // The torus lies flat round z; half of it is turned to stand in the y–z plane, from the back (+y) over the top to the front.
  const arc = primitives.torus({
    innerRadius: radius,
    outerRadius: bend,
    innerSegments: 16,
    outerSegments: 24,
    outerRotation: Math.PI,
  });
  const standing = transforms.rotateZ(Math.PI / 2, transforms.rotateX(Math.PI / 2, arc));
  const placed = transforms.translate([x, y - bend, z], standing);
  const outlet = column(radius, x, y - 2 * bend, z - drop, z + 1, 16);
  const nozzle = column(radius + 2, x, y - 2 * bend, z - drop - 15, z - drop + 5, 16);
  return [placed, outlet, nozzle];
}

function buildTap(q, l, deckZ) {
  const baseR = 25;
  const style = q.tapStyle;
  const halfSpan = style === 'bridge' ? 100 + 18 : baseR;
  let x;
  if (q.tapPosition === 'behind') x = (l.bowlsX[0] + l.bowlsX[1]) / 2;
  else x = (q.tapPosition === 'left' ? -1 : 1) * (q.width / 2 - 45 - (halfSpan - baseR));
  // Keep the whole tap inside the rim.
  const limit = q.width / 2 - 5 - halfSpan;
  x = Math.max(-limit, Math.min(limit, x));
  const y = l.tapY;
  const z0 = deckZ - 1;
  const pieces = [];

  if (style === 'lever') {
    pieces.push(column(baseR, x, y, z0, deckZ + 10));
    pieces.push(column(22, x, y, deckZ + 5, deckZ + 150));
    // the spout runs forward from the body, with a nozzle at its end
    pieces.push(transforms.translate([x, y - 100, deckZ + 110],
      transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: 11, height: 200, segments: 16 }))));
    pieces.push(column(12, x, y - 195, deckZ + 80, deckZ + 112, 16));
    // the lever on top, tilted up toward the back
    pieces.push(column(18, x, y, deckZ + 145, deckZ + 170));
    pieces.push(transforms.translate([x, y - 35, deckZ + 172],
      transforms.rotateX(-0.25, primitives.cuboid({ size: [12, 80, 10] }))));
  } else if (style === 'high_spout') {
    pieces.push(column(baseR, x, y, z0, deckZ + 10));
    pieces.push(column(20, x, y, deckZ + 5, deckZ + 60));
    pieces.push(column(12, x, y, deckZ + 55, deckZ + 201, 16));
    pieces.push(...gooseneck(12, 90, x, y, deckZ + 200, 40));
    // a side lever on the body, on the side toward the middle of the sink so it stays inside the rim
    const side = x > 0 ? -1 : 1;
    pieces.push(transforms.translate([x + side * 40, y, deckZ + 45],
      transforms.rotateY(Math.PI / 2, primitives.cylinder({ radius: 6, height: 50, segments: 16 }))));
  } else {
    // bridge: two pillars with cross handles, joined by a bridge, the spout rising from its middle
    for (const sx of [-1, 1]) {
      const px = x + sx * 100;
      pieces.push(column(baseR - 5, px, y, z0, deckZ + 10));
      pieces.push(column(16, px, y, deckZ + 5, deckZ + 95));
      pieces.push(primitives.cuboid({ size: [70, 10, 10], center: [px, y, deckZ + 100] }));
      pieces.push(primitives.cuboid({ size: [10, 70, 10], center: [px, y, deckZ + 100] }));
      pieces.push(column(8, px, y, deckZ + 90, deckZ + 102, 16));
    }
    pieces.push(transforms.translate([x, y, deckZ + 60],
      transforms.rotateY(Math.PI / 2, primitives.cylinder({ radius: 11, height: 205, segments: 16 }))));
    pieces.push(column(11, x, y, deckZ + 55, deckZ + 151, 16));
    pieces.push(...gooseneck(11, 80, x, y, deckZ + 150, 35));
  }

  return booleans.union(...pieces);
}

export function build(p = {}) {
  const q = resolve(p);
  const overlap = 5;
  const rimThickness = 8;
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

  const l = layout(q);
  const { openingWidth, openingDepth, openingY } = l;

  if (
    openingWidth <= 2 * innerRadius ||
    openingDepth <= 2 * innerRadius ||
    basinDepth <= floorThickness + rimThickness
  ) {
    throw new Error(
      `A ${q.width} mm by ${q.depth} mm sink with ${q.bowls} bowls${q.drainer === 'none' ? '' : ` and a ${q.drainerWidth} mm drainer`} and ${basinDepth} mm basin depth leaves no room for its bowls inside the 20 mm rim, the ${q.tap ? '70 mm tap deck' : 'back rim'} and the 24 mm bridge.`
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
  const strainers = [];
  const frame = [];

  const drainOffset = q.drainSide === 'left'
    ? -0.22
    : q.drainSide === 'right' ? 0.22 : 0;
  const floorTop = basinBottom + floorThickness;

  for (const centerX of l.centersX) {
    // Each separate bowl body enters the common rim by 5 mm.
    solids.push(
      roundedPrism(
        openingWidth + 2 * wall,
        openingDepth + 2 * wall,
        outerRadius,
        centerX,
        basinBottom,
        q.height - rimThickness + overlap,
        openingY
      )
    );

    const drainX = centerX + drainOffset * openingWidth;
    const drainY = openingY + 0.15 * openingDepth;
    cuts.push(
      roundedPrism(
        openingWidth,
        openingDepth,
        innerRadius,
        centerX,
        floorTop,
        q.height + overlap,
        openingY
      ),
      primitives.cylinder({
        radius: drainRadius,
        height: floorThickness + 2 * overlap,
        center: [drainX, drainY, basinBottom + floorThickness / 2],
        segments: 32,
      })
    );

    // A strainer plate over the drain, resting 1 mm into the bowl bottom, with a ring of holes.
    const plate = column(30, drainX, drainY, floorTop - 1, floorTop + 2, 32);
    const holes = [];
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * 2 * Math.PI;
      holes.push(column(3, drainX + 14 * Math.cos(a), drainY + 14 * Math.sin(a), floorTop - 2, floorTop + 3, 12));
    }
    strainers.push(booleans.subtract(plate, ...holes));
  }

  if (l.drainer) {
    // The drainer is pressed 3 mm into the rim, with grooves running toward the bowls.
    const { x0, x1 } = l.drainer;
    const y0 = openingY - openingDepth / 2;
    const y1 = openingY + openingDepth / 2;
    cuts.push(roundedPrism(x1 - x0, y1 - y0, 15, (x0 + x1) / 2, q.height - 3, q.height + overlap, (y0 + y1) / 2));
    for (let gy = y0 + 30; gy <= y1 - 25; gy += 30) {
      cuts.push(box(x0 + 25, x1 - 25, gy - 1.5, gy + 1.5, q.height - 5, q.height));
    }
  }

  const basin = combine([booleans.subtract(combine(solids), ...cuts), ...strainers]);

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
    tap: q.tap ? buildTap(q, l, q.height) : geometries.geom3.create(),
  };
}

/**
 * The height of this sink above its bottom that rests on the worktop it is set into (decision 284): an inset sink hangs in its
 * hole by its rim, so the rim's underside; a freestanding utility tub stands on the floor (0).
 */
export function rest(p = {}) {
  const q = resolve(p);
  return q.variant === 'utility_tub' ? 0 : q.height - 8;
}

/**
 * The hole this sink needs in a worktop (docs/archive/2026-10-28-kitchen.md, decision 284), in mm in the model's own axes: a list of
 * `{ x, y, width, depth, radius }` (the middle of the hole, its size and its corner radius). An inset sink rests 15 mm of its rim
 * on the worktop; a freestanding utility tub needs none.
 */
export function cutout(p = {}) {
  const q = resolve(p);
  if (q.variant === 'utility_tub') return [];
  return [{
    x: 0,
    y: 0,
    width: q.width - 2 * CUTOUT_REST,
    depth: q.depth - 2 * CUTOUT_REST,
    radius: 20 - CUTOUT_REST,
  }];
}
