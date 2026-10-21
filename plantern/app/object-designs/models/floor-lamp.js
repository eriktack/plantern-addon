import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// The variant is the form of the lamp; the shade shape (drum, cone, empire) is a separate choice, as on the table lamp.
//
// ASSUMED: height is the complete local model height (consistent overall sizing).
// ASSUMED: Standard and tripod shades are 18% of height; arc shades 14%; torchiere bowls 10% (variant proportions).
// ASSUMED: Shade profiles (top radius as a fraction of the bottom radius): drum 1, cone 0.4, empire 0.7; the torchiere bowl is a fixed upward-flaring cone whose bottom radius is 25% of its top radius (distinct profiles).
// ASSUMED: Shade walls are 5 mm thick radially and open at both ends (hollow solid construction).
// ASSUMED: Circular weighted bases are 35 mm thick (stable floor contact).
// ASSUMED: Standard and torchiere columns have 12 mm radius and enter their bases by 5 mm (connected upright support).
// ASSUMED: Arc reach runs towards -y from the mast to the shade centre; the complete footprint is recentered (front-facing overhang).
// ASSUMED: The arc is a mast reaching 65% of height and then three straight links along a quarter ellipse (4 joints) that ends 12 mm below height; few, coarse parts keep it cheap to render (rounded apex defines overall height).
// ASSUMED: Arc tubes have 10 mm radius, masts and joint spheres 12 mm radius, and tubes enter joint spheres axially by 5 mm (connected curved stand).
// ASSUMED: Arc shade tops are 100 mm below overall height, suspended by an 8 mm radius hanger (clearance below the curved support).
// ASSUMED: Tripod baseDiameter describes the circumscribed foot footprint; three spherical feet have 18 mm radius (splayed tripod stance).
// ASSUMED: Tripod legs have 14 mm radius and meet an 18 mm radius hub at 65% of height; the upper stem has 10 mm radius (tripod proportions).
// ASSUMED: Tripod legs and stem enter spherical joints axially by 5 mm (connected joints).
// ASSUMED: Source spheres have 12 mm radius; sockets have 14 mm radius and 25 mm height (simplified bulb and fitting).
// ASSUMED: Sockets overlap source spheres and support stems by 5 mm axially (connected lamp hardware).
// ASSUMED: Shade support crosses are 8 mm wide and 10 mm thick, centred 15 mm from the supported shade end and clipped to the outer shade profile (attached shade).
// ASSUMED: lightHeight is measured from z = 0; 0 (the default) means the shade's vertical centre, and other values are kept at least 40 mm from either shade end (room for source and socket).
// ASSUMED: Main round parts use 32 segments; tubes, sockets and stems use 16 and joint and source spheres 12 (appropriate resolution, low triangle count).
// ASSUMED: Wiring, switches and internal electrical components are omitted (geometry-only representation).
// ASSUMED: A multi-shade lamp is one weighted base with `shades` (2 to 5) separate 24 mm stems, each with its own shade, standing on a circle round the middle of the base; the first stem is the tallest (the full height) and each next one is 14% of the height lower. Its shades are 12% of the height tall, do not overlap, and the base is at least as wide as the stems' circle. The footprint is recentred on x and y.
// ASSUMED: A multi-shade lamp has one light: lightHeight 0 is the middle of the shade heights, and `lightPoint` is the middle of the footprint.
// UNSURE: Arc reach and curve shape are unspecified; reach is interpreted as horizontal mast-to-shade distance.
// UNSURE: Torchiere bowl geometry is unspecified; an open upward-flaring cone is used.
// UNSURE: The tripod footprint is not circular; baseDiameter is its circumscribed diameter, not its bounding-box width.
// UNSURE: Variant defaults apply only to omitted parameters because supplied-value provenance is unavailable.

const FORMS = ['arc', 'torchiere', 'tripod', 'standard', 'multi'];
const SHADE_TOP = { drum: 1, cone: 0.4, empire: 0.7 };
const SHADE_HEIGHT = { arc: 0.14, torchiere: 0.1, tripod: 0.18, standard: 0.18, multi: 0.12 };
const MULTI_STEP = 0.14;   // each further stem of a multi-shade lamp is this share of the height lower

export const meta = {
  id: 'floor-lamp',
  name: 'Floor lamp',
  summary: 'A floor lamp: arc, torchiere, tripod, standard or multi-shade, with a choice of shade shape.',
  description:
    'A freestanding lamp with a hollow shade (or, for the multi-shade form, two to five stems on one base, each with its own shade at its own height), a supported light source and a stand that depends on the variant. The variant is the form of the lamp; the shade shape (drum, cone, empire) is chosen separately, except for the torchiere bowl. Assumed: height is the complete local height; a multi-shade lamp has 24 mm stems on a circle round the middle of one base, the tallest the full height and each next one 14% lower, 12%-tall shades that do not overlap, and one light in the middle; standard/tripod shade heights are 18% of height, arc shade height 14% and torchiere bowl height 10%; shade top radius is 100% (drum), 40% (cone) or 70% (empire) of the bottom radius, and the torchiere bowl bottom radius is 25% of its top radius; shade walls 5 mm thick radially with open ends; weighted bases 35 mm thick; standard/torchiere columns 12 mm radius with 5 mm base overlap; arc reach extends towards -y and the complete footprint is recentered; the arc is a mast to 65% of height followed by three straight links along a quarter ellipse ending 12 mm below height; arc tube radius 10 mm, mast and joint radii 12 mm, with 5 mm axial tube-to-joint overlap; arc shade top 100 mm below height with 8 mm radius hanger; tripod baseDiameter is its circumscribed foot footprint, with three 18 mm radius spherical feet, 14 mm radius legs, an 18 mm radius hub at 65% of height and a 10 mm radius upper stem; tripod links enter spherical joints axially by 5 mm; source radius 12 mm, socket radius 14 mm and height 25 mm, with 5 mm axial source/socket/stem overlaps; shade support crosses 8 mm wide and 10 mm thick, centred 15 mm from the supported end and clipped to the outer profile; lightHeight measured from z = 0, 0 meaning the shade centre and other values kept at least 40 mm from the shade ends; main round parts use 32 segments and tubes, joints, sources and sockets 16; wiring, switches and electrical internals omitted.',
  params: [
    {
      key: 'variant',
      label: 'Form',
      type: 'enum',
      options: FORMS,
      labels: {
        arc: 'Arc lamp',
        torchiere: 'Torchiere (uplighter)',
        tripod: 'Tripod lamp',
        standard: 'Standard lamp',
        multi: 'Multi-shade lamp (several stems)',
      },
      // not the bed's drawing: the option name `standard` is shared with the bed's variant (issue #35)
      icons: { standard: 'opt:standardLamp' },
      default: 'arc',
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 1600,
      min: 1400,
      max: 2000,
      step: 10,
    },
    {
      key: 'shadeDiameter',
      label: 'Shade diameter',
      unit: 'mm',
      default: 400,
      min: 250,
      max: 600,
      step: 10,
    },
    {
      key: 'shadeShape',
      label: 'Shade shape',
      type: 'enum',
      options: ['drum', 'cone', 'empire'],
      labels: {
        drum: 'Drum (straight)',
        cone: 'Cone (narrow top)',
        empire: 'Empire (slightly tapered)',
      },
      default: 'drum',
      appliesTo: ['arc', 'tripod', 'standard', 'multi'],
    },
    {
      key: 'baseDiameter',
      label: 'Base diameter',
      unit: 'mm',
      default: 350,
      min: 200,
      max: 500,
      step: 10,
    },
    {
      key: 'arcReach',
      label: 'Arc reach',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 1800,
      step: 10,
      appliesTo: ['arc'],
    },
    {
      key: 'shades',
      label: 'Shades',
      type: 'integer',
      default: 3,
      min: 2,
      max: 5,
      appliesTo: ['multi'],
      hint: 'How many stems, each with its own shade.',
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'black-metal',
    },
    {
      key: 'lightHeight',
      label: 'Light source height',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 2000,
      step: 1,
      hint: 'Height of the light above the floor. 0 = the middle of the shade; other values are kept inside the shade.',
    },
  ],
  parts: [
    { key: 'stand', label: 'Base and stand' },
    { key: 'shade', label: 'Shade' },
  ],
  variantDefaults: {
    arc: {
      arcReach: 1200,
      height: 1900,
      baseDiameter: 400,
      shadeShape: 'cone',
    },
    torchiere: {
      shadeDiameter: 350,
      height: 1800,
    },
    multi: {
      height: 1600,
      shadeDiameter: 280,
      baseDiameter: 450,
      shadeShape: 'drum',
      shades: 3,
    },
    tripod: {
      baseDiameter: 500,
      height: 1500,
      shadeShape: 'empire',
    },
  },
  sizeParams: { z: 'height' },
  placement: { mount: 'floor', hosts: ['room', 'wall'] },
};

function shadeDimensions(q) {
  const radius = q.shadeDiameter / 2;
  const top = q.variant === 'arc' ? q.height - 100 : q.height;
  const torchiere = q.variant === 'torchiere';

  return {
    bottom: top - SHADE_HEIGHT[q.variant] * q.height,
    top,
    radiusBottom: torchiere ? 0.25 * radius : radius,
    radiusTop: torchiere ? radius : radius * SHADE_TOP[q.shadeShape],
  };
}

function resolve(p) {
  const variant = p.variant ?? 'arc';
  if (!FORMS.includes(variant)) {
    throw new Error(`Unknown floor-lamp form; choose ${FORMS.join(', ')}.`);
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Do not read material or parameters hidden for the chosen variant.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material' || key === 'lightHeight') {
      continue;
    }
    if (definition.appliesTo && !definition.appliesTo.includes(variant)) {
      continue;
    }

    const value = p[key] ?? defaults[key] ?? definition.default;
    if (definition.type === 'enum') {
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
    q[key] = value;
  }

  if (variant === 'multi') {
    const heads = multiHeads(q);
    const lowest = Math.min(...heads.map(h => h.bottom)), highest = Math.max(...heads.map(h => h.top));
    const wanted = p.lightHeight > 0 ? p.lightHeight : (lowest + highest) / 2;
    q.lightHeight = Math.max(lowest + 40, Math.min(highest - 40, wanted));
    return q;
  }

  // 0 means the middle of the shade; any other value is kept inside the shade.
  const head = shadeDimensions(q);
  const wanted = p.lightHeight > 0 ? p.lightHeight : (head.bottom + head.top) / 2;
  q.lightHeight = Math.max(head.bottom + 40, Math.min(head.top - 40, wanted));

  return q;
}

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function upright(radius, bottom, top, y = 0, segments = 32) {
  return primitives.cylinder({
    radius,
    height: top - bottom,
    center: [0, y, (bottom + top) / 2],
    segments,
  });
}

function ball(radius, center, segments = 12) {
  return primitives.sphere({ radius, center, segments });
}

function taper(radiusBottom, radiusTop, bottom, top) {
  return primitives.cylinderElliptic({
    height: top - bottom,
    startRadius: [radiusBottom, radiusBottom],
    endRadius: [radiusTop, radiusTop],
    center: [0, 0, (bottom + top) / 2],
    segments: 32,
  });
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function jointLink(a, b, tubeRadius, jointRadius) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = distance(a, b);
  const inset = jointRadius - 5;
  const tubeLength = length - 2 * inset;

  if (tubeLength <= 0) {
    throw new Error(
      `A ${length} mm support span cannot fit ${jointRadius} mm radius joints with 5 mm axial overlap.`
    );
  }

  const tube = primitives.cylinder({
    radius: tubeRadius,
    height: tubeLength,
    center: [0, 0, 0],
    segments: 16,
  });

  return transforms.translate(
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    transforms.rotateZ(
      Math.atan2(dy, dx),
      transforms.rotateY(Math.atan2(Math.hypot(dx, dy), dz), tube)
    )
  );
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

// Where the lamp head sits along y and how the whole footprint is recentred on y = 0.
function layout(q) {
  const { radiusBottom, radiusTop } = shadeDimensions(q);
  const shadeRadius = Math.max(radiusBottom, radiusTop);
  const baseRadius = q.baseDiameter / 2;
  const headY = q.variant === 'arc' ? -q.arcReach : 0;
  let minimumY;
  let maximumY;

  if (q.variant === 'tripod') {
    const orbit = baseRadius - 18;
    minimumY = Math.min(-orbit / 2 - 18, -radiusBottom);
    maximumY = Math.max(orbit + 18, radiusBottom);
  } else {
    minimumY = Math.min(-baseRadius, headY - shadeRadius);
    maximumY = Math.max(baseRadius, headY + shadeRadius);
  }

  return { headY, shadeRadius, baseRadius, shiftY: -(minimumY + maximumY) / 2 };
}

// The stems of a multi-shade lamp: where each stands (a circle round the middle, the first at the back), how tall it is and its shade.
function multiHeads(q) {
  const n = q.shades, radius = q.shadeDiameter / 2;
  const top = SHADE_TOP[q.shadeShape], rBottom = radius, rTop = radius * top;
  const around = radius / Math.sin(Math.PI / n) * 1.0;                       // shades side by side, just not overlapping
  const orbit = n === 1 ? 0 : Math.max(around, q.baseDiameter / 2 - radius);
  return Array.from({ length: n }, (_, i) => {
    const a = Math.PI / 2 + (2 * Math.PI * i) / n, h = q.height * (1 - MULTI_STEP * i);
    return { x: orbit * Math.cos(a), y: orbit * Math.sin(a), top: h, bottom: h - SHADE_HEIGHT.multi * q.height, rBottom, rTop };
  });
}

// the footprint of a multi-shade lamp (its shades and its base) recentred on x and y
function multiLayout(q) {
  const heads = multiHeads(q), radius = q.shadeDiameter / 2;
  const orbit = Math.hypot(heads[0].x, heads[0].y);
  const baseRadius = Math.max(q.baseDiameter / 2, orbit + 30);
  const xs = [-baseRadius, baseRadius, ...heads.flatMap(h => [h.x - radius, h.x + radius])];
  const ys = [-baseRadius, baseRadius, ...heads.flatMap(h => [h.y - radius, h.y + radius])];
  return { heads, baseRadius, shiftX: -(Math.min(...xs) + Math.max(...xs)) / 2, shiftY: -(Math.min(...ys) + Math.max(...ys)) / 2 };
}

function buildMulti(q) {
  const { heads, baseRadius, shiftX, shiftY } = multiLayout(q);
  const stand = [upright(baseRadius, 0, 35)];
  const shades = [];
  for (const h of heads) {
    const at = z => z;
    const outer = taper(h.rBottom, h.rTop, h.bottom, h.top), inner = taper(h.rBottom - 5, h.rTop - 5, h.bottom, h.top);
    shades.push(transforms.translate([h.x, h.y, 0], booleans.subtract(outer, inner)));
    const lamp = h.bottom + (h.top - h.bottom) / 2;
    // stem up to a socket under the source, a source, and a cross that holds the shade
    stand.push(
      transforms.translate([h.x, h.y, 0], upright(12, 30, lamp - 27, 0, 16)),
      transforms.translate([h.x, h.y, 0], upright(14, lamp - 32, lamp - 7, 0, 16)),
      ball(12, [h.x, h.y, lamp]),
    );
    const cross = booleans.union(box(-h.rBottom, h.rBottom, -4, 4, h.bottom + 10, h.bottom + 20), box(-4, 4, -h.rBottom, h.rBottom, h.bottom + 10, h.bottom + 20));
    stand.push(transforms.translate([h.x, h.y, at(0)], booleans.subtract(cross, booleans.subtract(cross, outer))));
  }
  return {
    stand: transforms.translate([shiftX, shiftY, 0], combine(stand)),
    shade: transforms.translate([shiftX, shiftY, 0], combine(shades)),
  };
}

export function build(p = {}) {
  const q = resolve(p);
  if (q.variant === 'multi') return buildMulti(q);
  const head = shadeDimensions(q);
  const { bottom, top, radiusBottom, radiusTop } = head;
  const { headY, shadeRadius, baseRadius, shiftY } = layout(q);
  const arc = q.variant === 'arc';
  const stand = [];

  const outer = taper(radiusBottom, radiusTop, bottom, top);
  const inner = taper(radiusBottom - 5, radiusTop - 5, bottom, top);
  const shade = transforms.translate(
    [0, headY, 0],
    booleans.subtract(outer, inner)
  );

  const supportZ = arc ? top - 15 : bottom + 15;
  const cross = booleans.union(
    box(-shadeRadius, shadeRadius, -4, 4, supportZ - 5, supportZ + 5),
    box(-4, 4, -shadeRadius, shadeRadius, supportZ - 5, supportZ + 5)
  );

  // Intersection expressed using only permitted subtraction operations.
  const clippedCross = booleans.subtract(
    cross,
    booleans.subtract(cross, outer)
  );
  stand.push(transforms.translate([0, headY, 0], clippedCross));

  if (q.variant === 'tripod') {
    const footRadius = 18;
    const orbit = baseRadius - footRadius;
    const hub = [0, 0, 0.65 * q.height];
    const sideX = Math.sqrt(3) * orbit / 2;
    const feet = [
      [0, orbit, footRadius],
      [-sideX, -orbit / 2, footRadius],
      [sideX, -orbit / 2, footRadius],
    ];

    stand.push(ball(18, hub));

    for (const foot of feet) {
      stand.push(ball(footRadius, foot), jointLink(foot, hub, 14, 18));
    }

    stand.push(upright(10, hub[2] + 18 - 5, q.lightHeight - 27, 0, 16));
  } else {
    stand.push(upright(baseRadius, 0, 35));

    if (arc) {
      // A mast, then three straight links along a quarter ellipse: few parts, cheap to render.
      const mastTop = 0.65 * q.height;
      const apexZ = q.height - 12;
      const points = [0, 1, 2, 3].map((i) => {
        const angle = i * Math.PI / 6;
        return [
          0,
          -q.arcReach * (1 - Math.cos(angle)),
          mastTop + (apexZ - mastTop) * Math.sin(angle),
        ];
      });

      stand.push(upright(12, 30, mastTop - 7, 0, 16));

      points.forEach((point, i) => {
        stand.push(ball(12, point));
        if (i > 0) stand.push(jointLink(points[i - 1], point, 10, 12));
      });

      // The shade hangs from the apex.
      stand.push(upright(8, q.lightHeight + 27, apexZ - 7, headY, 16));
    } else {
      stand.push(upright(12, 30, q.lightHeight - 27, 0, 16));
    }
  }

  // The socket sits under the source on a stem from below, or above it on the hanger of an arc lamp.
  stand.push(
    arc
      ? upright(14, q.lightHeight + 7, q.lightHeight + 32, headY, 16)
      : upright(14, q.lightHeight - 32, q.lightHeight - 7, headY, 16)
  );
  stand.push(ball(12, [0, headY, q.lightHeight]));

  return {
    stand: transforms.translate([0, shiftY, 0], combine(stand)),
    shade: transforms.translate([0, shiftY, 0], shade),
  };
}

/** Where the fixture sits, [x, y, z] in mm (AGENT_INSTRUCTIONS §3.3): at the lamp head, at the light source height. */
export function lightPoint(p = {}) {
  const q = resolve(p);
  if (q.variant === 'multi') return [0, 0, q.lightHeight];
  const { headY, shiftY } = layout(q);
  return [0, headY + shiftY, q.lightHeight];
}
