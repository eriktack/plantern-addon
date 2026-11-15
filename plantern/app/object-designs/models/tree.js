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
// UNSURE: Real crowns are irregular; this is a readable symbol at the tree's real size, not a botanical model.

export const meta = {
  id: 'tree',
  name: 'Tree',
  summary: 'A tree in the yard: a leafy tree or a conifer, at its height and crown width.',
  description:
    'A simple tree for the yard plan and 3D view: a trunk and a crown of the given height and width. Assumed: a leafy crown is a large sphere with four smaller ones above it, a conifer three stacked cones ending in a point; the trunk reaches into the crown; bark #5a4632, leafy crown #4f7a3a, conifer #2f5a3a; 16 segments for spheres and 12 for cones and the trunk; the crown starts at most at 80 % of the height and the trunk is at most half the crown.',
  frontView: [],
  params: [
    { key: 'variant', label: 'Kind', type: 'enum', options: ['leafy', 'conifer'], labels: { leafy: 'Leafy tree', conifer: 'Conifer' }, default: 'leafy' },
    { key: 'height', label: 'Height', unit: 'mm', default: 8000, min: 1000, max: 40000, step: 100 },
    { key: 'crownDiameter', label: 'Crown width', unit: 'mm', default: 5000, min: 500, max: 25000, step: 100 },
    { key: 'crownBase', label: 'Crown starts at', unit: 'mm', default: 2000, min: 0, max: 30000, step: 100, hint: 'height above the ground of the crown\'s lowest point' },
    { key: 'trunkDiameter', label: 'Trunk', unit: 'mm', default: 300, min: 50, max: 2000, step: 10 },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: '#4f7a3a' },
  ],
  parts: [
    { key: 'trunk', label: 'Trunk', defaultMaterial: '#5a4632' },
    { key: 'crown', label: 'Crown' },
  ],
  variantDefaults: {
    conifer: { height: 12000, crownDiameter: 4000, crownBase: 500, trunkDiameter: 350, material: '#2f5a3a' },
  },
  sizeParams: { x: 'crownDiameter', y: 'crownDiameter', z: 'height' },
  placement: { mount: 'floor', hosts: ['room'] },
};

function resolve(p) {
  const variant = p.variant ?? 'leafy';
  if (!meta.params[0].options.includes(variant)) throw new Error('Unknown tree kind; choose leafy or conifer.');
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
  if (q.variant === 'conifer') {
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
