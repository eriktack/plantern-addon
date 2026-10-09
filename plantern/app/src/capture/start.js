// Where a room measurement starts (pure): the plan origin, or any snap point of the level
// (corner of another room, wall face corner, opening edge, …) plus an x/y offset in mm.
// Snap points come only from collectSnapPoints(); they are referred to by `ref`.

import { wallFrame, faceOffset } from '../geometry/walls.js';

export const ORIGIN = '';   // empty ref = the plan origin (0, 0)

/**
 * Candidates for the start selector: [{ ref, pos, label }], most useful kinds first.
 * `excludeRoom` hides the room being measured (its own corners do not exist yet); `name` (refNamer())
 * labels them as a person reads them, `levelName` names the level of a point from the level below or above.
 */
/**
 * One start point per place, for dots on a plan: where several coincide (a room corner, the wall's face
 * corner, a wall end) the most stable one wins, which is the room corner. A wall's ends can move when
 * walls merge into a facade; a room's corners only move with the room.
 */
export function startDots(snaps, opts) {
  const seen = [];
  for (const o of startOptions(snaps, opts)) if (!seen.some(s => Math.hypot(s.pos[0] - o.pos[0], s.pos[1] - o.pos[1]) <= 1)) seen.push(o);
  return seen;
}

export function startOptions(snaps, { excludeRoom, name = null, levelName = l => l } = {}) {
  return snaps
    .filter(s => !excludeRoom || !s.ref.startsWith(`${excludeRoom}#`))
    .filter(s => s.kind !== 'wall midpoint' && s.kind !== 'fixture' && s.kind !== 'attach point')
    .sort((a, b) => a.pri - b.pri || a.ref.localeCompare(b.ref, undefined, { numeric: true }))
    .map(s => ({ ref: s.ref, pos: s.pos, adjacent: !!s.adjacent, ...(s.adjacent ? { relation: s.relation, level: s.level } : {}),
      // with a namer: "Kitchen corner 2 (5200, 0)", the way the plan numbers corners and letters walls
      label: name
        ? `${name(s.ref)}${s.adjacent ? ` · ${levelName(s.level)}` : ''} (${Math.round(s.pos[0])}, ${Math.round(s.pos[1])})`
        : `${s.ref} · ${s.kind} (${Math.round(s.pos[0])}, ${Math.round(s.pos[1])})${s.adjacent ? ` · level ${s.level}` : ''}` }));
}

/** origin = { ref, offset: [dx, dy] } → { pos } or { error }. Unknown refs are reported, never guessed. */
export function resolveStart(snapPos, origin) {
  const [dx, dy] = origin?.offset ?? [0, 0];
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { error: 'offset must be numbers' };
  if (!origin?.ref) return { pos: [dx, dy] };
  const p = snapPos(origin.ref);
  if (!p) return { error: `start point "${origin.ref}" does not exist (any more) on this level` };
  return { pos: [Math.round((p[0] + dx) * 10) / 10, Math.round((p[1] + dy) * 10) / 10] };
}

/** Stored form of a start: only mention the ref when there is one. */
export const originToRaw = origin => origin?.ref ? { ref: origin.ref, offset: [...origin.offset] } : undefined;

/**
 * "Next to another room": corner 0 of the new room sits on the far face of the wall that belongs to
 * edge `i` of `room`, and its first wall runs back along that shared wall (room on its right).
 * thickness = wall between the two rooms (the face-to-face gap); slide = how far from the edge's end
 * the new room starts (mm toward the edge's start, e.g. when it is shorter than the shared wall).
 * Returns { ref, offset, heading, start, length } (ref + offset is the stored form of the start).
 */
export function placeAgainstEdge(room, i, { thickness, slide = 0 }) {
  const poly = room.polygon, n = poly.length, p = poly[i], q = poly[(i + 1) % n];
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (!(thickness >= 0) || !Number.isFinite(thickness)) return { error: 'thickness must be a number (0 or more)' };
  if (!Number.isFinite(slide) || slide < 0 || slide > L) return { error: `slide must be between 0 and the edge length (${Math.round(L)} mm)` };
  const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L], nrm = [-u[1], u[0]];          // nrm = left of travel = wall side
  const r1 = v => Math.round(v * 10) / 10;
  const offset = [r1(thickness * nrm[0] - slide * u[0]), r1(thickness * nrm[1] - slide * u[1])];
  const heading = Math.round((((Math.atan2(-u[1], -u[0]) * 180 / Math.PI) % 360) + 360) % 360 * 100) / 100;
  return { ref: `${room.id}#p${(i + 1) % n}`, offset, heading, start: [r1(q[0] + offset[0]), r1(q[1] + offset[1])], length: L };
}

/**
 * Thickness of the existing wall that bounds edge `i` of `room` (null if there is none): a wall of
 * this room whose reference line is the edge, or any wall with a FACE on the edge (the far room of
 * a shared wall sees its other face). The wall must run alongside the edge, not just on its line.
 */
export function edgeWallThickness(level, room, i) {
  const p = room.polygon[i], q = room.polygon[(i + 1) % room.polygon.length];
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
  const along = pt => (pt[0] - p[0]) * u[0] + (pt[1] - p[1]) * u[1];
  for (const w of level.walls || []) {
    if (w.kind !== 'wall' || !(w.thickness > 0)) continue;
    const f = wallFrame(w);
    if (Math.abs(f.u[0] * u[1] - f.u[1] * u[0]) > 1e-3) continue;                     // not parallel
    const s0 = along(w.a), s1 = along(w.b);
    if (Math.min(L, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1)) < 1) continue;    // no common stretch
    const off = (p[0] - w.a[0]) * f.n[0] + (p[1] - w.a[1]) * f.n[1];                  // edge's offset from the reference line
    const onRef = Math.abs(off) < 1 && (w.rooms || []).includes(room.id);
    const onFace = Math.abs(off - faceOffset(f, 'left')) < 1 || Math.abs(off - faceOffset(f, 'right')) < 1;
    if (onRef || onFace) return w.thickness;
  }
  return null;
}

const angleOf = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
const norm180 = a => { let x = ((a % 360) + 360) % 360; if (x > 180) x -= 360; return x; };

/**
 * "Next to another room" for a room that already has a shape: its wall `k` (of `poly`, the room as
 * solved now, with first-wall heading `heading`) goes against edge `i` of `room` on its far face,
 * running back along it, with `thickness` between the faces and `slide` from that edge's end (as in
 * placeAgainstEdge). The room is moved and turned as a whole, never mirrored.
 * Returns { ref, offset, heading, start, rot, length } (rot = degrees it turns) or { error }.
 */
export function placeWallAgainstEdge(poly, heading, k, room, i, opts) {
  const t = placeAgainstEdge(room, i, opts);
  if (t.error) return t;
  const n = poly.length, P = poly[k], Q = poly[(k + 1) % n];
  if (!P || !Q) return { error: `this room has no wall ${k}` };
  const rot = norm180(t.heading - angleOf(P, Q)), r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const v = [poly[0][0] - P[0], poly[0][1] - P[1]], r1 = x => Math.round(x * 10) / 10;
  const start = [r1(t.start[0] + v[0] * c - v[1] * s), r1(t.start[1] + v[0] * s + v[1] * c)];
  const refPos = room.polygon[(i + 1) % room.polygon.length];
  return { ref: t.ref, offset: [r1(start[0] - refPos[0]), r1(start[1] - refPos[1])], heading: Math.round(((((heading || 0) + rot) % 360) + 360) % 360 * 100) / 100, start, rot: Math.round(rot * 100) / 100, length: t.length };
}

/**
 * The wall of `poly` that fits best against edge `i` of `room`: the one that needs the least turning
 * (already running back along it), then the nearest to it.
 */
export function bestWallAgainst(poly, room, i) {
  const p = room.polygon[i], q = room.polygon[(i + 1) % room.polygon.length], want = angleOf(q, p);
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nrm = [-(q[1] - p[1]) / L, (q[0] - p[0]) / L];
  let best = 0, score = Infinity;
  poly.forEach((a, k) => {
    const b = poly[(k + 1) % poly.length], turn = Math.abs(norm180(want - angleOf(a, b)));
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist = Math.abs((mid[0] - p[0]) * nrm[0] + (mid[1] - p[1]) * nrm[1]);
    const sc = Math.round(turn) * 1e6 + dist;
    if (sc < score) { score = sc; best = k; }
  });
  return best;
}
