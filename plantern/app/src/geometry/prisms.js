import { add, mul } from './vec.js';
import { facePoint, centrePoint, wallProfile, hasBody } from './walls.js';
import { resolveSide } from '../model/materials.js';
import { solidStretches, solidTop, clipConvex, quadOrder } from './solids.js';
import { solidCircle } from './circle.js';
import { wallLookPieces } from './paint.js';
import { pointInPolygon } from './polygon.js';
import { stairSolids, stairRails } from './stairs.js';
import { openingFittings } from './fittings.js';
import { doorOpen } from '../model/doors.js';
import { roomCeiling } from '../model/rooms.js';

/** Default colours; model colours (sides.*.color, solid/object color) win. */
export const DEFAULT_COLORS = Object.freeze({
  wall: '#e6e2da', wallTop: '#9a958c', railing: '#3a3d42', glass: '#9fd3ff',
  ceiling: '#f2efe8', floor: '#c8b293', floorExterior: '#8f8f86', solid: '#6b4f3a', object: '#888888', stair: '#b59f7e', handrail: '#6b5442',
});

const RAIL_CAP = 50;   // mm: solid top rail of a railing
const SEEN_BELOW = 600; // mm: how far below a floor the stairs seen through its opening are drawn
const CEILING = 30;     // mm: thickness of a ceiling plate, above the ceiling line
const PAINT = 3;       // mm: the paint skin on a solid's face where a room has its own look for it

/**
 * All vertical prisms of a level in plan coordinates (mm, z relative to the level's finished floor).
 * Pure: the 3D renderer only extrudes these, so every rule about what is solid lives here.
 * Prism: { id, kind, poly, z0, z1, color, sides?: { left, right, other, n, u, tex? }, slope?, opacity? }
 *   slope (sloped walls): { top?, bottom? }, each { origin, u, L, a, b }: the height runs straight from
 *   a (at origin) to b (L mm along u); z0 / z1 are then the lowest and highest points.
 *   bar: { a, b, diameter } a round cylinder between two 3D points, ball: { center, diameter }, circle: { center, diameter } an upright round solid
 *   (round handrails, round pillars): the renderer draws those, `poly` and z0 / z1 are their outline in plan and their extent.
 *   kind: floor | ceiling | wall | railing | rail | glass | frame | leaf | sill | handrail | post | solid | paint | object
 *   frame, leaf, sill, glass: what fills an opening (geometry/fittings.js)
 *   paint: a thin skin on the stretch of a solid's face along a room painted for that room (solids[].sides)
 *   sides: colours of the wall's left / right faces (and top and ends), n = its left normal, u = its
 *   direction; tex = { left?, right? } { texture, uvScale } when that side's material has an image.
 * `materials` = the model's materials table (sides may name one instead of a colour).
 * `options.ceilings`: draw a ceiling plate over every indoor room (default: only over rooms with their own lower ceiling, translucent,
 * so the lamps under them still show from above; decision 127).
 */
export function levelPrisms(level, geo, materials = {}, options = {}) {
  const out = [], P = p => out.push(p);
  const ft = level.floorThickness ?? 0;

  // floors: a room with floor "none" is open to the level below (no slab); floorOffset raises its floor (a step);
  // the openings stairs from below make in the floor are cut out of the room they lie in
  for (const r of level.rooms || []) {
    if (r.floor === 'none') continue;
    const holes = (geo.holes || []).filter(h => pointInPolygon([h.poly.reduce((s, p) => s + p[0], 0) / h.poly.length, h.poly.reduce((s, p) => s + p[1], 0) / h.poly.length], r.polygon)).map(h => h.poly);
    P({ id: r.id, kind: 'floor', poly: r.polygon, z0: r.exterior ? -Math.min(ft, 150) : -ft, z1: r.floorOffset ?? 0,
        color: r.floorColor || (r.exterior ? DEFAULT_COLORS.floorExterior : DEFAULT_COLORS.floor), ...(holes.length ? { holes } : {}) });
  }

  // ceilings: a room with its own lower ceiling always has its plate (translucent, so it can be seen through from above); with
  // `options.ceilings` every indoor room has one, opaque (for a view from inside)
  for (const r of level.rooms || []) {
    if (r.exterior || !(r.polygon?.length >= 3)) continue;
    const lowered = Number.isFinite(r.ceilingHeight) && r.ceilingHeight < (level.ceilingHeight ?? 2400) - 1;
    if (!lowered && !options.ceilings) continue;
    const top = roomCeiling(level, r);
    P({ id: r.id, kind: 'ceiling', poly: r.polygon, z0: top, z1: top + CEILING, color: r.ceilingColor || DEFAULT_COLORS.ceiling, ...(options.ceilings ? {} : { opacity: 0.45 }) });
  }

  // stairs starting here: one block per step from the floor up to its surface (open undersides: a thin tread)
  for (const s of geo.stairs || []) {
    if (!s.layout) continue;
    for (const b of stairSolids(s.layout, s.stairs)) P({ id: s.id, kind: 'stair', ...b, color: DEFAULT_COLORS.stair });
    // its handrail and posts (decision 125)
    for (const { rail, post, ...b } of stairRails(s.layout, s.stairs)) P({ id: s.id, kind: post ? 'post' : 'handrail', ...b, color: DEFAULT_COLORS.handrail });
  }
  // stairs arriving from below: the steps seen through the opening in this floor, from their own floor up (below this level's floor)
  const seen = new Set();
  for (const h of geo.holes || []) {
    if (seen.has(h.id) || !h.layout) continue;
    seen.add(h.id);
    // only a bit of them: down to SEEN_BELOW under the slab, the rest is in the dark below
    const lowest = -ft - SEEN_BELOW;
    for (const b of stairSolids(h.layout, h.stairs, { steps: h.blocks, dz: -h.drop })) {
      if (b.z1 <= lowest) continue;
      const cut = b.z0 < lowest;
      P({ id: h.id, kind: 'stair', ...b, ...(cut ? { z0: lowest, slope: b.slope?.top ? { top: b.slope.top } : undefined } : {}), color: DEFAULT_COLORS.stair });
    }
  }

  for (const w of level.walls || []) {
    if (!hasBody(w)) continue;
    const f = geo.frames.get(w.id), prof = wallProfile(w, level), { base, top } = prof;
    const T = resolveSide(w.sides?.top, materials);
    // the colours (and textures) of the two faces; a side left on default gets the default colour, not the other side's
    const sidesFor = (lSpec, rSpec) => {
      const L = resolveSide(lSpec, materials), R = resolveSide(rSpec, materials), tex = {};
      if (L?.texture) tex.left = { texture: L.texture, uvScale: L.uvScale };
      if (R?.texture) tex.right = { texture: R.texture, uvScale: R.uvScale };
      return { left: L?.color || DEFAULT_COLORS.wall, right: R?.color || DEFAULT_COLORS.wall, other: T?.color || DEFAULT_COLORS.wallTop, n: f.n, u: f.u, ...(tex.left || tex.right ? { tex } : {}) };
    };
    const left = resolveSide(w.sides?.left, materials)?.color, right = resolveSide(w.sides?.right, materials)?.color;
    // a wall painted per room (roomSides) is split where its look changes; each part has its own faces
    const looks = polys => wallLookPieces(w, f, polys, level.rooms).map(lp => ({ poly: lp.poly, sides: sidesFor(lp.left, lp.right) }));
    // a sloped wall: its top (and bottom) run straight from the a end to the b end, or level for a stretch at
    // either end first (flatA / flatB). Pieces are split where a slope starts or ends, so each part's top and
    // bottom are one straight line: { origin, u, L, a, b } (shift lowers it, for a railing's cap)
    const { bottom: eb, top: et } = prof.ends;
    const lineOf = (which, s, shift = 0) => { const g = prof.segment(which, s), s0 = Math.max(g.s0, -1e5), s1 = Math.min(g.s1, f.L + 1e5); return { origin: add(w.a, mul(f.u, s0)), u: f.u, L: (s1 - s0) || 1, a: g.h0 - shift, b: g.h1 - shift }; };
    const slopeParts = polys => !prof.sloped ? polys.map(poly => ({ poly })) : polys.flatMap(poly => {
      const loc = p => [(p[0] - w.a[0]) * f.u[0] + (p[1] - w.a[1]) * f.u[1], (p[0] - w.a[0]) * f.n[0] + (p[1] - w.a[1]) * f.n[1]];
      const world = ([s, t]) => [w.a[0] + f.u[0] * s + f.n[0] * t, w.a[1] + f.u[1] * s + f.n[1] * t];
      let parts = [poly.map(loc)];
      // also at the wall's own ends: a mitred corner reaching past an end stays level at that end's height
      // (otherwise the slope would run on into the corner and the two walls' tops would not meet)
      for (const c of [0, f.L, ...prof.breaks]) parts = parts.flatMap(P => [clipConvex(P, p => c - p[0]), clipConvex(P, p => p[0] - c)]).filter(P => P.length >= 3 && Math.max(...P.map(p => p[0])) - Math.min(...P.map(p => p[0])) > 0.5);
      return parts.map(P => ({ poly: quadOrder(P).map(world), s: (Math.min(...P.map(p => p[0])) + Math.max(...P.map(p => p[0]))) / 2 }));
    });

    if (w.kind === 'railing') {
      const color = left || right || DEFAULT_COLORS.railing, capLine = { a: et.a - RAIL_CAP, b: et.b - RAIL_CAP };
      for (const poly of geo.pieces.get(w.id)) {
        if (!prof.sloped) {
          P({ id: w.id, kind: 'railing', poly, z0: base, z1: Math.max(base, top - RAIL_CAP), color, opacity: 0.35 });
          P({ id: w.id, kind: 'rail', poly, z0: Math.max(base, top - RAIL_CAP), z1: top, color });
        } else for (const sp of slopeParts([poly])) {
          // a railing along a stair: body and rail follow the slope
          P({ id: w.id, kind: 'railing', poly: sp.poly, z0: base, z1: top - RAIL_CAP, color, opacity: 0.35, slope: { bottom: lineOf('bottom', sp.s), top: lineOf('top', sp.s, RAIL_CAP) } });
          P({ id: w.id, kind: 'rail', poly: sp.poly, z0: Math.min(capLine.a, capLine.b), z1: top, color, slope: { bottom: lineOf('top', sp.s, RAIL_CAP), top: lineOf('top', sp.s) } });
        }
      }
      continue;
    }

    // A full wall standing on the floor continues down through the slab (closes the slab edge).
    const onFloor = eb.a === 0 && eb.b === 0;
    const z0 = onFloor ? -ft : base;
    const wallSlope = s => ({ top: lineOf('top', s), ...(onFloor ? {} : { bottom: lineOf('bottom', s) }) });
    for (const lp of looks(geo.pieces.get(w.id))) for (const sp of slopeParts([lp.poly])) P({ id: w.id, kind: 'wall', poly: sp.poly, z0, z1: top, color: lp.sides.right, sides: lp.sides, ...(prof.sloped ? { slope: wallSlope(sp.s) } : {}) });

    // Parts of the wall below the sill and above the head of each opening.
    for (const o of (level.openings || []).filter(o => o.wall === w.id)) {
      const s0 = o.offset, s1 = o.offset + o.width;
      const quad = [facePoint(w, f, 'left', s0), facePoint(w, f, 'left', s1), facePoint(w, f, 'right', s1), facePoint(w, f, 'right', s0)];
      const lowAt = Math.max(prof.at(s0).base, prof.at(s1).base), highAt = Math.min(prof.at(s0).top, prof.at(s1).top);
      const sill = Math.max(o.sill ?? 0, lowAt), head = Math.min(o.head ?? highAt, highAt);
      // below the opening, down to where the wall itself starts (through the slab for a wall on the floor):
      // a doorway at floor level gets a threshold whose top is the floor, so the floor runs through it
      if (sill > lowAt) for (const lp of looks([quad])) for (const sp of slopeParts([lp.poly])) P({ id: o.id, kind: 'wall', poly: sp.poly, z0, z1: sill, color: lp.sides.right, sides: lp.sides, ...(prof.sloped && !onFloor ? { slope: { bottom: lineOf('bottom', sp.s) } } : {}) });
      else if (z0 < base) P({ id: o.id, kind: 'floor', poly: quad, z0, z1: base, color: DEFAULT_COLORS.floor });
      if (head < highAt || (prof.sloped && head < top)) for (const lp of looks([quad])) for (const sp of slopeParts([lp.poly])) P({ id: o.id, kind: 'wall', poly: sp.poly, z0: head, z1: top, color: lp.sides.right, sides: lp.sides, ...(prof.sloped ? { slope: { top: lineOf('top', sp.s) } } : {}) });
      // what fills the opening: a window's frame, sash, glass and sill board; a door's casing and closed leaf (geometry/fittings.js)
      for (const fit of openingFittings(w, f, { ...o, sill, head }, { open: doorOpen(o, options.doorStates) })) P(fit);
    }
  }

  for (const s of level.solids || []) {
    const base = s.base ?? 0;
    const z1 = solidTop(s, level);                                   // a beam without a height reaches the ceiling
    const circle = solidCircle(s);                                   // a round pillar: a smooth cylinder in 3D
    P({ id: s.id, kind: 'solid', poly: s.polygon, z0: base, z1, color: s.color || DEFAULT_COLORS.solid, ...(circle ? { circle } : {}) });
    // painted per room: a skin a few mm thick in front of each stretch of face along that room
    if (s.sides) for (const st of solidStretches(s, level.rooms)) {
      const look = resolveSide(s.sides[st.room], materials);
      if (!look?.color && !look?.texture) continue;
      const L = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]), u = [(st.b[0] - st.a[0]) / L, (st.b[1] - st.a[1]) / L], d = mul(st.out, PAINT);
      const c = look.color || s.color || DEFAULT_COLORS.solid;
      P({ id: s.id, kind: 'paint', poly: [st.a, st.b, add(st.b, d), add(st.a, d)], z0: base, z1, color: c,
          sides: { left: c, right: c, other: c, n: st.out, u, ...(look.texture ? { tex: { left: { texture: look.texture, uvScale: look.uvScale } } } : {}) } });
    }
  }
  for (const o of level.objects || []) {
    const fp = geo.objectFootprint(o);
    const z = geo.objectZ(o);
    if (fp) P({ id: o.id, kind: 'object', poly: fp, z0: z, z1: z + o.size[2], color: o.color || DEFAULT_COLORS.object });
  }
  return out;
}
