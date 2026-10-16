import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width and depth are overall dimensions; seatHeight is the top of the closed seat ring (consistent sizing).
// ASSUMED: Wall-hung toilets include a rear installation carrier reaching z = 0 while leaving the bowl suspended (preserves the floor datum).
// ASSUMED: The carrier is 60% of width, 25 mm deep, with 25 mm wide frame members (simplified concealed mounting frame).
// ASSUMED: Concealed cisterns are omitted; 50 mm of overall depth remains behind the bowl for connections (concealed installation).
// ASSUMED: Exposed cisterns occupy the rear 140 mm of depth, are 85% of width and rise 350 mm above seatHeight (close-coupled proportions).
// ASSUMED: Exposed cistern walls are 12 mm thick with 18 mm outside corner radii (rounded ceramic tank).
// ASSUMED: The flush button is represented by a 12 mm radius, 3 mm deep recess in the cistern top (integrated detail).
// ASSUMED: Bowl undersides are 210 mm below seatHeight (suspended bowl clearance).
// ASSUMED: The ceramic rim top is 15 mm below seatHeight; its band is 20 mm high (seat support).
// ASSUMED: Lower bowl radii are 32% of width and 30% of bowl length, tapering out to the full rim (rounded bowl profile).
// ASSUMED: Bowl shells and rim bands overlap vertically by 5 mm (connected ceramic body).
// ASSUMED: Bowl cavities start 35 mm above the underside, with lower radii 13% of width and bowl length and upper radii 34% of width and 36% of bowl length (hollow pan).
// ASSUMED: The rear connection neck is 60% of width, begins 50 mm before the bowl's rear edge and starts 30 mm above the underside (wall and cistern connection).
// ASSUMED: Floor-standing pedestals have lower radii 32% of width and 30% of bowl length, upper radii 25% and 22%, and are offset rearward by 6% of bowl length (stable ceramic foot).
// ASSUMED: Pedestals enter the bowl by 5 mm; exposed cistern bottoms enter the connection neck by 5 mm (solid joints).
// ASSUMED: Seats are 20 mm thick, inset 5 mm from the outside bowl outline, and overlap the rim vertically by 5 mm (closed seat ring).
// ASSUMED: Seat openings have radii 32% of width and 34% of bowl length (usable oval opening).
// ASSUMED: Main rounded parts use 32 segments and flush-button recesses use 16 (appropriate resolution).
// ASSUMED: Seat lids, hinges, water, internal traps, pipes, wall finishes and concealed cistern equipment are omitted (simplified fixture geometry).
// UNSURE: The wall-hung floor-reference requirement conflicts with a completely floating fixture; a rear installation carrier supplies the z = 0 geometry without a pedestal beneath the bowl.
// UNSURE: Exposed cisterns on wall-hung variants are treated as close-coupled tanks supported by the rear mounting assembly.
// UNSURE: Variant defaults apply only to omitted parameters; supplied values always win.
// UNSURE: The mounting carrier shares the prescribed bowl part and whole-object material because no separate frame part or material is provided.

export const meta = {
  id: 'toilet',
  name: 'Toilet',
  summary: 'A wall-hung or floor-standing toilet with a seat and optional exposed cistern.',
  description:
    'A toilet facing -y with an open bowl, closed seat ring and either a pedestal or a rear mounting carrier. Assumed: width and depth are overall dimensions and seatHeight is the seat-ring top; wall-hung fixtures include a floor-reaching rear carrier 60% of width and 25 mm deep with 25 mm frame members; concealed cistern equipment is omitted with 50 mm rear connection allowance; exposed cisterns occupy 140 mm of depth, are 85% of width and rise 350 mm above seatHeight, with 12 mm walls, 18 mm outside corner radii and a flush-button recess of 12 mm radius and 3 mm depth; bowl undersides are 210 mm below seatHeight; ceramic rim tops are 15 mm below seatHeight with 20 mm high bands; lower bowl radii are 32% of width and 30% of bowl length, expanding to the full rim, with 5 mm shell-to-rim overlap; cavities start 35 mm above the underside with lower radii 13% of width and bowl length and upper radii 34% of width and 36% of bowl length; rear necks are 60% of width, begin 50 mm before the bowl rear and start 30 mm above its underside; floor pedestal lower radii are 32% of width and 30% of bowl length, upper radii 25% and 22%, offset rearward by 6% of bowl length; pedestal-to-bowl and cistern-to-neck overlaps 5 mm; seats 20 mm thick and inset 5 mm with 5 mm rim overlap, and opening radii 32% of width and 34% of bowl length; main round parts use 32 segments and button recesses 16; lids, hinges, water, internal traps, pipes, wall finishes and concealed cistern equipment omitted.',
  params: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'enum',
      options: ['wall_hung', 'floor_standing'],
      labels: {
        wall_hung: 'Wall-hung toilet',
        floor_standing: 'Floor-standing toilet',
      },
      default: 'wall_hung',
    },
    {
      key: 'width',
      label: 'Width',
      unit: 'mm',
      default: 360,
      min: 350,
      max: 400,
      step: 10,
    },
    {
      key: 'depth',
      label: 'Depth',
      unit: 'mm',
      default: 530,
      min: 500,
      max: 700,
      step: 10,
    },
    {
      key: 'seatHeight',
      label: 'Seat height',
      unit: 'mm',
      default: 400,
      min: 380,
      max: 440,
      step: 10,
    },
    {
      key: 'concealedCistern',
      label: 'Concealed cistern',
      type: 'boolean',
      default: true,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'ceramic',
    },
  ],
  parts: [
    { key: 'bowl', label: 'Bowl and cistern' },
    { key: 'seat', label: 'Seat' },
  ],
  variantDefaults: {
    floor_standing: { concealedCistern: false, depth: 680 },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'wall_hung';
  if (!meta.params[0].options.includes(variant)) {
    throw new Error(
      'Unknown toilet variant; choose wall_hung or floor_standing.'
    );
  }

  const q = { variant };
  const defaults = meta.variantDefaults[variant] ?? {};

  // Deliberately do not read or copy material.
  for (const definition of meta.params) {
    const key = definition.key;
    if (key === 'variant' || key === 'material') continue;

    const value = p[key] ?? defaults[key] ?? definition.default;
    q[key] = value;

    if (definition.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new Error(`${definition.label} must be true or false.`);
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

  return q;
}

function box(x0, x1, y0, y1, z0, z1) {
  return primitives.cuboid({
    size: [x1 - x0, y1 - y0, z1 - z0],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

function oval(bottomRadii, topRadii, bottom, top, centerY) {
  return primitives.cylinderElliptic({
    height: top - bottom,
    startRadius: bottomRadii,
    endRadius: topRadii,
    center: [0, centerY, (bottom + top) / 2],
    segments: 32,
  });
}

function roundedTank(width, depth, radius, centerY, bottom, top) {
  const height = top - bottom;
  const centerZ = (bottom + top) / 2;
  const pieces = [
    primitives.cuboid({
      size: [width - 2 * radius, depth, height],
      center: [0, centerY, centerZ],
    }),
    primitives.cuboid({
      size: [width, depth - 2 * radius, height],
      center: [0, centerY, centerZ],
    }),
  ];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      pieces.push(
        primitives.cylinder({
          radius,
          height,
          center: [
            sx * (width / 2 - radius),
            centerY + sy * (depth / 2 - radius),
            centerZ,
          ],
          segments: 32,
        })
      );
    }
  }

  return booleans.union(...pieces);
}

export function build(p = {}) {
  const q = resolve(p);
  const overlap = 5;
  const front = -q.depth / 2;
  const back = q.depth / 2;
  const rearAllowance = q.concealedCistern ? 50 : 140;
  const bowlLength = q.depth - rearAllowance;
  const bowlY = front + bowlLength / 2;
  const bowlBack = front + bowlLength;

  const bowlBottom = q.seatHeight - 210;
  const rimTop = q.seatHeight - 15;
  const rimBottom = rimTop - 20;
  const seatBottom = q.seatHeight - 20;

  if (bowlLength <= 100 || bowlBottom <= 0) {
    throw new Error(
      `A ${q.depth} mm deep toilet at seat height ${q.seatHeight} mm cannot fit the ${rearAllowance} mm rear allowance and 210 mm bowl depth.`
    );
  }

  const ceramic = [
    oval(
      [0.32 * q.width, 0.30 * bowlLength],
      [q.width / 2, bowlLength / 2],
      bowlBottom,
      rimBottom + overlap,
      bowlY
    ),
    oval(
      [q.width / 2, bowlLength / 2],
      [q.width / 2, bowlLength / 2],
      rimBottom,
      rimTop,
      bowlY
    ),
    box(
      -0.30 * q.width,
      0.30 * q.width,
      bowlBack - 50,
      back,
      bowlBottom + 30,
      rimTop
    ),
  ];

  if (q.variant === 'floor_standing') {
    ceramic.push(
      oval(
        [0.32 * q.width, 0.30 * bowlLength],
        [0.25 * q.width, 0.22 * bowlLength],
        0,
        bowlBottom + overlap,
        bowlY + 0.06 * bowlLength
      )
    );
  } else {
    // Rear installation carrier: no pedestal underneath the suspended pan.
    const halfCarrierWidth = 0.30 * q.width;
    ceramic.push(
      booleans.subtract(
        box(
          -halfCarrierWidth,
          halfCarrierWidth,
          back - 25,
          back,
          0,
          rimTop
        ),
        box(
          -halfCarrierWidth + 25,
          halfCarrierWidth - 25,
          back - 25 - overlap,
          back + overlap,
          25,
          rimTop - 25
        )
      )
    );
  }

  const cavityBottom = bowlBottom + 35;
  const cavity = oval(
    [0.13 * q.width, 0.13 * bowlLength],
    [0.34 * q.width, 0.36 * bowlLength],
    cavityBottom,
    rimTop + overlap,
    bowlY
  );

  let bowl = booleans.subtract(
    booleans.union(...ceramic),
    cavity
  );

  if (!q.concealedCistern) {
    const tankWidth = 0.85 * q.width;
    const tankDepth = 140;
    const tankY = back - tankDepth / 2;
    const tankBottom = rimTop - overlap;
    const tankTop = q.seatHeight + 350;
    const wall = 12;

    const tank = booleans.subtract(
      roundedTank(
        tankWidth,
        tankDepth,
        18,
        tankY,
        tankBottom,
        tankTop
      ),
      roundedTank(
        tankWidth - 2 * wall,
        tankDepth - 2 * wall,
        18 - wall,
        tankY,
        tankBottom + wall,
        tankTop - wall
      ),
      primitives.cylinder({
        radius: 12,
        height: 3 + overlap,
        center: [0, tankY, tankTop - 3 + (3 + overlap) / 2],
        segments: 16,
      })
    );

    bowl = booleans.union(bowl, tank);
  }

  const seat = booleans.subtract(
    oval(
      [q.width / 2 - 5, bowlLength / 2 - 5],
      [q.width / 2 - 5, bowlLength / 2 - 5],
      seatBottom,
      q.seatHeight,
      bowlY
    ),
    oval(
      [0.32 * q.width, 0.34 * bowlLength],
      [0.32 * q.width, 0.34 * bowlLength],
      seatBottom - overlap,
      q.seatHeight + overlap,
      bowlY
    )
  );

  return { bowl, seat };
}