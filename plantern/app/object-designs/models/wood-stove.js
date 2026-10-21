import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: The stove body stands on four 40 mm square legs 100 mm high; the height is the body with its legs, without the flue.
// ASSUMED: The glass door is a recess 20 mm deep in the front, 60 % of the width and 40 % of the body height, centred, 20 % above the body's bottom (as the brief says: a recess, no separate glass).
// ASSUMED: The flue is a 300 mm pipe stub, `flueDiameter` across, rising from the middle of the top (outlet top) or leaving the middle of the back (outlet rear), 5 mm into the body.
// ASSUMED: A corner stove is the same body turned 45 degrees about its centre so that it sits in a corner; its flue always rises from the top.
// ASSUMED: The model is centred on x and y with the flue included, so a rear flue shifts the body forward by 150 mm.
// ASSUMED: A round stove (a braskamin) is a cylinder `width` across on four short feet, its height taken as the body with its feet; its glass door is a 20 mm deep curved recess about 110 degrees wide in the front, 40 % of the body height, 20 % above the bottom, with a separate pane inside it; the flue is the same stub on top. `hearth` adds a 6 mm floor plate in front of it: a half disc reaching 200 mm out beyond the stove, cut off flat behind it, and the whole model is recentred on y.
// UNSURE: The firebox, the ash pan and the handle are omitted.

export const meta = {
  id: 'wood-stove',
  name: 'Wood stove',
  summary: 'A freestanding, corner or round (braskamin) wood-burning stove with a flue stub.',
  description:
    'A wood stove on legs, front at -y; the round form (a braskamin) is a cylinder with a curved glass door and an optional hearth plate. Assumed: a round stove is a cylinder on four short feet with a 20 mm deep curved door recess about 110 degrees wide and a separate pane, and its hearth plate is a 6 mm half disc reaching 200 mm out in front; four 40 mm legs 100 mm high; a glass door recess 20 mm deep, 60 % of the width and 40 % of the body height; a 300 mm flue stub on the top or the back; a corner stove is the body turned 45 degrees; the firebox, ash pan and handle are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['freestanding', 'corner', 'round'], labels: { freestanding: 'Freestanding stove', corner: 'Corner stove (turned 45 degrees)', round: 'Round stove (braskamin)' }, default: 'freestanding' },
    { key: 'width', label: 'Width (diameter if round)', unit: 'mm', default: 480, min: 400, max: 700, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 480, min: 400, max: 700, step: 10, appliesTo: ['freestanding', 'corner'] },
    { key: 'height', label: 'Height', unit: 'mm', default: 700, min: 550, max: 1500, step: 10, hint: 'The body with its legs, without the flue.' },
    { key: 'flueOutlet', label: 'Flue outlet', type: 'enum', options: ['top', 'rear'], labels: { top: 'Top', rear: 'Rear' }, default: 'top', appliesTo: ['freestanding'] },
    { key: 'flueDiameter', label: 'Flue diameter', unit: 'mm', default: 150, min: 100, max: 200, step: 10 },
    { key: 'hearth', label: 'Hearth plate', type: 'boolean', default: false, appliesTo: ['round'], hint: 'A floor plate in front of the stove.' },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'charcoal' },
  ],
  parts: [
    { key: 'body', label: 'Stove' },
    { key: 'flue', label: 'Flue pipe' },
    { key: 'glass', label: 'Door glass', appliesTo: ['round'], defaultMaterial: 'glass' },
    { key: 'hearth', label: 'Hearth plate', needs: 'hearth' },
  ],
  variantDefaults: {
    round: { width: 480, height: 1200, hearth: false },
  },
  sizeParams: { x: { default: 'width', corner: null, round: null } },   // the depth is not exact: a rear flue sticks out behind
  placement: { mount: 'floor' },
};

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

// A round stove: a cylinder on short feet, a curved glass door in the front, the flue on top and an optional hearth plate.
function buildRound(p) {
  const R = p.width / 2, H = p.height, legs = 60, r = p.flueDiameter / 2;
  const feet = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => primitives.cylinder({ radius: 22, height: legs + 5, center: [sx * (R - 70) * 0.7, sy * (R - 70) * 0.7, (legs + 5) / 2], segments: 12 }));
  let body = booleans.union(primitives.cylinder({ radius: R, height: H - legs, center: [0, 0, legs + (H - legs) / 2], segments: 48 }), ...feet);
  const bodyH = H - legs, dz0 = legs + bodyH * 0.2, dz1 = dz0 + bodyH * 0.4, half = Math.sin((55 * Math.PI) / 180) * R;
  // the door recess: a ring 20 mm deep, cut to the part of it in front (y < 0) and within +-55 degrees
  const ring = (rOut, rIn, z0, z1) => booleans.subtract(primitives.cylinder({ radius: rOut, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: 48 }), primitives.cylinder({ radius: rIn, height: z1 - z0 + 2, center: [0, 0, (z0 + z1) / 2], segments: 48 }));
  const front = (z0, z1) => primitives.cuboid({ size: [2 * half, R + 5, z1 - z0], center: [0, -(R + 5) / 2, (z0 + z1) / 2] });
  const cut = booleans.subtract(front(dz0, dz1), booleans.subtract(front(dz0, dz1), ring(R + 2, R - 20, dz0, dz1)));
  body = booleans.subtract(body, cut);
  const glass = booleans.subtract(front(dz0 + 5, dz1 - 5), booleans.subtract(front(dz0 + 5, dz1 - 5), ring(R - 12, R - 20, dz0 + 5, dz1 - 5)));
  const flue = primitives.cylinder({ radius: r, height: 305, center: [0, 0, H + 150 - 2.5], segments: 24 });
  let hearth = geometries.geom3.create();
  let shiftY = 0;
  if (p.hearth) {
    const Rh = R + 200, back = 0.9 * R;
    const disc = primitives.cylinder({ radius: Rh, height: 6, center: [0, 0, 3], segments: 64 });
    hearth = booleans.subtract(disc, primitives.cuboid({ size: [2 * Rh + 20, 2 * Rh, 20], center: [0, back + Rh, 3] }));   // flat behind the stove
    shiftY = -(-Rh + R) / 2;                                                                                              // the stove body reaches R behind: recentre y
  }
  const at = g => transforms.translate([0, shiftY, 0], g);
  return { body: at(body), flue: at(flue), glass: at(glass), hearth: at(hearth) };
}

export function build(p) {
  if (p.variant === 'round') return buildRound(p);
  const W = p.width, D = p.depth, H = p.height, legs = 100, r = p.flueDiameter / 2;
  let body = booleans.union(
    box(-W / 2, W / 2, -D / 2, D / 2, legs, H),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => box(sx * (W / 2 - 25) - 20, sx * (W / 2 - 25) + 20, sy * (D / 2 - 25) - 20, sy * (D / 2 - 25) + 20, 0, legs + 5)),
  );
  const bodyH = H - legs, dw = W * 0.6, dz0 = legs + bodyH * 0.2, dz1 = dz0 + bodyH * 0.4;
  body = booleans.subtract(body, box(-dw / 2, dw / 2, -D / 2 - 1, -D / 2 + 20, dz0, dz1));

  const rear = p.variant === 'freestanding' && p.flueOutlet === 'rear';
  let flue = rear
    ? transforms.translate([0, D / 2 - 5 + 150, H - 150], transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: r, height: 310, center: [0, 0, 0], segments: 24 })))
    : primitives.cylinder({ radius: r, height: 305, center: [0, 0, H + 150 - 2.5], segments: 24 });
  if (p.variant === 'corner') {
    body = transforms.rotateZ(Math.PI / 4, body);
    flue = transforms.rotateZ(Math.PI / 4, flue);
  }
  if (rear) {
    body = transforms.translate([0, -150, 0], body);
    flue = transforms.translate([0, -150, 0], flue);
  }
  return { body, flue, glass: geometries.geom3.create(), hearth: geometries.geom3.create() };
}
