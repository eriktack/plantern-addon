// Editor page: the yard (docs/plans/yard.md Y6, Y7; src/model/yard.js). The section lists the yard's areas and lines and draws
// new ones: pick a surface (or a kind of line), click the corners on the plan (they snap to the level's points; Alt: a free
// point), Enter or a double-click finishes, Backspace takes the last point back, Esc cancels. The yard's outline is drawn the
// same way. Redraw replaces an area's or a line's points. Everything is one undo step each; Save stores it.

import { toSvg } from '../../render2d/coords.js';
import { nearestPoint } from '../../tools/measure-core.js';
import { DARK_PALETTE } from '../../render2d/palette.js';
import { YARD_SURFACES, SURFACE_LABEL, LINE_LABEL, yardLevelId } from '../../model/yard.js';
import { setYard, addYardArea, setYardArea, moveYardArea, deleteYardArea, addYardLine, setYardLine, deleteYardLine } from '../../edit/ops.js';
import { $, commit, esc } from './core.js';
import { setStatus } from './session.js';
import { Ed } from './state.js';
import { draw } from './plan-draw.js';

const yd = () => (Ed.yd ??= { tool: null });
const onYardLevel = () => Ed.levelId === yardLevelId(Ed.model);
const msg = t => { $('ydMsg').textContent = t; };

/** The section: the yard's areas and lines, and the controls to draw new ones. */
export function renderYard() {
  const y = Ed.model.yard || {}, areas = y.areas || [], lines = y.lines || [];
  $('ydCount').textContent = areas.length + lines.length ? `(${areas.length + lines.length})` : '';
  $('ydHere').hidden = onYardLevel();
  $('ydTools').hidden = !onYardLevel();
  $('ydRetain').hidden = $('ydKind').value !== 'retaining';
  $('ydElev').value = y.elevation ?? '';
  $('ydBoundaryState').textContent = y.boundary ? `outline drawn (${y.boundary.length} corners)` : 'no outline yet';
  const surfOpts = cur => YARD_SURFACES.map(s => `<option value="${s}"${s === cur ? ' selected' : ''}>${SURFACE_LABEL[s]}</option>`).join('');
  $('ydList').innerHTML = [...areas].reverse().map(a => `<div class="arow"><span><b>${esc(a.name || SURFACE_LABEL[a.surface] || a.surface)}</b> <small>${esc(a.id)} · ${a.polygon.length} corners</small><br>`
      + `<select data-ydsurf="${esc(a.id)}" aria-label="Surface of ${esc(a.name || a.id)}">${surfOpts(a.surface)}</select></span>`
      + `<button data-ydup="${esc(a.id)}" title="Draw it over the area above it">↑</button><button data-yddown="${esc(a.id)}" title="Draw it under the area below it">↓</button>`
      + `<button data-ydredraw="area|${esc(a.id)}" title="Click its corners again">✎</button><button data-yddel="area|${esc(a.id)}" title="Delete it">×</button></div>`).join('')
    + lines.map(l => `<div class="arow"><span><b>${esc(l.name || LINE_LABEL[l.kind] || l.kind)}</b> <small>${esc(l.id)} · ${l.points.length} points${l.kind === 'retaining' ? ` · ${l.drop} mm, high on its ${l.high}` : ''}</small></span>`
      + `<button data-ydredraw="line|${esc(l.id)}" title="Click its points again">✎</button><button data-yddel="line|${esc(l.id)}" title="Delete it">×</button></div>`).join('')
    || '<small>Nothing yet. Areas listed top first: the top one is drawn over the others.</small>';
  const apply = (r, what) => { if (r.report.errors.length) { msg(r.report.errors.join('; ')); return; } commit(r.model); msg(`${what} (not saved yet)`); };
  $('ydList').querySelectorAll('[data-ydsurf]').forEach(s => (s.onchange = () => apply(setYardArea(Ed.model, s.dataset.ydsurf, { surface: s.value }), 'Surface changed')));
  $('ydList').querySelectorAll('[data-ydup]').forEach(b => (b.onclick = () => apply(moveYardArea(Ed.model, b.dataset.ydup, 1), 'Moved up')));
  $('ydList').querySelectorAll('[data-yddown]').forEach(b => (b.onclick = () => apply(moveYardArea(Ed.model, b.dataset.yddown, -1), 'Moved down')));
  $('ydList').querySelectorAll('[data-yddel]').forEach(b => (b.onclick = () => { const [k, id] = b.dataset.yddel.split('|'); apply(k === 'area' ? deleteYardArea(Ed.model, id) : deleteYardLine(Ed.model, id), 'Deleted'); }));
  $('ydList').querySelectorAll('[data-ydredraw]').forEach(b => (b.onclick = () => { const [k, id] = b.dataset.ydredraw.split('|'); startDraw(k, { redraw: id }); }));
}

// ---- drawing ----
export function startDraw(type, { redraw = null } = {}) {
  if (!onYardLevel()) { msg('The yard is drawn on the ground floor: switch to it first.'); return; }
  const s = yd();
  s.tool = { type, pts: [], redraw, surface: $('ydSurface').value, kind: $('ydKind').value, high: $('ydHigh').value, drop: Number($('ydDrop').value), name: $('ydName').value.trim() };
  if (type === 'line' && !redraw && s.tool.kind === 'retaining' && !(s.tool.drop > 0)) { s.tool = null; msg('Give the retaining wall its height difference (mm) first.'); return; }
  $('preview').classList.add('placing');
  status();
  draw();
}
function status() {
  const t = yd().tool, need = t.type === 'line' ? 2 : 3;
  setStatus(`${t.type === 'boundary' ? 'The yard\'s outline' : t.redraw ? `Redraw ${t.redraw}` : t.type === 'area' ? SURFACE_LABEL[t.surface] : LINE_LABEL[t.kind]}: click ${t.pts.length ? 'the next point' : 'the first point'} (snaps to corners; Alt: free) · ${t.pts.length >= need ? 'Enter or double-click: done · ' : ''}Backspace: undo a point · Esc: cancel`);
}
export const yardDrawing = () => !!Ed.yd?.tool;
export function stopDraw(m = '') {
  if (!Ed.yd?.tool) return false;
  Ed.yd.tool = null;
  $('preview').classList.remove('placing');
  if (m) setStatus(m);
  draw();
  return true;
}
const planPointOf = e => { const svg = $('preview'), m = svg.getScreenCTM(), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(m.inverse()); return { p: [q.x, -q.y], k: 1 / Math.abs(m.a) }; };

/** A click on the plan while drawing: the next point (snapped to the level's points unless Alt). */
export function yardClick(e) {
  const t = yd().tool;
  if (!t) return;
  const { p, k } = planPointOf(e), hit = e.altKey ? null : nearestPoint(p, Ed.snaps || [], 14 * k);
  const q = (hit ? hit.pos : p).map(v => Math.round(v));
  const last = t.pts[t.pts.length - 1];
  if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 1) return;              // the second click of a double-click
  t.pts.push(q);
  status(); draw();
}
export function undoPoint() { const t = yd().tool; if (!t?.pts.length) return false; t.pts.pop(); status(); draw(); return true; }

/** Finish the drawing (Enter, double-click): the area, line or outline, through its edit operation. */
export function finishDraw() {
  const t = yd().tool;
  if (!t) return false;
  const need = t.type === 'line' ? 2 : 3;
  if (t.pts.length < need) { setStatus(`It needs at least ${need} points (Esc cancels)`); return true; }
  let r;
  if (t.type === 'boundary') r = setYard(Ed.model, { boundary: t.pts });
  else if (t.type === 'area') r = t.redraw ? setYardArea(Ed.model, t.redraw, { polygon: t.pts }) : addYardArea(Ed.model, { surface: t.surface, polygon: t.pts, ...(t.name ? { name: t.name } : {}) });
  else r = t.redraw ? setYardLine(Ed.model, t.redraw, { points: t.pts }) : addYardLine(Ed.model, { kind: t.kind, points: t.pts, ...(t.name ? { name: t.name } : {}), ...(t.kind === 'retaining' ? { high: t.high, drop: t.drop } : {}) });
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return true; }
  yd().tool = null;
  $('preview').classList.remove('placing');
  $('ydName').value = '';
  commit(r.model);
  setStatus(`${t.type === 'boundary' ? 'The yard\'s outline' : (r.area || r.line)?.id ?? 'It'} ${t.redraw ? 'redrawn' : 'added'} (not saved yet)`);
  return true;
}
export function setElevation(v) {
  const t = String(v).trim(), r = setYard(Ed.model, { elevation: t === '' ? null : Number(t) });
  if (r.report.errors.length) { msg(r.report.errors.join('; ')); return; }
  commit(r.model); msg('Ground height set (not saved yet)');
}

// ---- in the plan ----
const P = DARK_PALETTE;
const pts = a => a.map(p => toSvg(p).join(',')).join(' ');
/** The yard under the ground floor's rooms: areas in order, then lines. */
export function yardSvg(fs) {
  const y = Ed.model.yard;
  if (!y || !onYardLevel()) return '';
  let out = '';
  if (y.boundary) out += `<polygon points="${pts(y.boundary)}" fill="none" stroke="#8b93a1" stroke-width="${fs / 10}" stroke-dasharray="${fs} ${fs / 2}" pointer-events="none"/>`;
  for (const a of y.areas || []) out += `<polygon points="${pts(a.polygon)}" fill="${a.color || P.yardSurface[a.surface] || P.yardSurface.other}" fill-opacity="${P.yardAlpha}" stroke="none" pointer-events="none"><title>${esc(a.name || a.surface)}</title></polygon>`;
  for (const l of y.lines || []) out += `<polyline points="${pts(l.points)}" fill="none" stroke="${P.yardLine[l.kind] || P.yardLine.edging}" stroke-width="${fs / (l.kind === 'hedge' ? 2 : 5)}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"${l.kind === 'fence' ? ` stroke-dasharray="${fs / 2} ${fs / 3}"` : ''}/>`;
  return out;
}
/** On top of the plan while drawing: the points so far, joined. */
export function yardDraftSvg(fs) {
  const t = Ed.yd?.tool;
  if (!t || !t.pts.length) return '';
  const closed = t.type !== 'line' && t.pts.length >= 3;
  return `<g pointer-events="none"><${closed ? 'polygon' : 'polyline'} points="${pts(t.pts)}" fill="${closed ? '#ffb45433' : 'none'}" stroke="#ffb454" stroke-width="${fs / 6}" stroke-dasharray="${fs / 2} ${fs / 3}"/>`
    + t.pts.map(p => { const [x, y] = toSvg(p); return `<circle cx="${x}" cy="${y}" r="${fs * 0.35}" fill="#ffb454" stroke="#14161a" stroke-width="${fs / 10}"/>`; }).join('') + '</g>';
}
