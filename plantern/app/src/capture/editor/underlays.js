// Editor page: the photo or drawing under the plan (docs/plans/underlay.md UL5, UL6; src/model/underlays.js).
// The section lists the level's underlays, adds one (the file is uploaded into the house folder first) and fits it: each point
// is a pixel of the image, clicked on the image, and the plan point it shows, clicked on the plan (snapping to the level's
// points, Alt: a free point) or typed. The draft points are applied with Apply, as one undo step; the plan shows the image fitted
// to the draft while it is edited, with every point's residual.
// Placing by hand (UL10): *Move / turn / scale* puts handles on the image in the plan (drag it, the round handle turns it, the
// corner handle scales it, or type the scale and the turn); that is the placement while fewer than two points fit it. Once it lies
// roughly right, a point's pixel can be clicked on the photo in the plan itself (pixelAt), then its plan point.

import { toSvg } from '../../render2d/coords.js';
import { underlayTransform } from '../../render2d/plan.js';
import { nearestPoint } from '../../tools/measure-core.js';
import { placeOf, pixelAt, imageCorners, apply, movePlace, turnPlace, scalePlace } from '../../geometry/underlay.js';
import { northAngleOf } from '../../model/orientation.js';
import { placedUnderlays, resolveUnderlay, UNDERLAY_DIR, UNDERLAY_DEFAULT_OPACITY, UNDERLAY_RESIDUAL_WARN } from '../../model/underlays.js';
import { addUnderlay, setUnderlay, deleteUnderlay } from '../../edit/ops.js';
import { underlayFileName, readPlanPoint, formatPlanPoint } from '../underlay-form.js';
import { $, commit, esc, level } from './core.js';
import { setStatus } from './session.js';
import { Ed } from './state.js';
import { draw } from './plan-draw.js';

const ul = () => (Ed.ul ??= { id: null, points: null, place: null, pick: null, hand: false, drag: null, shown: true, opacity: null });
const editing = () => (Ed.model.underlays || []).find(u => u.id === ul().id) || null;
const hrefOf = u => (Ed.house?.baseUrl ?? '') + u.file;
const snapsHere = () => Ed.snaps || [];

/** The section: the level's underlays, and the point editor for the one being fitted. */
export function renderUnderlays() {
  const s = ul(), here = (Ed.model.underlays || []).filter(u => u.level === Ed.levelId);
  if (s.id && !editing()) closeFit();
  $('ulCount').textContent = here.length ? `(${here.length})` : '';
  $('ulList').innerHTML = here.map(u => {
    const r = resolveUnderlay(Ed.model, u, Ed.curGeo), worst = r.fit?.residuals.length ? Math.max(...r.fit.residuals) : null;
    const state = !r.fit ? `<span style="color:var(--warn)">not placed: drag it into place or give it two points</span>`
      : r.by === 'place' ? `placed by hand · ${r.fit.scale.toFixed(1)} mm per pixel · turned ${r.fit.rotationDeg.toFixed(1)}°`
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
    const r = addUnderlay(Ed.model, { name, file, level: Ed.levelId, size, opacity: UNDERLAY_DEFAULT_OPACITY, place: firstPlace(size) });
    if (r.report.errors.length) return msg(r.report.errors.join('; '));
    commit(r.model);
    $('ulFile').value = ''; $('ulName').value = '';
    msg('Uploaded and laid over the house, with the top of the image as north. Drag it roughly into place, then fit it by points; Save keeps it.');
    openFit(r.underlay.id);
    setHand(true);
  } catch (e) { msg(`Not uploaded: ${e.message}`); }
}
const asBase64 = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',', 2)[1]); r.onerror = () => bad(r.error); r.readAsDataURL(f); });
const pixelSize = f => new Promise((ok, bad) => { const url = URL.createObjectURL(f), i = new Image(); i.onload = () => { URL.revokeObjectURL(url); ok([i.naturalWidth, i.naturalHeight]); }; i.onerror = () => { URL.revokeObjectURL(url); bad(new Error('the browser cannot read this image')); }; i.src = url; });

/**
 * Where a new image starts: over the middle of the level, about three times as wide as the house (a drone photo shows the yard
 * too), turned so that the top of the image is true north (a photo taken straight down is usually shot that way).
 */
function firstPlace(size) {
  const pts = (level()?.rooms || []).flatMap(r => r.polygon);
  if (!pts.length) return { at: [0, 0], scale: 10, rotation: northAngleOf(Ed.model) };
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), w = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1000);
  return { at: [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2)], scale: Math.round(w * 3 / size[0] * 100) / 100, rotation: northAngleOf(Ed.model) };
}

// ---- fitting: the draft points ----
export function openFit(id) {
  const u = (Ed.model.underlays || []).find(x => x.id === id);
  if (!u) return;
  const r = resolveUnderlay(Ed.model, u, Ed.curGeo);
  const place = u.place ? structuredClone(u.place) : r.fit ? placeOf(r.fit.matrix, u.size) : firstPlace(u.size);
  Object.assign(ul(), { id, points: structuredClone(u.points), place, pick: null, hand: false, drag: null, opacity: u.opacity ?? UNDERLAY_DEFAULT_OPACITY });
  $('ulImg').src = hrefOf(u);
  renderUnderlays(); draw();
}
export function closeFit() { Object.assign(ul(), { id: null, points: null, place: null, pick: null, hand: false, drag: null }); stopPick(); $('ulFit').hidden = true; $('preview').classList.remove('ulhand'); }

/** The draft as an underlay: what the plan shows while fitting. */
const draftUnderlay = () => { const u = editing(); return u && { ...u, points: ul().points, place: ul().place, opacity: ul().opacity }; };
const draftFit = () => { const d = draftUnderlay(); return d ? resolveUnderlay(Ed.model, d, Ed.curGeo) : null; };

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
  const byPoints = r.by === 'points';
  $('ulHand').disabled = byPoints;
  $('ulHand').classList.toggle('on', s.hand && !byPoints);
  $('ulHand').title = byPoints ? 'The points decide where it lies: remove points (fewer than two) to place it by hand' : 'Drag the image in the plan, turn it with the round handle, scale it with the corner handle';
  $('ulScale').value = s.place?.scale ?? ''; $('ulRot').value = s.place?.rotation ?? '';
  $('ulScale').disabled = $('ulRot').disabled = byPoints;
  $('ulFitSum').textContent = s.points.length < 2 ? `${r.fit ? 'Placed by hand. ' : ''}Two points fit it exactly; three or more show how far each is off.`
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
  const s = ul(), r = setUnderlay(Ed.model, s.id, { points: s.points, place: s.place, opacity: s.opacity });
  if (r.report.errors.length) { $('ulMsg').textContent = r.report.errors.join('; '); return; }
  commit(r.model);
  $('ulMsg').textContent = 'Applied (not saved yet).';
}
export function revertFit() { if (ul().id) openFit(ul().id); }
export function setDraftOpacity(v) { ul().opacity = Number(v); $('ulOpTxt').textContent = `${Math.round(Number(v) * 100)} %`; draw(); }
export function setShown(on) { ul().shown = on; draw(); }

// ---- placing by hand ----
export function setHand(on) {
  const s = ul();
  if (!editing()) return;
  s.hand = on && draftFit()?.by !== 'points';
  $('preview').classList.toggle('ulhand', s.hand);
  if (s.hand) setStatus('Drag the image to move it · the round handle turns it · the corner handle scales it (Shift-drag also turns)');
  renderFit(); draw();
}
export const toggleHand = () => setHand(!ul().hand);
export function typedPlace() {
  const s = ul(), sc = Number($('ulScale').value.replace(',', '.')), rot = Number($('ulRot').value.replace(',', '.'));
  if (!s.place) return;
  if (sc > 0) s.place = { ...s.place, scale: sc };
  if (Number.isFinite(rot) && $('ulRot').value.trim() !== '') s.place = { ...s.place, rotation: rot };
  renderFit(); draw();
}
const planPointOf = e => { const svg = $('preview'), m = svg.getScreenCTM(), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(m.inverse()); return [q.x, -q.y]; };

/** Pointer down on a hand handle (listened to before the plan's own drag and pan). True when it is ours. */
export function handDown(e) {
  const s = ul(), h = s.hand && !s.pick && e.button === 0 && e.target.closest?.('[data-ulh]');   // while a point is picked, clicks are for that
  if (!h || !s.place) return false;
  e.preventDefault(); e.stopPropagation();
  const kind = h.dataset.ulh === 'move' && e.shiftKey ? 'turn' : h.dataset.ulh;
  s.drag = { kind, from: s.place, start: planPointOf(e), moved: false };
  const move = ev => {
    if (!s.drag) return;
    const now = planPointOf(ev), f = { move: movePlace, turn: turnPlace, scale: scalePlace }[s.drag.kind];
    s.place = f(s.drag.from, s.drag.start, now); s.drag.moved = true;
    cancelAnimationFrame(s.frame); s.frame = requestAnimationFrame(() => { draw(); renderFit(); });
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (s.drag?.moved) { Ed.suppressClick = true; setTimeout(() => { Ed.suppressClick = false; }, 350); }
    s.drag = null; renderFit(); draw();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  return true;
}

// ---- picking: a spot on the image, or a point on the plan ----
function startPick(row, what) {
  ul().pick = { row, what };
  $('preview').classList.toggle('placing', what === 'plan');
  $('ulImgBox').classList.toggle('picking', what === 'image');
  setStatus(what === 'image' ? `Point ${row + 1}: click the spot on the photo${draftFit()?.fit ? ' in the plan (or on the small image)' : ' (the small image)'} (Esc: cancel)` : `Point ${row + 1}: now the matching point of the model on the plan; it snaps to corners, Alt for a free point (Esc: cancel)`);
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
/** Is the next plan click for the fit: a plan point, or a pixel clicked on the photo where it lies in the plan. */
export const pickingPlan = () => Ed.ul?.pick?.what === 'plan' || (Ed.ul?.pick?.what === 'image' && !!draftFit()?.fit);

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
  if (s.pick?.what === 'image') {                                 // the photo in the plan: the pixel under the pointer
    const u = editing(), px = pixelAt(draftFit().fit.matrix, planPointOf(e)), row = s.pick.row;
    if (!px || px[0] < 0 || px[1] < 0 || px[0] > u.size[0] || px[1] > u.size[1]) { setStatus('That is outside the photo: click on the photo'); return; }
    s.points[row].image = px.map(v => Math.round(v));
    stopPick(); startPick(row, 'plan'); draw();
    return;
  }
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
  let i = 0, out = handlesSvg(r, fs);
  // each point's pixel where the photo shows it now, joined to its plan point: how far apart they are is what the fit closes
  if (r.fit) draft.points.forEach((p, n) => { const [x, y] = toSvg(apply(r.fit.matrix, p.image)); out += `<g pointer-events="none"><rect x="${x - fs * 0.3}" y="${y - fs * 0.3}" width="${fs * 0.6}" height="${fs * 0.6}" fill="none" stroke="#4cc38a" stroke-width="${fs / 8}"/></g>`; });
  return out + draft.points.map((p, n) => {
    const pair = Array.isArray(p.plan) || r.pairs.some(q => q.ref === p.plan) ? r.pairs[i++] : null;
    if (!pair) return '';
    const [x, y] = toSvg(pair.plan);
    return `<g pointer-events="none"><circle cx="${x}" cy="${y}" r="${fs * 0.45}" fill="none" stroke="#ffb454" stroke-width="${fs / 6}"/><text x="${x + fs * 0.6}" y="${y - fs * 0.6}" font-size="${fs * 0.8}" fill="#ffb454" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.25}">${n + 1}</text></g>`;
  }).join('');
}

/**
 * The hand handles, while placing by hand: the image's outline (drag it), and near its middle a round turn handle (up the image)
 * and a square scale handle (along it), a fixed distance on screen from the middle, so they stay in view however large the image is.
 */
function handlesSvg(r, fs) {
  const s = ul(), u = editing();
  if (!s.hand || !r.fit || r.by === 'points' || !u) return '';
  const m = r.fit.matrix, sv = imageCorners(m, u.size).map(toSvg), pts = sv.map(p => p.join(',')).join(' ');
  const mid = s.place.at, unit = (dx, dy) => { const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  const up = unit(-m.c, -m.d), along = unit(m.a, m.b), reach = fs * 5;         // the image's up (−v) and its right (+u) in the plan
  const knob = toSvg([mid[0] + up[0] * reach, mid[1] + up[1] * reach]), sq = toSvg([mid[0] + along[0] * reach, mid[1] + along[1] * reach]), [cx, cy] = toSvg(mid);
  return `<polygon data-ulh="move" points="${pts}" fill="#ffb454" fill-opacity="0.04" stroke="#ffb454" stroke-width="${fs / 8}" stroke-dasharray="${fs / 2} ${fs / 3}" style="cursor:move"><title>Drag to move the image (Shift: turn it)</title></polygon>`
    + `<line x1="${cx}" y1="${cy}" x2="${knob[0]}" y2="${knob[1]}" stroke="#ffb454" stroke-width="${fs / 8}" pointer-events="none"/>`
    + `<line x1="${cx}" y1="${cy}" x2="${sq[0]}" y2="${sq[1]}" stroke="#ffb454" stroke-width="${fs / 8}" stroke-dasharray="${fs / 3} ${fs / 4}" pointer-events="none"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${fs * 0.3}" fill="#ffb454" pointer-events="none"/>`
    + `<circle data-ulh="turn" cx="${knob[0]}" cy="${knob[1]}" r="${fs * 0.7}" fill="#ffb454" stroke="#14161a" stroke-width="${fs / 8}" style="cursor:grab"><title>Drag to turn the image about its middle (this handle points to the image's top)</title></circle>`
    + `<rect data-ulh="scale" x="${sq[0] - fs * 0.6}" y="${sq[1] - fs * 0.6}" width="${fs * 1.2}" height="${fs * 1.2}" fill="#ffb454" stroke="#14161a" stroke-width="${fs / 8}" style="cursor:ew-resize"><title>Drag towards or away from the middle to scale the image</title></rect>`;
}
