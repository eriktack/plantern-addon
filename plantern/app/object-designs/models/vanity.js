import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// FIX: Wall-mounted geometry now has its own lowest point at local z = 0.
// No dummy feet, pedestal or floor-reaching panel is added.
// FIX: A 250 mm installation lift is carried by wall-mounted placement metadata,
// not by empty space inside the geometry. The installed basin top remains height.

// ASSUMED: Width and depth describe the complete basin rim; height is the installed basin-top elevation (consistent sizing).
// ASSUMED: Wall-mounted cabinets have 250 mm floor clearance and are modelled relative to their mounting elevation (floating installation with local z = 0).
// ASSUMED: Non-pedestal variants have cabinets; pedestal variants have one support per bowl (distinct support construction).
// ASSUMED: Cabinets are inset 10 mm from the basin edges, with 18 mm panels and separators and 12 mm backs (typical cabinetry).
// ASSUMED: Floor cabinets have 80 mm high plinths inset 30 mm at sides, 40 mm at front and 20 mm at back; cabinet bottoms start at 75 mm (5 mm support overlap).
// ASSUMED: Basin depth is 160 mm, rim thickness 25 mm, bowl walls 8 mm and bottoms 12 mm (bathroom basin proportions).
// ASSUMED: Rim corner radius is 20 mm; internal and external bowl corner radii are 20 mm and 28 mm (rounded ceramic construction).
// ASSUMED: Bowl-opening margins are 35 mm at the sides, 45 mm at the front and 90 mm at the back, with a 30 mm inter-bowl bridge (rim and tap-deck space).
// ASSUMED: Bowl bodies enter the rim by 5 mm (connected basin assembly).
// ASSUMED: Drains are 35 mm in diameter, centred 10% of opening depth behind bowl centres (recognisable outlets).
// ASSUMED: Fronts are 20 mm thick with 5 mm carcass penetration and opening-edge overlap (connected closed fronts).
// ASSUMED: Movable fronts finish 15 mm below basin bottoms; a fixed fascia covers the upper basin zone (bowl clearance).
// ASSUMED: Doors divide the width equally; drawers stack full-width; adjacent fronts have 3 mm gaps (simple front layout).
// ASSUMED: Mixed layouts target 100 mm drawer-front heights, reduced to preserve 100 mm door fronts and an 18 mm separator (compact storage).
// ASSUMED: Door-only and drawer-only layouts fill the lower front; zero fronts leaves it open (honours explicit counts).
// ASSUMED: Door pulls are recessed slots 10 by 60 by 6 mm, centred 20 mm from alternating latch edges (compact handles).
// ASSUMED: Drawer pulls are recessed slots 80 by 12 by 6 mm, with upper edges 18 mm below front tops (integrated handles).
// ASSUMED: Pedestal lower and upper x radii are min(100 mm, 40% of opening width) and min(80 mm, 32% of opening width); y radii are 100 mm and 70 mm (slender supports).
// ASSUMED: Pedestals sit 10% of opening depth behind bowl centres and enter bowl bottoms by 5 mm (connected support).
// ASSUMED: Main rounded parts use 32 segments and drains use 16 (appropriate resolution).
// ASSUMED: Taps, pipes, water, hinges, drawer trays, runners and mounting hardware are omitted (fixture-only geometry).
// UNSURE: The earlier floor-based floating geometry conflicted with the lowest-point check; wall_mounted now uses wall placement at 250 mm and locally zero-based geometry.
// UNSURE: Pedestals belong to the prescribed cabinet part because no separate support part is provided.
// UNSURE: bowls overrides the variant name, including compact double basins at narrow widths.
// UNSURE: Doors and drawers do not apply to pedestal.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'vanity',
  name: 'Vanity',
  summary: 'A bathroom vanity with cabinet, pedestal and wall-mounted variants.',
  description:
    'A bathroom vanity facing -y, with its installed basin top at the requested height and a cabinet or pedestal beneath it. Assumed: width and depth describe the full rim; wall-mounted cabinets have 250 mm floor clearance, represented by wall placement and locally zero-based geometry; all non-pedestal variants have cabinets and pedestal variants have one support per bowl; cabinets inset 10 mm with 18 mm panels and separators and 12 mm backs; floor plinths 80 mm high with side/front/back insets 30/40/20 mm and cabinet bottoms at 75 mm; basin depth 160 mm, rim thickness 25 mm, walls 8 mm and bottoms 12 mm; rim/internal-bowl/external-bowl corner radii 20/20/28 mm; opening margins 35 mm at sides, 45 mm at front and 90 mm at back, with 30 mm bridge; bowl-to-rim overlap 5 mm; drain diameter 35 mm and centres 10% of opening depth behind bowl centres; fronts 20 mm thick with 5 mm carcass penetration and opening-edge overlap; movable fronts end 15 mm below bowls with a fixed upper fascia; equal-width doors and stacked full-width drawers have 3 mm gaps; mixed layouts target 100 mm drawer fronts, reduced to preserve 100 mm door fronts and an 18 mm separator; door-only and drawer-only layouts fill the lower front and zero fronts leaves it open; door pulls 10 by 60 by 6 mm, centred 20 mm from alternating latch edges; drawer pulls 80 by 12 by 6 mm with upper edges 18 mm below tops; pedestal lower/upper x radii min(100 mm, 40% of opening width)/min(80 mm, 32% of opening width), y radii 100/70 mm, rear offset 10% of opening depth and bowl overlap 5 mm; main rounded parts use 32 segments and drains 16; taps, pipes, water, hinges, drawer trays, runners and mounting hardware omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['single_sink', 'double_sink', 'pedestal', 'wall_mounted', 'with_cabinet'],
      labels: {
        single_sink: 'Single sink',
        double_sink: 'Double sink',
        pedestal: 'Pedestal',
        wall_mounted: 'Wall-mounted vanity',
        with_cabinet: 'Cabinet vanity',
      },
      default: 'single_sink',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 700,
      min: 500,
      max: 1400,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 460,
      min: 400,
      max: 550,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 850,
      min: 800,
      max: 900,
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
      key: 'doors',
      label: 'Doors',
      type: 'integer',
      default: 1,
      min: 0,
      max: 4,
      appliesTo: ['single_sink', 'double_sink', 'wall_mounted', 'with_cabinet'],
    },
    {
      key: 'drawers',
      label: 'Drawers',
      type: 'integer',
      default: 1,
      min: 0,
      max: 3,
      appliesTo: ['single_sink', 'double_sink', 'wall_mounted', 'with_cabinet'],
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'white-paint',
    },
  ],
  parts: [
    { key: 'cabinet', label: 'Cabinet' },
    { key: 'basin', label: 'Basin' },
  ],
  variantDefaults: {
    double_sink: { width: 1300, bowls: 2, doors: 2 },
    pedestal: { doors: 0, drawers: 0 },
    wall_mounted: { height: 800 },
    with_cabinet: { doors: 2, drawers: 1 },
  },
  placement: {
    mount: 'floor',
    variants: {
      wall_mounted: { mount: 'wall', z: 250 },
    },
  },
};

const wallClearance = 250;

function resolve(p) {
  const variant = p.variant ?? 'single_sink';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown vanity variant; choose single_sink, double_sink, pedestal, wall_mounted or with_cabinet.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Material and controls hidden for this variant are never read.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;
    if (definition.appliesTo && !definition.appliesTo.includes(variant)) {
      continue;
    }

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

function roundedPrism(width, depth, radius, x, y, bottom, top) {
  const height = top - bottom;
  const z = (bottom + top) / 2;
  const pieces = [
    primitives.cuboid({
      size: [width - 2 * radius, depth, height],
      center: [x, y, z],
    }),
    primitives.cuboid({
      size: [width, depth - 2 * radius, height],
      center: [x, y, z],
    }),
  ];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      pieces.push(
        primitives.cylinder({
          radius,
          height,
          center: [
            x + sx * (width / 2 - radius),
            y + sy * (depth / 2 - radius),
            z,
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
  const floating = q.variant === 'wall_mounted';

  // Geometry is local to its placement datum. For a floating unit, subtract
  // the installation lift from the floor-based basin height before modelling.
  const localHeight = q.height - (floating ? wallClearance : 0);

  const overlap = 5;
  const panel = 18;
  const rimThickness = 25;
  const bowlWall = 8;
  const bowlFloor = 12;
  const basinBottom = localHeight - 160;
  const rimBottom = localHeight - rimThickness;

  const x0 = -q.width / 2;
  const x1 = q.width / 2;
  const front = -q.depth / 2;
  const back = q.depth / 2;

  const openingWidth = (q.width - 70 - (q.bowls - 1) * 30) / q.bowls;
  const openingDepth = q.depth - 135;
  const bowlY = front + 45 + openingDepth / 2;
  const bowlCenters = [];

  if (openingWidth <= 40 || openingDepth <= 40) {
    throw new Error(
      `A ${q.width} mm by ${q.depth} mm basin cannot fit ${q.bowls} bowls with 35 mm side margins, a 30 mm bridge and 20 mm corner radii.`
    );
  }

  const basinSolids = [
    roundedPrism(q.width, q.depth, 20, 0, 0, rimBottom, localHeight),
  ];
  const basinCuts = [];

  for (let i = 0; i < q.bowls; i += 1) {
    const bowlX = x0 + 35 + openingWidth / 2 + i * (openingWidth + 30);
    bowlCenters.push(bowlX);

    basinSolids.push(
      roundedPrism(
        openingWidth + 2 * bowlWall,
        openingDepth + 2 * bowlWall,
        28,
        bowlX,
        bowlY,
        basinBottom,
        rimBottom + overlap
      )
    );

    basinCuts.push(
      roundedPrism(
        openingWidth,
        openingDepth,
        20,
        bowlX,
        bowlY,
        basinBottom + bowlFloor,
        localHeight + overlap
      ),
      primitives.cylinder({
        radius: 17.5,
        height: bowlFloor + 2 * overlap,
        center: [
          bowlX,
          bowlY + 0.1 * openingDepth,
          basinBottom + bowlFloor / 2,
        ],
        segments: 16,
      })
    );
  }

  const basin = booleans.subtract(combine(basinSolids), ...basinCuts);
  const cabinetParts = [];

  if (q.variant === 'pedestal') {
    for (const bowlX of bowlCenters) {
      cabinetParts.push(
        primitives.cylinderElliptic({
          height: basinBottom + overlap,
          startRadius: [Math.min(100, 0.4 * openingWidth), 100],
          endRadius: [Math.min(80, 0.32 * openingWidth), 70],
          center: [
            bowlX,
            bowlY + 0.1 * openingDepth,
            (basinBottom + overlap) / 2,
          ],
          segments: 32,
        })
      );
    }

    return {
      cabinet: combine(cabinetParts),
      basin,
    };
  }

  const cabinetLeft = x0 + 10;
  const cabinetRight = x1 - 10;
  const cabinetFront = front + 10;
  const cabinetBack = back - 10;

  // Floating cabinets now genuinely begin at local z = 0.
  const cabinetBottom = floating ? 0 : 75;
  const cabinetTop = rimBottom + overlap;
  const housingFront = cabinetFront + 15;
  const innerLeft = cabinetLeft + panel;
  const innerRight = cabinetRight - panel;
  const innerBottom = cabinetBottom + panel;
  const innerBack = cabinetBack - 12;

  cabinetParts.push(
    booleans.subtract(
      box(
        cabinetLeft, cabinetRight,
        housingFront, cabinetBack,
        cabinetBottom, cabinetTop
      ),
      box(
        innerLeft, innerRight,
        housingFront - overlap, innerBack,
        innerBottom, cabinetTop + overlap
      )
    )
  );

  if (!floating) {
    cabinetParts.push(
      box(
        cabinetLeft + 30,
        cabinetRight - 30,
        cabinetFront + 40,
        cabinetBack - 20,
        0,
        80
      )
    );
  }

  const faceLeft = innerLeft - overlap;
  const faceRight = innerRight + overlap;
  const faceBottom = innerBottom - overlap;
  const faceTop = basinBottom - 15;

  cabinetParts.push(
    box(
      faceLeft, faceRight,
      cabinetFront, cabinetFront + 20,
      faceTop + overlap, cabinetTop
    )
  );

  const gap = 3;
  const mixed = q.doors > 0 && q.drawers > 0;
  let doorTop = faceTop;

  if (q.drawers > 0) {
    const available = faceTop - faceBottom;
    const drawerHeight = mixed
      ? Math.min(
          100,
          (available - panel - 100 - (q.drawers - 1) * gap) / q.drawers
        )
      : (available - (q.drawers - 1) * gap) / q.drawers;

    if (drawerHeight <= 30) {
      throw new Error(
        `Drawer fronts would be ${drawerHeight} mm high; more than 30 mm is required for the pulls. Reduce drawers.`
      );
    }

    const drawerBankBottom =
      faceTop - q.drawers * drawerHeight - (q.drawers - 1) * gap;
    doorTop = drawerBankBottom - panel;

    if (mixed) {
      cabinetParts.push(
        box(
          innerLeft - overlap,
          innerRight + overlap,
          housingFront,
          innerBack + overlap,
          doorTop + overlap,
          drawerBankBottom + overlap
        )
      );
    }

    for (let i = 0; i < q.drawers; i += 1) {
      const top = faceTop - i * (drawerHeight + gap);
      const bottom = top - drawerHeight;

      cabinetParts.push(
        booleans.subtract(
          box(
            faceLeft, faceRight,
            cabinetFront, cabinetFront + 20,
            bottom, top
          ),
          box(
            -40, 40,
            cabinetFront - overlap, cabinetFront + 6,
            top - 30, top - 18
          )
        )
      );
    }
  }

  if (q.doors > 0) {
    const leafWidth =
      (faceRight - faceLeft - (q.doors - 1) * gap) / q.doors;

    if (doorTop <= faceBottom || leafWidth <= 40) {
      throw new Error(
        `Door fronts would be ${leafWidth} mm wide and ${doorTop - faceBottom} mm high; reduce doors or drawers.`
      );
    }

    for (let i = 0; i < q.doors; i += 1) {
      const left = faceLeft + i * (leafWidth + gap);
      const right = left + leafWidth;
      const pullX = i % 2 === 0 ? right - 20 : left + 20;
      const pullZ = (faceBottom + doorTop) / 2;

      cabinetParts.push(
        booleans.subtract(
          box(
            left, right,
            cabinetFront, cabinetFront + 20,
            faceBottom, doorTop
          ),
          box(
            pullX - 5, pullX + 5,
            cabinetFront - overlap, cabinetFront + 6,
            pullZ - 30, pullZ + 30
          )
        )
      );
    }
  }

  return {
    cabinet: combine(cabinetParts),
    basin,
  };
}