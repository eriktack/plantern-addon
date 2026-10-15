import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: 5 mm joint overlap (required solid connections).
// ASSUMED: depth describes usable seat depth; a 100 mm back adds to it (literal seat-depth interpretation).
// ASSUMED: corner_l extends from the left end, viewed from the front (no corner-side parameter).
// ASSUMED: chaise length is 1700 mm by default (the Chaise length slider), measured from the outside back: depth 950 + 750 (comfortable reclining length).
// ASSUMED: 100 mm back-shell thickness (upholstered structural back).
// ASSUMED: 120 mm seat-cushion thickness (typical sofa cushioning).
// ASSUMED: 100 mm back-cushion thickness (typical back cushioning).
// ASSUMED: back cushions stop 40 mm below the overall height (visible back-shell border).
// ASSUMED: 10 mm cushion gaps (visible cushion separation).
// ASSUMED: track arms are 100 mm wide and reach seatHeight + 180 mm (slender padded arms).
// ASSUMED: square arms are 160 mm wide and reach seatHeight + 200 mm (broad box arms).
// ASSUMED: rolled arms are 180 mm wide, with 90 mm radius rolls,
//          and reach seatHeight + 200 mm (traditional rounded arms).
// ASSUMED: ordinary base bottom is 80 mm above the floor (short exposed feet).
// ASSUMED: closed sofa-bed base bottom is 40 mm above the floor (deeper mechanism enclosure).
// ASSUMED: feet are 60 mm square, with centres inset 60 mm from footprint edges (stable supports).
// ASSUMED: two_seat and sofa_bed have two main seat/back cushions;
//          three_seat and corner variants have three (recognisable seating layouts).
// ASSUMED: extension cushions are divided into equal lengths no greater than 700 mm
//          before gaps (manageable cushion sizes).
// ASSUMED: corner returns have full-height outside backs rather than low arms
//          (continuous corner-sofa back).
// ASSUMED: a corner_l needs width at least depth + 400 mm;
//          a corner_u needs width at least 2 * depth + 400 mm
//          (room for a useful central seating span).
// UNSURE: "depth of the seat" could mean overall sofa depth; this model treats it
//         as usable seat depth, with the structural back adding 100 mm.
// UNSURE: corner_l has no side selector; it is fixed on the viewer's left.
// UNSURE: chaise length is unspecified; it is independent of cornerLegLength.
// ASSUMED: a corner_l's chaise (chaiseSide right) has its own length, 'Chaise length (L)', default 2400 mm measured from the
//          outside back (the same as the leg by default); the left leg keeps the 'Corner leg length'.
// UNSURE: chaiseSide is still ignored for corner_u, which has no chaise; the UI does not offer it there yet (plan variant-options).
// UNSURE: explicit values cannot be distinguished from defaults in a complete input;
//         supplied values always win, and variant defaults fill only missing values.

export const meta = {
  id: 'sofa',
  name: 'Sofa',
  summary: 'Straight, corner, chaise and sofa-bed sofas, in fabric or another material.',
  description:
    'A parametric sofa with straight, corner, chaise and closed sofa-bed forms; width is the outside back length and depth is usable seat depth. ' +
    'Assumed: joints overlap 5 mm; a 100 mm structural back adds to seat depth; corner_l returns on the viewer’s left; chaise length is a slider, 1700 mm by default; the chaise has no armrest along its length, the base sofa’s armrest is as wide as the chaise; corner returns have a back cushion; ' +
    'seat cushions are 120 mm thick; back cushions are 100 mm thick and stop 40 mm below overall height; cushion gaps are 10 mm; ' +
    'track arms are 100 mm wide and reach seatHeight + 180 mm; square arms are 160 mm wide and reach seatHeight + 200 mm; ' +
    'rolled arms are 180 mm wide with 90 mm radius rolls and reach seatHeight + 200 mm; ' +
    'base bottoms are 80 mm above the floor, or 40 mm for a closed sofa-bed; feet are 60 mm square with centres inset 60 mm; ' +
    'two_seat and sofa_bed have two main seat/back cushions, other variants have three; extension cushion divisions are at most 700 mm before gaps; ' +
    'corner outside backs are full-height; minimum corner widths are depth + 400 mm for corner_l and 2 × depth + 400 mm for corner_u.',
  params: [
    {
      key: 'variant',
      labels: { two_seat: 'Two-seat', three_seat: 'Three-seat', corner_l: 'L-shaped corner', corner_u: 'U-shaped corner', sofa_bed: 'Sofa bed' }, label: 'Variant', type: 'enum',
      options: ['two_seat', 'three_seat', 'corner_l', 'corner_u', 'sofa_bed'],
      default: 'two_seat',
    },
    { key: 'width', label: 'Width', unit: 'mm', default: 2100, min: 1000, max: 3200, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 950, min: 850, max: 1050, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 850, min: 750, max: 950, step: 10 },
    { key: 'seatHeight', label: 'Seat height', unit: 'mm', default: 450, min: 400, max: 500, step: 10 },
    {
      key: 'armStyle', label: 'Arm style', type: 'enum',
      options: ['track', 'rolled', 'square', 'none'], default: 'track',
    },
    {
      key: 'chaiseSide',
      appliesTo: ['two_seat', 'three_seat', 'sofa_bed', 'corner_l'], label: 'Chaise side', type: 'enum',
      options: ['none', 'left', 'right'], default: 'none',
    },
    {
      key: 'chaiseLength',
      appliesTo: ['two_seat', 'three_seat', 'sofa_bed'], label: 'Chaise length', unit: 'mm',
      default: 1700, min: 1000, max: 2000, step: 10,
    },
    {
      key: 'cornerChaiseLength',
      appliesTo: ['corner_l'], label: 'Chaise length (L)', unit: 'mm',
      default: 2400, min: 1000, max: 3200, step: 10,
    },
    {
      key: 'cornerLegLength',
      appliesTo: ['corner_l', 'corner_u'], label: 'Corner leg length', unit: 'mm',
      default: 2400, min: 1600, max: 3200, step: 10,
    },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'fabric' },
  ],
  parts: [
    { key: 'frame', label: 'Frame and arms' },
    { key: 'cushions', label: 'Cushions' },
  ],
  variantDefaults: {
    two_seat: { width: 1600, depth: 900, height: 800 },
    three_seat: { width: 2100, depth: 950, height: 850 },
    corner_l: { width: 2800, depth: 950, height: 850, cornerLegLength: 2400 },
    corner_u: { width: 3000, depth: 950, height: 850, cornerLegLength: 2000 },
    sofa_bed: { width: 2000, depth: 950, height: 850, armStyle: 'square' },
  },
  placement: { mount: 'floor' },
};

function resolveParameters(input) {
  const p = {};
  const variant = input.variant === undefined ? 'two_seat' : input.variant;
  if (!meta.params[0].options.includes(variant)) {
    throw new Error('Unknown sofa variant; select two_seat, three_seat, corner_l, corner_u or sofa_bed.');
  }

  const overrides = meta.variantDefaults[variant];
  for (const spec of meta.params) {
    // Material is deliberately never read or copied into geometry parameters.
    if (spec.type === 'material') continue;
    p[spec.key] = input[spec.key] !== undefined
      ? input[spec.key]
      : overrides[spec.key] !== undefined
        ? overrides[spec.key]
        : spec.default;

    if (spec.unit === 'mm') {
      const value = p[spec.key];
      if (typeof value !== 'number' || !Number.isFinite(value) ||
          value < spec.min || value > spec.max) {
        throw new Error(`${spec.label} must be between ${spec.min} mm and ${spec.max} mm; received ${value} mm.`);
      }
    } else if (spec.type === 'enum' && !spec.options.includes(p[spec.key])) {
      throw new Error(`${spec.label} must be one of: ${spec.options.join(', ')}.`);
    }
  }
  return p;
}

function boxBetween(x0, x1, y0, y1, z0, z1) {
  if (!(x1 > x0 && y1 > y0 && z1 > z0)) {
    throw new Error(
      `Non-positive component dimensions: ${x1 - x0} mm × ${y1 - y0} mm × ${z1 - z0} mm.`
    );
  }
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function joined(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

export function build(input = {}) {
  const p = resolveParameters(input);
  const overlap = 5;
  const backThickness = 100;
  const seatThickness = 120;
  const gap = 10;
  const isCorner = p.variant === 'corner_l' || p.variant === 'corner_u';
  const cornerLeft = isCorner;
  const cornerRight = p.variant === 'corner_u';
  // The chaise: a straight sofa takes it on either side; an L (corner_l) has its return on the left, so its
  // chaise goes on the right, the opposite side. A U (corner_u) takes none.
  if (p.variant === 'corner_l' && p.chaiseSide === 'left') {
    throw new Error('A corner_l already has its return on the left; its chaise goes on the right (chaiseSide right).');
  }
  const chaiseLeft = !isCorner && p.chaiseSide === 'left';
  const chaiseRight = (!isCorner || p.variant === 'corner_l') && p.chaiseSide === 'right';

  const minimumWidth = p.variant === 'corner_u'
    ? 2 * p.depth + 400
    : p.variant === 'corner_l'
      ? p.depth + 400
      : 0;
  if (p.width < minimumWidth) {
    throw new Error(
      `${p.variant} with seat depth ${p.depth} mm needs width at least ${minimumWidth} mm; received ${p.width} mm.`
    );
  }

  const mainDepth = p.depth + backThickness;
  if ((chaiseLeft || chaiseRight) && p.chaiseLength < mainDepth + 200) {
    throw new Error(`Chaise length ${p.chaiseLength} mm must be at least ${mainDepth + 200} mm (the seat depth plus 200 mm).`);
  }
  if (p.variant === 'corner_l' && p.chaiseSide === 'right' && p.cornerChaiseLength < mainDepth + 200) {
    throw new Error(`L chaise length ${p.cornerChaiseLength} mm must be at least ${mainDepth + 200} mm (the seat depth plus 200 mm).`);
  }
  const cornerDivan = p.variant === 'corner_l' && chaiseRight;
  const totalDepth = isCorner
    ? Math.max(p.cornerLegLength, cornerDivan ? p.cornerChaiseLength : 0)
    : chaiseLeft || chaiseRight
      ? p.chaiseLength
      : mainDepth;

  const x0 = -p.width / 2;
  const x1 = p.width / 2;
  const rear = totalDepth / 2;
  const front = -totalDepth / 2;
  // each side's front: the L's leg (left) and its chaise (right) are measured from the back separately
  const frontOf = left => (left
    ? (isCorner ? rear - p.cornerLegLength : front)
    : (cornerDivan ? rear - p.cornerChaiseLength : (isCorner ? rear - p.cornerLegLength : front)));
  const mainFront = rear - mainDepth;
  const baseBottom = p.variant === 'sofa_bed' ? 40 : 80;
  const seatBottom = p.seatHeight - seatThickness;
  const baseTop = seatBottom + overlap;
  const armWidth = p.armStyle === 'track' ? 100
    : p.armStyle === 'square' ? 160
      : p.armStyle === 'rolled' ? 180 : 0;
  const armTop = p.seatHeight + (p.armStyle === 'track' ? 180 : 200);
  // A chaise has no armrest along its own length. On its side the armrest sits over the base sofa only, and it is as
  // wide as the chaise (the smaller part of an L), so the seat cushions there stop that far in.
  const chaiseInset = armWidth > 0 ? p.depth : 0;
  const frame = [];
  const cushions = [];

  function addFeet(a, b, c, d) {
    for (const x of [a + 60, b - 60]) {
      for (const y of [c + 60, d - 60]) {
        frame.push(boxBetween(x - 30, x + 30, y - 30, y + 30, 0, baseBottom + overlap));
      }
    }
  }

  function addArm(a, b, c, d) {
    if (p.armStyle === 'none') return;
    if (p.armStyle !== 'rolled') {
      frame.push(boxBetween(a, b, c, d, baseTop - overlap, armTop));
      return;
    }
    const radius = 90;
    const rollCenterZ = armTop - radius;
    frame.push(boxBetween(
      a, b, c, d, baseTop - overlap, rollCenterZ - radius + overlap
    ));
    const roll = primitives.cylinder({
      radius,
      height: d - c,
      center: [0, 0, 0],
      segments: 32,
    });
    frame.push(transforms.translate(
      [(a + b) / 2, (c + d) / 2, rollCenterZ],
      transforms.rotateX(Math.PI / 2, roll)
    ));
  }

  frame.push(boxBetween(x0, x1, mainFront, rear, baseBottom, baseTop));
  addFeet(x0, x1, mainFront, rear);
  frame.push(boxBetween(x0, x1, rear - backThickness, rear, baseBottom, p.height));

  const leftInset = cornerLeft ? backThickness : chaiseLeft ? chaiseInset : armWidth;
  const rightInset = cornerRight ? backThickness : chaiseRight ? chaiseInset : armWidth;
  const seatLeft = x0 + leftInset;
  const seatRight = x1 - rightInset;
  const count = p.variant === 'two_seat' || p.variant === 'sofa_bed' ? 2 : 3;
  const cushionWidth = (seatRight - seatLeft - gap * (count - 1)) / count;

  if (cushionWidth <= 0) {
    throw new Error(`Width ${p.width} mm cannot accommodate the selected arms and ${count} cushions.`);
  }

  for (let i = 0; i < count; i++) {
    const a = seatLeft + i * (cushionWidth + gap);
    const b = a + cushionWidth;
    cushions.push(boxBetween(
      a, b, mainFront, rear - backThickness + overlap, seatBottom, p.seatHeight
    ));
    cushions.push(boxBetween(
      a, b, rear - backThickness - 100 + overlap, rear - backThickness + overlap,
      p.seatHeight - overlap, p.height - 40
    ));
  }

  for (const side of ['left', 'right']) {
    const left = side === 'left';
    const cornerReturn = left ? cornerLeft : cornerRight;
    const chaise = left ? chaiseLeft : chaiseRight;
    const hasExtension = cornerReturn || chaise;
    const sf = frontOf(left);
    const outerA = left ? x0 : x1 - p.depth;
    const outerB = left ? x0 + p.depth : x1;

    if (hasExtension) {
      frame.push(boxBetween(
        outerA, outerB, sf, mainFront + overlap, baseBottom, baseTop
      ));
      addFeet(outerA, outerB, sf, mainFront + overlap);

      // a chaise's cushions run the full width of its block: its armrest stops at the base sofa
      const outerInset = cornerReturn ? backThickness : chaise ? 0 : armWidth;
      const a = left ? outerA + outerInset : outerA;
      const b = left ? outerB : outerB - outerInset;
      const extensionLength = mainFront + overlap - sf;
      const divisions = Math.ceil(extensionLength / 700);
      const cushionLength = (extensionLength - gap * (divisions - 1)) / divisions;

      for (let i = 0; i < divisions; i++) {
        const c = sf + i * (cushionLength + gap);
        const d = c + cushionLength;
        cushions.push(boxBetween(a, b, c, d, seatBottom, p.seatHeight));
      }

      if (cornerReturn) {
        const shellA = left ? x0 : x1 - backThickness;
        const shellB = left ? x0 + backThickness : x1;
        frame.push(boxBetween(
          shellA, shellB, sf, rear - backThickness + overlap, baseBottom, p.height
        ));
        const padA = left ? shellB - overlap : shellA - 100 + overlap;
        const padB = left ? shellB + 100 - overlap : shellA + overlap;
        // the back cushion on the inside of the return, along its whole length (up to the main back)
        cushions.push(boxBetween(
          padA, padB, sf, rear - backThickness + overlap,
          p.seatHeight - overlap, p.height - 40
        ));
        // the back cushion in the corner, where the return's back meets the main back (was missing)
        const cornerA = left ? x0 : seatRight - overlap;
        const cornerB = left ? seatLeft + overlap : x1;
        cushions.push(boxBetween(
          cornerA, cornerB, rear - backThickness - 100 + overlap, rear - backThickness + overlap,
          baseTop, p.height - 40
        ));
      }
    }

    if (!cornerReturn && armWidth > 0) {
      // a chaise's armrest is as wide as the chaise and runs over the base sofa's depth only
      const armW = chaise ? p.depth : armWidth;
      const a = left ? x0 : x1 - armW;
      const b = left ? x0 + armW : x1;
      addArm(a, b, mainFront, rear - backThickness + overlap);
    }
  }

  return {
    frame: joined(frame),
    cushions: joined(cushions),
  };
}