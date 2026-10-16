// A native <select> drawn as the page menu (nicer dropdowns, ND1). The select stays the source of truth: enhanceSelect() hides
// it and draws a button and a list beside it; a choice sets the select's value and fires its `input` and `change` events, so
// the code that reads or listens to the select does not change. Browser only; entriesFromOptions() and currentOf() are pure
// and tested.
//
//   <option data-hint="…" data-icon="door" data-swatch="#c8a878" data-why="the reason" disabled selected>
//   <optgroup label="Group"> groups the entries; <select data-native> stays a browser select (opt-out).

import { createMenu, pictureHtml } from './menu.js';

/**
 * The menu entries of a list of options: { value, text, group?, hint?, icon?, swatch?, disabled?, why?, selected? }.
 * Groups keep their order; a disabled option carries its reason; the selected one is `current`.
 */
export function entriesFromOptions(options) {
  return options.map(o => {
    const e = { id: String(o.value), value: o.value, label: o.text ?? String(o.value) };
    if (o.group) e.group = o.group;
    if (o.hint) e.hint = o.hint;
    if (o.icon) e.icon = o.icon;
    if (o.swatch) e.swatch = o.swatch;
    if (o.disabled) e.disabled = o.why || true;
    if (o.selected) e.current = true;
    return e;
  });
}

/** What the button shows for a list of entries: the chosen one's label, icon and swatch (the first one when none is chosen). */
export function currentOf(entries) {
  const c = entries.find(e => e.current) ?? entries[0];
  return c ? { label: c.label, icon: c.icon, swatch: c.swatch } : { label: '', icon: undefined, swatch: undefined };
}

/** The options of a select as the pure functions take them (a group is its optgroup's label). */
function optionsOf(select) {
  return [...select.options].map(o => ({
    value: o.value,
    text: o.text,
    group: o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement.label : '',
    hint: o.dataset.hint,
    icon: o.dataset.icon,
    swatch: o.dataset.swatch,
    disabled: o.disabled,
    why: o.dataset.why,
    selected: o.selected,
  }));
}

/**
 * Draws a select as a menu beside it. Returns { button, refresh } or null when the select is already drawn or marked data-native.
 * Keys: a letter picks the next option that starts with it (as a browser select does); the arrows open the list.
 */
export function enhanceSelect(select) {
  if (select.dataset.enhanced || select.dataset.native !== undefined || select.multiple) return null;
  select.dataset.enhanced = '1';
  const wrap = document.createElement('div');
  wrap.className = 'ddsel';
  select.after(wrap);
  select.classList.add('dd-native');
  wrap.hidden = select.hidden;

  const choose = value => {
    if (select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const menu = createMenu(wrap, { label: '', entries: () => entriesFromOptions(optionsOf(select)), onPick: e => choose(e.value), align: 'full' });
  const refresh = () => {
    const c = currentOf(entriesFromOptions(optionsOf(select)));
    menu.setLabel(c.label);
    menu.setPicture({ icon: c.icon, swatch: c.swatch });
  };
  refresh();

  // code sets `select.value = x`: the button follows (the property is wrapped on this one select only)
  const own = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return own.get.call(this); },
    set(v) { own.set.call(this, v); refresh(); },
  });
  // code that picks by index (selectedIndex) is followed the same way
  const ownIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  Object.defineProperty(select, 'selectedIndex', {
    configurable: true,
    get() { return ownIndex.get.call(this); },
    set(v) { ownIndex.set.call(this, v); refresh(); },
  });
  // hidden and disabled are the select's: the drawn menu hides and disables with it
  new MutationObserver(() => { wrap.hidden = select.hidden; menu.button.disabled = select.disabled; refresh(); })
    .observe(select, { attributes: true, attributeFilter: ['hidden', 'disabled'] });
  // options added, replaced or changed (the code builds them as it goes) refresh the label
  new MutationObserver(refresh)
    .observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['selected', 'disabled', 'label', 'data-hint', 'data-icon', 'data-swatch', 'data-why'] });
  // a label around the select opens the menu, as it would a select
  select.closest('label')?.addEventListener('click', e => { if (!wrap.contains(e.target) && !select.disabled) menu.button.click(); });
  wrap.addEventListener('keydown', e => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const opts = [...select.options].filter(o => !o.disabled), k = e.key.toLowerCase();
    const cur = opts.findIndex(o => o.selected);
    const hit = [...opts.slice(cur + 1), ...opts.slice(0, cur + 1)].find(o => o.text.trim().toLowerCase().startsWith(k));
    if (hit) { e.preventDefault(); choose(hit.value); }
  });
  return { button: menu.button, refresh };
}


/**
 * Draws every select under root as a menu, and every one added later (the Editor and the object forms build theirs as they go).
 * Selects marked data-native, and multi-selects, stay as they are. Returns the observer.
 */
export function enhanceAll(root = document) {
  const each = node => {
    if (node instanceof HTMLSelectElement) enhanceSelect(node);
    else node.querySelectorAll?.('select').forEach(enhanceSelect);
  };
  const top = root.body ?? root;
  each(top);
  const observer = new MutationObserver(records => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && !n.closest('svg')) each(n);   // the plan's SVG holds no select
  });
  observer.observe(top, { childList: true, subtree: true });
  return observer;
}
