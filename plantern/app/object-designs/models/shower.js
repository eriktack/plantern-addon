import { primitives, booleans, transforms, geometries, extrusions } from '../lib/jscad.js';

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
// ASSUMED: Rounded corner (doorShape): the tray is a quarter ellipse centred on the back-left corner with radii width and depth; the glass, the door, the rails and the curb follow the curve; door and pane sizes are lengths along the curve (same rules as the straight front).
// ASSUMED: Shower fittings (optional, on the back, left or right wall, in the middle of it): a mixer 110 mm wide at 950 mm, a slide rail from 1150 to 1850 mm with a hand shower on it, and a rain head 220 mm across on a 260 mm arm 120 mm below the top. A rounded corner has no right wall, so right uses the back wall there.
// ASSUMED: Glass seals, plumbing hoses, wall finishes, floor falls and fasteners are omitted (enclosure geometry only).
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
    'A shower tray and glass enclosure facing -y, with configurable drainage, threshold and closed door operation. Assumed: dimensions include tray, curb and glass; tray thickness 20 mm and curbHeight is additional; curbs are 40 mm wide on all four sides with 5 mm tray overlap; glass thickness 10 mm with 5 mm tray or curb penetration; walk_in has one full-width front screen and three open sides; corner has a right screen and front entrance, relying on building walls elsewhere; enclosed_stall adds left and rear glass; entrance glazing ends 5 mm inside overall side edges and front panes occupy 3–13 mm behind the front edge; doorWidth is nominal and capped at entrance width, or 65% of entrance width for sliding leaves; hinged/pivot front-return gaps 3 mm and top clearance 5 mm; door-free corner and enclosed layouts retain a right-hand front return covering 35% of entrance width; sliding panes overlap horizontally by 30 mm with 5 mm track separation; sliding rails 10 mm high and 33 mm deep with 5 mm pane penetration; hinge/pivot pins radius 8 mm and height 30 mm, axes 10/60 mm inside the left leaf edge; handholds 20 by 100 mm, centred 40 mm from the right edge at mid-height; circular drains diameter 60 mm, with corner positions inset 90 mm from right/rear edges; wall drains 60% of width long and 20 mm deep, centred 70 mm from the rear; small round parts use 16 segments; a corner shower can be rounded (doorShape): a quarter-ellipse tray with the glass, rails, curb and door laid along the curve; optional fittings (a mixer, a slide rail with a hand shower and a rain head) hang on the back, left or right wall; seals, plumbing, wall finishes, floor falls and fasteners omitted.',
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
      key: 'doorShape',
      label: 'Door shape',
      type: 'enum',
      options: ['square', 'rounded'],
      labels: { square: 'Straight (90 degree corner)', rounded: 'Rounded (quarter-round)' },
      default: 'square',
      appliesTo: ['corner'],
      hint: 'Rounded: the glass and the door follow a quarter-round curve instead of a square corner.',
    },
    {
      key: 'fittings',
      label: 'Shower fittings',
      type: 'boolean',
      default: false,
      hint: 'A mixer, slide rail with hand shower and a rain head on one wall.',
    },
    {
      key: 'fittingsSide',
      label: 'Fittings on the',
      type: 'enum',
      options: ['back', 'left', 'right'],
      labels: { back: 'Back wall', left: 'Left wall', right: 'Right wall' },
      default: 'back',
      hint: 'Seen from the front. A rounded corner has no right wall, so right then uses the back wall.',
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
      default: 'ceramic',
    },
  ],
  parts: [
    { key: 'base', label: 'Floor tray or curb' },
    { key: 'screen', label: 'Glass walls', defaultMaterial: 'glass' },
    {
      key: 'door',
      label: 'Door',
      defaultMaterial: 'glass',
      appliesTo: ['enclosed_stall', 'corner'],
    },
    { key: 'fittings', label: 'Shower fittings', defaultMaterial: 'metal', needs: 'fittings' },
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
  sizeParams: { x: 'width', y: 'depth', z: 'height' },

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

// ---- rounded corner: a quarter-ellipse enclosure --------------------------------------------------
// The ellipse is centred on the back-left corner (the two building walls) with radii width (x) and depth (y).
// The curve runs from the right end of the back wall (angle 0) round to the left end of the front (angle 90).
// A position on it is given by its arc length `s` from the front-left end, so a door width is a real length.

const ARC_STEPS = 90;

function arcTable(rx, ry) {
  const cum = [0];
  let prev = [0, ry];                                     // angle 90 degrees: x = rx cos, y = ry sin
  for (let i = 1; i <= ARC_STEPS; i++) {
    const a = Math.PI / 2 - (i / ARC_STEPS) * (Math.PI / 2);
    const pt = [rx * Math.cos(a), ry * Math.sin(a)];
    cum.push(cum[i - 1] + Math.hypot(pt[0] - prev[0], pt[1] - prev[1]));
    prev = pt;
  }
  return cum;
}

/** The angle (radians, 90 degrees at s = 0, 0 at s = length) at arc length s from the front-left end. */
function angleAt(cum, s) {
  const length = cum[cum.length - 1];
  const t = Math.min(Math.max(s, 0), length);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < t) i++;
  const f = cum[i] === cum[i - 1] ? 0 : (t - cum[i - 1]) / (cum[i] - cum[i - 1]);
  return Math.PI / 2 - ((i - 1 + f) / ARC_STEPS) * (Math.PI / 2);
}

function extrudePolygon(points, z0, z1) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  const ordered = area < 0 ? points.slice().reverse() : points;
  const solid = extrusions.extrudeLinear({ height: z1 - z0 }, geometries.geom2.fromPoints(ordered));
  return transforms.translateZ(z0, solid);
}

function roundedCorner(q) {
  const W = q.width, D = q.depth;
  const left = -W / 2, right = W / 2, front = -D / 2, back = D / 2;
  const cum = arcTable(W, D);
  const length = cum[cum.length - 1];
  // a point of the curve `inset` mm inside the outer edge, at angle a
  const at = (inset, a) => [left + (W - inset) * Math.cos(a), back - (D - inset) * Math.sin(a)];
  const curve = (inset, a0, a1) => {                      // points along the curve from a0 down to a1 (a0 > a1)
    const n = Math.max(2, Math.ceil(((a0 - a1) * 180) / Math.PI / 3));
    return Array.from({ length: n + 1 }, (_, i) => at(inset, a0 + ((a1 - a0) * i) / n));
  };
  // the part of the curve from arc length sA to sB, as a thin glass strip between two insets
  const strip = (inset0, inset1, sA, sB, z0, z1) => {
    const aHigh = angleAt(cum, sA), aLow = angleAt(cum, sB);
    if (aHigh - aLow < 0.01 || z1 - z0 <= 0) return null;
    return extrudePolygon([...curve(inset0, aHigh, aLow), ...curve(inset1, aHigh, aLow).reverse()], z0, z1);
  };
  const quarter = (rx, ry, z0, z1) => extrudePolygon([[left, back], ...Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const a = (i / ARC_STEPS) * (Math.PI / 2);
    return [left + rx * Math.cos(a), back - ry * Math.sin(a)];
  })], z0, z1);
  return { W, D, left, right, front, back, cum, length, at, strip, quarter };
}

// ---- shower fittings: a rail, mixer, hand shower and rain head on one wall -------------------------

function fittings(q, side, off) {
  const left = -q.width / 2, right = q.width / 2, back = q.depth / 2;
  // u along the wall (0 = the middle of it), v out from the wall face
  const bz = (u0, u1, v0, v1, z0, z1) => {
    const a = off + v0, b = off + v1;
    if (side === 'back') return box(u0, u1, back - b, back - a, z0, z1);
    if (side === 'left') return box(left + a, left + b, u0, u1, z0, z1);
    return box(right - b, right - a, u0, u1, z0, z1);
  };
  const cz = (r, u, v, z0, z1) => {
    const x = side === 'back' ? u : side === 'left' ? left + off + v : right - off - v;
    const y = side === 'back' ? back - off - v : u;
    return primitives.cylinder({ radius: r, height: z1 - z0, center: [x, y, (z0 + z1) / 2], segments: 16 });
  };
  const H = q.height;
  const railBottom = 1150, railTop = 1850, railV = 32;
  return booleans.union(
    // mixer on the wall with a lever
    bz(-55, 55, 0, 55, 950, 1020),
    bz(-9, 9, 50, 100, 975, 995),
    // slide rail on two brackets
    cz(11, 0, railV, railBottom, railTop),
    bz(-12, 12, 0, railV, railBottom, railBottom + 24),
    bz(-12, 12, 0, railV, railTop - 24, railTop),
    // hand shower: a holder on the rail, the handle and its head
    bz(-16, 16, railV - 11, railV + 28, 1450, 1485),
    cz(16, 0, railV + 40, 1380, 1560),
    cz(42, 0, railV + 40, 1555, 1571),
    // rain head on an arm from the wall
    bz(-8, 8, 0, 260, H - 135, H - 119),
    cz(110, 0, 260, H - 140, H - 125),
  );
}

export function build(p = {}) {
  const q = resolve(p);
  const overlap = 5;
  const glassThickness = 10;
  const trayThickness = 20;
  const curbWidth = 40;
  const rounded = q.variant === 'corner' && q.doorShape === 'rounded';

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

  const arc = rounded ? roundedCorner(q) : null;

  // The wall the fittings hang on: a rounded corner has no right wall, so "right" uses the back wall there.
  const fittingSide = rounded && q.fittingsSide === 'right' ? 'back' : q.fittingsSide;
  const wallGlass = q.variant === 'enclosed_stall' || (q.variant === 'corner' && !rounded && fittingSide === 'right');
  const fit = q.fittings ? fittings(q, fittingSide, wallGlass ? glassThickness : 0) : geometries.geom3.create();

  let base;
  if (rounded) {
    const basePieces = [arc.quarter(q.width, q.depth, 0, trayThickness)];
    if (q.curbHeight > 0) {
      const inner = booleans.intersect(
        arc.quarter(q.width - curbWidth, q.depth - curbWidth, trayThickness - 2 * overlap, mountingTop + overlap),
        box(left + curbWidth, right, front, back - curbWidth, trayThickness - 2 * overlap, mountingTop + overlap)
      );
      basePieces.push(
        booleans.subtract(arc.quarter(q.width, q.depth, trayThickness - overlap, mountingTop), inner)
      );
    }
    base = combine(basePieces);
  } else {
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

    base = combine(basePieces);
  }

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
      fittings: fit,
    };
  }

  if (rounded) {
    return { base, ...roundedGlass(q, arc, fit, glassBottom, glassTop, overlap, glassThickness) };
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
      fittings: fit,
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
    fittings: fit,
  };
}

// The glass and door of a rounded corner: the same layout as the straight front, laid along the curve.
function roundedGlass(q, arc, fit, glassBottom, glassTop, overlap, glassThickness) {
  const { length, strip, at } = arc;
  const entranceLeft = overlap;
  const entranceRight = length - overlap;
  const entranceWidth = entranceRight - entranceLeft;
  const screens = [];
  const doors = [];

  if (q.doorType === 'none') {
    screens.push(strip(3, 3 + glassThickness, entranceRight - 0.35 * entranceWidth, length, glassBottom, glassTop));
    return { screen: combine(screens.filter(Boolean)), door: geometries.geom3.create(), fittings: fit };
  }

  const sliding = q.doorType === 'sliding';
  const leafWidth = Math.min(q.doorWidth, sliding ? 0.65 * entranceWidth : entranceWidth);
  const leafLeft = entranceLeft;
  const leafRight = leafLeft + leafWidth;
  const leafBottom = sliding ? glassBottom + overlap : glassBottom;
  const leafTop = glassTop - overlap;

  if (sliding) {
    screens.push(
      strip(18, 28, leafRight - 30, entranceRight, leafBottom, leafTop),
      strip(0, 33, entranceLeft, entranceRight, glassBottom, glassBottom + 10),
      strip(0, 33, entranceLeft, entranceRight, glassTop - 10, glassTop)
    );
  } else if (leafRight + 3 < length) {
    screens.push(strip(3, 3 + glassThickness, leafRight + 3, length, glassBottom, glassTop));
  }

  let leaf = strip(3, 3 + glassThickness, leafLeft, leafRight, leafBottom, leafTop);
  // the handhold, turned to follow the curve where it is cut
  const handleAngle = angleAt(arc.cum, leafRight - 40);
  const [hx, hy] = at(3 + glassThickness / 2, handleAngle);
  const tangent = Math.atan2(-arc.D * Math.cos(handleAngle), -arc.W * Math.sin(handleAngle));
  const handleZ = (leafBottom + leafTop) / 2;
  const handhold = transforms.translate(
    [hx, hy, 0],
    transforms.rotateZ(tangent, box(-10, 10, -(glassThickness + 2 * overlap) / 2, (glassThickness + 2 * overlap) / 2, handleZ - 50, handleZ + 50))
  );
  leaf = booleans.subtract(leaf, handhold);
  doors.push(leaf);

  if (!sliding) {
    const axisAngle = angleAt(arc.cum, leafLeft + (q.doorType === 'pivot' ? 60 : 10));
    const [ax, ay] = at(8, axisAngle);
    for (const bottom of [leafBottom, leafTop - 30]) {
      doors.push(primitives.cylinder({ radius: 8, height: 30, center: [ax, ay, bottom + 15], segments: 16 }));
    }
  }

  return { screen: combine(screens.filter(Boolean)), door: combine(doors), fittings: fit };
}
