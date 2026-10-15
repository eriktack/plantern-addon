import { add, mul } from './vec.js';
import { polylineMid } from './strip.js';
import { fixtureHeight, stripForm } from '../model/fixtures.js';
import { openingSymbol } from './openings.js';
import { isHingedDoor, doorOpen } from '../model/doors.js';
import { wallFrame, wallJoins, wallPieces, hasBody, facePoint, centrePoint, wallProfile } from './walls.js';
import { cutWallPieces, clipConvex } from './solids.js';
import { isConvex, signedArea, pointInPolygon, distToOutline, triangulate } from './polygon.js';
import { stairLayout, stairStart, stairOpening, openingRectPoly, unionOutlines } from './stairs.js';
import { collectSnapPointsAround } from '../tools/snap.js';
import { DEFAULT_SETTINGS } from '../model/settings.js';

/**
 * Derive all plan geometry for one level. Pure: model in, geometry out.
 * Renderers and tools read geometry only from here; nothing is cached across model edits.
 */
export function buildLevelGeometry(level) {
  const walls = level.walls || [], openings = level.openings || [];
  const { caps, issues } = wallJoins(walls, level);
  const frames = new Map(walls.map(w => [w.id, wallFrame(w)]));
  const wallById = new Map(walls.map(w => [w.id, w]));
  // wall bodies between openings, cut where a solid that walls give way to stands (solids[].cutsWalls)
  const pieces = new Map(walls.filter(hasBody).map(w => [w.id, cutWallPieces(w, frames.get(w.id), wallPieces(w, frames.get(w.id), caps.get(w.id), openings), level.solids)]));

  /** The single attach resolver: { wall, side, offset, gap? } → point on that face, outward direction, wall frame. */
  function resolveAttach(at) {
    const w = wallById.get(at.wall);
    if (!w) return null;
    const f = frames.get(w.id), side = at.side === 'left' ? 'left' : 'right';
    const dir = mul(f.n, side === 'left' ? 1 : -1);
    return { wall: w, frame: f, side, dir, p: add(facePoint(w, f, side, at.offset), mul(dir, at.gap || 0)) };
  }

  /**
   * The polyline of an LED strip (decisions 121, 122): along a wall face from attach.offset for attach.length; along one side
   * (attach.edge) of an object's footprint; or along an opening's width on the wall face (attach.side). It is worked out here, from
   * what the strip is attached to, so it follows it. null for other fixtures and when the target is missing.
   */
  function fixtureLine(fx) {
    const form = stripForm(fx);
    if (form === 'wall') {
      // a vertical strip is a point on the face (its length runs up, see fixtureHeight)
      if (fx.attach.vertical === true) { const a = resolveAttach(fx.attach); return a ? [a.p, a.p] : null; }
      const a = resolveAttach(fx.attach), b = resolveAttach({ ...fx.attach, offset: fx.attach.offset + (fx.attach.length || 0) });
      return a && b ? [a.p, b.p] : null;
    }
    if (form === 'object') {
      const ob = (level.objects || []).find(x => x.id === fx.attach.object), fp = ob && objectFootprint(ob);
      if (!fp || fp.length < 2) return null;
      // along one side of the footprint, optionally only from attach.offset for attach.length and set back attach.inset towards the middle
      const p = fp[fx.attach.edge % fp.length], q = fp[(fx.attach.edge + 1) % fp.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L], c = [fp.reduce((s, v) => s + v[0], 0) / fp.length, fp.reduce((s, v) => s + v[1], 0) / fp.length];
      let n = [-u[1], u[0]];
      if (n[0] * (c[0] - (p[0] + q[0]) / 2) + n[1] * (c[1] - (p[1] + q[1]) / 2) < 0) n = [-n[0], -n[1]];
      const off = Math.min(Math.max(fx.attach.offset ?? 0, 0), L), len = Math.min(fx.attach.length ?? L - off, L - off), inset = fx.attach.inset ?? 0;
      const a = [p[0] + u[0] * off + n[0] * inset, p[1] + u[1] * off + n[1] * inset];
      return [a, [a[0] + u[0] * len, a[1] + u[1] * len]];
    }
    if (form === 'opening') {
      const o = (level.openings || []).find(x => x.id === fx.attach.opening);
      const a = o && resolveAttach({ wall: o.wall, side: fx.attach.side, offset: o.offset }), b = o && resolveAttach({ wall: o.wall, side: fx.attach.side, offset: o.offset + o.width });
      return a && b ? [a.p, b.p] : null;
    }
    return null;
  }
  const fixtureZ = fx => fixtureHeight(fx, level);
  const fixturePos = fx => (fx.kind === 'strip' ? (fixtureLine(fx) && polylineMid(fixtureLine(fx))) : fx.attach ? resolveAttach(fx.attach)?.p : fx.pos) ?? null;

  /** Footprint of an attached box object: width along the wall, depth away from the face. */
  function objectFootprint(o) {
    if (!o.attach) {
      const [w, d] = o.size, r = (o.rotationDeg || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), p = o.pos;
      return [[0, 0], [w, 0], [w, d], [0, d]].map(([x, y]) => [p[0] + x * c - y * s, p[1] + x * s + y * c]);
    }
    const a = resolveAttach(o.attach);
    if (!a) return null;
    const [w, d] = o.size, p1 = add(a.p, mul(a.frame.u, w));
    return [a.p, p1, add(p1, mul(a.dir, d)), add(a.p, mul(a.dir, d))];
  }

  function openingLine(o) {
    const w = wallById.get(o.wall);
    if (!w) return null;
    const f = frames.get(w.id);
    return [centrePoint(w, f, o.offset), centrePoint(w, f, o.offset + o.width)];
  }

  return { level, walls, wallById, frames, caps, pieces, issues, resolveAttach, fixturePos, fixtureLine, fixtureZ, objectFootprint, openingLine };
}

/**
 * What a room's name should not be written over (roomNameLayout's `avoid`): free-standing lamps as
 * points; furniture, solids, stairs and the sweep of door leaves as outlines. geo from buildLevelGeometry() (stairs
 * only when it came from buildModelGeometry()).
 */
export function labelObstacles(level, geo) {
  return [
    ...(level.fixtures || []).filter(x => x.pos).map(x => x.pos),
    ...(level.objects || []).map(o => geo?.objectFootprint?.(o)).filter(fp => fp?.length >= 3),
    ...(level.solids || []).map(x => x.polygon).filter(p => p?.length >= 3),
    ...(geo?.stairs || []).map(st => st.layout?.outline).filter(p => p?.length >= 3),
    // where a door leaf swings: the square the arc sweeps
    ...(level.openings || []).flatMap(o => {
      const w = geo?.wallById?.get(o.wall), f = w && geo.frames.get(w.id);
      return f ? openingSymbol(w, f, o).arcs.map(a => [a.c, a.from, [a.from[0] + a.to[0] - a.c[0], a.from[1] + a.to[1] - a.c[1]], a.to]) : [];
    }),
  ];
}

/** Light-blocking default per wall kind; `lightBlocking` overrides. */
export const isOpaque = w => (w.lightBlocking ? w.lightBlocking === 'opaque' : w.kind === 'wall');

/**
 * Occluder segments for 2D light: opaque wall pieces, solids, and closed openings (windows, doors).
 * A wall or solid above the plan's cut height (a lintel, boxing under the ceiling) lets the light pass in the plan.
 */
export function occluders(geo, { cutPlane = 1200, doorStates = null } = {}) {
  const segs = [], ring = r => r.forEach((p, i) => segs.push([p, r[(i + 1) % r.length]]));
  for (const w of geo.walls) if (isOpaque(w) && wallProfile(w, geo.level).base < cutPlane) (geo.pieces.get(w.id) || []).forEach(ring);
  (geo.level.solids || []).filter(s => (s.base ?? 0) < cutPlane && s.polygon?.length >= 3).forEach(s => ring(s.polygon));
  for (const o of geo.level.openings || []) {
    if (o.type === 'passage') continue;
    const w = geo.wallById.get(o.wall);
    if (!w || !isOpaque(w)) continue;
    // an open hinged door lets light past its gap: only the leaf, swung out, blocks it (model/doors.js)
    if (isHingedDoor(o) && doorOpen(o, doorStates)) { segs.push(...openingSymbol(w, geo.frames.get(w.id), o, { open: true }).lines); continue; }
    const l = geo.openingLine(o);
    if (l) segs.push(l);
  }
  return segs;
}

/**
 * Derived geometry of every level of a model, with the stairs worked out (they need the level they go to):
 * `geo.stairs` = [{ id, stairs, to, pos, rise, layout, opening, error? }] for stairs starting on that level and
 * `geo.holes` = [{ id, from, poly }] the openings that stairs arriving from below make in its floor.
 * `headroom` (mm, or a function of the level) is settings.stairHeadroom. Returns Map(levelId → geo).
 */
export function buildModelGeometry(model, { headroom = DEFAULT_SETTINGS.stairHeadroom } = {}) {
  const geos = new Map(model.levels.map(l => [l.id, buildLevelGeometry(l)]));
  for (const geo of geos.values()) { geo.stairs = []; geo.holes = []; }
  const head = lv => (typeof headroom === 'function' ? headroom(lv) : headroom);
  for (const lv of model.levels) {
    if (!(lv.stairs || []).length) continue;
    const snaps = new Map(collectSnapPointsAround(model, lv, l => geos.get(l.id)).map(s => [s.ref, s.pos]));
    for (const st of lv.stairs) {
      const to = model.levels.find(l => l.id === st.to), entry = { id: st.id, stairs: st, to: st.to, level: lv.id };
      geos.get(lv.id).stairs.push(entry);
      if (!to) { entry.error = `it goes to level "${st.to}", which does not exist`; continue; }
      const start = stairStart(st, ref => snaps.get(ref));
      if (start.error) { entry.error = start.error; continue; }
      entry.pos = start.pos;
      entry.rise = to.elevation - lv.elevation;
      const layout = stairLayout(st, start.pos, entry.rise);
      if (layout.error) { entry.error = layout.error; continue; }
      entry.layout = layout;
      // the opening in the floor above: the steps whose surface plus headroom reaches the slab's underside
      const under = to.elevation - (to.floorThickness ?? 0) - lv.elevation;
      entry.under = under;
      entry.headroom = head(lv);
      const hole = stairOpening(layout, under, entry.headroom);
      // a hand-given polygon, else a rectangle (fixes list 8), else the steps' own hole
      const manual = Array.isArray(st.opening) && st.opening.length >= 3 ? [st.opening] : st.openingRect ? [openingRectPoly(st.openingRect, layout.flights[0].o)] : null;
      // the opening is cut at the edge of the floor above: a part past the rooms' edge is not an opening (fixes the BBV28 upper hall)
      const floor = openingOnFloor(manual ?? hole.hole, to);
      entry.opening = floor.polys;
      entry.trimmed = floor.trimmed;
      entry.openingSteps = hole.steps;
      const down = [...layout.arrow].reverse();
      for (const poly of entry.opening) geos.get(to.id).holes.push({ id: st.id, from: lv.id, poly, steps: hole.steps.map(s => s.poly), arrow: down, blocks: hole.steps, layout, stairs: st, drop: to.elevation - lv.elevation });
    }
  }
  return geos;
}

/**
 * The parts of a stair's opening that lie on the floor of `level` (its rooms without floor "none"): an opening past a
 * room's edge is cut at that edge. `trimmed` is true when a corner of it lies in no room (so something was cut off).
 * A room that is not convex keeps only the pieces wholly inside it (a partly outside one would not triangulate).
 */
export function openingOnFloor(polys, level) {
  const rooms = (level.rooms || []).filter(r => r.floor !== 'none' && r.polygon?.length >= 3);
  const onRoom = (p, r) => pointInPolygon(p, r.polygon) || distToOutline(p, r.polygon) < 5;
  const trimmed = polys.some(poly => poly.some(p => !rooms.some(r => onRoom(p, r))));
  // each room as convex parts (an L-shaped room is cut into triangles), so the opening is clipped to every part of it
  const parts = rooms.flatMap(r => (isConvex(r.polygon) ? [r.polygon] : triangulate(r.polygon)));
  // both the opening and the room are cut into convex parts first: clipping a concave opening directly leaves seams that cross
  const pieces = [];
  for (const poly of polys) {
    for (const hp of isConvex(poly) ? [poly] : triangulate(poly)) {
      for (const part of parts) {
        const ccw = signedArea(part) >= 0 ? part : part.slice().reverse();
        // one edge of the room at a time: clipConvex needs a straight half-plane, and the room's inside is their intersection
        let piece = hp;
        for (let i = 0; i < ccw.length && piece.length >= 3; i++) {
          const A = ccw[i], B = ccw[(i + 1) % ccw.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
          piece = clipConvex(piece, q => ((B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0])) / L);
        }
        if (piece.length >= 3) pieces.push(piece);
      }
    }
  }
  // the pieces that touch become one outline again (one opening, not a box per piece)
  return { polys: pieces.length ? unionOutlines(pieces) : [], trimmed };
}
