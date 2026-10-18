import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Platforms are 25 mm thick discs, `platformSize` across; each is set so that the post passes through it 20 mm from its edge, at changing angles (90 degrees and a half turn apart) round the post.
// ASSUMED: A tension-pole tree has a 150 mm radius, 15 mm thick plate at the floor and one at the ceiling; the platforms' top surfaces run evenly from 350 mm above the floor to 450 mm below the ceiling.
// ASSUMED: A freestanding tree stands on a 25 mm thick round base `baseSize` across; its platforms' top surfaces run evenly from 300 mm to the top, where the highest platform sits on the post, centred (its top surface is at the height).
// ASSUMED: The cave is a 300 mm high hollow box, 70 % of the platform size square (at least 210 mm), with 20 mm walls and a round 170 mm entrance in the front, on the second platform; it is the part `cave` and only exists when the option is on.
// ASSUMED: The post is `postDiameter` across and is the part `post`; real posts are wrapped in sisal, so it defaults to birch (no sisal material in the library).
// ASSUMED: The model is centred on x and y by its extents, so the post is not at the middle when the platforms reach further to one side.
// UNSURE: Real trees have scratching pads, hammocks and hanging toys; they are left out.

export const meta = {
  id: 'cat-tree',
  name: 'Cat tree',
  summary: 'A cat climbing tree: a post with platforms, from floor to ceiling or freestanding.',
  description:
    'A cat tree with a central post and round platforms at different heights. Assumed: platforms are 25 mm discs set round the post at changing angles; a tension-pole tree has a plate at the floor and at the ceiling and its platforms stop 450 mm below the ceiling; a freestanding tree has a round base and its top platform on the post; the optional cave is a hollow box with a round entrance on the second platform; the post defaults to birch for sisal; scratching pads, hammocks and toys are left out.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['tension_pole', 'freestanding'], labels: { tension_pole: 'Floor-to-ceiling tree', freestanding: 'Freestanding tree' }, default: 'tension_pole' },
    { key: 'height', label: 'Height', unit: 'mm', default: 2400, min: 800, max: 3200, step: 10, hint: 'The ceiling height for a floor-to-ceiling tree.' },
    { key: 'platforms', label: 'Platforms', type: 'integer', default: 4, min: 2, max: 6 },
    { key: 'platformSize', label: 'Platform size', unit: 'mm', default: 400, min: 300, max: 550, step: 10, hint: 'The diameter of each platform.' },
    { key: 'postDiameter', label: 'Post diameter', unit: 'mm', default: 90, min: 60, max: 140, step: 5 },
    { key: 'baseSize', label: 'Base size', unit: 'mm', default: 600, min: 400, max: 800, step: 10, appliesTo: ['freestanding'] },
    { key: 'cave', label: 'Cave', type: 'boolean', default: false },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'fabric' },
  ],
  parts: [
    { key: 'post', label: 'Post', defaultMaterial: 'birch' },
    { key: 'platforms', label: 'Platforms' },
    { key: 'base', label: 'Base and ceiling plate' },
    { key: 'cave', label: 'Cave', needs: 'cave' },
  ],
  variantDefaults: { freestanding: { height: 1500 } },
  sizeParams: { z: 'height' },
  placement: { mount: 'floor' },
};

const cyl = (r, z0, z1, x = 0, y = 0, seg = 32) => primitives.cylinder({ radius: r, height: z1 - z0, center: [x, y, (z0 + z1) / 2], segments: seg });
const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

export function build(p) {
  const H = p.height, n = p.platforms, R = p.platformSize / 2, rp = p.postDiameter / 2, T = 25;
  const tension = p.variant === 'tension_pole';
  const e = Math.max(0, Math.min(R * 0.55, R - rp - 20));                  // how far a platform's middle is from the post
  // the top surface of each platform
  const lo = tension ? 350 : 300, hi = tension ? H - 450 : H;
  const tops = Array.from({ length: n }, (_, i) => lo + (i * (hi - lo)) / (n - 1));
  const centres = tops.map((_, i) => {
    if (!tension && i === n - 1) return [0, 0];                              // the top platform sits on the post
    const a = (i * Math.PI) / 2 + (i % 2 ? Math.PI / 4 : 0);
    return [Math.cos(a) * e, Math.sin(a) * e];
  });

  let post, base;
  let discs = null;
  for (const [i, [cx, cy]] of centres.entries()) {
    const d = cyl(R, tops[i] - T, tops[i], cx, cy);
    discs = discs ? booleans.union(discs, d) : d;
  }
  const extents = centres.map(([cx, cy]) => [cx - R, cx + R, cy - R, cy + R]);
  if (tension) {
    post = cyl(rp, 10, H - 10, 0, 0, 24);
    base = booleans.union(cyl(150, 0, 15, 0, 0, 32), cyl(150, H - 15, H, 0, 0, 32));
    extents.push([-150, 150, -150, 150]);
  } else {
    const rb = p.baseSize / 2;
    post = cyl(rp, 20, tops[n - 1] - T + 5, 0, 0, 24);
    base = cyl(rb, 0, 25, 0, 0, 32);
    extents.push([-rb, rb, -rb, rb]);
  }

  let cave = null;                                                           // returned empty when the option is off
  if (p.cave) {
    const s = Math.max(210, p.platformSize * 0.7), [cx, cy] = centres[1], z0 = tops[1] - 5, hh = 300, w = 20;
    const shell = booleans.subtract(box(cx - s / 2, cx + s / 2, cy - s / 2, cy + s / 2, z0, z0 + hh), box(cx - s / 2 + w, cx + s / 2 - w, cy - s / 2 + w, cy + s / 2 - w, z0 + w, z0 + hh - w));
    const door = transforms.translate([cx, cy - s / 2, z0 + 130], transforms.rotateX(Math.PI / 2, cyl(85, -w * 2, w * 2, 0, 0, 24)));
    cave = booleans.subtract(shell, door);
    extents.push([cx - s / 2, cx + s / 2, cy - s / 2, cy + s / 2]);
  }

  // the model is centred on x and y by what it reaches
  const sx = -(Math.min(...extents.map(v => v[0])) + Math.max(...extents.map(v => v[1]))) / 2;
  const sy = -(Math.min(...extents.map(v => v[2])) + Math.max(...extents.map(v => v[3]))) / 2;
  const move = g => (g ? transforms.translate([sx, sy, 0], g) : g);
  return { post: move(post), platforms: move(discs), base: move(base), cave: cave ? move(cave) : geometries.geom3.create() };
}
