import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width and depth are the overall tabletop dimensions; height includes the top (clear size convention).
// ASSUMED: Tops are 25 mm thick (realistic timber construction).
// ASSUMED: Unequal round-pedestal dimensions form an oval (both dimensions remain effective).
// ASSUMED: Pedestal feet have 80% of the top radii and are 25 mm high (stable inset footprint).
// ASSUMED: Pedestal columns have a 45 mm radius (substantial central support).
// ASSUMED: Square tables have four 35 mm square legs inset 20 mm from the top edges (simple timber support).
// ASSUMED: Square drawer housings are inset 50 mm from each top edge (5 mm overlap with the legs).
// ASSUMED: Pedestal drawer housings are rectangular, at 60% of the top width and depth (fit within the oval).
// ASSUMED: Nightstand cabinets are inset 10 mm from every top edge (small top overhang).
// ASSUMED: Nightstand plinths are 40 mm high and inset 20 mm from cabinet edges; cabinets start at 35 mm (5 mm plinth overlap).
// ASSUMED: Cabinet walls, bottoms, shelves and drawer fronts are 18 mm thick (typical cabinetry).
// ASSUMED: Drawer fronts are 120 mm high with 3 mm gaps, arranged from the top down (compact storage).
// ASSUMED: Drawer fronts overlap side walls by 5 mm; the lowest front overlaps its supporting shelf by 5 mm (connected geometry).
// ASSUMED: Recessed pulls are 80 mm wide, 12 mm high and 6 mm deep, 18 mm below each front's top (integrated handles).
// ASSUMED: Nightstands retain an open lower compartment; zero drawers produces an open cabinet (usable drawer-free variant).
// ASSUMED: Drawers are shown closed using fronts and a shared housing, without runners or internal trays (simplified solid model).
// UNSURE: Drawers on a round pedestal are not described; a compact housing is supported above the central column.
// UNSURE: Nightstand lower storage is unspecified; an open compartment is used rather than adding a door.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'side-table',
  name: 'Side table',
  summary: 'A round, oval or square side table, or a nightstand.',
  description:
    'A round or oval pedestal table, a four-legged square table, or a nightstand with optional closed drawers facing -y. Assumed: width and depth are overall top dimensions and height includes the top; tops 25 mm thick; unequal round dimensions form an oval; pedestal foot radii 80% of top radii and foot height 25 mm; column radius 45 mm; square tables have four 35 mm square legs inset 20 mm; square drawer housings inset 50 mm; pedestal drawer housings 60% of top width and depth; nightstand cabinet inset 10 mm; nightstand plinth 40 mm high and inset 20 mm from cabinet edges, with cabinet starting at 35 mm; walls, bottoms, shelves and drawer fronts 18 mm thick; drawer fronts 120 mm high with 3 mm gaps, arranged top-down; front-to-wall and lowest-front-to-shelf overlaps 5 mm; recessed pulls 80 by 12 by 6 mm, 18 mm below each front top; nightstands have an open lower compartment and are fully open-fronted with zero drawers; drawers modelled closed with shared housing and without runners or internal trays.',
  params: [
    {
      key: 'variant',
      labels: { round_pedestal: 'Round pedestal table', square: 'Square table', nightstand: 'Nightstand' },
      label: 'Variant',
      type: 'enum',
      options: ['round_pedestal', 'square', 'nightstand'],
      default: 'round_pedestal',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 450,
      min: 350,
      max: 600,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 450,
      min: 350,
      max: 600,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 550,
      min: 450,
      max: 650,
      step: 10,
    },
    {
      key: 'drawers',
      appliesTo: ['nightstand'],
      label: 'Drawers',
      type: 'integer',
      default: 0,
      min: 0,
      max: 2,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'oak',
    },
  ],
  parts: [
    { key: 'top', label: 'Top' },
    { key: 'base', label: 'Base and drawers' },
  ],
  variantDefaults: {
    nightstand: { width: 450, depth: 400, height: 550, drawers: 1 },
  },
  sizeParams: { x: 'width', y: 'depth', z: 'height' },

  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'round_pedestal';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown side-table variant; choose round_pedestal, square or nightstand.'
    );
  }

  const defaults = meta.variantDefaults[variant] ?? {};
  const q = { variant };

  // Material is deliberately neither read nor copied.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;
    q[key] = p[key] ?? defaults[key] ?? definition.default;

    if (
      definition.unit === 'mm' &&
      (!Number.isFinite(q[key]) ||
        q[key] < definition.min ||
        q[key] > definition.max)
    ) {
      throw new Error(
        `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
      );
    }
  }

  if (!Number.isInteger(q.drawers) || q.drawers < 0 || q.drawers > 2) {
    throw new Error('Drawer count must be an integer from 0 to 2.');
  }

  return q;
}

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

export function build(p = {}) {
  const q = resolve(p);
  const overlap = 5;
  const topThickness = 25;
  const wall = 18;
  const drawerHeight = 120;
  const drawerGap = 3;
  const underside = q.height - topThickness;
  const baseParts = [];

  let top;
  if (q.variant === 'round_pedestal') {
    top = primitives.cylinderElliptic({
      height: topThickness,
      startRadius: [q.width / 2, q.depth / 2],
      endRadius: [q.width / 2, q.depth / 2],
      center: [0, 0, q.height - topThickness / 2],
      segments: 32,
    });
  } else {
    top = primitives.cuboid({
      size: [q.width, q.depth, topThickness],
      center: [0, 0, q.height - topThickness / 2],
    });
  }

  const firstFrontTop = underside + overlap;
  const lowestFrontBottom =
    firstFrontTop -
    (q.drawers - 1) * (drawerHeight + drawerGap) -
    drawerHeight;
  const drawerShelfTop = lowestFrontBottom + overlap;
  const drawerHousingBottom = drawerShelfTop - wall;

  function cabinet(width, depth, bottom, fullHeight) {
    const x0 = -width / 2;
    const x1 = width / 2;
    const front = -depth / 2;
    const back = depth / 2;
    const topZ = underside + overlap;

    if (
      width <= 2 * wall + 80 ||
      depth <= 2 * wall ||
      bottom < 0 ||
      bottom + wall >= underside
    ) {
      throw new Error(
        `A ${width} mm by ${depth} mm housing from ${bottom} mm to ${topZ} mm cannot fit ${wall} mm walls and an 80 mm pull.`
      );
    }

    // Open front and open top; the separate tabletop closes the top.
    const shell = booleans.subtract(
      box(x0, x1, front, back, bottom, topZ),
      box(
        x0 + wall,
        x1 - wall,
        front - overlap,
        back - wall,
        bottom + wall,
        topZ + overlap
      )
    );
    baseParts.push(shell);

    if (q.drawers === 0) return;

    if (fullHeight) {
      // Shelf under the drawer bank, leaving open storage below.
      if (drawerShelfTop - wall <= bottom + wall) {
        throw new Error(
          `The drawer shelf at ${drawerShelfTop} mm leaves insufficient space above the cabinet bottom at ${bottom} mm.`
        );
      }
      baseParts.push(
        box(
          x0 + wall - overlap,
          x1 - wall + overlap,
          front,
          back - wall + overlap,
          drawerShelfTop - wall,
          drawerShelfTop
        )
      );
    }

    for (let i = 0; i < q.drawers; i += 1) {
      const z1 = firstFrontTop - i * (drawerHeight + drawerGap);
      const z0 = z1 - drawerHeight;
      const panel = box(
        x0 + wall - overlap,
        x1 - wall + overlap,
        front,
        front + wall,
        z0,
        z1
      );
      const recessedPull = box(
        -40,
        40,
        front - overlap,
        front + 6,
        z1 - 18 - 12,
        z1 - 18
      );
      baseParts.push(booleans.subtract(panel, recessedPull));
    }
  }

  if (q.variant === 'round_pedestal') {
    const footHeight = 25;
    baseParts.push(
      primitives.cylinderElliptic({
        height: footHeight,
        startRadius: [0.8 * q.width / 2, 0.8 * q.depth / 2],
        endRadius: [0.8 * q.width / 2, 0.8 * q.depth / 2],
        center: [0, 0, footHeight / 2],
        segments: 32,
      })
    );

    const columnBottom = footHeight - overlap;
    const columnTop =
      q.drawers > 0
        ? drawerHousingBottom + overlap
        : underside + overlap;

    if (columnTop <= columnBottom) {
      throw new Error(
        `The pedestal column cannot fit between ${columnBottom} mm and ${columnTop} mm.`
      );
    }

    baseParts.push(
      primitives.cylinder({
        radius: 45,
        height: columnTop - columnBottom,
        center: [0, 0, (columnBottom + columnTop) / 2],
        segments: 32,
      })
    );

    if (q.drawers > 0) {
      cabinet(0.6 * q.width, 0.6 * q.depth, drawerHousingBottom, false);
    }
  } else if (q.variant === 'square') {
    const legSize = 35;
    const legX = q.width / 2 - 20 - legSize / 2;
    const legY = q.depth / 2 - 20 - legSize / 2;

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        baseParts.push(
          primitives.cuboid({
            size: [legSize, legSize, underside + overlap],
            center: [
              sx * legX,
              sy * legY,
              (underside + overlap) / 2,
            ],
          })
        );
      }
    }

    if (q.drawers > 0) {
      cabinet(q.width - 100, q.depth - 100, drawerHousingBottom, false);
    }
  } else {
    const cabinetWidth = q.width - 20;
    const cabinetDepth = q.depth - 20;
    baseParts.push(
      primitives.cuboid({
        size: [cabinetWidth - 40, cabinetDepth - 40, 40],
        center: [0, 0, 20],
      })
    );
    cabinet(cabinetWidth, cabinetDepth, 35, true);
  }

  return {
    top,
    base: combine(baseParts),
  };
}