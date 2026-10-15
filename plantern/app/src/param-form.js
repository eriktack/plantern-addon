// The form of one blueprint (docs/archive/2026-10-14-object-templates.md, task 9): a field for every parameter of its meta, a material
// for the whole object, one per part, each checked as it changes with its own message, and a summary of what needs a fix.
// Shared by the catalog (object-designs/catalog.js) and the Objects page. Browser only; the controls are in src/controls.js.
//
//   const form = createParamForm({ container, summary, library, onValid });
//   form.show(meta, { params, partMaterials })     builds the form (the defaults, or the values of a placed object)
//   form.read() → { <key>: value, …, partMaterials }   the input for resolveParams() / buildModel()
//   form.setBuildError(text | null)                a failed build, shown at the field its text names
// `onValid()` runs a short pause after the last change, and only when every field is valid.

import { appliesTo, defaultsFor, partBuilt, resolveParams } from '../object-designs/lib/params.js';
import { inputFor, materialField } from './controls.js';
import { materialOptions } from './blueprints/options.js';

const DELAY = 120;   // ms between the last change and onValid()

/**
 * The values a form starts from: the parameters of `meta` (each blueprint's defaults; a variant's own where one is
 * given), then what `params` says where it is valid. A value that is not valid is left out, and the form shows the default.
 */
export function startValues(meta, params = {}) {
  try { return resolveParams(meta, params); } catch { /* fall through to the values that are valid one by one */ }
  const base = defaultsFor(meta, undefined);
  for (const d of meta.params) if (d.type !== 'material' && params[d.key] !== undefined) {
    try { resolveParams(meta, { ...(base.variant !== undefined ? { variant: base.variant } : {}), [d.key]: params[d.key] }); base[d.key] = params[d.key]; } catch { /* keep the default */ }
  }
  return base;
}

export function createParamForm({ container, summary, library = {}, onValid = () => {}, delay = DELAY }) {
  const fields = new Map();   // param key (or `part:<key>`) → field
  let meta = null;
  let fieldProblems = [];     // [{ field, text }] from the last check
  let buildError = null;      // { field | null, text } when the last build failed
  let timer = null;

  const fieldFor = message => { for (const f of fields.values()) if (f.label && message.includes(f.label)) return f; return null; };

  // Hides the fields of parameters that do not apply to the chosen variant (variant options). A hidden field keeps its
  // value, and is not checked: resolveParams() ignores what does not apply.
  // the yes/no values now in the form, for the parts that need one
  const valuesNow = () => Object.fromEntries(meta.params.filter(d => d.type === 'boolean').map(d => [d.key, fields.get(d.key).read()]));

  function showApplicable() {
    const chosen = meta.params.some(d => d.key === 'variant') ? fields.get('variant').read() : undefined;
    for (const d of meta.params) {
      if (d.key === 'variant' || d.type === 'material') continue;
      const f = fields.get(d.key);
      const on = appliesTo(d, chosen);
      f.wrap.hidden = !on;
    }
    // a part that does not apply to the variant, or that needs an option that is off, has no material of its own to pick
    for (const part of meta.parts) {
      const f = fields.get(`part:${part.key}`);
      if (f) f.wrap.hidden = !partBuilt(part, valuesNow(), chosen);
    }
  }

  function checkFields() {
    const problems = [];
    for (const f of fields.values()) {
      if (f.wrap?.hidden) { f.showError(null); continue; }
      const text = f.check();
      f.showError(text);
      if (text) problems.push({ field: f, text: `${f.label}: ${text}` });
    }
    return problems;
  }

  // Every field that needs a fix, and a failed build that no field explains; a click goes to the field.
  function summarize() {
    const items = fieldProblems.map(p => ({ field: p.field, text: p.text }));
    if (buildError && !(buildError.field && items.some(i => i.field === buildError.field))) {
      items.push({ field: buildError.field, text: buildError.field ? `${buildError.field.label}: ${buildError.text}` : buildError.text });
    }
    summary.hidden = items.length === 0;
    if (items.length === 0) return;
    const head = document.createElement('div');
    head.textContent = fieldProblems.length
      ? (fieldProblems.length === 1 ? 'One value needs a fix:' : `${fieldProblems.length} values need a fix:`)
      : 'The preview could not be built:';
    const list = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      if (item.field) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = item.text;
        b.addEventListener('click', () => item.field.focus());
        li.append(b);
      } else {
        li.textContent = item.text;
      }
      list.append(li);
    }
    summary.replaceChildren(head, list);
  }

  // Called after every change: checks the fields, then reports when they are all valid.
  function update() {
    showApplicable();
    fieldProblems = checkFields();
    // a part without its own choice shows the whole object's material: its bar follows the whole object
    for (const [k, f] of fields) if (k.startsWith('part:')) f.paint?.();
    clearTimeout(timer);
    if (fieldProblems.length) {
      buildError = null;
      summarize();
    } else {
      timer = setTimeout(onValid, delay);
    }
  }

  // Picking a variant sets the other fields to that variant's defaults (defaultsFor, the same rule as the library).
  function applyVariant() {
    const values = defaultsFor(meta, fields.get('variant').read());
    for (const d of meta.params) {
      if (d.key === 'variant' || d.type === 'material') continue;   // materials are kept as the person set them
      fields.get(d.key).set(values[d.key]);
    }
    update();
  }

  const form = {
    fields,

    /**
     * Builds the form for `blueprintMeta`. `params` and `partMaterials` are the values of a placed object; without them
     * every field starts at its default and the materials at "default" and "same as the whole object".
     * `blueprintMeta.materials` (a house blueprint's own colours) are offered next to the library.
     */
    show(blueprintMeta, { params, partMaterials } = {}) {
      meta = blueprintMeta;
      container.replaceChildren();
      fields.clear();
      const names = { ...library, ...(meta.materials || {}) };
      const values = startValues(meta, params);
      for (const d of meta.params.filter(d => d.type !== 'material')) {
        const f = inputFor(d, values[d.key], d.key === 'variant' ? applyVariant : update);
        fields.set(d.key, f);
        container.append(f.wrap);
      }
      for (const d of meta.params.filter(d => d.type === 'material')) {
        // empty means the default (the first choice), so the list can still offer every name
        const f = materialField(d, {
          library: names, options: materialOptions(meta), whole: true, fallback: d.default, onChange: update,
          hint: d.options ? 'The blueprint offers these choices.' : 'A name from the library, or a custom colour. Default: the first choice.',
        });
        f.set(params?.[d.key] ?? '');
        fields.set(d.key, f);
        container.append(f.wrap);
      }
      const wholeKey = meta.params.find(d => d.type === 'material')?.key;
      const parts = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = 'Per part (a part with no choice follows its own default, else the whole object)';
      parts.append(legend);
      for (const p of meta.parts) {
        const f = materialField({ key: `part:${p.key}`, label: p.label }, { library: names, options: materialOptions(meta, p.key), whole: false, hint: null, onChange: update, partDefault: p.defaultMaterial ?? null, inherit: () => p.defaultMaterial ?? fields.get(wholeKey)?.effective() ?? '' });
        f.set(partMaterials?.[p.key] ?? '');
        fields.set(`part:${p.key}`, f);
        parts.append(f.wrap);
      }
      container.append(parts);
      buildError = null;
      update();
    },

    /** The form as input for resolveParams() / buildModel(): the values, the whole-object material, the per-part materials. */
    read() {
      const input = { partMaterials: {} };
      for (const d of meta.params) {
        const v = fields.get(d.key).read();
        input[d.key] = d.type === 'material' ? (v || d.default) : v;
      }
      for (const part of meta.parts) {
        const v = fields.get(`part:${part.key}`).read();
        if (v) input.partMaterials[part.key] = v;
      }
      return input;
    },

    /**
     * The values as a placed object stores them: every parameter with the value it was made with (so a later change of the
     * blueprint's defaults does not change the object), the materials only where one was chosen.
     */
    readForObject() {
      const input = form.read();
      const params = {};
      for (const d of meta.params) {
        if (d.type === 'material') { if (fields.get(d.key).read()) params[d.key] = input[d.key]; }
        else params[d.key] = input[d.key];
      }
      return { params, partMaterials: input.partMaterials };
    },

    /** True when every field is valid right now. */
    get valid() { return checkFields().length === 0; },

    /** Shows a failed build at the field its text names (or in the summary); null clears it. */
    setBuildError(text) {
      buildError = text ? { field: fieldFor(text), text } : null;
      if (buildError) buildError.field?.showError(text);
      summarize();
    },

    /** Checks the fields again and shows their messages. */
    update,
    summarize,
  };
  return form;
}
