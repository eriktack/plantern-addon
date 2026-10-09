// Which levels the 3D view shows, and how far apart (PLANTERN.md §8). Pure.
//   mode "this"  → only the current level
//   mode "below" → the current level and the ones below it (the ones above would cover it)
//   mode "all"   → every level of the building
// Exploded: each level lifted by a gap per level above the lowest shown one, so floors can be seen from above, and
// moved sideways too (toward the right of the default view: east-north), so they are not exactly on top of each other.

export const STACK_MODES = ['this', 'below', 'all'];
export const EXPLODE_GAP = 1500;   // mm between shown levels when exploded
export const EXPLODE_SHIFT = 2500; // mm each level further up is moved sideways when exploded
const SIDE = [0.78, 0.62];          // plan direction of the sideways move (right on the screen in the default view)

/** [{ level, lift, shift }] in elevation order; `lift` in mm and `shift` [dx, dy] in plan mm (0 unless exploded). */
export function levelStack(model, current, mode = 'this', exploded = false) {
  if (!current) return [];
  const same = (model.levels || []).filter(l => (l.building ?? null) === (current.building ?? null)).sort((a, b) => a.elevation - b.elevation);
  const shown = mode === 'all' ? same : mode === 'below' ? same.filter(l => l.elevation <= current.elevation) : [current];
  return shown.map((level, i) => ({ level, lift: exploded ? i * EXPLODE_GAP : 0, shift: exploded ? [Math.round(i * EXPLODE_SHIFT * SIDE[0]), Math.round(i * EXPLODE_SHIFT * SIDE[1])] : [0, 0] }));
}
