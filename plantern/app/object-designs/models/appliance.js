import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width, depth and height are overall dimensions, including closed fronts and cooking surfaces (predictable sizing).
// ASSUMED: General appliance fronts are 20 mm thick and overlap their housings by 5 mm (connected closed assemblies).
// ASSUMED: Housing walls are min(18 mm, height / 6) thick (robust cases with room for shallow appliances).
// ASSUMED: Freestanding appliances at least 200 mm high have a 40 mm high recessed base; housings start at 35 mm (5 mm support overlap).
// ASSUMED: Recessed bases are inset 20 mm at the sides and back and 40 mm at the front (floor support).
// ASSUMED: Built-in general appliances omit the recessed base (flush installation).
// ASSUMED: Door seams are 3 mm wide and 15 mm deep, leaving connected backing (closed-door detailing).
// ASSUMED: Fridge-freezer lower doors occupy 35% of the available front height (typical split).
// ASSUMED: Recessed horizontal pulls are 30% of front width, at most 180 mm wide, 6 mm deep and min(12 mm, 5% of front height) high (integrated handles).
// ASSUMED: Control bands occupy 10% of front height, end 5% below its top and are recessed 4 mm (appliance controls).
// ASSUMED: Control knobs have radius min(10 mm, 2.5% of front height), with fronts flush to the overall front and 5 mm backing overlap (compact controls).
// ASSUMED: Oven and microwave windows occupy 65% and 64% of front width respectively, between 18% and 72% of front height (recognisable viewing windows).
// ASSUMED: Window panes are 10 mm thick and recessed 10 mm, overlapping surrounding fronts by 5 mm (connected inset panes).
// ASSUMED: Microwave windows are centred 10% of appliance width left of centre, leaving a right-hand control strip (familiar layout).
// ASSUMED: Laundry portholes have radius min(30% of width, 24% of front height), centred at 46% of front height (front-loading machines).
// ASSUMED: Porthole glazing overlaps the opening radially by 5 mm; surrounding bezel grooves are 3 mm wide and 4 mm deep, with inner radius 6 mm outside the opening (visible door rim).
// ASSUMED: Vent groups have eight slots, each 2% of appliance width wide and 8% of the available front height high, recessed 5 mm (ventilation detailing).
// ASSUMED: Cooker and hob surface assemblies are min(40 mm, 25% of total height) high (integrated cooking deck).
// ASSUMED: Built-in hob housings are inset 20 mm on all four sides; freestanding hob housings use the full footprint (installation distinction).
// ASSUMED: Every cooking surface has four zones at x = plus/minus 25% of width and y = plus/minus 20% of depth (standard layout).
// ASSUMED: Burner radius is min(7.5% of width, 11% of depth) (realistic cooking zones).
// ASSUMED: Induction markings are 2 mm wide annular recesses, 1.5 mm deep (flush zone outlines).
// ASSUMED: Electric hotplates rise 2 mm above their deck and enter it by 5 mm, with a 2 mm wide concentric groove 1 mm deep (solid hotplates).
// ASSUMED: Gas burners rise min(18 mm, 40% of cooking-assembly height) above the deck; burner cylinders end 5 mm below the top (space for pan supports).
// ASSUMED: Gas pan supports are crossed 8 mm wide, 10 mm high bars extending 1.3 burner radii from each zone centre (recognisable gas supports).
// ASSUMED: Cooking controls are three recessed 8 mm radius circles near the front edge, at x = -12%, 0 and 12% of width (simple control marks).
// ASSUMED: Range-hood canopies occupy the lower 55% of height; freestanding chimneys are 35% of width and 40% of depth, against the back (extractor silhouette).
// ASSUMED: Built-in range hoods use a full-height rectangular housing instead of a chimney (cabinet insert).
// ASSUMED: Hood underside filters use ten slots, each 3% of width wide and 3 mm deep, between 30 mm behind the front and 20 mm before the back (filter grille).
// ASSUMED: Main circular parts use 32 segments and small knobs and control marks use 16 (appropriate round-part resolution).
// ASSUMED: All appliances are closed; internal equipment, wiring, hoses, food, utensils and installation cabinetry are omitted (object-only geometry).
// UNSURE: The height range is shared by very different appliances; unusual dimensions retain simplified proportions instead of claiming functional equipment.
// UNSURE: builtIn is allowed on every variant and changes its support or housing construction, not its installation placement.
// UNSURE: Glass and metal accents share the prescribed parts and whole-object material; no extra material parameters are added.
// UNSURE: Variant defaults apply only to omitted parameters; explicitly supplied values always win.

export const meta = {
  id: 'appliance',
  name: 'Appliance',
  summary: 'Kitchen and laundry appliances with variant-specific doors, controls and cooking surfaces.',
  description:
    'A closed kitchen or laundry appliance with geometry selected by variant, facing -y. Assumed: dimensions include fronts and cooking surfaces; general fronts 20 mm thick with 5 mm housing overlap; housing walls min(18 mm, height / 6); freestanding general appliances at least 200 mm high have 40 mm high bases inset 20 mm at sides/back and 40 mm at front, with housing starting at 35 mm, while built-in cases omit bases; door seams 3 mm wide and 15 mm deep; fridge-freezer lower doors occupy 35% of front height; horizontal pulls 30% of width up to 180 mm, 6 mm deep and min(12 mm, 5% of front height) high; control bands 10% of front height, ending 5% below the top, recessed 4 mm; knob radius min(10 mm, 2.5% of front height), flush at front with 5 mm backing overlap; oven/microwave windows 65/64% of width between 18% and 72% of front height, with microwave windows centred 10% of width left of centre; panes 10 mm thick and recessed 10 mm with 5 mm edge overlap; laundry porthole radius min(30% of width, 24% of front height), centred at 46% of front height, with 5 mm pane overlap and bezel grooves 3 mm wide by 4 mm deep beginning 6 mm beyond the opening; vent groups have eight slots 2% of width wide, 8% of front height high and 5 mm deep; cooking assemblies min(40 mm, 25% of height) high; built-in hob housings inset 20 mm and freestanding hob housings full-size; four cooking zones at plus/minus 25% of width and plus/minus 20% of depth, with radius min(7.5% of width, 11% of depth); induction outlines 2 mm wide and 1.5 mm deep; electric plates rise 2 mm with 5 mm deck overlap and concentric grooves 2 mm wide by 1 mm deep; gas burners rise min(18 mm, 40% of assembly height), with cylinders ending 5 mm below top and crossed pan supports 8 mm wide by 10 mm high extending 1.3 burner radii; three recessed cooking-control circles radius 8 mm near the front at x = -12%, 0 and 12% of width; hood canopies occupy the lower 55% of height with freestanding chimneys 35% of width and 40% of depth against the back, or full-height rectangular built-in housings; hood filters have ten slots 3% of width wide and 3 mm deep from 30 mm behind front to 20 mm before back; main round parts use 32 segments and small controls 16; appliances are closed and internal equipment, wiring, hoses, contents and installation cabinetry omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: [
        'fridge_freezer',
        'fridge',
        'freezer',
        'range_cooker',
        'dishwasher',
        'oven',
        'hob',
        'washing_machine',
        'dryer',
        'drying_cabinet',
        'range_hood',
        'microwave',
      ],
      labels: {
        fridge_freezer: 'Fridge-freezer',
        fridge: 'Fridge',
        freezer: 'Freezer',
        range_cooker: 'Range cooker',
        dishwasher: 'Dishwasher',
        oven: 'Oven',
        hob: 'Hob',
        washing_machine: 'Washing machine',
        dryer: 'Dryer',
        drying_cabinet: 'Drying cabinet',
        range_hood: 'Range hood',
        microwave: 'Microwave',
      },
      default: 'fridge_freezer',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 600,
      min: 300,
      max: 1200,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 600,
      min: 400,
      max: 700,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 820,
      min: 40,
      max: 2000,
      step: 10,
    },
    {
      key: 'builtIn',
      label: 'Built in',
      type: 'boolean',
      default: true,
    },
    {
      key: 'hobType',
      label: 'Hob type',
      type: 'enum',
      options: ['induction', 'electric', 'gas'],
      default: 'induction',
      appliesTo: ['hob', 'range_cooker'],
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'white-paint',
    },
  ],
  parts: [
    { key: 'body', label: 'Body' },
    { key: 'front', label: 'Door and front' },
  ],
  variantDefaults: {
    fridge_freezer: { width: 600, depth: 600, height: 1850 },
    fridge: { width: 600, depth: 650, height: 1850 },
    freezer: { width: 600, depth: 650, height: 1850 },
    range_cooker: {
      width: 600,
      depth: 600,
      height: 850,
      builtIn: false,
    },
    dishwasher: { width: 600, depth: 600, height: 820 },
    oven: { width: 600, depth: 600, height: 600 },
    hob: { width: 600, depth: 520, height: 50 },
    washing_machine: {
      width: 600,
      depth: 600,
      height: 850,
      builtIn: false,
    },
    dryer: {
      width: 600,
      depth: 600,
      height: 850,
      builtIn: false,
    },
    drying_cabinet: {
      width: 600,
      depth: 600,
      height: 1850,
      builtIn: false,
    },
    range_hood: { width: 600, depth: 450, height: 150 },
    microwave: {
      width: 600,
      depth: 400,
      height: 380,
      builtIn: false,
    },
  },
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: {
    mount: 'floor',
    variants: {
      hob: { mount: 'floor', z: 860 },
      microwave: { mount: 'floor', z: 910 },
      range_hood: { mount: 'wall', z: 1550 },
    },
  },
};

function resolve(p) {
  const variant = p.variant ?? 'fridge_freezer';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown appliance variant; choose one of the variants listed in the appliance parameters.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant];

  // Never read material or a control hidden for the chosen variant.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;
    if (definition.appliesTo && !definition.appliesTo.includes(variant)) {
      continue;
    }

    const value = p[key] ?? defaults[key] ?? definition.default;
    q[key] = value;

    if (definition.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new Error(`${definition.label} must be true or false.`);
      }
    } else if (definition.type === 'enum') {
      if (!definition.options.includes(value)) {
        throw new Error(
          `${definition.label} must be one of: ${definition.options.join(', ')}.`
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

function verticalCylinder(radius, bottom, top, x = 0, y = 0, segments = 32) {
  return primitives.cylinder({
    radius,
    height: top - bottom,
    center: [x, y, (bottom + top) / 2],
    segments,
  });
}

function frontCylinder(radius, front, back, x, z, segments = 32) {
  return transforms.translate(
    [x, (front + back) / 2, z],
    transforms.rotateX(
      Math.PI / 2,
      primitives.cylinder({
        radius,
        height: back - front,
        center: [0, 0, 0],
        segments,
      })
    )
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
  const frontY = -q.depth / 2;
  const backY = q.depth / 2;
  const overlap = 5;
  const faceThickness = 20;
  const wall = Math.min(18, q.height / 6);
  const body = [];
  const fronts = [];

  function cookingSurface() {
    const assemblyHeight = Math.min(40, 0.25 * q.height);
    const bottom = q.height - assemblyHeight;
    const rise = q.hobType === 'gas'
      ? Math.min(18, 0.4 * assemblyHeight)
      : q.hobType === 'electric' ? 2 : 0;
    const deckTop = q.height - rise;
    let deck = box(x0, x1, frontY, backY, bottom, deckTop);
    const cuts = [];
    const additions = [];
    const burnerRadius = Math.min(0.075 * q.width, 0.11 * q.depth);

    for (const x of [-0.25 * q.width, 0.25 * q.width]) {
      for (const y of [-0.2 * q.depth, 0.2 * q.depth]) {
        if (q.hobType === 'induction') {
          const ring = booleans.subtract(
            verticalCylinder(
              burnerRadius, deckTop - 1.5, deckTop + overlap, x, y
            ),
            verticalCylinder(
              burnerRadius - 2,
              deckTop - 1.5 - overlap,
              deckTop + 2 * overlap,
              x,
              y
            )
          );
          cuts.push(ring);
        } else if (q.hobType === 'electric') {
          let hotplate = verticalCylinder(
            burnerRadius, deckTop - overlap, q.height, x, y
          );
          const groove = booleans.subtract(
            verticalCylinder(
              0.65 * burnerRadius,
              q.height - 1,
              q.height + overlap,
              x,
              y
            ),
            verticalCylinder(
              0.65 * burnerRadius - 2,
              q.height - 1 - overlap,
              q.height + 2 * overlap,
              x,
              y
            )
          );
          hotplate = booleans.subtract(hotplate, groove);
          additions.push(hotplate);
        } else {
          additions.push(
            verticalCylinder(
              burnerRadius, deckTop - overlap, q.height - 5, x, y
            ),
            box(
              x - 1.3 * burnerRadius,
              x + 1.3 * burnerRadius,
              y - 4,
              y + 4,
              q.height - 10,
              q.height
            ),
            box(
              x - 4,
              x + 4,
              y - 1.3 * burnerRadius,
              y + 1.3 * burnerRadius,
              q.height - 10,
              q.height
            )
          );
        }
      }
    }

    for (const fraction of [-0.12, 0, 0.12]) {
      cuts.push(
        verticalCylinder(
          8,
          deckTop - 1.5,
          deckTop + overlap,
          fraction * q.width,
          frontY + 0.1 * q.depth,
          16
        )
      );
    }

    if (cuts.length > 0) deck = booleans.subtract(deck, ...cuts);
    fronts.push(deck, ...additions);
    return bottom;
  }

  if (q.variant === 'hob') {
    const surfaceBottom = cookingSurface();
    const inset = q.builtIn ? 20 : 0;

    body.push(
      box(
        x0 + inset,
        x1 - inset,
        frontY + inset,
        backY - inset,
        0,
        surfaceBottom + overlap
      )
    );

    return {
      body: combine(body),
      front: combine(fronts),
    };
  }

  if (q.variant === 'range_hood') {
    const canopyTop = 0.55 * q.height;
    const housingTop = q.builtIn ? q.height : canopyTop;
    let housing = box(
      x0, x1, frontY + 15, backY, 0, housingTop
    );

    const filterCuts = [];
    for (let i = 0; i < 10; i += 1) {
      const x = x0 + q.width * (0.1 + i * 0.8 / 9);
      filterCuts.push(
        box(
          x - 0.015 * q.width,
          x + 0.015 * q.width,
          frontY + 30,
          backY - 20,
          -overlap,
          3
        )
      );
    }
    housing = booleans.subtract(housing, ...filterCuts);
    body.push(housing);

    if (!q.builtIn) {
      body.push(
        box(
          -0.175 * q.width,
          0.175 * q.width,
          backY - 0.4 * q.depth,
          backY,
          canopyTop - overlap,
          q.height
        )
      );
    }

    let fascia = box(
      x0, x1, frontY, frontY + faceThickness, 0, housingTop
    );
    const controls = [];
    for (const fraction of [-0.12, 0, 0.12]) {
      controls.push(
        frontCylinder(
          Math.min(6, 0.08 * housingTop),
          frontY - overlap,
          frontY + 4,
          fraction * q.width,
          0.5 * housingTop,
          16
        )
      );
    }
    fascia = booleans.subtract(fascia, ...controls);
    fronts.push(fascia);

    return {
      body: combine(body),
      front: combine(fronts),
    };
  }

  let housingTop = q.height;
  if (q.variant === 'range_cooker') {
    housingTop = cookingSurface() + overlap;
  }

  const raised = !q.builtIn && q.height >= 200;
  const housingBottom = raised ? 35 : 0;
  const housingFront = frontY + faceThickness - overlap;

  if (housingTop - housingBottom <= 2 * wall) {
    throw new Error(
      `The housing between ${housingBottom} mm and ${housingTop} mm cannot fit two ${wall} mm walls. Increase appliance height.`
    );
  }

  body.push(
    booleans.subtract(
      box(x0, x1, housingFront, backY, housingBottom, housingTop),
      box(
        x0 + wall,
        x1 - wall,
        housingFront - overlap,
        backY - wall,
        housingBottom + wall,
        housingTop - wall
      )
    )
  );

  if (raised) {
    body.push(
      box(
        x0 + 20,
        x1 - 20,
        frontY + 40,
        backY - 20,
        0,
        40
      )
    );
  }

  const faceBottom = housingBottom;
  const faceTop = housingTop;
  const faceHeight = faceTop - faceBottom;
  let face = box(
    x0, x1, frontY, frontY + faceThickness, faceBottom, faceTop
  );
  const faceCuts = [];
  const faceAdditions = [];

  function seam(z) {
    faceCuts.push(
      box(
        x0 - overlap,
        x1 + overlap,
        frontY - overlap,
        frontY + 15,
        z - 1.5,
        z + 1.5
      )
    );
  }

  function pull(z, centerX = 0) {
    const width = Math.min(180, 0.3 * q.width);
    const height = Math.min(12, 0.05 * faceHeight);
    faceCuts.push(
      box(
        centerX - width / 2,
        centerX + width / 2,
        frontY - overlap,
        frontY + 6,
        z - height / 2,
        z + height / 2
      )
    );
  }

  function controlBand(knobCount) {
    const bottom = faceBottom + 0.85 * faceHeight;
    const top = faceBottom + 0.95 * faceHeight;

    faceCuts.push(
      box(
        x0 + 0.06 * q.width,
        x1 - 0.06 * q.width,
        frontY - overlap,
        frontY + 4,
        bottom,
        top
      )
    );

    for (let i = 0; i < knobCount; i += 1) {
      const fraction = knobCount === 1
        ? 0
        : -0.3 + 0.6 * i / (knobCount - 1);

      faceAdditions.push(
        frontCylinder(
          Math.min(10, 0.025 * faceHeight),
          frontY,
          frontY + 9,
          fraction * q.width,
          (bottom + top) / 2,
          16
        )
      );
    }
  }

  function rectangularWindow(left, right) {
    const bottom = faceBottom + 0.18 * faceHeight;
    const top = faceBottom + 0.72 * faceHeight;

    faceCuts.push(
      box(
        left, right,
        frontY - overlap,
        frontY + faceThickness + overlap,
        bottom, top
      )
    );
    faceAdditions.push(
      box(
        left - overlap,
        right + overlap,
        frontY + 10,
        frontY + faceThickness,
        bottom - overlap,
        top + overlap
      )
    );
  }

  function laundryDoor() {
    const radius = Math.min(0.3 * q.width, 0.24 * faceHeight);
    const centerZ = faceBottom + 0.46 * faceHeight;

    faceCuts.push(
      frontCylinder(
        radius,
        frontY - overlap,
        frontY + faceThickness + overlap,
        0,
        centerZ
      ),
      booleans.subtract(
        frontCylinder(
          radius + 9, frontY - overlap, frontY + 4, 0, centerZ
        ),
        frontCylinder(
          radius + 6,
          frontY - 2 * overlap,
          frontY + 4 + overlap,
          0,
          centerZ
        )
      )
    );
    faceAdditions.push(
      frontCylinder(
        radius + overlap,
        frontY + 10,
        frontY + faceThickness,
        0,
        centerZ
      )
    );
  }

  function vents(centerFraction) {
    const centerZ = faceBottom + centerFraction * faceHeight;
    const slotHeight = 0.08 * faceHeight;

    for (let i = 0; i < 8; i += 1) {
      const x = q.width * (-0.28 + i * 0.56 / 7);
      faceCuts.push(
        box(
          x - 0.01 * q.width,
          x + 0.01 * q.width,
          frontY - overlap,
          frontY + 5,
          centerZ - slotHeight / 2,
          centerZ + slotHeight / 2
        )
      );
    }
  }

  switch (q.variant) {
    case 'fridge_freezer': {
      const split = faceBottom + 0.35 * faceHeight;
      seam(split);
      pull(faceBottom + 0.28 * faceHeight);
      pull(faceBottom + 0.43 * faceHeight);
      break;
    }

    case 'fridge':
      pull(faceBottom + 0.6 * faceHeight);
      break;

    case 'freezer':
      pull(faceBottom + 0.6 * faceHeight);
      vents(0.1);
      break;

    case 'range_cooker':
      controlBand(4);
      rectangularWindow(-0.325 * q.width, 0.325 * q.width);
      pull(faceBottom + 0.78 * faceHeight);
      seam(faceBottom + 0.12 * faceHeight);
      break;

    case 'dishwasher':
      controlBand(3);
      pull(faceBottom + 0.77 * faceHeight);
      seam(faceBottom + 0.82 * faceHeight);
      break;

    case 'oven':
      controlBand(2);
      rectangularWindow(-0.325 * q.width, 0.325 * q.width);
      pull(faceBottom + 0.78 * faceHeight);
      break;

    case 'washing_machine':
      controlBand(2);
      laundryDoor();
      // Detergent-drawer outline above the porthole.
      faceCuts.push(
        box(
          x0 + 0.06 * q.width,
          x0 + 0.34 * q.width,
          frontY - overlap,
          frontY + 4,
          faceBottom + 0.78 * faceHeight,
          faceBottom + 0.8 * faceHeight
        )
      );
      break;

    case 'dryer':
      controlBand(1);
      laundryDoor();
      vents(0.12);
      break;

    case 'drying_cabinet':
      controlBand(2);
      pull(faceBottom + 0.56 * faceHeight);
      vents(0.14);
      vents(0.73);
      break;

    case 'microwave':
      rectangularWindow(-0.42 * q.width, 0.22 * q.width);
      pull(faceBottom + 0.78 * faceHeight, -0.1 * q.width);
      faceCuts.push(
        box(
          0.31 * q.width,
          0.44 * q.width,
          frontY - overlap,
          frontY + 4,
          faceBottom + 0.18 * faceHeight,
          faceBottom + 0.82 * faceHeight
        )
      );
      for (const fraction of [0.35, 0.58]) {
        faceAdditions.push(
          frontCylinder(
            Math.min(10, 0.025 * faceHeight),
            frontY,
            frontY + 9,
            0.375 * q.width,
            faceBottom + fraction * faceHeight,
            16
          )
        );
      }
      break;

    default:
      throw new Error('No front geometry is defined for this appliance variant.');
  }

  if (faceCuts.length > 0) {
    face = booleans.subtract(face, ...faceCuts);
  }
  fronts.push(face, ...faceAdditions);

  return {
    body: combine(body),
    front: combine(fronts),
  };
}