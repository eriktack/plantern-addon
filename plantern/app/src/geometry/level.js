import { add, mul } from './vec.js';
import { openingSymbol } from './openings.js';
import { wallFrame, wallJoins, wallPieces, hasBody, facePoint, centrePoint, wallProfile } from './walls.js';
import { cutWallPieces } from './solids.js';
import { stairLayout, stairStart, stairOpening } from './stairs.js';
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

  const fixturePos = fx => (fx.attach ? resolveAttach(fx.attach)?.p : fx.pos) ?? null;

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

  return { level, walls, wallById, frames, caps, pieces, issues, resolveAttach, fixturePos, objectFootprint, openingLine };
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
export function occluders(geo, { cutPlane = 1200 } = {}) {
  const segs = [], ring = r => r.forEach((p, i) => segs.push([p, r[(i + 1) % r.length]]));
  for (const w of geo.walls) if (isOpaque(w) && wallProfile(w, geo.level).base < cutPlane) (geo.pieces.get(w.id) || []).forEach(ring);
  (geo.level.solids || []).filter(s => (s.base ?? 0) < cutPlane && s.polygon?.length >= 3).forEach(s => ring(s.polygon));
  for (const o of geo.level.openings || []) {
    if (o.type === 'passage') continue;
    const w = geo.wallById.get(o.wall);
    if (!w || !isOpaque(w)) continue;
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
      entry.opening = Array.isArray(st.opening) && st.opening.length >= 3 ? [st.opening] : hole.hole;
      entry.openingSteps = hole.steps;
      const down = [...layout.arrow].reverse();
      for (const poly of entry.opening) geos.get(to.id).holes.push({ id: st.id, from: lv.id, poly, steps: hole.steps.map(s => s.poly), arrow: down, blocks: hole.steps, layout, stairs: st, drop: to.elevation - lv.elevation });
    }
  }
  return geos;
}
