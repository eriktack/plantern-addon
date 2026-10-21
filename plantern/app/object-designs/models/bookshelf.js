import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: width is the overall width and the bays adapt to it: the clear bay width is the width minus one support more than there are bays, divided by the number of bays (the width is exact, as typed).
// ASSUMED: A bay is at least 150 mm clear; when the width is too narrow for the columns asked for, fewer columns are used (the width wins).
// ASSUMED: height is the overall height of the unit (feet included; for the String variant the top of its wire panels). rows counts clear storage openings and rows + 1 horizontal boards include bottom and top; the clear opening of each row is worked out from the height: (height - feet - (rows + 1) boards) / rows, so no shelf spacing is typed (decision 276).
// ASSUMED: feetHeight (open and glass_door only; 0 = none, the default) lifts the whole unit on four 40 mm square feet that high, 15 mm in from each corner; height includes them. The feet are part of the frame (one material).
// ASSUMED: Cabinet sides, dividers and shelves are 18 mm thick; optional backs are 12 mm thick (timber cabinetry).
// ASSUMED: Shelves and back panels enter their supporting panels by 5 mm (connected joints).
// ASSUMED: The glass variants (glass_door, corner_glass_door) have closed, unframed 6 mm panes overlapping opening edges by 5 mm (simple glazed fronts); the other variants have no glass.
// ASSUMED: Glass panes sit 2 mm behind the front of the sides and dividers, and the shelves behind glass begin 4 mm behind the front plane, so the pane overlaps them by 4 mm and no two parts share a plane (no z-fighting in 3D).
// ASSUMED: Glass is its own part with the default material glass; the rest of the bookshelf follows the whole-object material.
// ASSUMED: Straight cabinets have one full-height glass leaf per column, exposing 8 mm of each intermediate divider (consistent door layout).
// ASSUMED: Corner units have a front run (width wide, frontColumns bays) and a perpendicular side run (sideColumns bays). sideWidth is the overall extent of the L along the side, from the back of the front run to the end of the side run, so the side run reaches sideWidth minus depth beyond the front of the front run (recognisable L-shaped storage).
// ASSUMED: The side run extends forward from the right end; its back faces +x and its accessible front faces -x (inside-corner arrangement).
// ASSUMED: The side bays share the length beyond the front of the front run equally, each with an 18 mm board at its far end (clear side bays); that length must be at least 150 mm.
// ASSUMED: The corner junction has no transverse closing panel; shelf runs overlap by 5 mm (accessible continuous corner).
// ASSUMED: Corner units require at least 100 mm of exposed front beside the side run (usable L-shaped footprint).
// ASSUMED: Corner front glass leaves divide the exposed width evenly, each no wider than the clear bay width, with 3 mm gaps (avoid narrow clipped leaves).
// ASSUMED: Corner side glazing has one full-height leaf per side bay (consistent access).
// ASSUMED: Utility uprights are 35 mm square, with front and rear posts at each bay boundary (open modular shelving).
// ASSUMED: Utility shelves enter the uprights by 5 mm and span the full depth; utility shelving has neither back panels nor doors (open storage construction).
// ASSUMED: The String variant is String-style shelving standing on the floor: boards between wire ladder panels at every bay boundary, 10 mm wires with centre lines 5 mm inside the footprint, boards ending at the wire centre lines, panels from z = 0 to 80 mm above the top board, a rung through the middle of every board, one halfway to the next board and a last rung 10 mm below the panel top (same construction as the String wall shelf).
// ASSUMED: String boards are 18 mm thick like the other variants and have no back panel or doors; the wires are their own part so they can have another material.
// ASSUMED: Hinges, handles, fasteners, adjustable shelf holes and decorative plinths are omitted (simplified solid geometry).
// UNSURE: Glass thickness and door arrangement are unspecified; unframed closed panes are used.
// UNSURE: Utility and String ignore backPanel because the items describe open shelving.
// UNSURE: A String bookshelf is usually hung on a wall; here it stands on the floor, as the other bookshelves do (the wall version is the wall shelf's String variant).
// UNSURE: Variant defaults apply only to omitted parameters; explicitly supplied values always win.

const GLASS_VARIANTS = ['glass_door', 'corner_glass_door'];
const CORNER_VARIANTS = ['corner_unit', 'corner_glass_door'];
const STRAIGHT_VARIANTS = ['open', 'glass_door', 'string', 'utility'];
const WIRE_RADIUS = 5;
const MINIMUM_BAY = 150;

export const meta = {
  id: 'bookshelf',
  name: 'Bookshelf',
  summary: 'A bookshelf of a given width: open, glass-door, corner, String-style wire frame or utility shelving.',
  frontView: ['corner_unit', 'corner_glass_door'],
  description:
    'A floor-standing bookshelf of a given overall width, with bays that adapt to it and optional closed glass doors, including an L-shaped corner unit, a String-style unit with boards between wire ladder panels, and open-post utility shelving. Assumed: width is the overall width and the bays adapt to it (clear bay = width minus one support more than there are bays, divided by the bays; fewer columns are used when a bay would be under 150 mm), height is the overall height and the clear opening of each row follows from it (height minus the feet minus the boards, divided by the rows), rows counts the openings and rows plus one boards include bottom and top, and open and glass-door units can stand on four 40 mm feet of feetHeight (included in the height); cabinet sides, dividers and shelves 18 mm thick and optional backs 12 mm thick; shelf and back joints overlap supporting panels by 5 mm; the glass variants have closed unframed 6 mm panes overlapping opening edges by 5 mm; panes sit 2 mm behind the front of the sides, glazed shelves start 4 mm behind the front plane for a 4 mm pane overlap, and the glass part defaults to the glass material; straight cabinets have one full-height pane per column leaving 8 mm of intermediate dividers visible; corner units have a front run of the given width with frontColumns bays and a side run with sideColumns bays, the side run extending forward from the right end, backed at +x and accessed from -x, sideWidth being the overall extent of the L along the side so the side run reaches sideWidth minus depth beyond the front, shared equally by its bays; corner junction has no transverse closing panel and shelf runs overlap 5 mm; corner units require 100 mm of exposed front; corner front glazing divides exposed width into equal leaves no wider than the clear bay width with 3 mm gaps, while the side run has one leaf per bay; the String variant has 10 mm wire ladder panels at every bay boundary with centre lines 5 mm inside the footprint, boards ending at the wire centre lines, panels from the floor to 80 mm above the top board, a rung through every board, one halfway to the next and a last one 10 mm below the top, and the wires as their own part; utility posts are 35 mm square at the front and rear of every bay boundary, with 5 mm shelf penetration and full-depth shelves, without backs or doors; hinges, handles, fasteners, shelf holes and plinths omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['open', 'glass_door', 'corner_unit', 'corner_glass_door', 'string', 'utility'],
      labels: {
        open: 'Open bookshelf',
        glass_door: 'Glass-door bookshelf',
        corner_unit: 'Corner bookshelf',
        corner_glass_door: 'Glass-door corner bookshelf',
        string: 'String-style wire shelving',
        utility: 'Utility shelving',
      },
      default: 'open',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 960,
      min: 300,
      max: 3000,
      step: 10,
      hint: 'Overall width (the front run of a corner unit). The bays adapt to it.',
    },
    {
      key: 'sideWidth',
      label: 'Side width',
      unit: 'mm',
      default: 1000,
      min: 600,
      max: 3000,
      step: 10,
      hint: 'Overall length of the side run of a corner unit, from the back of the front run to its end.',
      appliesTo: CORNER_VARIANTS,
    },
    {
      key: 'columns',
      label: 'Columns',
      type: 'integer',
      default: 3,
      min: 1,
      max: 6,
      appliesTo: STRAIGHT_VARIANTS,
    },
    {
      key: 'frontColumns',
      label: 'Front columns',
      type: 'integer',
      default: 2,
      min: 2,
      max: 6,
      appliesTo: CORNER_VARIANTS,
    },
    {
      key: 'sideColumns',
      label: 'Side columns',
      type: 'integer',
      default: 2,
      min: 2,
      max: 6,
      appliesTo: CORNER_VARIANTS,
    },
    {
      key: 'rows',
      label: 'Rows',
      type: 'integer',
      default: 5,
      min: 1,
      max: 8,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 1600,
      min: 400,
      max: 2400,
      step: 10,
      hint: 'Overall height, feet included. The shelf spacing follows from it and the number of rows.',
    },
    {
      key: 'feetHeight',
      label: 'Feet height',
      unit: 'mm',
      default: 0,
      min: 0,
      max: 300,
      step: 10,
      appliesTo: ['open', 'glass_door'],
      hint: 'Four feet this high under the unit; 0 = it stands on the floor.',
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 300,
      min: 250,
      max: 400,
      step: 10,
    },
    {
      key: 'backPanel',
      label: 'Back panel',
      type: 'boolean',
      default: true,
      appliesTo: ['open', 'glass_door', 'corner_unit', 'corner_glass_door'],
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'oak',
    },
  ],
  parts: [
    { key: 'carcass', label: 'Frame and shelves' },
    { key: 'glass', label: 'Glass doors', appliesTo: GLASS_VARIANTS, defaultMaterial: 'glass' },
    { key: 'wires', label: 'Wire side panels', appliesTo: ['string'] },
  ],
  sizeParams: {
    x: 'width',
    y: { default: 'depth', corner_unit: 'sideWidth', corner_glass_door: 'sideWidth' },
    z: 'height',
  },
  variantDefaults: {
    corner_unit: { width: 1200, rows: 6, height: 1800 },
    corner_glass_door: { width: 1200, rows: 6, height: 1800 },
    string: { width: 1200, columns: 2, rows: 4, height: 1370 },
    utility: {
      width: 970,
      columns: 1,
      rows: 5,
      height: 2108,
      depth: 400,
      material: 'pine',
    },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'open';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      `Unknown bookshelf variant; choose ${meta.params[0].options.join(', ')}.`
    );
  }

  const q = {
    variant,
    glazed: GLASS_VARIANTS.includes(variant),
    corner: CORNER_VARIANTS.includes(variant),
    backPanel: false,
  };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Material and controls hidden for this variant are never read.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;
    if (definition.appliesTo && !definition.appliesTo.includes(variant)) {
      continue;
    }

    const value = p[key] ?? defaults[key] ?? definition.default;
    q[key] = value;

    if (definition.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new Error(`${definition.label} must be true or false.`);
      }
    } else if (definition.type === 'integer') {
      if (
        !Number.isInteger(value) ||
        value < definition.min ||
        value > definition.max
      ) {
        throw new Error(
          `${definition.label} must be an integer from ${definition.min} to ${definition.max}.`
        );
      }
    } else if (
      !Number.isFinite(value) ||
      value < definition.min ||
      value > definition.max
    ) {
      throw new Error(
        `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
      );
    }
  }

  // the unit's own height: the feet and (String) the wire panel's 80 mm above the top board are not shelf space
  q.feetHeight = q.feetHeight ?? 0;
  q.carcassHeight = q.height - q.feetHeight - (variant === 'string' ? 80 : 0);
  q.shelfSpacing = (q.carcassHeight - 18) / q.rows - 18;                 // the clear opening of each row
  if (q.shelfSpacing < 50) {
    throw new Error(`A ${q.height} mm unit with ${q.rows} rows leaves only ${Math.round(q.shelfSpacing)} mm for each shelf opening (feet ${q.feetHeight} mm, boards 18 mm). Raise the height or use fewer rows.`);
  }

  return q;
}

// Bays across `total` mm with a support of `post` mm at each end and between the bays: the number of bays (fewer than
// asked for when they would be under the minimum) and their clear width.
function fitBays(total, post, requested) {
  let count = requested;
  while (count > 1 && (total - (count + 1) * post) / count < MINIMUM_BAY) count -= 1;
  return { count, clear: (total - (count + 1) * post) / count };
}

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function verticalRod(x, y, bottom, top) {
  return primitives.cylinder({
    radius: WIRE_RADIUS,
    height: top - bottom,
    center: [x, y, (bottom + top) / 2],
    segments: 16,
  });
}

function depthRod(x, front, back, z) {
  const rod = primitives.cylinder({
    radius: WIRE_RADIUS,
    height: back - front,
    center: [0, 0, 0],
    segments: 16,
  });
  return transforms.translate(
    [x, (front + back) / 2, z],
    transforms.rotateX(Math.PI / 2, rod)
  );
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

const empty = () => geometries.geom3.create();

// String-style shelving: boards between wire ladder panels at every bay boundary.
function buildString(q, board, levelPitch, totalHeight) {
  const wire = 2 * WIRE_RADIUS;
  const { count } = fitBays(q.width, wire, q.columns);
  const bayPitch = (q.width - wire) / count;
  const panelTop = totalHeight + 80;
  const boards = [];
  const wires = [];

  // Boards end at the wire centre lines; neighbours overlap 2 mm inside the shared wire.
  for (let column = 0; column < count; column += 1) {
    const left = column * bayPitch + WIRE_RADIUS - (column > 0 ? 2 : 0);
    const right =
      (column + 1) * bayPitch + WIRE_RADIUS + (column < count - 1 ? 2 : 0);

    for (let row = 0; row <= q.rows; row += 1) {
      const bottom = row * levelPitch;
      boards.push(
        box(left, right, WIRE_RADIUS, q.depth - WIRE_RADIUS, bottom, bottom + board)
      );
    }
  }

  // A rung through the middle of every board, one halfway to the next and a last one under the panel top.
  const rungHeights = [];
  for (let row = 0; row <= q.rows; row += 1) {
    const z = row * levelPitch + board / 2;
    rungHeights.push(z);
    rungHeights.push(row < q.rows ? z + levelPitch / 2 : panelTop - 10);
  }

  for (let panel = 0; panel <= count; panel += 1) {
    const x = panel * bayPitch + WIRE_RADIUS;
    for (const y of [WIRE_RADIUS, q.depth - WIRE_RADIUS]) {
      wires.push(verticalRod(x, y, 0, panelTop));
    }
    for (const z of rungHeights) {
      wires.push(depthRod(x, WIRE_RADIUS, q.depth - WIRE_RADIUS, z));
    }
  }

  const shift = [-q.width / 2, -q.depth / 2, 0];
  return {
    carcass: transforms.translate(shift, combine(boards)),
    glass: empty(),
    wires: transforms.translate(shift, combine(wires)),
  };
}

export function build(p = {}) {
  const q = resolve(p);
  const board = 18;
  const backThickness = 12;
  const overlap = 5;
  const glassThickness = 6;
  // The panes sit 2 mm behind the front of the sides and 4 mm in front of the shelves' fronts, so no two parts share a plane.
  const glassInset = 2;
  const levelPitch = q.shelfSpacing + board;
  const totalHeight = q.carcassHeight;                                  // = rows * pitch + board
  const carcass = [];
  const glass = [];

  if (q.variant === 'string') {
    return buildString(q, board, levelPitch, totalHeight);
  }

  if (q.variant === 'utility') {
    const post = 35;
    const { count } = fitBays(q.width, post, q.columns);
    const bayPitch = (q.width - post) / count;

    for (let column = 0; column <= count; column += 1) {
      const x = column * bayPitch;
      for (const y of [0, q.depth - post]) {
        carcass.push(box(x, x + post, y, y + post, 0, totalHeight));
      }
    }

    for (let column = 0; column < count; column += 1) {
      const left = column * bayPitch + post - overlap;
      const right = (column + 1) * bayPitch + overlap;

      for (let row = 0; row <= q.rows; row += 1) {
        const bottom = row * levelPitch;
        carcass.push(
          box(left, right, 0, q.depth, bottom, bottom + board)
        );
      }
    }

    return {
      carcass: transforms.translate(
        [-q.width / 2, -q.depth / 2, 0],
        combine(carcass)
      ),
      glass: empty(),
      wires: empty(),
    };
  }

  const corner = q.corner;
  const totalWidth = q.width;
  const front = fitBays(totalWidth, board, corner ? q.frontColumns : q.columns);
  const columns = front.count;
  const bayPitch = (totalWidth - board) / columns;
  const cornerX = totalWidth - q.depth;
  const shelfFront = q.glazed ? 4 : 0;
  const shelfBack = q.backPanel
    ? q.depth - backThickness + overlap
    : q.depth;

  // The side run of a corner unit: the length beyond the front of the front run, shared by its bays.
  const returnLength = corner ? q.sideWidth - q.depth : 0;
  let sideColumns = corner ? q.sideColumns : 0;
  while (sideColumns > 1 && returnLength / sideColumns - board < MINIMUM_BAY) sideColumns -= 1;
  const sidePitch = corner ? returnLength / sideColumns : 0;

  if (corner && cornerX < 100) {
    throw new Error(
      `The ${totalWidth} mm width minus the ${q.depth} mm side depth leaves ${cornerX} mm of exposed front; at least 100 mm is required. Increase the width or reduce the depth.`
    );
  }
  if (corner && returnLength < 150) {
    throw new Error(
      `The ${q.sideWidth} mm side width minus the ${q.depth} mm depth leaves ${returnLength} mm for the side run; at least 150 mm is required. Increase the side width or reduce the depth.`
    );
  }

  // Front-run outer sides and intermediate dividers.
  for (let column = 0; column <= columns; column += 1) {
    const x = column * bayPitch;
    const outerSide = column === 0 || column === columns;
    carcass.push(
      box(
        x, x + board,
        0, outerSide ? q.depth : shelfBack,
        0, totalHeight
      )
    );
  }

  if (q.backPanel) {
    carcass.push(
      box(
        board - overlap,
        totalWidth - board + overlap,
        q.depth - backThickness,
        q.depth,
        0,
        totalHeight
      )
    );
  }

  // Bay boards penetrate each adjacent vertical panel by 5 mm.
  for (let column = 0; column < columns; column += 1) {
    const left = column * bayPitch + board - overlap;
    const right = (column + 1) * bayPitch + overlap;

    for (let row = 0; row <= q.rows; row += 1) {
      const bottom = row * levelPitch;
      carcass.push(
        box(left, right, shelfFront, shelfBack, bottom, bottom + board)
      );
    }

    if (q.glazed && !corner) {
      glass.push(
        box(
          left, right,
          glassInset, glassInset + glassThickness,
          board - overlap,
          totalHeight - board + overlap
        )
      );
    }
  }

  if (corner) {
    const returnShelfFront = cornerX + shelfFront;
    const returnShelfBack = q.backPanel
      ? totalWidth - backThickness + overlap
      : totalWidth;

    // No panel at y = 0: the side run opens into the corner bay.
    for (let column = 1; column <= sideColumns; column += 1) {
      const y = -column * sidePitch;
      carcass.push(
        box(
          cornerX, returnShelfBack,
          y, y + board,
          0, totalHeight
        )
      );
    }

    if (q.backPanel) {
      carcass.push(
        box(
          totalWidth - backThickness,
          totalWidth,
          -returnLength + board - overlap,
          overlap,
          0,
          totalHeight
        )
      );
    }

    for (let column = 1; column <= sideColumns; column += 1) {
      const sideFront = -column * sidePitch + board - overlap;
      const rear = column === 1
        ? shelfFront + overlap
        : -(column - 1) * sidePitch + overlap;

      for (let row = 0; row <= q.rows; row += 1) {
        const bottom = row * levelPitch;
        carcass.push(
          box(
            returnShelfFront,
            returnShelfBack,
            sideFront,
            rear,
            bottom,
            bottom + board
          )
        );
      }

      if (q.glazed) {
        glass.push(
          box(
            cornerX + glassInset,
            cornerX + glassInset + glassThickness,
            sideFront,
            -(column - 1) * sidePitch + overlap,
            board - overlap,
            totalHeight - board + overlap
          )
        );
      }
    }

    if (q.glazed) {
      // Front doors stop before the side run instead of crossing its bay.
      const left = board - overlap;
      const right = cornerX - 3;
      const exposedWidth = right - left;
      const leafCount = Math.ceil(exposedWidth / front.clear);
      const leafWidth =
        (exposedWidth - (leafCount - 1) * 3) / leafCount;

      for (let leaf = 0; leaf < leafCount; leaf += 1) {
        const x = left + leaf * (leafWidth + 3);
        glass.push(
          box(
            x, x + leafWidth,
            glassInset, glassInset + glassThickness,
            board - overlap,
            totalHeight - board + overlap
          )
        );
      }
    }
  }

  // Feet (open and glass_door): four 40 mm posts 15 mm in from the corners, under the unit, which stands on them.
  if (q.feetHeight > 0) {
    for (const x of [15, totalWidth - 55]) {
      for (const y of [15, q.depth - 55]) {
        carcass.push(box(x, x + 40, y, y + 40, -q.feetHeight, overlap));
      }
    }
  }

  // The corner footprint spans -returnLength to depth in local y.
  const shift = [
    -totalWidth / 2,
    (returnLength - q.depth) / 2,
    q.feetHeight,
  ];

  return {
    carcass: transforms.translate(shift, combine(carcass)),
    glass: glass.length > 0
      ? transforms.translate(shift, combine(glass))
      : empty(),
    wires: empty(),
  };
}
