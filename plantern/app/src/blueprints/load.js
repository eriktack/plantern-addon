// The blueprint loader (docs/plans/object-templates.md, T1). Pure: it is handed what was read (the built-in
// model modules, and the texts of a house's blueprints/*.json) and returns one list, plus what it refused and why.
//
// A house blueprint is declarative JSON with a fixed set of building blocks (object-designs/AGENT_INSTRUCTIONS.md §9):
// no code runs from a house. This file checks the whole file against that block set; build.js turns it into shapes.

import { checkMeta, defaultsFor } from '../../object-designs/lib/params.js';

// The limits of §9 (they hold for built-in models too).
export const LIMITS = { shapes: 300, dimension: 5000, repeat: 16, segments: 32, depth: 3 };

const ID = /^[a-z][a-z0-9-]*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const NUMERIC = new Set(['number', 'integer', 'enum_number']);
const OPS = new Set(['+', '-', '*', '/', 'min', 'max']);
const TOP_KEYS = new Set(['schema', 'id', 'name', 'description', 'params', 'parts', 'materials', 'variantDefaults', 'sizeParams', 'build']);
// block type → the keys it may carry besides `type`
const BLOCKS = {
  box: ['size'],
  cylinder: ['radius', 'height', 'segments'],
  union: ['children'],
  subtract: ['children'],
  intersect: ['children'],
  translate: ['offset', 'child'],
  rotate: ['degrees', 'child'],
  repeat: ['count', 'step', 'child'],
  group: ['part', 'children'],
};
const MAX_NESTING = 24; // how deep blocks may be nested at all, so a hostile file cannot exhaust the stack

const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
const paramType = d => d.type ?? 'number';

/** The `meta` of a house blueprint: what the built-in models export as `meta`. */
export function metaOf(json) {
  const meta = { id: json.id, name: json.name, description: json.description, params: json.params, parts: json.parts };
  if (json.variantDefaults !== undefined) meta.variantDefaults = json.variantDefaults;
  if (json.sizeParams !== undefined) meta.sizeParams = json.sizeParams;
  if (json.materials !== undefined) meta.materials = json.materials;
  return meta;
}

/**
 * The value of a number, a parameter reference or one simple sum, for the parameter values `p`.
 * Throws an Error that says what is wrong (a parameter that is missing, a division by zero).
 */
export function evalValue(v, p) {
  if (typeof v === 'number') return v;
  if (isObject(v) && 'param' in v) {
    const x = p[v.param];
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`parameter "${v.param}" is not a number`);
    return x;
  }
  if (isObject(v) && 'op' in v) {
    const [a, b] = v.args.map(arg => evalValue(arg, p));
    switch (v.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) throw new Error('a value divides by zero');
        return a / b;
      case 'min': return Math.min(a, b);
      default: return Math.max(a, b);
    }
  }
  throw new Error('a value is not a number, a parameter or a sum');
}

/** The parameter sets the limits are checked at: the defaults, every number at its smallest, every number at its largest. */
function corners(meta) {
  const defaults = defaultsFor(meta);
  const at = pick => {
    const out = { ...defaults };
    for (const d of meta.params) {
      if (!NUMERIC.has(paramType(d))) continue;
      const values = d.options ?? [d.min, d.max ?? d.default];
      out[d.key] = pick(values);
    }
    return out;
  };
  return [defaults, at(vs => Math.min(...vs)), at(vs => Math.max(...vs))];
}

class Check {
  constructor(json) {
    this.json = json;
    this.problems = [];
    this.meta = metaOf(json);
    this.params = new Map((Array.isArray(json.params) ? json.params : []).filter(isObject).map(d => [d.key, d]));
    this.parts = new Set((Array.isArray(json.parts) ? json.parts : []).filter(isObject).map(d => d.key));
    this.sets = [];      // set by run() once the meta is known to be sound
    this.shapes = 0;
    this.dims = [];      // [where, value] checked against the size limit once the sets are known
  }

  fail(where, text) { this.problems.push(`${where}: ${text}`); }

  /** A number, {param} or {op,args}; `depth` counts the sums nested so far. */
  value(v, where, depth = 0) {
    if (typeof v === 'number') { if (!Number.isFinite(v)) this.fail(where, 'must be a number'); return; }
    if (!isObject(v)) { this.fail(where, 'must be a number, { "param": … } or one sum { "op", "args" }'); return; }
    if ('param' in v) {
      const extra = Object.keys(v).filter(k => k !== 'param');
      if (extra.length) this.fail(where, `unknown key "${extra[0]}" next to "param"`);
      const d = this.params.get(v.param);
      if (!d) this.fail(where, `unknown parameter "${v.param}"`);
      else if (!NUMERIC.has(paramType(d))) this.fail(where, `parameter "${v.param}" is a ${paramType(d)}, not a number`);
      return;
    }
    if ('op' in v) {
      const extra = Object.keys(v).filter(k => k !== 'op' && k !== 'args');
      if (extra.length) this.fail(where, `unknown key "${extra[0]}" in a sum`);
      if (!OPS.has(v.op)) { this.fail(where, `unknown operator "${v.op}" (use + - * / min max)`); return; }
      if (depth + 1 > LIMITS.depth) { this.fail(where, `sums are nested more than ${LIMITS.depth} deep`); return; }
      if (!Array.isArray(v.args) || v.args.length !== 2) { this.fail(where, 'a sum takes exactly two values in "args"'); return; }
      v.args.forEach((arg, i) => this.value(arg, `${where}.args[${i}]`, depth + 1));
      return;
    }
    this.fail(where, 'must be a number, { "param": … } or one sum { "op", "args" }');
  }

  vector(v, n, where) {
    if (!Array.isArray(v) || v.length !== n) { this.fail(where, `must be a list of ${n} values`); return false; }
    v.forEach((x, i) => this.value(x, `${where}[${i}]`));
    return true;
  }

  /** A whole number between 1 and `max`: a literal, or a parameter whose whole range lies inside it. */
  count(v, max, where) {
    if (typeof v === 'number') {
      if (!Number.isInteger(v) || v < 1) this.fail(where, 'must be a whole number, at least 1');
      else if (v > max) this.fail(where, `must be at most ${max}`);
      return Math.max(1, Math.min(Number.isInteger(v) ? v : 1, max));
    }
    if (isObject(v) && Object.keys(v).length === 1 && 'param' in v) {
      const d = this.params.get(v.param);
      if (!d || !['integer', 'enum_number'].includes(paramType(d))) { this.fail(where, `parameter "${v.param}" must be a whole-number parameter (integer or enum_number)`); return 1; }
      const lo = d.options ? Math.min(...d.options) : d.min, hi = d.options ? Math.max(...d.options) : d.max;
      if (!Number.isInteger(lo) || lo < 1) this.fail(where, `parameter "${v.param}" can be below 1`);
      if (hi === undefined) { this.fail(where, `parameter "${v.param}" needs a max of at most ${max}`); return 1; }
      if (hi > max) this.fail(where, `parameter "${v.param}" can be above ${max}`);
      return Math.max(1, Math.min(hi, max));
    }
    this.fail(where, `must be a whole number or a whole-number parameter, at most ${max}`);
    return 1;
  }

  keys(node, where) {
    const allowed = BLOCKS[node.type];
    for (const k of Object.keys(node)) if (k !== 'type' && !allowed.includes(k)) this.fail(where, `unknown key "${k}" on a ${node.type}`);
    for (const k of allowed) if (!(k in node) && !(node.type === 'cylinder' && k === 'segments')) this.fail(where, `a ${node.type} needs "${k}"`);
  }

  children(node, where, depth) {
    if (!Array.isArray(node.children) || node.children.length === 0) { this.fail(where, 'children must list at least one block'); return []; }
    return node.children.map((c, i) => this.node(c, `${where}.children[${i}]`, depth + 1));
  }

  /**
   * Checks one block and the blocks under it. Returns { shapes, groups }: how many shapes it makes once
   * every repeat is counted, and whether groups (parts) are inside it.
   */
  node(node, where, depth) {
    const none = { shapes: 0, groups: false };
    if (depth > MAX_NESTING) { this.fail(where, `blocks are nested more than ${MAX_NESTING} deep`); return none; }
    if (!isObject(node) || typeof node.type !== 'string') { this.fail(where, 'must be a block: an object with a "type"'); return none; }
    if (!(node.type in BLOCKS)) { this.fail(where, `unknown block "${node.type}" (allowed: ${Object.keys(BLOCKS).join(', ')})`); return none; }
    this.keys(node, where);

    switch (node.type) {
      case 'box':
        if (this.vector(node.size, 3, `${where}.size`)) node.size.forEach((v, i) => this.dims.push([`${where}.size[${i}]`, v]));
        return { shapes: 1, groups: false };
      case 'cylinder':
        if ('radius' in node) { this.value(node.radius, `${where}.radius`); this.dims.push([`${where}.radius (diameter)`, { op: '*', args: [node.radius, 2] }]); }
        if ('height' in node) { this.value(node.height, `${where}.height`); this.dims.push([`${where}.height`, node.height]); }
        if ('segments' in node && !(Number.isInteger(node.segments) && node.segments >= 3 && node.segments <= LIMITS.segments)) {
          this.fail(`${where}.segments`, `must be a whole number from 3 to ${LIMITS.segments}`);
        }
        return { shapes: 1, groups: false };
      case 'union': case 'subtract': case 'intersect': {
        const kids = this.children(node, where, depth);
        const groups = kids.filter(k => k.groups).length;
        if (node.type === 'union' && groups > 0 && groups < kids.length) this.fail(where, 'a union cannot mix groups and bare shapes: put the shapes inside a group');
        if (node.type !== 'union' && groups > 0) this.fail(where, `a ${node.type} cannot contain groups: use it inside a group`);
        return { shapes: kids.reduce((n, k) => n + k.shapes, 0), groups: groups > 0 };
      }
      case 'group': {
        if (typeof node.part !== 'string' || !this.parts.has(node.part)) this.fail(`${where}.part`, `"${node.part}" is not one of the parts`);
        const kids = this.children(node, where, depth);
        if (kids.some(k => k.groups)) this.fail(where, 'a group cannot contain another group');
        return { shapes: kids.reduce((n, k) => n + k.shapes, 0), groups: true };
      }
      case 'translate': {
        this.vector(node.offset, 3, `${where}.offset`);
        return this.node(node.child, `${where}.child`, depth + 1);
      }
      case 'rotate': {
        if (![0, 90, 180, 270].includes(node.degrees)) this.fail(`${where}.degrees`, 'must be 0, 90, 180 or 270');
        return this.node(node.child, `${where}.child`, depth + 1);
      }
      default: { // repeat
        const n = this.count(node.count, LIMITS.repeat, `${where}.count`);
        this.vector(node.step, 2, `${where}.step`);
        const child = this.node(node.child, `${where}.child`, depth + 1);
        return { shapes: n * child.shapes, groups: child.groups };
      }
    }
  }

  /** The size limit, at the defaults and at the smallest and largest value of every number. */
  dimensions() {
    for (const [where, v] of this.dims) {
      for (const [i, p] of this.sets.entries()) {
        let x;
        try { x = evalValue(v, p); } catch (e) { this.fail(where, e.message); break; }
        if (x > LIMITS.dimension) {
          this.fail(where, `${Math.round(x)} mm is over the ${LIMITS.dimension} mm limit (${['at the defaults', 'with every number at its smallest', 'with every number at its largest'][i]})`);
          break;
        }
        if (i === 0 && !(x > 0)) { this.fail(where, 'must be above 0 at the defaults'); break; }
      }
    }
  }
}

/** Checks the materials of a blueprint (colours only) and the `options` of its material parameter and parts. */
function checkMaterials(json, problems, libraryNames) {
  const own = new Set();
  if (json.materials !== undefined) {
    if (!isObject(json.materials)) problems.push('materials: must be an object of name to { "color": "#rrggbb" }');
    else {
      for (const [name, m] of Object.entries(json.materials)) {
        const where = `materials.${name}`;
        if (!ID.test(name)) problems.push(`${where}: a material name uses lowercase letters, digits and dashes`);
        if (!isObject(m)) { problems.push(`${where}: must be { "color": "#rrggbb" }`); continue; }
        for (const k of Object.keys(m)) {
          if (k === 'texture' || k === 'uvScale') problems.push(`${where}: a house blueprint's material is a colour only; textures are not allowed`);
          else if (k !== 'color') problems.push(`${where}: unknown key "${k}"`);
        }
        if (!COLOR.test(m.color ?? '')) problems.push(`${where}: color must be #rrggbb`);
        own.add(name);
      }
    }
  }
  const options = (list, where) => {
    if (list === undefined) return;
    if (!Array.isArray(list) || list.length === 0 || list.some(o => typeof o !== 'string' || !o)) { problems.push(`${where}: options must be a list of names`); return; }
    if (new Set(list).size !== list.length) problems.push(`${where}: duplicate option`);
    for (const o of list) {
      if (o === 'custom' || COLOR.test(o) || own.has(o)) continue;
      if (libraryNames && !libraryNames.has(o)) problems.push(`${where}: "${o}" is not in the materials library or this blueprint's materials`);
    }
  };
  const materialParams = (Array.isArray(json.params) ? json.params : []).filter(d => isObject(d) && d.type === 'material');
  if (materialParams.length > 1) problems.push('params: only one material parameter (for the whole object) is allowed');
  for (const d of materialParams) {
    options(d.options, `param "${d.key}"`);
    if (Array.isArray(d.options) && !d.options.includes(d.default) && !(d.options.includes('custom') && COLOR.test(d.default ?? ''))) {
      problems.push(`param "${d.key}": the default is not one of the options`);
    }
  }
  for (const p of Array.isArray(json.parts) ? json.parts : []) if (isObject(p)) options(p.options, `part "${p.key}"`);
}

/**
 * Lists what is wrong with a house blueprint (already parsed from JSON); an empty list means it is usable.
 * `libraryNames` (a Set of the names in materials/library.json) is optional: given, the material options are checked against it.
 */
export function checkHouseBlueprint(json, { file, libraryNames } = {}) {
  if (!isObject(json)) return ['the file must contain one JSON object'];
  const problems = [];
  for (const k of Object.keys(json)) if (!TOP_KEYS.has(k)) problems.push(`unknown key "${k}" at the top of the file`);
  if (json.schema !== 1) problems.push('schema must be 1');
  if (typeof json.id !== 'string' || !ID.test(json.id)) problems.push('id must be lowercase letters, digits and dashes, starting with a letter');
  else if (file && file.replace(/\.json$/, '') !== json.id) problems.push(`id "${json.id}" must equal the file name "${file.replace(/\.json$/, '')}"`);
  if (typeof json.description !== 'string' || !json.description) problems.push('description must be a non-empty string');

  const meta = metaOf(json);
  const metaProblems = checkMeta(meta);
  problems.push(...metaProblems);
  checkMaterials(json, problems, libraryNames);
  if (!('build' in json)) { problems.push('build is missing'); return problems; }

  const check = new Check(json);
  const top = check.node(json.build, 'build', 0);
  if (!top.groups) check.fail('build', 'must be made of groups, one for each part');
  if (top.shapes > LIMITS.shapes) check.fail('build', `${top.shapes} shapes, over the limit of ${LIMITS.shapes}`);
  if (!metaProblems.length) {   // the limits are evaluated with parameter values, which need a sound meta
    check.sets = corners(meta);
    check.dimensions();
  }
  problems.push(...check.problems);
  return problems;
}

/** Parses the text of a house blueprint file and checks it. Returns { ok: true, json } or { ok: false, problems }. */
export function parseHouseBlueprint(text, options = {}) {
  let json;
  try { json = JSON.parse(text); } catch (e) { return { ok: false, problems: [`not valid JSON: ${e.message}`] }; }
  const problems = checkHouseBlueprint(json, options);
  return problems.length ? { ok: false, problems } : { ok: true, json };
}

/**
 * One list of every blueprint.
 *   builtIn: the model modules of object-designs/models/ ({ meta, build })
 *   house:   the house's blueprints/*.json as [{ file: 'table-x.json', text }]
 *   libraryNames: optional Set of the names in object-designs/materials/library.json
 * Returns { blueprints: [{ id, source: 'built-in' | 'house', meta, json? }], refused: [{ id?, file?, source, problems }] }.
 * A file that is refused is listed with the reasons and left out of `blueprints`; nothing is dropped silently.
 */
export function loadBlueprints({ builtIn = [], house = [], libraryNames } = {}) {
  const blueprints = [], refused = [], seen = new Set();
  for (const model of builtIn) {
    const problems = checkMeta(model?.meta);
    const id = model?.meta?.id;
    if (!problems.length && seen.has(id)) problems.push(`two built-in blueprints have the id "${id}"`);
    if (problems.length) { refused.push({ id, source: 'built-in', problems }); continue; }
    seen.add(id);
    blueprints.push({ id, source: 'built-in', meta: model.meta });
  }
  for (const { file, text } of [...house].sort((a, b) => String(a.file).localeCompare(String(b.file)))) {
    const parsed = parseHouseBlueprint(text, { file, libraryNames });
    if (!parsed.ok) { refused.push({ file, source: 'house', problems: parsed.problems }); continue; }
    const { json } = parsed;
    if (seen.has(json.id)) {
      refused.push({ id: json.id, file, source: 'house', problems: [`the id "${json.id}" is already used by a built-in blueprint or another file`] });
      continue;
    }
    seen.add(json.id);
    blueprints.push({ id: json.id, source: 'house', meta: metaOf(json), json });
  }
  return { blueprints, refused };
}
