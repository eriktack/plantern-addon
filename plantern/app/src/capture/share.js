// "Share this wall?" while measuring (pure). The wall you are measuring runs from `from` along
// `heading`; if its end lands close to the FAR face of another room's wall, that is almost
// certainly the wall the two rooms share. Snapping puts the corner exactly on that face (so the gap
// to the neighbour is the wall thickness) and the next wall runs back along the shared wall.

import { edgeWallThickness } from './start.js';

const norm = d => ((d % 360) + 360) % 360;
const r1 = v => Math.round(v * 10) / 10;

/**
 * { from, heading, length } = the wall being measured (plan mm, degrees). Returns candidates sorted by
 * how far the corner moves: { room, roomName, edge, thickness, thicknessKnown, newLength, delta, point,
 * nextHeading, turn, interior, edgeLength, endPoint } where `turn` is 'R' | 'L' | interior degrees for
 * the corner, `delta` = newLength − length, `endPoint` = where the shared wall ends on the far face.
 * options: tol (max corner move, mm), margin (how far beyond the neighbour's wall ends still counts),
 * defaultThickness / thickness (for neighbours with no modelled wall).
 */
export function shareCandidates({ from, heading, length }, level, { tol = 300, margin = 300, defaultThickness = 200, thickness } = {}) {
  const rad = heading * Math.PI / 180, d = [Math.cos(rad), Math.sin(rad)], out = [];
  for (const room of level.rooms || []) {
    const poly = room.polygon || [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 1) return;
      const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L], nrm = [-u[1], u[0]];            // nrm = wall side (left of travel)
      const known = edgeWallThickness(level, room, i), th = known ?? thickness ?? defaultThickness;
      const c = d[0] * nrm[0] + d[1] * nrm[1];
      if (Math.abs(c) < 0.1) return;                                                      // running along the wall, not into it
      const s0 = (from[0] - p[0]) * nrm[0] + (from[1] - p[1]) * nrm[1];
      if (s0 < th - 1) return;                                                            // start is inside / on the neighbour's side
      const t = (th - s0) / c;
      if (!(t > 0) || Math.abs(t - length) > tol) return;
      const X = [from[0] + d[0] * t, from[1] + d[1] * t], a = (X[0] - p[0]) * u[0] + (X[1] - p[1]) * u[1];
      if (a < -margin || a > L + margin) return;                                          // would meet the wall's line well past its ends
      const nextHeading = norm(Math.atan2(-u[1], -u[0]) * 180 / Math.PI);
      const turnRight = ((norm(heading - nextHeading) + 180) % 360) - 180 || 180;         // (-180, 180]
      const interior = 180 - turnRight;
      if (interior < 1 || interior > 359 || Math.abs(interior - 180) < 1) return;
      out.push({
        room: room.id, roomName: room.name || room.id, edge: i, thickness: th, thicknessKnown: known != null,
        newLength: r1(t), delta: r1(t - length), point: [r1(X[0]), r1(X[1])], nextHeading: Math.round(nextHeading * 100) / 100,
        turn: Math.abs(interior - 90) < 0.5 ? 'R' : Math.abs(interior - 270) < 0.5 ? 'L' : Math.round(interior * 100) / 100,
        interior: Math.round(interior * 100) / 100, edgeLength: L, endPoint: [r1(p[0] + th * nrm[0]), r1(p[1] + th * nrm[1])],
      });
    });
  }
  return out.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
}

/**
 * The wall being measured RUNS ALONGSIDE another room's wall, almost at the right gap. Sharing means
 * the gap to the neighbour's far face becomes exactly the wall thickness. Nothing can be moved except
 * the corner you stand in, so that corner slides along the PREVIOUS wall: its length changes by
 * `delta` (the wall being measured keeps its length and direction). Needs a previous wall that is not
 * itself running along the neighbour.
 *   { from, heading, length } the wall being measured; { prevHeading, prevLength } the wall before it.
 * For the FIRST wall (no prevHeading) there is no previous wall to change: corner 0 itself moves
 * sideways instead, and the candidate carries `moveStart: [dx, dy]` (added to the start offset).
 * Returns [{ room, roomName, edge, thickness, thicknessKnown, gap, delta, newPrevLength, newFrom, overlap, moveStart? }]
 * sorted by |delta|. options: gapTol (largest gap to fix, mm), angleTol (degrees off parallel),
 * maxMove (largest change to the previous length), minOverlap (mm of shared run).
 */
export function alongsideCandidates({ from, heading, length, prevHeading, prevLength }, level, { gapTol = 300, angleTol = 3, maxMove = 400, minOverlap = 200, defaultThickness = 200, thickness } = {}) {
  const first = prevHeading === undefined || prevHeading === null;
  const rad = a => a * Math.PI / 180, d = [Math.cos(rad(heading)), Math.sin(rad(heading))], dp = first ? null : [Math.cos(rad(prevHeading)), Math.sin(rad(prevHeading))];
  const end = [from[0] + d[0] * length, from[1] + d[1] * length], out = [];
  for (const room of level.rooms || []) {
    const poly = room.polygon || [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 1) return;
      const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L], nrm = [-u[1], u[0]];
      if (d[0] * u[0] + d[1] * u[1] > 0 || Math.abs(d[0] * u[1] - d[1] * u[0]) > Math.sin(rad(angleTol))) return;   // must run the opposite way, nearly parallel
      const known = edgeWallThickness(level, room, i), th = known ?? thickness ?? defaultThickness;
      const s0 = (from[0] - p[0]) * nrm[0] + (from[1] - p[1]) * nrm[1], gap = s0 - th;
      if (gap < 1 || gap > gapTol) return;                                              // already shared, or too far apart to be the same wall
      const a0 = (from[0] - p[0]) * u[0] + (from[1] - p[1]) * u[1], a1 = (end[0] - p[0]) * u[0] + (end[1] - p[1]) * u[1];
      const overlap = Math.min(L, Math.max(a0, a1)) - Math.max(0, Math.min(a0, a1));
      if (overlap < Math.min(minOverlap, length / 2, L / 2)) return;
      if (first) {
        // corner 0 slides straight towards (or away from) the neighbour's wall
        const mv = th - s0;
        if (Math.abs(mv) > maxMove) return;
        const moveStart = [r1(nrm[0] * mv) || 0, r1(nrm[1] * mv) || 0];     // || 0: no -0
        out.push({ room: room.id, roomName: room.name || room.id, edge: i, thickness: th, thicknessKnown: known != null, gap: r1(gap), delta: r1(mv), newFrom: [r1(from[0] + moveStart[0]), r1(from[1] + moveStart[1])], moveStart, overlap: Math.round(overlap) });
        return;
      }
      const c = dp[0] * nrm[0] + dp[1] * nrm[1];
      if (Math.abs(c) < 0.3) return;                                                    // previous wall also runs along it: cannot slide the corner that way
      const delta = (th - s0) / c;
      if (Math.abs(delta) > maxMove || prevLength + delta < 1) return;
      out.push({ room: room.id, roomName: room.name || room.id, edge: i, thickness: th, thicknessKnown: known != null, gap: r1(gap), delta: r1(delta), newPrevLength: r1(prevLength + delta), newFrom: [r1(from[0] + dp[0] * delta), r1(from[1] + dp[1] * delta)], overlap: Math.round(overlap) });
    });
  }
  return out.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
}
