import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: dining and timber legs 40 mm square, 50 mm from 700 mm width (typical timber chair legs).
// ASSUMED: seat board 30 mm and dining seat pad 40 mm (typical solid-wood seat and pad).
// ASSUMED: club cushions 120 mm (armchair) and 110 mm (lounge), office cushion 60 mm (typical upholstery depths).
// ASSUMED: arm height above seat 200 / 210 / 220 / 190 mm for dining / armchair / office / lounge (typical arm heights).
// ASSUMED: back tilt 0 deg dining, 8 deg armchair, 12 deg lounge, 8 deg office (typical recline per style).
// ASSUMED: club feet 110 mm high and club arm blocks 90 mm wide (100 mm armchair) (typical club-chair proportions).
// ASSUMED: office five-star base with 50 mm casters, gas column 50 mm diameter (typical office chair base).
// ASSUMED: office arm pads 60 mm wide and 40 mm thick, with a 60 mm gap each side of the seat (typical office armrests).
// UNSURE: armchair and office are barely different. Both default to an 8 deg back tilt, arms and an upholstered back.
//   Only their sizes, base and cushion depths differ, so they can look alike. They could differ more: the office could
//   have a distinct back (taller, or with a lumbar support) and a visible mechanism, and the armchair could be wider and
//   lower with deeper arms and a more padded back. Not changed yet; Erik to decide the look.
// UNSURE: the "arm height reduced if the back is low" rule (armH = min(default, H - SH - 80)) is a guess at what
//   counts as low; check it on a short back.

export const meta = {
  id: 'chair',
  name: 'Chair',
  summary: 'Dining, club armchair, office and lounge chairs.',
  description:
    'A parametric chair with four variants: timber dining chair, upholstered club armchair, office chair on a five-star base, and a low lounge chair. ' +
    'Assumed: dining/timber legs 40 mm square (50 mm when width is 700 mm or more); seat board 30 mm; dining seat pad 40 mm; ' +
    'club cushions 120 mm (armchair) and 110 mm (lounge), office cushion 60 mm; arm height above seat 200 mm (dining/timber), 210 mm (armchair), 220 mm (office), 190 mm (lounge), ' +
    'reduced if the back is low; back slats 20 mm thick, 3 slats; upholstered back 40 mm (dining), 120 mm (club), 60 mm (office); ' +
    'back tilt 0 deg (dining/timber), 8 deg (armchair), 12 deg (lounge), 8 deg (office); club feet 110 mm high; club arm blocks 90 mm wide (armchair 100 mm); ' +
    'office arm pads 60 mm wide and 40 mm thick, 60 mm gap each side of the seat; office column 50 mm diameter, base arms 50 x 35 mm, casters 50 mm diameter, ' +
    'star radius = half of the smaller of width and depth, less 10 mm.',
  params: [
    { key: 'variant', labels: { dining: 'Dining chair', armchair: 'Armchair', office: 'Office chair', lounge: 'Lounge chair' }, label: 'Variant', type: 'enum', options: ['dining', 'armchair', 'office', 'lounge'], default: 'dining' },
    { key: 'width', label: 'Width', unit: 'mm', default: 450, min: 400, max: 1000, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 500, min: 450, max: 900, step: 10 },
    { key: 'height', label: 'Height', unit: 'mm', default: 850, min: 750, max: 1050, step: 10 },
    { key: 'seatHeight', label: 'Seat height', unit: 'mm', default: 450, min: 400, max: 550, step: 10 },
    { key: 'arms', label: 'Arms', type: 'boolean', default: false },
    { key: 'upholstered', label: 'Upholstered', type: 'boolean', default: false },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'oak' },
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'seat', label: 'Seat and back' },
  ],
  variantDefaults: {
    dining: { arms: false, upholstered: false },
    armchair: { width: 800, depth: 850, height: 900, arms: true, upholstered: true },
    office: { width: 650, depth: 650, height: 1050, seatHeight: 480, arms: true, upholstered: true },
    lounge: { width: 750, depth: 800, height: 850, seatHeight: 420, arms: true, upholstered: true },
  },
  sizeParams: { x: 'width', y: 'depth', z: 'height' },
  placement: { mount: 'floor' },
};

// ---------- helpers ----------

function resolve(p) {
  const o = {};
  for (const d of meta.params) {
    o[d.key] = p && p[d.key] !== undefined ? p[d.key] : d.default;
  }
  return o;
}

const bx = (sx, sy, sz, cx, cy, cz) =>
  primitives.cuboid({ size: [sx, sy, sz], center: [cx, cy, cz] });

const uni = (list) => booleans.union(...list);

// A back panel leaning backwards by `tilt` radians. Its rear-top edge sits at rearY,
// its top is at topZ and its bottom (at the rear) is near bottomZ.
function tiltedBack(w, t, bottomZ, topZ, rearY, tilt) {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const bh = (topZ - bottomZ - (t / 2) * s) / c;
  const yb = rearY - (t / 2) * c - bh * s;
  const box = primitives.cuboid({ size: [w, t, bh], center: [0, 0, bh / 2] });
  const shape = transforms.translate([0, yb, bottomZ], transforms.rotateX(-tilt, box));
  return { shape, yb };
}

function checkCommon(c) {
  if (!['dining', 'armchair', 'office', 'lounge'].includes(c.variant)) {
    throw new Error('Unknown variant "' + c.variant + '". Use dining, armchair, office or lounge.');
  }
  if (c.H - c.SH < 250) {
    throw new Error(
      'Height ' + c.H + ' mm is too low for seat height ' + c.SH +
      ' mm: the back must rise at least 250 mm above the seat (needs height of at least ' + (c.SH + 250) + ' mm).'
    );
  }
}

// ---------- timber frame chair (dining, and non-upholstered armchair/lounge) ----------

function frameChair(c) {
  const { W, D, H, SH, arms, up, armH } = c;
  const lg = W >= 700 ? 50 : 40;
  const boardT = 30;
  const cT = up ? 40 : 0;
  const zb = SH - boardT - cT; // underside of seat board
  const xl = W / 2 - lg / 2;
  const yf = -D / 2 + lg / 2;
  const yr = D / 2 - lg / 2;
  const inner = W - 2 * lg + 10;

  const f = [];
  for (const s of [-1, 1]) {
    const fh = arms ? SH + armH - 25 + 5 : zb + 5;
    f.push(bx(lg, lg, fh, s * xl, yf, fh / 2)); // front leg (post when arms)
    f.push(bx(lg, lg, H, s * xl, yr, H / 2)); // rear leg and back post
    f.push(bx(20, D - 2 * lg + 10, 60, s * xl, 0, zb - 25)); // side apron
    f.push(bx(25, D - 2 * lg + 10, 25, s * xl, 0, 130)); // side stretcher
    if (arms) f.push(bx(lg, D, 25, s * xl, 0, SH + armH - 12.5)); // arm rail
  }
  f.push(bx(inner, 20, 60, 0, yf, zb - 25)); // front apron
  f.push(bx(inner, 20, 60, 0, yr, zb - 25)); // rear apron
  f.push(bx(inner, 25, 25, 0, 0, 130)); // cross stretcher

  const s = [];
  s.push(bx(W, D, boardT, 0, 0, zb + boardT / 2)); // seat board
  if (up) s.push(bx(W - 20, D - 20, cT + 5, 0, 0, SH - (cT + 5) / 2)); // seat pad

  if (up) {
    const zLow = SH + 60;
    const zTop = H - 20;
    s.push(bx(inner, 40, zTop - zLow, 0, D / 2 - 20, (zTop + zLow) / 2)); // back pad
  } else {
    const n = 3;
    const zLow = SH + 60;
    const zone = H - zLow;
    const slatH = Math.min(70, zone / (2 * n - 1));
    for (let i = 0; i < n; i++) {
      const z = zLow + slatH / 2 + (i * (zone - slatH)) / (n - 1);
      s.push(bx(inner, 20, slatH, 0, yr, z));
    }
  }
  return { frame: uni(f), seat: uni(s) };
}

// ---------- upholstered club chair (armchair, lounge) ----------

function clubChair(c) {
  const { W, D, H, SH, arms, armH, variant } = c;
  const footH = 110;
  const cT = variant === 'armchair' ? 120 : 110;
  const bT = variant === 'armchair' ? 120 : 110;
  const armT = variant === 'armchair' ? 100 : 90;
  const tilt = ((variant === 'armchair' ? 8 : 12) * Math.PI) / 180;
  const boardT = 30;
  const zb = SH - cT - boardT;
  const innerW = arms ? W - 2 * armT + 10 : W;

  if (arms && W - 2 * armT < 250) {
    throw new Error(
      'Width ' + W + ' mm leaves only ' + (W - 2 * armT) + ' mm between the arms; at least 250 mm is needed (width of at least ' + (2 * armT + 250) + ' mm).'
    );
  }

  const f = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      f.push(
        primitives.cylinderElliptic({
          height: footH + 5,
          startRadius: [20, 20],
          endRadius: [28, 28],
          center: [sx * (W / 2 - 45), sy * (D / 2 - 45), (footH + 5) / 2],
          segments: 16,
        })
      );
    }
  }
  f.push(bx(W, D, zb + 5 - footH, 0, 0, (footH + zb + 5) / 2)); // plinth
  if (arms) {
    const ah = SH + armH - footH;
    for (const sx of [-1, 1]) {
      f.push(bx(armT, D, ah, sx * (W / 2 - armT / 2), 0, footH + ah / 2));
    }
  }

  const s = [];
  s.push(bx(innerW, D, boardT, 0, 0, zb + boardT / 2));
  s.push(bx(innerW, D, cT + 5, 0, 0, SH - (cT + 5) / 2));
  s.push(tiltedBack(innerW, bT, SH - 5, H, D / 2, tilt).shape);
  return { frame: uni(f), seat: uni(s) };
}

// ---------- office chair ----------

function officeChair(c) {
  const { W, D, H, SH, arms, up, armH } = c;
  const cT = up ? 60 : 0;
  const boardT = 30;
  const zb = SH - cT - boardT;
  const sw = arms ? W - 120 : W;
  const tilt = (8 * Math.PI) / 180;

  if (sw < 300) {
    throw new Error('Width ' + W + ' mm leaves only ' + sw + ' mm of seat between the arms; at least 300 mm is needed (width of at least 420 mm).');
  }

  const R = Math.min(W, D) / 2 - 10;
  const f = [];
  // five-star base with casters
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    f.push(transforms.rotateZ(a, bx(R, 50, 35, R / 2, 0, 62.5)));
    f.push(
      transforms.rotateZ(
        a,
        primitives.sphere({ radius: 25, center: [R - 25, 0, 25], segments: 16 })
      )
    );
  }
  f.push(primitives.cylinder({ radius: 45, height: 50, center: [0, 0, 70], segments: 32 })); // hub
  const colTop = zb - 30;
  const colBottom = 90;
  f.push(
    primitives.cylinder({
      radius: 25,
      height: colTop - colBottom,
      center: [0, 0, (colTop + colBottom) / 2],
      segments: 32,
    })
  ); // gas column
  const plateD = Math.min(D - 100, 260);
  const plateW = Math.min(sw - 40, 300);
  f.push(bx(plateW, plateD, 40, 0, 0, zb - 15)); // seat mechanism plate

  if (arms) {
    const padL = Math.min(300, D * 0.5);
    const padTop = SH + armH;
    const postTop = padTop - 40 + 5;
    for (const sx of [-1, 1]) {
      f.push(bx(60, padL, 40, sx * (W / 2 - 30), -20, padTop - 20)); // arm pad
      f.push(bx(30, 40, postTop - zb, sx * (W / 2 - 50), -20, (postTop + zb) / 2)); // arm post
    }
  }

  const s = [];
  s.push(bx(sw, D, boardT, 0, 0, zb + boardT / 2));
  if (up) s.push(bx(sw, D, cT + 5, 0, 0, SH - (cT + 5) / 2));
  const bT = up ? 60 : 30;
  const bottomZ = SH + 70;
  const back = tiltedBack(sw - 40, bT, bottomZ, H, D / 2, tilt);
  s.push(back.shape);
  // back support post from seat to back
  const supBottom = SH - 30;
  const supTop = bottomZ + 5;
  s.push(bx(60, 40, supTop - supBottom, 0, back.yb, (supTop + supBottom) / 2));
  return { frame: uni(f), seat: uni(s) };
}

// ---------- build ----------

export function build(params) {
  const q = resolve(params);
  const c = {
    variant: q.variant,
    W: q.width,
    D: q.depth,
    H: q.height,
    SH: q.seatHeight,
    arms: !!q.arms,
    up: !!q.upholstered,
  };
  checkCommon(c);

  const armDefault = { dining: 200, armchair: 210, office: 220, lounge: 190 }[c.variant];
  c.armH = Math.min(armDefault, c.H - c.SH - 80);

  let res;
  if (c.variant === 'office') {
    res = officeChair(c);
  } else if (c.variant === 'dining' || !c.up) {
    res = frameChair(c);
  } else {
    res = clubChair(c);
  }
  return { frame: res.frame, seat: res.seat };
}

export function size(params) {
  const q = resolve(params);
  return [q.width, q.depth, q.height];
}