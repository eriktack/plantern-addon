// One number field everywhere (ui-consistency plan UX18, decision 257 point 3). Number boxes stay text boxes (so a decimal
// comma, a unit and a sum can be typed); this adds, by event delegation on a root, to every <input inputmode="numeric|decimal">
// that is not marked data-plain:
//   - ↑ / ↓: one step up or down (mm fields 10 mm, Shift 100, Alt 1; degrees 1, Shift 15; others 1, Shift 10, Alt 0.1),
//     starting from the placeholder (the default) when the box is empty
//   - dragging sideways on the field's label: the same steps, one per few pixels
//   - leaving the box (change): "2,4 m", "240 cm", "1200+35" are worked out and the box shows the result; something that is not a
//     number is outlined red with the reason as its tooltip, and the value stays as typed (the panel's Apply reports it)
// Each change fires the input's own 'input' event, so the page sees it as typed. The unit comes from data-unit, else from the
// label's text (mm, °, %, K, m). Browser only; the reading itself is src/number-parse.js (pure, tested).

import { parseMeasure, needsWorkingOut, stepsFor, stepValue } from './number-parse.js';

const SEL = 'input[inputmode="numeric"]:not([data-plain]), input[inputmode="decimal"]:not([data-plain])';

/** The unit of a number box: data-unit, else what its label says. */
export function unitOf(input) {
  if (input.dataset.unit !== undefined) return input.dataset.unit;
  const lab = input.closest('label');
  const text = lab ? [...lab.childNodes].filter(n => n !== input).map(n => n.textContent).join(' ') : '';
  if (/\bmm\b/.test(text)) return 'mm';
  if (/°|\bdeg/.test(text)) return '°';
  if (/%/.test(text)) return '%';
  if (/\bK\b/.test(text)) return 'K';
  if (/\bm\b/.test(text)) return 'm';
  return '';
}

const fire = input => input.dispatchEvent(new Event('input', { bubbles: true }));
const startOf = input => { const n = Number(String(input.placeholder || '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

function mark(input, error) {
  input.classList.toggle('bad', !!error);
  if (error) { input.dataset.badTitle = '1'; input.title = error; }
  else if (input.dataset.badTitle) { delete input.dataset.badTitle; input.removeAttribute('title'); }
}

/** Work out what was typed when the box is left: the result replaces a unit or a sum; a non-number is marked. */
function settle(input) {
  const unit = unitOf(input), r = parseMeasure(input.value, unit);
  if (r.error) { mark(input, r.error); return; }
  mark(input, null);
  if (r.value !== undefined && needsWorkingOut(input.value)) { input.value = String(r.value); fire(input); }
}

function step(input, dir, e) {
  const unit = unitOf(input), [n, big, small] = stepsFor(unit), d = (e.shiftKey ? big : e.altKey ? small : n) * dir;
  const r = parseMeasure(input.value, unit);
  if (r.error) { mark(input, r.error); return; }
  input.value = String(stepValue(input.value, unit, d, startOf(input)));
  mark(input, null);
  fire(input);
}

/** Wire every number box under `root` (now and later: delegation, so boxes built afterwards are included). */
export function enhanceNumbers(root = document) {
  if (root.__numbersEnhanced) return;
  root.__numbersEnhanced = true;
  root.addEventListener('keydown', e => {
    const input = e.target.closest?.(SEL);
    if (!input || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    step(input, e.key === 'ArrowUp' ? 1 : -1, e);
  });
  root.addEventListener('change', e => { const input = e.target.closest?.(SEL); if (input) settle(input); }, true);
  root.addEventListener('input', e => { const input = e.target.closest?.(SEL); if (input?.classList.contains('bad') && !parseMeasure(input.value, unitOf(input)).error) mark(input, null); });
  // scrubbing: drag sideways on the label (not on the box itself, where the pointer selects text)
  let scrub = null;
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest?.('input, select, textarea, button, a, .numdial')) return;
    const lab = e.target.closest?.('label'), inputs = lab ? [...lab.querySelectorAll(SEL)] : [];
    if (inputs.length !== 1 || inputs[0].disabled || inputs[0].readOnly) return;
    scrub = { input: inputs[0], x: e.clientX, done: 0, moved: false };
  });
  addEventListener('pointermove', e => {
    if (!scrub) return;
    const px = e.clientX - scrub.x, steps = Math.trunc(px / 6);
    if (!scrub.moved && Math.abs(px) < 4) return;
    if (!scrub.moved) { scrub.moved = true; document.body.classList.add('scrubbing'); }
    e.preventDefault();
    while (scrub.done < steps) { step(scrub.input, 1, e); scrub.done++; }
    while (scrub.done > steps) { step(scrub.input, -1, e); scrub.done--; }
  });
  const end = e => {
    if (!scrub) return;
    if (scrub.moved) { scrub.input.dispatchEvent(new Event('change', { bubbles: true })); e?.preventDefault?.(); }
    document.body.classList.remove('scrubbing');
    // a label click after a scrub must not move the focus or tick anything
    if (scrub.moved) { const kill = ev => { ev.preventDefault(); ev.stopPropagation(); }; addEventListener('click', kill, { capture: true, once: true }); setTimeout(() => removeEventListener('click', kill, true), 0); }
    scrub = null;
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}

// ---- sliders and dials beside a number box (ui-consistency plan UX19, decision 257 point 2) ----
// The box stays what is read and stored; the slider or dial only sets it (and fires its 'input' event, as typing would),
// and follows it when it is typed in or filled by code. An empty box (the default) shows the placeholder's value.

const valueOf = input => { const r = parseMeasure(input.value, unitOf(input)); return r.value ?? startOf(input); };

/** A slider under a number box: { min, max, step, track? } (track: a CSS background for the bar, e.g. warm to cold). */
export function addSlider(input, { min, max, step = 1, track = null }) {
  if (!input || input.dataset.slider) return null;
  input.dataset.slider = '1';
  const range = document.createElement('input');
  range.type = 'range'; range.min = min; range.max = max; range.step = step;
  range.className = 'numslider';
  range.setAttribute('aria-label', `${input.closest('label')?.firstChild?.textContent?.trim() || 'value'} (slider)`);
  if (track) range.style.setProperty('--track', track);
  const sync = () => { range.value = String(Math.min(max, Math.max(min, valueOf(input)))); };
  range.addEventListener('input', () => { input.value = String(Number(range.value)); input.classList.remove('bad'); fire(input); });
  range.addEventListener('change', () => input.dispatchEvent(new Event('change', { bubbles: true })));
  input.addEventListener('input', sync);
  watchValue(input, sync);
  input.after(range);
  sync();
  return range;
}

/**
 * A dial beside a degrees box (0 = plan east, counter-clockwise, as headings and turns are stored): drag round its needle to
 * set the angle, in 15° steps (Alt: whole degrees).
 */
export function addDial(input) {
  if (!input || input.dataset.dial) return null;
  input.dataset.dial = '1';
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40'); svg.setAttribute('class', 'numdial'); svg.setAttribute('role', 'slider');
  svg.innerHTML = '<circle r="17" class="ring"/><path d="M0 -17v4M17 0h-4M0 17v-4M-17 0h4" class="ticks"/><line x1="0" y1="0" x2="14" y2="0" class="needle"/><circle r="2.5" class="hub"/><title>Drag round to turn (15° steps; Alt: whole degrees)</title>';
  const needle = svg.querySelector('.needle');
  const sync = () => { const a = valueOf(input) * Math.PI / 180; needle.setAttribute('x2', String(14 * Math.cos(a))); needle.setAttribute('y2', String(-14 * Math.sin(a))); svg.setAttribute('aria-valuenow', String(valueOf(input))); };
  let turning = false;
  const at = e => {
    const r = svg.getBoundingClientRect(), a = Math.atan2(-(e.clientY - (r.top + r.height / 2)), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    let deg = ((Math.round(a) % 360) + 360) % 360;
    if (!e.altKey) deg = (Math.round(deg / 15) * 15) % 360;
    if (String(deg) !== input.value) { input.value = String(deg); input.classList.remove('bad'); fire(input); }
  };
  svg.addEventListener('pointerdown', e => { e.preventDefault(); turning = true; try { svg.setPointerCapture(e.pointerId); } catch { /* a pointer that is not active */ } at(e); });
  svg.addEventListener('pointermove', e => { if (turning) at(e); });
  svg.addEventListener('pointerup', () => { if (turning) { turning = false; input.dispatchEvent(new Event('change', { bubbles: true })); } });
  input.addEventListener('input', sync);
  watchValue(input, sync);
  const row = document.createElement('span');
  row.className = 'numrow';
  input.before(row);
  row.append(input, svg);
  sync();
  return svg;
}

/** Calls fn when code sets input.value (a form being filled), which fires no event. */
function watchValue(input, fn) {
  const own = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', { configurable: true, get() { return own.get.call(this); }, set(v) { own.set.call(this, v); fn(); } });
}
