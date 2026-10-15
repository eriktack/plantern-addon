// Recreate an entity's id and update every reference to it (fixes list 26). Pure: a rename moves no geometry, so
// there is no reconcile; the result is validated like every other operation.
//
// A reference is a string equal to the old id, or one that starts with it and a '#' (a snap ref such as
// `r_kitchen#p0`, a wall face `w_x#a.left`, a `from` edge `r_kitchen#e1`). Object keys equal to the old id (a room's
// colour in `roomSides`, a level in `anchors`) are renamed too. Human text (`name`, `note`) is never touched.
// Bindings in location.json are not in the model: the report says when the id is a fixture id, so they can follow.

import { validateModel } from '../model/validate.js';
import { buildModelGeometry } from '../geometry/level.js';

const ID = /^[a-z][a-z0-9_]*$/;
const TEXT_KEYS = new Set(['name', 'note', 'description', '_comment', 'source']);
const refuse = (model, ...errors) => ({ model, report: { errors, issues: [], changed: 0 } });
const hits = (s, id) => s === id || s.startsWith(id + '#');

/** Every id the model uses for an entity, plus level ids and material names. */
export function allIds(model) {
  const out = new Set((model.levels || []).map(l => l.id));
  for (const k of Object.keys(model.materials || {})) out.add(k);
  const walk = v => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') { if (typeof v.id === 'string') out.add(v.id); Object.values(v).forEach(walk); }
  };
  for (const key of ['levels', 'anchors', 'checks', 'buildings']) walk(model[key]);
  return out;
}

/**
 * Rename `oldId` to `newId` everywhere in the model. Returns { model, report: { errors, issues, changed, fixture } }:
 * `changed` is the number of references updated, `fixture` is true when the id is a fixture and `opening` when it is an
 * opening (a door's sensor): their binding in location.json must be renamed too.
 */
export function renameId(model, oldId, newId) {
  if (typeof newId !== 'string' || !ID.test(newId)) return refuse(model, `"${newId}" is not an id: lowercase letters, digits and _, starting with a letter`);
  if (oldId === newId) return refuse(model, 'the id is already that');
  if (!allIds(model).has(oldId)) return refuse(model, `there is no "${oldId}" in this house`);
  if (allIds(model).has(newId)) return refuse(model, `"${newId}" is already used`);
  // an entity keeps its kind: r_ stays a room, w_ a wall (a level has no prefix and keeps none)
  if (oldId.includes('_') && oldId.split('_')[0] !== newId.split('_')[0]) return refuse(model, `keep the prefix ${oldId.split('_')[0]}_ (the kind of the entity)`);
  if (!oldId.includes('_') && newId.includes('_')) return refuse(model, `a level id has no underscore, like "${oldId}"`);

  let changed = 0;
  const rename = (v, key) => {
    if (typeof v === 'string') {
      if (TEXT_KEYS.has(key) || !hits(v, oldId)) return v;
      changed++;
      return newId + v.slice(oldId.length);
    }
    if (Array.isArray(v)) return v.map(x => rename(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k === oldId ? newId : k, rename(x, k)]));
    return v;
  };
  const next = rename(model);
  const issues = validateModel(next, buildModelGeometry(next));
  const fixture = (model.levels || []).some(l => (l.fixtures || []).some(f => f.id === oldId));
  const opening = (model.levels || []).some(l => (l.openings || []).some(o => o.id === oldId));
  return { model: next, report: { errors: [], issues, changed, fixture, opening } };
}

/** The name an entity carries (its own `name`), or '' when it has none. */
export function entityName(model, id) {
  const find = list => (list || []).find(x => x.id === id);
  for (const lv of model.levels || []) for (const key of ['rooms', 'walls', 'openings', 'fixtures', 'solids', 'objects', 'stairs']) {
    const x = find(lv[key]);
    if (x) return x.name || '';
  }
  return '';
}

/**
 * An id made from a name, with the prefix `oldId` has (r_, w_ …; none for a level), lowercase, Swedish letters
 * folded (Kök → kok). It is never an id the model uses: `_2`, `_3` … is added when it is taken (fixes list 26).
 */
export function idFromName(model, oldId, name) {
  const prefix = oldId.includes('_') ? oldId.split('_')[0] + '_' : '';
  const slug = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const base = prefix + (slug || oldId.split('_').slice(1).join('_') || 'item');
  const used = allIds(model);
  let id = base;
  for (let n = 2; used.has(id) && id !== oldId; n++) id = `${base}_${n}`;
  return id;
}

/**
 * The link of a fixture that is renamed moves with it (location.json → bindings, which are not in the model). Returns
 * { location, moved, conflict? }: when the new id already has a link, nothing changes and `conflict` holds both links, until
 * the choice is given: `resolve: 'use-old'` puts the renamed fixture's link in place of the existing one, `'keep-existing'`
 * drops the renamed fixture's link. The key keeps its place in the file.
 */
export function renameBinding(location, oldId, newId, { resolve = null } = {}) {
  const bindings = location.bindings || {};
  if (!(oldId in bindings)) return { location, moved: false };
  const old = bindings[oldId];
  const existing = bindings[newId];
  if (existing !== undefined && resolve === null) return { location, moved: false, conflict: { old, existing } };
  const winner = existing === undefined || resolve === 'use-old' ? old : existing;
  const out = {};
  for (const [k, v] of Object.entries(bindings)) {
    if (k === newId) continue;                      // placed where the old key was, below
    if (k === oldId) out[newId] = winner;
    else out[k] = v;
  }
  return { location: { ...location, bindings: out }, moved: true };
}
