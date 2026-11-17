import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: A leafy tree's crown is overlapping spheres: a large one at the crown's middle and four smaller ones above it,
// offset symmetrically, so it reads as a crown rather than a ball; together they span crownDiameter and reach the top.
// ASSUMED: A conifer's crown is three stacked cones, each narrower and higher than the one below, the lowest crownDiameter
// wide at crownBase, the top one ending in a point at the tree's height.
// ASSUMED: The trunk is a cylinder of trunkDiameter from the ground up into the crown (to the crown's middle for a leafy tree,
// to two thirds of the height for a conifer), so it never shows a gap under the crown.
// ASSUMED: Default colours: bark #5a4632, a leafy crown #4f7a3a, a conifer #2f5a3a.
// ASSUMED: Spheres use 16 segments, cones and the trunk 12: a tree is seen from afar, and a yard may have many.
// ASSUMED: A crown base above 80 % of the height is held at 80 %, and a trunk wider than half the crown at half the crown
// (kept in proportion, never an error).
// ASSUMED: A bush is a low mound: a large sphere in the middle and seven smaller ones around it lower down, overlapping, scaled
// to the bush's width and height (from its crown base up), with a short stem hidden inside; default 1.2 m high, 1.5 m wide, #55803f.
// ASSUMED: Heights and widths go down to 200 mm (a small bush, a young tree); the trunk to 20 mm.
// UNSURE: Real crowns are irregular; this is a readable symbol at the tree's real size, not a botanical model.

export const meta = {
  id: 'tree',
  name: 'Tree',
  summary: 'A tree or a bush in the yard: leafy, conifer or a low bush, at its height and width.',
  description:
    'A simple tree or bush for the yard plan and 3D view: a trunk and a crown of the given height and width (a bush\'s crown reaches the ground). Assumed: a leafy crown is a large sphere with four smaller ones above it, a conifer three stacked cones ending in a point; the trunk reaches into the crown; bark #5a4632, leafy crown #4f7a3a, conifer #2f5a3a; 16 segments for spheres and 12 for cones and the trunk; the crown starts at most at 80 % of the height and the trunk is at most half the crown.',
  frontView: [],
  params: [
    { key: 'variant', label: 'Kind', type: 'enum', options: ['leafy', 'conifer', 'bush'], labels: { leafy: 'Leafy tree', conifer: 'Conifer', bush: 'Bush' }, default: 'leafy' },
    { key: 'height', label: 'Height', unit: 'mm', default: 8000, min: 200, max: 40000, step: 50 },
    { key: 'crownDiameter', label: 'Crown width', unit: 'mm', default: 5000, min: 200, max: 25000, step: 50 },
    { key: 'crownBase', label: 'Crown starts at', unit: 'mm', default: 2000, min: 0, max: 30000, step: 100, hint: 'height above the ground of the crown\'s lowest point' },
    { key: 'trunkDiameter', label: 'Trunk', unit: 'mm', default: 300, min: 20, max: 2000, step: 10 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: '#4f7a3a' },
  ],
  parts: [
    { key: 'trunk', label: 'Trunk', defaultMaterial: '#5a4632' },
    { key: 'crown', label: 'Crown' },
  ],
  variantDefaults: {
    conifer: { height: 12000, crownDiameter: 4000, crownBase: 500, trunkDiameter: 350, material: '#2f5a3a' },
    bush: { height: 1200, crownDiameter: 1500, crownBase: 0, trunkDiameter: 60, material: '#55803f' },
  },
  sizeParams: { x: 'crownDiameter', y: 'crownDiameter', z: 'height' },
  placement: { mount: 'floor', hosts: ['room'] },
};

function resolve(p) {
  const variant = p.variant ?? 'leafy';
  if (!meta.params[0].options.includes(variant)) throw new Error('Unknown kind; choose leafy, conifer or bush.');
  const d = meta.variantDefaults[variant] ?? {};
  const q = { variant };
  for (const def of meta.params) {
    if (def.key === 'variant' || def.key === 'material') continue;
    q[def.key] = p[def.key] ?? d[def.key] ?? def.default;
  }
  // kept in proportion instead of refused: the crown starts at most at 80 % of the height, the trunk is at most half the crown
  q.crownBase = Math.min(q.crownBase, q.height * 0.8);
  q.trunkDiameter = Math.min(q.trunkDiameter, q.crownDiameter / 2);
  return q;
}

export function size(p = {}) {
  const q = resolve(p);
  return [q.crownDiameter, q.crownDiameter, q.height];
}

export function build(p = {}) {
  const q = resolve(p), R = q.crownDiameter / 2, H = q.height, B = q.crownBase, span = H - B;
  let crown, trunkTop;
  if (q.variant === 'bush') {
    // a mound: one sphere in the middle and seven lower ones around it, each a little different (fixed, so every bush looks the
    // same for the same options); built at unit size, then scaled to the bush's width and height
    const lumps = [[0, 0.68, 0.62], [52, 0.6, 0.66], [103, 0.7, 0.58], [154, 0.62, 0.64], [206, 0.66, 0.6], [257, 0.58, 0.66], [308, 0.68, 0.6]];
    const parts = [transforms.translate([0, 0, 1], primitives.sphere({ radius: 1, segments: 16 }))];
    for (const [deg, off, r] of lumps) { const a = deg * Math.PI / 180; parts.push(transforms.translate([Math.cos(a) * off, Math.sin(a) * off, r], primitives.sphere({ radius: r, segments: 14 }))); }
    // fitted to its real extents (faceted spheres fall a little short of their radius), centred, standing on the crown base
    const mound = booleans.union(parts), vs = geometries.geom3.toPolygons(mound).flatMap(pl => pl.vertices);
    const lo = [0, 1, 2].map(k => Math.min(...vs.map(v => v[k]))), hi = [0, 1, 2].map(k => Math.max(...vs.map(v => v[k])));
    const sc = [q.crownDiameter / (hi[0] - lo[0]), q.crownDiameter / (hi[1] - lo[1]), span / (hi[2] - lo[2])];
    crown = transforms.translate([-(lo[0] + hi[0]) / 2 * sc[0], -(lo[1] + hi[1]) / 2 * sc[1], B - lo[2] * sc[2]], transforms.scale(sc, mound));
    trunkTop = B + span * 0.4;
  } else if (q.variant === 'conifer') {
    // three cones: each a fraction of the crown, overlapping, the top one ending at H
    const tiers = [[0, 1, 0.55], [0.3, 0.72, 0.5], [0.58, 0.45, 0.42]];
    crown = booleans.union(tiers.map(([at, w, h], i) => {
      const z0 = B + span * at, height = i === 2 ? H - z0 : span * h;
      return transforms.translate([0, 0, z0 + height / 2], primitives.cylinderElliptic({ height, startRadius: [R * w, R * w], endRadius: [0.01, 0.01], segments: 12 }));
    }));
    trunkTop = B + span * 0.66;
  } else {
    // a big sphere at the crown's middle, two smaller ones above it to the sides; scaled so they span the crown exactly
    const r1 = Math.min(R, span / 2), zc = B + r1;
    const r2 = r1 * 0.62, top = H - r2, off = Math.max(0, Math.min(R - r2, r1 * 0.35));
    // the smaller spheres sit symmetrically round the top, so the crown stays centred and as wide one way as the other
    const parts = [transforms.translate([0, 0, zc], primitives.sphere({ radius: r1, segments: 16 }))];
    if (top > zc) for (const [dx, dy] of [[off, 0], [-off, 0], [0, off], [0, -off]]) parts.push(transforms.translate([dx, dy, top], primitives.sphere({ radius: r2, segments: 16 })));
    // stretch it sideways to the crown width when the crown is wider than its height allows
    crown = booleans.union(parts);
    const w = Math.max(r1, off + r2) * 2;
    if (Math.abs(w - q.crownDiameter) > 1) crown = transforms.scale([q.crownDiameter / w, q.crownDiameter / w, 1], crown);
    trunkTop = zc;
  }
  const trunk = transforms.translate([0, 0, trunkTop / 2], primitives.cylinder({ radius: q.trunkDiameter / 2, height: trunkTop, segments: 12 }));
  return { trunk, crown };
}
