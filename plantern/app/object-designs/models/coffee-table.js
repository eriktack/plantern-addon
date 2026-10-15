import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Tops are 30 mm thick (robust coffee-table construction).
// ASSUMED: Rectangular tables have four 40 mm square legs inset 25 mm from the top edges (stable support).
// ASSUMED: Round tables have four 40 mm square legs centred at 55% of each top radius along both axes (legs stay inside the oval).
// ASSUMED: Shelves are 18 mm thick with their tops at 28% of the table height (usable lower storage).
// ASSUMED: Rectangular shelves extend 5 mm into the legs (connected joints).
// ASSUMED: Round shelves use 65% of the top radii (inset lower shelf).
// ASSUMED: The smaller nesting table is 65% of the main length and width and 80 mm lower (nested proportions).
// ASSUMED: Nesting tables are displayed separately along x with a 30 mm edge gap, then centred as a pair (unambiguous solids).
// ASSUMED: Shelves, when enabled, are provided on both nesting tables (consistent shelf option).
// UNSURE: Round with unequal length and width is interpreted as an oval, so both dimensions remain effective.
// UNSURE: Nesting-pair dimensions describe the larger table, not the combined displayed footprint.
// UNSURE: Shelves can obstruct nesting; the pair is therefore always shown deployed.
// UNSURE: Variant defaults apply only to omitted parameters; explicitly supplied values always win.

export const meta = {
  id: 'coffee-table',
  name: 'Coffee table',
  summary: 'A coffee table, rectangular or oval, or a pair of nesting tables.',
  description:
    'A rectangular or oval coffee table, optionally with a lower shelf, or a deployed pair of nesting tables. Assumed: tops 30 mm thick; four 40 mm square legs; rectangular legs inset 25 mm from top edges; oval leg centres at 55% of each top radius along both axes; shelves 18 mm thick with tops at 28% of table height; rectangular shelves extend 5 mm into legs; oval shelf radii 65% of top radii; smaller nesting table length and width 65% of the larger table and height 80 mm lower; nesting tables displayed along x with a 30 mm edge gap and their combined footprint centred; enabled shelves supplied on both nesting tables; unequal round dimensions form an oval; nesting-pair dimensions describe the larger table.',
  params: [
    {
      key: 'variant',
      labels: { rectangular: 'Rectangular', round: 'Round', nesting_pair: 'Nesting pair', with_shelf: 'With lower shelf' },
      label: 'Variant',
      type: 'enum',
      options: ['rectangular', 'round', 'nesting_pair', 'with_shelf'],
      default: 'rectangular',
    },
    {
      key: 'length',
      label: 'Length',
      unit: 'mm',
      default: 1100,
      min: 600,
      max: 1400,
      step: 10,
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 600,
      min: 400,
      max: 800,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 450,
      min: 350,
      max: 500,
      step: 10,
    },
    {
      key: 'shelf',
      label: 'Shelf',
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
    { key: 'top', label: 'Top' },
    { key: 'legs', label: 'Legs and shelf' },
  ],
  variantDefaults: {
    round: { length: 800, width: 800 },
    nesting_pair: { length: 900, width: 550, height: 450 },
    with_shelf: { shelf: true },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'rectangular';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error('Unknown coffee-table variant; choose rectangular, round, nesting_pair or with_shelf.');
  }

  const defaults = meta.variantDefaults[variant] ?? {};
  const q = { variant };

  // Material is intentionally never read.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'material' || key === 'variant') continue;
    q[key] = p[key] ?? defaults[key] ?? definition.default;

    if (definition.unit === 'mm') {
      if (
        !Number.isFinite(q[key]) ||
        q[key] < definition.min ||
        q[key] > definition.max
      ) {
        throw new Error(
          `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
        );
      }
    }
  }

  if (typeof q.shelf !== 'boolean') {
    throw new Error('Shelf must be true or false.');
  }
  return q;
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

export function build(p) {
  const q = resolve(p);
  const tops = [];
  const supports = [];
  const topThickness = 30;
  const legWidth = 40;
  const overlap = 5;
  const shelfThickness = 18;

  function table(length, width, height, centerX, oval) {
    const underside = height - topThickness;
    const legHeight = underside + overlap;

    if (oval) {
      tops.push(
        primitives.cylinderElliptic({
          height: topThickness,
          startRadius: [length / 2, width / 2],
          endRadius: [length / 2, width / 2],
          center: [centerX, 0, height - topThickness / 2],
          segments: 32,
        })
      );
    } else {
      tops.push(
        primitives.cuboid({
          size: [length, width, topThickness],
          center: [centerX, 0, height - topThickness / 2],
        })
      );
    }

    const legX = oval ? 0.55 * length / 2 : length / 2 - 25 - legWidth / 2;
    const legY = oval ? 0.55 * width / 2 : width / 2 - 25 - legWidth / 2;

    if (legX <= legWidth / 2 || legY <= legWidth / 2 || legHeight <= 0) {
      throw new Error(
        `A table measuring ${length} mm by ${width} mm by ${height} mm cannot fit four ${legWidth} mm legs.`
      );
    }

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        supports.push(
          primitives.cuboid({
            size: [legWidth, legWidth, legHeight],
            center: [centerX + sx * legX, sy * legY, legHeight / 2],
          })
        );
      }
    }

    if (!q.shelf) return;

    const shelfTop = 0.28 * height;
    if (shelfTop <= shelfThickness || shelfTop >= underside - overlap) {
      throw new Error(
        `An ${shelfThickness} mm shelf does not fit below the top of a ${height} mm high table.`
      );
    }

    if (oval) {
      supports.push(
        primitives.cylinderElliptic({
          height: shelfThickness,
          startRadius: [0.65 * length / 2, 0.65 * width / 2],
          endRadius: [0.65 * length / 2, 0.65 * width / 2],
          center: [centerX, 0, shelfTop - shelfThickness / 2],
          segments: 32,
        })
      );
    } else {
      supports.push(
        primitives.cuboid({
          size: [
            2 * (legX - legWidth / 2 + overlap),
            2 * (legY - legWidth / 2 + overlap),
            shelfThickness,
          ],
          center: [centerX, 0, shelfTop - shelfThickness / 2],
        })
      );
    }
  }

  if (q.variant === 'nesting_pair') {
    const smallLength = 0.65 * q.length;
    const smallWidth = 0.65 * q.width;
    const smallHeight = q.height - 80;
    const gap = 30;
    const totalLength = q.length + gap + smallLength;
    const mainX = -totalLength / 2 + q.length / 2;
    const smallX = totalLength / 2 - smallLength / 2;

    table(q.length, q.width, q.height, mainX, false);
    table(smallLength, smallWidth, smallHeight, smallX, false);
  } else {
    table(q.length, q.width, q.height, 0, q.variant === 'round');
  }

  return {
    top: combine(tops),
    legs: combine(supports),
  };
}