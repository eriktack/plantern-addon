// A 3-way merge of a house file (model.json or location.json) by entity id (decision 105). Pure.
// base = what both sides started from, mine = this page's version, theirs = what is stored now.
// Lists of things with an `id` (levels, rooms, walls, openings, …) are matched by id, objects key by key
// (materials, bindings, settings), anything else (numbers, text, a polygon, a list of lengths) is one
// value. A side that left a value as it was in base takes the other side's change; when both sides
// changed the same value differently, or one deleted a thing the other changed, that is a conflict.
// Conflicts start out as *mine* in `merged`; applyChoices() switches the ones the person picks to *theirs*.

/** Deep equality for JSON values. */
export function same(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  return ka.length === kb.length && ka.every(k => same(a[k], b[k]));
}

const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
// a list of things with ids: every element (on every side) is an object with a unique text id
const keyed = (...lists) => {
  const arrays = lists.filter(Array.isArray);
  if (!arrays.length || arrays.length !== lists.filter(l => l !== undefined).length) return false;
  if (!arrays.some(a => a.length)) return false;
  return arrays.every(a => a.every(e => isObj(e) && typeof e.id === 'string') && new Set(a.map(e => e.id)).size === a.length);
};

/**
 * Merge three versions. Returns { merged, conflicts } where each conflict is
 * { path, base, mine, theirs } and path is a list of keys, with { id } for a thing in a list of things
 * (undefined in a value = it does not exist on that side).
 */
export function merge3(base, mine, theirs) {
  const conflicts = [];
  const merged = mergeValue(base, mine, theirs, [], conflicts);
  return { merged, conflicts };
}

function mergeValue(b, m, t, path, out) {
  if (same(m, t)) return m;
  if (same(b, m)) return t;             // only theirs changed it
  if (same(b, t)) return m;             // only mine changed it
  if (isObj(m) && isObj(t) && (b === undefined || isObj(b))) return mergeObject(b || {}, m, t, path, out);
  if (keyed(b, m, t) || (Array.isArray(m) && Array.isArray(t) && keyed(m, t))) return mergeList(Array.isArray(b) ? b : [], m, t, path, out);
  out.push({ path, base: b, mine: m, theirs: t });
  return m;
}

function mergeObject(b, m, t, path, out) {
  const res = {};
  for (const k of [...new Set([...Object.keys(t), ...Object.keys(m)])]) {    // theirs' key order, mine's new keys after
    const v = mergeValue(b[k], m[k], t[k], [...path, k], out);
    if (v !== undefined) res[k] = v;
  }
  return res;
}

function mergeList(b, m, t, path, out) {
  const byId = list => new Map(list.map(e => [e.id, e]));
  const B = byId(b), M = byId(m), T = byId(t), res = [];
  const one = id => { const v = mergeValue(B.get(id), M.get(id), T.get(id), [...path, { id }], out); if (v !== undefined) res.push(v); };
  for (const e of t) one(e.id);                                   // theirs' order …
  for (const e of m) if (!T.has(e.id)) one(e.id);                // … then what only mine has (added, or kept against a deletion)
  return res;
}

/**
 * Apply the person's picks: choices[i] = 'theirs' switches conflict i to theirs' value (anything else
 * keeps mine, which `merged` already has). Returns a new value; the input is not changed.
 */
export function applyChoices(merged, conflicts, choices = {}) {
  let out = structuredClone(merged);
  conflicts.forEach((c, i) => { if (choices[i] === 'theirs') out = setAt(out, c.path, c.theirs); });
  return out;
}

/** Set (or with undefined, remove) the value at a merge path; a thing missing from its list is appended. */
function setAt(root, path, value) {
  if (!path.length) return value;
  const [head, ...rest] = path;
  if (typeof head === 'object') {
    const list = Array.isArray(root) ? root : [], i = list.findIndex(e => e?.id === head.id);
    const next = rest.length ? setAt(i >= 0 ? list[i] : {}, rest, value) : value;
    if (next === undefined) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = next; else list.push(next);
    return list;
  }
  const obj = isObj(root) ? root : {}, next = setAt(obj[head], rest, value);
  if (next === undefined) delete obj[head]; else obj[head] = next;
  return obj;
}

/**
 * What a conflict is about, for a person: the innermost thing with an id on its path and the field
 * in it ({ entity: { collection, id } | null, field: 'polygon', deleted: 'mine' | 'theirs' | null }).
 * The pages group conflicts by entity, so one pick (mine or theirs) can settle a whole room.
 */
export function describeConflict(c) {
  let entity = null, field = [];
  c.path.forEach((p, i) => {
    if (typeof p === 'object') { entity = { collection: typeof c.path[i - 1] === 'string' ? c.path[i - 1] : '', id: p.id }; field = []; }
    else field.push(p);
  });
  return { entity, field: field.join('.'), deleted: c.mine === undefined ? 'mine' : c.theirs === undefined ? 'theirs' : null };
}

/** The texts of three versions of a house file → merge3() of their JSON (malformed text throws). */
export function mergeTexts(baseText, mineText, theirsText) {
  return merge3(JSON.parse(baseText), JSON.parse(mineText), JSON.parse(theirsText));
}
