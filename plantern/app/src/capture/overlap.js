// Does a (new or edited) room polygon collide with what is already there? Pure.

import { polygonsOverlap, pointInPolygon, distToOutline } from '../geometry/polygon.js';
import { buildLevelGeometry } from '../geometry/level.js';
import { applyRoom, addRoom } from '../edit/ops.js';

/**
 * Rooms and wall bodies of `level` that share floor area with `polygon`.
 * `geo` = buildLevelGeometry(level). `ignoreRoom` = the room being edited. Touching is fine; overlaps
 * thinner than `tol` mm are ignored. Returns [{ kind: 'room' | 'wall', id, name? }].
 */
export function findOverlaps(level, geo, polygon, { ignoreRoom, tol = 5 } = {}) {
  const out = [];
  for (const r of level.rooms || []) {
    if (r.id !== ignoreRoom && r.polygon?.length >= 3 && polygonsOverlap(polygon, r.polygon, tol)) out.push({ kind: 'room', id: r.id, name: r.name || r.id });
  }
  for (const w of level.walls || []) {
    if ((w.rooms || []).includes(ignoreRoom)) continue;            // a wall that bounds this room sits on its outline
    if ((geo.pieces.get(w.id) || []).some(p => polygonsOverlap(polygon, p, tol))) out.push({ kind: 'wall', id: w.id });
  }
  return out;
}

/**
 * Overlaps of a room with the plan as it will be once the room is applied: reconcile() first moves,
 * splits or re-thickens the walls that follow rooms (a guessed 300 mm wall where a closet now stands
 * 30 mm away becomes a 30 mm shared wall), then the room is checked. So only real clashes are left:
 * other rooms, hand-drawn walls, walls that stay where they are. `room` = { id?, name, exterior,
 * polygon, capture }; without an id it is checked as a new room.
 */
export function overlapsAfterApply(model, levelId, room, options = {}) {
  const r = room.id ? applyRoom(model, levelId, room, options) : addRoom(model, levelId, room, room.polygon, room.capture, options);
  const id = room.id || r.room?.id, lv = r.model.levels.find(l => l.id === levelId);
  if (r.report.errors?.length || !lv) {
    const old = model.levels.find(l => l.id === levelId);
    return old ? findOverlaps(old, buildLevelGeometry(old), room.polygon, { ignoreRoom: room.id }) : [];
  }
  return findOverlaps(lv, buildLevelGeometry(lv), room.polygon, { ignoreRoom: id });
}

/**
 * Rooms and wall bodies that contain the point `pt` (more than `tol` mm inside). Live hint while
 * measuring. Walls whose thickness is only assumed are skipped: they give way to the room anyway.
 */
export function pointCollisions(level, geo, pt, { tol = 5 } = {}) {
  const inside = poly => poly.length >= 3 && pointInPolygon(pt, poly) && distToOutline(pt, poly) > tol;
  const out = [];
  for (const r of level.rooms || []) if (inside(r.polygon || [])) out.push({ kind: 'room', id: r.id, name: r.name || r.id });
  for (const w of level.walls || []) if (!(w.from && w.assumed?.includes('thickness')) && (geo.pieces.get(w.id) || []).some(inside)) out.push({ kind: 'wall', id: w.id });
  return out;
}

export const describeOverlaps = list => list.map(o => o.kind === 'room' ? `room ${o.name || o.id}` : `wall ${o.id}`).join(', ');
