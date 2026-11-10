import { primitives, booleans, transforms } from '../lib/jscad.js';

// ASSUMED: A klotlampa (globe lamp) is a porcelain socket with an opal glass globe screwed into it, nothing else: no arm, no
//          plate; on a wall the socket's axis runs out from the wall, in the ceiling it hangs straight down (storage rooms,
//          garages, cellars; BBV28 Jordkällare).
// ASSUMED: The socket is a cone, as wide as baseDiameter at the wall or ceiling (at most the globe's diameter) and 80% of it at
//          the globe, socketDepth long.
// ASSUMED: The globe is a sphere of globeDiameter, sunk 10 mm into the socket (its neck sits in the socket's thread).
// ASSUMED: The globe is opal white (#fbf6ee) and the socket ceramic unless other materials are chosen.
// ASSUMED: lightHeight 0 is the globe's middle; other values are kept 10 mm inside the globe.
// ASSUMED: Round parts use 32 segments.

const SINK = 10;         // the globe's neck in the socket, mm
const SEGMENTS = 32;

export const meta = {
  id: 'globe-lamp',
  name: 'Globe lamp',
  summary: 'A klotlampa: an opal glass globe in a porcelain socket, on a wall or in the ceiling.',
  description:
    'A globe lamp (klotlampa) for storage rooms, cellars and garages: an opal glass globe screwed into a porcelain socket, mounted on a wall (the socket out from the wall, the globe in front of it) or in the ceiling (hanging straight down). Assumed: the socket is a cone baseDiameter wide at the mounting surface (at most the globe diameter) and 80% of that at the globe, socketDepth long; the globe is a sphere sunk 10 mm into the socket; the globe is opal white (#fbf6ee) and the socket ceramic unless other materials are chosen; lightHeight 0 is the globe\'s middle and other values are kept 10 mm inside the globe; round parts use 32 segments.',
  params: [
    {
      key: 'variant',
      label: 'Mounted',
      type: 'enum',
      options: ['wall', 'ceiling'],
      labels: { wall: 'On the wall', ceiling: 'In the ceiling' },
      default: 'wall',
    },
    { key: 'globeDiameter', label: 'Globe diameter', unit: 'mm', default: 180, min: 100, max: 350, step: 10 },
    { key: 'baseDiameter', label: 'Socket diameter', unit: 'mm', default: 110, min: 60, max: 200, step: 5,
      hint: 'At the wall or ceiling; the socket narrows to 80% of it at the globe, and is never wider than the globe.' },
    { key: 'socketDepth', label: 'Socket depth', unit: 'mm', default: 60, min: 30, max: 150, step: 5,
      hint: 'How far the socket stands out from the wall or down from the ceiling.' },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'ceramic' },
    {
      key: 'lightHeight', label: 'Light source height', unit: 'mm', default: 0, min: 0, max: 500, step: 1,
      hint: 'Height above the model bottom. 0 = the middle of the globe; other values are kept inside the globe.',
    },
  ],
  parts: [
    { key: 'base', label: 'Socket', defaultMaterial: 'ceramic' },
    { key: 'shade', label: 'Globe', defaultMaterial: '#fbf6ee', glows: true },
  ],
  sizeParams: { x: 'globeDiameter', y: { default: null, ceiling: 'globeDiameter' }, z: { default: 'globeDiameter', ceiling: null } },

  placement: { mount: 'wall', z: 1800, hosts: ['wall'], variants: { ceiling: { mount: 'ceiling', hosts: ['room', 'head'] } } },
};

/** The resolved shape: the overall size and where the globe's middle is, in the model's axes (centred, front at −y, feet at z 0). */
function resolve(p = {}) {
  const variant = p.variant ?? 'wall';
  if (!meta.params[0].options.includes(variant)) throw new Error('Unknown globe-lamp variant; choose wall or ceiling.');
  // the socket is never wider than the globe (a globe lamp is as wide as its globe)
  const g = p.globeDiameter ?? 180, b = Math.min(p.baseDiameter ?? 110, g), d = p.socketDepth ?? 60;
  const reach = d + g - SINK;                       // from the mounting surface to the far side of the globe
  const r = g / 2;
  // wall: x across, y from the wall (+y) out to the globe's front (−y), z the globe's height
  // ceiling: x and y the globe's width, z from the globe's bottom up to the ceiling
  const size = variant === 'wall' ? [g, reach, g] : [g, g, reach];
  const centre = variant === 'wall' ? [0, reach / 2 - d + SINK - r, r] : [0, 0, r];
  const wanted = p.lightHeight > 0 ? p.lightHeight : centre[2];
  const lightZ = Math.max(centre[2] - r + 10, Math.min(centre[2] + r - 10, wanted));
  return { variant, g, b, d, r, reach, size, centre, lightZ };
}

export function build(p) {
  const q = resolve(p);
  const cone = primitives.cylinderElliptic({
    height: q.d, startRadius: [q.b / 2, q.b / 2], endRadius: [0.4 * q.b, 0.4 * q.b], segments: SEGMENTS,
  });                                               // along z: wide end (the mounting surface) at −d/2
  const globe = primitives.sphere({ radius: q.r, segments: SEGMENTS });
  if (q.variant === 'wall') {
    // the socket's axis along y: its wide end on the wall at y = reach/2, the globe in front of it
    const back = q.reach / 2;
    const base = transforms.translate([0, back - q.d / 2, q.r], transforms.rotateX(Math.PI / 2, cone));
    return { base, shade: transforms.translate(q.centre, globe) };
  }
  // ceiling: the wide end against the ceiling at z = reach, the globe hanging below
  const base = transforms.translate([0, 0, q.reach - q.d / 2], transforms.mirrorZ(cone));
  return { base, shade: transforms.translate(q.centre, globe) };
}

/** The overall size [x, y, z] in mm. */
export function size(p) {
  return resolve(p).size;
}

/** Where the light is (AGENT_INSTRUCTIONS §3.3): the globe's middle, at the resolved light height. */
export function lightPoint(p = {}) {
  const q = resolve(p);
  return [0, Math.round(q.centre[1] * 10) / 10, q.lightZ];
}
