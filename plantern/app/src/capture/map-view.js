// Zoom and pan for the small plan maps of the phone pages (wizard.html, openings.html): pinch with two
// fingers, drag with one, the scroll wheel on a PC, and + / − / ⤢ buttons on the map. The page still
// decides what the map is about (the fit box, from what is being done); the person can zoom in from
// there, and a new subject (another room, another step) shows the fit again.
// The view math is pure (exported for tests); createMapView() wires it to an <svg>.

/**
 * The box grown to the element's aspect ratio (w × h px), so one SVG unit has the same size across and
 * down, and placed so it stays clear of `inset` px along the edges (where buttons sit).
 */
export function fitTo(box, w, h, { top = 0, right = 0, bottom = 0, left = 0 } = {}) {
  if (!(w > 0) || !(h > 0)) return { ...box };
  const iw = Math.max(w - left - right, w / 2), ih = Math.max(h - top - bottom, h / 2);
  const k = Math.max(box.w / iw, box.h / ih), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  // the box's middle sits in the middle of the free area
  return { x: cx - (left + iw / 2) * k, y: cy - (top + ih / 2) * k, w: w * k, h: h * k };
}

/** Zoom the view by f (< 1 = in) around point c (SVG units), its width kept within [min, max]. */
export function zoomView(vb, f, c, { min = 0, max = Infinity } = {}) {
  const w = Math.min(Math.max(vb.w * f, min), max), k = w / vb.w;
  return { x: c[0] - (c[0] - vb.x) * k, y: c[1] - (c[1] - vb.y) * k, w: vb.w * k, h: vb.h * k };
}

/**
 * Two fingers: the view at the start (vb0, on an element of size [w, h] px), the fingers' midpoint and
 * distance at the start (m0, d0) and now (m1, d1), in px from the element's top left. The plan point
 * under the first midpoint stays under the fingers, scaled by how far they moved apart.
 */
export function pinchView(vb0, [w, h], m0, d0, m1, d1, limits = {}) {
  const k0 = vb0.w / w, P = [vb0.x + m0[0] * k0, vb0.y + m0[1] * k0];
  const k1 = Math.min(Math.max(k0 * d0 / Math.max(d1, 1), (limits.min ?? 0) / w), (limits.max ?? Infinity) / w);
  return { x: P[0] - m1[0] * k1, y: P[1] - m1[1] * k1, w: w * k1, h: h * k1 };
}

/**
 * Attach zoom and pan to an <svg> whose parent is positioned (the buttons sit in its corner).
 * onChange() is called (once per frame) when the person zoomed or moved the map: redraw then, since
 * labels are sized in screen pixels (see frame().unit).
 * A tap that ended a drag or a pinch does not reach the map's own click handlers.
 */
export function createMapView(svg, { onChange = () => {}, minWidth = 500, inset = { bottom: 44 } } = {}) {
  let user = null, fit = null, key, frameReq = 0, suppress = false;
  const pointers = new Map();
  let gesture = null;   // { kind: 'pan' | 'pinch' | 'maybe', … }
  const size = () => [svg.clientWidth || 1, svg.clientHeight || 1];
  const limits = () => ({ min: minWidth, max: fit ? fit.w * 3 : Infinity });
  const changed = () => { cancelAnimationFrame(frameReq); frameReq = requestAnimationFrame(() => { onChange(); syncButtons(); }); };
  const local = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const view = () => user || fit;

  // + / − / ⤢ in the bottom right corner of the map
  const bar = document.createElement('div');
  bar.className = 'mapzoom';
  bar.innerHTML = '<button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="fit" aria-label="Show all again" hidden>⤢</button>';
  svg.parentElement.appendChild(bar);
  const syncButtons = () => { bar.querySelector('[data-z="fit"]').hidden = !user; };
  bar.addEventListener('click', e => {
    const z = e.target.closest('button')?.dataset.z, vb = view();
    if (!z || !vb) return;
    if (z === 'fit') user = null;
    else user = zoomView(vb, z === 'in' ? 1 / 1.6 : 1.6, [vb.x + vb.w / 2, vb.y + vb.h / 2], limits());
    changed();
  });

  svg.addEventListener('wheel', e => {
    const vb = view();
    if (!vb) return;
    e.preventDefault();
    const [px, py] = local(e), k = vb.w / size()[0];
    user = zoomView(vb, Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.0015))), [vb.x + px * k, vb.y + py * k], limits());
    changed();
  }, { passive: false });

  svg.addEventListener('pointerdown', e => {
    if (e.button > 1) return;
    pointers.set(e.pointerId, local(e));
    const vb = view();
    if (!vb) return;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', vb, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
    } else if (pointers.size === 1) gesture = { kind: 'maybe', vb, start: local(e) };
  });
  addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, local(e));
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      user = pinchView(gesture.vb, size(), gesture.m, gesture.d, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.hypot(a[0] - b[0], a[1] - b[1]), limits());
      suppress = true; changed();
    } else if (gesture.kind !== 'pinch') {
      const p = pointers.get(e.pointerId), dx = p[0] - gesture.start[0], dy = p[1] - gesture.start[1];
      if (gesture.kind === 'maybe' && Math.hypot(dx, dy) < 8) return;          // still a tap
      gesture.kind = 'pan';
      const k = gesture.vb.w / size()[0];
      user = { ...gesture.vb, x: gesture.vb.x - dx * k, y: gesture.vb.y - dy * k };
      suppress = true; changed();
    }
  });
  const up = e => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 1 && gesture?.kind === 'pinch') {
      // one finger stays down after a pinch: go on moving the map from here
      const [p] = [...pointers.values()];
      gesture = { kind: 'pan', vb: view(), start: p };
    } else if (!pointers.size) {
      gesture = null;
      setTimeout(() => { suppress = false; }, 350);                           // the click after the gesture still comes
    }
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  // the click that ends a drag or a pinch is not a tap on what lies under the finger
  svg.addEventListener('click', e => { if (suppress) { suppress = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  return {
    /**
     * Show `box` (SVG units: what the page wants in view), unless the person zoomed or moved the map
     * since the subject `k` last changed. Sets the viewBox; returns { vb, unit } where unit is SVG
     * units per screen pixel, for sizing labels and marks in pixels.
     */
    frame(box, k = '') {
      if (k !== key) { key = k; user = null; }
      const [w, h] = size();
      fit = fitTo(box, w, h, inset);
      const vb = user || fit;
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      syncButtons();
      return { vb, unit: Math.max(vb.w / w, vb.h / h) };
    },
    /** Back to the page's own framing. */
    reset() { user = null; syncButtons(); },
    get zoomed() { return !!user; },
  };
}
