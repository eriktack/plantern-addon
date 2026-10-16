// Switching where an object is placed (openings-and-lit-objects OB1b, "Placed: in the room / on a wall / in an opening").
// The switch keeps the object where it is: it works from the object's footprint and height as the plan draws them
// (geo.objectFootprint, geo.objectZ), and returns the props setObject() takes. Each switch replaces the old placement as a
// whole (attach replaces pos and rotationDeg, and the other way round). Pure.

import { isHosted } from '../model/hosted.js';
import { pointInPolygon } from '../geometry/polygon.js';
import { wallInRoom } from '../blueprints/place.js';

const deg = r => (r * 180) / Math.PI;
const round = v => Math.round(v * 10) / 10;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const middle = fp => [fp.reduce((s, v) => s + v[0], 0) / fp.length, fp.reduce((s, v) => s + v[1], 0) / fp.length];

/** 'room' (standing in the plan), 'wall' (on a wall face) or 'opening' (in an opening). */
export const placedAs = o => (isHosted(o) ? 'opening' : o.attach?.wall !== undefined ? 'wall' : 'room');

/** Distance from point p to the segment a–b, mm. */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

/**
 * The openings of the level, nearest to the object first: [{ id, wall, distance }]. The object's footprint must exist
 * (geo.objectFootprint); openings with no line (a wall missing) are left out.
 */
export function openingsNear(level, geo, o) {
  const fp = geo.objectFootprint(o);
  if (!fp) return [];
  const m = middle(fp);
  return (level.openings || [])
    .map(op => { const l = geo.openingLine(op); return l ? { id: op.id, wall: op.wall, distance: segmentDistance(m, l[0], l[1]) } : null; })
    .filter(Boolean)
    .sort((x, y) => x.distance - y.distance);
}

/**
 * The props that place the object as `to` ('room' | 'wall' | 'opening'), keeping where it is. ctx:
 *   level, geo        the level and its derived geometry (geo.objectFootprint, geo.objectZ, geo.frames, geo.resolveAttach)
 *   opening           for 'opening': the opening's id (default: the nearest on the level)
 *   at                for 'opening': 'sill' (a model that stands on a sill) or 'head' (a ceiling model)
 *   reach             for 'wall': how far a wall face may be from the object to take it (mm, default 1500)
 * Returns { props } for setObject(), or { error } with the reason for the panel.
 */
/**
 * The side of a wall (right or left of its line, as an attach has it) the rooms of the level lie on at an offset along it: the
 * face an object hosted by an opening stands on. Right when no room is found on either side.
 */
export function roomSide(level, geo, wallId, offset) {
  for (const side of ['right', 'left']) {
    const f = geo.resolveAttach({ wall: wallId, side, offset });
    const q = [f.p[0] + f.dir[0] * 100, f.p[1] + f.dir[1] * 100];
    if ((level.rooms || []).some(r => r.polygon?.length >= 3 && pointInPolygon(q, r.polygon))) return side;
  }
  return 'right';
}

export function switchPlacement(o, to, { level, geo, opening, at = 'sill', reach = 1500 }) {
  const from = placedAs(o);
  if (from === to) return { props: {} };
  const fp = geo.objectFootprint(o);
  if (!fp) return { error: 'The object has no place to switch from (its wall or opening is missing).' };
  const z = geo.objectZ(o);

  if (to === 'room') {
    // a rectangle is the same whichever corner it is measured from; the object's own axes must turn counter-clockwise
    const p0 = fp[0], p1 = fp[1], p3 = fp[3];
    const u = [p1[0] - p0[0], p1[1] - p0[1]], L = Math.hypot(u[0], u[1]) || 1, uu = [u[0] / L, u[1] / L];
    const ccw = [-uu[1], uu[0]], mirrored = dot([p3[0] - p0[0], p3[1] - p0[1]], ccw) < 0;
    const pos = mirrored ? p3 : p0;
    return { props: { pos: [round(pos[0]), round(pos[1])], rotationDeg: round(deg(Math.atan2(uu[1], uu[0]))), attach: null, z } };
  }

  if (to === 'wall') {
    const m = middle(fp), width = o.size[0];
    // the nearest wall face within reach of the object's middle, else the room's longest wall (wallInRoom)
    let best = null;
    for (const w of level.walls || []) {
      if (w.kind === 'virtual') continue;
      const d = segmentDistance(m, w.a, w.b);
      if (d <= reach && (!best || d < best.d)) best = { w, d };
    }
    let wall = null;
    if (best) {
      const f = geo.frames.get(best.w.id);
      const side = dot([m[0] - best.w.a[0], m[1] - best.w.a[1]], f.n) > 0 ? 'left' : 'right';
      wall = { wall: best.w.id, side };
    } else {
      const room = (level.rooms || []).find(r => r.polygon?.length >= 3 && pointInPolygon(m, r.polygon));
      const fallback = room && wallInRoom(level, room.id, width);
      if (fallback) wall = { wall: fallback.wall, side: fallback.side };
    }
    if (!wall) return { error: 'No wall within reach: move it nearer a wall, or put it in a room with a wall.' };
    const f = geo.frames.get(wall.wall), w0 = level.walls.find(x => x.id === wall.wall);
    const u = f.u, along = dot([m[0] - w0.a[0], m[1] - w0.a[1]], u);
    const offset = Math.max(0, Math.round(along - width / 2));
    const face = geo.resolveAttach({ wall: wall.wall, side: wall.side, offset });
    const depth = dot([m[0] - face.p[0], m[1] - face.p[1]], face.dir) - o.size[1] / 2;
    const gap = Math.max(0, Math.round(depth));
    return { props: { pos: null, rotationDeg: null, attach: { wall: wall.wall, side: wall.side, offset, ...(gap > 0 ? { gap } : {}) }, z } };
  }

  if (to === 'opening') {
    const near = openingsNear(level, geo, o);
    const id = opening ?? near[0]?.id;
    if (!id) return { error: 'No openings on this level.' };
    if (!(level.openings || []).some(x => x.id === id)) return { error: `There is no opening "${id}" on this level.` };
    // the opening puts the object: its place along the opening is centred, its height is the opening's, its side is the room's (hosted.js)
    const op = level.openings.find(x => x.id === id);
    return { props: { attach: { opening: id, at, side: roomSide(level, geo, op.wall, op.offset + op.width / 2) }, pos: null, rotationDeg: null, z: null } };
  }

  return { error: `Unknown place "${to}".` };
}
