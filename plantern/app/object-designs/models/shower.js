import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width, depth and height are overall dimensions including the tray, curb and glazing (predictable sizing).
// ASSUMED: The tray is 20 mm thick; curbHeight is additional height above the tray (positive floor geometry even without a curb).
// ASSUMED: Optional curbs are 40 mm wide on all four sides and enter the tray by 5 mm (continuous raised perimeter).
// ASSUMED: Glass is 10 mm thick and enters the tray or curb by 5 mm (connected installation).
// ASSUMED: walk_in has one full-width front screen; its other three sides remain open (single fixed shower screen).
// ASSUMED: corner has a right-hand fixed screen and a front entrance; the building supplies the other walls (two-sided shower corner).
// ASSUMED: enclosed_stall also has left-hand and rear glass walls (complete freestanding enclosure).
// ASSUMED: Entrance glazing spans between positions 5 mm inside the overall side edges (overlap with side screens).
// ASSUMED: Front glass occupies positions 3–13 mm behind the overall front edge (room for hinge hardware).
// ASSUMED: doorWidth is nominal panel width, capped at the available entrance width; sliding leaves are additionally capped at 65% of entrance width (valid closed layouts across the parameter range).
// ASSUMED: Hinged and pivot doors have a 3 mm gap beside any fixed front return and a 5 mm top clearance (closed door layout).
// ASSUMED: Without a door, enclosed and corner variants retain a fixed front return covering the rightmost 35% of the entrance (open access with splash protection).
// ASSUMED: Sliding layouts use a front movable pane and rear fixed pane with 30 mm horizontal overlap and 5 mm separation between tracks (recognisable sliding assembly).
// ASSUMED: Sliding guide rails are 10 mm high and 33 mm deep; panes enter each rail by 5 mm (connected track geometry).
// ASSUMED: Hinges and pivot pins have 8 mm radius and 30 mm height; axes are 10 mm and 60 mm inside the door's left edge respectively (distinct door operation).
// ASSUMED: Door handholds are 20 mm wide by 100 mm high, centred 40 mm from the right edge at mid-height (integrated opening detail).
// ASSUMED: Centre and corner drains are 60 mm diameter holes; corner drains are inset 90 mm from the right and rear edges (simple floor outlets).
// ASSUMED: Wall drains are slots 60% of width long and 20 mm deep, centred 70 mm from the rear edge (linear rear drainage).
// ASSUMED: Small round drains and hinge hardware use 16 segments (small-part resolution).
// ASSUMED: Glass seals, plumbing, shower fittings, wall finishes, floor falls and fasteners are omitted (enclosure geometry only).
// UNSURE: The walk-in door default conflicts with its single-fixed-screen description; door controls are hidden and ignored for walk_in, following its variant default.
// UNSURE: Door widths can exceed the enclosure width in the supplied ranges; nominal widths are capped rather than producing impossible panels.
// UNSURE: The no-door part is intentionally empty, including for walk_in.
// UNSURE: Curbs beneath entrances are continuous thresholds rather than interrupted kerbs.
// UNSURE: Variant defaults apply only to omitted parameters; supplied applicable values always win.

export const meta = {
  id: 'shower',
  name: 'Shower',
  summary: 'A shower enclosure with walk-in, enclosed-stall and corner variants.',
  description:
    'A shower tray and glass enclosure facing -y, with configurable drainage, threshold and closed door operation. Assumed: dimensions include tray, curb and glass; tray thickness 20 mm and curbHeight is additional; curbs are 40 mm wide on all four sides with 5 mm tray overlap; glass thickness 10 mm with 5 mm tray or curb penetration; walk_in has one full-width front screen and three open sides; corner has a right screen and front entrance, relying on building walls elsewhere; enclosed_stall adds left and rear glass; entrance glazing ends 5 mm inside overall side edges and front panes occupy 3–13 mm behind the front edge; doorWidth is nominal and capped at entrance width, or 65% of entrance width for sliding leaves; hinged/pivot front-return gaps 3 mm and top clearance 5 mm; door-free corner and enclosed layouts retain a right-hand front return covering 35% of entrance width; sliding panes overlap horizontally by 30 mm with 5 mm track separation; sliding rails 10 mm high and 33 mm deep with 5 mm pane penetration; hinge/pivot pins radius 8 mm and height 30 mm, axes 10/60 mm inside the left leaf edge; handholds 20 by 100 mm, centred 40 mm from the right edge at mid-height; circular drains diameter 60 mm, with corner positions inset 90 mm from right/rear edges; wall drains 60% of width long and 20 mm deep, centred 70 mm from the rear; small round parts use 16 segments; seals, plumbing, shower fittings, wall finishes, floor falls and fasteners omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['walk_in', 'enclosed_stall', 'corner'],
      labels: {
        walk_in: 'Walk-in screen',
        enclosed_stall: 'Enclosed shower stall',
        corner: 'Corner shower',
      },
      default: 'walk_in',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 900,
      min: 800,
      max: 1200,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 900,
      min: 800,
      max: 1200,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 2000,
      min: 1900,
      max: 2200,
      step: 10,
    },
    {
      key: 'doorType',
      label: 'Door type',
      type: 'enum',
      options: ['none', 'hinged', 'sliding', 'pivot'],
      default: 'hinged',
      appliesTo: ['enclosed_stall', 'corner'],
    },
    {
      key: 'doorWidth',
      label: 'Door width',
      unit: 'mm',
      default: 900,
      min: 700,
      max: 1200,
      step: 10,
      appliesTo: ['enclosed_stall', 'corner'],
    },
    {
      key: 'floorDrain',
      label: 'Floor drain',
      type: 'boolean',
      default: true,
    },
    {
      key: 'drainPosition',
      label: 'Drain position',
      type: 'enum',
      options: ['center', 'corner', 'wall'],
      default: 'center',
    },
    {
      key: 'curbHeight',
      label: 'Curb height',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 150,
      step: 10,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'glass',
    },
  ],
  parts: [
    { key: 'base', label: 'Floor tray or curb' },
    { key: 'screen', label: 'Glass walls' },
    {
      key: 'door',
      label: 'Door',
      appliesTo: ['enclosed_stall', 'corner'],
    },
  ],
  variantDefaults: {
    walk_in: {
      doorType: 'none',
      curbHeight: 0,
      width: 1200,
      depth: 900,
    },
    enclosed_stall: {
      doorType: 'hinged',
      curbHeight: 50,
    },
    corner: {
      doorType: 'pivot',
      width: 900,
      depth: 900,
    },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'walk_in';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown shower variant; choose walk_in, enclosed_stall or corner.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant];

  // Material and controls hidden for this variant are never read.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;
    if (definition.appliesTo && !definition.appliesTo.includes(variant)) {
      continue;
    }
    if (key === 'doorWidth' && q.doorType === 'none') continue;
    if (key === 'drainPosition' && !q.floorDrain) continue;

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

  if (variant === 'walk_in') q.doorType = 'none';
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
  const overlap = 5;
  const glassThickness = 10;
  const trayThickness = 20;
  const curbWidth = 40;

  const left = -q.width / 2;
  const right = q.width / 2;
  const front = -q.depth / 2;
  const back = q.depth / 2;

  const mountingTop = trayThickness + q.curbHeight;
  const glassBottom = mountingTop - overlap;
  const glassTop = q.height;

  if (glassTop <= glassBottom + 100) {
    throw new Error(
      `Height ${q.height} mm must leave more than 100 mm above the ${mountingTop} mm mounting surface.`
    );
  }

  const basePieces = [
    box(left, right, front, back, 0, trayThickness),
  ];

  if (q.curbHeight > 0) {
    basePieces.push(
      booleans.subtract(
        box(
          left, right, front, back,
          trayThickness - overlap, mountingTop
        ),
        box(
          left + curbWidth,
          right - curbWidth,
          front + curbWidth,
          back - curbWidth,
          trayThickness - 2 * overlap,
          mountingTop + overlap
        )
      )
    );
  }

  let base = combine(basePieces);

  if (q.floorDrain) {
    let drain;

    if (q.drainPosition === 'wall') {
      drain = box(
        -0.3 * q.width,
        0.3 * q.width,
        back - 80,
        back - 60,
        -overlap,
        trayThickness + overlap
      );
    } else {
      const drainX = q.drainPosition === 'corner' ? right - 90 : 0;
      const drainY = q.drainPosition === 'corner' ? back - 90 : 0;

      drain = primitives.cylinder({
        radius: 30,
        height: trayThickness + 2 * overlap,
        center: [drainX, drainY, trayThickness / 2],
        segments: 16,
      });
    }

    base = booleans.subtract(base, drain);
  }

  const screens = [];
  const doors = [];
  const entranceLeft = left + overlap;
  const entranceRight = right - overlap;
  const entranceWidth = entranceRight - entranceLeft;
  const frontPaneY0 = front + 3;
  const frontPaneY1 = frontPaneY0 + glassThickness;

  if (q.variant === 'walk_in') {
    screens.push(
      box(
        left, right,
        frontPaneY0, frontPaneY1,
        glassBottom, glassTop
      )
    );

    return {
      base,
      screen: combine(screens),
      door: geometries.geom3.create(),
    };
  }

  // Right fixed wall. Its junction with front glazing overlaps by 5 mm.
  const sideBack = q.variant === 'enclosed_stall' ? back - overlap : back;
  screens.push(
    box(
      right - glassThickness, right,
      front + 8, sideBack,
      glassBottom, glassTop
    )
  );

  if (q.variant === 'enclosed_stall') {
    screens.push(
      box(
        left, left + glassThickness,
        front + 8, back - overlap,
        glassBottom, glassTop
      ),
      box(
        left, right,
        back - glassThickness, back,
        glassBottom, glassTop
      )
    );
  }

  if (q.doorType === 'none') {
    screens.push(
      box(
        entranceRight - 0.35 * entranceWidth,
        entranceRight,
        frontPaneY0,
        frontPaneY1,
        glassBottom,
        glassTop
      )
    );

    return {
      base,
      screen: combine(screens),
      door: geometries.geom3.create(),
    };
  }

  const sliding = q.doorType === 'sliding';
  const leafWidth = Math.min(
    q.doorWidth,
    sliding ? 0.65 * entranceWidth : entranceWidth
  );
  const leafLeft = entranceLeft;
  const leafRight = leafLeft + leafWidth;
  const leafBottom = sliding ? glassBottom + overlap : glassBottom;
  const leafTop = glassTop - overlap;

  if (sliding) {
    // Rear fixed panel sits 5 mm behind the movable pane.
    screens.push(
      box(
        leafRight - 30,
        entranceRight,
        front + 18,
        front + 28,
        leafBottom,
        leafTop
      ),
      box(
        entranceLeft,
        entranceRight,
        front,
        front + 33,
        glassBottom,
        glassBottom + 10
      ),
      box(
        entranceLeft,
        entranceRight,
        front,
        front + 33,
        glassTop - 10,
        glassTop
      )
    );
  } else {
    const fixedLeft = leafRight + 3;
    if (fixedLeft < entranceRight) {
      screens.push(
        box(
          fixedLeft,
          entranceRight,
          frontPaneY0,
          frontPaneY1,
          glassBottom,
          glassTop
        )
      );
    }
  }

  const leaf = box(
    leafLeft,
    leafRight,
    frontPaneY0,
    frontPaneY1,
    leafBottom,
    leafTop
  );

  const handleX = leafRight - 40;
  const handleZ = (leafBottom + leafTop) / 2;
  const handhold = box(
    handleX - 10,
    handleX + 10,
    frontPaneY0 - overlap,
    frontPaneY1 + overlap,
    handleZ - 50,
    handleZ + 50
  );

  doors.push(booleans.subtract(leaf, handhold));

  if (!sliding) {
    const axisX = leafLeft + (q.doorType === 'pivot' ? 60 : 10);
    const axisY = front + 8;

    for (const bottom of [leafBottom, leafTop - 30]) {
      doors.push(
        primitives.cylinder({
          radius: 8,
          height: 30,
          center: [axisX, axisY, bottom + 15],
          segments: 16,
        })
      );
    }
  }

  return {
    base,
    screen: combine(screens),
    door: combine(doors),
  };
}