import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// The variant is the form of the lamp (classic, sill, candlestick, orb, adjustable desk lamp); the shade shape is a
// separate choice (drum, cone, empire, globe). A drum or a cone is not a different lamp, only a different shade.
//
// ASSUMED: Height is the complete local model height; placement elevation is external (stands on a table or a sill).
// ASSUMED: Shade heights are 36% (drum, empire), 40% (cone) and 28% (any shade on the desk lamp) of height (balanced proportions).
// ASSUMED: Shade profiles (radius fraction of the bottom radius, bottom to top): drum 1 to 1, cone 1 to 0.4, empire 1 to 0.7 (distinct silhouettes).
// ASSUMED: A globe shade is a ball as high as shadeDiameter, at most 60% of the height, with open necks of 40% of its radius; the profile fractions are 0.4, 0.72, 0.9, 0.98, 1 and back (faceted globe).
// ASSUMED: The orb variant always has a globe shade, a pole base; shadeShape and baseShape do not apply to it.
// ASSUMED: Shades are open-ended shells with 5 mm radial wall thickness, at most half the smallest profile radius (visible solid shade construction).
// ASSUMED: Shade bands overlap vertically by 5 mm (connected profile construction).
// ASSUMED: The circular foot radius is min(32% of shadeDiameter, 18% of height), and its thickness is 15 mm (stable footprint).
// ASSUMED: Base bodies start at z = 10 mm, overlapping the foot by 5 mm (connected construction).
// ASSUMED: Target body tops are at 44% of height, or 18% for the desk variant (room for stem or arm).
// ASSUMED: A pole is one straight 14 mm thick rod (the stem radius, 7 mm) from the foot up, whatever the size of the lamp (slender pole).
// ASSUMED: Ceramic bodies have bottom, shoulder and neck radii 55%, 80% and 28% of foot radius; the shoulder is 60% up the body (vase-like profile).
// ASSUMED: Baluster bodies are four turned sections with radii 45%, 70%, 25%, 40% and 22% of foot radius at 0, 25, 50, 75 and 100% of the body (candlestick profile).
// ASSUMED: Profile sections overlap vertically by 5 mm (connected sections).
// ASSUMED: Sphere-body radius is min(80% of foot radius, half the available body height), with its bottom at z = 10 mm (ball fits above the foot).
// ASSUMED: Stems have 7 mm radius; sockets have 12 mm radius and 20 mm height (simplified lamp hardware).
// ASSUMED: The source is a 10 mm radius sphere connected to its socket with 5 mm axial overlap (visible light-source location).
// ASSUMED: lightHeight is measured from the model bottom; 0 (the default) means the shade's vertical centre and other values are kept 30 mm above the shade bottom and 10 mm below its top (source inside the shade).
// ASSUMED: Shade support crosses are 8 mm wide and 10 mm thick, centred 15 mm above the shade bottom and clipped to its outer profile (connected shade support).
// ASSUMED: Desk armLength is the forward horizontal reach, not the combined link lengths (deterministic articulated pose).
// ASSUMED: The desk lower pivot is 20 mm above the base body; its elbow is at 45% of reach and 65% of total height (raised adjustable-arm silhouette).
// ASSUMED: Desk arm tubes have 6 mm radius and joint spheres have 10 mm radius; tubes enter joints axially by 5 mm (connected arm assembly).
// ASSUMED: Desk reach extends towards -y; the complete footprint is recentered on y = 0 (front-facing task light).
// ASSUMED: The sill variant is the classic form made smaller (280 mm high, 170 mm shade) so it fits a window sill; the orb is 300 mm high.
// ASSUMED: Main round parts use 32 segments and small stems, sockets, sources and arm joints use 16 (appropriate resolution).
// UNSURE: The adjustable arm's pose and length interpretation are unspecified; armLength is treated as forward reach.
// UNSURE: The bedside lamp is no longer a variant: it is the classic form with an empire shade (height 450, shade 250 is a good start).
// UNSURE: Upholstery-like shade details, electrical wiring and adjustment mechanisms are omitted because only solid geometry is requested.
// UNSURE: Variant defaults apply to omitted values only; supplied values always win.

const STEM_RADIUS = 7;
const FORMS = ['classic', 'sill', 'candlestick', 'orb', 'desk_arm'];

export const meta = {
  id: 'table-lamp',
  name: 'Table lamp',
  summary: 'A table lamp: classic, small sill lamp, candlestick, glass orb or adjustable desk lamp, with a choice of shade shape.',
  description:
    'A table-standing lamp with a shaped base, a hollow shade and an optional articulated desk arm. The variant is the form of the lamp; the shade shape (drum, cone, empire, globe) is chosen separately. Assumed: height is the complete local height and placement elevation is external; shade heights 36% (drum, empire), 40% (cone) and 28% (desk lamp) of height; radius profiles drum 1 to 1, cone 1 to 0.4, empire 1 to 0.7; a globe is a ball at most 60% of the height with 40% open necks; the orb variant always has a globe shade and a pole; shades are open-ended with 5 mm radial walls and 5 mm band overlap; foot radius min(32% of shadeDiameter, 18% of height) and thickness 15 mm; bodies start at z = 10 mm with 5 mm foot overlap; target body tops at 44% of height or 18% for desk lamps; a pole is a straight rod 7 mm in radius; ceramic bottom/shoulder/neck radii 55/80/28% of foot radius with shoulder 60% up the body; baluster radii 45/70/25/40/22% of foot radius at 0/25/50/75/100% of the body; sphere radius min(80% of foot radius, half available body height), bottom at z = 10 mm; stem radius 7 mm; socket radius 12 mm and height 20 mm; source sphere radius 10 mm with 5 mm axial socket overlap; lightHeight measured from the bottom, 0 meaning the shade centre and other values kept inside the shade; support crosses 8 mm wide and 10 mm thick, centred 15 mm above shade bottom and clipped to the outer profile; desk armLength means forward horizontal reach, with lower pivot 20 mm above the body and elbow at 45% of reach and 65% of height; arm tube radius 6 mm, joint radius 10 mm and axial tube-to-joint overlap 5 mm; desk reach extends towards -y and the complete footprint is recentered; the sill variant is a small classic lamp (280 mm high, 170 mm shade); main round parts use 32 segments and small parts 16; wiring and adjustment mechanisms omitted.',
  params: [
    {
      key: 'variant',
      label: 'Form',
      type: 'enum',
      options: FORMS,
      labels: {
        classic: 'Classic table lamp',
        sill: 'Small sill lamp',
        candlestick: 'Candlestick lamp',
        orb: 'Glass orb lamp',
        desk_arm: 'Adjustable desk lamp',
      },
      default: 'classic',
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 450,
      min: 250,
      max: 600,
      step: 10,
    },
    {
      key: 'shadeDiameter',
      label: 'Shade diameter',
      unit: 'mm',
      default: 300,
      min: 150,
      max: 450,
      step: 10,
    },
    {
      key: 'shadeShape',
      label: 'Shade shape',
      type: 'enum',
      options: ['drum', 'cone', 'empire', 'globe'],
      labels: {
        drum: 'Drum (straight)',
        cone: 'Cone (narrow top)',
        empire: 'Empire (slightly tapered)',
        globe: 'Globe',
      },
      default: 'drum',
      appliesTo: ['classic', 'sill', 'candlestick', 'desk_arm'],
    },
    {
      key: 'baseShape',
      label: 'Base shape',
      type: 'enum',
      options: ['ceramic', 'pole', 'sphere', 'baluster'],
      labels: {
        ceramic: 'Ceramic vase',
        pole: 'Pole',
        sphere: 'Ball',
        baluster: 'Turned baluster',
      },
      default: 'ceramic',
      appliesTo: ['classic', 'sill', 'candlestick', 'desk_arm'],
    },
    {
      key: 'armLength',
      label: 'Arm length',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 800,
      step: 10,
      appliesTo: ['desk_arm'],
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'ceramic',
    },
    {
      key: 'lightHeight',
      label: 'Light source height',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 600,
      step: 1,
      hint: 'Height of the light above the bottom of the lamp. 0 = the middle of the shade; other values are kept inside the shade.',
    },
  ],
  parts: [
    { key: 'base', label: 'Base and stem' },
    { key: 'shade', label: 'Shade' },
  ],
  variantDefaults: {
    sill: { height: 280, shadeDiameter: 170 },
    candlestick: { height: 520, shadeDiameter: 200, shadeShape: 'empire', baseShape: 'baluster' },
    orb: { height: 300, shadeDiameter: 180 },
    desk_arm: {
      armLength: 500,
      height: 400,
      shadeDiameter: 200,
      shadeShape: 'cone',
      baseShape: 'pole',
    },
  },
  sizeParams: { x: { default: 'shadeDiameter', orb: null }, y: { default: 'shadeDiameter', orb: null, desk_arm: null }, z: 'height' },

  placement: { mount: 'floor', z: 720, hosts: ['room', 'sill'] },
};

const PROFILES = {
  drum: [[0, 1], [1, 1]],
  cone: [[0, 1], [1, 0.4]],
  empire: [[0, 1], [1, 0.7]],
  globe: [
    [0, 0.4],
    [0.125, 0.72],
    [0.25, 0.9],
    [0.375, 0.98],
    [0.5, 1],
    [0.625, 0.98],
    [0.75, 0.9],
    [0.875, 0.72],
    [1, 0.4],
  ],
};

const SHADE_HEIGHT = { drum: 0.36, cone: 0.4, empire: 0.36 };

function shadeShapeOf(q) {
  return q.variant === 'orb' ? 'globe' : q.shadeShape;
}

function shadeDimensions(q) {
  const shape = shadeShapeOf(q);
  let shadeHeight;
  let radius = q.shadeDiameter / 2;
  if (shape === 'globe') {
    shadeHeight = Math.min(q.shadeDiameter, 0.6 * q.height);
    radius = shadeHeight / 2;
  } else {
    shadeHeight = q.height * (q.variant === 'desk_arm' ? 0.28 : SHADE_HEIGHT[shape]);
  }
  return {
    profile: PROFILES[shape],
    bottom: q.height - shadeHeight,
    top: q.height,
    radius,
  };
}

function resolve(p) {
  const variant = p.variant ?? 'classic';
  if (!FORMS.includes(variant)) {
    throw new Error(`Unknown table-lamp form; choose ${FORMS.join(', ')}.`);
  }

  const defaults = meta.variantDefaults[variant] ?? {};
  const q = { variant };

  // Material and light height are handled below; options hidden for this variant are never read.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material' || key === 'lightHeight') {
      continue;
    }
    if (definition.appliesTo && !definition.appliesTo.includes(variant)) {
      continue;
    }

    const value = p[key] ?? defaults[key] ?? definition.default;
    q[key] = value;

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
  }

  if (variant === 'orb') q.baseShape = 'pole';

  // 0 means the middle of the shade; any other value is kept above the support and inside the shade.
  const dimensions = shadeDimensions(q);
  const minimumSourceHeight = dimensions.bottom + 30;
  const maximumSourceHeight = dimensions.top - 10;
  const wanted = p.lightHeight > 0 ? p.lightHeight : (dimensions.bottom + dimensions.top) / 2;
  q.lightHeight = Math.max(minimumSourceHeight, Math.min(maximumSourceHeight, wanted));

  return q;
}

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function cylinder(radius, bottom, top, y = 0, segments = 32) {
  return primitives.cylinder({
    radius,
    height: top - bottom,
    center: [0, y, (bottom + top) / 2],
    segments,
  });
}

function taper(bottomRadius, topRadius, bottom, top) {
  return primitives.cylinderElliptic({
    height: top - bottom,
    startRadius: [bottomRadius, bottomRadius],
    endRadius: [topRadius, topRadius],
    center: [0, 0, (bottom + top) / 2],
    segments: 32,
  });
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

// The shade as stacked conical bands (5 mm overlap): its outer solid, and the hollow shell.
function shadeSolids({ profile, bottom, top, radius }) {
  const height = top - bottom;
  const minimumRatio = Math.min(...profile.map((ring) => ring[1]));
  const wall = Math.min(5, radius * minimumRatio / 2);
  const outer = [];
  const shell = [];

  for (let i = 0; i < profile.length - 1; i += 1) {
    const [fa, ra] = profile[i];
    const [fb, rb] = profile[i + 1];
    const z0 = Math.max(bottom, bottom + fa * height - 2.5);
    const z1 = Math.min(top, bottom + fb * height + 2.5);
    const solid = taper(radius * ra, radius * rb, z0, z1);
    outer.push(solid);
    shell.push(
      booleans.subtract(solid, taper(radius * ra - wall, radius * rb - wall, z0, z1))
    );
  }

  return { outer: combine(outer), shell: combine(shell) };
}

// Where the lamp head and the whole footprint sit along y (the desk lamp reaches towards -y and is recentred).
function layout(q) {
  const desk = q.variant === 'desk_arm';
  const { radius } = shadeDimensions(q);
  const footRadius = Math.min(0.32 * q.shadeDiameter, 0.18 * q.height);
  const headY = desk ? -q.armLength : 0;
  const minimumY = Math.min(-footRadius, headY - radius);
  const maximumY = Math.max(footRadius, headY + radius);
  return { desk, footRadius, headY, shiftY: -(minimumY + maximumY) / 2 };
}

export function build(p = {}) {
  const q = resolve(p);
  const { desk, footRadius, headY, shiftY } = layout(q);
  const dimensions = shadeDimensions(q);
  const { bottom, radius } = dimensions;

  const targetBodyTop = (desk ? 0.18 : 0.44) * q.height;
  const baseParts = [cylinder(footRadius, 0, 15)];
  let bodyTop = targetBodyTop;

  if (q.baseShape === 'pole') {
    baseParts.push(cylinder(STEM_RADIUS, 10, bodyTop, 0, 16));
  } else if (q.baseShape === 'sphere') {
    const ball = Math.min(0.8 * footRadius, (targetBodyTop - 10) / 2);
    bodyTop = 10 + 2 * ball;
    baseParts.push(
      primitives.sphere({
        radius: ball,
        center: [0, 0, 10 + ball],
        segments: 32,
      })
    );
  } else if (q.baseShape === 'baluster') {
    const radii = [0.45, 0.7, 0.25, 0.4, 0.22];
    const step = (bodyTop - 10) / 4;
    for (let i = 0; i < 4; i += 1) {
      const z0 = 10 + i * step - (i > 0 ? 5 : 0);
      baseParts.push(
        taper(radii[i] * footRadius, radii[i + 1] * footRadius, z0, 10 + (i + 1) * step)
      );
    }
  } else {
    const shoulder = 10 + 0.6 * (bodyTop - 10);
    baseParts.push(
      taper(0.55 * footRadius, 0.8 * footRadius, 10, shoulder),
      taper(0.8 * footRadius, 0.28 * footRadius, shoulder - 5, bodyTop)
    );
  }

  const supportZ = bottom + 15;
  const { outer, shell } = shadeSolids(dimensions);

  // Subtraction-only intersection clips the support bars to the shade profile.
  const cross = booleans.union(
    box(-radius, radius, -4, 4, supportZ - 5, supportZ + 5),
    box(-4, 4, -radius, radius, supportZ - 5, supportZ + 5)
  );
  const clippedCross = booleans.subtract(cross, booleans.subtract(cross, outer));
  baseParts.push(transforms.translate([0, headY, 0], clippedCross));

  if (desk) {
    const lowerPivot = [0, bodyTop + 20];
    const elbow = [-0.45 * q.armLength, 0.65 * q.height];
    const upperPivot = [headY, supportZ];

    baseParts.push(cylinder(STEM_RADIUS, bodyTop - 5, lowerPivot[1] + 5, 0, 16));

    const armLink = (a, b) => {
      const dy = b[0] - a[0];
      const dz = b[1] - a[1];
      const length = Math.sqrt(dy * dy + dz * dz);

      if (length <= 10) {
        throw new Error(
          `An arm segment of ${length} mm cannot fit its 10 mm radius joints with 5 mm overlap.`
        );
      }

      const link = primitives.cylinder({
        radius: 6,
        height: length - 10,
        center: [0, 0, 0],
        segments: 16,
      });

      return transforms.translate(
        [0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        transforms.rotateX(Math.atan2(-dy, dz), link)
      );
    };

    baseParts.push(armLink(lowerPivot, elbow), armLink(elbow, upperPivot));

    for (const [y, z] of [lowerPivot, elbow, upperPivot]) {
      baseParts.push(
        primitives.sphere({
          radius: 10,
          center: [0, y, z],
          segments: 16,
        })
      );
    }

    baseParts.push(cylinder(STEM_RADIUS, supportZ - 5, q.lightHeight - 5, headY, 16));
  } else {
    baseParts.push(cylinder(STEM_RADIUS, bodyTop - 5, q.lightHeight - 5, 0, 16));
  }

  baseParts.push(
    cylinder(12, q.lightHeight - 25, q.lightHeight - 5, headY, 16),
    primitives.sphere({
      radius: 10,
      center: [0, headY, q.lightHeight],
      segments: 16,
    })
  );

  return {
    base: transforms.translate([0, shiftY, 0], combine(baseParts)),
    shade: transforms.translate([0, headY + shiftY, 0], shell),
  };
}

/** Where the fixture sits, [x, y, z] in mm (AGENT_INSTRUCTIONS §3.3): at the lamp head, at the light source height. */
export function lightPoint(p = {}) {
  const q = resolve(p);
  const { headY, shiftY } = layout(q);
  return [0, headY + shiftY, q.lightHeight];
}
