// A dropdown menu: a button that opens a list of entries in groups, each with an icon, a label and a short hint, and a reason
// instead of the hint when it cannot be used now. Used by the page menu (src/nav.js) and the Editor's Add menus. Browser only;
// groupEntries() is pure and tested.
//
//   createMenu(host, { label, icon, entries, onPick, align })
//     entries: an array, or a function returning one (asked each time the menu opens, so it follows what is selected):
//       { id, label, hint?, icon?, swatch?, group?, href?, disabled?: 'the reason' | true, current?: true }
//     swatch: a CSS colour drawn in place of the icon (materials; ND1)
//     an entry with `href` is a link; any other calls onPick(entry) and closes the menu
//     align: 'full' (as wide as the button, the page menu) or 'right' (opens to the left of the button's right edge)
//   returns { button, setLabel(text), setPicture({ icon?, swatch? }), close() }
//
//   openMenuAt(x, y, { entries, onPick, title? }): the same list as a floating menu at a point (the Editor's right-click
//   menu, ui-consistency plan UX9); closes on a pick, a click elsewhere, Esc, scrolling or resizing. Returns { close() }.

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

/** What an entry, or a button, shows before its label: its swatch (a colour) when it has one, else its icon. */
export function pictureHtml(e) {
  if (e.swatch) return `<i class="swatch" style="background:${esc(e.swatch)}"></i>`;
  return e.icon ? (ICONS[e.icon] ?? e.icon) : '';
}

function itemHtml(e, index) {
  const off = !usable(e);
  const body = `${pictureHtml(e)}<span class="nt"><b>${esc(e.label)}</b>${off && typeof e.disabled === 'string' ? `<small class="why">${esc(e.disabled)}</small>` : e.hint ? `<small>${esc(e.hint)}</small>` : ''}</span>${e.current ? ICONS.check : ''}`;
  const attrs = `role="menuitem" data-i="${index}"${e.current ? ' class="on" aria-current="page"' : off ? ' class="off" aria-disabled="true"' : ''}`;
  return e.href && !off ? `<a ${attrs} href="${esc(e.href)}">${body}</a>` : `<button type="button" ${attrs}>${body}</button>`;
}

export function createMenu(host, { label, icon, entries, onPick = () => {}, align = 'full' }) {
  host.classList.add('menu', align === 'right' ? 'menu-right' : 'menu-full');
  host.innerHTML = `<button type="button" class="menubtn" aria-haspopup="menu" aria-expanded="false"><span class="pic">${pictureHtml({ icon })}</span><span class="lbl">${esc(label)}</span>${ICONS.chevron}</button><div class="menulist" role="menu" hidden></div>`;
  const button = host.querySelector('.menubtn'), list = host.querySelector('.menulist');
  let shown = [];

  const items = () => [...list.querySelectorAll('[role=menuitem]:not(.off)')];
  // The list is placed on the page, not in the panel: a panel scrolls and clips what is inside it. It opens below the button
  // when there is room, else above it, and stays within the window's width.
  function place() {
    const b = button.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 8, gap = 4;
    const w = align === 'right' ? Math.min(330, vw * 0.86) : b.width;
    const left = Math.max(m, Math.min(align === 'right' ? b.right - w : b.left, vw - w - m));
    Object.assign(list.style, { position: 'fixed', left: `${left}px`, right: 'auto', width: `${w}px` });
    const below = vh - b.bottom - gap - m, above = b.top - gap - m;
    if (below >= Math.min(260, above)) Object.assign(list.style, { top: `${b.bottom + gap}px`, bottom: 'auto', maxHeight: `${Math.max(120, below)}px` });
    else Object.assign(list.style, { top: 'auto', bottom: `${vh - b.top + gap}px`, maxHeight: `${Math.max(120, above)}px` });
  }
  function set(open) {
    if (open) {
      shown = typeof entries === 'function' ? entries() : entries;
      list.innerHTML = groupEntries(shown).map(g => (g.group ? `<div class="menugroup" role="presentation">${esc(g.group)}</div>` : '') + g.items.map(e => itemHtml(e, shown.indexOf(e))).join('')).join('') || '<div class="menugroup">Nothing to add here</div>';
      place();
    }
    list.hidden = !open;
    if (!open) list.style.cssText = '';
    button.setAttribute('aria-expanded', String(open));
    if (open) (list.querySelector('.on') ?? items()[0])?.focus();
  }
  button.addEventListener('click', () => set(list.hidden));
  document.addEventListener('pointerdown', e => { if (!list.hidden && !host.contains(e.target)) set(false); });
  // placed on the page, so it would drift away from its button if anything scrolls or the window changes: close it instead
  const closeIfMoved = e => { if (!list.hidden && !(e?.target instanceof Node && list.contains(e.target))) set(false); };   // the list's own scrolling is fine
  window.addEventListener('scroll', closeIfMoved, true);
  window.addEventListener('resize', closeIfMoved);
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
    setLabel(text) { button.querySelector('.lbl').textContent = text; },
    setPicture(entry) { button.querySelector('.pic').innerHTML = pictureHtml(entry); },
    close() { set(false); },
  };
}

/**
 * Where a floating menu w × h opened at the pointer (x, y) goes in a window vw × vh: right of and below the pointer when it
 * fits, else flipped to the left or above, and never closer than m to an edge. Pure (tested).
 */
export function menuPosition(x, y, w, h, vw, vh, m = 8) {
  const left = x + w + m <= vw ? x : Math.max(m, x - w);
  const top = y + h + m <= vh ? y : Math.max(m, Math.min(y - h, vh - h - m));
  return { left: Math.min(left, Math.max(m, vw - w - m)), top, maxHeight: vh - top - m };
}

let floating = null;
export function openMenuAt(x, y, { entries, onPick = () => {}, title = '' }) {
  floating?.close();
  const list = document.createElement('div');
  list.className = 'menulist ctxmenu';
  list.setAttribute('role', 'menu');
  const shown = typeof entries === 'function' ? entries() : entries;
  list.innerHTML = (title ? `<div class="menugroup ctxtitle" role="presentation">${esc(title)}</div>` : '')
    + groupEntries(shown).map(g => (g.group ? `<div class="menugroup" role="presentation">${esc(g.group)}</div>` : '') + g.items.map(e => itemHtml(e, shown.indexOf(e))).join('')).join('');
  document.body.append(list);
  const w = Math.min(330, document.documentElement.clientWidth * 0.86);
  Object.assign(list.style, { position: 'fixed', width: `${w}px`, visibility: 'hidden' });
  const p = menuPosition(x, y, w, list.offsetHeight, document.documentElement.clientWidth, window.innerHeight);
  Object.assign(list.style, { left: `${p.left}px`, top: `${p.top}px`, maxHeight: `${p.maxHeight}px`, visibility: '' });
  const items = () => [...list.querySelectorAll('[role=menuitem]:not(.off)')];
  const close = () => {
    if (floating !== api) return;
    floating = null; list.remove();
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close);
    document.removeEventListener('keydown', keys, true);
  };
  const outside = e => { if (!list.contains(e.target)) close(); };
  const keys = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = items(), i = all.indexOf(document.activeElement);
    all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  };
  list.addEventListener('click', e => {
    const el = e.target.closest('[role=menuitem]');
    if (!el || el.classList.contains('off')) return;
    const entry = shown[Number(el.dataset.i)];
    close();
    if (entry && !entry.href) onPick(entry);
  });
  list.addEventListener('contextmenu', e => e.preventDefault());
  setTimeout(() => {                                                // not the pointerdown that opened it
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
  }, 0);
  document.addEventListener('keydown', keys, true);
  items()[0]?.focus();
  const api = { close };
  floating = api;
  return api;
}
