import { parseMeasure } from './number-parse.js';
import { labelOf } from '../object-designs/lib/params.js';
import { materialKind, materialSwatch, MATERIAL_KINDS } from './model/material-kind.js';
import { optionIcon } from './option-icons.js';
import { ICONS } from './icons.js';

// The form controls for a blueprint's parameters (docs/archive/2026-10-14-object-templates.md, task 9; first built for the catalog,
// docs/archive/2026-10-14-object-catalog-ux.md). Browser only. Each control is a field: a frame (the name and unit above, the control,
// its own message under it, a hint) around one input, with the same small interface:
//   { wrap, label, key, read(), set(value), check() → message | null, showError(text), focus() }
// A control calls `onChange()` after every change; it never reads the page. The look is in src/styles.css under .pform.
// numberProblem() and sliderStep() are pure and tested.

// Slider positions: at most about this many across the range.
export const SLIDER_POSITIONS = 100;

const HEX = /^#[0-9a-f]{6}$/i;

/** The message for one number: empty, not a number, or outside the parameter's range; null when it is fine. */
export function numberProblem(d, v) {
  const unit = d.unit ? ` ${d.unit}` : '';
  if (!Number.isFinite(v)) return 'Enter a number';
  if (d.type === 'integer' && !Number.isInteger(v)) return 'Enter a whole number';
  if (v < d.min) return `At least ${d.min}${unit}`;
  if (d.max !== undefined && v > d.max) return `At most ${d.max}${unit}`;
  return null;
}

/**
 * The slider's step: 1, 2, 5 or 10 times a power of ten, the smallest that gives at most SLIDER_POSITIONS positions
 * across the range and is a multiple of the field's own step. The number box keeps the exact step.
 */
export function sliderStep(d) {
  const base = d.step ?? 1;
  if (d.max === undefined) return base;
  const wanted = (d.max - d.min) / SLIDER_POSITIONS;
  for (let unit = 1; unit < 1e9; unit *= 10) {
    for (const f of [1, 2, 5, 10]) {
      const s = f * unit;
      if (s >= wanted && Math.abs(s / base - Math.round(s / base)) < 1e-9) return s;
    }
  }
  return base;
}

/** The frame around one control: its name and unit above, the control, the message under it, a hint. */
export function makeField(spec, control, { hint, header = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  if (header) {
    const head = document.createElement('div');
    head.className = 'flabel';
    const name = document.createElement('span');
    name.textContent = spec.label;
    if (spec.unit) {
      const u = document.createElement('span');
      u.className = 'unit';
      u.textContent = spec.unit;
      name.append(u);
    }
    head.append(name);
    wrap.append(head);
  }
  wrap.append(control);
  const errEl = document.createElement('div');
  errEl.className = 'ferr';
  errEl.setAttribute('role', 'alert');
  wrap.append(errEl);
  if (hint) {
    const h = document.createElement('div');
    h.className = 'help';
    h.textContent = hint;
    wrap.append(h);
  }
  return {
    wrap,
    label: spec.label,
    showError(text) {
      errEl.textContent = text || '';
      wrap.classList.toggle('bad', Boolean(text));
      const input = control.querySelector('input,select,button');
      if (input) input.setAttribute('aria-invalid', String(Boolean(text)));
    },
    focus() {
      (control.querySelector('input,select,button') ?? control).focus();
    },
  };
}

/**
 * A number: the same number box as the Editor's (a text box: a decimal comma, a unit and a sum can be typed, ↑/↓ and dragging
 * the label step it; src/number-input.js, decision 257), and a slider over the parameter's range (when it has a max).
 */
export function numberField(d, value, onChange) {
  const control = document.createElement('div');
  control.className = 'pair';
  const number = document.createElement('input');
  number.type = 'text';
  number.inputMode = 'decimal';
  number.autocomplete = 'off';
  number.dataset.unit = d.unit === 'mm' ? 'mm' : (d.unit ?? '');
  number.name = d.key;
  number.value = value;
  number.setAttribute('aria-label', d.label);
  control.append(number);

  let range = null;
  if (d.max !== undefined) {
    range = document.createElement('input');
    range.type = 'range';
    range.min = d.min;
    range.max = d.max;
    range.step = sliderStep(d);
    range.value = value;
    range.setAttribute('aria-label', `${d.label} (slider)`);
    control.append(range);
  }

  const field = makeField(d, control, { hint: d.hint });
  const read = () => { const r = parseMeasure(number.value, number.dataset.unit); return r.value ?? NaN; };
  number.addEventListener('input', () => {
    if (range && Number.isFinite(read())) range.value = String(read());
    onChange();
  });
  range?.addEventListener('input', () => {
    number.value = range.value;
    onChange();
  });
  return {
    ...field,
    key: d.key,
    read,
    set(v) {
      number.value = String(v);
      if (range) range.value = String(v);
    },
    check: () => numberProblem(d, read()),
  };
}

/** A yes or no: a check box. */
export function booleanField(d, value, onChange) {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.name = d.key;
  box.checked = !!value;
  const label = document.createElement('label');
  label.className = 'check';
  label.append(box, d.label);
  box.addEventListener('change', onChange);
  const field = makeField(d, label, { hint: d.hint, header: false });
  return { ...field, key: d.key, read: () => box.checked, set(v) { box.checked = !!v; }, check: () => null };
}

/** A choice with up to four options: one button each. More options: a select. Shown by display name (labels). */
export function choiceField(d, value, onChange) {
  if (d.options.length > 4) return selectField(d, value, onChange);
  let chosen = String(value);
  const group = document.createElement('div');
  group.className = 'seg';
  group.setAttribute('role', 'radiogroup');
  const buttons = d.options.map(o => {
    const b = document.createElement('button');
    b.type = 'button';
    // the option's drawing above its label (ND5), when it has one
    const icon = optionIcon(d.key, o, d.icons);
    if (icon) {
      const pic = document.createElement('span');
      pic.className = 'oi';
      pic.innerHTML = ICONS[icon];
      b.append(pic);
      b.classList.add('hasIcon');
    }
    b.append(labelOf(d, o));
    b.addEventListener('click', () => {
      chosen = String(o);
      paint();
      onChange();
    });
    group.append(b);
    return b;
  });
  const paint = () => buttons.forEach((b, i) => {
    const on = String(d.options[i]) === chosen;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  paint();
  const field = makeField(d, group, { hint: d.hint });
  return {
    ...field,
    key: d.key,
    read: () => (d.type === 'enum_number' ? Number(chosen) : chosen),
    set(v) { chosen = String(v); paint(); },
    check: () => null,
  };
}

/** A choice with many options: a select. */
export function selectField(d, value, onChange) {
  const select = document.createElement('select');
  select.name = d.key;
  for (const o of d.options) {
    const option = document.createElement('option');
    option.value = String(o);
    option.textContent = labelOf(d, o);
    const icon = optionIcon(d.key, o, d.icons);
    if (icon) option.dataset.icon = icon;   // the menu shows it before the label (ND5)
    select.append(option);
  }
  select.value = String(value);
  select.addEventListener('change', onChange);
  const field = makeField(d, select, { hint: d.hint });
  return {
    ...field,
    key: d.key,
    read: () => (d.type === 'enum_number' ? Number(select.value) : select.value),
    set(v) { select.value = String(v); },
    check: () => null,
  };
}

/** Text colour that reads on a background colour (#rrggbb): dark on light, light on dark. */
function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#14161a' : '#f5f5f5';
}

/**
 * A material: a select of the names (every library name, or only the `options` of the blueprint, and "Custom colour…" when
 * they allow `custom`), a colour box for #rrggbb, and a bar under them in the colour that applies, with its name. The bar shows
 * the default for the whole object (`fallback`), the whole object's material for a part that has no choice of its own
 * (`inherit()`, a function returning the value the whole object has), or the choice made here.
 * `effective()` is the value that applies here; `paint()` redraws the bar (the form calls it when the whole object changes).
 */
export function materialField(spec, { library = {}, options = null, hint, whole, fallback, inherit = null, partDefault = null, onChange }) {
  const names = options ? options.filter(o => o !== 'custom') : Object.keys(library).sort();
  const allowCustom = options ? options.includes('custom') : true;
  const select = document.createElement('select');
  const first = document.createElement('option');
  first.value = '';
  first.textContent = whole ? `Default: ${fallback}` : partDefault ? `Default: ${partDefault}` : 'Same as the whole object';
  select.append(first);
  // the names grouped by kind (wood, paint, metal, …), each with its swatch (ND3); a name the library does not know is grey, in Other
  const groups = new Map();
  for (const name of names) {
    const entry = library[name] ?? {}, { label } = materialKind(name, entry);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push({ name, entry });
  }
  for (const { label } of MATERIAL_KINDS) {
    if (!groups.has(label)) continue;
    const group = document.createElement('optgroup');
    group.label = label;
    for (const { name, entry } of groups.get(label)) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      option.dataset.swatch = materialSwatch(entry);
      group.append(option);
    }
    select.append(group);
  }
  if (allowCustom) {
    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = 'Custom colour…';
    custom.dataset.swatch = '#b08040';   // follows the colour picked (below)
    select.append(custom);
  }

  const colour = document.createElement('input');
  colour.type = 'color';
  colour.value = '#b08040';
  // hidden with an inline display, not only the attribute: a page style can give an input a display, and then the box shows
  const showColour = on => { colour.hidden = !on; colour.style.display = on ? '' : 'none'; };
  showColour(false);
  colour.setAttribute('aria-label', `${spec.label}: custom colour`);

  const row = document.createElement('div');
  row.className = 'mat';
  row.append(select, colour);

  const bar = document.createElement('div');
  bar.className = 'matbar';
  bar.setAttribute('aria-live', 'polite');

  const control = document.createElement('div');
  control.append(row, bar);

  const read = () => (select.value === 'custom' ? colour.value : select.value);
  // the value that applies: this field's choice, else the whole object's (a part), else the default
  const effective = () => read() || (inherit ? inherit() : (whole ? fallback : '')) || '';
  const paint = () => {
    const choice = read(), v = effective(), entry = library[v];
    const hex = entry?.color ?? (HEX.test(v) ? v : null);
    bar.style.background = hex ?? '#2a2f38';
    bar.style.color = hex ? inkOn(hex) : '#d9dde4';
    const label = !v ? 'none' : choice ? v : partDefault ? `Default: ${v}` : inherit ? `Same as the whole object: ${v}` : `Default: ${v}`;
    bar.textContent = entry?.texture ? `${label} · texture` : label;
    bar.hidden = select.value !== 'custom';   // the button shows the material; the bar is for a custom colour (review 2)
  };
  select.addEventListener('change', () => {
    showColour(select.value === 'custom');
    paint();
    onChange();
  });
  colour.addEventListener('input', () => {
    const custom = select.querySelector('option[value="custom"]');
    if (custom) custom.dataset.swatch = colour.value;   // the menu's swatch for Custom colour… follows the picker
    paint();
    onChange();
  });

  const field = makeField(spec, control, { hint });
  return {
    ...field,
    key: spec.key,
    read,
    effective,
    set(v) {
      if (v && [...select.options].some(o => o.value === v && v !== 'custom')) {
        select.value = v;
        showColour(false);
      } else if (HEX.test(v ?? '') && allowCustom) {
        select.value = 'custom';
        colour.value = v.toLowerCase();
        showColour(true);
      } else {
        select.value = '';
        showColour(false);
      }
      paint();
    },
    check: () => null,
    paint,
  };
}

/** The input for one non-material parameter, by its type. */
export function inputFor(d, value, onChange) {
  if (d.type === 'enum' || d.type === 'enum_number') return choiceField(d, value, onChange);
  if (d.type === 'boolean') return booleanField(d, value, onChange);
  return numberField(d, value, onChange);
}
