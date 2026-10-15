import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Overall height is height + dropLength, with the ceiling at that upper bound (specified hanging convention).
// ASSUMED: lightHeight is measured from the model bottom; 0 (the default) means the centre of the lamp heads, other values are kept inside the head (source placement).
// ASSUMED: The bare-lamp envelope of a bare_bulb shade is returned in the shade part, so the part is never empty.
// ASSUMED: Canopies are at most 100 mm in diameter and 20 mm high, limited to 30% of diameter and the available fixture height (compact ceiling fitting).
// ASSUMED: Suspension cords have a 3 mm radius and extend 5 mm into the fixture (connected suspension).
// ASSUMED: Drum shades have constant radius; cone top radius is 40% of bottom radius (recognisable shade profiles).
// ASSUMED: Bell profile height/radius fractions are 0/1, 0.35/0.72, 0.7/0.4 and 1/0.32 (flared bell silhouette).
// ASSUMED: Globe profile height/radius fractions are 0/0.4, 0.125/0.72, 0.25/0.9, 0.375/0.98, 0.5/1 and their vertical mirror (faceted globe with open necks).
// ASSUMED: Profile bands overlap vertically by 5 mm; globe and bell heads require at least 40 mm height (connected profile construction).
// ASSUMED: Shade walls are at most 5 mm thick, limited to half the smallest profile radius (positive inner opening).
// ASSUMED: A bare_bulb shade shape exposes a globe-shaped lamp envelope with half the nominal head radius and walls at most 3 mm thick (visible bare lamp).
// ASSUMED: Source spheres have radius min(8 mm, half the head height); sockets have 6 mm radius (simplified lamp fitting).
// ASSUMED: Head support crosses are 8 mm wide and 5 mm high (shade attachment).
// ASSUMED: Chandeliers have three or six radial heads, each with nominal diameter 22% of the fixture diameter, spanning the upper 65% of height (balanced multi-arm fixture).
// ASSUMED: Chandelier arms are 12 mm wide and 10 mm high, centred at 20% of height (radial structure).
// ASSUMED: Chandelier stems have 6 mm radius; the bottom finial has radius min(10 mm, 8% of height) (central support reaching z = 0).
// ASSUMED: Chandeliers require diameter at least 300 mm and height at least 100 mm (space for the heads).
// ASSUMED: Tracks have three downward heads at x = -1.5, 0 and 1.5 times diameter; rail length is four times diameter (diameter describes each spotlight).
// ASSUMED: Track rails are 15 mm high and at most 30 mm wide, limited to 40% of diameter; heads end 20 mm below the fixture top (head and rail clearance).
// ASSUMED: Track connecting necks have 8 mm radius and span 5 mm into the heads and rail (connected mounting).
// ASSUMED: Track lights require height at least 70 mm (room for heads and rail).
// ASSUMED: Recessed lights have a 5 mm thick trim ring and a reflector radius 80% of the overall radius (visible downlight trim).
// ASSUMED: Circular fixture parts use 32 segments and small sources, cords and necks use 16 (appropriate round-part resolution).
// UNSURE: The recessed fitting is shown entirely below the ceiling plane to preserve the required bottom and overall-height convention.
// UNSURE: Globe and bell shapes are approximated by overlapping conical bands because arbitrary surface modelling is not allowed.
// ASSUMED: Chandeliers have 3 or 6 arms (6 starts on +x, 3 on -y). Heads point up (standing on arms at 20% of height, shades opening upward) or down (hanging from arms at 80% of height, band 0 to 65% of height). Three arms cannot be balanced, so the model is centred on its bounds and the stem sits off the middle.
// UNSURE: Chandelier heads share one lightHeight value because only one light-specific parameter is permitted.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'ceiling-light',
  name: 'Ceiling light',
  summary: 'A ceiling light with flush, pendant, chandelier, recessed and track variants.',
  description:
    'A ceiling-mounted light with its canopy at the ceiling and optional suspension above the fixture, with a configurable source height inside the lamp heads. Assumed: overall height is height plus dropLength; lightHeight is measured from the bottom, 0 means the head centre and other values are kept inside the head; the bare bulb of a bare_bulb shade is in the shade part; canopy diameter is the smaller of 100 mm and 30% of diameter, with height the smaller of 20 mm and fixture height; cord radius 3 mm with 5 mm fixture penetration; drum radius constant and cone top radius 40% of bottom; bell height/radius fractions 0/1, 0.35/0.72, 0.7/0.4, 1/0.32; globe height/radius fractions 0/0.4, 0.125/0.72, 0.25/0.9, 0.375/0.98, 0.5/1 and their vertical mirror; profile bands overlap 5 mm and bell/globe heads require 40 mm height; shade walls at most 5 mm, limited to half the smallest profile radius; a bare_bulb shape exposes globe lamp envelopes with half the nominal head radius and walls at most 3 mm; source sphere radius min(8 mm, half head height), socket radius 6 mm, support crosses 8 mm wide and 5 mm high; chandeliers have six radial heads of nominal diameter 22% of fixture diameter occupying the upper 65% of height, 12 mm wide by 10 mm high arms centred at 20% of height, 6 mm radius central stem, and bottom finial radius min(10 mm, 8% of height); chandeliers have 3 or 6 arms, with heads pointing up (arms at 20% of height) or down (hanging from arms at 80% of height, heads in the lower 65%), and with 3 arms the model is centred on its bounds so the stem is off the middle; minimum chandelier diameter 300 mm and height 100 mm; track lights have three downward heads at x = -1.5, 0, 1.5 times diameter, a rail four times diameter long, rail height 15 mm and width min(30 mm, 40% of diameter), heads ending 20 mm below the top, and 8 mm radius necks entering heads and rail by 5 mm; minimum track height 70 mm; recessed trim thickness 5 mm and reflector radius 80% of overall radius; round fixture parts use 32 segments and small sources, cords and necks use 16; recessed fittings are represented below the ceiling.',
  params: [
    {
      key: 'variant',
      labels: { flush: 'Flush ceiling light', pendant: 'Pendant', chandelier: 'Chandelier', recessed_downlight: 'Recessed downlight', track_light: 'Track light' },
      label: 'Variant',
      type: 'enum',
      options: ['flush', 'pendant', 'chandelier', 'recessed_downlight', 'track_light'],
      default: 'flush',
    },
    {
      key: 'diameter',
      label: 'Diameter',
      unit: 'mm',
      default: 350,
      min: 60,
      max: 1000,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 150,
      min: 10,
      max: 600,
      step: 10,
    },
    {
      key: 'dropLength',
      appliesTo: ['pendant', 'chandelier'],
      label: 'Drop length',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 2000,
      step: 10,
    },
    {
      key: 'shadeShape',
      label: 'Shade shape',
      type: 'enum',
      options: ['drum', 'cone', 'globe', 'bell', 'bare_bulb'],
      default: 'drum',
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'white-paint',
    },
    {
      key: 'arms',
      appliesTo: ['chandelier'],
      label: 'Chandelier arms',
      type: 'enum_number',
      options: [3, 6],
      default: 6,
    },
    {
      key: 'headDirection',
      appliesTo: ['chandelier'],
      label: 'Chandelier heads point',
      type: 'enum',
      options: ['up', 'down'],
      default: 'up',
    },
    {
      key: 'lightHeight',
      label: 'Light source height',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 600,
      step: 1,
      hint: 'Height of the light above the bottom of the fixture. 0 = the centre of the lamp head; other values are kept inside the lamp head.',
    },
  ],
  parts: [
    { key: 'fitting', label: 'Canopy, cord and fitting' },
    { key: 'shade', label: 'Shade' },
  ],
  variantDefaults: {
    pendant: {
      diameter: 400,
      dropLength: 1000,
      shadeShape: 'cone',
      height: 250,
    },
    chandelier: {
      diameter: 700,
      dropLength: 800,
      shadeShape: 'bare_bulb',
    },
    recessed_downlight: {
      diameter: 90,
      height: 20,
      dropLength: 0,
    },
    track_light: {
      diameter: 60,
      height: 150,
    },
  },
  placement: { mount: 'ceiling' },
};

const profiles = {
  drum: [[0, 1], [1, 1]],
  cone: [[0, 1], [1, 0.4]],
  bell: [[0, 1], [0.35, 0.72], [0.7, 0.4], [1, 0.32]],
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

function headBounds(variant, height, direction = 'up') {
  if (variant === 'chandelier') {
    return direction === 'down' ? [0, 0.65 * height] : [0.35 * height, height];
  }
  if (variant === 'track_light') return [0, height - 20];
  return [0, height];
}

function resolve(p) {
  const variant = p.variant ?? 'flush';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown ceiling-light variant; choose flush, pendant, chandelier, recessed_downlight or track_light.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Never read the whole-object material parameter.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material' || key === 'lightHeight') continue;

    const value = p[key] ?? defaults[key] ?? definition.default;
    q[key] = value;

    if (definition.type === 'enum_number') {
      if (!definition.options.includes(value)) {
        throw new Error(
          `${definition.label} must be one of: ${definition.options.join(', ')}.`
        );
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

  if (variant === 'chandelier' && (q.diameter < 300 || q.height < 100)) {
    throw new Error(
      `A chandelier of diameter ${q.diameter} mm and height ${q.height} mm cannot fit this layout; use at least 300 mm diameter and 100 mm height.`
    );
  }

  if (variant === 'track_light' && q.height < 70) {
    throw new Error(
      `Track height ${q.height} mm is too small; at least 70 mm is required.`
    );
  }

  const [bottom, top] = headBounds(variant, q.height, q.headDirection);
  const curved = ['globe', 'bell', 'bare_bulb'].includes(q.shadeShape);
  if (curved && top - bottom < 40) {
    throw new Error(
      `The ${q.shadeShape} lamp head is ${top - bottom} mm high; this curved profile requires at least 40 mm.`
    );
  }

  // 0 means the centre of the lamp head; any other value is kept so the source sits inside the head.
  const sourceRadius = Math.min(8, (top - bottom) / 2);
  const wanted = p.lightHeight > 0 ? p.lightHeight : (bottom + top) / 2;
  q.lightHeight = Math.max(bottom + sourceRadius, Math.min(top - sourceRadius, wanted));

  return q;
}

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function cylinder(radius, bottom, top, x = 0, y = 0, segments = 32) {
  return primitives.cylinder({
    radius,
    height: top - bottom,
    center: [x, y, (bottom + top) / 2],
    segments,
  });
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

function profileRadius(profile, fraction, radius) {
  const u = Math.max(0, Math.min(1, fraction));
  for (let i = 0; i < profile.length - 1; i += 1) {
    const a = profile[i];
    const b = profile[i + 1];
    if (u <= b[0]) {
      const blend = (u - a[0]) / (b[0] - a[0]);
      return radius * (a[1] + blend * (b[1] - a[1]));
    }
  }
  return radius * profile[profile.length - 1][1];
}

function shell(profile, radius, bottom, top, maximumWall) {
  const pieces = [];
  const height = top - bottom;
  let minimumRatio = 1;

  for (const ring of profile) {
    minimumRatio = Math.min(minimumRatio, ring[1]);
  }
  const wall = Math.min(maximumWall, radius * minimumRatio / 2);

  for (let i = 0; i < profile.length - 1; i += 1) {
    const a = profile[i];
    const b = profile[i + 1];
    const z0 = Math.max(bottom, bottom + a[0] * height - 2.5);
    const z1 = Math.min(top, bottom + b[0] * height + 2.5);
    const r0 = radius * a[1];
    const r1 = radius * b[1];

    const outer = primitives.cylinderElliptic({
      height: z1 - z0,
      startRadius: [r0, r0],
      endRadius: [r1, r1],
      center: [0, 0, (z0 + z1) / 2],
      segments: 32,
    });
    const inner = primitives.cylinderElliptic({
      height: z1 - z0,
      startRadius: [r0 - wall, r0 - wall],
      endRadius: [r1 - wall, r1 - wall],
      center: [0, 0, (z0 + z1) / 2],
      segments: 32,
    });

    pieces.push(booleans.subtract(outer, inner));
  }

  return { geometry: combine(pieces), wall };
}

export function build(p = {}) {
  const q = resolve(p);
  const fitting = [];
  const shades = [];
  const radius = q.diameter / 2;
  const ceiling = q.height + q.dropLength;
  const canopyHeight = Math.min(20, q.height);
  const canopyRadius = Math.min(50, 0.15 * q.diameter);
  const [headBottom, headTop] = headBounds(q.variant, q.height, q.headDirection);
  const sourceRadius = Math.min(8, (headTop - headBottom) / 2);

  fitting.push(
    cylinder(canopyRadius, ceiling - canopyHeight, ceiling)
  );

  if (q.dropLength > 0) {
    fitting.push(
      cylinder(3, q.height - 5, ceiling, 0, 0, 16)
    );
  }

  // Chandelier heads that point up stand on their arm: the head is built hanging and mirrored in its own band.
  const flip = q.variant === 'chandelier' && q.headDirection === 'up';
  const bandMiddle = (headBottom + headTop) / 2;
  const lightZ = flip ? 2 * bandMiddle - q.lightHeight : q.lightHeight;
  const mirrored = (g) => flip
    ? transforms.translate([0, 0, bandMiddle], transforms.mirrorZ(transforms.translate([0, 0, -bandMiddle], g)))
    : g;

  function lampHead(x, y, nominalRadius) {
    const exposed = q.shadeShape === 'bare_bulb';
    const profile = profiles[exposed ? 'globe' : q.shadeShape];
    const headRadius = exposed ? nominalRadius / 2 : nominalRadius;
    const headShell = shell(
      profile,
      headRadius,
      headBottom,
      headTop,
      exposed ? 3 : 5
    );

    // Reject source positions that would intersect the shell.
    const lowFraction =
      (lightZ - sourceRadius - headBottom) / (headTop - headBottom);
    const highFraction =
      (lightZ + sourceRadius - headBottom) / (headTop - headBottom);
    const availableRadius = Math.min(
      profileRadius(profile, lowFraction, headRadius),
      profileRadius(profile, highFraction, headRadius)
    ) - headShell.wall;

    if (availableRadius < sourceRadius) {
      throw new Error(
        `At lightHeight ${q.lightHeight} mm, the head has approximately ${availableRadius} mm of internal radius but the source needs ${sourceRadius} mm. Move the source towards the head centre or increase diameter.`
      );
    }

    const placedShell = transforms.translate([x, y, 0], headShell.geometry);
    shades.push(mirrored(placedShell));

    fitting.push(
      mirrored(primitives.sphere({
        radius: sourceRadius,
        center: [x, y, lightZ],
        segments: 16,
      }))
    );

    const socketBottom = lightZ + sourceRadius - 5;
    fitting.push(mirrored(cylinder(6, socketBottom, headTop, x, y)));

    const topRadius = headRadius * profile[profile.length - 1][1];
    fitting.push(
      mirrored(box(
        x - topRadius, x + topRadius,
        y - 4, y + 4,
        headTop - 5, headTop
      )),
      mirrored(box(
        x - 4, x + 4,
        y - topRadius, y + topRadius,
        headTop - 5, headTop
      ))
    );
  }

  let shift = [0, 0];
  if (q.variant === 'chandelier') {
    const nominalHeadRadius = 0.11 * q.diameter;
    const actualHeadRadius = q.shadeShape === 'bare_bulb'
      ? nominalHeadRadius / 2
      : nominalHeadRadius;
    const orbit = radius - actualHeadRadius;
    const pointsUp = q.headDirection === 'up';
    const armHeight = (pointsUp ? 0.2 : 0.8) * q.height;
    const finialRadius = Math.min(10, 0.08 * q.height);
    const firstAngle = q.arms === 3 ? -Math.PI / 2 : 0;
    const angles = Array.from({ length: q.arms }, (_, i) => firstAngle + i * 2 * Math.PI / q.arms);

    // Three arms cannot be balanced: the model is centred on its bounds, so the stem sits off the middle.
    const xs = angles.map((a) => orbit * Math.cos(a));
    const ys = angles.map((a) => orbit * Math.sin(a));
    shift = [-(Math.max(...xs) + Math.min(...xs)) / 2, -(Math.max(...ys) + Math.min(...ys)) / 2];

    fitting.push(
      primitives.sphere({
        radius: finialRadius,
        center: [0, 0, finialRadius],
        segments: 32,
      }),
      cylinder(6, 2 * finialRadius - 5, q.height)
    );

    for (const angle of angles) {
      const x = orbit * Math.cos(angle);
      const y = orbit * Math.sin(angle);
      const arm = box(
        0, orbit,
        -6, 6,
        armHeight - 5, armHeight + 5
      );

      fitting.push(
        transforms.rotateZ(angle, arm),
        pointsUp
          ? cylinder(6, armHeight, headBottom + 5, x, y)
          : cylinder(6, headTop - 5, armHeight, x, y)
      );
      lampHead(x, y, nominalHeadRadius);
    }
  } else if (q.variant === 'track_light') {
    const railWidth = Math.min(30, 0.4 * q.diameter);

    fitting.push(
      box(
        -2 * q.diameter, 2 * q.diameter,
        -railWidth / 2, railWidth / 2,
        q.height - 15, q.height
      )
    );

    for (const multiplier of [-1.5, 0, 1.5]) {
      const x = multiplier * q.diameter;
      fitting.push(
        cylinder(8, headTop - 5, q.height - 10, x, 0, 16)
      );
      lampHead(x, 0, radius);
    }
  } else if (q.variant === 'recessed_downlight') {
    const trim = booleans.subtract(
      cylinder(radius, 0, 5),
      cylinder(0.8 * radius - 5, 0, 5)
    );
    fitting.push(trim);
    lampHead(0, 0, 0.8 * radius);
  } else {
    lampHead(0, 0, radius);
  }

  const place = (g) => (shift[0] || shift[1])
    ? transforms.translate([shift[0], shift[1], 0], g)
    : g;

  return {
    fitting: place(combine(fitting)),
    shade: place(combine(shades)),
  };
}

/** Where the fixture sits, [x, y, z] in mm (AGENT_INSTRUCTIONS §3.3): the middle of the model, at the light source height. */
export function lightPoint(p = {}) {
  return [0, 0, resolve(p).lightHeight];
}
