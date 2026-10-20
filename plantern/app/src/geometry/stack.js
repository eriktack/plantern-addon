// Which levels the 3D view shows, and how far apart (PLANTERN.md §8). Pure.
//   mode "this"  → only the current level
//   mode "below" → the current level and the ones below it (the ones above would cover it)
//   mode "all"   → every level of the building
// Exploded: each level lifted by a gap per level above the lowest shown one, so floors can be seen from above, and
// moved sideways too (toward the right of the default view: east-north), so they are not exactly on top of each other.
// The gap and the sideways move grow with the house (issue #21): a fixed 1.5 m lift left BBV28's floors overlapping
// (9 m wide, floors 2.4 m apart), so each step is the larger of the fixed minimum and a share of the plan span.

export const STACK_MODES = ['this', 'below', 'all'];
export const EXPLODE_GAP = 1500;         // mm between shown levels when exploded (the minimum)
export const EXPLODE_SHIFT = 2500;       // mm each level further up is moved sideways when exploded (the minimum)
export const EXPLODE_GAP_SHARE = 0.2;    // lift per level (z) as a share of the plan span of the shown levels: kept small
export const EXPLODE_SHIFT_SHARE = 0.6;  // sideways move per level (x/y) as a share of the same span: the main explode
const SIDE = [0.78, 0.62];               // plan direction of the sideways move (right on the screen in the default view)

/** The larger side of the box round the rooms and walls of these levels, in mm (0 when there is nothing to measure). */
export function planSpan(levels) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const add = ([x, y]) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  for (const l of levels) {
    for (const r of l.rooms || []) (r.polygon || []).forEach(add);
    for (const w of l.walls || []) { if (w.a) add(w.a); if (w.b) add(w.b); }
  }
  return Number.isFinite(maxX) ? Math.max(maxX - minX, maxY - minY) : 0;
}

/** [{ level, lift, shift }] in elevation order; `lift` in mm and `shift` [dx, dy] in plan mm (0 unless exploded). */
export function levelStack(model, current, mode = 'this', exploded = false) {
  if (!current) return [];
  const same = (model.levels || []).filter(l => (l.building ?? null) === (current.building ?? null)).sort((a, b) => a.elevation - b.elevation);
  const shown = mode === 'all' ? same : mode === 'below' ? same.filter(l => l.elevation <= current.elevation) : [current];
  const span = exploded ? planSpan(shown) : 0;
  const gap = Math.max(EXPLODE_GAP, Math.round(span * EXPLODE_GAP_SHARE));
  const step = Math.max(EXPLODE_SHIFT, Math.round(span * EXPLODE_SHIFT_SHARE));
  return shown.map((level, i) => ({ level, lift: exploded ? i * gap : 0, shift: exploded ? [Math.round(i * step * SIDE[0]), Math.round(i * step * SIDE[1])] : [0, 0] }));
}
