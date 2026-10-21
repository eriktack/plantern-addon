import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: The stove body stands on four 40 mm square legs 100 mm high; the height is the body with its legs, without the flue.
// ASSUMED: The glass door is a recess 20 mm deep in the front, 60 % of the width and 40 % of the body height, centred, 20 % above the body's bottom (as the brief says: a recess, no separate glass).
// ASSUMED: The flue is a pipe `flueLength` long (default 300 mm) outside the stove and `flueDiameter` across, rising from the middle of the top (outlet top) or leaving the middle of the back (outlet rear), 5 mm into the body. A rear flue is 150 mm below the top of the body (the height of its axis).
// ASSUMED: A corner stove is the same body turned 45 degrees about its centre so that it sits in a corner; its rear flue leaves along the turned back, towards the corner.
// ASSUMED: The model is centred on x and y with the flue included (the middle of the bounding box), so a rear flue shifts the body forward by half its length.
// ASSUMED: A round stove (a braskamin) is a cylinder `width` across on four short feet, its height taken as the body with its feet; its glass door is a 20 mm deep curved recess about 110 degrees wide in the front, 40 % of the body height, 20 % above the bottom, with a separate pane inside it; the flue is the same stub on top. `hearth` adds a 6 mm floor plate in front of it: a half disc reaching 200 mm out beyond the stove, cut off flat behind it, and the whole model is recentred on y.
// UNSURE: The firebox, the ash pan and the handle are omitted.

export const meta = {
  id: 'wood-stove',
  name: 'Wood stove',
  summary: 'A freestanding, corner or round (braskamin) wood-burning stove with a flue stub.',
  description:
    'A wood stove on legs, front at -y; the round form (a braskamin) is a cylinder with a curved glass door and an optional hearth plate. Assumed: a round stove is a cylinder on four short feet with a 20 mm deep curved door recess about 110 degrees wide and a separate pane, and its hearth plate is a 6 mm half disc reaching 200 mm out in front; four 40 mm legs 100 mm high; a glass door recess 20 mm deep, 60 % of the width and 40 % of the body height; a flue pipe (300 mm long unless set) on the top or the back, the rear one 150 mm below the top; a corner stove is the body turned 45 degrees; the firebox, ash pan and handle are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['freestanding', 'corner', 'round'], labels: { freestanding: 'Freestanding stove', corner: 'Corner stove (turned 45 degrees)', round: 'Round stove (braskamin)' }, default: 'freestanding' },
    { key: 'width', label: 'Width (diameter if round)', unit: 'mm', default: 480, min: 400, max: 700, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 480, min: 400, max: 700, step: 10, appliesTo: ['freestanding', 'corner'] },
    { key: 'height', label: 'Height', unit: 'mm', default: 700, min: 550, max: 1500, step: 10, hint: 'The body with its legs, without the flue.' },
    { key: 'flueOutlet', label: 'Flue outlet', type: 'enum', options: ['top', 'rear'], labels: { top: 'Top', rear: 'Rear (150 mm below the top)' }, default: 'top' },
    { key: 'flueLength', label: 'Flue length', unit: 'mm', default: 300, min: 100, max: 1500, step: 10, hint: 'How far the pipe reaches out of the stove: up from the top, or out from the back.' },
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
  sizeParams: { x: { default: 'width', corner: null, round: null } },   // the depth is not exact: a rear flue sticks out behind, and a rear flue on a corner or round stove changes the width too
  placement: { mount: 'floor' },
};

// the model is centred on x and y with everything in it: move all parts by the middle of their bounding box
function centred(parts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const g of Object.values(parts)) for (const poly of geometries.geom3.toPolygons(g)) for (const [x, y] of poly.vertices) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const d = [-(x0 + x1) / 2, -(y0 + y1) / 2, 0];
  return Object.fromEntries(Object.entries(parts).map(([k, g]) => [k, geometries.geom3.toPolygons(g).length ? transforms.translate(d, g) : g]));
}

// the flue: `up` a pipe standing on the top at z = top, `rear` a pipe lying out of the back wall at y = back, its axis `drop` below the top; `len` outside the body, 5 mm inside it
const flueUp = (r, len, top) => primitives.cylinder({ radius: r, height: len + 5, center: [0, 0, top - 5 + (len + 5) / 2], segments: 24 });
const flueRear = (r, len, back, top, drop = 150) => transforms.translate([0, back - 5 + (len + 5) / 2, top - drop], transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: r, height: len + 5, center: [0, 0, 0], segments: 24 })));

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
  const flue = p.flueOutlet === 'rear' ? flueRear(r, (p.flueLength ?? 300), R, H) : flueUp(r, (p.flueLength ?? 300), H);
  let hearth = geometries.geom3.create();
  if (p.hearth) {
    const Rh = R + 200, back = 0.9 * R;
    const disc = primitives.cylinder({ radius: Rh, height: 6, center: [0, 0, 3], segments: 64 });
    hearth = booleans.subtract(disc, primitives.cuboid({ size: [2 * Rh + 20, 2 * Rh, 20], center: [0, back + Rh, 3] }));   // flat behind the stove
  }
  return centred({ body, flue, glass, hearth });     // the hearth in front and a rear flue behind move the middle
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

  const rear = p.flueOutlet === 'rear';
  let flue = rear ? flueRear(r, (p.flueLength ?? 300), D / 2, H) : flueUp(r, (p.flueLength ?? 300), H);
  if (p.variant === 'corner') {
    body = transforms.rotateZ(Math.PI / 4, body);
    flue = transforms.rotateZ(Math.PI / 4, flue);
  }
  return centred({ body, flue, glass: geometries.geom3.create(), hearth: geometries.geom3.create() });
}
