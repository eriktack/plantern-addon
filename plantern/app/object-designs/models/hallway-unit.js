import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width, depth and height are overall dimensions including supports and closed fronts (predictable sizing).
// ASSUMED: Cabinet panels and shelving are 18 mm thick; cabinet backs are 12 mm thick (typical timber construction).
// ASSUMED: Shoe cabinets have a 40 mm high plinth inset 15 mm at the sides and back and 30 mm at the front (recessed support).
// ASSUMED: Cabinet bodies start at z = 35 mm, overlapping the plinth by 5 mm (connected support).
// ASSUMED: Shoe cabinets have one door below 600 mm width and two doors otherwise (practical leaf widths).
// ASSUMED: Doors are 20 mm thick, penetrate the carcass front by 5 mm and overlap opening edges by 5 mm; paired doors have a 3 mm gap (closed inset fronts).
// ASSUMED: Door pulls are recessed slots 80 mm wide, 12 mm high and 6 mm deep, with upper edges 25 mm below the door top (integrated handles).
// ASSUMED: Cabinet shelves stop 20 mm behind the doors and enter side and back panels by 5 mm (clearance and connected joints).
// ASSUMED: Coat racks have two 35 mm square rear uprights inset 20 mm from the sides, on full-depth 35 mm wide and 30 mm high runners (freestanding support).
// ASSUMED: Coat uprights start at z = 25 mm; the full-width upper hook board is 30 mm deep and 70 mm high (5 mm runner overlap and hook mounting).
// ASSUMED: Coat-rack shoe trays are inset 50 mm at the sides, 15 mm at the front and 30 mm at the back (5 mm rear-post penetration).
// ASSUMED: A fixed coat-rack tray starts at z = 30 mm; additional shelves occupy a lower zone ending at min(height minus 95 mm, max(35% of height, 48 mm plus shelves times 26 mm)) (fits shelving below the hooks).
// ASSUMED: Coat-rack tray supports are 20 mm wide and 10 mm high, entering each tray by 5 mm (supported tray ends).
// ASSUMED: Hooks have 5 mm radius, project from 25 mm to 100 mm forward of the back at height minus 40 mm, and turn upward to height minus 15 mm (usable raised tips).
// ASSUMED: Multiple hooks span positions 40 mm from the ends; a single hook is centred (even distribution).
// ASSUMED: Shoe racks have four 30 mm square corner posts and two upper 20 mm deep, 25 mm high widthwise rails (open frame).
// ASSUMED: Shoe-rack shelves enter posts by 5 mm, span the full depth and include a fixed bottom board starting at z = 25 mm (connected shoe platform).
// ASSUMED: Adjustable shoe-rack shelves occupy the space above the fixed board and below height minus 35 mm (clearance below upper rails).
// ASSUMED: shelves counts additional interior boards, excluding structural bottom boards and trays (consistent configurable storage).
// ASSUMED: Adjustable boards divide their available zone into equal clear gaps (regular shelf spacing).
// ASSUMED: Umbrella stands are open-top rectangular vessels with 12 mm walls and a 20 mm closed bottom (drip-catching construction).
// ASSUMED: Hooks apply only to coat racks; shelves apply to shoe cabinets, coat racks and shoe racks (variant-specific controls).
// ASSUMED: Small round hook parts use 16 segments (small-part resolution).
// ASSUMED: Shoes, umbrellas, coats, hinges, fasteners and drawer hardware are omitted (object geometry only).
// UNSURE: Shoe-cabinet door operation is unspecified; closed hinged fronts are used rather than tilt-out bins.
// UNSURE: Coat-rack form is unspecified; a freestanding hall tree with lower shoe trays is chosen.
// UNSURE: Very short units with many shelves produce small compartments; the geometry remains buildable without claiming all footwear will fit.
// UNSURE: Variant defaults apply only to omitted parameters; explicitly supplied values always win.

export const meta = {
  id: 'hallway-unit',
  name: 'Hallway unit',
  summary: 'Hallway storage with shoe-cabinet, coat-rack, shoe-rack and umbrella-stand variants.',
  description:
    'A floor-standing hallway unit with variant-specific storage, facing -y. Assumed: dimensions are overall including supports and closed fronts; cabinet panels and shelves 18 mm thick and backs 12 mm thick; cabinet plinth 40 mm high, inset 15 mm at sides/back and 30 mm at front, with cabinet starting at 35 mm; one cabinet door below 600 mm width and two otherwise; doors 20 mm thick with 5 mm carcass penetration and opening-edge overlap, and paired-door gap 3 mm; recessed pulls 80 by 12 by 6 mm with upper edges 25 mm below door tops; cabinet shelves stop 20 mm behind doors and enter sides/back by 5 mm; coat racks use two 35 mm square rear posts inset 20 mm, on full-depth runners 35 mm wide and 30 mm high, with posts starting at 25 mm; upper hook board full-width, 30 mm deep and 70 mm high; coat trays inset 50 mm at sides, 15 mm at front and 30 mm at back; fixed coat tray starts at 30 mm and additional shelves end below min(height minus 95 mm, max(35% of height, 48 mm plus shelves times 26 mm)); tray supports 20 mm wide and 10 mm high with 5 mm tray overlap; hooks radius 5 mm, extending from 25 mm to 100 mm forward of the back at height minus 40 mm, with upturns to height minus 15 mm; multiple hooks span positions 40 mm from ends and a single hook is centred; shoe-rack corner posts 30 mm square, upper rails 20 mm deep and 25 mm high, shelves full-depth with 5 mm post penetration, and fixed bottom board starting at 25 mm; adjustable shoe-rack boards lie above the bottom board and below height minus 35 mm; shelves counts additional boards excluding structural bottoms, with equal clear gaps; umbrella stands have open tops, 12 mm walls and 20 mm closed bottoms; hooks apply only to coat racks and shelves exclude umbrella stands; small round hooks use 16 segments; stored items, hinges, fasteners and drawer hardware omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['shoe_cabinet', 'coat_rack', 'shoe_rack', 'umbrella_stand'],
      labels: {
        shoe_cabinet: 'Shoe cabinet',
        coat_rack: 'Coat rack',
        shoe_rack: 'Shoe rack',
        umbrella_stand: 'Umbrella stand',
      },
      default: 'shoe_cabinet',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 1000,
      min: 200,
      max: 1200,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 350,
      min: 250,
      max: 450,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 1000,
      min: 300,
      max: 1900,
      step: 10,
    },
    {
      key: 'hooks',
      label: 'Hooks',
      type: 'integer',
      default: 0,
      min: 0,
      max: 8,
      appliesTo: ['coat_rack'],
    },
    {
      key: 'shelves',
      label: 'Shelves',
      type: 'integer',
      default: 2,
      min: 0,
      max: 6,
      appliesTo: ['shoe_cabinet', 'coat_rack', 'shoe_rack'],
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'white-paint',
    },
  ],
  parts: [{ key: 'body', label: 'Body' }],
  variantDefaults: {
    coat_rack: { width: 600, depth: 400, height: 1800, hooks: 4 },
    shoe_rack: { width: 800, depth: 300, height: 600 },
    umbrella_stand: { width: 250, depth: 250, height: 500 },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'shoe_cabinet';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown hallway-unit variant; choose shoe_cabinet, coat_rack, shoe_rack or umbrella_stand.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Never read material or controls that do not apply to this variant.
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

function shelfBottoms(count, bottom, top, thickness) {
  if (count === 0) return [];

  const gap = (top - bottom - count * thickness) / (count + 1);
  if (gap <= 0) {
    throw new Error(
      `${count} shelves of ${thickness} mm thickness cannot fit between ${bottom} mm and ${top} mm.`
    );
  }

  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(bottom + gap + i * (thickness + gap));
  }
  return result;
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
  const panel = 18;
  const overlap = 5;
  const parts = [];

  if (q.variant === 'shoe_cabinet') {
    const bodyBottom = 35;
    const bodyFront = front + 15;
    const innerBottom = bodyBottom + panel;
    const innerTop = q.height - panel;

    parts.push(
      box(x0 + 15, x1 - 15, front + 30, back - 15, 0, 40),
      booleans.subtract(
        box(x0, x1, bodyFront, back, bodyBottom, q.height),
        box(
          x0 + panel,
          x1 - panel,
          bodyFront - overlap,
          back - 12,
          innerBottom,
          innerTop
        )
      )
    );

    for (const z of shelfBottoms(q.shelves, innerBottom, innerTop, panel)) {
      parts.push(
        box(
          x0 + panel - overlap,
          x1 - panel + overlap,
          front + 40,
          back - 12 + overlap,
          z,
          z + panel
        )
      );
    }

    const doorCount = q.width < 600 ? 1 : 2;
    const faceLeft = x0 + panel - overlap;
    const faceRight = x1 - panel + overlap;
    const leafWidth = (faceRight - faceLeft - (doorCount - 1) * 3) / doorCount;
    const doorBottom = innerBottom - overlap;
    const doorTop = innerTop + overlap;

    for (let i = 0; i < doorCount; i += 1) {
      const left = faceLeft + i * (leafWidth + 3);
      const right = left + leafWidth;
      const pullX = (left + right) / 2;

      parts.push(
        booleans.subtract(
          box(left, right, front, front + 20, doorBottom, doorTop),
          box(
            pullX - 40,
            pullX + 40,
            front - overlap,
            front + 6,
            doorTop - 37,
            doorTop - 25
          )
        )
      );
    }
  } else if (q.variant === 'coat_rack') {
    for (const left of [x0 + 20, x1 - 55]) {
      parts.push(
        box(left, left + 35, front, back, 0, 30),
        box(left, left + 35, back - 35, back, 25, q.height)
      );
    }

    parts.push(
      box(x0, x1, back - 30, back, q.height - 70, q.height)
    );

    const trayLeft = x0 + 50;
    const trayRight = x1 - 50;
    const shelfZoneTop = Math.min(
      q.height - 95,
      Math.max(0.35 * q.height, 48 + q.shelves * 26)
    );
    const trayLevels = [
      30,
      ...shelfBottoms(q.shelves, 48, shelfZoneTop, panel),
    ];

    for (const z of trayLevels) {
      parts.push(
        box(trayLeft, trayRight, front + 15, back - 30, z, z + panel)
      );

      for (const left of [trayLeft, trayRight - 20]) {
        parts.push(
          box(left, left + 20, front + 15, back, z - 5, z + 5)
        );
      }
    }

    for (let i = 0; i < q.hooks; i += 1) {
      const x = q.hooks === 1
        ? 0
        : x0 + 40 + (q.width - 80) * i / (q.hooks - 1);
      const hookY = back - 100;
      const hookZ = q.height - 40;

      parts.push(
        depthRod(5, x, hookY, back - 25, hookZ),
        primitives.cylinder({
          radius: 5,
          height: 25,
          center: [x, hookY, hookZ + 12.5],
          segments: 16,
        })
      );
    }
  } else if (q.variant === 'shoe_rack') {
    for (const left of [x0, x1 - 30]) {
      for (const near of [front, back - 30]) {
        parts.push(
          box(left, left + 30, near, near + 30, 0, q.height)
        );
      }
    }

    for (const near of [front, back - 20]) {
      parts.push(
        box(x0 + 25, x1 - 25, near, near + 20, q.height - 25, q.height)
      );
    }

    const levels = [
      25,
      ...shelfBottoms(q.shelves, 43, q.height - 35, panel),
    ];

    for (const z of levels) {
      parts.push(
        box(x0 + 25, x1 - 25, front, back, z, z + panel)
      );
    }
  } else {
    // Open top and a continuous drip-catching bottom.
    parts.push(
      booleans.subtract(
        box(x0, x1, front, back, 0, q.height),
        box(
          x0 + 12,
          x1 - 12,
          front + 12,
          back - 12,
          20,
          q.height + overlap
        )
      )
    );
  }

  return { body: combine(parts) };
}