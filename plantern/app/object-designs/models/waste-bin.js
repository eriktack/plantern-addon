import { primitives, booleans, geometries } from '../lib/jscad.js';

// ASSUMED: width and depth are the overall footprint; a round bin is `width` across and as deep as it is wide. A pedal bin is `width` across and its foot lever sticks out 60 mm in front of it, so it is `width` + 60 mm deep overall (the bin itself is round, set back by the lever).
// ASSUMED: the walls of an open bin are 3 mm thick with a 3 mm floor; a bin with a lid is drawn solid under its lid (the inside is never seen).
// ASSUMED: a lid is 20 mm thick and sits on top of the body, inside `height` (the bin is exactly `height` tall with or without it).
// ASSUMED: a pedal bin has a 90 mm wide foot lever at the front, 20 mm high, 20 mm off the floor, reaching 60 mm out from the front of the bin.
// UNSURE: swing lids, handles and inner buckets are omitted.

export const meta = {
  id: 'waste-bin',
  name: 'Waste bin',
  summary: 'A small round, rectangular or pedal waste bin.',
  description:
    'A waste bin standing on the floor, front at -y. Assumed: an open bin has 3 mm walls and a 3 mm floor; a bin with a lid is solid under it; a lid is 20 mm thick and inside the height; a round bin is as deep as it is wide; a pedal bin has a 90 mm foot lever reaching 60 mm out from its front, which makes it 60 mm deeper than it is wide; swing lids, handles and inner buckets are omitted.',
  params: [
    { key: 'variant', label: 'Variant', type: 'enum', options: ['round', 'rectangular', 'pedal'], labels: { round: 'Round bin', rectangular: 'Rectangular bin', pedal: 'Pedal bin' }, default: 'round' },
    { key: 'width', label: 'Width (diameter if round)', unit: 'mm', default: 260, min: 150, max: 600, step: 10 },
    { key: 'depth', label: 'Depth', unit: 'mm', default: 250, min: 150, max: 600, step: 10, appliesTo: ['rectangular'] },
    { key: 'height', label: 'Height', unit: 'mm', default: 300, min: 150, max: 900, step: 10 },
    { key: 'lid', label: 'Lid', type: 'boolean', default: false },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'white-paint' },
  ],
  parts: [
    { key: 'body', label: 'Bin' },
    { key: 'lid', label: 'Lid', needs: 'lid' },
    { key: 'pedal', label: 'Foot pedal', appliesTo: ['pedal'], defaultMaterial: 'black-metal' },
  ],
  variantDefaults: {
    round: { width: 260, height: 300 },
    rectangular: { width: 300, depth: 250, height: 350 },
    pedal: { width: 300, height: 600, lid: true },
  },
  sizeParams: { x: 'width', y: { default: 'depth', round: 'width', pedal: null }, z: 'height' },
  placement: { mount: 'floor' },
};

const WALL = 3, LID = 20, OVERLAP = 5, PEDAL = 60;   // the lever reaches PEDAL mm out from the front of a pedal bin

const box = (x0, x1, y0, y1, z0, z1) => primitives.cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
const vcyl = (r, z0, z1, y = 0, seg = 32) => primitives.cylinder({ radius: r, height: z1 - z0, center: [0, y, (z0 + z1) / 2], segments: seg });

export function build(p) {
  const H = p.height, W = p.width;
  const round = p.variant !== 'rectangular';
  const D = round ? W : p.depth;
  const pedalBin = p.variant === 'pedal';
  const yc = pedalBin ? PEDAL / 2 : 0;           // a pedal bin is set back, so that bin and lever together are centred
  const bodyTop = p.lid ? H - LID + OVERLAP : H;   // under a lid the body runs 5 mm into it

  let body;
  if (round) {
    const r = W / 2;
    body = p.lid ? vcyl(r, 0, bodyTop, yc) : booleans.subtract(vcyl(r, 0, bodyTop, yc), vcyl(r - WALL, WALL, bodyTop + OVERLAP, yc));
  } else {
    const solid = box(-W / 2, W / 2, -D / 2, D / 2, 0, bodyTop);
    body = p.lid ? solid : booleans.subtract(solid, box(-W / 2 + WALL, W / 2 - WALL, -D / 2 + WALL, D / 2 - WALL, WALL, bodyTop + OVERLAP));
  }

  const lid = p.lid
    ? (round ? vcyl(W / 2, H - LID, H, yc) : box(-W / 2, W / 2, -D / 2, D / 2, H - LID, H))
    : geometries.geom3.create();
  const pedal = pedalBin
    ? box(-45, 45, yc - W / 2 - PEDAL, yc - W / 2 + 10, 20, 40)   // out from the front of the bin, 10 mm into it
    : geometries.geom3.create();
  return { body, lid, pedal };
}

export function size(p) {
  return [p.width, p.variant === 'rectangular' ? p.depth : p.variant === 'pedal' ? p.width + PEDAL : p.width, p.height];
}
