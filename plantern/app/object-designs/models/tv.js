import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width, height and depth describe the complete screen panel, including its bezel (consistent panel sizing).
// ASSUMED: The bezel is 12 mm wide at the sides and top and 20 mm high at the bottom (typical flat-screen proportions).
// ASSUMED: The viewing surface is recessed 2 mm behind the bezel front (visible screen boundary without materials).
// ASSUMED: The stand raises the panel bottom 80 mm above the supporting surface (room for the foot and neck).
// ASSUMED: The stand foot is 250 mm deep, 15 mm thick and min(480 mm, 40% of panel width) wide (stable central support).
// ASSUMED: The stand neck is 80 mm wide and min(30 mm, panel depth) deep, centred below the panel (compact support).
// ASSUMED: The neck enters both the foot and the panel by 5 mm (connected joints).
// ASSUMED: Foot and panel share the same x and y centre (centred overall footprint).
// ASSUMED: Rear connections, vents, buttons, cables and wall-mount hardware are omitted (simple TV geometry).
// UNSURE: The quoted screen dimensions are interpreted as the complete panel rather than the illuminated area.
// UNSURE: A wall-mounted TV has no stand geometry or added mounting bracket, following the specified empty stand part.

export const meta = {
  id: 'tv',
  name: 'TV',
  summary: 'A flat-screen television with a tabletop stand or wall-mounted configuration.',
  description:
    'A flat-screen TV facing -y, with an optional central tabletop stand and its rear at +y. Assumed: width, height and depth include the panel bezel; side and top bezels are 12 mm and the bottom bezel 20 mm; the viewing surface is recessed 2 mm; the stand raises the panel bottom 80 mm and has a foot 250 mm deep, 15 mm thick and min(480 mm, 40% of panel width) wide; the centred neck is 80 mm wide and min(30 mm, panel depth) deep, entering the foot and panel by 5 mm; foot and panel share their x/y centre; connections, vents, buttons, cables and wall-mount hardware omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['on_stand', 'wall_mounted'],
      labels: {
        on_stand: 'On stand',
        wall_mounted: 'Wall-mounted',
      },
      default: 'on_stand',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 1230,
      min: 700,
      max: 2000,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 710,
      min: 400,
      max: 1200,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Panel depth',
      unit: 'mm',
      default: 40,
      min: 20,
      max: 100,
      step: 5,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'charcoal',
    },
  ],
  parts: [
    { key: 'screen', label: 'Screen' },
    { key: 'stand', label: 'Stand', appliesTo: ['on_stand'] },
  ],
  placement: {
    mount: 'floor',
    z: 450,
    variants: {
      wall_mounted: { mount: 'wall', z: 900 },
    },
  },
};

function resolve(p) {
  const variant = p.variant ?? 'on_stand';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error('Unknown TV variant; choose on_stand or wall_mounted.');
  }

  const q = { variant };

  // Material is deliberately never read or copied.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;

    const value = p[key] ?? definition.default;
    if (
      !Number.isFinite(value) ||
      value < definition.min ||
      value > definition.max
    ) {
      throw new Error(
        `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
      );
    }
    q[key] = value;
  }

  return q;
}

export function build(p = {}) {
  const q = resolve(p);
  const onStand = q.variant === 'on_stand';
  const panelBottom = onStand ? 80 : 0;
  const front = -q.depth / 2;
  const overlap = 5;

  const panel = primitives.cuboid({
    size: [q.width, q.depth, q.height],
    center: [0, 0, panelBottom + q.height / 2],
  });

  // Cut only the shallow front recess; the remaining solid is the viewing
  // surface, panel housing and bezel in the single prescribed screen part.
  const viewingRecess = primitives.cuboid({
    size: [
      q.width - 24,
      overlap + 2,
      q.height - 32,
    ],
    center: [
      0,
      front + (2 - overlap) / 2,
      panelBottom + 20 + (q.height - 32) / 2,
    ],
  });

  const screen = booleans.subtract(panel, viewingRecess);

  if (!onStand) {
    return {
      screen,
      stand: geometries.geom3.create(),
    };
  }

  const footThickness = 15;
  const foot = primitives.cuboid({
    size: [Math.min(480, 0.4 * q.width), 250, footThickness],
    center: [0, 0, footThickness / 2],
  });

  const neckBottom = footThickness - overlap;
  const neckTop = panelBottom + overlap;
  const neck = primitives.cuboid({
    size: [80, Math.min(30, q.depth), neckTop - neckBottom],
    center: [0, 0, (neckBottom + neckTop) / 2],
  });

  return {
    screen,
    stand: booleans.union(foot, neck),
  };
}

export function size(p = {}) {
  const q = resolve(p);
  const onStand = q.variant === 'on_stand';
  return [
    q.width,
    onStand ? 250 : q.depth,
    q.height + (onStand ? 80 : 0),
  ];
}