import { primitives, booleans, extrusions, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: A display cabinet (vitrinskåp, a hutch) is two parts on legs: a bottom part with closed doors and an optional row of drawers under a 25 mm worktop, and a top part with glass doors, shelves and a 20 mm top board. The top part stands on the worktop against the back and is never deeper than the bottom part (a deeper `topDepth` is kept at the bottom part's depth).
// ASSUMED: The bottom part is a solid block (the inside of a closed cupboard is not modelled); the top part is a hollow case with 18 mm sides and back so the shelves can be seen through the glass. Shelves are 18 mm thick and evenly spaced between the worktop and the top board.
// ASSUMED: Bottom fronts are 20 mm thick and recessed 14 mm under the worktop; the glass doors are 16 mm thick with 38 mm frames, recessed 6 mm; the pane is 5 mm; with muntins each door has one horizontal bar and one vertical bar, 16 mm wide (the vertical one only on a door wider than 260 mm).
// ASSUMED: Drawers are a single row above the bottom doors, about 140 mm high (at most 30 % of the front); with no drawers the doors fill the front. Gaps between fronts are 4 mm, 12 mm to the edges (44 mm on the diagonal front of the corner variant).
// ASSUMED: Knobs are round, 30 mm across, one on each door and drawer (a door's at its edge nearest the middle; a single door's at its right edge). They stand out 14 mm from the front.
// ASSUMED: Legs are 50 mm square or 'bun' feet (a 68 mm foot under a 48 mm neck), 40 mm in from the sides at the corners of the bottom part, as tall as `legHeight`; `bottomHeight` is measured from the floor to the top of the worktop.
// ASSUMED: The corner variant is a triangle in plan, the two back sides running along two walls and the front diagonal across the corner; `width` is the length of each back side, the corner stands at the back (+y) and left (-x) of the model, the diagonal front faces towards front right. The two pointed ends of the diagonal are broken off square with the walls by `endCut` (30 mm), so the width and depth stay as given. The bottom depth is the distance from the corner to the diagonal front (about width / sqrt 2). Its top part has the same shape cut by a front parallel to the diagonal.
// UNSURE: Cornices, plate rails, carved decoration and scalloped edges of a real hutch are left out.

export const meta = {
  id: 'display-cabinet',
  name: 'Display cabinet',
  summary: 'A display cabinet (vitrinskåp): glass-door top part on a cupboard with legs, straight or for a corner.',
  description:
    'A display cabinet with legs, a bottom part (closed doors and drawers under a worktop) and a top part (glass doors, shelves) that is never deeper than the bottom part, facing -y. The corner variant has the doors on a diagonal front. Assumed: the bottom part is a solid block, the top part a hollow case with shelves; 25 mm worktop, 20 mm top board, 18 mm sides, shelves and back; fronts 20 mm and glass doors 16 mm thick, recessed under the worktop; drawers one row above the doors; round knobs; legs 50 mm square or bun feet; the corner variant is a triangle in plan with its corner at the back left; cornices and carved details are left out.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['straight', 'corner'], labels: { straight: 'Straight', corner: 'Corner (diagonal front)' }, default: 'straight' },
    { key: 'width', label: 'Width', unit: 'mm', default: 1500, min: 700, max: 2400, step: 10, hint: 'The corner variant: the length of each back side.' },
    { key: 'height', label: 'Height', unit: 'mm', default: 1900, min: 1500, max: 2400, step: 10 },
    { key: 'depth', label: 'Depth of the bottom part', unit: 'mm', default: 500, min: 300, max: 650, step: 10, appliesTo: ['straight'] },
    { key: 'topDepth', label: 'Depth of the top part', unit: 'mm', default: 330, min: 200, max: 650, step: 10, hint: 'Never deeper than the bottom part: a larger value is kept at the bottom part\'s depth.' },
    { key: 'endCut', label: 'Broken-off ends', unit: 'mm', default: 30, min: 0, max: 100, step: 5, appliesTo: ['corner'], hint: 'The two pointed ends of the diagonal front are cut off square with the walls by this much.' },
    { key: 'bottomHeight', label: 'Height of the bottom part', unit: 'mm', default: 900, min: 700, max: 1100, step: 10, hint: 'From the floor to the top of the worktop, legs included.' },
    { key: 'legHeight', label: 'Leg height', unit: 'mm', default: 100, min: 30, max: 250, step: 5 },
    { key: 'legStyle', label: 'Legs', type: 'enum', options: ['square', 'bun'], labels: { square: 'Square', bun: 'Bun feet' }, default: 'bun' },
    { key: 'doors', label: 'Bottom doors', type: 'integer', default: 3, min: 1, max: 4 },
    { key: 'drawers', label: 'Drawers', type: 'integer', default: 3, min: 0, max: 4 },
    { key: 'glassDoors', label: 'Glass doors on the top part', type: 'boolean', default: true },
    { key: 'topDoors', label: 'Top doors', type: 'integer', default: 2, min: 1, max: 4 },
    { key: 'muntins', label: 'Muntins in the glass', type: 'boolean', default: true },
    { key: 'shelves', label: 'Shelves in the top part', type: 'integer', default: 2, min: 0, max: 5 },
    { key: 'material', label: 'Material (whole cabinet)', type: 'material', default: 'pine' },
  ],
  variantDefaults: { corner: { width: 800, height: 1900, topDepth: 330, doors: 1, drawers: 0, topDoors: 1, shelves: 3 } },
  parts: [
    { key: 'body', label: 'Cabinet' },
    { key: 'legs', label: 'Legs' },
    { key: 'doors', label: 'Doors and drawers' },
    { key: 'glass', label: 'Glass', defaultMaterial: 'glass', needs: 'glassDoors' },
    { key: 'handles', label: 'Knobs', defaultMaterial: 'metal' },
  ],
  sizeParams: { x: 'width', y: { default: 'depth', corner: 'width' }, z: 'height' },
  placement: { mount: 'floor' },
};

const WALL = 18, TOP = 20, WORKTOP = 25, FRONT_IN = 14, GAP = 4;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const norm = a => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
const union = list => (list.length ? (list.length === 1 ? list[0] : booleans.union(...list)) : geometries.geom3.create());

/** The part of a convex polygon where dot(p - o, n) >= 0 (Sutherland-Hodgman, one half-plane). */
function clip(poly, o, n) {
  const out = [];
  poly.forEach((cur, i) => {
    const nxt = poly[(i + 1) % poly.length], fc = dot(sub(cur, o), n), fn = dot(sub(nxt, o), n);
    if (fc >= -1e-9) out.push(cur);
    if ((fc >= -1e-9) !== (fn >= -1e-9)) { const t = fc / (fc - fn); out.push(add(cur, mul(sub(nxt, cur), t))); }
  });
  return out.filter((q, i) => i === 0 || Math.hypot(q[0] - out[i - 1][0], q[1] - out[i - 1][1]) > 1e-6);
}

const prism = (poly, z0, z1) => transforms.translate([0, 0, z0], extrusions.extrudeLinear({ height: z1 - z0 }, geometries.geom2.fromPoints(poly)));

export function build(p) {
  const corner = p.variant === 'corner', W = p.width, H = p.height;
  // the bottom part's footprint, counter-clockwise, its front edge first; n is the way into the cabinet from the front
  // the corner variant is a right triangle with its two pointed ends broken off square with the walls by `endCut`, so the model keeps its
  // width and depth: five corners, the diagonal front first
  const c = p.endCut;
  const pb = corner
    ? (c > 0.5 ? [[-W / 2 + c, -W / 2], [W / 2, W / 2 - c], [W / 2, W / 2], [-W / 2, W / 2], [-W / 2, -W / 2]] : [[-W / 2, -W / 2], [W / 2, W / 2], [-W / 2, W / 2]])
    : [[-W / 2, -p.depth / 2], [W / 2, -p.depth / 2], [W / 2, p.depth / 2], [-W / 2, p.depth / 2]];
  const dir = norm(sub(pb[1], pb[0])), n = [-dir[1], dir[0]], ang = Math.atan2(dir[1], dir[0]), F0 = pb[0];
  const depthB = Math.max(...pb.map(v => dot(sub(v, F0), n)));
  const topD = Math.min(p.topDepth, depthB);
  const legH = p.legHeight, bH = p.bottomHeight;
  if (H - bH < 400) throw new Error(`the top part is only ${H - bH} mm high: raise the height or lower the bottom part (at least 400 mm)`);

  // local frame of a front edge: x along the front, y into the cabinet, z up; `at` is a point on the front line
  const loc = (at, g) => transforms.translate([at[0], at[1], 0], transforms.rotateZ(ang, g));
  const lbox = (at, s0, s1, t0, t1, z0, z1) => loc(at, primitives.cuboid({ size: [s1 - s0, t1 - t0, z1 - z0], center: [(s0 + s1) / 2, (t0 + t1) / 2, (z0 + z1) / 2] }));
  const knob = (at, s, t0, t1, z) => loc(at, transforms.translate([s, (t0 + t1) / 2, z], transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: 15, height: t1 - t0, center: [0, 0, 0], segments: 14 }))));

  const body = [], doors = [], glass = [], handles = [], legs = [];

  // ---- legs: at every corner of the bottom part, 60 mm in
  const centre = [pb.reduce((a, v) => a + v[0], 0) / pb.length, pb.reduce((a, v) => a + v[1], 0) / pb.length];
  for (const v of corner ? (c > 0.5 ? [pb[3], pb[1], pb[0]] : [pb[2], pb[1], pb[0]]) : pb) {
    // moved toward the middle until the foot is at least 40 mm from every side (a foot is 68 mm across at most)
    const clearance = c => Math.min(...pb.map((a, i) => { const b = pb[(i + 1) % pb.length], d = norm(sub(b, a)); return dot(sub(c, a), [-d[1], d[0]]); }));
    let lc = v;
    for (let k = 0; k <= 1 && clearance(lc) < 40; k += 0.01) lc = add(v, mul(sub(centre, v), k));
    legs.push(p.legStyle === 'bun'
      ? union([
        primitives.cylinder({ radius: 34, height: legH * 0.55, center: [lc[0], lc[1], legH * 0.275], segments: 20 }),
        primitives.cylinder({ radius: 24, height: legH * 0.5 + 5, center: [lc[0], lc[1], legH * 0.5 + (legH * 0.5 + 5) / 2 - 2.5], segments: 16 }),
      ])
      : primitives.cuboid({ size: [50, 50, legH + 5], center: [lc[0], lc[1], (legH + 5) / 2] }));
  }

  // ---- bottom part: a block behind the fronts, the worktop over all of it
  const blockPoly = clip(pb, add(F0, mul(n, FRONT_IN + 15)), n);
  body.push(prism(blockPoly, legH - 5, bH - WORKTOP + 5), prism(pb, bH - WORKTOP, bH));
  const Lf = Math.hypot(pb[1][0] - pb[0][0], pb[1][1] - pb[0][1]);
  const zf0 = legH + 12, zf1 = bH - WORKTOP - 12;
  const dh = p.drawers > 0 ? (p.doors > 0 ? Math.min(140, 0.3 * (zf1 - zf0)) : zf1 - zf0) : 0;
  const EDGE = corner ? 44 : 12;                        // on the diagonal the sides run away at 45 degrees: fronts keep clear of them
  const rowOf = (count, z0, z1, isDoor) => {
    const wd = (Lf - 2 * EDGE - (count - 1) * GAP) / count;
    if (!(wd > 60)) throw new Error('the fronts would be narrower than 60 mm: use fewer doors or drawers');
    for (let i = 0; i < count; i++) {
      const s0 = EDGE + i * (wd + GAP), s1 = s0 + wd;
      doors.push(lbox(F0, s0, s1, FRONT_IN, FRONT_IN + 20, z0, z1));
      const sk = count === 1 ? s1 - 40 : (i < count / 2 ? s1 - 40 : s0 + 40);        // a door's knob at the edge nearest the middle
      handles.push(knob(F0, isDoor ? sk : (s0 + s1) / 2, 0, FRONT_IN + 6, isDoor ? z1 - 70 : (z0 + z1) / 2));
    }
  };
  rowOf(p.doors, zf0, p.drawers > 0 ? zf1 - dh - GAP : zf1, true);
  if (p.drawers > 0) rowOf(p.drawers, zf1 - dh, zf1, false);

  // ---- top part: a hollow case on the worktop, never deeper than the bottom part
  const shift = depthB - topD, Ft = add(F0, mul(n, shift));
  let pt = clip(pb, Ft, n);
  // a shallower top part has pointed ends where its front meets the sides (the corner variant): break them off like the bottom part's
  if (c > 0.5) {
    for (const v of [...pt]) {
      const i = pt.indexOf(v), a0 = pt[(i + pt.length - 1) % pt.length], b0 = pt[(i + 1) % pt.length];
      const onFront = q => Math.abs(dot(sub(q, Ft), n)) < 1e-6;
      if (!onFront(v)) continue;
      const wall = onFront(a0) ? b0 : a0, other = onFront(a0) ? a0 : b0;
      const u = norm(sub(wall, v)), w = norm(sub(other, v));
      if (Math.acos(Math.max(-1, Math.min(1, dot(u, w)))) < 1.2) pt = clip(pt, add(v, mul(u, c)), u);     // a tip sharper than 70 degrees
    }
  }
  const zt0 = bH, zt1 = H;
  // the inside: every edge but the front moved in by the wall thickness
  let inner = pt;
  pt.forEach((a, i) => {
    const b = pt[(i + 1) % pt.length], d = norm(sub(b, a));
    const onFront = Math.abs(dot(sub(a, Ft), n)) < 1e-6 && Math.abs(dot(sub(b, Ft), n)) < 1e-6;
    if (!onFront) inner = clip(inner, add(a, mul([-d[1], d[0]], WALL)), [-d[1], d[0]]);
  });
  body.push(booleans.subtract(prism(pt, zt0 - 5, zt1), prism(inner, zt0, zt1 - TOP)));
  // where the opening of the case is along the front
  const fr = inner.filter(v => Math.abs(dot(sub(v, Ft), n)) < 1e-6).map(v => dot(sub(v, Ft), dir)).sort((a, b) => a - b);
  const sa = fr[0], sb = fr[fr.length - 1];
  // shelves (inside the case, behind the doors)
  const shelfPoly = clip(inner, add(Ft, mul(n, 30)), n);
  for (let i = 1; i <= p.shelves; i++) {
    const z = zt0 + (i * (zt1 - TOP - zt0)) / (p.shelves + 1);
    body.push(prism(shelfPoly, z - WALL / 2, z + WALL / 2));
  }
  // glass doors across the opening
  if (p.glassDoors) {
    const count = p.topDoors, wd = (sb - sa - 2 - (count - 1) * GAP) / count, z0 = zt0 + 4, z1 = zt1 - TOP - 4;
    if (!(wd > 100)) throw new Error('the glass doors would be narrower than 100 mm: use fewer doors');
    const BAR = 38;
    for (let i = 0; i < count; i++) {
      const s0 = sa + 1 + i * (wd + GAP), s1 = s0 + wd;
      doors.push(
        lbox(Ft, s0, s1, 6, 22, z0, z0 + BAR), lbox(Ft, s0, s1, 6, 22, z1 - BAR, z1),
        lbox(Ft, s0, s0 + BAR, 6, 22, z0, z1), lbox(Ft, s1 - BAR, s1, 6, 22, z0, z1),
      );
      glass.push(lbox(Ft, s0 + BAR - 5, s1 - BAR + 5, 14, 19, z0 + BAR - 5, z1 - BAR + 5));
      if (p.muntins) {
        if (wd > 260) doors.push(lbox(Ft, (s0 + s1) / 2 - 8, (s0 + s1) / 2 + 8, 10, 20, z0 + BAR - 5, z1 - BAR + 5));
        doors.push(lbox(Ft, s0 + BAR - 5, s1 - BAR + 5, 10, 20, (z0 + z1) / 2 - 8, (z0 + z1) / 2 + 8));
      }
      const sk = count === 1 ? s1 - BAR / 2 : (i < count / 2 ? s1 - BAR / 2 : s0 + BAR / 2);
      handles.push(knob(Ft, sk, 0, 14, (z0 + z1) / 2));
    }
  }

  return { body: union(body), legs: union(legs), doors: union(doors), glass: p.glassDoors ? union(glass) : geometries.geom3.create(), handles: union(handles) };
}

export function size(p) {
  return p.variant === 'corner' ? [p.width, p.width, p.height] : [p.width, p.depth, p.height];
}
