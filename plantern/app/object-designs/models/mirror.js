import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width, height and depth are overall dimensions, with the rear at +y (consistent wall placement).
// ASSUMED: Plain mirrors have 18 mm wide frames and 6 mm thick panes recessed 2 mm behind the frame front (realistic framed mirror).
// ASSUMED: Panes extend 5 mm into the frame opening on every edge (connected glazing).
// ASSUMED: Plain mirror backing panels are 8 mm thick and overlap the frame opening by 5 mm (supported mirror).
// ASSUMED: Unequal round dimensions produce an oval (both size parameters remain effective).
// ASSUMED: Backlit mirrors have an 8 mm deep rear perimeter reveal and a 13 mm thick inset rear housing, overlapping the front frame by 5 mm (concealed backlighting space).
// ASSUMED: Medicine-cabinet sides, top, bottom and shelves are 18 mm thick; backs are 8 mm thick (typical cabinetry).
// ASSUMED: Medicine-cabinet mirror doors are 6 mm thick and flush with the overall front, entering the cabinet by 5 mm (connected closed fronts).
// ASSUMED: Cabinets below 600 mm width have one mirror door; wider cabinets have two with a 3 mm central gap (practical door sizes).
// ASSUMED: Paired doors have a 13 mm wide central support stile, giving 5 mm overlap on either side of the door gap (supported closed doors).
// ASSUMED: Medicine cabinets have two evenly spaced internal shelves; shelves stop 1 mm behind the panes and enter the sides, back and central stile by 5 mm (usable connected storage).
// ASSUMED: Main round parts use 32 segments (smooth oval mirror outline).
// ASSUMED: Hinges, handles, fasteners, wiring and emitted light are omitted (geometry-only representation).
// UNSURE: Round dimensions are not constrained equal; an oval is used when width differs from height.
// UNSURE: Backlighting has no electrical parameters; its geometry is represented by the recessed rear housing and perimeter reveal.
// UNSURE: Very shallow medicine cabinets remain geometrically valid but provide correspondingly shallow storage.
// UNSURE: Variant defaults apply only to omitted parameters; explicitly supplied values always win.

export const meta = {
  id: 'mirror',
  name: 'Mirror',
  summary: 'A rectangular, round, backlit or medicine-cabinet mirror.',
  description:
    'A wall-mounted mirror facing -y, with a frame or storage cabinet and its rear against the wall at +y. Assumed: dimensions are overall; plain frames have 18 mm borders, 6 mm panes recessed 2 mm and 5 mm pane-to-frame edge overlap; backing panels are 8 mm thick with 5 mm frame overlap; unequal round dimensions form an oval; backlit mirrors have an 8 mm rear perimeter reveal and 13 mm inset rear housing with 5 mm front-frame overlap; medicine-cabinet sides, top, bottom and shelves are 18 mm thick and backs 8 mm thick; cabinet mirror doors are 6 mm thick, flush with the overall front and penetrating the cabinet by 5 mm; cabinets below 600 mm width have one door and wider cabinets two with a 3 mm gap and 13 mm central stile, giving 5 mm door overlap; two internal shelves are evenly spaced, stop 1 mm behind panes and enter sides, back and central stile by 5 mm; round parts use 32 segments; hinges, handles, fasteners, wiring and emitted light omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['rectangular', 'round', 'backlit', 'medicine_cabinet'],
      labels: {
        rectangular: 'Rectangular mirror',
        round: 'Round mirror',
        backlit: 'Backlit mirror',
        medicine_cabinet: 'Mirror cabinet',
      },
      default: 'rectangular',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 600,
      min: 300,
      max: 1200,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 800,
      min: 300,
      max: 1400,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 30,
      min: 20,
      max: 150,
      step: 10,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'white-paint',
    },
  ],
  parts: [
    { key: 'glass', label: 'Mirror', defaultMaterial: 'glass' },
    { key: 'frame', label: 'Frame or cabinet' },
  ],
  variantDefaults: {
    round: { width: 600, height: 600 },
    medicine_cabinet: { depth: 120, height: 700 },
  },
  placement: { mount: 'wall', z: 1100 },
};

function resolve(p) {
  const variant = p.variant ?? 'rectangular';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown mirror variant; choose rectangular, round, backlit or medicine_cabinet.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Material is deliberately never read or copied.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;

    const value = p[key] ?? defaults[key] ?? definition.default;
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

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function ovalPrism(radiusX, radiusZ, front, back, centerZ) {
  const shape = primitives.cylinderElliptic({
    height: back - front,
    startRadius: [radiusX, radiusZ],
    endRadius: [radiusX, radiusZ],
    center: [0, 0, 0],
    segments: 32,
  });

  // Rotate the oval into the x-z plane before positioning it.
  return transforms.translate(
    [0, (front + back) / 2, centerZ],
    transforms.rotateX(Math.PI / 2, shape)
  );
}

function combine(shapes) {
  if (shapes.length === 0) return geometries.geom3.create();
  if (shapes.length === 1) return shapes[0];
  return booleans.union(...shapes);
}

export function build(p = {}) {
  const q = resolve(p);
  const overlap = 5;
  const border = 18;
  const mirrorThickness = 6;
  const x0 = -q.width / 2;
  const x1 = q.width / 2;
  const front = -q.depth / 2;
  const back = q.depth / 2;

  const paneLeft = x0 + border - overlap;
  const paneRight = x1 - border + overlap;
  const paneBottom = border - overlap;
  const paneTop = q.height - border + overlap;

  if (q.variant === 'medicine_cabinet') {
    const panel = 18;
    const backThickness = 8;
    const bodyFront = front + mirrorThickness - overlap;
    const doorCount = q.width < 600 ? 1 : 2;
    const doorGap = 3;
    const stileWidth = 13;
    const shelfCount = 2;
    const shelfFront = front + mirrorThickness + 1;
    const innerBack = back - backThickness;
    const innerBottom = panel;
    const innerTop = q.height - panel;
    const frames = [];
    const panes = [];

    if (innerBack <= shelfFront) {
      throw new Error(
        `Cabinet depth ${q.depth} mm cannot fit a ${mirrorThickness} mm mirror door, 1 mm shelf clearance and ${backThickness} mm back.`
      );
    }

    frames.push(
      booleans.subtract(
        box(x0, x1, bodyFront, back, 0, q.height),
        box(
          x0 + panel,
          x1 - panel,
          bodyFront - overlap,
          innerBack,
          innerBottom,
          innerTop
        )
      )
    );

    if (doorCount === 2) {
      frames.push(
        box(
          -stileWidth / 2,
          stileWidth / 2,
          bodyFront,
          innerBack + overlap,
          innerBottom - overlap,
          innerTop + overlap
        )
      );
    }

    const shelfGap =
      (innerTop - innerBottom - shelfCount * panel) / (shelfCount + 1);

    if (shelfGap <= 0) {
      throw new Error(
        `Cabinet height ${q.height} mm cannot fit two ${panel} mm shelves between its top and bottom panels.`
      );
    }

    for (let shelf = 0; shelf < shelfCount; shelf += 1) {
      const bottom =
        innerBottom + shelfGap + shelf * (panel + shelfGap);

      if (doorCount === 1) {
        frames.push(
          box(
            x0 + panel - overlap,
            x1 - panel + overlap,
            shelfFront,
            innerBack + overlap,
            bottom,
            bottom + panel
          )
        );
      } else {
        frames.push(
          box(
            x0 + panel - overlap,
            -stileWidth / 2 + overlap,
            shelfFront,
            innerBack + overlap,
            bottom,
            bottom + panel
          ),
          box(
            stileWidth / 2 - overlap,
            x1 - panel + overlap,
            shelfFront,
            innerBack + overlap,
            bottom,
            bottom + panel
          )
        );
      }
    }

    const leafWidth =
      (paneRight - paneLeft - (doorCount - 1) * doorGap) / doorCount;

    for (let leaf = 0; leaf < doorCount; leaf += 1) {
      const left = paneLeft + leaf * (leafWidth + doorGap);
      panes.push(
        box(
          left,
          left + leafWidth,
          front,
          front + mirrorThickness,
          paneBottom,
          paneTop
        )
      );
    }

    return {
      glass: combine(panes),
      frame: combine(frames),
    };
  }

  const mirrorFront = front + 2;
  const mirrorBack = mirrorFront + mirrorThickness;

  if (q.variant === 'round') {
    const radiusX = q.width / 2;
    const radiusZ = q.height / 2;
    const centerZ = q.height / 2;

    const frameRing = booleans.subtract(
      ovalPrism(radiusX, radiusZ, front, back, centerZ),
      ovalPrism(
        radiusX - border,
        radiusZ - border,
        front - overlap,
        back + overlap,
        centerZ
      )
    );

    const backing = ovalPrism(
      radiusX - border + overlap,
      radiusZ - border + overlap,
      back - 8,
      back,
      centerZ
    );

    const glass = ovalPrism(
      radiusX - border + overlap,
      radiusZ - border + overlap,
      mirrorFront,
      mirrorBack,
      centerZ
    );

    return {
      glass,
      frame: booleans.union(frameRing, backing),
    };
  }

  const backlit = q.variant === 'backlit';
  const ringBack = backlit ? back - 8 : back;
  const backingThickness = backlit ? 13 : 8;

  const frameRing = booleans.subtract(
    box(x0, x1, front, ringBack, 0, q.height),
    box(
      x0 + border,
      x1 - border,
      front - overlap,
      ringBack + overlap,
      border,
      q.height - border
    )
  );

  const backing = box(
    paneLeft,
    paneRight,
    back - backingThickness,
    back,
    paneBottom,
    paneTop
  );

  const glass = box(
    paneLeft,
    paneRight,
    mirrorFront,
    mirrorBack,
    paneBottom,
    paneTop
  );

  return {
    glass,
    frame: booleans.union(frameRing, backing),
  };
}