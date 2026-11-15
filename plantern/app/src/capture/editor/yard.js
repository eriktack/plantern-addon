// Editor page: the yard (docs/plans/yard.md Y6, Y7; src/model/yard.js). The section lists the yard's areas and lines and draws
// new ones: pick a surface (or a kind of line), click the corners on the plan (they snap to the level's points; Alt: a free
// point), Enter or a double-click finishes, Backspace takes the last point back, Esc cancels. The yard's outline is drawn the
// same way. Redraw replaces an area's or a line's points. Everything is one undo step each; Save stores it.

import { toSvg } from '../../render2d/coords.js';
import { nearestPoint } from '../../tools/measure-core.js';
import { DARK_PALETTE } from '../../render2d/palette.js';
import { YARD_SURFACES, SURFACE_LABEL, LINE_LABEL, yardLevelId } from '../../model/yard.js';
import { PLANTINGS, PLANTING_LABEL, plantingOf } from '../../terrain/planting.js';
import { materialOptionsHtml } from './panel-wall.js';
import { setYard, addYardArea, setYardArea, moveYardArea, deleteYardArea, addYardLine, setYardLine, deleteYardLine, addYardGround, setYardGround, deleteYardGround } from '../../edit/ops.js';
import { $, commit, esc } from './core.js';
import { setStatus } from './session.js';
import { Ed } from './state.js';
import { draw } from './plan-draw.js';
import { readGeoJson } from '../../terrain/geojson.js';

const yd = () => (Ed.yd ??= { tool: null });
const onYardLevel = () => Ed.levelId === yardLevelId(Ed.model);
const msg = t => { $('ydMsg').textContent = t; };

/** The section: the yard's areas and lines, and the controls to draw new ones. */
export function renderYard() {
  const y = Ed.model.yard || {}, areas = y.areas || [], lines = y.lines || [], ground = y.ground || [];
  $('ydCount').textContent = areas.length + lines.length + ground.length ? `(${areas.length + lines.length + ground.length})` : '';
  $('ydHere').hidden = onYardLevel();
  $('ydTools').hidden = !onYardLevel();
  $('ydRetain').hidden = $('ydKind').value !== 'retaining';
  $('ydElev').value = y.elevation ?? '';
  $('ydBoundaryState').textContent = y.boundary ? `outline drawn (${y.boundary.length} corners)` : 'no outline yet';
  renderTerrain();
  const matOpts = materialOptionsHtml('<option value="">Material: the surface\'s colour</option>');
  const surfOpts = cur => YARD_SURFACES.map(s => `<option value="${s}"${s === cur ? ' selected' : ''}>${SURFACE_LABEL[s]}</option>`).join('');
  $('ydList').innerHTML = [...areas].reverse().map(a => `<div class="arow"><span><b>${esc(a.name || SURFACE_LABEL[a.surface] || a.surface)}</b> <small>${esc(a.id)} · ${a.polygon.length} corners</small><br>`
      + `<select data-ydsurf="${esc(a.id)}" aria-label="Surface of ${esc(a.name || a.id)}">${surfOpts(a.surface)}</select>`
      + ` <select data-ydmat="area|${esc(a.id)}" data-cur="${esc(a.material || '')}" aria-label="Material of ${esc(a.name || a.id)}">${matOpts}</select>`
      + (a.surface === 'bed' ? ` <select data-ydplant="${esc(a.id)}" aria-label="What grows in ${esc(a.name || a.id)}">${PLANTINGS.map(k => `<option value="${k}"${k === plantingOf(a) ? ' selected' : ''}>${PLANTING_LABEL[k]}</option>`).join('')}</select>` : '') + '</span>'
      + `<button data-ydup="${esc(a.id)}" title="Draw it over the area above it">↑</button><button data-yddown="${esc(a.id)}" title="Draw it under the area below it">↓</button>`
      + `<button data-ydcorners="area|${esc(a.id)}" title="Drag its corners">✥</button><button data-ydredraw="area|${esc(a.id)}" title="Click its corners again">✎</button><button data-yddel="area|${esc(a.id)}" title="Delete it">×</button></div>`).join('')
    + lines.map(l => `<div class="arow"><span><b>${esc(l.name || LINE_LABEL[l.kind] || l.kind)}</b> <small>${esc(l.id)} · ${l.points.length} points${l.kind === 'retaining' ? ` · ${l.drop} mm, high on its ${l.high}` : ''}</small>`
      + (['stonewall', 'retaining', 'fence', 'edging'].includes(l.kind) ? `<br><select data-ydmat="line|${esc(l.id)}" data-cur="${esc(l.material || '')}" aria-label="Material of ${esc(l.name || l.id)}">${matOpts}</select>` : '') + '</span>'
      + `<button data-ydcorners="line|${esc(l.id)}" title="Drag its points">✥</button><button data-ydredraw="line|${esc(l.id)}" title="Click its points again">✎</button><button data-yddel="line|${esc(l.id)}" title="Delete it">×</button></div>`).join('')
    + ground.map(g => `<div class="arow"><span><b>${esc(g.name || g.id)}</b> <small>${esc(g.id)} · ground height</small><br>`
      + `<input data-ydz="${esc(g.id)}" inputmode="numeric" value="${g.z}" aria-label="Height of ${esc(g.name || g.id)}, mm" style="width:7em"> mm</span>`
      + `<button data-ydredraw="ground|${esc(g.id)}" title="Click its spot again">✎</button><button data-yddel="ground|${esc(g.id)}" title="Delete it">×</button></div>`).join('')
    || '<small>Nothing yet. Areas listed top first: the top one is drawn over the others.</small>';
  const apply = (r, what) => { if (r.report.errors.length) { msg(r.report.errors.join('; ')); return; } commit(r.model); msg(`${what} (not saved yet)`); };
  $('ydList').querySelectorAll('[data-ydsurf]').forEach(s => (s.onchange = () => apply(setYardArea(Ed.model, s.dataset.ydsurf, { surface: s.value }), 'Surface changed')));
  $('ydList').querySelectorAll('[data-ydmat]').forEach(s => {
    s.value = s.dataset.cur;
    if (s.value !== s.dataset.cur) s.insertAdjacentHTML('beforeend', `<option value="${esc(s.dataset.cur)}" selected>${esc(s.dataset.cur)} (unknown)</option>`);
    s.onchange = () => { const [k, id] = s.dataset.ydmat.split('|'); apply((k === 'area' ? setYardArea : setYardLine)(Ed.model, id, { material: s.value || null }), 'Material changed'); };
  });
  $('ydList').querySelectorAll('[data-ydplant]').forEach(s => (s.onchange = () => apply(setYardArea(Ed.model, s.dataset.ydplant, { planting: s.value === 'flowers' ? null : s.value }), 'Planting changed')));
  $('ydList').querySelectorAll('[data-ydcorners]').forEach(b => (b.onclick = () => { const [type, id] = b.dataset.ydcorners.split('|'); editCorners(type, id); }));
  $('ydList').querySelectorAll('[data-ydup]').forEach(b => (b.onclick = () => apply(moveYardArea(Ed.model, b.dataset.ydup, 1), 'Moved up')));
  $('ydList').querySelectorAll('[data-yddown]').forEach(b => (b.onclick = () => apply(moveYardArea(Ed.model, b.dataset.yddown, -1), 'Moved down')));
  $('ydList').querySelectorAll('[data-yddel]').forEach(b => (b.onclick = () => { const [k, id] = b.dataset.yddel.split('|'); apply(k === 'area' ? deleteYardArea(Ed.model, id) : k === 'ground' ? deleteYardGround(Ed.model, id) : deleteYardLine(Ed.model, id), 'Deleted'); }));
  $('ydList').querySelectorAll('[data-ydz]').forEach(i => (i.onchange = () => { const v = Number(String(i.value).replace('−', '-').trim()); if (!Number.isFinite(v)) { msg('The height is a number of mm'); return; } apply(setYardGround(Ed.model, i.dataset.ydz, { z: v }), 'Height changed'); }));
  $('ydList').querySelectorAll('[data-ydredraw]').forEach(b => (b.onclick = () => { const [k, id] = b.dataset.ydredraw.split('|'); startDraw(k, { redraw: id }); }));
}

// ---- drawing ----
export function startDraw(type, { redraw = null } = {}) {
  if (!onYardLevel()) { msg('The yard is drawn on the ground floor: switch to it first.'); return; }
  const s = yd();
  const gz = Number(String($('ydGroundZ').value).replace('−', '-').trim());
  if (type === 'ground' && !redraw && ($('ydGroundZ').value.trim() === '' || !Number.isFinite(gz))) { msg('Type the measured height (mm from this floor) first, then click its spot.'); return; }
  s.tool = { type, pts: [], redraw, surface: $('ydSurface').value, kind: $('ydKind').value, high: $('ydHigh').value, drop: Number($('ydDrop').value), name: $('ydName').value.trim(), z: gz };
  if (type === 'line' && !redraw && s.tool.kind === 'retaining' && !(s.tool.drop > 0)) { s.tool = null; msg('Give the retaining wall its height difference (mm) first.'); return; }
  $('preview').classList.add('placing');
  status();
  draw();
}
function status() {
  const t = yd().tool, need = t.type === 'line' ? 2 : 3;
  if (t.type === 'ground') { setStatus(`${t.redraw ? `Move ${t.redraw}` : `Ground height ${t.z} mm`}: click its spot (snaps to corners; Alt: free) · Esc: cancel`); return; }
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
  if (t.type === 'ground') { finishDraw(); return; }                 // a ground height is one click
  status(); draw();
}
export function undoPoint() { const t = yd().tool; if (!t?.pts.length) return false; t.pts.pop(); status(); draw(); return true; }

/** Finish the drawing (Enter, double-click): the area, line or outline, through its edit operation. */
export function finishDraw() {
  const t = yd().tool;
  if (!t) return false;
  const need = t.type === 'ground' ? 1 : t.type === 'line' ? 2 : 3;
  if (t.pts.length < need) { setStatus(`It needs at least ${need} points (Esc cancels)`); return true; }
  let r;
  if (t.type === 'ground') r = t.redraw ? setYardGround(Ed.model, t.redraw, { pos: t.pts[0] }) : addYardGround(Ed.model, { pos: t.pts[0], z: t.z, ...(t.name ? { name: t.name } : {}) });
  else if (t.type === 'boundary') r = setYard(Ed.model, { boundary: t.pts });
  else if (t.type === 'area') r = t.redraw ? setYardArea(Ed.model, t.redraw, { polygon: t.pts }) : addYardArea(Ed.model, { surface: t.surface, polygon: t.pts, ...(t.name ? { name: t.name } : {}) });
  else r = t.redraw ? setYardLine(Ed.model, t.redraw, { points: t.pts }) : addYardLine(Ed.model, { kind: t.kind, points: t.pts, ...(t.name ? { name: t.name } : {}), ...(t.kind === 'retaining' ? { high: t.high, drop: t.drop } : {}) });
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return true; }
  yd().tool = null;
  $('preview').classList.remove('placing');
  $('ydName').value = '';
  commit(r.model);
  setStatus(`${t.type === 'boundary' ? 'The yard\'s outline' : (r.area || r.line || r.point)?.id ?? 'It'} ${t.redraw ? 'redrawn' : 'added'} (not saved yet)`);
  return true;
}
export function setElevation(v) {
  const t = String(v).trim(), r = setYard(Ed.model, { elevation: t === '' ? null : Number(t) });
  if (r.report.errors.length) { msg(r.report.errors.join('; ')); return; }
  commit(r.model); msg('Ground height set (not saved yet)');
}

// ---- ground heights from Lantmäteriet (decision 311) ----
// The yard's outline goes to Plantern's server, which fetches the 1 m ground model with the Geotorget login it keeps and
// answers with yard.terrain; the page sets it as one undo step (Save keeps it).
async function lmLogin() { try { const r = await fetch('api/terrain/login'); return r.ok ? await r.json() : { set: false }; } catch { return { set: false }; } }
export async function renderTerrain() {
  const t = Ed.model.yard?.terrain, server = !!Ed.house?.server;
  $('ydTerrainState').textContent = t ? `: ${t.cols} × ${t.rows} m loaded (${t.source})` : server ? ': none yet. Fetching needs the yard\'s outline and the house\'s map position.' : ': none yet; fetching needs Plantern\'s server.';
  $('ydLmFetch').hidden = !server; $('ydLmRemove').hidden = !t;
  $('ydLmFetch').textContent = t ? 'Fetch them again' : 'Fetch ground heights';
  if (!server) { $('ydLmLogin').hidden = $('ydLmSave').hidden = $('ydLmForget').hidden = true; return; }
  const l = await lmLogin();
  $('ydLmLogin').hidden = $('ydLmSave').hidden = l.set; $('ydLmForget').hidden = !l.set;
  if (l.set) $('ydLmForget').title = `Forget the saved login (${l.user})`;
}
export async function saveLmLogin() {
  const user = $('ydLmUser').value.trim(), password = $('ydLmPass').value;
  if (!user || !password) { msg('Type the Geotorget user name and password first.'); return; }
  const r = await fetch('api/terrain/login', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }) });
  const b = await r.json().catch(() => ({}));
  $('ydLmPass').value = '';
  if (!r.ok) { msg(`Not saved: ${b.error || r.status}`); return; }
  msg('Login saved on Plantern\'s server.'); renderTerrain();
}
export async function forgetLmLogin() { await fetch('api/terrain/login', { method: 'DELETE' }); msg('Login forgotten.'); renderTerrain(); }
export async function fetchTerrainHeights() {
  const y = Ed.model.yard;
  if (!(y?.boundary?.length >= 3)) { msg('Draw the yard\'s outline first: the heights are fetched for it.'); return; }
  if (!Ed.model.site?.georef?.origin) { msg('The house needs its map position first (the Place the house section).'); return; }
  const l = await lmLogin();
  if (!l.set) { $('ydLmLogin').hidden = $('ydLmSave').hidden = false; msg('Save your Geotorget login first (Lantmäteriet\'s free ground model needs one).'); return; }
  msg('Fetching from Lantmäteriet…'); $('ydLmFetch').disabled = true;
  try {
    const res = await fetch('api/terrain/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site: Ed.model.site, boundary: y.boundary }) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { msg(`Not fetched: ${b.error || res.status}`); return; }
    const r = setYard(Ed.model, { terrain: b.terrain });
    if (r.report.errors.length) { msg(r.report.errors.join('; ')); return; }
    commit(r.model);
    msg(`Ground heights loaded: ${b.terrain.cols} × ${b.terrain.rows} m (not saved yet). Your measured heights still decide the ground where they are.`);
  } catch (e) { msg(`Not fetched: ${e.message}`); }
  finally { $('ydLmFetch').disabled = false; }
}
export function removeTerrain() {
  const r = setYard(Ed.model, { terrain: null });
  if (r.report.errors.length) { msg(r.report.errors.join('; ')); return; }
  commit(r.model); msg('Ground heights removed (not saved yet)');
}

// ---- dragging corners (Y6) ----
// One shape at a time shows handles: its corners (drag to move, snapping like drawing, Alt: free; Shift-click: remove) and the
// middles of its sides (drag one to add a corner there). Each drag is one undo step.
const shapeOf = (type, id) => { const y = Ed.model.yard || {}; return type === 'boundary' ? y.boundary : type === 'area' ? y.areas?.find(a => a.id === id)?.polygon : y.lines?.find(l => l.id === id)?.points; };
export function editCorners(type, id = null) {
  if (!onYardLevel()) { msg('The yard is drawn on the ground floor: switch to it first.'); return; }
  stopDraw();
  const s = yd();
  if (s.edit && s.edit.type === type && s.edit.id === id) { stopCorners('Done'); return; }
  if (!shapeOf(type, id)) return;
  s.edit = { type, id };
  setStatus(`${type === 'boundary' ? 'The yard\'s outline' : id}: drag a corner (snaps; Alt: free), drag a side's middle to add a corner, Shift-click a corner to remove it · Esc or ✥ again: done`);
  draw();
}
export function stopCorners(m = '') { if (!Ed.yd?.edit) return false; Ed.yd.edit = null; if (m) setStatus(m); draw(); return true; }
const saveShape = (type, id, pts, what) => {
  const r = type === 'boundary' ? setYard(Ed.model, { boundary: pts }) : type === 'area' ? setYardArea(Ed.model, id, { polygon: pts }) : setYardLine(Ed.model, id, { points: pts });
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); draw(); return; }
  commit(r.model); setStatus(`${what} (not saved yet) · Esc: done`);
};
/** Pointer down on a corner or side handle (listened to before the plan's own drag and pan). True when it is ours. */
export function cornerDown(e) {
  const h = e.button === 0 && e.target.closest?.('[data-ydc],[data-ydm]'), ed = Ed.yd?.edit;
  if (!h || !ed) return false;
  const pts0 = shapeOf(ed.type, ed.id); if (!pts0) return false;
  e.preventDefault(); e.stopPropagation();
  const closed = ed.type !== 'line', isMid = h.dataset.ydm !== undefined;
  let pts = pts0.map(p => [...p]), i = Number(isMid ? h.dataset.ydm : h.dataset.ydc);
  if (!isMid && e.shiftKey) {                                       // remove a corner
    if (pts.length <= (closed ? 3 : 2)) { setStatus(`It needs at least ${closed ? 3 : 2} points`); return true; }
    pts.splice(i, 1); saveShape(ed.type, ed.id, pts, 'Corner removed'); Ed.suppressClick = true; setTimeout(() => { Ed.suppressClick = false; }, 350); return true;
  }
  if (isMid) { const a = pts[i], b = pts[(i + 1) % pts.length]; pts.splice(i + 1, 0, [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)]); i += 1; }
  let moved = false, frame = 0;
  const move = ev => {
    const { p, k } = planPointOf(ev), hit = ev.altKey ? null : nearestPoint(p, Ed.snaps || [], 14 * k);
    pts[i] = (hit ? hit.pos : p).map(v => Math.round(v)); moved = true;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { Ed.yd.dragPts = pts; draw(); });
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    cancelAnimationFrame(frame); Ed.yd.dragPts = null;
    Ed.suppressClick = true; setTimeout(() => { Ed.suppressClick = false; }, 350);
    if (!moved) { draw(); return; }
    saveShape(ed.type, ed.id, pts, isMid ? 'Corner added' : 'Corner moved');
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  return true;
}
function cornersSvg(fs) {
  const ed = Ed.yd?.edit; if (!ed) return '';
  const pts0 = Ed.yd.dragPts || shapeOf(ed.type, ed.id); if (!pts0) return '';
  const closed = ed.type !== 'line';
  let out = `<${closed ? 'polygon' : 'polyline'} points="${pts(pts0)}" fill="none" stroke="#ffb454" stroke-width="${fs / 6}" pointer-events="none"/>`;
  const n = closed ? pts0.length : pts0.length - 1;
  for (let i = 0; i < n; i++) { const a = pts0[i], b = pts0[(i + 1) % pts0.length], [x, y] = toSvg([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); out += `<circle data-ydm="${i}" cx="${x}" cy="${y}" r="${fs * 0.3}" fill="#14161a" stroke="#ffb454" stroke-width="${fs / 10}" style="cursor:copy"><title>Drag to add a corner here</title></circle>`; }
  pts0.forEach((p, i) => { const [x, y] = toSvg(p); out += `<circle data-ydc="${i}" cx="${x}" cy="${y}" r="${fs * 0.45}" fill="#ffb454" stroke="#14161a" stroke-width="${fs / 10}" style="cursor:grab"><title>Drag to move (Alt: no snapping) · Shift-click: remove</title></circle>`; });
  return out;
}

// ---- importing a map file (GeoJSON; decision 308) ----
const IMPORT_LINES = ['edging', 'fence', 'picket', 'hedge', 'stonewall'];
/** Read a GeoJSON file and list its shapes for picking; nothing changes until "Add". */
export async function importGeoFile(file) {
  if (!file) return;
  let text;
  try { text = await file.text(); } catch { msg('The file could not be read'); return; }
  const r = readGeoJson(text, Ed.model.site);
  $('ydGeo').value = '';
  if (!r.shapes.length) { yd().imp = null; renderImport(); msg(r.warnings.join(' ') || 'No shapes in the file'); return; }
  yd().imp = { ...r, file: file.name, shift: [...(Ed.model.yard?.importShift || [0, 0])], on: new Set(r.shapes.filter(s => !s.skip && (s.geom !== 'point' || s.z !== undefined)).map(s => s.n)) };
  renderImport(); draw();
  msg(`${r.shapes.length} shape${r.shapes.length > 1 ? 's' : ''} in ${file.name} (${r.crs === 'WGS84' ? 'GPS coordinates' : 'SWEREF 99 TM'}), shown dashed in the plan. ${r.warnings.join(' ')}`);
}
function renderImport() {
  const box = $('ydImport'), imp = yd().imp;
  box.hidden = !imp;
  if (!imp) { box.innerHTML = ''; return; }
  const surfOpts = cur => YARD_SURFACES.map(s => `<option value="${s}"${s === cur ? ' selected' : ''}>${SURFACE_LABEL[s]}</option>`).join('');
  const lineOpts = cur => IMPORT_LINES.map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${LINE_LABEL[k]}</option>`).join('');
  box.innerHTML = `<p class="help">From <b>${esc(imp.file)}</b>: tick what to add, pick what each area is. Areas are added on top of the yard's areas.</p>`
    + imp.shapes.map(s => `<div class="arow"><label><input type="checkbox" data-ydimp="${s.n}"${imp.on.has(s.n) ? ' checked' : ''}${s.geom === 'point' && s.z === undefined ? ' disabled' : ''}> <b>${esc(s.name)}</b></label>`
      + ` <small>${s.geom === 'area' ? `area, ${s.points.length} corners` : s.geom === 'line' ? `line, ${s.points.length} points` : s.z !== undefined ? `ground height ${(s.z / 1000).toFixed(2)} m` : 'point without a height (skipped)'}${s.note ? `, ${esc(s.note)}` : ''}</small>`
      + (s.geom === 'area' ? ` <select data-ydimpsurf="${s.n}" aria-label="Surface of ${esc(s.name)}">${surfOpts(s.surface)}</select>` : s.geom === 'line' ? ` <select data-ydimpkind="${s.n}" aria-label="Kind of ${esc(s.name)}">${lineOpts(s.kind)}</select>` : '') + '</div>').join('')
    + `<div class="grid2"><label>Move it east <small>mm along the plan's x (− west), for a file that sits off, e.g. a robot mower's map</small><input id="ydImpDx" inputmode="numeric" value="${imp.shift[0]}"></label>`
    + `<label>Move it north <small>mm along the plan's y (− south)</small><input id="ydImpDy" inputmode="numeric" value="${imp.shift[1]}"></label></div>`
    + `<div class="row btns"><button type="button" id="ydImpAdd">Add the ticked shapes</button> <button type="button" id="ydImpCancel">Cancel</button></div>`;
  box.querySelectorAll('[data-ydimp]').forEach(c => (c.onchange = () => { const n = Number(c.dataset.ydimp); c.checked ? imp.on.add(n) : imp.on.delete(n); draw(); }));
  box.querySelectorAll('[data-ydimpsurf]').forEach(s => (s.onchange = () => { imp.shapes[Number(s.dataset.ydimpsurf)].surface = s.value; }));
  box.querySelectorAll('[data-ydimpkind]').forEach(s => (s.onchange = () => { imp.shapes[Number(s.dataset.ydimpkind)].kind = s.value; }));
  for (const [k, i] of [['ydImpDx', 0], ['ydImpDy', 1]]) $(k).oninput = e => { const v = Number(String(e.target.value).replace('−', '-').trim()); if (Number.isFinite(v)) { imp.shift[i] = v; draw(); } };
  $('ydImpCancel').onclick = () => { yd().imp = null; renderImport(); draw(); msg('Import cancelled'); };
  $('ydImpAdd').onclick = addImported;
}
/** Add the ticked shapes: areas, lines and ground heights, as one undo step. */
function addImported() {
  const imp = yd().imp; if (!imp) return;
  let m = Ed.model, n = 0;
  const [dx, dy] = imp.shift, mv = p => [Math.round(p[0] + dx), Math.round(p[1] + dy)];
  for (const s0 of imp.shapes) {
    if (!imp.on.has(s0.n)) continue;
    const s = { ...s0, points: s0.points.map(mv) };
    const name = s.name.startsWith('Shape ') ? undefined : s.name;
    const r = s.geom === 'area' ? addYardArea(m, { surface: s.surface || 'grass', polygon: s.points, ...(name ? { name } : {}) })
      : s.geom === 'line' ? addYardLine(m, { kind: s.kind || 'edging', points: s.points, ...(name ? { name } : {}) })
      : s.z !== undefined ? addYardGround(m, { pos: s.points[0], z: s.z, ...(name ? { name } : {}) }) : null;
    if (!r) continue;
    if (r.report.errors.length) { msg(`${s.name}: ${r.report.errors.join('; ')} (nothing added)`); return; }
    m = r.model; n++;
  }
  if (!n) { msg('Nothing ticked'); return; }
  // the shift is kept with the yard: the next file from the same source (the same mower) starts from it
  const ks = setYard(m, { importShift: imp.shift }); if (!ks.report.errors.length) m = ks.model;
  yd().imp = null; renderImport();
  commit(m); msg(`${n} shape${n > 1 ? 's' : ''} added from the file (not saved yet)`);
}
/** The shapes of a file being imported, dashed in the plan (the ticked ones bolder). */
function importSvg(fs) {
  const imp = Ed.yd?.imp; if (!imp) return '';
  const [dx, dy] = imp.shift, mv = p => [p[0] + dx, p[1] + dy];
  return '<g pointer-events="none">' + imp.shapes.map(s0 => {
    const s = { ...s0, points: s0.points.map(mv) };
    const on = imp.on.has(s.n), st = `stroke="#4fd1e8" stroke-width="${fs / (on ? 5 : 10)}" stroke-dasharray="${fs / 2} ${fs / 3}" stroke-opacity="${on ? 1 : 0.5}"`;
    if (s.geom === 'point') { const [x, y] = toSvg(s.points[0]); return `<circle cx="${x}" cy="${y}" r="${fs * 0.35}" fill="none" ${st}/>`; }
    return `<${s.geom === 'area' ? 'polygon' : 'polyline'} points="${pts(s.points)}" fill="${s.geom === 'area' && on ? '#4fd1e822' : 'none'}" ${st}/>`;
  }).join('') + '</g>';
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
  for (const g of y.ground || []) { if (!Array.isArray(g.pos)) continue; const [x, yy] = toSvg(g.pos); out += `<g pointer-events="none"><path d="M${x - fs * 0.4} ${yy}H${x + fs * 0.4}M${x} ${yy - fs * 0.4}V${yy + fs * 0.4}" stroke="#e8e2d0" stroke-width="${fs / 12}"/><text x="${x + fs * 0.5}" y="${yy - fs * 0.3}" font-size="${fs * 0.9}" fill="#e8e2d0">${g.z >= 0 ? '+' : '−'}${(Math.abs(g.z) / 1000).toFixed(2)}</text></g>`; }
  for (const l of y.lines || []) out += `<polyline points="${pts(l.points)}" fill="none" stroke="${P.yardLine[l.kind] || P.yardLine.edging}" stroke-width="${fs / (l.kind === 'hedge' ? 2 : 5)}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"${l.kind === 'fence' ? ` stroke-dasharray="${fs / 2} ${fs / 3}"` : ''}/>`;
  return out;
}
/** On top of the plan while drawing: the points so far, joined. */
export function yardDraftSvg(fs) {
  const t = Ed.yd?.tool, imp = onYardLevel() ? importSvg(fs) + cornersSvg(fs) : '';
  if (!t || !t.pts.length) return imp;
  const closed = t.type !== 'line' && t.pts.length >= 3;
  return `<g pointer-events="none"><${closed ? 'polygon' : 'polyline'} points="${pts(t.pts)}" fill="${closed ? '#ffb45433' : 'none'}" stroke="#ffb454" stroke-width="${fs / 6}" stroke-dasharray="${fs / 2} ${fs / 3}"/>`
    + t.pts.map(p => { const [x, y] = toSvg(p); return `<circle cx="${x}" cy="${y}" r="${fs * 0.35}" fill="#ffb454" stroke="#14161a" stroke-width="${fs / 10}"/>`; }).join('') + '</g>' + imp;
}
