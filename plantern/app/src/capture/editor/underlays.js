// Editor page: the photo or drawing under the plan (docs/plans/underlay.md UL5, UL6; src/model/underlays.js).
// The section lists the level's underlays, adds one (the file is uploaded into the house folder first) and fits it: each point
// is a pixel of the image, clicked on the image, and the plan point it shows, clicked on the plan (snapping to the level's
// points, Alt: a free point) or typed. The draft points are applied with Apply, as one undo step; the plan shows the image fitted
// to the draft while it is edited, with every point's residual.

import { toSvg } from '../../render2d/coords.js';
import { underlayTransform } from '../../render2d/plan.js';
import { nearestPoint } from '../../tools/measure-core.js';
import { placedUnderlays, resolveUnderlay, UNDERLAY_DIR, UNDERLAY_DEFAULT_OPACITY, UNDERLAY_RESIDUAL_WARN } from '../../model/underlays.js';
import { addUnderlay, setUnderlay, deleteUnderlay } from '../../edit/ops.js';
import { underlayFileName, readPlanPoint, formatPlanPoint } from '../underlay-form.js';
import { $, commit, esc, level } from './core.js';
import { setStatus } from './session.js';
import { Ed } from './state.js';
import { draw } from './plan-draw.js';

const ul = () => (Ed.ul ??= { id: null, points: null, pick: null, shown: true, opacity: null });
const editing = () => (Ed.model.underlays || []).find(u => u.id === ul().id) || null;
const hrefOf = u => (Ed.house?.baseUrl ?? '') + u.file;
const snapsHere = () => Ed.snaps || [];

/** The section: the level's underlays, and the point editor for the one being fitted. */
export function renderUnderlays() {
  const s = ul(), here = (Ed.model.underlays || []).filter(u => u.level === Ed.levelId);
  if (s.id && !editing()) closeFit();
  $('ulCount').textContent = here.length ? `(${here.length})` : '';
  $('ulList').innerHTML = here.map(u => {
    const r = resolveUnderlay(Ed.model, u, Ed.curGeo), worst = r.fit ? Math.max(...r.fit.residuals) : null;
    const state = !r.fit ? `<span style="color:var(--warn)">not fitted: ${u.points.length < 2 ? 'needs two points' : esc(r.error || 'points missing')}</span>`
      : `${u.points.length} points · ${r.fit.scale.toFixed(1)} mm per pixel · worst point <span style="color:${worst > UNDERLAY_RESIDUAL_WARN ? 'var(--warn)' : 'var(--good, #4cc38a)'}">${Math.round(worst)} mm</span>`;
    return `<div class="arow"><span>${esc(u.name || u.id)} <small>${esc(u.file.slice(UNDERLAY_DIR.length))} · ${u.size.join(' × ')} px</small><br>${state}</span>`
      + `<button data-ulfit="${esc(u.id)}" title="Place or change its points">${s.id === u.id ? 'Fitting…' : 'Fit'}</button><button data-uldel="${esc(u.id)}" title="Remove it from the plan (the file stays in the house folder)">×</button></div>`;
  }).join('') || '<small>None on this level.</small>';
  $('ulList').querySelectorAll('[data-ulfit]').forEach(b => (b.onclick = () => openFit(b.dataset.ulfit)));
  $('ulList').querySelectorAll('[data-uldel]').forEach(b => (b.onclick = () => {
    const r = deleteUnderlay(Ed.model, b.dataset.uldel);
    if (r.report.errors.length) { $('ulMsg').textContent = r.report.errors.join('; '); return; }
    if (ul().id === b.dataset.uldel) closeFit();
    commit(r.model); setStatus('Photo removed from the plan (the file stays; not saved yet)');
  }));
  $('ulShow').checked = s.shown;
  $('ulAdd').disabled = !Ed.house?.server;
  $('ulAdd').title = Ed.house?.server ? 'Upload the file into the house folder and put it under this level' : 'Needs Plantern\'s server (the file is uploaded into the house folder)';
  renderFit();
}

// ---- adding one ----
export async function addFromFile() {
  const f = $('ulFile').files?.[0], msg = t => { $('ulMsg').textContent = t; };
  if (!f) return msg('Choose a PNG, JPEG or WebP file first.');
  if (!Ed.house?.server) return msg('Adding a photo needs Plantern\'s server: the file is uploaded into the house folder.');
  const name = $('ulName').value.trim() || f.name.replace(/\.[^.]+$/, '');
  const file = underlayFileName(name, f.name, (Ed.model.underlays || []).map(u => u.file));
  if (!file) return msg('Only PNG, JPEG and WebP files can lie under the plan.');
  msg('Uploading…');
  try {
    const [data, size] = await Promise.all([asBase64(f), pixelSize(f)]);
    const res = await fetch(`api/houses/${encodeURIComponent(Ed.house.id)}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: file, data }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return msg(`Not uploaded: ${body.error || res.status}`);
    const r = addUnderlay(Ed.model, { name, file, level: Ed.levelId, size, opacity: UNDERLAY_DEFAULT_OPACITY });
    if (r.report.errors.length) return msg(r.report.errors.join('; '));
    commit(r.model);
    $('ulFile').value = ''; $('ulName').value = '';
    msg('Uploaded. Now place at least two points (three or more show how well it fits), then Save.');
    openFit(r.underlay.id);
  } catch (e) { msg(`Not uploaded: ${e.message}`); }
}
const asBase64 = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',', 2)[1]); r.onerror = () => bad(r.error); r.readAsDataURL(f); });
const pixelSize = f => new Promise((ok, bad) => { const url = URL.createObjectURL(f), i = new Image(); i.onload = () => { URL.revokeObjectURL(url); ok([i.naturalWidth, i.naturalHeight]); }; i.onerror = () => { URL.revokeObjectURL(url); bad(new Error('the browser cannot read this image')); }; i.src = url; });

// ---- fitting: the draft points ----
export function openFit(id) {
  const u = (Ed.model.underlays || []).find(x => x.id === id);
  if (!u) return;
  Object.assign(ul(), { id, points: structuredClone(u.points), pick: null, opacity: u.opacity ?? UNDERLAY_DEFAULT_OPACITY });
  $('ulImg').src = hrefOf(u);
  renderUnderlays(); draw();
}
export function closeFit() { Object.assign(ul(), { id: null, points: null, pick: null }); stopPick(); $('ulFit').hidden = true; }

/** The draft as an underlay: what the plan shows while fitting. */
const draftUnderlay = () => { const u = editing(); return u && { ...u, points: ul().points, opacity: ul().opacity }; };

function renderFit() {
  const s = ul(), u = editing();
  $('ulFit').hidden = !u;
  if (!u) return;
  $('ulFitName').textContent = u.name || u.id;
  const r = resolveUnderlay(Ed.model, draftUnderlay(), Ed.curGeo);
  const res = new Map(r.fit ? r.pairs.map((p, i) => [p, r.fit.residuals[i]]) : []);
  let k = 0;
  $('ulPts').innerHTML = s.points.map((p, i) => {
    const pair = Array.isArray(p.plan) || r.pairs.some(q => q.ref === p.plan) ? r.pairs[k++] : null, d = pair ? res.get(pair) : undefined;
    const picking = w => (s.pick?.row === i && s.pick.what === w ? ' class="on"' : '');
    return `<tr><td>${i + 1}</td>`
      + `<td><input data-u="${i}" value="${p.image.map(Math.round).join(', ')}" size="9" aria-label="Pixel of point ${i + 1}"><button data-pickimg="${i}"${picking('image')} title="Click the spot on the image">◎</button></td>`
      + `<td><input data-p="${i}" value="${esc(formatPlanPoint(p.plan))}" size="14" aria-label="Plan point of point ${i + 1}"><button data-pickplan="${i}"${picking('plan')} title="Click the point on the plan (snaps to corners; Alt: a free point)">◎</button></td>`
      + `<td>${d === undefined ? (pair ? '' : '<span style="color:var(--warn)">?</span>') : `<span style="color:${d > UNDERLAY_RESIDUAL_WARN ? 'var(--warn)' : 'inherit'}">${Math.round(d)} mm</span>`}</td>`
      + `<td><button data-ulrm="${i}" title="Remove this point">×</button></td></tr>`;
  }).join('');
  $('ulFitSum').textContent = s.points.length < 2 ? 'Two points place it; three or more show how far each is off.'
    : !r.fit ? `Cannot fit: ${r.error || `${r.missing.join(', ')} not found on this level`}`
    : `${r.fit.scale.toFixed(2)} mm per pixel · turned ${r.fit.rotationDeg.toFixed(1)}°${r.fit.mirrored ? ' · ⚠ the points fit a mirrored image better: are they in the right order?' : ''}`;
  $('ulOpacity').value = s.opacity;
  $('ulOpTxt').textContent = `${Math.round(s.opacity * 100)} %`;
  $('ulPts').querySelectorAll('[data-u]').forEach(inp => (inp.onchange = () => {
    const v = inp.value.split(/[ ,;]+/).map(Number);
    if (v.length === 2 && v.every(Number.isFinite)) s.points[inp.dataset.u].image = v;
    renderFit(); draw();
  }));
  $('ulPts').querySelectorAll('[data-p]').forEach(inp => (inp.onchange = () => {
    const v = readPlanPoint(inp.value);
    if (v !== null) s.points[inp.dataset.p].plan = v;
    renderFit(); draw();
  }));
  $('ulPts').querySelectorAll('[data-pickimg]').forEach(b => (b.onclick = () => startPick(Number(b.dataset.pickimg), 'image')));
  $('ulPts').querySelectorAll('[data-pickplan]').forEach(b => (b.onclick = () => startPick(Number(b.dataset.pickplan), 'plan')));
  $('ulPts').querySelectorAll('[data-ulrm]').forEach(b => (b.onclick = () => { s.points.splice(Number(b.dataset.ulrm), 1); renderFit(); draw(); }));
  drawImageMarks();
}

export function addPoint() {
  const s = ul(), u = editing();
  if (!u) return;
  s.points.push({ image: [Math.round(u.size[0] / 2), Math.round(u.size[1] / 2)], plan: [0, 0] });
  renderFit();
  startPick(s.points.length - 1, 'image');
}
export function applyFit() {
  const s = ul(), r = setUnderlay(Ed.model, s.id, { points: s.points, opacity: s.opacity });
  if (r.report.errors.length) { $('ulMsg').textContent = r.report.errors.join('; '); return; }
  commit(r.model);
  $('ulMsg').textContent = 'Applied (not saved yet).';
}
export function revertFit() { if (ul().id) openFit(ul().id); }
export function setDraftOpacity(v) { ul().opacity = Number(v); $('ulOpTxt').textContent = `${Math.round(Number(v) * 100)} %`; draw(); }
export function setShown(on) { ul().shown = on; draw(); }

// ---- picking: a spot on the image, or a point on the plan ----
function startPick(row, what) {
  ul().pick = { row, what };
  $('preview').classList.toggle('placing', what === 'plan');
  $('ulImgBox').classList.toggle('picking', what === 'image');
  setStatus(what === 'image' ? `Point ${row + 1}: click the spot on the image (Esc: cancel)` : `Point ${row + 1}: click the same spot on the plan; it snaps to corners, Alt for a free point (Esc: cancel)`);
  renderFit();
}
export function stopPick(msg = '') {
  if (!Ed.ul?.pick) return false;
  ul().pick = null;
  $('preview').classList.remove('placing');
  $('ulImgBox').classList.remove('picking');
  if (msg) setStatus(msg);
  renderFit();
  return true;
}
export const pickingPlan = () => Ed.ul?.pick?.what === 'plan';

/** A click on the image while a point waits for its pixel. */
export function imageClick(e) {
  const s = ul(), u = editing(), img = $('ulImg');
  if (!u || s.pick?.what !== 'image') return;
  const b = img.getBoundingClientRect();
  s.points[s.pick.row].image = [Math.round((e.clientX - b.left) / b.width * u.size[0]), Math.round((e.clientY - b.top) / b.height * u.size[1])];
  const row = s.pick.row;
  stopPick();
  startPick(row, 'plan');                                          // then the same spot on the plan
}

/** A click on the plan while a point waits for its plan point: the nearest point of this level (a ref), Alt: where clicked. */
export function planClick(e) {
  const s = ul();
  const svg = $('preview'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(m.inverse()), p = [q.x, -q.y], k = 1 / Math.abs(m.a);
  const hit = e.altKey ? null : nearestPoint(p, snapsHere(), 14 * k), row = s.pick.row;
  s.points[row].plan = hit ? hit.ref : p.map(v => Math.round(v));
  stopPick(hit ? `Point ${row + 1} is ${hit.ref}` : `Point ${row + 1} is a free point`);
  draw();
}

/** The image's own marks: each point's pixel, numbered. */
function drawImageMarks() {
  const s = ul(), u = editing(), g = $('ulMarks');
  if (!u || !g) return;
  g.setAttribute('viewBox', `0 0 ${u.size[0]} ${u.size[1]}`);
  const r = Math.max(u.size[0], u.size[1]) / 70;
  g.innerHTML = s.points.map((p, i) => `<circle cx="${p.image[0]}" cy="${p.image[1]}" r="${r}" fill="none" stroke="#ffb454" stroke-width="${r / 3}"/><text x="${p.image[0] + r * 1.3}" y="${p.image[1] - r * 1.3}" font-size="${r * 2.4}" fill="#ffb454" paint-order="stroke" stroke="#14161a" stroke-width="${r / 2}">${i + 1}</text>`).join('');
}

// ---- in the plan ----
/** The SVG for the plan: the level's underlays (the one being fitted as its draft), under everything. */
export function underlaysSvg() {
  const s = ul();
  if (!s.shown || !level()) return '';
  const draft = draftUnderlay(), model = draft ? { ...Ed.model, underlays: Ed.model.underlays.map(u => (u.id === draft.id ? draft : u)) } : Ed.model;
  return placedUnderlays(model, Ed.levelId, Ed.curGeo).map(u => `<image href="${esc(hrefOf(u))}" x="0" y="0" width="${u.size[0]}" height="${u.size[1]}" preserveAspectRatio="none" opacity="${u.opacity}" transform="${underlayTransform(u.matrix)}" pointer-events="none"/>`).join('');
}
/** On top of the plan, while fitting: each point's plan point, numbered (fs: the plan's font size). */
export function fitMarksSvg(fs) {
  const s = ul(), draft = draftUnderlay();
  if (!draft) return '';
  const r = resolveUnderlay(Ed.model, draft, Ed.curGeo);
  let i = 0;
  return draft.points.map((p, n) => {
    const pair = Array.isArray(p.plan) || r.pairs.some(q => q.ref === p.plan) ? r.pairs[i++] : null;
    if (!pair) return '';
    const [x, y] = toSvg(pair.plan);
    return `<g pointer-events="none"><circle cx="${x}" cy="${y}" r="${fs * 0.45}" fill="none" stroke="#ffb454" stroke-width="${fs / 6}"/><text x="${x + fs * 0.6}" y="${y - fs * 0.6}" font-size="${fs * 0.8}" fill="#ffb454" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.25}">${n + 1}</text></g>`;
  }).join('');
}
