// lib/params.js
// Checks a model's meta descriptor and validates parameter values against it. Pure.
// Errors name the parameter by its label and give the unit, so the message is readable in the catalog.
//
// Parameter types (LIBRARY.md Q1):
//   number (type omitted)  key, label, unit, default, min, max, step
//   integer                key, label, default, min, max?, step? (default 1), unit? (none for a count)
//   boolean                key, label, default (true / false)
//   enum                   key, label, default, options: [string, …]
//   enum_number            key, label, default, options: [number, …], unit? (none for a count, like integer)
//   material               key, label, default (a library name or #rrggbb)
//
// Variants: an enum parameter with key `variant`, and optionally meta.variantDefaults
// { <variant>: { <key>: value, … } }. When a variant is picked, its defaults replace the
// parameter defaults; a value given explicitly still wins.
//
// Placement (decision 230): optional meta.placement = { mount: 'floor' | 'wall' | 'ceiling', z? } says where a new
// object starts when it is placed in a house: on the floor (z 0, or z mm up), on a wall with its bottom z mm above the
// floor, or hanging from the ceiling (no z: it hangs from the room's ceiling). It is only a start; the house decides
// (decision 226), so it is not a parameter and never reaches build(). Without it: on the floor. A variant can start
// elsewhere: placement.variants = { <variant>: { mount, z? } }.

const MOUNTS = new Set(['floor', 'wall', 'ceiling']);
const MAX_Z = 3000;

const KEY = /^[a-z][A-Za-z0-9]*$/;
const TYPES = new Set(['number', 'integer', 'boolean', 'enum', 'enum_number', 'material']);

const typeOf = d => d.type ?? 'number';

/** Checks one value against its parameter; returns an error text, or null when it is valid. */
function checkValue(d, v) {
  const unit = d.unit ? ` ${d.unit}` : '';
  switch (typeOf(d)) {
    case 'material':
      return typeof v === 'string' && v.trim() ? null : `${d.label} must be a material name or #rrggbb`;
    case 'boolean':
      return typeof v === 'boolean' ? null : `${d.label} must be true or false`;
    case 'enum':
    case 'enum_number':
      return d.options.includes(v) ? null : `${d.label} must be one of ${d.options.join(', ')}${unit}`;
    case 'integer':
      if (!Number.isInteger(v)) return `${d.label} must be a whole number`;
      break;
    default:
      if (typeof v !== 'number' || !Number.isFinite(v)) return `${d.label} must be a number`;
  }
  if (v < d.min) return `${d.label} must be at least ${d.min}${unit}`;
  if (d.max !== undefined && v > d.max) return `${d.label} must be at most ${d.max}${unit}`;
  return null;
}

function checkParam(d, where, problems) {
  const type = typeOf(d);
  if (!TYPES.has(type)) { problems.push(`${where}: unknown type "${d.type}"`); return; }
  if (type === 'material') {
    if (typeof d.default !== 'string' || !d.default) problems.push(`${where}: material default must be a name or #rrggbb`);
    return;
  }
  if (type === 'boolean') {
    if (typeof d.default !== 'boolean') problems.push(`${where}: default must be true or false`);
    return;
  }
  if (type === 'enum' || type === 'enum_number') {
    const want = type === 'enum' ? 'string' : 'number';
    if (!Array.isArray(d.options) || d.options.length === 0) { problems.push(`${where}: options must list at least one value`); return; }
    if (d.options.some(o => (want === 'number' ? !Number.isFinite(o) : typeof o !== 'string' || !o))) {
      problems.push(`${where}: every option must be a ${want}`);
    }
    if (new Set(d.options).size !== d.options.length) problems.push(`${where}: duplicate option`);
    if (type === 'enum_number' && d.unit !== undefined && typeof d.unit !== 'string') problems.push(`${where}: unit must be a string`);
    if (!d.options.includes(d.default)) problems.push(`${where}: default is not one of the options`);
    if (d.labels !== undefined) {
      if (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels)) {
        problems.push(`${where}: labels must be an object of option to display name`);
      } else {
        for (const [k, v] of Object.entries(d.labels)) {
          if (!d.options.some(o => String(o) === k)) problems.push(`${where}: label for "${k}", which is not an option`);
          else if (typeof v !== 'string' || !v.trim()) problems.push(`${where}: the label for "${k}" must be a non-empty string`);
        }
      }
      // icons (ND5): a model may name the icon of an option itself, else the library's drawing is used
      if (d.icons !== undefined) {
        if (!d.icons || typeof d.icons !== 'object' || Array.isArray(d.icons)) {
          problems.push(`${where}: icons must be an object of option to icon name`);
        } else {
          for (const [k, v] of Object.entries(d.icons)) {
            if (!d.options.some(o => String(o) === k)) problems.push(`${where}: icon for "${k}", which is not an option`);
            else if (typeof v !== 'string' || !v.trim()) problems.push(`${where}: the icon for "${k}" must be an icon name`);
          }
        }
      }
    }
    return;
  }
  // number and integer
  const integer = type === 'integer';
  if (!integer && typeof d.unit !== 'string') problems.push(`${where}: unit is missing`);
  if (integer && d.unit !== undefined && typeof d.unit !== 'string') problems.push(`${where}: unit must be a string`);
  for (const f of integer ? ['default', 'min'] : ['default', 'min', 'max', 'step']) {
    if (!Number.isFinite(d[f])) problems.push(`${where}: ${f} must be a number`);
  }
  if (integer) {
    for (const f of ['default', 'min', 'max', 'step']) {
      if (Number.isFinite(d[f]) && !Number.isInteger(d[f])) problems.push(`${where}: ${f} must be a whole number`);
    }
  }
  if (Number.isFinite(d.min) && Number.isFinite(d.max) && d.min > d.max) problems.push(`${where}: min is above max`);
  if (Number.isFinite(d.default) && Number.isFinite(d.min) && d.default < d.min) problems.push(`${where}: default is below min`);
  if (Number.isFinite(d.default) && Number.isFinite(d.max) && d.default > d.max) problems.push(`${where}: default is above max`);
  if (Number.isFinite(d.step) && d.step <= 0) problems.push(`${where}: step must be above 0`);
}

function checkVariantDefaults(meta, problems) {
  const vd = meta.variantDefaults;
  if (vd === undefined) return;
  const variant = (meta.params || []).find(d => d?.key === 'variant');
  if (!variant || variant.type !== 'enum') { problems.push('meta.variantDefaults needs an enum parameter with key "variant"'); return; }
  if (!vd || typeof vd !== 'object' || Array.isArray(vd)) { problems.push('meta.variantDefaults must be an object of variant to defaults'); return; }
  const byKey = new Map((meta.params || []).filter(Boolean).map(d => [d.key, d]));
  for (const [name, values] of Object.entries(vd)) {
    const where = `variantDefaults.${name}`;
    if (!Array.isArray(variant.options) || !variant.options.includes(name)) { problems.push(`${where}: "${name}" is not a variant`); continue; }
    if (!values || typeof values !== 'object' || Array.isArray(values)) { problems.push(`${where} must be an object`); continue; }
    for (const [key, v] of Object.entries(values)) {
      const d = byKey.get(key);
      if (!d) { problems.push(`${where}: unknown parameter "${key}"`); continue; }
      if (key === 'variant') { problems.push(`${where}: cannot set the variant itself`); continue; }
      if (!TYPES.has(typeOf(d))) continue; // already reported for the parameter
      const err = checkValue(d, v);
      if (err) problems.push(`${where}: ${err}`);
    }
  }
}

// Which parameter sets an outer dimension (`meta.sizeParams`, docs/archive/2026-10-14-object-templates.md): { x?, y?, z? }, each a parameter
// key (a number or integer parameter whose value IS the dimension in mm), or { <variant>: key | null, default?: key | null }
// when a shape sets it with another parameter (a round table's width is its length too). An axis that is not named, or that is
// null for the variant, is set by the build only. The Editor uses it to turn a typed size into options.
const AXES = ['x', 'y', 'z'];
const SIZE_TYPES = new Set(['number', 'integer']);

function checkSizeParams(meta, problems) {
  const sp = meta.sizeParams;
  if (sp === undefined) return;
  if (!sp || typeof sp !== 'object' || Array.isArray(sp)) { problems.push('meta.sizeParams must be an object of axis (x, y, z) to parameter'); return; }
  const byKey = new Map((meta.params || []).filter(Boolean).map(d => [d.key, d]));
  const variant = (meta.params || []).find(d => d?.key === 'variant');
  const key = (v, where) => {
    const d = byKey.get(v);
    if (typeof v !== 'string' || !d) problems.push(`${where}: "${v}" is not a parameter`);
    else if (!SIZE_TYPES.has(typeOf(d))) problems.push(`${where}: "${v}" must be a number or integer parameter (its value is the size in mm)`);
  };
  for (const [axis, spec] of Object.entries(sp)) {
    const where = `sizeParams.${axis}`;
    if (!AXES.includes(axis)) { problems.push(`${where}: the axes are x, y and z`); continue; }
    if (typeof spec === 'string') { key(spec, where); continue; }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) { problems.push(`${where} must be a parameter key, or an object of variant to parameter key`); continue; }
    for (const [name, v] of Object.entries(spec)) {
      if (name !== 'default' && !(Array.isArray(variant?.options) && variant.options.includes(name))) { problems.push(`${where}: "${name}" is not a variant`); continue; }
      if (v !== null) key(v, `${where}.${name}`);
    }
  }
}

/**
 * The parameter key that sets the dimension of `axis` ('x', 'y' or 'z') for a shape (the value of the `variant` parameter, if any),
 * or null when the build sets it. Assumes a meta that checkMeta accepts.
 */
export function sizeParamFor(meta, axis, variant) {
  const spec = meta.sizeParams?.[axis];
  if (typeof spec === 'string') return spec;
  if (!spec) return null;
  return (variant !== undefined && Object.hasOwn(spec, variant) ? spec[variant] : spec.default) ?? null;
}

function checkMount(pl, where, problems) {
  if (!MOUNTS.has(pl.mount)) { problems.push(`${where}.mount must be floor, wall or ceiling`); return; }
  if (pl.mount === 'ceiling') { if (pl.z !== undefined) problems.push(`${where}: a ceiling item hangs from the ceiling and has no z`); return; }
  if (pl.mount === 'wall' && pl.z === undefined) problems.push(`${where}: a wall item needs z, its bottom in mm above the floor`);
  if (pl.z !== undefined && !(Number.isFinite(pl.z) && pl.z >= 0 && pl.z <= MAX_Z)) problems.push(`${where}.z must be a number from 0 to ${MAX_Z} mm`);
}

// meta.placement = { mount, z?, variants?: { <variant>: { mount, z? } } }: a variant that starts elsewhere (an upper
// kitchen cabinet on the wall, the base cabinets on the floor) has its own entry
// placement.hosts (openings-and-lit-objects OB1b): where the model may stand, a non-empty list of room, wall, sill, head.
// Absent: derived from the mount (hostsOf). A sill is never derived, only declared.
function checkHosts(p, where, problems) {
  if (p.hosts === undefined) return;
  if (!Array.isArray(p.hosts) || !p.hosts.length) { problems.push(`${where}.hosts must be a non-empty list of room, wall, sill, head`); return; }
  for (const h of p.hosts) if (!HOST_NAMES.includes(h)) problems.push(`${where}.hosts: "${h}" is not room, wall, sill or head`);
  if (new Set(p.hosts).size !== p.hosts.length) problems.push(`${where}.hosts lists a place twice`);
}

function checkPlacement(pl, problems, meta) {
  if (pl === undefined) return;
  if (!pl || typeof pl !== 'object' || Array.isArray(pl)) { problems.push('meta.placement must be an object { mount, z }'); return; }
  for (const k of Object.keys(pl)) if (!['mount', 'z', 'variants', 'hosts'].includes(k)) problems.push(`meta.placement: unknown key "${k}"`);
  checkMount(pl, 'meta.placement', problems);
  checkHosts(pl, 'meta.placement', problems);
  if (pl.variants === undefined) return;
  const options = (meta.params || []).find(d => d?.key === 'variant')?.options;
  if (!Array.isArray(options)) { problems.push('meta.placement.variants needs an enum parameter with key "variant"'); return; }
  if (!pl.variants || typeof pl.variants !== 'object' || Array.isArray(pl.variants)) { problems.push('meta.placement.variants must be an object of variant to { mount, z }'); return; }
  for (const [name, v] of Object.entries(pl.variants)) {
    const where = `meta.placement.variants.${name}`;
    if (!options.includes(name)) { problems.push(`${where}: "${name}" is not a variant`); continue; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { problems.push(`${where} must be an object { mount, z }`); continue; }
    for (const k of Object.keys(v)) if (!['mount', 'z', 'hosts'].includes(k)) problems.push(`${where}: unknown key "${k}"`);
    checkMount(v, where, problems);
    checkHosts(v, where, problems);
  }
}

/**
 * Where a new object of this model starts: { mount, z } (z null for a ceiling item), for a variant when it has its own
 * entry, else the model's. Assumes a meta checkMeta accepts.
 */
/** The places an object of this model may stand, for its variant: room, wall, sill, head (openings-and-lit-objects OB1b). */
export const HOST_NAMES = ['room', 'wall', 'sill', 'head'];

/**
 * The hosts of a model's variant: `placement.hosts` when declared; else derived from `mount` (floor → room, wall;
 * wall → wall; ceiling → room, head). A sill is never derived, only declared.
 */
export function hostsOf(meta, variant) {
  const top = meta?.placement;
  const pl = (variant !== undefined && top?.variants?.[variant]) || top;
  if (Array.isArray(pl?.hosts)) return [...pl.hosts];
  const mount = pl?.mount ?? 'floor';
  return mount === 'wall' ? ['wall'] : mount === 'ceiling' ? ['room', 'head'] : ['room', 'wall'];
}

export function placementOf(meta, variant) {
  const top = meta?.placement;
  const pl = (variant !== undefined && top?.variants?.[variant]) || top;
  if (!pl) return { mount: 'floor', z: 0 };
  return { mount: pl.mount, z: pl.mount === 'ceiling' ? null : pl.z ?? 0 };
}

/** Lists problems with a model's meta. An empty list means the descriptor is usable. */
/**
 * The name to show for one option of an enum parameter: its `labels` entry (the display name), else the option itself.
 */
export function labelOf(d, option) {
  return d?.labels?.[String(option)] ?? String(option);
}

/**
 * Whether a parameter applies to a variant (variant options). A parameter without `appliesTo` applies to every variant;
 * with it, only to the listed ones. Without a variant (a model with no variant parameter) every parameter applies.
 */
export function appliesTo(d, variant) {
  if (!Array.isArray(d?.appliesTo) || variant === undefined) return true;
  return d.appliesTo.includes(variant);
}

/**
 * Whether a part is built for these values: it applies to the variant, and the yes/no parameter it `needs` (the glass of doors
 * that may or may not be glazed) is on. A part that is not built has no geometry, no material and no material selector.
 */
export function partBuilt(part, params, variant) {
  return appliesTo(part, variant) && (!part?.needs || params?.[part.needs] === true);
}

function checkAppliesTo(d, where, meta, problems) {
  if (d.key === 'variant' || d.type === 'material') {
    problems.push(`${where}: appliesTo is not allowed on the variant or the material`);
    return;
  }
  const variant = (meta.params || []).find(x => x?.key === 'variant');
  if (!variant || !Array.isArray(variant.options)) {
    problems.push(`${where}: appliesTo needs an enum parameter with key "variant"`);
    return;
  }
  if (!Array.isArray(d.appliesTo) || d.appliesTo.length === 0) {
    problems.push(`${where}: appliesTo must be a non-empty list of variants`);
    return;
  }
  for (const name of d.appliesTo) {
    if (!variant.options.includes(name)) problems.push(`${where}: appliesTo "${name}" is not a variant`);
  }
}

export function checkMeta(meta) {
  const problems = [];
  if (!meta || typeof meta !== 'object') return ['meta is missing'];
  if (typeof meta.id !== 'string' || !meta.id) problems.push('meta.id must be a non-empty string');
  if (typeof meta.name !== 'string' || !meta.name) problems.push('meta.name must be a non-empty string');
  if (!Array.isArray(meta.params)) problems.push('meta.params must be an array');
  if (!Array.isArray(meta.parts) || meta.parts.length === 0) problems.push('meta.parts must list at least one part');

  const seen = new Set();
  for (const d of meta.params || []) {
    const where = `param "${d?.key}"`;
    if (!d || typeof d.key !== 'string' || !KEY.test(d.key)) problems.push(`${where}: key must be camelCase`);
    if (d && seen.has(d.key)) problems.push(`${where}: duplicate key`);
    if (d) seen.add(d.key);
    if (!d) continue;
    if (typeof d.label !== 'string' || !d.label) problems.push(`${where}: label is missing`);
    checkParam(d, where, problems);
    if (d.appliesTo !== undefined) checkAppliesTo(d, where, meta, problems);
  }
  const variant = (meta.params || []).find(d => d?.key === 'variant');
  if (variant && variant.type !== 'enum') problems.push('param "variant" must be of type enum');
  checkVariantDefaults(meta, problems);
  checkPlacement(meta.placement, problems, meta);
  checkSizeParams(meta, problems);

  const partKeys = new Set();
  for (const p of meta.parts || []) {
    if (!p || typeof p.key !== 'string' || !KEY.test(p.key)) { problems.push(`part key "${p?.key}" must be camelCase`); continue; }
    if (partKeys.has(p.key)) problems.push(`part "${p.key}": duplicate key`);
    partKeys.add(p.key);
    if (typeof p.label !== 'string' || !p.label) problems.push(`part "${p.key}": label is missing`);
    if (p.needs !== undefined && (meta.params || []).find(d => d?.key === p.needs)?.type !== 'boolean') problems.push(`part "${p.key}": needs must be the key of a yes/no (boolean) parameter`);
    if (p.defaultMaterial !== undefined && (typeof p.defaultMaterial !== 'string' || !p.defaultMaterial.trim())) problems.push(`part "${p.key}": defaultMaterial must be a material name or #rrggbb`);
    if (p.appliesTo !== undefined) checkAppliesTo(p, `part "${p.key}"`, meta, problems);
  }
  if (!(meta.params || []).some(d => d?.type === 'material')) {
    problems.push('meta.params needs one material parameter (type: "material") for the whole object');
  }
  return problems;
}

/**
 * The default value of every parameter for a variant (the model's default variant when none is
 * given): the parameter defaults with that variant's defaults on top. The catalog uses it to reset
 * the form when a variant is picked. Assumes a meta that checkMeta accepts.
 */
export function defaultsFor(meta, variant) {
  const variantParam = meta.params.find(d => d.key === 'variant');
  const chosen = variantParam ? (variant ?? variantParam.default) : undefined;
  const overrides = (chosen !== undefined && meta.variantDefaults?.[chosen]) || {};
  const out = {};
  for (const d of meta.params) out[d.key] = d.key === 'variant' ? chosen : (overrides[d.key] ?? d.default);
  return out;
}

/**
 * Returns the full parameter set for a model: every declared key filled (defaults applied, the
 * picked variant's defaults first), values checked against their type and range, material names
 * checked for shape only (the library checks them later), and partMaterials limited to declared
 * parts. Throws one Error listing all problems.
 */
export function resolveParams(meta, input = {}) {
  const problems = checkMeta(meta);
  if (problems.length) throw new Error(`Model "${meta?.id}" has a bad meta: ${problems.join('; ')}`);

  const errors = [];
  const out = {};
  const declared = new Set(meta.params.map(d => d.key));
  for (const key of Object.keys(input)) {
    if (key === 'partMaterials') continue;
    if (!declared.has(key)) errors.push(`unknown parameter "${key}"`);
  }

  // A bad variant is reported below like any other value; its defaults are not used.
  const variantParam = meta.params.find(d => d.key === 'variant');
  const variant = variantParam && input.variant !== undefined && !checkValue(variantParam, input.variant)
    ? input.variant : undefined;
  const defaults = defaultsFor(meta, variant);
  // The variant the options are read for. A parameter that does not apply to it takes the value that variant has for it
  // (its variantDefaults, else the parameter's default); a value given for it is not used and not checked, since the forms
  // keep the value of a hidden option.
  const active = variant ?? (variantParam ? variantParam.default : undefined);

  for (const d of meta.params) {
    const v = appliesTo(d, active) ? (input[d.key] ?? defaults[d.key]) : defaults[d.key];
    const err = checkValue(d, v);
    if (err) { errors.push(err); continue; }
    out[d.key] = typeOf(d) === 'material' ? v.trim() : v;
  }

  const partMaterials = {};
  const given = input.partMaterials ?? {};
  if (typeof given !== 'object' || Array.isArray(given)) {
    errors.push('partMaterials must be an object of part key to material');
  } else {
    const partKeys = new Set(meta.parts.map(p => p.key));
    for (const [k, v] of Object.entries(given)) {
      if (!partKeys.has(k)) { errors.push(`unknown part "${k}" in partMaterials`); continue; }
      if (typeof v !== 'string') { errors.push(`partMaterials.${k} must be a string`); continue; }
      // empty means "use the whole-object material"; a part that does not apply to the variant takes no material of its own
      const part = meta.parts.find(p => p.key === k);
      if (v.trim() && partBuilt(part, out, active)) partMaterials[k] = v.trim();
    }
  }
  out.partMaterials = partMaterials;

  if (errors.length) throw new Error(errors.join('; '));
  return out;
}
