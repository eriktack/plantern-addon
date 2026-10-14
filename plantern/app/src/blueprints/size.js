// Resizing a blueprint object (docs/archive/2026-10-14-object-templates.md, T7 follow-up): the size in the Editor is the outer box of what
// the blueprint builds, so a typed size is turned into the options that ARE that size (`meta.sizeParams`, see
// object-designs/lib/params.js) and the object is built again; an axis no option sets is read-only. Pure.

import { resolveParams, sizeParamFor } from '../../object-designs/lib/params.js';

/** The axes of an object's size [width, depth, height], as the model's x, y and z. */
export const SIZE_AXES = [
  { axis: 'x', name: 'Width' },
  { axis: 'y', name: 'Depth' },
  { axis: 'z', name: 'Height' },
];

// A typed size within this (mm) of the stored one is no change; two axes set by one option must agree within it.
const TOLERANCE = 0.5;

/** The values of an object's options, or null when they are not valid for the blueprint. */
function valuesOf(meta, params) {
  try { return resolveParams(meta, params ?? {}); } catch { return null; }
}

/**
 * Which option sets each axis of this object's size: [{ axis, name, param: { key, label, unit, min, max } | null }] in the order
 * of its size. `param` is null when only the build sets it (then the field is read-only). The shape (variant) is the object's own.
 */
export function sizeFields(meta, params) {
  const values = valuesOf(meta, params);
  const variant = values?.variant;
  return SIZE_AXES.map(({ axis, name }) => {
    const key = sizeParamFor(meta, axis, variant);
    const d = key && meta.params.find(p => p.key === key);
    return { axis, name, param: d ? { key: d.key, label: d.label, unit: d.unit ?? 'mm', min: d.min, max: d.max } : null };
  });
}

const range = p => (p.max === undefined ? `at least ${p.min}` : `${p.min} to ${p.max}`);

/**
 * What typing `typed` ([w, d, h] in mm) as the size of object `o` means: the options it changes. Only an axis that differs from
 * the stored size counts. Returns { ok: true, params, changed: [{ axis, key, label, from, to }] } with the object's options as
 * they would be (the caller builds them and stores the built size), or { ok: false, error } in words for the form: an axis
 * no option sets, a value outside the option's range, a whole number wanted, two axes set by one option that disagree.
 */
export function sizeEdit(meta, o, typed) {
  const fields = sizeFields(meta, o.params);
  const values = valuesOf(meta, o.params);
  if (!values) return { ok: false, error: `The options of ${o.id} are not valid for blueprint "${meta.id}"; fix them on the Objects page first.` };
  const wanted = new Map();       // option key → { to, axes: [name] }
  for (let i = 0; i < 3; i++) {
    const t = typed[i];
    if (!Number.isFinite(t)) return { ok: false, error: 'Sizes must be numbers of mm.' };
    if (Math.abs(t - o.size[i]) <= 0.001) continue;
    const { name, param } = fields[i];
    if (!param) return { ok: false, error: `${name} is set by the build of "${meta.id}", not by an option, so it cannot be typed. Change its options on the Objects page instead.` };
    const have = wanted.get(param.key);
    if (have && Math.abs(have.to - t) > TOLERANCE) {
      return { ok: false, error: `${have.axes.join(' and ')} and ${name} are both set by ${param.label}, so they must be the same size (${have.to} and ${t} mm are not).` };
    }
    wanted.set(param.key, { to: have?.to ?? t, axes: [...(have?.axes ?? []), name] });
  }
  const params = { ...o.params };
  const changed = [];
  for (const [key, { to, axes }] of wanted) {
    const d = meta.params.find(p => p.key === key);
    const named = `${axes.join(' and ')} is set by ${d.label}`;
    if (d.type === 'integer' && !Number.isInteger(to)) return { ok: false, error: `${named}, which must be a whole number.` };
    if (to < d.min || (d.max !== undefined && to > d.max)) {
      return { ok: false, error: `${named}, which can be ${range(d)} ${d.unit ?? 'mm'} for this shape; ${to} is outside that.` };
    }
    changed.push({ axis: axes.join(' and '), key, label: d.label, from: values[key], to });
    params[key] = to;
  }
  return { ok: true, params, changed };
}

/**
 * Whether an options form (`{ params, partMaterials }`, as src/param-form.js reads it for an object) says something else than the
 * object has: the values compared as the blueprint resolves them (a default left out equals the default written), and the part
 * materials compared without empty ones. An object whose stored options are not valid counts as changed.
 */
export function optionsChanged(meta, o, form) {
  const had = valuesOf(meta, o.params), now = valuesOf(meta, form.params);
  if (!had || !now) return true;
  const keys = new Set([...Object.keys(had), ...Object.keys(now)]);
  for (const k of keys) {
    if (k === 'partMaterials') continue;
    if (had[k] !== now[k]) return true;
  }
  const clean = m => Object.entries(m ?? {}).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(clean(o.partMaterials)) !== JSON.stringify(clean(form.partMaterials));
}
