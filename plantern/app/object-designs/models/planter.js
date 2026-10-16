import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: diameter is the outside diameter at the opening; height is the pot height excluding suspension (clear sizing).
// ASSUMED: The pot and the hanging planter have bottom radii of 75% and 65% of their top radii (distinct tapered profiles). Size is set by diameter and height alone.
// ASSUMED: Pot walls are 10 mm thick radially and the closed bottom is 12 mm thick (ceramic construction).
// ASSUMED: No drainage hole, saucer, soil or plant is included (watertight decorative planter).
// ASSUMED: Hanging cords have 2 mm radius and are equally spaced by 120 degrees, with the first attachment towards +y (balanced suspension).
// ASSUMED: Cord attachment centres are 5 mm below the opening and halfway through the local wall thickness (embedded connections).
// ASSUMED: Each specified 500 mm cord length is its straight centreline distance from its embedded attachment to the common junction (literal cord length).
// ASSUMED: The common suspension junction is a 5 mm radius sphere; cord ends overlap it axially by 5 mm (connected meeting point).
// ASSUMED: Pot surfaces use 32 segments; cords and the suspension junction use 16 (appropriate round-part resolution).
// UNSURE: The hanging cord length could mean vertical drop; it is interpreted as actual sloping cord length.
// UNSURE: Suspension geometry belongs to the pot part because no separate cord or fitting part is provided.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'planter',
  name: 'Planter',
  summary: 'A tapered planter pot, standing or hanging from three cords.',
  description:
    'A hollow tapered planter with a closed bottom and optional three-cord ceiling suspension, without a plant. Assumed: diameter is the outside opening diameter and height excludes suspension; pot and hanging bottom radii are 75/65% of top radius; walls are 10 mm thick radially and the bottom is 12 mm thick; no drainage hole, saucer, soil or plant; hanging cords have 2 mm radius and attachments spaced by 120 degrees with the first towards +y; attachment centres are 5 mm below the opening and halfway through the local wall; each 500 mm cord is measured along its straight centreline between its embedded attachment and the common junction; junction sphere radius 5 mm with 5 mm axial cord overlap; pot surfaces use 32 segments and cords and junction use 16.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['pot', 'hanging'],
      labels: {
        pot: 'Pot',
        hanging: 'Hanging planter',
      },
      default: 'pot',
    },
    {
      key: 'diameter',
      label: 'Diameter',
      unit: 'mm',
      default: 300,
      min: 100,
      max: 600,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 400,
      min: 100,
      max: 2000,
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
    { key: 'pot', label: 'Pot' },
  ],
  variantDefaults: {
    hanging: { diameter: 200, height: 200 },
  },
  sizeParams: { x: 'diameter', y: 'diameter', z: { default: 'height', hanging: null } },
  placement: {
    mount: 'floor',
    hosts: ['room', 'wall', 'sill'],
    variants: { hanging: { mount: 'ceiling', hosts: ['room', 'head'] } },
  },
};

function resolve(p) {
  const variant = p.variant ?? 'pot';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown planter variant; choose pot or hanging.'
    );
  }

  const defaults = meta.variantDefaults[variant] ?? {};
  const q = { variant };

  // Material is deliberately never read or copied.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;

    const value = p[key] ?? defaults[key] ?? definition.default;
    if (
      !Number.isFinite(value) ||
      value < definition.min ||
      value > definition.max
    ) {
      throw new Error(
        `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
      );
    }
    q[key] = value;
  }

  return q;
}

function cordBetween(start, end, radius) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const horizontal = Math.hypot(dx, dy);
  const length = Math.hypot(horizontal, dz);

  const cord = primitives.cylinder({
    radius,
    height: length,
    center: [0, 0, 0],
    segments: 16,
  });

  // Rotate the initially vertical cord first, then move to its midpoint.
  return transforms.translate(
    [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2,
    ],
    transforms.rotateZ(
      Math.atan2(dy, dx),
      transforms.rotateY(Math.atan2(horizontal, dz), cord)
    )
  );
}

export function build(p = {}) {
  const q = resolve(p);
  const wall = 10;
  const bottomThickness = 12;
  const overlap = 5;
  const topRadius = q.diameter / 2;
  const bottomFractions = {
    pot: 0.75,
    hanging: 0.65,
  };
  const bottomRadius = topRadius * bottomFractions[q.variant];
  const slope = (topRadius - bottomRadius) / q.height;

  const cavityBottom = bottomThickness;
  const cavityTop = q.height + overlap;
  const innerBottomRadius = bottomRadius + slope * cavityBottom - wall;
  const innerTopRadius = bottomRadius + slope * cavityTop - wall;

  if (
    innerBottomRadius <= 0 ||
    innerTopRadius <= 0 ||
    cavityBottom >= q.height
  ) {
    throw new Error(
      `A pot ${q.diameter} mm in diameter and ${q.height} mm high cannot fit ${wall} mm radial walls and a ${bottomThickness} mm bottom.`
    );
  }

  const outside = primitives.cylinderElliptic({
    height: q.height,
    startRadius: [bottomRadius, bottomRadius],
    endRadius: [topRadius, topRadius],
    center: [0, 0, q.height / 2],
    segments: 32,
  });

  // Extending the cavity above the opening avoids a closing top face.
  const cavity = primitives.cylinderElliptic({
    height: cavityTop - cavityBottom,
    startRadius: [innerBottomRadius, innerBottomRadius],
    endRadius: [innerTopRadius, innerTopRadius],
    center: [0, 0, (cavityBottom + cavityTop) / 2],
    segments: 32,
  });

  const pot = booleans.subtract(outside, cavity);
  if (q.variant !== 'hanging') {
    return { pot };
  }

  const cordLength = 500;
  const cordRadius = 2;
  const junctionRadius = 5;
  const attachmentZ = q.height - overlap;
  const attachmentRadius =
    bottomRadius + slope * attachmentZ - wall / 2;

  if (attachmentRadius >= cordLength) {
    throw new Error(
      `The ${attachmentRadius} mm attachment radius must be smaller than the ${cordLength} mm cord length.`
    );
  }

  const rise = Math.sqrt(
    cordLength * cordLength - attachmentRadius * attachmentRadius
  );
  const junction = [0, 0, attachmentZ + rise];
  const pieces = [
    pot,
    primitives.sphere({
      radius: junctionRadius,
      center: junction,
      segments: 16,
    }),
  ];

  for (let i = 0; i < 3; i += 1) {
    const angle = Math.PI / 2 + i * 2 * Math.PI / 3;
    const attachment = [
      attachmentRadius * Math.cos(angle),
      attachmentRadius * Math.sin(angle),
      attachmentZ,
    ];
    pieces.push(cordBetween(attachment, junction, cordRadius));
  }

  // Pot bounds dominate x and y; the suspension junction is the model top.
  return {
    pot: booleans.union(...pieces),
  };
}