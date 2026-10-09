// The room edges a bound wall was made from (`walls[].from`, PLANTERN.md §4), by role. Pure.
//   along:  edges the wall's reference line runs on, same direction (one room edge, or several
//           collinear edges of different rooms for a facade wall)
//   facing: edges on the wall's far face, running the other way (the other room of a shared wall)

import { wallFrame } from './walls.js';

const EDGE_REF = /^(.+)#e(\d+)$/;

/** Edge geometry of a ref like "r_kitchen#e2" in the given rooms (Map id → room), or null. */
export function edgeOfRef(ref, roomsById) {
  const m = EDGE_REF.exec(ref || ''), r = m && roomsById.get(m[1]), i = m ? +m[2] : -1;
  if (!r?.polygon || !(i >= 0 && i < r.polygon.length)) return null;
  const p = r.polygon[i], q = r.polygon[(i + 1) % r.polygon.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return { ref, room: r, p, q, L, u: [(q[0] - p[0]) / L, (q[1] - p[1]) / L] };
}

/** { along: [edge], facing: [edge], missing: [ref] } for a wall with `from`. */
export function boundEdges(wall, roomsById) {
  const f = wallFrame(wall), out = { along: [], facing: [], missing: [] };
  for (const ref of wall.from || []) {
    const e = edgeOfRef(ref, roomsById);
    if (!e) out.missing.push(ref);
    else (e.u[0] * f.u[0] + e.u[1] * f.u[1] >= 0 ? out.along : out.facing).push(e);
  }
  return out;
}

/** True when a room is on both faces of the wall (its thickness is then the distance between them). */
export const isShared = (wall, roomsById) => boundEdges(wall, roomsById).facing.length > 0;
