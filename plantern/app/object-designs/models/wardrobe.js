import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width, depth and height are overall dimensions including closed doors (predictable sizing).
// ASSUMED: Carcass panels, dividers and shelves are 18 mm thick; backs are 12 mm thick (typical cabinetry).
// ASSUMED: Freestanding variants have a 60 mm high plinth inset 30 mm at each side, 60 mm at the front and 20 mm at the back (recessed support).
// ASSUMED: Freestanding carcasses start at z = 55 mm; built-in carcasses start at z = 0 without a plinth (5 mm support overlap and fitted appearance).
// ASSUMED: Doors are 20 mm thick and shown closed (simple solid fronts).
// ASSUMED: Hinged doors overlap opening edges by 5 mm, enter the carcass front by 5 mm and have 3 mm gaps between leaves (connected inset construction).
// ASSUMED: Sliding doors alternate between two tracks separated by 5 mm, with 30 mm horizontal panel overlap (recognisable sliding layout).
// ASSUMED: Sliding carcasses begin 45 mm behind the overall front; their guide rails are 15 mm high and penetrate the carcass by 5 mm (space for two tracks).
// ASSUMED: Hinged leaves require at least 180 mm width; sliding leaves require at least 200 mm width and at least two panels (usable door layout).
// ASSUMED: Door pulls are recessed slots 12 mm wide, 100 mm high and 6 mm deep, centred 20 mm from a latch edge and halfway up each leaf (integrated handles).
// ASSUMED: When hanging storage and shelving or drawers coexist, a full-height divider assigns 42% of the remaining clear width to left-hand storage (separate folded and hanging storage).
// ASSUMED: Shelves and drawer fronts start 20 mm behind the carcass front; shelves enter side and back panels by 5 mm (front clearance and connected joints).
// ASSUMED: Specified shelves are evenly distributed above the drawer bank, or throughout the storage bay when drawers are absent (regular usable compartments).
// ASSUMED: Shelf compartments require at least 120 mm clear height (usable storage).
// ASSUMED: Drawer fronts belong to the carcass part and are 18 mm thick, 140 mm high, with 3 mm vertical gaps and 5 mm side and bottom overlaps (internal drawer bank).
// ASSUMED: Drawer banks have an additional 18 mm structural cap overlapping the highest front by 5 mm; this cap is not counted as a configurable shelf (closed storage housing).
// ASSUMED: Drawer pulls are recessed slots 80 mm wide, 12 mm high and 6 mm deep, with upper edges 18 mm below front tops (integrated pulls).
// ASSUMED: The hanging rail has 12.5 mm radius, sits 220 mm below the overall top and is centred in the usable depth (typical clothes rail).
// ASSUMED: Hanging rails enter their supporting sides by 5 mm and use 32 segments (connected round support).
// ASSUMED: The doored variants have at least one door; a wardrobe without doors is the open variant.
// ASSUMED: Drawer trays, runners, hinges, fasteners and anti-tip hardware are omitted (simplified closed furniture model).
// UNSURE: Built-in door operation is unspecified; built_in_closet uses hinged doors.
// UNSURE: Narrow wardrobes are interpreted as hinged wardrobes with narrower variant defaults.
// UNSURE: The open variant has no doors and no doors part.
// UNSURE: Variant defaults apply only to omitted parameters; explicitly supplied values always win.
// UNSURE: This model does not specify structural loading, anchoring or installation requirements.

const DOOR_VARIANTS = ['hinged', 'sliding', 'built_in_closet', 'narrow'];

export const meta = {
  id: 'wardrobe',
  name: 'Wardrobe',
  summary: 'A wardrobe with hinged, sliding, open, built-in and narrow variants.',
  description:
    'A floor-standing wardrobe with configurable doors, internal drawers, shelves and hanging storage, facing -y. Assumed: dimensions include closed doors; carcass panels, dividers and shelves 18 mm thick and backs 12 mm thick; freestanding plinths 60 mm high, inset 30 mm at the sides, 60 mm at the front and 20 mm at the back; freestanding carcasses start at 55 mm and built-in carcasses at 0 mm without a plinth; doors 20 mm thick and closed; hinged doors overlap opening edges and carcass fronts by 5 mm with 3 mm leaf gaps; sliding doors alternate between tracks separated by 5 mm with 30 mm horizontal overlap, carcasses starting 45 mm behind the front and guide rails 15 mm high with 5 mm carcass penetration; minimum hinged leaf width 180 mm and sliding leaf width 200 mm, with at least two sliding panels; the doored variants have at least one door, and a wardrobe without doors is the open variant; door pulls 12 by 100 by 6 mm, centred 20 mm from latch edges at mid-height; combined hanging and folded storage uses a full-height divider with 42% of remaining clear width assigned to left storage; shelves and drawer fronts start 20 mm behind the carcass front, with 5 mm shelf penetration into sides and back; shelves evenly divide storage above drawers or the full storage bay and require 120 mm clear compartment height; internal drawer fronts belong to carcass and are 18 mm thick, 140 mm high, with 3 mm gaps and 5 mm side and bottom overlaps; drawer banks have an additional 18 mm cap with 5 mm front overlap, excluded from shelf count; drawer pulls 80 by 12 by 6 mm with upper edges 18 mm below front tops; hanging rail radius 12.5 mm, positioned 220 mm below the top and centred in usable depth, entering supports by 5 mm with 32 segments; built-in and narrow variants use hinged doors; drawer trays, runners, hinges, fasteners and anti-tip hardware omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['hinged', 'sliding', 'open', 'built_in_closet', 'narrow'],
      labels: {
        hinged: 'Hinged wardrobe',
        sliding: 'Sliding-door wardrobe',
        open: 'Open wardrobe',
        built_in_closet: 'Built-in closet',
        narrow: 'Narrow wardrobe',
      },
      default: 'hinged',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 1200,
      min: 600,
      max: 3000,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 600,
      min: 400,
      max: 650,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 2200,
      min: 2000,
      max: 2500,
      step: 10,
    },
    {
      key: 'doors',
      label: 'Doors',
      type: 'integer',
      default: 2,
      min: 1,
      max: 6,
      appliesTo: DOOR_VARIANTS,
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
      key: 'shelves',
      label: 'Shelves',
      type: 'integer',
      default: 3,
      min: 0,
      max: 8,
    },
    {
      key: 'hangingRail',
      label: 'Hanging rail',
      type: 'boolean',
      default: true,
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
    { key: 'doors', label: 'Doors', appliesTo: DOOR_VARIANTS },
  ],
  variantDefaults: {
    sliding: { doors: 2 },
    built_in_closet: { height: 2400, width: 1500 },
    narrow: { width: 600, depth: 400 },
  },
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'hinged';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown wardrobe variant; choose hinged, sliding, open, built_in_closet or narrow.'
    );
  }

  const q = { variant, doors: 0 };
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

  if (variant === 'sliding' && q.doors < 2) {
    throw new Error(
      `Sliding wardrobes require at least two panels across the ${q.width} mm width; increase Doors or choose the hinged variant.`
    );
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
  const doorThickness = 20;
  const overlap = 5;
  const gap = 3;
  const sliding = q.variant === 'sliding';
  const builtIn = q.variant === 'built_in_closet';
  const hasDoors = q.doors > 0;

  const x0 = -q.width / 2;
  const x1 = q.width / 2;
  const front = -q.depth / 2;
  const back = q.depth / 2;
  const bodyBottom = builtIn ? 0 : 55;
  const bodyFront = front + (hasDoors ? (sliding ? 45 : 15) : 0);

  const innerLeft = x0 + panel;
  const innerRight = x1 - panel;
  const innerBottom = bodyBottom + panel;
  const innerTop = q.height - panel;
  const innerBack = back - backThickness;
  const storageFront = bodyFront + 20;

  const carcass = [];
  const doorParts = [];

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

  if (!builtIn) {
    carcass.push(
      box(x0 + 30, x1 - 30, front + 60, back - 20, 0, 60)
    );
  }

  const splitStorage =
    q.hangingRail && (q.shelves > 0 || q.drawers > 0);

  let storageRight = innerRight;
  let railLeft = innerLeft;

  if (splitStorage) {
    const storageWidth = 0.42 * (innerRight - innerLeft - panel);
    const dividerLeft = innerLeft + storageWidth;
    storageRight = dividerLeft;
    railLeft = dividerLeft + panel;

    carcass.push(
      box(
        dividerLeft,
        dividerLeft + panel,
        bodyFront,
        innerBack + overlap,
        innerBottom - overlap,
        innerTop + overlap
      )
    );
  }

  let shelfZoneBottom = innerBottom;

  if (q.drawers > 0) {
    const drawerHeight = 140;
    const drawerBottom = innerBottom - overlap;
    const bankTop =
      drawerBottom +
      q.drawers * drawerHeight +
      (q.drawers - 1) * gap;

    for (let row = 0; row < q.drawers; row += 1) {
      const bottom = drawerBottom + row * (drawerHeight + gap);
      const top = bottom + drawerHeight;
      const pullX = (innerLeft + storageRight) / 2;

      const drawerFront = box(
        innerLeft - overlap,
        storageRight + overlap,
        storageFront,
        storageFront + panel,
        bottom,
        top
      );

      const pull = box(
        pullX - 40,
        pullX + 40,
        storageFront - overlap,
        storageFront + 6,
        top - 30,
        top - 18
      );

      carcass.push(booleans.subtract(drawerFront, pull));
    }

    const capBottom = bankTop - overlap;
    shelfZoneBottom = capBottom + panel;

    carcass.push(
      box(
        innerLeft - overlap,
        storageRight + overlap,
        storageFront,
        innerBack + overlap,
        capBottom,
        shelfZoneBottom
      )
    );
  }

  if (q.shelves > 0) {
    const clearHeight =
      (innerTop - shelfZoneBottom - q.shelves * panel) /
      (q.shelves + 1);

    if (clearHeight < 120) {
      throw new Error(
        `Shelf compartments would be ${clearHeight} mm high; at least 120 mm is required. Increase the ${q.height} mm height or reduce shelves or drawers.`
      );
    }

    for (let shelf = 0; shelf < q.shelves; shelf += 1) {
      const bottom =
        shelfZoneBottom +
        clearHeight +
        shelf * (clearHeight + panel);

      carcass.push(
        box(
          innerLeft - overlap,
          storageRight + overlap,
          storageFront,
          innerBack + overlap,
          bottom,
          bottom + panel
        )
      );
    }
  }

  if (q.hangingRail) {
    const railStart = railLeft - overlap;
    const railEnd = innerRight + overlap;
    const rail = primitives.cylinder({
      radius: 12.5,
      height: railEnd - railStart,
      center: [0, 0, 0],
      segments: 32,
    });

    carcass.push(
      transforms.translate(
        [
          (railStart + railEnd) / 2,
          (storageFront + innerBack) / 2,
          q.height - 220,
        ],
        transforms.rotateY(Math.PI / 2, rail)
      )
    );
  }

  if (hasDoors) {
    const faceLeft = innerLeft - overlap;
    const faceRight = innerRight + overlap;
    const faceBottom = innerBottom - overlap;
    const faceTop = innerTop + overlap;
    const faceWidth = faceRight - faceLeft;

    const leafWidth = sliding
      ? (faceWidth + (q.doors - 1) * 30) / q.doors
      : (faceWidth - (q.doors - 1) * gap) / q.doors;
    const minimumWidth = sliding ? 200 : 180;

    if (leafWidth < minimumWidth) {
      throw new Error(
        `Door leaves would be ${leafWidth} mm wide across the ${q.width} mm wardrobe; ${sliding ? 'sliding' : 'hinged'} leaves require at least ${minimumWidth} mm. Increase width or reduce Doors.`
      );
    }

    if (sliding) {
      // Both guide rails enter the carcass front by 5 mm.
      carcass.push(
        box(
          faceLeft, faceRight,
          front, bodyFront + overlap,
          innerBottom - 15, innerBottom
        ),
        box(
          faceLeft, faceRight,
          front, bodyFront + overlap,
          innerTop, innerTop + 15
        )
      );
    }

    for (let leaf = 0; leaf < q.doors; leaf += 1) {
      const left = sliding
        ? faceLeft + leaf * (leafWidth - 30)
        : faceLeft + leaf * (leafWidth + gap);
      const right = left + leafWidth;
      const panelFront = sliding
        ? front + (leaf % 2) * 25
        : front;

      const door = box(
        left,
        right,
        panelFront,
        panelFront + doorThickness,
        faceBottom,
        faceTop
      );

      const latchAtLeft = leaf % 2 === 1;
      const pullX = latchAtLeft ? left + 20 : right - 20;
      const pullZ = (faceBottom + faceTop) / 2;
      const pull = box(
        pullX - 6,
        pullX + 6,
        panelFront - overlap,
        panelFront + 6,
        pullZ - 50,
        pullZ + 50
      );

      doorParts.push(booleans.subtract(door, pull));
    }
  }

  return {
    carcass: combine(carcass),
    doors: combine(doorParts),
  };
}
