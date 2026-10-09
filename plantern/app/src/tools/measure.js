import { sub, add, mul, len, dot } from '../geometry/vec.js';
import { toSvg } from '../render2d/coords.js';
import { el } from '../render2d/plan.js';
import { checkRows } from '../model/checks.js';

/**
 * Measure tool + checks panel. Points come only from the snap registry (by ref).
 * ctx: { view, model, dom: { read, pin, checks, status, toggle }, getState() → { snaps, index, geo, settings } }
 * Checks live in model.checks (top level: refs are unique per model file, so checks may span levels).
 * ctx.onPin(a, b, measured) / ctx.onRemove(id) keep a change (the page saves it and then calls
 * refreshChecks()); without them a pinned check lives only in this page until it is reloaded.
 */
export function createMeasureTool(ctx) {
  const { view, model, dom } = ctx;
  let mode = false, A = null, B = null, hover = null, cand = [], ci = 0;
  const status = t => (dom.status.textContent = t);

  function hoverAt(e) {
    if (!mode) return;
    const { snaps, settings } = ctx.getState(), p = view.planPt(e), k = view.pxScale();
    cand = e.altKey ? [] : snaps.map(s => ({ ...s, d: len(sub(s.pos, p)) })).filter(s => s.d <= settings.snapRadiusPx * k).sort((a, b) => a.d - b.d || a.pri - b.pri);
    ci = 0;
    pick(p);
  }
  function pick(p) {
    hover = cand[ci] || { pos: p };
    status(cand.length ? `${hover.ref} · ${hover.kind}${cand.length > 1 ? ` (Tab ${ci + 1}/${cand.length})` : ''}` : `free point ${Math.round(hover.pos[0])}, ${Math.round(hover.pos[1])}`);
    draw();
  }
  function tap(e) {
    if (!mode) return;
    hoverAt(e);
    const pt = { ref: hover.ref, pos: hover.pos };
    if (!A || B) { A = B && e.shiftKey ? B : pt; B = null; } else B = pt;
    draw(); readout();
  }
  function draw() {
    const g = view.overlay();
    if (!g) return;
    g.replaceChildren();
    const k = view.pxScale(), mark = (p, c) => { const s = toSvg(p); el('circle', { cx: s[0], cy: s[1], r: 5 * k, fill: 'none', stroke: c, 'stroke-width': 2 * k }, g); };
    if (mode && hover) mark(hover.pos, '#ffb454');
    if (A) mark(A.pos, '#4cc38a');
    if (B) mark(B.pos, '#4cc38a');
    const end = B || (mode && A && hover ? hover : null);
    if (!A || !end) return;
    const a = toSvg(A.pos), b = toSvg(end.pos), m = toSvg(add(A.pos, mul(sub(end.pos, A.pos), 0.5)));
    el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#ffb454', 'stroke-width': 2 * k, 'stroke-dasharray': `${6 * k} ${4 * k}` }, g);
    el('text', { x: m[0], y: m[1] - 8 * k, 'text-anchor': 'middle', 'font-size': 13 * k, fill: '#ffb454', 'paint-order': 'stroke', stroke: '#14161a', 'stroke-width': 4 * k }, g).textContent = Math.round(len(sub(end.pos, A.pos))) + ' mm';
  }
  function readout() {
    dom.pin.disabled = true;
    if (!A || !B) { dom.read.innerHTML = `<small>${A ? 'Pick the second point…' : 'Press M, then pick two points.'}</small>`; return; }
    const d = sub(B.pos, A.pos);
    let t = `<b>${Math.round(len(d))} mm</b> &nbsp; Δx ${Math.round(d[0])} · Δy ${Math.round(d[1])}`;
    const { geo } = ctx.getState(), wa = A.ref?.split('#')[0], wb = B.ref?.split('#')[0];
    if (wa && wa === wb && geo?.frames.get(wa)) t += ` · along wall ${Math.round(Math.abs(dot(d, geo.frames.get(wa).u)))}`;
    dom.read.innerHTML = `${t}<br><small>${A.ref || 'free'} → ${B.ref || 'free'}</small>`;
    dom.pin.disabled = !(A.ref && B.ref);
  }
  function drawChecks() {
    const { index, settings } = ctx.getState(), tol = settings.checkTolerance;
    dom.checks.replaceChildren();
    // the furthest off first (broken references before everything)
    for (const r of checkRows(model.checks, ref => index.get(ref), tol)) {
      const c = r.check, row = document.createElement('div');
      row.className = 'chk';
      if (r.broken) row.innerHTML = `<span class="dot bad"></span><span>${c.id}: broken reference<br><small>${r.missing}</small></span><span></span>`;
      else {
        const a = index.get(c.a), b = index.get(c.b), d = r.delta;
        row.innerHTML = `<span class="dot ${r.cls}"></span><span>${c.a} ↔ ${c.b}<br><small>${c.note || ''}${a.level !== b.level ? ` · ${a.level}/${b.level}` : ''}${c.solve ? ' · in the room\'s solve' : ''}</small></span><span>${r.model.toFixed(0)} / ${c.measured} <b class="${r.cls}">${d > 0 ? '+' : ''}${d.toFixed(0)}</b></span>`;
        row.onclick = () => { A = { ref: c.a, pos: a.pos }; B = { ref: c.b, pos: b.pos }; draw(); readout(); };
      }
      const x = document.createElement('button');
      x.textContent = '×';
      x.title = 'Remove check';
      x.onclick = ev => { ev.stopPropagation(); if (ctx.onRemove) ctx.onRemove(c.id); else { model.checks.splice(model.checks.indexOf(c), 1); drawChecks(); } };
      row.lastChild.append(' ', x);
      dom.checks.appendChild(row);
    }
    if (!model.checks.length) dom.checks.innerHTML = '<small>No checks yet. Measure two snap points and pin.</small>';
  }
  function setMode(on) {
    mode = on;
    dom.toggle.classList.toggle('on', on);
    view.overlay()?.ownerSVGElement?.classList.toggle('measure', on);
    if (!on) { hover = null; status(''); }
    draw();
  }
  function reset() { A = B = hover = null; cand = []; draw(); readout(); drawChecks(); }

  dom.toggle.onclick = () => setMode(!mode);
  dom.pin.onclick = () => {
    const v = parseFloat(prompt('Real measured distance (mm):'));
    if (!isFinite(v)) return;
    if (ctx.onPin) { ctx.onPin(A.ref, B.ref, v); return; }
    model.checks.push({ id: 'c_' + Date.now().toString(36), a: A.ref, b: B.ref, measured: v, note: 'pinned' });
    drawChecks();
  };
  addEventListener('keydown', e => {
    if (e.target.closest?.('input,select,textarea')) return;
    if (e.key === 'm' || e.key === 'M') setMode(!mode);
    else if (e.key === 'Escape') { A = B = null; draw(); readout(); }
    else if (e.key === 'Tab' && mode && cand.length > 1) { e.preventDefault(); ci = (ci + 1) % cand.length; pick(hover.pos); }
  });

  /** A line under the checks: saved, or why not. */
  const note = t => { if (dom.note) dom.note.textContent = t || ''; };
  return { hoverAt, tap, draw, reset, refreshChecks: drawChecks, note, isActive: () => mode };
}
