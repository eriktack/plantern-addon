// Things on one level that hang on another level (PLANTERN.md §5): a room or solid whose corner 0 was
// placed at a point of the level below or above (`capture.raw.origin.ref`, e.g. `r_kitchen#p0` or
// `w_k_w#a.left`). After the level they hang on changed, followLevels() brings them up to date and lets
// reconcile() move their walls. Pure: model in, { model, report } out.

import { solveExtra } from '../model/checks.js';
import { buildLevelGeometry } from '../geometry/level.js';
import { collectSnapPointsAround } from '../tools/snap.js';
import { resolveStart } from '../capture/start.js';
import { solveCapture } from '../capture/solve.js';
import { reconcile } from './reconcile.js';

const COLLECTIONS = ['rooms', 'walls', 'openings', 'solids', 'slabs', 'objects', 'fixtures', 'stairs'];
const idsOf = level => new Set(COLLECTIONS.flatMap(c => (level[c] || []).map(x => x.id)));
const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** Id of the level a ref's owner stands on, or null (anchors and unknown ids give null). */
export const levelOfRef = (model, ref) => {
  const id = String(ref || '').split('#')[0];
  return id ? model.levels.find(l => idsOf(l).has(id))?.id ?? null : null;
};

/**
 * Re-solve the rooms and solids of other levels that hang on something of `fromLevelId`, then reconcile
 * those levels so their walls follow; levels that hang on those in turn are handled the same way.
 * report = { followed: [{ level, resolved: [ids] }], warnings: [...] }.
 */
export function followLevels(model, fromLevelId, options = {}) {
  const report = { followed: [], warnings: [] };
  const queue = [fromLevelId], seen = new Map();
  while (queue.length) {
    const src = queue.shift(), srcLevel = model.levels.find(l => l.id === src);
    if (!srcLevel) continue;
    seen.set(src, (seen.get(src) || 0) + 1);
    if (seen.get(src) > model.levels.length + 1) { report.warnings.push('levels kept moving each other; stopped'); break; }
    const srcIds = idsOf(srcLevel);
    for (const level of model.levels) {
      if (level.id === src) continue;
      const hangs = x => srcIds.has(String(x.capture?.raw?.origin?.ref || '').split('#')[0]);
      if (![...(level.rooms || []), ...(level.solids || [])].some(hangs)) continue;
      const geos = new Map(model.levels.map(l => [l.id, buildLevelGeometry(l)]));
      const snaps = new Map(collectSnapPointsAround(model, level, l => geos.get(l.id)).map(s => [s.ref, s.pos]));
      const snapPos = ref => snaps.get(ref);
      const resolved = [], rooms = {}, solids = [];
      const redo = (thing, kind) => {
        const raw = thing.capture?.raw, ref = raw?.origin?.ref;
        if (!ref || !srcIds.has(ref.split('#')[0])) return thing;
        const st = resolveStart(snapPos, raw.origin);
        if (st.error) { report.warnings.push(`${thing.id}: ${st.error}`); return thing; }
        if (d2(st.pos, raw.start ?? [0, 0]) <= 0.05) return thing;
        const capture = { ...thing.capture, raw: { ...raw, start: st.pos } }, sol = solveCapture(capture, kind === 'room' ? solveExtra(model, { id: thing.id, capture }) : {});
        if (!sol.ok) { report.warnings.push(`${thing.id}: cannot re-solve after the level it hangs on changed: ${sol.errors.join('; ')}`); return thing; }
        resolved.push(thing.id);
        if (kind === 'room') rooms[thing.id] = thing.polygon; else solids.push(thing.id);
        return { ...thing, polygon: sol.polygon, capture };
      };
      const next = { ...level, rooms: (level.rooms || []).map(r => redo(r, 'room')), ...(level.solids ? { solids: level.solids.map(s => redo(s, 'solid')) } : {}) };
      if (!resolved.length) continue;
      const moved = { ...model, levels: model.levels.map(l => l.id === level.id ? next : l) };
      const r = reconcile(moved, level.id, { rooms, solids }, options);
      model = r.model;
      report.followed.push({ level: level.id, resolved, moved: r.report.moved || [] });
      report.warnings.push(...(r.report.warnings || []));
      queue.push(level.id);
    }
  }
  return { model, report };
}
