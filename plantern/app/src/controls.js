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

/** A number: a number box with the exact step, and a slider over the parameter's range (when it has a max). */
export function numberField(d, value, onChange) {
  const control = document.createElement('div');
  control.className = 'pair';
  const number = document.createElement('input');
  number.type = 'number';
  number.name = d.key;
  number.min = d.min;
  if (d.max !== undefined) number.max = d.max;
  number.step = d.step ?? 1;
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
  number.addEventListener('input', () => {
    if (range && Number.isFinite(number.valueAsNumber)) range.value = number.value;
    onChange();
  });
  range?.addEventListener('input', () => {
    number.value = range.value;
    onChange();
  });
  return {
    ...field,
    key: d.key,
    read: () => number.valueAsNumber,
    set(v) {
      number.value = String(v);
      if (range) range.value = String(v);
    },
    check: () => numberProblem(d, number.valueAsNumber),
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

/** A choice with up to four options: one button each. More options: a select. */
export function choiceField(d, value, onChange) {
  if (d.options.length > 4) return selectField(d, value, onChange);
  let chosen = String(value);
  const group = document.createElement('div');
  group.className = 'seg';
  group.setAttribute('role', 'radiogroup');
  const buttons = d.options.map(o => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(o);
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
    option.textContent = String(o);
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
export function materialField(spec, { library = {}, options = null, hint, whole, fallback, inherit = null, onChange }) {
  const names = options ? options.filter(o => o !== 'custom') : Object.keys(library).sort();
  const allowCustom = options ? options.includes('custom') : true;
  const select = document.createElement('select');
  const first = document.createElement('option');
  first.value = '';
  first.textContent = whole ? `Default: ${fallback}` : 'Same as the whole object';
  select.append(first);
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  if (allowCustom) {
    const custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = 'Custom colour…';
    select.append(custom);
  }

  const colour = document.createElement('input');
  colour.type = 'color';
  colour.value = '#b08040';
  colour.hidden = true;
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
    const label = !v ? 'none' : choice ? v : inherit ? `Same as the whole object: ${v}` : `Default: ${v}`;
    bar.textContent = entry?.texture ? `${label} · texture` : label;
  };
  select.addEventListener('change', () => {
    colour.hidden = select.value !== 'custom';
    paint();
    onChange();
  });
  colour.addEventListener('input', () => {
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
        colour.hidden = true;
      } else if (HEX.test(v ?? '') && allowCustom) {
        select.value = 'custom';
        colour.value = v.toLowerCase();
        colour.hidden = false;
      } else {
        select.value = '';
        colour.hidden = true;
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
