import { primitives, booleans, geometries } from '../lib/jscad.js';

// ASSUMED: Depth includes the closed fronts; the full footprint, including any worktop overhang, is centred (consistent overall placement).
// ASSUMED: Carcass panels, backs and shelves are 18 mm thick (typical cabinetry).
// ASSUMED: Closed fronts are 20 mm thick and enter the carcass by 5 mm (connected solid geometry).
// ASSUMED: Fronts overlap the edges of the carcass opening by 5 mm; adjacent fronts have 3 mm gaps (inset front layout).
// ASSUMED: The plinth is a solid support inset 30 mm at each side, 60 mm at the front and 20 mm at the back (recessed toe space).
// ASSUMED: The carcass extends 5 mm into a nonzero plinth, limited by the available plinth height (connected support).
// ASSUMED: Mixed door/drawer cabinets have 120 mm high drawer fronts above the doors; drawer-only cabinets divide the opening evenly (practical storage layout).
// ASSUMED: Drawer fronts must be at least 80 mm high and door leaves at least 200 mm high (usable fronts).
// ASSUMED: Two pantry doors are vertically stacked; two doors in other variants are side by side (typical pantry access).
// ASSUMED: Glass-door frames have 40 mm wide borders and 6 mm thick centred panes, overlapping the frame by 5 mm (framed glazing).
// ASSUMED: Glazed openings must be at least 40 mm wide and 80 mm high (visible glass area).
// ASSUMED: Drawer pulls are recessed slots 80 mm wide, 12 mm high and 6 mm deep, 18 mm below the front top (integrated handles).
// ASSUMED: Door pulls are recessed slots 12 mm wide, 100 mm high and 6 mm deep, centred 20 mm from the latch edge (fits glass-door stiles).
// ASSUMED: Base cabinets have up to one shelf, upper cabinets two and tall pantries four, reduced to maintain at least 150 mm shelf pitch (usable compartments).
// ASSUMED: Shelves stop 20 mm behind the front panels and overlap the side and back panels by 5 mm (clearance and connected shelving).
// ASSUMED: Worktops have no side or rear overhang and include an inset locating tongue extending 5 mm below the nominal slab and 5 mm into it (preserves specified top height and overlapping joint).
// ASSUMED: Doors and drawers are modelled closed; drawer runners, trays and hinges are omitted (front-focused geometry).
// ASSUMED: A cabinet with no doors and no drawers gets one blank fixed front over the whole opening, a base cabinet without a worktop gets its 18 mm top panel as the top part; a wall or tall cabinet has no separate top (its carcass is closed), so its top part is empty and not built.
// UNSURE: Pantry door arrangement is unspecified; two vertically stacked doors are chosen.
// UNSURE: Depth could describe the bare carcass; here it includes the fronts, excluding the explicitly specified worktop overhang.
// ASSUMED: The glass panes are their own part (default material glass) that needs the glassDoors option; it is left out of the model, and its material selector hidden, when the doors are not glazed.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.
// UNSURE: Upper cabinets start locally at z = 0; their wall elevation is supplied only by placement metadata.

export const meta = {
  id: 'kitchen-cabinet',
  name: 'Kitchen cabinet',
  summary: 'A kitchen base, drawer, upper or tall pantry cabinet.',
  description:
    'A kitchen base, drawer, upper or tall pantry cabinet with closed fronts, optional framed glazing and an optional front-overhanging worktop. Assumed: depth includes closed fronts and the complete footprint is centred; carcass panels, backs and shelves 18 mm thick; fronts 20 mm thick with 5 mm carcass penetration and opening-edge overlap; adjacent front gaps 3 mm; solid plinth inset 30 mm at each side, 60 mm at front and 20 mm at back; carcass enters a nonzero plinth by up to 5 mm; mixed cabinets use 120 mm drawer fronts above doors while drawer-only fronts divide the opening evenly; minimum drawer-front height 80 mm and door-leaf height 200 mm; two pantry doors are stacked vertically and other paired doors are side by side; glazing borders 40 mm wide with centred 6 mm panes and 5 mm frame overlap, the panes being their own glass part (present only with glass doors) with the glass material by default; minimum glazed opening 40 by 80 mm; recessed drawer pulls 80 by 12 by 6 mm, 18 mm below front tops; recessed door pulls 12 by 100 by 6 mm, centred 20 mm from latch edges; up to one shelf for base variants, two for upper and four for pantry, reduced to maintain 150 mm pitch; shelves stop 20 mm behind fronts and overlap side/back panels by 5 mm; worktops have no side/rear overhang and an inset tongue extending 5 mm below and 5 mm into the nominal slab; fronts are closed and runners, trays and hinges omitted; upper cabinet elevation is external placement metadata.',
  params: [
    {
      key: 'variant',
      labels: { base: 'Base cabinet', base_drawer: 'Base cabinet with drawers', upper: 'Wall (upper) cabinet', tall_pantry: 'Tall pantry' },
      label: 'Variant',
      type: 'enum',
      options: ['base', 'base_drawer', 'upper', 'tall_pantry'],
      default: 'base',
    },
    {
      key: 'width',
      label: 'Width',
      type: 'enum_number',
      unit: 'mm',
      options: [300, 400, 450, 500, 600, 800, 900, 1000, 1200],
      default: 600,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 600,
      min: 300,
      max: 620,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 880,
      min: 600,
      max: 2400,
      step: 10,
    },
    {
      key: 'plinth',
      appliesTo: ['base', 'base_drawer', 'tall_pantry'],
      label: 'Plinth',
      unit: 'mm',
      default: 100,
      min: 0,
      max: 150,
      step: 10,
    },
    {
      key: 'doors',
      label: 'Doors',
      type: 'integer',
      default: 1,
      min: 0,
      max: 2,
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
      key: 'glassDoors',
      label: 'Glass doors',
      type: 'boolean',
      default: false,
    },
    {
      key: 'worktop',
      appliesTo: ['base', 'base_drawer'],
      label: 'Worktop',
      type: 'boolean',
      default: true,
    },
    {
      key: 'worktopThickness',
      appliesTo: ['base', 'base_drawer'],
      label: 'Worktop thickness',
      unit: 'mm',
      default: 30,
      min: 12,
      max: 60,
      step: 2,
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
    { key: 'doors', label: 'Doors and drawer fronts' },
    { key: 'top', label: 'Top (worktop on base cabinets)', appliesTo: ['base', 'base_drawer'] },
    { key: 'glass', label: 'Glass panes', needs: 'glassDoors', defaultMaterial: 'glass' },
  ],
  variantDefaults: {
    base: { depth: 600, height: 880, plinth: 100, worktop: true },
    base_drawer: {
      depth: 600,
      height: 880,
      drawers: 3,
      doors: 0,
      worktop: true,
    },
    upper: { depth: 350, height: 800, plinth: 0, worktop: false },
    tall_pantry: {
      depth: 600,
      height: 2200,
      plinth: 100,
      doors: 2,
      worktop: false,
    },
  },
  sizeParams: { y: { default: 'depth', base: null, base_drawer: null }, z: { default: 'height', base: null, base_drawer: null } },

  placement: {
    mount: 'floor',
    variants: { upper: { mount: 'wall', z: 1450 } },
  },
};

function resolve(p) {
  const variant = p.variant ?? 'base';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown kitchen-cabinet variant; choose base, base_drawer, upper or tall_pantry.'
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

    if (definition.type === 'enum_number') {
      if (!definition.options.includes(value)) {
        throw new Error(
          `${definition.label} must be one of ${definition.options.join(', ')} mm.`
        );
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
    } else if (definition.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new Error(`${definition.label} must be true or false.`);
      }
    } else if (definition.unit === 'mm') {
      if (
        !Number.isFinite(value) ||
        value < definition.min ||
        value > definition.max
      ) {
        throw new Error(
          `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
        );
      }
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
  const frontThickness = 20;
  const overlap = 5;
  const gap = 3;

  const x0 = -q.width / 2;
  const x1 = q.width / 2;

  // Including the 20 mm front overhang, the overall y bounds are symmetric.
  const yShift = q.worktop ? 10 : 0;
  const front = -q.depth / 2 + yShift;
  const back = q.depth / 2 + yShift;
  const bodyFront = front + frontThickness - overlap;
  const bodyBottom = Math.max(0, q.plinth - overlap);

  const faceX0 = x0 + panel - overlap;
  const faceX1 = x1 - panel + overlap;
  const faceZ0 = bodyBottom + panel - overlap;
  const faceZ1 = q.height - panel + overlap;
  const openingHeight = faceZ1 - faceZ0;

  let drawerHeight = 0;
  let drawerBankBottom = faceZ1;
  let doorZoneTop = faceZ1;

  if (q.drawers > 0) {
    drawerHeight = q.doors > 0
      ? 120
      : (openingHeight - (q.drawers - 1) * gap) / q.drawers;

    if (drawerHeight < 80) {
      throw new Error(
        `Drawer fronts would be ${drawerHeight} mm high; at least 80 mm is required. Increase height or reduce drawers.`
      );
    }

    drawerBankBottom =
      faceZ1 - q.drawers * drawerHeight - (q.drawers - 1) * gap;
    doorZoneTop = drawerBankBottom - gap;
  }

  const stackedDoors = q.variant === 'tall_pantry' && q.doors === 2;

  if (q.doors > 0) {
    const leafHeight = stackedDoors
      ? (doorZoneTop - faceZ0 - gap) / 2
      : doorZoneTop - faceZ0;

    if (leafHeight < 200) {
      throw new Error(
        `Door leaves would be ${leafHeight} mm high; at least 200 mm is required. Increase height or reduce doors or drawers.`
      );
    }
  }

  const carcassParts = [];
  const frontParts = [];
  const glassParts = [];
  // A base cabinet's top is its worktop, or without one its own 18 mm top panel (the top part, overlapping the carcass sides
  // by 5 mm). A wall or tall cabinet has no separate top: its carcass is closed at the top, and the top part is empty.
  const ownTop = q.variant === 'base' || q.variant === 'base_drawer';
  const carcassTop = q.worktop || !ownTop ? q.height : q.height - panel + overlap;

  // Hollow housing, open at -y, with solid side, back, bottom and top panels.
  carcassParts.push(
    booleans.subtract(
      box(x0, x1, bodyFront, back, bodyBottom, carcassTop),
      box(
        x0 + panel,
        x1 - panel,
        bodyFront - overlap,
        back - panel,
        bodyBottom + panel,
        q.height - panel
      )
    )
  );

  if (q.plinth > 0) {
    carcassParts.push(
      box(
        x0 + 30,
        x1 - 30,
        front + 60,
        back - 20,
        0,
        q.plinth
      )
    );
  }

  function shelfAt(centerZ) {
    carcassParts.push(
      box(
        x0 + panel - overlap,
        x1 - panel + overlap,
        front + frontThickness + 20,
        back - panel + overlap,
        centerZ - panel / 2,
        centerZ + panel / 2
      )
    );
  }

  // Drawer-only cabinets omit shelves; otherwise shelves occupy the lower zone.
  const hasLowerZone = q.drawers === 0 || q.doors > 0;
  if (hasLowerZone) {
    const shelfZoneBottom = bodyBottom + panel;
    const shelfZoneTop = q.drawers > 0
      ? drawerBankBottom - panel
      : q.height - panel;
    const zoneHeight = shelfZoneTop - shelfZoneBottom;
    const desiredCount = q.variant === 'tall_pantry'
      ? 4
      : q.variant === 'upper' ? 2 : 1;
    const count = Math.max(
      0,
      Math.min(desiredCount, Math.floor(zoneHeight / 150) - 1)
    );

    for (let i = 1; i <= count; i += 1) {
      shelfAt(shelfZoneBottom + zoneHeight * i / (count + 1));
    }
  }

  for (let i = 0; i < q.drawers; i += 1) {
    const z1 = faceZ1 - i * (drawerHeight + gap);
    const z0 = z1 - drawerHeight;

    const drawerFront = box(
      faceX0, faceX1, front, front + frontThickness, z0, z1
    );
    const pull = box(
      -40, 40,
      front - overlap, front + 6,
      z1 - 18 - 12, z1 - 18
    );

    frontParts.push(booleans.subtract(drawerFront, pull));
  }

  function doorLeaf(left, right, bottom, top, latchAtLeft) {
    let leaf = box(
      left, right, front, front + frontThickness, bottom, top
    );

    if (q.glassDoors) {
      const border = 40;
      const windowX0 = left + border;
      const windowX1 = right - border;
      const windowZ0 = bottom + border;
      const windowZ1 = top - border;

      if (windowX1 - windowX0 < 40 || windowZ1 - windowZ0 < 80) {
        throw new Error(
          `Glazed opening would be ${windowX1 - windowX0} mm wide by ${windowZ1 - windowZ0} mm high; at least 40 mm by 80 mm is required.`
        );
      }

      const frame = booleans.subtract(
        leaf,
        box(
          windowX0, windowX1,
          front - overlap, front + frontThickness + overlap,
          windowZ0, windowZ1
        )
      );

      const pane = box(
        windowX0 - overlap,
        windowX1 + overlap,
        front + frontThickness / 2 - 3,
        front + frontThickness / 2 + 3,
        windowZ0 - overlap,
        windowZ1 + overlap
      );
      leaf = frame;
      glassParts.push(pane);
    }

    const pullX = latchAtLeft ? left + 20 : right - 20;
    const pullZ = (bottom + top) / 2;
    const pull = box(
      pullX - 6, pullX + 6,
      front - overlap, front + 6,
      pullZ - 50, pullZ + 50
    );

    frontParts.push(booleans.subtract(leaf, pull));
  }

  if (q.doors === 1) {
    doorLeaf(faceX0, faceX1, faceZ0, doorZoneTop, false);
  } else if (q.doors === 2 && stackedDoors) {
    const middle = (faceZ0 + doorZoneTop) / 2;
    doorLeaf(faceX0, faceX1, faceZ0, middle - gap / 2, false);
    doorLeaf(faceX0, faceX1, middle + gap / 2, doorZoneTop, false);
  } else if (q.doors === 2) {
    const middle = (faceX0 + faceX1) / 2;
    doorLeaf(faceX0, middle - gap / 2, faceZ0, doorZoneTop, false);
    doorLeaf(middle + gap / 2, faceX1, faceZ0, doorZoneTop, true);
  }

  if (frontParts.length === 0) {
    frontParts.push(box(faceX0, faceX1, front, front + frontThickness, faceZ0, faceZ1));
  }

  let worktop;
  if (!q.worktop && !ownTop) {
    worktop = geometries.geom3.create();   // no separate top: the carcass has it
  } else if (!q.worktop) {
    worktop = box(x0, x1, bodyFront, back, q.height - panel, q.height);
  } else {
    const slab = box(
      x0, x1,
      front - 20, back,
      q.height, q.height + q.worktopThickness
    );

    // The nominal slab remains exactly worktopThickness high.
    // Its inset underside tongue overlaps both slab and carcass by 5 mm.
    const tongue = box(
      x0 + panel,
      x1 - panel,
      front + frontThickness,
      back - panel,
      q.height - overlap,
      q.height + overlap
    );

    worktop = booleans.union(slab, tongue);
  }

  return {
    carcass: combine(carcassParts),
    doors: combine(frontParts),
    top: worktop,
    glass: combine(glassParts),
  };
}
