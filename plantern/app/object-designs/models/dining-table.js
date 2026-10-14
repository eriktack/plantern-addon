// models/dining-table.js
// Dining table in five shapes (LIBRARY.md row 5): rectangular, round, oval, pedestal and trestle.
// Sizes and ranges are those of suggestedschemas.md in mm (cm × 10). The list's leaves option is
// not in this model yet. Round and pedestal tables use the width as their diameter.

import { primitives, booleans } from '../lib/jscad.js';

export const meta = {
  id: 'dining-table',
  name: 'Dining table',
  description: 'Dining table in five shapes: rectangular, round, oval, pedestal and trestle. Round and pedestal tables use the width as their diameter.',
  params: [
    { key: 'variant', label: 'Shape', type: 'enum', default: 'rectangular',
      options: ['rectangular', 'round', 'oval', 'pedestal', 'trestle'] },
    { key: 'length', label: 'Length (X)', unit: 'mm', default: 1800, min: 800, max: 2800, step: 10,
      hint: 'Not used by round and pedestal tables' },
    { key: 'width', label: 'Width (Y), or diameter', unit: 'mm', default: 900, min: 700, max: 1400, step: 10,
      hint: 'The diameter of a round or pedestal table' },
    { key: 'height', label: 'Height', unit: 'mm', default: 750, min: 720, max: 780, step: 5 },
    { key: 'topThickness', label: 'Top thickness', unit: 'mm', default: 40, min: 10, max: 80, step: 1 },
    { key: 'legSize', label: 'Leg size', unit: 'mm', default: 50, min: 20, max: 120, step: 1,
      hint: 'Square leg cross-section; for a pedestal, the column diameter' },
    { key: 'legInset', label: 'Leg inset', unit: 'mm', default: 50, min: 0, max: 150, step: 5,
      hint: 'How far the legs stand in from the edges of the top' },
    { key: 'legShape', label: 'Leg shape', type: 'enum', default: 'square', options: ['square', 'round'],
      hint: 'Square or round leg cross-section (not used by pedestal and trestle)' },
    { key: 'material', label: 'Material (whole table)', type: 'material', default: 'oak' },
  ],
  // The values that differ in a shape (the picked shape's entry replaces the defaults above).
  variantDefaults: {
    round: { length: 1100, width: 1100 },
    pedestal: { length: 1100, width: 1100 },
    oval: { length: 1800, width: 1000 },
  },
  parts: [
    { key: 'top', label: 'Tabletop' },
    { key: 'legs', label: 'Legs or base' },
  ],
  // The options that ARE the outer size: the Editor turns a typed size into them. A round or pedestal table is as long as it is wide.
  sizeParams: {
    x: { default: 'length', round: 'width', pedestal: 'width' },
    y: 'width',
    z: 'height',
  },
  placement: { mount: 'floor' },
};

// The legs run this far into the tabletop, so the two parts overlap instead of touching face to face.
const LEG_OVERLAP = 5;
// The pedestal's foot plate is this thick.
const FOOT = 30;

/** The footprint of the shape in mm: round and pedestal tables are a circle of the width's diameter. */
function footprint(p) {
  const round = p.variant === 'round' || p.variant === 'pedestal';
  return round ? { round, x: p.width, y: p.width } : { round, x: p.length, y: p.width };
}

export function build(p) {
  const { round, x, y } = footprint(p);
  // The distance from the middle of a leg to its furthest corner (a round leg: its radius) decides what fits.
  const half = Math.min(x, y) / 2;
  const reach = p.legShape === 'round' ? p.legSize / 2 : p.legSize / Math.SQRT2;
  const fourLegs = p.variant !== 'pedestal' && p.variant !== 'trestle';
  const needed = fourLegs && round ? p.legInset + reach : p.legInset + p.legSize;
  if (needed >= half) {
    throw new Error(`The legs do not fit: leg inset + leg size must be less than half the shorter side (${Math.round(half)} mm)`);
  }
  const topZ = p.height - p.topThickness / 2;
  const legTop = p.height - p.topThickness + LEG_OVERLAP;

  let top;
  if (round) {
    top = primitives.cylinder({ radius: x / 2, height: p.topThickness, center: [0, 0, topZ] });
  } else if (p.variant === 'oval') {
    top = primitives.cylinderElliptic({
      height: p.topThickness, startRadius: [x / 2, y / 2], endRadius: [x / 2, y / 2], segments: 48,
      center: [0, 0, topZ],
    });
  } else {
    top = primitives.cuboid({ size: [x, y, p.topThickness], center: [0, 0, topZ] });
  }

  let legs;
  if (p.variant === 'pedestal') {
    const column = primitives.cylinder({ radius: p.legSize / 2, height: legTop, center: [0, 0, legTop / 2] });
    const foot = primitives.cylinder({ radius: x * 0.35, height: FOOT, center: [0, 0, FOOT / 2] });
    legs = booleans.union(column, foot);
  } else if (p.variant === 'trestle') {
    // two end panels, joined at the floor by a stretcher along the length
    const panelX = x / 2 - p.legInset - p.legSize / 2;
    const panels = [-1, 1].map(s => primitives.cuboid({
      size: [p.legSize, y - 2 * p.legInset, legTop], center: [s * panelX, 0, legTop / 2],
    }));
    const stretcher = primitives.cuboid({
      size: [2 * panelX + p.legSize, p.legSize, p.legSize], center: [0, 0, p.legSize / 2],
    });
    legs = booleans.union(...panels, stretcher);
  } else {
    // rectangular, oval and round: four legs at the corners, standing in by the inset from the edge of the top
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    let centres;
    if (round) {
      // a circle: the leg's furthest point sits at the inset from the rim, on the diagonal
      const r = x / 2 - p.legInset - reach;
      centres = corners.map(([sx, sy]) => [sx * r / Math.SQRT2, sy * r / Math.SQRT2]);
    } else if (p.variant === 'oval') {
      // an ellipse: the legs sit on the diagonal of the ellipse shrunk by the inset
      const a = x / 2 - p.legInset - p.legSize / 2, b = y / 2 - p.legInset - p.legSize / 2;
      centres = corners.map(([sx, sy]) => [sx * a / Math.SQRT2, sy * b / Math.SQRT2]);
    } else {
      centres = corners.map(([sx, sy]) => [
        sx * (x / 2 - p.legInset - p.legSize / 2),
        sy * (y / 2 - p.legInset - p.legSize / 2),
      ]);
    }
    const leg = (cx, cy) => (p.legShape === 'round'
      ? primitives.cylinder({ radius: p.legSize / 2, height: legTop, center: [cx, cy, legTop / 2] })
      : primitives.cuboid({ size: [p.legSize, p.legSize, legTop], center: [cx, cy, legTop / 2] }));
    legs = booleans.union(...centres.map(([cx, cy]) => leg(cx, cy)));
  }

  return { top, legs };
}

/** Overall size [x, y, z] in mm, checked by tools/check-model.js against the built bounds. */
export function size(p) {
  const { x, y } = footprint(p);
  return [x, y, p.height];
}
