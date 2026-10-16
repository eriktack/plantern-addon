import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// FIX: Drawer heights and open-shelf heights now adapt to the available space.
// Support heights also shorten when necessary, so valid parameter combinations
// do not fail merely because the nominal compartment sizes do not fit.
// FIX: The front assembly includes a permanent, functional face frame.
// This provides real front geometry even when doors and drawers are both zero.
// FIX: Boolean T-junction warnings are left alone, as required by the task.

// ASSUMED: Length, depth and height are overall dimensions including fronts and supports (predictable sizing).
// ASSUMED: Carcass panels, partitions and shelves are 18 mm thick; backs are 12 mm thick (typical cabinetry).
// ASSUMED: The permanent face frame has 18 mm wide borders and is 20 mm deep; it belongs to the doors part (complete front assembly).
// ASSUMED: Closed fronts are 20 mm thick and penetrate the carcass front by 5 mm (connected inset fronts).
// ASSUMED: Fronts overlap opening edges by 5 mm, leaving 8 mm of internal partitions visible between adjacent fronts (consistent construction).
// ASSUMED: TV benches and skank cupboards have nominally 60 mm high solid plinths, inset 25 mm at the sides, 40 mm at the front and 20 mm at the back (recessed support).
// ASSUMED: Sideboards have four 40 mm square legs, nominally 120 mm high and inset 25 mm from overall edges (raised construction).
// ASSUMED: Support heights shorten only when needed to fit the minimum compartment heights; carcasses overlap support tops by 5 mm (adaptable connected construction).
// ASSUMED: Drawers form one horizontal row of equal-width bays above equal-width door bays (traditional skank arrangement).
// ASSUMED: Mixed door/drawer layouts target 120 mm high drawer openings, reduced to a minimum of 60 mm while preserving at least 100 mm for door openings (fits compact cabinets).
// ASSUMED: Door and drawer zones are separated by an 18 mm panel (structural separation).
// ASSUMED: Drawer-only layouts fill the available lower height and require at least 60 mm clear opening height (usable shallow storage).
// ASSUMED: openShelf targets a clear height of max(90 mm, 30% of interior height), reduced to a minimum of 60 mm when needed, above an 18 mm shelf (adaptable equipment storage).
// ASSUMED: A lower zone without fronts retains at least 100 mm clear height (usable open storage).
// ASSUMED: Door bays and wholly open lower bays receive a middle shelf when at least 180 mm high (interior storage).
// ASSUMED: Middle shelves stop 20 mm behind the closed fronts; separators reach the carcass front (clearance and support).
// ASSUMED: Shelves and partitions overlap supporting panels by 5 mm (solid joints).
// ASSUMED: Drawer pulls are recessed slots 80 mm wide, 12 mm high and 6 mm deep, with upper edges 18 mm below front tops (integrated handles).
// ASSUMED: Door pulls are recessed slots 12 mm wide, 60 mm high and 6 mm deep, centred 20 mm from alternating latch edges at mid-height (compact paired handles).
// ASSUMED: Hinges, drawer trays, runners, fasteners and cable holes are omitted (simplified closed furniture geometry).
// UNSURE: openShelf position is unspecified; it is interpreted as a full-width upper compartment.
// UNSURE: Drawer arrangement outside skank is unspecified; one horizontal row is used for every variant.
// UNSURE: The Doors and drawers part also contains the fixed face frame, including when no movable fronts are requested.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'sideboard',
  name: 'Sideboard',
  summary: 'A storage cabinet with TV-bench, sideboard and traditional skank variants.',
  description:
    'A floor-standing cabinet with configurable closed fronts, a permanent face frame and optional open upper storage, facing -y. Assumed: dimensions include fronts and supports; carcass panels, partitions and shelves 18 mm thick and backs 12 mm thick; permanent face-frame borders 18 mm wide and 20 mm deep, belonging to the doors part; movable fronts 20 mm thick with 5 mm carcass penetration and opening-edge overlap, leaving 8 mm of internal partitions visible; nominal TV-bench and skank plinth height 60 mm with side/front/back insets 25/40/20 mm; sideboard legs four 40 mm square posts, nominally 120 mm high and inset 25 mm; supports shorten when needed for minimum compartment heights and overlap the carcass by 5 mm; drawers form one equal-width horizontal row above equal-width door bays; mixed layouts target 120 mm drawer-opening height, reduced to at least 60 mm while preserving 100 mm door openings, with an 18 mm separator; drawer-only fronts fill the lower zone with at least 60 mm opening height; openShelf targets max(90 mm, 30% of interior height), reducing to at least 60 mm when necessary, above an 18 mm shelf; front-free lower zones retain at least 100 mm clear height; door and wholly open lower bays receive a middle shelf when at least 180 mm high; middle shelves stop 20 mm behind fronts and separators reach the carcass front; shelf and partition joints overlap 5 mm; drawer pulls 80 by 12 by 6 mm with upper edges 18 mm below front tops; door pulls 12 by 60 by 6 mm, centred 20 mm from alternating latch edges at mid-height; hinges, drawer trays, runners, fasteners and cable holes omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['tv_bench', 'sideboard', 'skank'],
      labels: {
        tv_bench: 'TV bench',
        sideboard: 'Sideboard',
        skank: 'Traditional skank',
      },
      default: 'tv_bench',
    },
    {
      key: 'length',
      label: 'Length',
      unit: 'mm',
      default: 1600,
      min: 1000,
      max: 2200,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 420,
      min: 350,
      max: 500,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 600,
      min: 350,
      max: 850,
      step: 10,
    },
    {
      key: 'doors',
      label: 'Doors',
      type: 'integer',
      default: 2,
      min: 0,
      max: 4,
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
      key: 'openShelf',
      label: 'Open shelf',
      type: 'boolean',
      default: false,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'oak',
    },
  ],
  parts: [
    { key: 'carcass', label: 'Carcass' },
    { key: 'doors', label: 'Doors and drawers' },
  ],
  variantDefaults: {
    tv_bench: {
      length: 1500,
      height: 450,
      doors: 0,
      drawers: 2,
      openShelf: true,
    },
    sideboard: {
      length: 1600,
      height: 800,
      doors: 2,
      drawers: 2,
    },
    skank: {
      length: 1200,
      depth: 450,
      height: 850,
      doors: 2,
      drawers: 2,
    },
  },
  sizeParams: { x: 'length', y: 'depth', z: 'height' },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'tv_bench';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown sideboard variant; choose tv_bench, sideboard or skank.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant];

  // Material is intentionally never read or copied.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;

    const value = p[key] ?? defaults[key] ?? definition.default;
    q[key] = value;

    if (definition.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new Error(`${definition.label} must be true or false.`);
      }
    } else if (definition.type === 'integer') {
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

  const minimumDrawerHeight = 60;
  const minimumDoorHeight = 100;
  const minimumOpenHeight = 60;

  const hasDoors = q.doors > 0;
  const hasDrawers = q.drawers > 0;
  const mixed = hasDoors && hasDrawers;
  const raised = q.variant === 'sideboard';

  const minimumClosedHeight = mixed
    ? minimumDrawerHeight + panel + minimumDoorHeight
    : hasDrawers ? minimumDrawerHeight : minimumDoorHeight;

  const minimumInteriorHeight =
    minimumClosedHeight +
    (q.openShelf ? panel + minimumOpenHeight : 0);

  const nominalSupportHeight = raised ? 120 : 60;
  const maximumSupportHeight =
    q.height - 2 * panel + overlap - minimumInteriorHeight;
  const supportHeight = Math.min(
    nominalSupportHeight,
    maximumSupportHeight
  );

  if (supportHeight <= overlap) {
    throw new Error(
      `Height ${q.height} mm cannot fit ${minimumInteriorHeight} mm of interior storage, two ${panel} mm panels and floor supports.`
    );
  }

  const x0 = -q.length / 2;
  const x1 = q.length / 2;
  const front = -q.depth / 2;
  const back = q.depth / 2;
  const bodyBottom = supportHeight - overlap;
  const bodyFront = front + frontThickness - overlap;

  const innerLeft = x0 + panel;
  const innerRight = x1 - panel;
  const innerBottom = bodyBottom + panel;
  const innerTop = q.height - panel;
  const innerBack = back - backThickness;
  const innerHeight = innerTop - innerBottom;

  const carcass = [];
  const fronts = [];

  let closedZoneTop = innerTop;
  let openSeparatorBottom = null;

  if (q.openShelf) {
    const targetOpenHeight = Math.max(90, 0.3 * innerHeight);
    const maximumOpenHeight =
      innerHeight - panel - minimumClosedHeight;
    const openHeight = Math.max(
      minimumOpenHeight,
      Math.min(targetOpenHeight, maximumOpenHeight)
    );

    const separatorTop = innerTop - openHeight;
    openSeparatorBottom = separatorTop - panel;
    closedZoneTop = openSeparatorBottom;
  }

  let drawerBottom = null;
  let doorZoneTop = closedZoneTop;

  if (mixed) {
    const closedHeight = closedZoneTop - innerBottom;
    const maximumDrawerHeight =
      closedHeight - panel - minimumDoorHeight;
    const drawerHeight = Math.max(
      minimumDrawerHeight,
      Math.min(120, maximumDrawerHeight)
    );

    drawerBottom = closedZoneTop - drawerHeight;
    doorZoneTop = drawerBottom - panel;
  } else if (hasDrawers) {
    drawerBottom = innerBottom;
  }

  // Hollow housing, open at -y.
  carcass.push(
    booleans.subtract(
      box(x0, x1, bodyFront, back, bodyBottom, q.height),
      box(
        innerLeft,
        innerRight,
        bodyFront - overlap,
        innerBack,
        innerBottom,
        innerTop
      )
    )
  );

  if (raised) {
    for (const x of [x0 + 25, x1 - 25 - 40]) {
      for (const y of [front + 25, back - 25 - 40]) {
        carcass.push(
          box(x, x + 40, y, y + 40, 0, supportHeight)
        );
      }
    }
  } else {
    carcass.push(
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

  // A real applied face frame surrounds the opening even without doors.
  // Its rear 5 mm overlaps the housing; fronts overlap its opening by 5 mm.
  fronts.push(
    booleans.subtract(
      box(
        x0, x1,
        front, front + frontThickness,
        bodyBottom, q.height
      ),
      box(
        innerLeft, innerRight,
        front - overlap, front + frontThickness + overlap,
        innerBottom, innerTop
      )
    )
  );

  function fullSeparator(bottom) {
    carcass.push(
      box(
        innerLeft - overlap,
        innerRight + overlap,
        bodyFront,
        innerBack + overlap,
        bottom,
        bottom + panel
      )
    );
  }

  if (openSeparatorBottom !== null) {
    fullSeparator(openSeparatorBottom);
  }

  if (mixed) {
    fullSeparator(doorZoneTop);
  }

  function bays(count, bottom, top) {
    const clearWidth =
      (innerRight - innerLeft - (count - 1) * panel) / count;
    const result = [];

    for (let i = 0; i < count; i += 1) {
      const left = innerLeft + i * (clearWidth + panel);
      result.push({ left, right: left + clearWidth });

      if (i < count - 1) {
        carcass.push(
          box(
            left + clearWidth,
            left + clearWidth + panel,
            bodyFront,
            innerBack + overlap,
            bottom - overlap,
            top + overlap
          )
        );
      }
    }

    return result;
  }

  function middleShelf(left, right, bottom, top) {
    if (top - bottom < 180) return;

    const center = (bottom + top) / 2;
    carcass.push(
      box(
        left - overlap,
        right + overlap,
        front + frontThickness + 20,
        innerBack + overlap,
        center - panel / 2,
        center + panel / 2
      )
    );
  }

  if (hasDrawers) {
    const drawerBays = bays(q.drawers, drawerBottom, closedZoneTop);

    for (const bay of drawerBays) {
      const left = bay.left - overlap;
      const right = bay.right + overlap;
      const bottom = drawerBottom - overlap;
      const top = closedZoneTop + overlap;
      const pullX = (left + right) / 2;

      const drawerFront = box(
        left, right,
        front, front + frontThickness,
        bottom, top
      );
      const pull = box(
        pullX - 40, pullX + 40,
        front - overlap, front + 6,
        top - 30, top - 18
      );

      fronts.push(booleans.subtract(drawerFront, pull));
    }
  }

  if (hasDoors) {
    const doorBays = bays(q.doors, innerBottom, doorZoneTop);

    for (let i = 0; i < doorBays.length; i += 1) {
      const bay = doorBays[i];
      const left = bay.left - overlap;
      const right = bay.right + overlap;
      const bottom = innerBottom - overlap;
      const top = doorZoneTop + overlap;
      const pullX = i % 2 === 0 ? right - 20 : left + 20;
      const pullZ = (bottom + top) / 2;

      const door = box(
        left, right,
        front, front + frontThickness,
        bottom, top
      );
      const pull = box(
        pullX - 6, pullX + 6,
        front - overlap, front + 6,
        pullZ - 30, pullZ + 30
      );

      fronts.push(booleans.subtract(door, pull));
      middleShelf(bay.left, bay.right, innerBottom, doorZoneTop);
    }
  } else if (!hasDrawers) {
    middleShelf(innerLeft, innerRight, innerBottom, closedZoneTop);
  }

  return {
    carcass: combine(carcass),
    doors: combine(fronts),
  };
}