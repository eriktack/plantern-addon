// Link hand-drawn walls to the room edges they sit on (`from`), so they follow their rooms from now
// on (PLANTERN.md §4). Pure. A wall is linked only when reconcile() would leave it exactly where it
// is: same position, same thickness, not merged away. Anything else stays hand-drawn and is listed
// with the reason, so linking never moves a wall.

import { wallFrame, faceOffset, hasBody } from '../geometry/walls.js';
import { reconcile } from './reconcile.js';

const SIN = 1e-3, TOL = 1;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** The rooms a linked wall bounds: the ones it already lists, plus the rooms of its edges. */
const roomsOf = (w, from) => [...new Set([...(w.rooms || []), ...from.map(k => k.split('#')[0])])];

/** Edges a wall sits on: `ref` = its reference line lies on the edge (same direction); `face` = one of its faces does (opposite direction, the room on the far side). */
function edgesUnder(w, rooms) {
  const f = wallFrame(w), out = [];
  if (!f.L) return out;
  for (const r of rooms) r.polygon.forEach((p, i) => {
    const q = r.polygon[(i + 1) % r.polygon.length], L = d2(p, q);
    if (L < TOL) return;
    const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L], c = f.u[0] * u[1] - f.u[1] * u[0], d = f.u[0] * u[0] + f.u[1] * u[1];
    if (Math.abs(c) > SIN) return;
    const off = (p[0] - w.a[0]) * f.n[0] + (p[1] - w.a[1]) * f.n[1];                 // edge's offset from the reference line
    const t0 = (p[0] - w.a[0]) * f.u[0] + (p[1] - w.a[1]) * f.u[1], t1 = (q[0] - w.a[0]) * f.u[0] + (q[1] - w.a[1]) * f.u[1];
    const overlap = Math.min(f.L, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1));
    if (overlap <= TOL) return;
    const key = `${r.id}#e${i}`;
    if (d > 0 && Math.abs(off) <= TOL) out.push({ key, how: 'ref', overlap });
    else if (d < 0 && hasBody(w) && (Math.abs(off - faceOffset(f, 'left')) <= TOL || Math.abs(off - faceOffset(f, 'right')) <= TOL)) out.push({ key, how: 'face', overlap });
  });
  return out;
}

/**
 * bindWalls(model, levelId) → { model, report: { bound: [{ id, from }], skipped: [{ id, reason }] } }.
 * Only walls without `from` are considered; bound walls are never touched.
 */
export function bindWalls(model, levelId, options = {}) {
  const li = model.levels.findIndex(l => l.id === levelId);
  const report = { bound: [], skipped: [] };
  if (li < 0) return { model, report };
  const level = model.levels[li], rooms = (level.rooms || []).filter(r => r.polygon?.length >= 3);
  const proposal = new Map();
  for (const w of level.walls || []) {
    if (w.from) continue;
    const under = edgesUnder(w, rooms), best = how => under.filter(e => e.how === how).sort((a, b) => b.overlap - a.overlap)[0];
    const ref = best('ref');
    if (!ref) { report.skipped.push({ id: w.id, reason: 'its reference line is not on a room edge' }); continue; }
    // every edge the reference line runs on (a facade spans several rooms), in order along the wall, then the far faces
    const f = wallFrame(w), at = key => { const [r, i] = key.split('#e'), p = rooms.find(x => x.id === r).polygon[+i]; return (p[0] - w.a[0]) * f.u[0] + (p[1] - w.a[1]) * f.u[1]; };
    const along = under.filter(e => e.how === 'ref').map(e => e.key).sort((a, b) => at(a) - at(b));
    const faces = under.filter(e => e.how === 'face').map(e => e.key);
    proposal.set(w.id, [...along, ...faces]);
  }
  // keep only the links reconcile() agrees with; drop the others and try again until it settles
  const put = props => ({ ...model, levels: model.levels.map((l, i) => i === li ? { ...l, walls: l.walls.map(w => props.has(w.id) ? { ...w, rooms: roomsOf(w, props.get(w.id)), from: props.get(w.id) } : w) } : l) });
  for (;;) {
    const tentative = put(proposal), r = reconcile(tentative, levelId, {}, options);
    const after = new Map(r.model.levels[li].walls.map(w => [w.id, w]));
    const bad = [...proposal.keys()].filter(id => {
      const a = level.walls.find(w => w.id === id), b = after.get(id);
      const why = !b ? 'it would be merged into another wall'
        : r.report.orphans.some(o => o.id === id) ? 'reconcile cannot place it'
        : Math.max(d2(a.a, b.a), d2(a.b, b.b)) > 0.5 ? `it would move ${Math.round(Math.max(d2(a.a, b.a), d2(a.b, b.b)))} mm`
        : (a.thickness ?? 0) !== (b.thickness ?? 0) ? `its thickness would change to ${b.thickness} mm`
        : null;
      if (why) report.skipped.push({ id, reason: why });
      return !!why;
    });
    if (!bad.length) {
      for (const [id, from] of proposal) report.bound.push({ id, from });
      return { model: tentative, report };
    }
    for (const id of bad) proposal.delete(id);
  }
}
