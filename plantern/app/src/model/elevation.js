// Levels whose height follows another level (PLANTERN.md §5, decision 110): instead of a typed
// elevation, `levels[].elevationFrom = { level, relation: 'above' | 'below' | 'same', offset? }`.
// The stored `elevation` stays in the file (readable, and what everything else reads); it is worked
// out again from the level it follows whenever a level changes (resolveElevations), and the validator
// reports a stored value that no longer agrees.
//
//   above: on top of `level`: its floor + floor-to-floor (measured: that level's capture.floorToFloor,
//          else its ceiling height + this level's floor build-up)
//   below: under `level`: its floor − floor-to-floor (measured: this level's capture.floorToFloor,
//          else this level's ceiling height + that level's floor build-up)
//   same:  level with it (a part of a floor kept as its own level, a garage floor level with the house)
// plus `offset` mm (a step up or down).

export const DEFAULT_CEILING = 2400;          // mm, a level's ceiling height until measured (PLANTERN.md §5)
export const DEFAULT_FLOOR_THICKNESS = 250;   // mm, floor build-up below a level until measured

export const RELATIONS = ['above', 'below', 'same'];

/** Check an elevationFrom: [] or error texts. */
export function checkElevationFrom(model, level) {
  const f = level.elevationFrom;
  if (f === undefined) return [];
  if (!f || typeof f !== 'object') return ['elevationFrom must be { level, relation, offset? }'];
  const errs = [];
  if (!model.levels.some(l => l.id === f.level)) errs.push(`its height follows level "${f.level}", which does not exist`);
  if (f.level === level.id) errs.push('a level cannot follow its own height');
  if (!RELATIONS.includes(f.relation)) errs.push(`elevationFrom.relation must be ${RELATIONS.join(', ')}`);
  if (f.offset !== undefined && !Number.isFinite(f.offset)) errs.push('elevationFrom.offset must be a number of mm');
  return errs;
}

/** The elevation `level` gets from the level it follows (`ref`, already resolved). */
export function elevationFromRef(level, ref) {
  const f = level.elevationFrom, off = f.offset ?? 0;
  if (f.relation === 'same') return ref.elevation + off;
  if (f.relation === 'above') return ref.elevation + (ref.capture?.floorToFloor ?? (ref.ceilingHeight ?? DEFAULT_CEILING) + (level.floorThickness ?? DEFAULT_FLOOR_THICKNESS)) + off;
  return ref.elevation - (level.capture?.floorToFloor ?? (level.ceilingHeight ?? DEFAULT_CEILING) + (ref.floorThickness ?? DEFAULT_FLOOR_THICKNESS)) + off;
}

/**
 * Work out every following level's elevation, in dependency order (a level following one that follows
 * another). Returns { model, errors, changed: [{ level, from, to }] }; the model is unchanged when
 * nothing moved, and errors name missing levels and cycles (those levels keep their stored value).
 * Levels stay ordered by elevation (stable for equal ones).
 */
export function resolveElevations(model) {
  const byId = new Map(model.levels.map(l => [l.id, l])), out = new Map(), errors = [], changed = [];
  const visiting = new Set();
  const walk = id => {
    if (out.has(id)) return out.get(id);
    const lv = byId.get(id);
    if (!lv.elevationFrom) { out.set(id, lv.elevation); return lv.elevation; }
    const e = checkElevationFrom(model, lv);
    if (e.length) { errors.push(...e.map(m => `${id}: ${m}`)); out.set(id, lv.elevation); return lv.elevation; }
    if (visiting.has(id)) { errors.push(`${id}: its height follows itself through ${[...visiting].join(' → ')}`); out.set(id, lv.elevation); return lv.elevation; }
    visiting.add(id);
    const refElev = walk(lv.elevationFrom.level);
    visiting.delete(id);
    const v = Math.round(elevationFromRef(lv, { ...byId.get(lv.elevationFrom.level), elevation: refElev }) * 10) / 10;
    out.set(id, v);
    return v;
  };
  for (const l of model.levels) walk(l.id);
  let levels = model.levels.map(l => {
    const v = out.get(l.id);
    if (v === l.elevation) return l;
    changed.push({ level: l.id, from: l.elevation, to: v });
    return { ...l, elevation: v };
  });
  if (!changed.length) return { model, errors, changed };
  levels = levels.map((l, i) => [l, i]).sort((a, b) => a[0].elevation - b[0].elevation || a[1] - b[1]).map(x => x[0]);
  return { model: { ...model, levels }, errors, changed };
}

/** Words for a level's height in the pages: "on top of Ground floor", "level with Hall, +150 mm". */
export function describeElevationFrom(model, level) {
  const f = level.elevationFrom;
  if (!f) return '';
  const ref = model.levels.find(l => l.id === f.level), nm = ref?.name || f.level;
  const off = f.offset ? `, ${f.offset > 0 ? '+' : '−'}${Math.abs(f.offset)} mm` : '';
  return `${{ above: 'on top of', below: 'under', same: 'level with' }[f.relation] || f.relation} ${nm}${off}`;
}
