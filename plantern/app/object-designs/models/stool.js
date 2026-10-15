import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: seat 40 mm thick, legs 36 mm diameter, feet 60 mm further out than the tops (typical splayed stool legs).
// ASSUMED: leg tops set 85 mm in from the seat edge (typical leg position).
// ASSUMED: footrest ring 25 mm tall and 20 mm wide at about 28% of seat height, on stools 450 mm or taller.
// ASSUMED: backrest 250 mm above the seat on two 20 mm posts, at the back (+y) (typical half-round back).
// UNSURE: a variant with a square seat and square legs, like the dining chair but at bar-stool height, is not built.
//   It could be a fourth variant (for example `square`) with a square seat board and square legs, sized like the
//   bar stool and optionally with the same footrest and back. Not changed yet; Erik to decide.

export const meta = {
  id: 'stool',
  name: 'Stool',
  summary: 'A round-seat bar, counter or step stool, with an optional backrest.',
  description:
    'A round-seat stool on four splayed legs, as a bar stool, counter stool or low step stool. A footrest ring is added on tall stools, and an optional half-round backrest sits on two posts. ' +
    'Assumed: seat 40 mm thick; legs 36 mm diameter, splayed so the feet are 60 mm further out than the tops, with the tops set 85 mm in from the seat edge; ' +
    'footrest ring 25 mm tall and 20 mm wide at about 28% of seat height, on stools with seat height of 450 mm or more; ' +
    'backrest 250 mm tall above the seat, made of a 100 mm tall, 20 mm thick half-round band on two 20 mm posts; the backrest is at the back (+y).',
  params: [
    { key: 'variant', labels: { bar: 'Bar stool', counter: 'Counter stool', step: 'Step stool' }, label: 'Variant', type: 'enum', options: ['bar', 'counter', 'step'], default: 'bar' },
    { key: 'diameter', label: 'Diameter', unit: 'mm', default: 450, min: 350, max: 550, step: 10 },
    { key: 'seatHeight', label: 'Seat height', unit: 'mm', default: 750, min: 250, max: 800, step: 10 },
    { key: 'backrest', label: 'Backrest', type: 'boolean', default: false },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'oak' },
  ],
  variantDefaults: {
    bar: { seatHeight: 750 },
    counter: { seatHeight: 650 },
    step: { seatHeight: 350, diameter: 350 },
  },
  parts: [
    { key: 'seat', label: 'Seat' },
    { key: 'legs', label: 'Legs' },
  ],
  placement: { mount: 'floor' },
};

const SEAT_T = 40;
const LEG_R = 18;
const SPLAY = 60;
const BACK_H = 250;

function check(p) {
  if (['bar', 'counter', 'step'].indexOf(p.variant) < 0) {
    throw new Error('Unknown stool variant "' + p.variant + '".');
  }
  const R = p.diameter / 2;
  const sh = p.seatHeight;
  if (sh - SEAT_T - 100 < 100) {
    throw new Error('Seat height (' + Math.round(sh) + ' mm) is too low for a ' + SEAT_T + ' mm seat and legs. Use at least 250 mm.');
  }
  if (R - 85 <= LEG_R + 20) {
    throw new Error('Diameter (' + Math.round(p.diameter) + ' mm) is too small for the leg layout. Use at least 350 mm.');
  }
}

export function build(p) {
  check(p);
  const R = p.diameter / 2;
  const sh = p.seatHeight;

  // ----- seat -----
  const seatParts = [
    primitives.cylinder({ radius: R, height: SEAT_T, center: [0, 0, sh - SEAT_T / 2], segments: 32 }),
  ];

  if (p.backrest) {
    const Ro = R - 15;
    const Ri = R - 35;
    const Rm = R - 25;
    const bandH = 100;
    const zTop = sh + BACK_H;
    const zBandMid = zTop - bandH / 2;
    const cut = 0.25 * R;
    const tube = booleans.subtract(
      primitives.cylinder({ radius: Ro, height: bandH, center: [0, 0, zBandMid], segments: 32 }),
      primitives.cylinder({ radius: Ri, height: bandH + 10, center: [0, 0, zBandMid], segments: 32 })
    );
    const front = primitives.cuboid({
      size: [2 * R + 20, R + 10 + cut, bandH + 20],
      center: [0, (cut - R - 10) / 2, zBandMid],
    });
    seatParts.push(booleans.subtract(tube, front));

    const py = cut + 15;
    const px = Math.sqrt(Rm * Rm - py * py);
    const postBot = sh - 5;
    const postH = zTop - postBot;
    for (const sx of [-1, 1]) {
      seatParts.push(
        primitives.cylinder({
          radius: 10,
          height: postH,
          center: [sx * px, py, postBot + postH / 2],
          segments: 16,
        })
      );
    }
  }
  const seat = seatParts.length === 1 ? seatParts[0] : booleans.union(...seatParts);

  // ----- legs -----
  const Rf = R - 25; // foot centre radius
  const Rt = Rf - SPLAY; // top centre radius
  const zt = sh - SEAT_T + 5; // leg top, 5 mm into the seat
  const tilt = (() => {
    // solve for zf so the lowest point of the foot is z = 0
    let zf = 0;
    for (let i = 0; i < 6; i++) {
      const H = zt - zf;
      zf = LEG_R * Math.sin(Math.atan(SPLAY / H));
    }
    return zf;
  })();
  const zf = tilt;
  const H = zt - zf;
  const theta = Math.atan(SPLAY / H);
  const L = Math.sqrt(SPLAY * SPLAY + H * H);
  const midX = (Rf + Rt) / 2;
  const midZ = (zf + zt) / 2;

  const legParts = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const leg = primitives.cylinder({ radius: LEG_R, height: L, center: [0, 0, 0], segments: 16 });
    const placed = transforms.translate([midX, 0, midZ], transforms.rotateY(-theta, leg));
    legParts.push(transforms.rotateZ(a, placed));
  }

  if (sh >= 450) {
    const zr = 0.28 * sh;
    const rLeg = Rf - (SPLAY * (zr - zf)) / H; // leg centre radius at that height
    const ringH = 25;
    const ring = booleans.subtract(
      primitives.cylinder({ radius: rLeg + 10, height: ringH, center: [0, 0, zr], segments: 32 }),
      primitives.cylinder({ radius: rLeg - 10, height: ringH + 10, center: [0, 0, zr], segments: 32 })
    );
    legParts.push(ring);
  }
  const legs = booleans.union(...legParts);

  return { seat, legs };
}

export function size(p) {
  check(p);
  return [p.diameter, p.diameter, p.seatHeight + (p.backrest ? BACK_H : 0)];
}