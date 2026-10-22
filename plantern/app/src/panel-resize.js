// The sidebar is resized by dragging the bar on its left edge; the width is remembered in this browser (per page).
// `edge()` is where the panel's right edge is (the page's right edge for the sidebar; the Editor's 3D preview sits left of it).
export function wirePanelResize(bar, panel, key, onResize = () => {}, edge = () => innerWidth) {
  try { const wd = Number(localStorage.getItem(key)); if (wd >= 240) panel.style.width = `${wd}px`; } catch { /* no storage */ }
  bar.addEventListener('pointerdown', e => {
    bar.setPointerCapture(e.pointerId); bar.classList.add('drag');
    const move = ev => { panel.style.width = `${Math.max(240, Math.min(innerWidth * 0.7, edge() - ev.clientX))}px`; onResize(); };
    const up = () => {
      bar.classList.remove('drag'); bar.removeEventListener('pointermove', move);
      try { localStorage.setItem(key, parseInt(panel.style.width, 10)); } catch { /* no storage */ }
      onResize();
    };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up, { once: true });
  });
  // double-click returns to the default width
  bar.addEventListener('dblclick', () => {
    panel.style.width = '';
    try { localStorage.removeItem(key); } catch { /* no storage */ }
    onResize();
  });
}

// On a phone the plan is on top and the sidebar below it; a bar between them gives the sidebar 30 % to 80 % of the height
// (docs/archive/2026-10-20-mobile-ux.md, S2). The height is a CSS variable the phone layout reads (src/styles.css), so a wide screen ignores it.
export const PANEL_HEIGHT = { min: 30, max: 80 };

/** The panel's height in percent of the page when its top edge is dragged to `clientY`, within PANEL_HEIGHT. Pure. */
export function panelHeightPct(clientY, pageHeight, { min, max } = PANEL_HEIGHT) {
  if (!(pageHeight > 0)) return null;
  const pct = ((pageHeight - clientY) / pageHeight) * 100;
  return Math.round(Math.max(min, Math.min(max, pct)) * 10) / 10;
}

export function wirePanelResizeVertical(bar, panel, key, onResize = () => {}) {
  const set = pct => panel.style.setProperty('--panel-h', `${pct}%`);
  try { const v = Number(localStorage.getItem(key)); if (v >= PANEL_HEIGHT.min && v <= PANEL_HEIGHT.max) set(v); } catch { /* no storage */ }
  bar.addEventListener('pointerdown', e => {
    try { bar.setPointerCapture(e.pointerId); } catch { /* a pointer that is not active (a test) */ }
    bar.classList.add('drag');
    let last = null;
    const move = ev => { const pct = panelHeightPct(ev.clientY, innerHeight); if (pct !== null) { last = pct; set(pct); onResize(); } };
    const up = () => {
      bar.classList.remove('drag'); bar.removeEventListener('pointermove', move);
      if (last !== null) { try { localStorage.setItem(key, String(last)); } catch { /* no storage */ } }
      onResize();
    };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up, { once: true }); bar.addEventListener('pointercancel', up, { once: true });
  });
  // a double-tap (or double-click) goes back to the default height
  bar.addEventListener('dblclick', () => {
    panel.style.removeProperty('--panel-h');
    try { localStorage.removeItem(key); } catch { /* no storage */ }
    onResize();
  });
}

// A phone's controls at the bottom can be put away so the plan has the whole screen: a bar between the plan and the controls
// folds them and brings them back. The choice is remembered in this browser; on a wide screen the bar is hidden and nothing folds.
/** The label and tooltip of the bar for a state (pure). */
export function asideToggleText(collapsed) {
  return collapsed ? { label: 'Show controls', title: 'Show the controls again' } : { label: 'Hide controls', title: 'Hide the controls so the plan fills the screen' };
}

export function wireAsideCollapse(button, key, onChange = () => {}, body = document.body) {
  const apply = collapsed => {
    body.classList.toggle('aside-min', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    const t = asideToggleText(collapsed);
    button.title = t.title;
    const lbl = button.querySelector('.lbl'); if (lbl) lbl.textContent = t.label;
  };
  let collapsed = false;
  try { collapsed = localStorage.getItem(key) === '1'; } catch { /* no storage */ }
  apply(collapsed);
  button.addEventListener('click', () => {
    collapsed = !collapsed;
    apply(collapsed);
    try { if (collapsed) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch { /* no storage */ }
    onChange(collapsed);
  });
  return () => collapsed;
}
