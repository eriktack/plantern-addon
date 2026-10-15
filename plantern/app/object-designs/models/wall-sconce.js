import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width, height and projection are the complete model dimensions, including the wall plate (predictable sizing).
// ASSUMED: The wall plate spans the full height, is 8 mm thick and has width min(80 mm, 40% of width) (compact mounting plate).
// ASSUMED: Up/down heads use the full height; single heads use 70% and swing-arm heads 55% (distinct fixture proportions).
// ASSUMED: The head is always round: a drum (up/down) or a cone whose top is 60% of the bottom diameter (single, swing-arm), as wide as the width. Projection never changes the shape of the head, only the length of the arm between the wall plate and the head.
// ASSUMED: Projection is the distance from the wall to the front of the head. The arm is projection minus the 8 mm plate minus the head diameter; a projection smaller than that is raised to it (the head sits against the plate), and a swing arm keeps at least 80 mm of arm (room to fold).
// ASSUMED: Shades have 4 mm radial walls and open top and bottom edges (hollow solid geometry).
// ASSUMED: Arms attach at 55% of the head height (balanced support).
// ASSUMED: The head is centred vertically on the wall plate (the plate spans the full height).
// ASSUMED: The default material is white paint.
// ASSUMED: Fixed brackets are 16 mm wide and 10 mm high, entering the head and plate by 5 mm (connected mounting).
// ASSUMED: Swing joints have 8 mm radius and 16 mm height; links are 10 mm wide and high, entering joints axially by 5 mm (articulated appearance).
// ASSUMED: The swing elbow sits halfway between the end joints and offsets towards +x by min(20% of width, 30% of the joint separation) (compact deployed pose).
// ASSUMED: Internal support bars are 10 mm wide and high, extending 5 mm behind the head centre and 5 mm into its rear wall (connected source support).
// ASSUMED: Source spheres have 5 mm radius and support stems 3 mm radius; stems extend 5 mm beyond their endpoint centres (simplified lamp fitting).
// ASSUMED: Light-source centres are clamped to 10 mm inside the head's bottom and top (source clearance from open ends).
// ASSUMED: lightHeight has a 0–400 mm input range and 1 mm step; 0 selects the head centre (covers every fixture height).
// ASSUMED: Main round parts use 32 segments; small joints, stems and source spheres use 16 (appropriate resolution).
// ASSUMED: Hinges, fasteners and wiring are omitted (geometry-only representation).
// UNSURE: Up/down lighting uses one source at the drum centre because only one light point is requested.
// UNSURE: The swing-arm pose is unspecified; a two-link horizontal arm is shown deployed towards the front.
// UNSURE: Glazing and electrical internals are unspecified; open hollow heads and a small source sphere are used.
// UNSURE: Variant defaults apply only to omitted parameters; explicitly supplied values always win.
// UNSURE: No external instruction file is accessed; lightHeight and lightPoint follow the requirements supplied in this task.

export const meta = {
  id: 'wall-sconce',
  name: 'Wall sconce',
  summary: 'A wall-mounted light with up/down, single-shade and swing-arm variants.',
  description:
    'A wall sconce with a hollow head, mounting plate and supported light source, facing -y with its back at +y. Assumed: width, height and projection are complete model dimensions; wall plate spans the full height, is 8 mm thick and min(80 mm, 40% of width) wide; up/down heads use full height, single heads 70% and swing-arm heads 55%; the head is round and as wide as the width (an up/down drum, or a cone with a top 60% of the bottom diameter), so projection only sets the arm: projection is the distance from the wall to the head front, the arm is projection minus the 8 mm plate minus the head diameter, a smaller projection is raised to the plate plus head, and a swing arm keeps at least 80 mm of arm; shade walls 4 mm radially with open ends; arm attachment at 55% of head height; the head is centred vertically on the plate; default material white paint; fixed brackets 16 mm wide and 10 mm high with 5 mm head/plate penetration; swing joints radius 8 mm and height 16 mm, links 10 mm wide and high with 5 mm axial joint overlap; elbow halfway between end joints with +x offset min(20% of width, 30% of joint separation); internal bars 10 mm wide and high, extending 5 mm behind the head centre and 5 mm into its rear wall; source sphere radius 5 mm and stem radius 3 mm, with stems extending 5 mm beyond endpoint centres; source centres clamped between 10 mm above the head bottom and 10 mm below its top; lightHeight input range 0–400 mm in 1 mm steps, with 0 selecting the head centre; main round parts use 32 segments and small joints, stems and sources 16; hinges, fasteners and wiring omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['up_down', 'single', 'swing_arm'],
      labels: {
        up_down: 'Up and down',
        single: 'Single shade',
        swing_arm: 'Swing arm',
      },
      default: 'up_down',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 200,
      min: 100,
      max: 300,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 250,
      min: 100,
      max: 400,
      step: 10,
    },
    {
      key: 'projection',
      label: 'Projection',
      unit: 'mm',
      default: 230,
      min: 50,
      max: 400,
      step: 10,
      hint: 'Distance from the wall to the front of the shade. Only the arm gets longer: it is at least the plate (8 mm) plus the shade width, and a swing arm has at least 80 mm of arm.',
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'white-paint',
    },
    {
      key: 'lightHeight',
      label: 'Light source height',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 400,
      step: 1,
      hint: 'Height above the model bottom. 0 uses the head centre; other values are clamped inside the lamp head.',
    },
  ],
  parts: [
    { key: 'mount', label: 'Wall plate and arm' },
    { key: 'shade', label: 'Shade' },
  ],
  variantDefaults: {
    swing_arm: { projection: 350 },
  },
  placement: { mount: 'wall', z: 1600 },
};

const PLATE = 8;

function resolve(p = {}) {
  const variant = p.variant ?? 'up_down';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown wall-sconce variant; choose up_down, single or swing_arm.'
    );
  }

  const defaults = meta.variantDefaults[variant] ?? {};
  const q = { variant };

  // Material is deliberately never read or copied.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material' || key === 'lightHeight') {
      continue;
    }

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

  const headHeightFraction = {
    up_down: 1,
    single: 0.7,
    swing_arm: 0.55,
  };
  q.headHeight = headHeightFraction[variant] * q.height;

  // The head is round and as wide as the width. Projection only changes the arm between the plate and the head.
  q.headDiameter = q.width;
  q.radiusBottom = q.width / 2;
  q.radiusTop = q.radiusBottom * (variant === 'up_down' ? 1 : 0.6);

  const minimumArm = variant === 'swing_arm' ? 80 : 0;
  q.projection = Math.max(q.projection, PLATE + q.headDiameter + minimumArm);

  q.wallY = q.projection / 2;
  q.plateFront = q.wallY - PLATE;
  q.headY = -q.projection / 2 + q.headDiameter / 2;
  q.headBottom = (q.height - q.headHeight) / 2;   // the head is centred on the plate
  q.armZ = q.headBottom + 0.55 * q.headHeight;

  const requestedHeight = p.lightHeight ?? 0;
  if (!Number.isFinite(requestedHeight)) {
    throw new Error('Light source height must be a finite value in mm; use 0 mm for automatic placement.');
  }

  const naturalHeight = q.headBottom + q.headHeight / 2;
  const selectedHeight = requestedHeight === 0
    ? naturalHeight
    : requestedHeight;

  // Every finite input is kept inside the lamp head rather than rejected.
  q.sourceZ = Math.max(q.headBottom + 10, Math.min(q.headBottom + q.headHeight - 10, selectedHeight));

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

function headRearAt(q, z) {
  const fraction = (z - q.headBottom) / q.headHeight;
  return q.headY + q.radiusBottom + fraction * (q.radiusTop - q.radiusBottom);
}

function resolvedLightPoint(q) {
  return [0, q.headY, q.sourceZ];
}

export function lightPoint(p = {}) {
  return resolvedLightPoint(resolve(p));
}

export function build(p = {}) {
  const q = resolve(p);
  const mount = [];
  const plateWidth = Math.min(80, 0.4 * q.width);

  mount.push(
    box(
      -plateWidth / 2,
      plateWidth / 2,
      q.plateFront,
      q.wallY,
      0,
      q.height
    )
  );

  const outer = primitives.cylinderElliptic({
    height: q.headHeight,
    startRadius: [q.radiusBottom, q.radiusBottom],
    endRadius: [q.radiusTop, q.radiusTop],
    center: [0, q.headY, q.headBottom + q.headHeight / 2],
    segments: 32,
  });
  const inner = primitives.cylinderElliptic({
    height: q.headHeight,
    startRadius: [q.radiusBottom - 4, q.radiusBottom - 4],
    endRadius: [q.radiusTop - 4, q.radiusTop - 4],
    center: [0, q.headY, q.headBottom + q.headHeight / 2],
    segments: 32,
  });
  const shade = booleans.subtract(outer, inner);
  const headRear = headRearAt(q, q.armZ);

  if (q.variant === 'swing_arm') {
    const jointRadius = 8;

    // End joints enter the plate and rear shade wall by 5 mm.
    const wallJoint = [0, q.plateFront - 3];
    const headJoint = [0, headRear + 3];
    const separation = wallJoint[1] - headJoint[1];
    const elbow = [
      Math.min(0.2 * q.width, 0.3 * separation),
      (wallJoint[1] + headJoint[1]) / 2,
    ];
    const joints = [wallJoint, elbow, headJoint];

    for (const [x, y] of joints) {
      mount.push(
        primitives.cylinder({
          radius: jointRadius,
          height: 16,
          center: [x, y, q.armZ],
          segments: 16,
        })
      );
    }

    for (let i = 0; i < joints.length - 1; i += 1) {
      const a = joints[i];
      const b = joints[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const distance = Math.hypot(dx, dy);
      const length = distance - 2 * (jointRadius - 5);

      if (length <= 0) {
        // Coincident or closely folded pivots already overlap.
        continue;
      }

      const link = primitives.cuboid({
        size: [length, 10, 10],
        center: [0, 0, 0],
      });

      mount.push(
        transforms.translate(
          [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, q.armZ],
          transforms.rotateZ(Math.atan2(dy, dx), link)
        )
      );
    }
  } else {
    mount.push(
      box(
        -8, 8,
        headRear - 5,
        q.plateFront + 5,
        q.armZ - 5,
        q.armZ + 5
      )
    );
  }

  // Internal bridge joins the rear shell to the central source support.
  mount.push(
    box(
      -5, 5,
      q.headY - 5,
      headRear + 5,
      q.armZ - 5,
      q.armZ + 5
    )
  );

  const point = resolvedLightPoint(q);
  const stemBottom = Math.min(q.armZ, point[2]) - 5;
  const stemTop = Math.max(q.armZ, point[2]) + 5;

  mount.push(
    primitives.cylinder({
      radius: 3,
      height: stemTop - stemBottom,
      center: [point[0], point[1], (stemBottom + stemTop) / 2],
      segments: 16,
    }),
    primitives.sphere({
      radius: 5,
      center: point,
      segments: 16,
    })
  );

  return {
    mount: combine(mount),
    shade,
  };
}