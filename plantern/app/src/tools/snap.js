import { add, mul } from '../geometry/vec.js';
import { facePoint, hasBody } from '../geometry/walls.js';

/**
 * The single snap-point registry. Every tool gets points only from here and refers to them by `ref`.
 * Returns [{ ref, pos:[x,y], kind, pri, level }]. Lower pri wins when candidates are equally near.
 */
export function collectSnapPoints(model, level, geo) {
  const out = [], P = (ref, pos, kind, pri) => pos && out.push({ ref, pos, kind, pri, level: level.id });
  for (const r of level.rooms || []) r.polygon.forEach((p, i) => P(`${r.id}#p${i}`, p, 'room corner', 1));
  for (const w of level.walls || []) {
    if (w.kind === 'virtual') continue;
    const f = geo.frames.get(w.id);
    P(`${w.id}#a`, w.a, 'wall end', 1);
    P(`${w.id}#b`, w.b, 'wall end', 1);
    if (hasBody(w)) {
      const cap = geo.caps.get(w.id);
      // Face corners sit at the joined corner (after mitre/butt), i.e. where the wall really ends.
      for (const end of ['a', 'b']) for (const side of ['left', 'right']) P(`${w.id}#${end}.${side}`, facePoint(w, f, side, cap[end][side]), 'wall face corner', 2);
    }
    P(`${w.id}#mid`, add(w.a, mul(f.u, f.L / 2)), 'wall midpoint', 4);
  }
  for (const o of level.openings || []) {
    const w = geo.wallById.get(o.wall);
    if (!w) continue;
    const f = geo.frames.get(w.id);
    for (const [nm, s] of [['near', o.offset], ['far', o.offset + o.width]]) for (const side of ['left', 'right']) P(`${o.id}#${nm}.${side}`, facePoint(w, f, side, s), 'opening edge', 2);
  }
  for (const s of level.solids || []) s.polygon.forEach((p, i) => P(`${s.id}#p${i}`, p, 'solid corner', 1));
  for (const o of level.objects || []) {
    (geo.objectFootprint(o) || []).forEach((p, i) => P(`${o.id}#c${i}`, p, 'object corner', 2));
    if (o.attach) P(`${o.id}#attach`, geo.resolveAttach(o.attach)?.p, 'attach point', 1);
  }
  for (const fx of level.fixtures || []) P(`${fx.id}#${fx.attach ? 'attach' : 'pos'}`, geo.fixturePos(fx), 'fixture', 1);
  // stairs: the corners of what they cover (when the level's geometry has them worked out, buildModelGeometry)
  for (const s of geo.stairs || []) (s.layout?.outline || []).forEach((p, i) => P(`${s.id}#p${i}`, p, 'stairs corner', 2));
  for (const an of model.anchors || []) {
    if (an.level === level.id) P(`${an.id}#${level.id}`, an.pos, 'anchor', 1);
    if (Array.isArray(an.points?.[level.id])) P(`${an.id}#${level.id}`, an.points[level.id], 'anchor', 1);   // a point given as a position (a ref is already a point)
  }
  return out;
}

/**
 * The lines ("planes" seen from above) tools can measure to: wall faces (between the joined corners),
 * room edges and faces of solids. [{ ref, a, b, kind }]; refs `w_x#left`, `r_x#e2`, `s_x#f1`.
 */
export function collectSnapLines(model, level, geo) {
  const out = [];
  for (const r of level.rooms || []) r.polygon.forEach((p, i) => out.push({ ref: `${r.id}#e${i}`, a: p, b: r.polygon[(i + 1) % r.polygon.length], kind: 'room edge' }));
  for (const w of level.walls || []) {
    if (!hasBody(w)) continue;
    const f = geo.frames.get(w.id), cap = geo.caps.get(w.id);
    for (const side of ['left', 'right']) out.push({ ref: `${w.id}#${side}`, a: facePoint(w, f, side, cap.a[side]), b: facePoint(w, f, side, cap.b[side]), kind: 'wall face' });
  }
  for (const s of level.solids || []) (s.polygon || []).forEach((p, i) => out.push({ ref: `${s.id}#f${i}`, a: p, b: s.polygon[(i + 1) % s.polygon.length], kind: 'solid face' }));
  return out.filter(l => Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) > 1);
}

/**
 * The levels next to `level` in the same building: the one just below and the one just above, by
 * elevation (PLANTERN.md §5). All levels of a building share the plan's x/y, so a point of a
 * neighbour is a valid place to start a room, a solid or a wall on this level.
 */
export function adjacentLevels(model, level) {
  const same = (model.levels || []).filter(l => l.id !== level.id && (l.building ?? null) === (level.building ?? null));
  const below = same.filter(l => l.elevation < level.elevation).sort((a, b) => b.elevation - a.elevation)[0];
  const above = same.filter(l => l.elevation > level.elevation).sort((a, b) => a.elevation - b.elevation)[0];
  return [below, above].filter(Boolean);
}

/** Kinds worth placing something against when it is on another level: the corners that mark a building's shape. */
const ADJACENT_KINDS = new Set(['room corner', 'wall end', 'wall face corner', 'solid corner']);

/**
 * Snap points of the levels next to `level` (room corners = inner faces, wall face corners = inner and
 * outer faces, wall ends, solid corners), for placing rooms on a new level against the one below or
 * above. Refs are the same symbolic refs as on their own level (ids are unique per file), so a start
 * `r_kitchen#p0` works from any level. Each point carries `level` (where it is), `relation` ('below' |
 * 'above') and `adjacent: true`;
 * their priority is lowered so a point of this level always wins an equal choice.
 * `geoOf(level)` returns the level's derived geometry.
 */
export function collectAdjacentSnapPoints(model, level, geoOf) {
  const out = [];
  for (const nb of adjacentLevels(model, level)) {
    const relation = nb.elevation < level.elevation ? 'below' : 'above';
    for (const p of collectSnapPoints(model, nb, geoOf(nb))) if (ADJACENT_KINDS.has(p.kind)) out.push({ ...p, pri: p.pri + 10, adjacent: true, relation });
  }
  return out;
}

/** This level's snap points followed by those of its neighbours (see collectAdjacentSnapPoints). */
export const collectSnapPointsAround = (model, level, geoOf) => [...collectSnapPoints(model, level, geoOf(level)), ...collectAdjacentSnapPoints(model, level, geoOf)];

/**
 * What a plan can show faintly of the neighbouring levels so rooms can be placed against it:
 * [{ level, relation: 'below' | 'above', walls: [polygon…], rooms: [polygon…], named: [{ id, name, polygon }] }],
 * wall bodies as built.
 */
export function adjacentOutlines(model, level, geoOf) {
  return adjacentLevels(model, level).map(nb => {
    const geo = geoOf(nb);
    const named = (nb.rooms || []).filter(r => r.polygon?.length >= 3).map(r => ({ id: r.id, name: r.name || r.id, polygon: r.polygon }));
    return { level: nb.id, name: nb.name || nb.id, relation: nb.elevation < level.elevation ? 'below' : 'above', walls: [...geo.pieces.values()].flat(), rooms: named.map(r => r.polygon), named };
  });
}
