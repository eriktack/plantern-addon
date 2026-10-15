import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width and depth describe each tier's full seat footprint; the complete tiered footprint is centred (consistent placement).
// ASSUMED: Wooden seats are 30 mm thick; upholstered seats are 70 mm thick (realistic seating proportions).
// ASSUMED: Upholstered seats have an 18 mm support board entering the cushion by 5 mm (continuous support).
// ASSUMED: Sauna seats have longitudinal slats no wider than 80 mm, separated by 10 mm gaps (ventilated seating).
// ASSUMED: Storage lids are closed solid seats, including on sauna variants (recognisable storage lid).
// ASSUMED: Legs are 45 mm square and inset 25 mm from seat edges (stable timber frame).
// ASSUMED: Open frames have 25 mm thick, 80 mm high aprons entering the seat or support board by 5 mm (rigid connections).
// ASSUMED: Storage boxes are inset 20 mm from seat edges, with 18 mm walls and bottoms (lid overhang and usable storage).
// ASSUMED: Storage boxes start 60 mm above the floor on four feet that enter the box bottom by 5 mm (raised storage construction).
// ASSUMED: Every tier has its own supports extending to z = 0 (freestanding stepped assembly).
// ASSUMED: A backrest is provided only on the rearmost tier and reaches its own 'Backrest height' (950 mm by default, 800 mm for an upholstered back) plus that tier's 400 mm elevation (unobstructed tier access). It does not change with the seat height.
// ASSUMED: Back posts are 40 mm square and enter the seat by 5 mm (connected back support).
// ASSUMED: Wooden back boards are 25 mm thick; upholstered back panels are 60 mm thick (distinct back construction).
// ASSUMED: Kitchen-sofa and upholstered backs use full panels starting 60 mm above the seat (tall settee profile).
// ASSUMED: Armrests (the Armrests option, on for the kitchen sofa) are thin, 40 mm wide and 180 mm above the seat, at both ends of each tier (settee arms).
// ASSUMED: Other backs use two 90 mm high horizontal boards, with their top edges 150 mm apart (open bench back).
// ASSUMED: Hinges, upholstery seams and storage hardware are omitted (simplified solid geometry).
// UNSURE: Tiers are described mainly for sauna benches; the same stepped arrangement is allowed for every variant.
// UNSURE: Backrest height on raised tiers is unspecified; the backrest height is read relative to that tier's 400 mm elevation.
// UNSURE: Kitchen-sofa backrest and storage can be explicitly disabled, overriding the variant defaults.
// UNSURE: Upholstery is represented geometrically only; the single material parameter is never read by build.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.

export const meta = {
  id: 'bench',
  name: 'Bench',
  summary: 'A bench with optional backrest, seat storage and stepped sauna-style tiers.',
  description:
    'A dining, entry, upholstered, kitchen-settee or slatted sauna bench with optional closed seat storage and stepped tiers. Assumed: width and depth describe each tier footprint and the complete footprint is centred; wooden seats 30 mm thick and upholstered seats 70 mm thick; upholstered support boards 18 mm thick with 5 mm cushion overlap; sauna slats run along the width, are at most 80 mm wide and have 10 mm gaps; storage lids are solid and closed even on sauna variants; legs 45 mm square inset 25 mm; aprons 25 mm thick and 80 mm high with 5 mm seat/support-board overlap; storage boxes inset 20 mm with 18 mm walls and bottoms, starting 60 mm above the floor on feet with 5 mm bottom overlap; every tier has floor-reaching supports; only the rearmost tier receives a backrest, reaching the backrest height (950 mm by default, 800 mm for an upholstered back) plus its tier elevation; back posts 40 mm square with 5 mm seat overlap; wooden back boards 25 mm thick and upholstered back panels 60 mm thick; kitchen-sofa and upholstered back panels start 60 mm above the seat; other backs have two 90 mm high boards with top edges 150 mm apart; hinges, upholstery seams and storage hardware omitted.',
  params: [
    {
      key: 'variant',
      labels: { dining: 'Dining bench', entry: 'Entry bench', upholstered: 'Upholstered bench', kitchen_sofa: 'Kitchen settee', sauna_lave: 'Sauna bench (lave)' },
      label: 'Variant',
      type: 'enum',
      options: ['dining', 'entry', 'upholstered', 'kitchen_sofa', 'sauna_lave'],
      default: 'dining',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 1200,
      min: 600,
      max: 2000,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 350,
      min: 300,
      max: 650,
      step: 10,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 450,
      min: 400,
      max: 500,
      step: 10,
    },
    {
      key: 'backrest',
      label: 'Backrest',
      type: 'boolean',
      default: false,
    },
    {
      key: 'arms',
      label: 'Armrests',
      type: 'boolean',
      default: false,
    },
    {
      key: 'backrestHeight',
      label: 'Backrest height',
      unit: 'mm',
      default: 950,
      min: 600,
      max: 1200,
      step: 10,
      hint: 'Top of the backrest above the floor (the rearmost tier\'s floor, when raised). Independent of the seat height.',
    },
    {
      key: 'storageLid',
      label: 'Storage lid',
      type: 'boolean',
      default: false,
    },
    {
      key: 'tiers',
      label: 'Tiers',
      type: 'integer',
      default: 1,
      min: 1,
      max: 3,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'oak',
    },
  ],
  parts: [
    { key: 'seat', label: 'Seat' },
    { key: 'frame', label: 'Frame and back' },
  ],
  variantDefaults: {
    entry: { storageLid: true, width: 1000 },
    upholstered: { backrest: true, width: 1400, backrestHeight: 800 },
    kitchen_sofa: {
      width: 1800,
      depth: 550,
      height: 450,
      backrest: true,
      arms: true,
      storageLid: true,
    },
    sauna_lave: {
      width: 1800,
      depth: 600,
      height: 450,
      tiers: 2,
      material: 'pine',
    },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'dining';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown bench variant; choose dining, entry, upholstered, kitchen_sofa or sauna_lave.'
    );
  }

  const defaults = meta.variantDefaults[variant] ?? {};
  const q = { variant };

  // Deliberately skip material, including any variant material default.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;

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
          `Tiers must be an integer from 1 to 3; each additional tier adds ${q.depth} mm of depth and 400 mm of seat elevation.`
        );
      }
    } else if (definition.unit === 'mm') {
      if (
        !Number.isFinite(value) ||
        value < definition.min ||
        value > definition.max
      ) {
        throw new Error(
          `${definition.label} must be between ${definition.min} mm and ${definition.max} mm.`
        );
      }
    }
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
  const x0 = -q.width / 2;
  const x1 = q.width / 2;
  const totalDepth = q.tiers * q.depth;
  const upholstered = q.variant === 'upholstered';
  const seatThickness = upholstered ? 70 : 30;
  const seats = [];
  const frames = [];

  for (let tier = 0; tier < q.tiers; tier += 1) {
    const front = -totalDepth / 2 + tier * q.depth;
    const back = front + q.depth;
    const elevation = tier * 400;
    const seatTop = q.height + elevation;
    const seatBottom = seatTop - seatThickness;

    // The upholstered support board overlaps the cushion by 5 mm.
    const supportBottom = upholstered ? seatBottom - 13 : seatBottom;

    // The kitchen sofa has thin armrests at both ends of each tier: 40 mm wide, 180 mm above the seat.
    if (q.arms) {
      const armWidth = 40;
      const armHeight = 180;
      for (const x of [x0, x1 - armWidth]) {
        frames.push(box(x, x + armWidth, front, back, seatTop - overlap, seatTop + armHeight));
      }
    }

    if (upholstered) {
      frames.push(
        box(x0, x1, front, back, supportBottom, seatBottom + overlap)
      );
    }

    if (q.variant === 'sauna_lave' && !q.storageLid) {
      const slatGap = 10;
      const slatCount = Math.ceil((q.depth + slatGap) / (80 + slatGap));
      const slatWidth = (q.depth - (slatCount - 1) * slatGap) / slatCount;

      for (let i = 0; i < slatCount; i += 1) {
        const y = front + i * (slatWidth + slatGap);
        seats.push(box(x0, x1, y, y + slatWidth, seatBottom, seatTop));
      }
    } else {
      seats.push(box(x0, x1, front, back, seatBottom, seatTop));
    }

    const legX = [x0 + 25, x1 - 25 - 45];
    const legY = [front + 25, back - 25 - 45];

    if (q.storageLid) {
      const boxBottom = 60;
      const boxTop = supportBottom + overlap;

      if (boxTop <= boxBottom + 18) {
        throw new Error(
          `Storage top at ${boxTop} mm must be above the 60 mm raised bottom plus its 18 mm panel.`
        );
      }

      const storageBox = booleans.subtract(
        box(
          x0 + 20, x1 - 20,
          front + 20, back - 20,
          boxBottom, boxTop
        ),
        box(
          x0 + 20 + 18, x1 - 20 - 18,
          front + 20 - overlap, back - 20 - 18,
          boxBottom + 18, boxTop + overlap
        )
      );

      // Restore a front wall; its ends overlap the side walls by 5 mm.
      const frontWall = box(
        x0 + 20 + 18 - overlap,
        x1 - 20 - 18 + overlap,
        front + 20,
        front + 20 + 18,
        boxBottom + 18 - overlap,
        boxTop
      );
      frames.push(booleans.union(storageBox, frontWall));

      for (const x of legX) {
        for (const y of legY) {
          frames.push(box(x, x + 45, y, y + 45, 0, boxBottom + overlap));
        }
      }
    } else {
      const supportTop = supportBottom + overlap;
      if (supportTop <= 80) {
        throw new Error(
          `Seat supports end at ${supportTop} mm; at least 80 mm is required for the aprons.`
        );
      }

      for (const x of legX) {
        for (const y of legY) {
          frames.push(box(x, x + 45, y, y + 45, 0, supportTop));
        }
      }

      // Widthwise aprons enter each leg by 5 mm.
      for (const y of [front + 25, back - 25 - 25]) {
        frames.push(
          box(
            x0 + 65, x1 - 65,
            y, y + 25,
            supportTop - 80, supportTop
          )
        );
      }

      // Depthwise aprons likewise overlap the legs at their ends.
      for (const x of [x0 + 25, x1 - 25 - 25]) {
        frames.push(
          box(
            x, x + 25,
            front + 65, back - 65,
            supportTop - 80, supportTop
          )
        );
      }
    }

    if (q.backrest && tier === q.tiers - 1) {
      // the backrest height is its own setting: it does not change with the seat height
      const backTop = q.backrestHeight + elevation;
      if (backTop < seatTop + 150) {
        throw new Error(
          `Backrest height ${q.backrestHeight} mm is too low for a seat at ${q.height} mm: the back must rise at least 150 mm above the seat.`
        );
      }
      const postWidth = 40;
      const boardThickness = upholstered ? 60 : 25;

      for (const x of [x0, x1 - postWidth]) {
        frames.push(
          box(
            x, x + postWidth,
            back - postWidth, back,
            seatTop - overlap, backTop
          )
        );
      }

      const panelX0 = x0 + postWidth - overlap;
      const panelX1 = x1 - postWidth + overlap;

      if (q.variant === 'kitchen_sofa' || upholstered) {
        frames.push(
          box(
            panelX0, panelX1,
            back - boardThickness, back,
            seatTop + 60, backTop
          )
        );
      } else {
        for (const topOffset of [0, 150]) {
          frames.push(
            box(
              panelX0, panelX1,
              back - boardThickness, back,
              backTop - topOffset - 90,
              backTop - topOffset
            )
          );
        }
      }
    }
  }

  return {
    seat: combine(seats),
    frame: combine(frames),
  };
}