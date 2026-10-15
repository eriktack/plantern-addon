import { primitives, booleans, transforms, geometries } from '../lib/jscad.js';

// ASSUMED: Width and length are overall frame dimensions; the head is at +y (consistent placement).
// ASSUMED: Frame rails and storage walls are 30 mm thick; ordinary rails are 180 mm high (wooden construction).
// ASSUMED: Decks are 20 mm thick; joints overlap by at least 5 mm (solid connections).
// ASSUMED: Legs and corner posts are 50 mm square (structural support).
// ASSUMED: Mattress clearance is 5 mm per side inside the rails (bedding clearance).
// ASSUMED: Ordinary mattresses are 180 mm thick; cot mattresses are 80 mm thick (typical bedding).
// ASSUMED: Low and tall headboards extend 300 mm and 600 mm above an ordinary frame (typical proportions).
// ASSUMED: Ordinary footboards extend 200 mm above the frame (low end panel).
// ASSUMED: Platform perimeter rails are 80 mm high (shallow platform profile).
// ASSUMED: Storage bottoms are 40 mm thick; drawer margins are 60 mm (rigid storage shell).
// ASSUMED: Drawer outlines are 3 mm wide and 5 mm deep; fronts are at most 200 mm high (closed drawer detailing).
// ASSUMED: Drawer pulls are recessed slots 100 mm wide, 20 mm high and 10 mm deep (no separate handle part).
// ASSUMED: Drawers alternate between the left and right sides (accessible closed storage).
// ASSUMED: Bunk lower deck top is 350 mm; upper deck top is height minus 400 mm (sleeping and guard clearances).
// ASSUMED: Bunk height must be at least 1350 mm (minimum separation for this fixed layout).
// ASSUMED: Bunk and cot top rails are 35 mm high (continuous guards).
// ASSUMED: Bunk guards have intermediate 30 mm square supports at no more than 500 mm centres (rail support).
// ASSUMED: Bunk ladder has 30 mm wide, 35 mm deep stiles spaced 140 mm apart and 30 mm high rungs at 200 mm intervals (compact access).
// ASSUMED: Bunk end panels rise 180 mm or 300 mm above the upper deck for low or tall headboards (contained within guards).
// ASSUMED: Cot mattress top is exactly 300 mm below the bars; cot height must be at least 500 mm (positive support height).
// ASSUMED: Cot bars are 20 mm square with clear gaps no greater than 60 mm (recognisable barred enclosure, not a safety certification).
// ASSUMED: Optional cot head and foot panels occupy the upper 150 mm or 300 mm of the enclosure (preserve specified total height).
// ASSUMED: A daybed has a full-length back along +x rising 300 mm above its frame (settee-like side support).
// UNSURE: Mattress dimensions versus frame dimensions are not specified; width and length are treated as overall frame dimensions.
// UNSURE: Bunk and cot headboard options are interpreted as integrated end panels rather than extra overall height.
// UNSURE: Drawers are shown closed using recessed outlines and pulls; internal drawer mechanisms are unspecified.
// UNSURE: Missing parameters receive variant defaults; supplied values always win, since explicit/default provenance is unavailable.
// UNSURE: This is furniture geometry, not a certified bunk-bed or cot safety design.

export const meta = {
  id: 'bed',
  name: 'Bed',
  summary: 'Beds in standard, platform, storage, bunk, daybed and cot forms.',
  description:
    'A parametric bed with standard, platform, closed storage, bunk, daybed and barred cot forms, with the head at +y. Assumed: width and length are overall frame dimensions; rails and storage walls 30 mm thick; ordinary rails 180 mm high; decks 20 mm thick; joints overlap at least 5 mm; legs and corner posts 50 mm square; mattress clearance 5 mm per side; ordinary mattresses 180 mm thick and cot mattresses 80 mm thick; ordinary low/tall headboards rise 300/600 mm above the frame; ordinary footboards rise 200 mm; platform rails 80 mm high; storage bottoms 40 mm thick; drawer margins 60 mm; drawer outlines 3 mm wide and 5 mm deep; drawer fronts at most 200 mm high; recessed pulls 100 by 20 by 10 mm; drawers alternate left/right; bunk lower deck top 350 mm and upper deck top height minus 400 mm; minimum bunk height 1350 mm; bunk/cot top rails 35 mm high; bunk intermediate supports 30 mm square at no more than 500 mm centres; ladder stiles 30 mm wide and 35 mm deep at 140 mm centre spacing, with 30 mm high rungs at 200 mm intervals; bunk low/tall end panels rise 180/300 mm above the upper deck; cot mattress top exactly 300 mm below the bars; minimum cot height 500 mm; cot bars 20 mm square with clear gaps no greater than 60 mm; optional cot end panels cover the upper 150/300 mm; daybed +x back rises 300 mm above the frame; storage drawers and sofa-like daybed are modelled closed.',
  params: [
    {
      key: 'variant',
      labels: { standard: 'Standard bed', platform: 'Platform bed', storage_bed: 'Bed with storage', bunk: 'Bunk bed', daybed: 'Daybed', cot: 'Barred cot' },
      label: 'Variant',
      type: 'enum',
      options: ['standard', 'platform', 'storage_bed', 'bunk', 'daybed', 'cot'],
      default: 'standard',
    },
    {
      key: 'width',
      label: 'Width',
      type: 'enum_number',
      unit: 'mm',
      options: [600, 900, 1200, 1500, 1600, 1800],
      default: 1500,
    },
    {
      key: 'length',
      label: 'Length',
      type: 'enum_number',
      unit: 'mm',
      options: [1200, 2000, 2100],
      default: 2000,
    },
    {
      key: 'height',
      label: 'Height',
      unit: 'mm',
      default: 500,
      min: 350,
      max: 1800,
      step: 10,
    },
    {
      key: 'headboard',
      label: 'Headboard',
      type: 'enum',
      options: ['none', 'low', 'tall'],
      default: 'low',
    },
    {
      key: 'footboard',
      label: 'Footboard',
      type: 'boolean',
      default: false,
    },
    {
      key: 'drawers',
      appliesTo: ['standard', 'platform', 'storage_bed', 'bunk', 'daybed'],
      label: 'Drawers',
      type: 'integer',
      default: 0,
      min: 0,
      max: 4,
    },
    {
      key: 'material',
      label: 'Material (whole object)',
      type: 'material',
      default: 'oak',
    },
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'mattress', label: 'Mattress' },
  ],
  variantDefaults: {
    storage_bed: { drawers: 2, height: 450 },
    bunk: { width: 900, height: 1700 },
    daybed: { width: 900, headboard: 'low', footboard: false },
    cot: {
      width: 600,
      length: 1200,
      height: 900,
      headboard: 'none',
      footboard: false,
    },
  },
  placement: { mount: 'floor' },
};

function resolve(p) {
  const variant = p.variant ?? 'standard';
  const overrides = meta.variantDefaults[variant] ?? {};
  const result = { variant };

  // Material is deliberately neither copied nor read.
  for (const definition of meta.params) {
    if (definition.key === 'variant' || definition.key === 'material') continue;
    result[definition.key] =
      p[definition.key] ?? overrides[definition.key] ?? definition.default;
  }

  if (!meta.params[0].options.includes(variant)) {
    throw new Error('Unknown bed variant; choose standard, platform, storage_bed, bunk, daybed or cot.');
  }
  if (!meta.params[1].options.includes(result.width)) {
    throw new Error('Bed width must be 600, 900, 1200, 1500, 1600 or 1800 mm.');
  }
  if (!meta.params[2].options.includes(result.length)) {
    throw new Error('Bed length must be 1200, 2000 or 2100 mm.');
  }
  if (!Number.isFinite(result.height) || result.height < 350 || result.height > 1800) {
    throw new Error('Frame height must be between 350 mm and 1800 mm.');
  }
  if (!['none', 'low', 'tall'].includes(result.headboard)) {
    throw new Error('Headboard must be none, low or tall.');
  }
  if (typeof result.footboard !== 'boolean') {
    throw new Error('Footboard must be true or false.');
  }
  if (!Number.isInteger(result.drawers) || result.drawers < 0 || result.drawers > 4) {
    throw new Error('Drawer count must be an integer from 0 to 4.');
  }
  if (variant === 'bunk' && result.height < 1350) {
    throw new Error(`Bunk rail height ${result.height} mm is too low; this layout requires at least 1350 mm.`);
  }
  if (variant === 'cot' && result.height < 500) {
    throw new Error(`Cot height ${result.height} mm is too low; this layout requires at least 500 mm.`);
  }
  if (variant === 'cot' && result.drawers !== 0) {
    throw new Error('The barred cot does not support drawers; set drawers to 0 for its mattress 300 mm below the top.');
  }
  return result;
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

export function build(p) {
  const q = resolve(p);
  const w = q.width;
  const l = q.length;
  const h = q.height;
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -l / 2;
  const y1 = l / 2;
  const t = 30;
  const overlap = 5;
  const frame = [];
  const mattresses = [];

  function deck(z) {
    // The deck enters the surrounding rails by 5 mm on each side.
    frame.push(box(x0 + t - overlap, x1 - t + overlap,
      y0 + t - overlap, y1 - t + overlap, z - 20, z));
  }

  function mattress(z, thickness) {
    mattresses.push(box(x0 + t + 5, x1 - t - 5,
      y0 + t + 5, y1 - t - 5, z - overlap, z - overlap + thickness));
  }

  function perimeter(z, railHeight) {
    frame.push(
      box(x0, x0 + t, y0, y1, z - railHeight, z),
      box(x1 - t, x1, y0, y1, z - railHeight, z),
      box(x0 + t - overlap, x1 - t + overlap, y0, y0 + t, z - railHeight, z),
      box(x0 + t - overlap, x1 - t + overlap, y1 - t, y1, z - railHeight, z),
    );
  }

  function legs(top) {
    for (const x of [x0 + t - overlap, x1 - t + overlap - 50]) {
      for (const y of [y0 + t - overlap, y1 - t + overlap - 50]) {
        frame.push(box(x, x + 50, y, y + 50, 0, top));
      }
    }
  }

  function storage(z) {
    let shell = booleans.subtract(
      box(x0, x1, y0, y1, 0, z),
      box(x0 + t, x1 - t, y0 + t, y1 - t, 40, z + overlap),
    );

    // Each outline is a shallow rectangular groove, not an open drawer.
    const cuts = [];
    for (let side = 0; side < 2; side += 1) {
      const count = side === 0 ? Math.ceil(q.drawers / 2) : Math.floor(q.drawers / 2);
      if (count === 0) continue;
      const bay = (l - 120) / count;
      const frontHeight = Math.min(200, z - 100);
      const bottom = 60;
      for (let i = 0; i < count; i += 1) {
        const a = y0 + 60 + i * bay;
        const b = a + bay - 3;
        const left = side === 0;
        const outerA = left ? x0 - overlap : x1 - 5;
        const outerB = left ? x0 + 5 : x1 + overlap;
        const outline = booleans.subtract(
          box(outerA, outerB, a, b, bottom, bottom + frontHeight),
          box(outerA - overlap, outerB + overlap,
            a + 3, b - 3, bottom + 3, bottom + frontHeight - 3),
        );
        cuts.push(outline);
        const mid = (a + b) / 2;
        cuts.push(box(
          left ? x0 - overlap : x1 - 10,
          left ? x0 + 10 : x1 + overlap,
          mid - 50, mid + 50,
          bottom + frontHeight - 40, bottom + frontHeight - 20,
        ));
      }
    }
    if (cuts.length > 0) shell = booleans.subtract(shell, ...cuts);
    frame.push(shell);
    deck(z);
  }

  function upperGuards(deckTop, cot) {
    // Full-height posts join the lower structure and all guard rails.
    for (const x of [x0, x1 - 50]) {
      for (const y of [y0, y1 - 50]) {
        frame.push(box(x, x + 50, y, y + 50, 0, h));
      }
    }
    perimeter(h, 35);

    const supportSize = cot ? 20 : 30;
    const maxPitch = cot ? 80 : 500;
    const startZ = deckTop - overlap;
    const endZ = h - 35 + overlap;

    // Along both long sides.
    const longSpan = l - 100;
    const longIntervals = Math.ceil((longSpan + supportSize) / maxPitch);
    for (let i = 1; i < longIntervals; i += 1) {
      const y = y0 + 50 + longSpan * i / longIntervals;
      for (const x of [x0, x1 - supportSize]) {
        frame.push(box(x, x + supportSize,
          y - supportSize / 2, y + supportSize / 2, startZ, endZ));
      }
    }

    // Along both ends.
    const shortSpan = w - 100;
    const shortIntervals = Math.ceil((shortSpan + supportSize) / maxPitch);
    for (let i = 1; i < shortIntervals; i += 1) {
      const x = x0 + 50 + shortSpan * i / shortIntervals;
      for (const y of [y0, y1 - supportSize]) {
        frame.push(box(x - supportSize / 2, x + supportSize / 2,
          y, y + supportSize, startZ, endZ));
      }
    }

    if (q.headboard !== 'none') {
      const panelHeight = cot
        ? (q.headboard === 'tall' ? 300 : 150)
        : (q.headboard === 'tall' ? 300 : 180);
      const bottom = cot ? h - panelHeight : deckTop - overlap;
      const top = cot ? h : deckTop + panelHeight;
      frame.push(box(x0 + 45, x1 - 45, y1 - t, y1, bottom, top));
    }
    if (q.footboard) {
      const bottom = cot ? h - 150 : deckTop - overlap;
      const top = cot ? h : deckTop + 180;
      frame.push(box(x0 + 45, x1 - 45, y0, y0 + t, bottom, top));
    }
  }

  if (q.variant === 'cot') {
    // Mattress top is h - 300; its bottom overlaps the deck by 5 mm.
    const deckTop = h - 300 - 80 + overlap;
    perimeter(deckTop, 80);
    deck(deckTop);
    mattress(deckTop, 80);
    upperGuards(deckTop, true);
  } else if (q.variant === 'bunk') {
    const lowerTop = 350;
    const upperTop = h - 400;
    if (q.drawers > 0) {
      storage(lowerTop);
    } else {
      perimeter(lowerTop, 180);
      deck(lowerTop);
    }
    perimeter(upperTop, 180);
    deck(upperTop);
    mattress(lowerTop, 180);
    mattress(upperTop, 180);
    upperGuards(upperTop, false);

    // Ladder is kept inside the overall width/length envelope.
    const a = x1 - 180;
    const b = a + 140;
    const ladderTop = upperTop + 100;
    frame.push(
      box(a - 15, a + 15, y0, y0 + 35, 0, ladderTop),
      box(b - 15, b + 15, y0, y0 + 35, 0, ladderTop),
    );
    for (let z = 200; z <= upperTop; z += 200) {
      frame.push(box(a + 10, b - 10, y0, y0 + 35, z - 15, z + 15));
    }
  } else {
    const railHeight = q.variant === 'platform' ? 80 : 180;
    if (q.variant === 'storage_bed' || q.drawers > 0) {
      storage(h);
    } else {
      perimeter(h, railHeight);
      deck(h);
      legs(h - railHeight + overlap);
    }
    mattress(h, 180);

    if (q.headboard !== 'none') {
      const rise = q.headboard === 'tall' ? 600 : 300;
      frame.push(box(x0, x1, y1 - t, y1, h - overlap, h + rise));
    }
    if (q.footboard) {
      frame.push(box(x0, x1, y0, y0 + t, h - overlap, h + 200));
    }
    if (q.variant === 'daybed') {
      frame.push(box(x1 - t, x1, y0, y1, h - overlap, h + 300));
    }
  }

  return {
    frame: combine(frame),
    mattress: combine(mattresses),
  };
}