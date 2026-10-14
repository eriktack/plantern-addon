// A dropdown menu: a button that opens a list of entries in groups, each with an icon, a label and a short hint, and a reason
// instead of the hint when it cannot be used now. Used by the page menu (src/nav.js) and the Editor's Add menus. Browser only;
// groupEntries() is pure and tested.
//
//   createMenu(host, { label, icon, entries, onPick, align })
//     entries: an array, or a function returning one (asked each time the menu opens, so it follows what is selected):
//       { id, label, hint?, icon?, group?, href?, disabled?: 'the reason' | true, current?: true }
//     an entry with `href` is a link; any other calls onPick(entry) and closes the menu
//     align: 'full' (as wide as the button, the page menu) or 'right' (opens to the left of the button's right edge)
//   returns { button, setLabel(text), close() }

import { ICONS } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Entries grouped by their `group`, in order of first appearance; entries without a group form a first, unnamed group. */
export function groupEntries(entries) {
  const groups = [];
  for (const e of entries) {
    const name = e.group ?? '';
    let g = groups.find(x => x.group === name);
    if (!g) groups.push(g = { group: name, items: [] });
    g.items.push(e);
  }
  return groups.sort((a, b) => (a.group === '' ? -1 : b.group === '' ? 1 : 0));   // the unnamed group first, the others stay in order
}

/** Whether an entry can be picked: not disabled. */
export const usable = e => !e.disabled;

function itemHtml(e, index) {
  const off = !usable(e);
  const body = `${e.icon ? (ICONS[e.icon] ?? e.icon) : ''}<span class="nt"><b>${esc(e.label)}</b>${off && typeof e.disabled === 'string' ? `<small class="why">${esc(e.disabled)}</small>` : e.hint ? `<small>${esc(e.hint)}</small>` : ''}</span>${e.current ? ICONS.check : ''}`;
  const attrs = `role="menuitem" data-i="${index}"${e.current ? ' class="on" aria-current="page"' : off ? ' class="off" aria-disabled="true"' : ''}`;
  return e.href && !off ? `<a ${attrs} href="${esc(e.href)}">${body}</a>` : `<button type="button" ${attrs}>${body}</button>`;
}

export function createMenu(host, { label, icon, entries, onPick = () => {}, align = 'full' }) {
  host.classList.add('menu', align === 'right' ? 'menu-right' : 'menu-full');
  host.innerHTML = `<button type="button" class="menubtn" aria-haspopup="menu" aria-expanded="false">${icon ? (ICONS[icon] ?? icon) : ''}<span>${esc(label)}</span>${ICONS.chevron}</button><div class="menulist" role="menu" hidden></div>`;
  const button = host.querySelector('.menubtn'), list = host.querySelector('.menulist');
  let shown = [];

  const items = () => [...list.querySelectorAll('[role=menuitem]:not(.off)')];
  function set(open) {
    if (open) {
      shown = typeof entries === 'function' ? entries() : entries;
      list.innerHTML = groupEntries(shown).map(g => (g.group ? `<div class="menugroup" role="presentation">${esc(g.group)}</div>` : '') + g.items.map(e => itemHtml(e, shown.indexOf(e))).join('')).join('') || '<div class="menugroup">Nothing to add here</div>';
    }
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) (list.querySelector('.on') ?? items()[0])?.focus();
  }
  button.addEventListener('click', () => set(list.hidden));
  document.addEventListener('pointerdown', e => { if (!list.hidden && !host.contains(e.target)) set(false); });
  list.addEventListener('click', e => {
    const el = e.target.closest('[role=menuitem]');
    if (!el || el.classList.contains('off')) return;
    const entry = shown[Number(el.dataset.i)];
    if (!entry || entry.href) return;                           // a link goes where it points
    set(false);
    onPick(entry);
  });
  host.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !list.hidden) { set(false); button.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (list.hidden) { set(true); return; }
    const all = items(), i = all.indexOf(document.activeElement);
    all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  });
  return {
    button,
    setLabel(text) { button.querySelector('span').textContent = text; },
    close() { set(false); },
  };
}
