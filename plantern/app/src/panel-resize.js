// The sidebar is resized by dragging the bar on its left edge; the width is remembered in this browser (per page).
export function wirePanelResize(bar, panel, key, onResize = () => {}) {
  try { const wd = Number(localStorage.getItem(key)); if (wd >= 240) panel.style.width = `${wd}px`; } catch { /* no storage */ }
  bar.addEventListener('pointerdown', e => {
    bar.setPointerCapture(e.pointerId); bar.classList.add('drag');
    const move = ev => { panel.style.width = `${Math.max(240, Math.min(innerWidth * 0.7, innerWidth - ev.clientX))}px`; onResize(); };
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
