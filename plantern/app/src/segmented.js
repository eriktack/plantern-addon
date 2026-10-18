// Choices of up to four drawn as a row of buttons (ui-consistency plan UX20, rule R3), the way the Objects page draws them
// (src/controls.js choiceField). A <select data-seg> stays the source of its value, as with the page-menu dropdowns
// (src/select.js): the buttons write select.value and fire its change and input events, and follow it when code sets it, when
// its options change (names of rooms in them, a disabled one) and when it is hidden. Browser only; segLabel() is pure.

import { ICONS } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The short label of an option for its button: data-short, else its text up to a bracket, a colon or a semicolon. */
export function segLabel(text, short) {
  if (short) return short;
  const t = String(text ?? '').trim();
  const cut = t.search(/\s[(]|[:;]/);
  return (cut > 0 ? t.slice(0, cut) : t).trim();
}

function enhance(select) {
  if (select.dataset.segDone) return;
  select.dataset.segDone = '1';
  const row = document.createElement('div');
  row.className = 'seg';
  row.setAttribute('role', 'radiogroup');
  select.after(row);
  select.classList.add('dd-native');
  const draw = () => {
    row.hidden = select.hidden;
    row.innerHTML = [...select.options].map(o => `<button type="button" role="radio" data-v="${esc(o.value)}" aria-checked="${o.value === select.value}"${o.disabled ? ' disabled' : ''} title="${esc(o.title || o.textContent.trim())}">${o.dataset.icon && ICONS[o.dataset.icon] ? ICONS[o.dataset.icon] : ''}<span>${esc(segLabel(o.textContent, o.dataset.short))}</span></button>`).join('');
  };
  row.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.disabled || b.dataset.v === select.value) return;
    select.value = b.dataset.v;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  row.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = [...row.querySelectorAll('button:not([disabled])')], i = all.indexOf(document.activeElement);
    const next = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
    if (next) { e.preventDefault(); next.focus(); next.click(); }
  });
  // code that sets select.value fires no event: follow it
  const own = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', { configurable: true, get() { return own.get.call(this); }, set(v) { own.set.call(this, v); draw(); } });
  select.addEventListener('change', draw);
  new MutationObserver(draw).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
  draw();
}

/** Draw every select[data-seg] under root as a row of buttons. */
export function enhanceSegmented(root = document) {
  root.querySelectorAll('select[data-seg]').forEach(enhance);
}
