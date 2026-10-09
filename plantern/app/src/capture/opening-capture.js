// Openings measured standing in a room (openings.html). Pure: turns "on wall C of the salong, 600 mm
// from corner 3, 900 wide, hinges on the corner-3 side, opens into the salong" into an opening on
// the stored wall (which may be shared and run the other way, split in parts, or a facade along
// several rooms), and back for editing.

import { isSliding } from '../model/openings.js';
import { wallName } from './labels.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const r1 = v => Math.round(v * 10) / 10;
const unit = (p, q) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; };

/** The room's walls as measured: [{ i, name, length, p, q, from, to, walls: [wall ids along it] }]. */
export function roomWalls(level, roomId) {
  const room = (level.rooms || []).find(r => r.id === roomId);
  if (!room?.polygon) return [];
  const n = room.polygon.length;
  return room.polygon.map((p, i) => {
    const q = room.polygon[(i + 1) % n], key = `${roomId}#e${i}`;
    return { i, name: wallName(i), length: Math.round(Math.hypot(q[0] - p[0], q[1] - p[1])), p, q, from: i, to: (i + 1) % n,
      walls: (level.walls || []).filter(w => w.from?.includes(key)).map(w => w.id) };
  });
}

/** Which side of a wall (relative to its a → b) a room is on: 'left' or 'right', or null. */
export function sideOfRoom(wall, room) {
  const u = unit(wall.a, wall.b), n = [-u[1], u[0]];
  const c = room.polygon.reduce((s, p) => [s[0] + p[0] / room.polygon.length, s[1] + p[1] / room.polygon.length], [0, 0]);
  const d = dot(sub(c, wall.a), n);
  return d > 0 ? 'left' : d < 0 ? 'right' : null;
}

/**
 * Where an opening measured in the room goes. m = { edge, corner: 'start' | 'end' (the room corner
 * measured from: the edge's start or end), distance (corner to the near edge of the opening), width,
 * hingeAt?: 'corner' | 'other' (hinges on the side of that corner, or the other), into?: 'room' | 'other' }.
 * Returns { wall, offset, width, hinge?, swing? } in the stored wall's terms, or { error }.
 */
export function placeOpening(level, roomId, m) {
  const room = (level.rooms || []).find(r => r.id === roomId), e = roomWalls(level, roomId)[m.edge];
  if (!room || !e) return { error: 'pick a room and one of its walls' };
  const width = Number(m.width), dist = Number(m.distance);
  if (!(width > 0) || !(dist >= 0)) return { error: 'distance and width must be numbers of mm' };
  if (dist + width > e.length + 1) return { error: `wall ${e.name} is ${e.length} mm: ${dist} + ${width} does not fit` };
  const u = unit(e.p, e.q);
  // the two edges of the opening, as plan points; the near one is `dist` from the chosen corner
  const t0 = m.corner === 'end' ? e.length - dist - width : dist;
  const P0 = [e.p[0] + u[0] * t0, e.p[1] + u[1] * t0], P1 = [P0[0] + u[0] * width, P0[1] + u[1] * width];
  const along = (w, P) => dot(sub(P, w.a), unit(w.a, w.b));
  const host = e.walls.map(id => level.walls.find(w => w.id === id)).find(w => {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), s0 = along(w, P0), s1 = along(w, P1);
    return Math.min(s0, s1) >= -1 && Math.max(s0, s1) <= L + 1;
  });
  if (!host) return { error: e.walls.length ? `the opening runs over the end of a wall part on wall ${e.name}: check the distance, or measure from the other corner` : `wall ${e.name} has no wall yet (fill missing walls in the editor)` };
  const s0 = along(host, P0), s1 = along(host, P1), out = { wall: host.id, offset: r1(Math.max(0, Math.min(s0, s1))), width };
  if (m.hingeAt === 'both') out.leaves = 2;                       // hinged on both sides: a double door or window
  if (m.hingeAt || m.into) {
    // hinge: the opening edge on the measured corner's side, or the other one
    const cornerEdge = m.corner === 'end' ? P1 : P0, hingePoint = m.hingeAt === 'other' ? (cornerEdge === P0 ? P1 : P0) : cornerEdge;
    out.hinge = Math.abs(along(host, hingePoint) - out.offset) < width / 2 ? 'near' : 'far';
    const roomSide = sideOfRoom(host, room) || 'right';
    out.swing = m.into === 'other' ? (roomSide === 'left' ? 'right' : 'left') : roomSide;
  }
  return out;
}

/** An existing opening as measured from the room: { edge, corner: 'start', distance, width, hingeAt, into } or null. */
export function measureOf(level, roomId, opening) {
  const room = (level.rooms || []).find(r => r.id === roomId), w = (level.walls || []).find(x => x.id === opening.wall);
  if (!room || !w) return null;
  const e = roomWalls(level, roomId).find(x => x.walls.includes(w.id));
  if (!e) return null;
  const wu = unit(w.a, w.b), Q0 = [w.a[0] + wu[0] * opening.offset, w.a[1] + wu[1] * opening.offset], Q1 = [Q0[0] + wu[0] * opening.width, Q0[1] + wu[1] * opening.width];
  const eu = unit(e.p, e.q), t = P => dot(sub(P, e.p), eu), [ta, tb] = [t(Q0), t(Q1)];
  const near = ta <= tb ? Q0 : Q1, hingeP = (isSliding(opening) ? opening.slide : opening.hinge) === 'far' ? Q1 : Q0;   // a sliding door: the edge it slides toward
  return { edge: e.i, corner: 'start', distance: r1(Math.min(ta, tb)), width: opening.width,
    hingeAt: opening.leaves === 2 ? 'both' : Math.hypot(hingeP[0] - near[0], hingeP[1] - near[1]) < 1 ? 'corner' : 'other',
    into: opening.swing ? (opening.swing === sideOfRoom(w, room) ? 'room' : 'other') : 'room' };
}

/**
 * A point on a wall measured in the room (a switch, a wall lamp): m = { edge, corner, distance } to
 * its centre. Returns { attach: { wall, side, offset } } on the room's face of the stored wall, or { error }.
 */
export function placeOnWall(level, roomId, m) {
  const room = (level.rooms || []).find(r => r.id === roomId);
  const p = placeOpening(level, roomId, { ...m, width: 0.001 });
  if (p.error) return { error: p.error.replace(/ \+ 0\.001/, '') };
  const w = level.walls.find(x => x.id === p.wall);
  return { attach: { wall: w.id, side: sideOfRoom(w, room) || 'right', offset: Math.round(p.offset) } };
}

/**
 * A point in the room measured from two of its walls (a ceiling lamp): m = { edgeA, distA, edgeB,
 * distB }, each distance at right angles from that wall's face into the room. The two walls must not
 * be parallel. Returns { pos } or { error }.
 */
export function placeInRoom(level, roomId, m) {
  const room = (level.rooms || []).find(r => r.id === roomId), walls = roomWalls(level, roomId);
  const A = walls[m.edgeA], B = walls[m.edgeB];
  if (!room || !A || !B) return { error: 'pick two walls of the room' };
  const line = (e, d) => { const u = unit(e.p, e.q), inward = [u[1], -u[0]]; return { p: [e.p[0] + inward[0] * d, e.p[1] + inward[1] * d], u }; };
  const a = line(A, Number(m.distA)), b = line(B, Number(m.distB));
  const den = a.u[0] * b.u[1] - a.u[1] * b.u[0];
  if (Math.abs(den) < 1e-6) return { error: `walls ${A.name} and ${B.name} are parallel: measure from two walls at an angle` };
  const t = ((b.p[0] - a.p[0]) * b.u[1] - (b.p[1] - a.p[1]) * b.u[0]) / den;
  return { pos: [r1(a.p[0] + a.u[0] * t), r1(a.p[1] + a.u[1] * t)] };
}

/** Distances of a point in the room from two of its walls (for editing a ceiling lamp); by default the first two at an angle. */
export function distancesInRoom(level, roomId, pos, edges) {
  const walls = roomWalls(level, roomId);
  const across = (v, w) => Math.abs((w.q[0] - w.p[0]) * (v.q[1] - v.p[1]) - (w.q[1] - w.p[1]) * (v.q[0] - v.p[0])) > 1e-3;
  const pick = edges ?? [0, walls.findIndex(w => across(walls[0], w))];
  const dist = e => { const u = unit(e.p, e.q), inward = [u[1], -u[0]]; return r1(dot(sub(pos, e.p), inward)); };
  return { edgeA: pick[0], distA: dist(walls[pick[0]]), edgeB: pick[1], distB: dist(walls[pick[1]]) };
}

/** A wall fixture as measured from the room: { edge, corner: 'start', distance } or null. */
export function wallPointOf(level, roomId, attach) {
  const m = measureOf(level, roomId, { wall: attach.wall, offset: attach.offset, width: 0 });
  return m && { edge: m.edge, corner: 'start', distance: m.distance };
}
