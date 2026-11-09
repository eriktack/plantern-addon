// The floor switch on the plan (the viewer's map and the Lovelace card): one button per floor where the row fits, else a
// dropdown with the floor's name. It is only on show while the view shows one floor (2D, or 3D with one level in its stack).
// Self-contained (its own styles, put into the page or the shadow root it lives in, no other modules), because the card
// mirrors its imports. The colours come from --fs-* variables, so the card can take Home Assistant's theme.
// showFloorSwitch() and switchMode() are pure; createFloorSwitch() needs a browser.

/** Whether the switch is on show: there is more than one floor to choose from and the view shows exactly one. */
export function showFloorSwitch(choices, shown) {
  return choices > 1 && shown === 1;
}

/** 'buttons' when the row of buttons fits the room it has (with a little to spare), else 'menu'. */
export function switchMode(rowWidth, room) {
  return rowWidth > 0 && rowWidth <= room - 4 ? 'buttons' : 'menu';
}

const CSS = `
.fsw{position:absolute;top:10px;right:10px;z-index:3;font:500 13px/1.2 system-ui,sans-serif;color:var(--fs-fg,#d9dde4);-webkit-user-select:none;user-select:none}
.fsw[hidden]{display:none}
.fsw .fsrow,.fsw .fsbtn,.fsw .fslist{background:var(--fs-bg,rgba(29,32,38,.92));border:1px solid var(--fs-line,#3a404b);box-shadow:0 2px 10px rgba(0,0,0,.3);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.fsw .fsrow{display:flex;gap:2px;padding:3px;border-radius:999px;white-space:nowrap}
.fsw .fsrow button{font:inherit;color:inherit;background:transparent;border:0;border-radius:999px;padding:6px 14px;cursor:pointer;transition:background .15s,color .15s}
.fsw .fsrow button:hover{background:var(--fs-hover,rgba(255,255,255,.08))}
.fsw .fsrow button.on{background:var(--fs-acc,#ffb454);color:var(--fs-on,#14161a)}
.fsw .fsbtn{display:flex;align-items:center;gap:8px;font:inherit;color:inherit;border-radius:999px;padding:7px 12px 7px 14px;cursor:pointer;max-width:min(60vw,240px)}
.fsw .fsbtn .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsw .fsbtn .ic{flex:none;width:16px;height:16px;opacity:.8}
.fsw .fsbtn .chev{flex:none;width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.7;transition:transform .15s}
.fsw.open .fsbtn .chev{transform:rotate(-135deg) translateY(-1px)}
.fsw .fslist{position:absolute;right:0;top:calc(100% + 6px);min-width:100%;max-width:min(80vw,280px);max-height:min(60vh,360px);overflow-y:auto;margin:0;padding:4px;list-style:none;border-radius:12px;box-sizing:border-box}
.fsw .fslist li{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}
.fsw .fslist li .tick{flex:none;width:14px;text-align:center;color:var(--fs-acc,#ffb454)}
.fsw .fslist li .nm{overflow:hidden;text-overflow:ellipsis}
.fsw .fslist li .el{margin-left:auto;padding-left:12px;opacity:.55;font-size:12px;font-weight:400}
.fsw .fslist li:hover,.fsw .fslist li.act{background:var(--fs-hover,rgba(255,255,255,.08))}
.fsw .fslist li.on{color:var(--fs-acc,#ffb454)}
.fsw .measure{position:absolute;visibility:hidden;pointer-events:none;left:0;top:0}
@media (pointer:coarse){.fsw .fsrow button{min-height:40px;padding:8px 16px}.fsw .fsbtn{min-height:44px}.fsw .fslist li{min-height:44px;box-sizing:border-box}}
`;
// a little stack of floors, for the dropdown's button
const ICON = '<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M8 2 14 5 8 8 2 5Z"/><path d="M2 8l6 3 6-3"/><path d="M2 11l6 3 6-3"/></svg>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const signed = mm => (Number.isFinite(mm) ? `${mm > 0 ? '+' : mm < 0 ? '−' : '±'}${Math.abs(mm)}` : '');

function addStyle(node) {
  const root = node.getRootNode(), into = root.head ?? root;      // the page's <head>, or the card's shadow root
  if (!into.querySelector?.('style[data-floor-switch]')) {
    const st = document.createElement('style');
    st.dataset.floorSwitch = '';
    st.textContent = CSS;
    into.prepend(st);
  }
}

/**
 * Puts the switch into `parent` (positioned, the plan's box). onPick(levelId) is called when a floor is picked.
 * reserve: px of the parent's width kept free for other controls on the same row (the viewer's 2D / 3D bar), or a function giving it.
 * Returns { set(levels, currentId), show(on), destroy() }; levels are [{ id, name, elevation? }] in the order of the buttons
 * (bottom floor first); the dropdown lists them top floor first, like a building.
 */
export function createFloorSwitch(parent, { onPick, reserve = 0, label = 'Floor' } = {}) {
  const el = document.createElement('div');
  el.className = 'fsw';
  el.hidden = true;
  parent.append(el);
  addStyle(el);
  let levels = [], current = null, on = false, mode = 'buttons', active = -1;
  // the plan underneath must not take a press on the switch for a drag, a pan or a swipe to another floor
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'wheel', 'click', 'dblclick']) el.addEventListener(ev, e => e.stopPropagation(), { passive: true });

  const pick = id => { close(); if (id && id !== current) onPick?.(id); };
  const listed = () => levels.slice().reverse();

  function draw() {
    const cur = levels.find(l => l.id === current);
    el.classList.remove('open');
    if (mode === 'buttons') {
      el.innerHTML = `<div class="fsrow" role="radiogroup" aria-label="${esc(label)}">${levels.map(l =>
        `<button type="button" role="radio" aria-checked="${l.id === current}" data-l="${esc(l.id)}"${l.id === current ? ' class="on"' : ''}>${esc(l.name || l.id)}</button>`).join('')}</div>`;
      for (const b of el.querySelectorAll('button')) b.onclick = () => pick(b.dataset.l);
    } else {
      el.innerHTML = `<button type="button" class="fsbtn" aria-haspopup="listbox" aria-expanded="false" title="${esc(label)}">${ICON}<span class="nm">${esc(cur?.name || cur?.id || label)}</span><span class="chev" aria-hidden="true"></span></button>`;
      el.querySelector('.fsbtn').onclick = () => (el.classList.contains('open') ? close() : open());
      el.querySelector('.fsbtn').onkeydown = e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } };
    }
  }

  function open() {
    if (mode !== 'menu') return;
    const items = listed();
    active = Math.max(0, items.findIndex(l => l.id === current));
    const ul = document.createElement('ul');
    ul.className = 'fslist';
    ul.setAttribute('role', 'listbox');
    ul.tabIndex = -1;
    ul.innerHTML = items.map((l, i) => `<li role="option" data-l="${esc(l.id)}" aria-selected="${l.id === current}" class="${l.id === current ? 'on' : ''}${i === active ? ' act' : ''}"><span class="tick">${l.id === current ? '✓' : ''}</span><span class="nm">${esc(l.name || l.id)}</span><span class="el">${signed(l.elevation)}</span></li>`).join('');
    for (const li of ul.querySelectorAll('li')) li.onclick = () => pick(li.dataset.l);
    ul.onkeydown = e => {
      const lis = [...ul.querySelectorAll('li')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : lis.length - 1)) % lis.length; }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); active = e.key === 'Home' ? 0 : lis.length - 1; }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return pick(lis[active]?.dataset.l); }
      else if (e.key === 'Escape' || e.key === 'Tab') { close(); return el.querySelector('.fsbtn')?.focus(); }
      else return;
      lis.forEach((li, i) => li.classList.toggle('act', i === active));
      lis[active]?.scrollIntoView({ block: 'nearest' });
    };
    el.append(ul);
    el.classList.add('open');
    el.querySelector('.fsbtn')?.setAttribute('aria-expanded', 'true');
    ul.focus({ preventScroll: true });
    // a press anywhere else closes it (in the card that is inside its shadow root, so listen there too)
    setTimeout(() => { el.getRootNode().addEventListener('pointerdown', outside, true); document.addEventListener('pointerdown', outside, true); });
  }
  function close() {
    el.querySelector('.fslist')?.remove();
    el.classList.remove('open');
    el.querySelector('.fsbtn')?.setAttribute('aria-expanded', 'false');
    el.getRootNode().removeEventListener('pointerdown', outside, true);
    document.removeEventListener('pointerdown', outside, true);
  }
  function outside(e) { if (!e.composedPath().includes(el)) close(); }

  /** Buttons when they fit beside what else is on that row of the plan, else the dropdown. */
  function fit() {
    if (!on || !levels.length) return;
    const probe = document.createElement('div');
    probe.className = 'fsrow measure';
    probe.innerHTML = levels.map(l => `<button type="button">${esc(l.name || l.id)}</button>`).join('');
    el.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    const next = switchMode(width, parent.clientWidth - 20 - (typeof reserve === 'function' ? reserve() : reserve));
    if (next !== mode) { mode = next; draw(); }
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  ro?.observe(parent);

  return {
    el,
    set(list, id) {
      levels = (list || []).map(l => ({ id: l.id, name: l.name, elevation: l.elevation }));
      current = id ?? null;
      draw();
      fit();
    },
    show(want) {
      on = !!want;
      el.hidden = !on;
      if (!on) close(); else fit();
    },
    destroy() { close(); ro?.disconnect(); el.remove(); },
  };
}
