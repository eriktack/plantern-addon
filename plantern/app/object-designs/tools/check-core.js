// tools/check-core.js
// The model checks of AGENT_INSTRUCTIONS.md §3 and §6, as pure code: no file or network access, so the same checks
// run in Node (tools/check-model.js) and in the browser (validate.html). The caller reads the model and its files.
//
// checkModule({ fileName, source, model, library, textures }) returns { id, errors, warnings, notes }.

import { checkMeta } from '../lib/params.js';
import { checkLibrary, resolveMaterial } from '../lib/materials.js';
import { buildModel } from '../lib/build.js';
import { meshBounds, openEdgeCount } from '../lib/geom.js';

export const TRIANGLE_BUDGET = 50000;
const TOLERANCE = 0.5; // mm
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALLOWED_IMPORT = '../lib/jscad.js';
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\brequire\s*\(/, 'require()'],
  [/\bprocess\./, 'process'],
  [/\bdocument\./, 'document'],
  [/\bwindow\./, 'window'],
  [/Math\.random/, 'Math.random()'],
  [/Date\.now|new Date\b/, 'the clock'],
  [/\bimport\s*\(/, 'dynamic import()'],
];

/** Deterministic pseudo-random numbers in [0, 1), so a check gives the same result every run. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Lists the import specifiers of a source file. */
export function importsOf(src) {
  const code = stripComments(src);
  const out = [];
  for (const m of code.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)) out.push(m[1]);
  return out;
}

/** A random valid value for a number or integer parameter (integers without a max get ten steps). */
function paramValue(d, rnd) {
  const step = d.step ?? 1;
  const top = d.max ?? d.min + 10 * step;
  const steps = Math.round((top - d.min) / step);
  return d.min + Math.min(steps, Math.floor(rnd() * (steps + 1))) * step;
}

/** The parameter kinds, as the checker needs them: numbers with a range, choices, yes/no flags. */
function kindsOf(meta) {
  return {
    numbers: meta.params.filter(d => d.type === undefined || d.type === 'integer'),
    choices: meta.params.filter(d => d.type === 'enum' || d.type === 'enum_number'),
    flags: meta.params.filter(d => d.type === 'boolean'),
    variant: meta.params.find(d => d.key === 'variant'),
  };
}

/**
 * Runs every check on an already loaded model.
 * model: the module ({ meta, build, size? }); source: its text; fileName: its file name;
 * library: parsed materials library. Returns { id, errors, warnings, notes }.
 */
export function checkModule({ fileName, source, model, library, textures = new Map(), seed = 1, samples = 8 }) {
  const result = { id: fileName, errors: [], warnings: [], notes: [] };
  const err = m => result.errors.push(m);
  const warn = m => result.warnings.push(m);

  // File and identity
  const name = fileName.replace(/.js$/, '').replace(/^_/, '');
  if (!KEBAB.test(name)) err(`file name "${fileName}" must be kebab-case`);
  for (const spec of importsOf(source)) {
    if (spec !== ALLOWED_IMPORT) err(`imports "${spec}"; a model may only import from "${ALLOWED_IMPORT}"`);
  }
  const code = stripComments(source);
  for (const [re, what] of FORBIDDEN) if (re.test(code)) err(`uses ${what}; models must be pure geometry`);

  // Meta
  const problems = checkMeta(model?.meta);
  for (const p of problems) err(`meta: ${p}`);
  if (problems.length) return result;
  if (model.meta.id !== name) err(`meta.id "${model.meta.id}" must equal the file name "${name}"`);
  if (typeof model.build !== 'function') { err('build() is missing'); return result; }
  if (model.meta.params.some(d => d.key === 'lightHeight') && typeof model.lightPoint !== 'function') err('a lighting model (it has a lightHeight parameter) must export lightPoint(p), see AGENT_INSTRUCTIONS §3.3');
  if (model.lightPoint !== undefined && typeof model.lightPoint !== 'function') err('lightPoint, if exported, must be a function');
  if (model.size !== undefined && typeof model.size !== 'function') err('size, if exported, must be a function');
  for (const p of checkLibrary(library, { files: new Set(textures.keys()) })) err(`materials/library.json: ${p}`);
  if (result.errors.length) return result;

  const material = model.meta.params.find(d => d.type === 'material');
  try { resolveMaterial(material.default, library, 'default'); } catch (e) { err(e.message); }
  for (const part of model.meta.parts) {
    if (part.defaultMaterial === undefined) continue;
    try { resolveMaterial(part.defaultMaterial, library, `part "${part.label}" defaultMaterial`); } catch (e) { err(e.message); }
  }

  const kinds = kindsOf(model.meta);
  const build = input => buildModel(model, input, library, { textures });

  // Placement: the feet on z = 0, centred on x and y, and the size from size() when the model has one.
  // Runs at the defaults, at every choice and yes/no value, and at every variant.
  const placement = (built, label) => {
    const meshes = built.parts.map(p => p.mesh);
    const bounds = meshBounds({ pos: meshes.flatMap(m => m.pos), nrm: [], idx: [] });
    if (!bounds) { err(`${label}: the model builds no geometry`); return null; }
    if (Math.abs(bounds.min[2]) > TOLERANCE) err(`${label}: feet are not on z = 0 (lowest point ${bounds.min[2].toFixed(2)} mm)`);
    for (const k of [0, 1]) {
      const mid = (bounds.min[k] + bounds.max[k]) / 2;
      if (Math.abs(mid) > TOLERANCE) err(`${label}: not centred on ${'xy'[k]} (middle ${mid.toFixed(2)} mm)`);
    }
    if (typeof model.size === 'function') {
      const want = model.size(built.params);
      const got = [0, 1, 2].map(k => bounds.max[k] - bounds.min[k]);
      ['x', 'y', 'z'].forEach((axis, k) => {
        if (Math.abs(got[k] - want[k]) > TOLERANCE) {
          err(`${label}: size ${axis} is ${got[k].toFixed(1)} mm but the parameters say ${want[k]} mm`);
        }
      });
    }
    lightCheck(built, bounds, label);
    return bounds;
  };

  // A lighting model (it has a lightHeight parameter) exports lightPoint(p): [x, y, z] inside the built bounds (AGENT_INSTRUCTIONS §3.3).
  const hasLight = model.meta.params.some(d => d.key === 'lightHeight');
  const lightCheck = (built, bounds, label) => {
    if (!hasLight) return;
    let at;
    try { at = model.lightPoint(built.params); } catch (e) { err(`${label}: lightPoint() fails: ${e.message}`); return; }
    if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) { err(`${label}: lightPoint() must return [x, y, z] in mm`); return; }
    const outside = [0, 1, 2].filter(k => at[k] < bounds.min[k] - TOLERANCE || at[k] > bounds.max[k] + TOLERANCE);
    if (outside.length) err(`${label}: lightPoint() [${at.map(v => v.toFixed(1)).join(', ')}] is outside the model on ${outside.map(k => 'xyz'[k]).join(', ')}`);
  };

  // Defaults: the full set of checks
  let defaults;
  try {
    defaults = build({});
  } catch (e) {
    err(`build() fails at the defaults: ${e.message}`);
    return result;
  }
  const bounds = placement(defaults, 'at the defaults');
  if (!bounds) return result;

  const triangles = defaults.parts.reduce((s, p) => s + p.triangles, 0);
  for (const p of defaults.parts) {
    const open = openEdgeCount(p.mesh);
    if (open > 0) warn(`part "${p.key}": ${open} open mesh edges (T-junctions from booleans are usually harmless)`);
  }
  if (triangles > TRIANGLE_BUDGET) warn(`${triangles} triangles at the defaults (budget ${TRIANGLE_BUDGET})`);
  result.notes.push(`defaults: ${triangles} triangles, size ${[0, 1, 2].map(k => (bounds.max[k] - bounds.min[k]).toFixed(0)).join(' × ')} mm`);

  // Each number on its own at its min and max (an integer without a max only at its min): these must build
  for (const d of kinds.numbers) {
    for (const v of d.max === undefined ? [d.min] : [d.min, d.max]) {
      try {
        const built = build({ [d.key]: v });
        if (d.key === 'lightHeight') placement(built, `${d.label} = ${v}`);
      } catch (e) {
        err(`build() fails at ${d.label} = ${v} ${d.unit ?? ''}: ${e.message}`);
      }
    }
  }

  // Every choice and every yes/no value on its own: each must build and be placed correctly
  for (const d of kinds.choices) {
    for (const v of d.options) {
      try { placement(build({ [d.key]: v }), `${d.label} = ${v}`); } catch (e) { err(`build() fails at ${d.label} = ${v}: ${e.message}`); }
    }
  }
  for (const d of kinds.flags) {
    for (const v of [true, false]) {
      try { placement(build({ [d.key]: v }), `${d.label} = ${v ? 'yes' : 'no'}`); } catch (e) { err(`build() fails at ${d.label} = ${v}: ${e.message}`); }
    }
  }

  // Every variant, with its own defaults (the library applies them when the variant is picked)
  if (kinds.variant) {
    for (const v of kinds.variant.options) {
      try { placement(build({ variant: v }), `variant "${v}"`); } catch (e) { err(`build() fails for variant "${v}": ${e.message}`); }
    }
  }

  // Random valid values: a refusal is a warning (the model may refuse a combination it describes)
  const rnd = mulberry32(seed);
  for (let s = 0; s < samples; s++) {
    const input = {};
    for (const d of kinds.numbers) input[d.key] = paramValue(d, rnd);
    for (const d of kinds.choices) input[d.key] = d.options[Math.floor(rnd() * d.options.length)];
    for (const d of kinds.flags) input[d.key] = rnd() < 0.5;
    if (kinds.variant) input.variant = kinds.variant.options[Math.floor(rnd() * kinds.variant.options.length)];
    try {
      build(input);
    } catch (e) {
      warn(`random values fail: ${e.message} (${JSON.stringify(input)})`);
    }
  }
  return result;
}
