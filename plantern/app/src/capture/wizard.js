// Phone wizard page: measure a room wall by wall. Logic in wizard-state.js; this wires the DOM.
// Done adds the room through the edit operations (its walls come with it) and saves the house.

import { listHouses, openHouse, houseOptions } from '../model/house.js';
import { resolveSettings } from '../model/settings.js';
import { toSvg } from '../render2d/coords.js';
import { buildLevelGeometry } from '../geometry/level.js';
import { collectSnapPointsAround, adjacentOutlines } from '../tools/snap.js';
import { startOptions, resolveStart, placeAgainstEdge, edgeWallThickness } from './start.js';
import { bearingFromHeading, headingFromBearing, northAngleOf, roundDeg } from '../model/orientation.js';
import { download } from '../export/download.js';
import { addRoom, blockingErrors } from '../edit/ops.js';
import { describeReconcile } from '../edit/reconcile.js';
import { showLevelForm } from './level-form.js';
import { chooseLocation, chooseLevel, remember, linkPages } from '../model/current.js';
import { shareCandidates, alongsideCandidates } from './share.js';
import { overlapsAfterApply, pointCollisions, describeOverlaps } from './overlap.js';
import { solveCapture } from './solve.js';
import { lockOffers, withLock, residualCells, describeLockOffer } from './edit.js';
import { wallName, wallLabelsSvg } from './labels.js';
import { roomNameLayout } from '../geometry/polygon.js';
import { createMapView } from './map-view.js';
import { cornerSvg } from './plan-marks.js';
import { refNamer } from './ref-names.js';
import { copySources, shapeDraftFrom } from '../edit/copy.js';
import { levelLabel } from '../model/names.js';
import { askConfirm } from './dialog.js';
import { HEADINGS, suggestAxis, lengthToReach, currentHeading, cornerPreview, parseAngle, parseLength, newWizard, addEdge, undo, pathPoints, finish, exportResult } from './wizard-state.js';

// nicer dropdowns (ND12): the short kind choices are drawn as the menu; the long lists keep the browser select (data-native)
import { enhanceAll } from '../select.js';
enhanceAll();

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const params = new URLSearchParams(location.search);

let loc, model, locId, entry, w, phase = 'setup', result = null, snaps = [], underlay = [], wallOutlines = [], house, saveMode = null;
let unsaved = false;   // rooms or levels added on this page and not saved yet (Save the house writes them, as the Editor's Save does)
let shareT = null;  // thickness assumed for a neighbour whose wall is not modelled (default: settings.wallThickness.inner)
let reach = { open: true, axis: 'x', ok: false, value: 0, target: 0 };   // always open: a coordinate or a typed length, whichever was entered last
let reachStep = -1;   // the number of walls the coordinate was last cleared for (render clears it when a new wall starts)   // "run this wall until x/y = …"
let focusedStep = null;   // the step the length field was last focused for (focus once, not on every redraw)
let shareTimer = 0;       // share offers wait until typing pauses, so the page does not jump per keystroke
let wholeHouse = false;   // the map shows the whole level instead of zooming in on what is being done
let mapView = null;       // zoom and pan of the map (pinch, drag, + / −)
let wallPicked = false;   // a wall was tapped or chosen (then the map zooms to its room; before that it shows the level)
const level = () => model.levels.find(l => l.id === w.level);
const innerThickness = () => resolveSettings(loc, level()).wallThickness?.inner ?? 200;   // between rooms, until modelled
const KEY = () => `plantern.wizard.${locId}`;
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY())); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(KEY(), JSON.stringify(v)) : localStorage.removeItem(KEY()); } catch { /* private mode: no drafts */ } },
};
const save = () => store.set({ w, phase });

async function init() {
  const index = await listHouses();
  locId = chooseLocation(index, params.get('loc'));
  house = await openHouse(index, locId);
  entry = house.entry;
  remember(locId); linkPages(locId);
  $('loc').innerHTML = houseOptions(index, locId);
  $('loc').onchange = () => { remember($('loc').value); params.set('loc', $('loc').value); params.delete('level'); location.search = params; };
  saveMode = house.canSave ? house.saveMode : null;
  mapView = createMapView($('map'), { onChange: () => drawMap(), inset: { top: 36, bottom: 44 } });   // clear of ⤢ Whole house and + / −
  loc = house.location; model = house.model;
  // saved elsewhere meanwhile (the Editor, another phone): take it in, unless this page is saving right now
  house.watch(() => { if ($('done').disabled && phase === 'review') return; house.load().then(() => { loc = house.location; model = house.model; loadSnaps(); render(); $('hint').textContent = 'The house was updated from elsewhere.'; }).catch(() => {}); });
  if (!model.levels.length) await newLevel(true);
  fillLevels();

  const draft = store.get();
  w = newWizard({ level: chooseLevel(model, locId, params.get('level')) });
  linkPages(locId, w.level);
  if (draft?.w?.edges?.length) {
    $('resume').innerHTML = `Unfinished room "${esc(draft.w.name || 'unnamed')}" with ${draft.w.edges.length} wall(s). <button id="resumeBtn">Resume</button>`;
    $('resumeBtn').onclick = () => { w = draft.w; w.origin ??= { ref: '', offset: [0, 0] }; phase = 'measure'; loadSnaps(); syncNextTo(); render(); };
  }
  $('level').value = w.level;
  $('level').onchange = async () => {
    if ($('level').value === NEW_LEVEL) { $('level').value = w.level; const lv = await newLevel(false); if (!lv) return; w.level = lv; fillLevels(); }
    else w.level = $('level').value;
    w.origin = { ref: '', offset: [0, 0] }; w.nextTo = null;
    remember(locId, w.level); linkPages(locId, w.level);
    loadSnaps(); render();
  };
  loadSnaps();
  $('originRef').onchange = () => { w.nextTo = null; w.origin.ref = $('originRef').value; render(); };
  for (const id of ['ox', 'oy']) $(id).oninput = () => { w.nextTo = null; w.origin.offset = [Number($('ox').value) || 0, Number($('oy').value) || 0]; render(); };
  $('bearing').oninput = () => { const b = Number($('bearing').value); if ($('bearing').value.trim() !== '' && Number.isFinite(b)) { w.heading = headingFromBearing(b, northAngleOf(model)); render(); } };
  $('placeMode').querySelectorAll('button').forEach(b => (b.onclick = () => setPlaceMode(b.dataset.m)));
  $('edgeSel').onchange = () => { const [room, edge] = $('edgeSel').value.split('|'); pickEdge(room, Number(edge)); };
  for (const id of ['edgeT', 'edgeSlide']) $(id).oninput = () => { w.nextTo.thickness = $('edgeT').value.trim() === '' ? NaN : Number($('edgeT').value); w.nextTo.slide = Number($('edgeSlide').value) || 0; render(); };
  $('len').oninput = () => { if (reach.ok) { reach.ok = false; $('reachVal').value = ''; $('reachPt').value = ''; $('reachOut').textContent = ''; drawMap(); } };   // a typed length replaces a coordinate
  $('zoomBtn').onclick = () => { wholeHouse = !wholeHouse; drawMap(); };
  $('reachRow').querySelectorAll('button[data-axis]').forEach(b => (b.onclick = () => { reach.axis = b.dataset.axis; reach.axisChosen = true; const i = $('reachPt').value; if (i !== '') $('reachVal').value = Math.round(reachPoints()[+i].pos[reach.axis === 'x' ? 0 : 1] * 10) / 10; updateReach(); }));
  $('reachVal').oninput = () => { $('reachPt').value = ''; updateReach(); };
  $('reachPt').onchange = () => { const i = $('reachPt').value; if (i !== '') { $('reachVal').value = Math.round(reachPoints()[+i].pos[reach.axis === 'x' ? 0 : 1] * 10) / 10; updateReach(); } };
  $('custom').onclick = () => { $('customRow').hidden = !$('customRow').hidden; if (!$('customRow').hidden) $('angle').focus(); drawAngleMini(); drawMap(); };
  $('angle').oninput = () => { $('err').textContent = ''; drawAngleMini(); drawMap(); };
  $('customAdd').onclick = () => { const a = parseAngle($('angle').value); if (a.error) { $('err').textContent = a.error; $('angle').focus(); return; } step(a.value); $('angle').value = ''; $('customRow').hidden = true; drawAngleMini(); };
  $('name').oninput = () => { w.name = $('name').value; save(); };
  $('exterior').onchange = () => { w.exterior = $('exterior').checked; save(); };
  $('dirs').querySelectorAll('button').forEach(b => (b.onclick = () => { w.heading = HEADINGS[b.dataset.d]; $('bearing').value = ''; render(); }));
  $('sameAs').onchange = () => useShapeOf($('sameAs').value);
  $('begin').onclick = () => {
    if (!$('name').value.trim()) { $('name').focus(); return; }
    if ($('sameAs').value) { reviewShape(); return; }                 // same shape as another room: straight to the result
    phase = 'measure'; save(); render();
  };
  $('tR').onclick = () => step('R');
  $('tL').onclick = () => step('L');
  $('close').onclick = closeRoom;
  $('len').addEventListener('input', () => {
    $('err').textContent = ''; drawMap();
    clearTimeout(shareTimer);
    if (!$('len').value.trim()) updateShare(); else shareTimer = setTimeout(updateShare, 400);
  });
  $('undo').onclick = () => { w = undo(w); save(); render(); };
  $('saveHouse').onclick = saveHouse;
  addEventListener('beforeunload', e => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } });   // a room added here is in the page only until saved
  $('restart').onclick = async () => { if (await askConfirm('Throw away the walls entered so far?', { ok: 'Throw away' })) { w = newWizard({ level: w.level, name: w.name, exterior: w.exterior, origin: w.origin, start: w.start, heading: w.heading }); phase = 'setup'; store.set(null); render(); } };
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText($('json').textContent); $('copy').textContent = 'Copied ✓'; } catch { $('json').focus(); $('copy').textContent = 'Select the text below and copy'; } };
  $('done').onclick = () => done(false);
  $('doneAnyway').onclick = () => done(true);
  $('dl').onclick = () => download(new Blob([$('json').textContent], { type: 'application/json' }), `${(w.name || 'room').replace(/\W+/g, '_')}.capture.json`);
  $('back').onclick = () => { if (result.fromShape) { phase = 'setup'; render(); return; } phase = 'measure'; render(); $('len').value = result.last; drawMap(); };
  $('again').onclick = () => { w = newWizard({ level: w.level }); phase = 'setup'; store.set(null); result = null; $('name').value = ''; $('exterior').checked = false; loadSnaps(); render(); };
  $('name').value = w.name; $('exterior').checked = w.exterior;
  render();
}

/** Points named as a person reads them ("Kitchen corner 2"), like the plan numbers corners. */
const nameOpts = () => ({ name: refNamer(model), levelName: id => model.levels.find(l => l.id === id)?.name || id });

function loadSnaps() {
  const lv = level();
  const geos = new Map(model.levels.map(l => [l.id, buildLevelGeometry(l)]));
  snaps = lv ? collectSnapPointsAround(model, lv, l => geos.get(l.id)) : [];   // this level's points, then the level below's and above's
  underlay = lv ? adjacentOutlines(model, lv, l => geos.get(l.id)) : [];
  wallOutlines = lv ? [...(geos.get(lv.id)?.pieces?.values() || [])].flat() : [];   // this level's walls, drawn very faintly on the map
  $('originRef').innerHTML = '<option value="">Plan origin (0, 0)</option>' + startOptions(snaps, nameOpts()).map(o => `<option value="${esc(o.ref)}">${esc(o.label)}</option>`).join('');
  $('originRef').value = w.origin.ref;
  $('ox').value = w.origin.offset[0] || ''; $('oy').value = w.origin.offset[1] || '';
  loadEdges();
  fillSameAs();
}

/** "Same shape as": the rooms of this level, the level below and above, and the others. */
function fillSameAs() {
  if (!level()) return;
  const keep = $('sameAs').value, rel = { here: 'this level', below: 'below', above: 'above', other: '' };
  $('sameAs').innerHTML = '<option value="">— no, I will measure it —</option>' + copySources(model, 'rooms', w.level, r => r.polygon?.length >= 3)
    .map(g => `<optgroup label="${esc(g.level.name || g.level.id)}${rel[g.relation] ? ` (${rel[g.relation]})` : ''}">${g.items.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)}</option>`).join('')}</optgroup>`).join('');
  $('sameAs').value = [...$('sameAs').options].some(o => o.value === keep) ? keep : '';
  $('begin').textContent = $('sameAs').value ? 'Check the result' : 'Start measuring';
}

/** A room picked in "Same shape as": its start (on top of it from the level below or above) and heading, its name if none yet. */
function useShapeOf(id) {
  $('begin').textContent = id ? 'Check the result' : 'Start measuring';
  if (!id) return;
  const d = shapeDraftFrom(model, 'rooms', id, w.level);
  if (d.error) { $('hint').textContent = d.error; return; }
  w.nextTo = null;
  const raw = d.capture.raw;
  w.origin = raw.origin ? { ref: raw.origin.ref, offset: [...raw.origin.offset] } : { ref: '', offset: [...raw.start] };
  w.heading = raw.heading ?? 0;
  if (!$('name').value.trim()) { $('name').value = d.name; w.name = d.name; }
  if (d.exterior) { $('exterior').checked = true; w.exterior = true; }
  $('originRef').value = w.origin.ref; $('ox').value = w.origin.offset[0] || ''; $('oy').value = w.origin.offset[1] || '';
  save(); render();
}

/** The room picked in "Same shape as", where corner 0 is now: solved and shown for review (Done adds it). */
function reviewShape() {
  const d = shapeDraftFrom(model, 'rooms', $('sameAs').value, w.level);
  if (d.error) { $('hint').textContent = d.error; return; }
  const raw = { ...d.capture.raw, start: w.start, heading: w.heading };
  delete raw.origin;
  if (w.origin.ref) raw.origin = { ref: w.origin.ref, offset: [...w.origin.offset] };
  review({ mode: d.capture.mode, raw }, { fromShape: true });
  phase = 'review'; save(); render();
}

/** Shared-wall choices: every edge of every room on this level, with the wall thickness when one is modelled. */
function loadEdges() {
  const lv = level(), rooms = lv?.rooms || [];
  $('edgeSel').innerHTML = rooms.map(r => `<optgroup label="${esc(r.name || r.id)}">` + r.polygon.map((p, i) => {
    const q = r.polygon[(i + 1) % r.polygon.length], t = edgeWallThickness(lv, r, i);
    return `<option value="${esc(r.id)}|${i}">${esc(r.name || r.id)} · wall ${wallName(i)} · ${Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]))} mm${t ? ` · ${t} mm thick` : ''}</option>`;
  }).join('') + '</optgroup>').join('');
  syncNextTo();
}

/** The wall of `room` (edge number) the new room is placed against; from the dropdown or a tap on the map. */
function pickEdge(room, edge) {
  const r = level().rooms.find(x => x.id === room);
  if (!r) return;
  w.nextTo = { room, edge, thickness: edgeWallThickness(level(), r, edge) ?? w.nextTo?.thickness ?? innerThickness(), slide: 0 };
  wallPicked = true; wholeHouse = false;
  syncNextTo(); save(); render();
}

function syncNextTo() {
  if (!w.nextTo) return;
  $('edgeSel').value = `${w.nextTo.room}|${w.nextTo.edge}`;
  $('edgeT').value = Number.isFinite(w.nextTo.thickness) ? w.nextTo.thickness : '';
  $('edgeSlide').value = w.nextTo.slide || '';
}

function setPlaceMode(m) {
  wallPicked = false;
  if (m === 'point') w.nextTo = null;
  else if (!w.nextTo) {
    const r = level()?.rooms?.[0];
    if (!r) { $('hint').textContent = 'There is no room on this level to place the new room next to yet.'; return; }
    w.nextTo = { room: r.id, edge: 0, thickness: edgeWallThickness(level(), r, 0) ?? innerThickness(), slide: 0 };
    syncNextTo();
  }
  render();
}

const dirWord = h => ({ 0: 'east', 90: 'north', 180: 'west', 270: 'south' })[Math.round(h) % 360] ?? `at ${roundDeg(h)}°`;

/** start = chosen point + offset; an unknown point is shown as an error, never replaced silently. */
function updateStart() {
  if (w.nextTo) {
    const room = level().rooms.find(x => x.id === w.nextTo.room);
    if (!room) { $('wallTxt').innerHTML = '<span style="color:var(--bad)">that room does not exist any more</span>'; return false; }
    const p = placeAgainstEdge(room, w.nextTo.edge, w.nextTo);
    if (p.error) { $('wallTxt').innerHTML = `<span style="color:var(--bad)">${esc(p.error)}</span>`; return false; }
    w.origin = { ref: p.ref, offset: p.offset }; w.heading = p.heading; w.start = p.start;
    const nm = room.name || room.id;
    $('wallTxt').textContent = `Against wall ${wallName(w.nextTo.edge)} of ${nm} (${Math.round(p.length)} mm). Corner 0 is on its far side${w.nextTo.slide ? `, ${w.nextTo.slide} mm from the marked end` : ', at the marked end'}; your first wall runs ${dirWord(p.heading)} along it, and the two rooms share a ${w.nextTo.thickness} mm wall.`;
    return true;
  }
  const r = resolveStart(ref => snaps.find(s => s.ref === ref)?.pos, w.origin);
  if (r.error) { $('startTxt').innerHTML = `<span style="color:var(--bad)">${esc(r.error)}</span>`; return false; }
  w.start = r.pos;
  $('startTxt').textContent = `corner 0 at (${r.pos[0]}, ${r.pos[1]})`;
  return true;
}

/** The angle being typed, if valid (else null). */
const typedAngle = () => (!$('customRow').hidden && !parseAngle($('angle').value).error ? parseAngle($('angle').value).value : null);

/** Small fixed picture of the corner: the wall you just measured arrives from the left, the next one leaves. */
function drawAngleMini() {
  const svg = $('angleMini'), a = typedAngle();
  $('customAdd').disabled = a === null;
  svg.toggleAttribute('hidden', a === null);   // SVG elements have no .hidden property
  if (a === null) { $('angleInfo').textContent = ''; return; }
  const c = cornerPreview(0, a), P = [120, 60], L = 90, rad = d => d * Math.PI / 180;
  const pt = (deg, r) => [P[0] + r * Math.cos(rad(deg)), P[1] - r * Math.sin(rad(deg))];
  const arc = [];
  for (let i = 0; i <= 32; i++) arc.push(pt(c.arcFrom - (a * i) / 32, 22).join(','));
  const [ix, iy] = pt(180, L), [nx, ny] = pt(c.next, L), [lx, ly] = pt(c.arcFrom - a / 2, 38);
  svg.innerHTML = `<polygon points="${P.join(',')} ${arc.join(' ')}" fill="#ffb45433" stroke="none"/>` +
    `<line x1="${ix}" y1="${iy}" x2="${P[0]}" y2="${P[1]}" stroke="#ffb454" stroke-width="3"/>` +
    `<line x1="${P[0]}" y1="${P[1]}" x2="${nx}" y2="${ny}" stroke="#ffb454" stroke-width="3" stroke-dasharray="7 5"/>` +
    `<polyline points="${arc.join(' ')}" fill="none" stroke="#ffb454" stroke-width="1.5"/>` +
    `<circle cx="${P[0]}" cy="${P[1]}" r="4" fill="#14161a" stroke="#ffb454" stroke-width="2"/>` +
    `<text x="${lx}" y="${ly}" fill="#d9dde4" font-size="14" text-anchor="middle" dy="5">${+a.toFixed(2)}°</text>` +
    `<text x="8" y="14" fill="#8b93a1" font-size="11">room side shaded · you arrive from the left</text>`;
  $('angleInfo').textContent = c.text + '.';
}

/** Points a wall can run to: the corners of this room so far, then the points of the house. */
function reachPoints() {
  const mine = pathPoints(w).map((p, i) => ({ label: `corner ${i} of this room (${Math.round(p[0])}, ${Math.round(p[1])})`, pos: p }));
  return [...mine, ...startOptions(snaps, nameOpts()).map(o => ({ label: o.label, pos: o.pos }))];
}

/** The "take it from a point" list: the corners of this room and the house's points (they change as the room grows). */
function fillReachPoints() {
  $('reachPt').innerHTML = '<option value="">…or take it from a point</option>' + reachPoints().map((p, i) => `<option value="${i}">${esc(p.label)}</option>`).join('');
}

/** Run until: the wall is opened for a coordinate (the axis suggested for it); the length box is cleared. */
function setReach(open) {
  reach = { ...reach, open, ok: false };
  $('len').value = '';
  if (open) {
    reach.axis = suggestAxis(currentHeading(w));
    fillReachPoints();
    $('reachVal').value = '';
  }
  updateReach();
}

/** Forget the coordinate (a new corner, the closing wall): the length box is cleared with it. */
function clearReach() {
  reach = { ...reach, open: true, ok: false, axis: suggestAxis(currentHeading(w)), axisChosen: false };
  $('reachVal').value = ''; $('reachPt').value = ''; $('len').value = ''; $('reachOut').textContent = '';
  fillReachPoints();
  drawMap();
}

function updateReach() {
  $('reachRow').querySelectorAll('button[data-axis]').forEach(b => b.classList.toggle('on', b.dataset.axis === reach.axis));
  if (!reach.open) { reach.ok = false; drawMap(); return; }
  const h = currentHeading(w), raw = $('reachVal').value.trim(), val = raw === '' ? NaN : Number(raw), wasOk = reach.ok;
  $('reachHelp').textContent = `This wall runs at ${roundDeg(h)}° (plan), so it mostly advances in ${suggestAxis(h)}. Use this when you know where the wall ends (the same x or y as another corner) but not how long it is.`;
  // nothing typed in the coordinate box: a coordinate that was there is gone (its length with it); a typed length stays
  if (raw === '') { if (reach.ok) $('len').value = ''; reach.ok = false; $('reachOut').textContent = ''; $('err').textContent = ''; drawMap(); return; }
  const r = lengthToReach(w, reach.axis, val);
  reach.ok = !r.error; reach.value = r.value ?? 0; reach.target = val;
  if (!r.error) $('len').value = r.value;                                  // the length box shows the worked-out length only when the coordinate is valid
  else if (wasOk) $('len').value = '';
  $('reachOut').innerHTML = r.error ? (raw === '' ? '' : `<span style="color:var(--bad)">${esc(r.error)}</span>`) : `The wall runs <b>${r.value} mm</b> until ${reach.axis} = ${val}. This length is worked out, not measured.`;
  $('err').textContent = '';
  drawMap();
}

const NEW_LEVEL = '+new';
function fillLevels() {
  $('level').innerHTML = model.levels.map(l => `<option value="${esc(l.id)}">${esc(levelLabel(l))}</option>`).join('') + `<option value="${NEW_LEVEL}">+ New level…</option>`;
  if (w) $('level').value = w.level;
}

/**
 * Create a level and save the house right away (a level that only lives in this page would be lost
 * with the page, and a room measured on it would point at nothing). Resolves to the new level id,
 * or null when cancelled. Without a way to save, the level stays in this page only and the user is told.
 */
function newLevel(first) {
  $('s-setup').hidden = true;
  return new Promise(resolve => showLevelForm($('s-level'), model, {
    cls: { label: 'f', input: 'big', go: 'big go', button: 'big quiet' },
    onCancel: () => { $('s-setup').hidden = false; resolve(null); },
    onCreate: async r => {
      $('s-setup').hidden = false;
      model = r.model;
      if (!saveMode) { $('levelMsg').textContent = `Level "${r.level.name}" exists only on this page: this page cannot save. Create it in the editor too.`; resolve(r.level.id); return; }
      unsaved = true; updateSaveRow();                       // not saved yet, like the rooms: Save the house writes it
      $('levelMsg').textContent = `Level "${r.level.name}" created, not saved yet: press Save the house.`;
      resolve(r.level.id);
    },
  }));
}

/** Add the finished room to the model and save it, where the browser allows writing the repo. */
async function done(force) {
  if (!result?.sol?.ok || result.added) return;
  if (result.overlaps?.length && !force) return;
  // the room and its walls (reconcile), checked; errors block saving, larger wall moves are confirmed
  const prepare = async () => {
    const r = addRoom(model, w.level, { name: w.name, exterior: w.exterior }, result.sol.polygon, result.capture, { settings: resolveSettings(loc, level()) });
    const errs = blockingErrors(r.report), lines = describeReconcile(r.report);
    if (errs.length) {
      $('doneOut').innerHTML = `<div class="iss error">Not saved: the house would have errors. Fix them in the editor first, or use <b>Copy</b> / <b>Download</b> below.<br>${errs.map(e => `<b>${esc(e.id)}</b> ${esc(e.msg)}`).join('<br>')}</div>`;
      return null;
    }
    if (r.report.preview.length && !(await askConfirm(['Adding this room changes the plan:', ...lines, 'Add it?'].join('\n\n'), { ok: 'Add it' }))) return null;
    return { ...r, lines };
  };
  const first = await prepare();
  if (!first) return;
  let { model: next, room } = first;
  if (!saveMode) {
    $('doneOut').innerHTML = `<div class="iss">This page cannot write to your repo, so "${esc(room.name)}" is not in the house yet. Start the app with <b>run.cmd</b> to save from here, or use <b>Copy</b> / <b>Download</b> below and press <b>Import</b> in the editor.</div>`;
    return;
  }
  // unsaved, like Apply in the Editor: the room is in the house on this page; Save the house writes it
  model = next; result.added = true; unsaved = true;
  $('doneOut').innerHTML = `<div class="iss" style="border-color:var(--ok)">Added <b>${esc(room.name)}</b> (${esc(room.id)}) to the house with its walls, <b>not saved yet</b>. Press <b>Save the house</b> below; the Editor's Save stores it too.${first.lines.length ? '<br>' + first.lines.map(esc).join('<br>') : ''}<br>Walls marked as assumed still need their thickness measured.</div>`;
  showResult();
  updateSaveRow();
}

/** The "not saved yet" row: shown while the house has rooms or levels added on this page and not saved. */
function updateSaveRow() {
  const added = !!result?.added;
  $('saveRow').hidden = !added;
  $('saveHouse').hidden = !unsaved; $('saveHouse').disabled = false;
  $('again').hidden = unsaved;                              // measuring another room waits until the house is saved
  $('toEditor').hidden = !added;
  $('toEditor').className = unsaved ? 'quiet' : 'primary';   // the yellow one once everything is saved
  $('toEditor').onclick = () => { location.href = `room-editor.html?loc=${encodeURIComponent(locId)}&level=${encodeURIComponent(w.level)}`; };
}

/**
 * Save the house with what this page added (the Editor's Save, for this page). Changes saved elsewhere are merged by
 * id. On a real conflict the current house is loaded and the room is added to it again, checked as before.
 */
async function saveHouse() {
  if (!unsaved || !saveMode) return;
  $('saveHouse').disabled = true; $('saveHouseMsg').textContent = 'Saving…';
  const addRoomNow = m => addRoom(m, w.level, { name: w.name, exterior: w.exterior }, result.sol.polygon, result.capture, { settings: resolveSettings(loc, level()) });
  try {
    try {
      model = (await house.save(model)).value;
    } catch (e) {
      if (!e.conflict) throw e;
      await house.load();
      model = house.model; loadSnaps();
      const r = result.sol?.ok ? addRoomNow(model) : null;
      const errs = r ? blockingErrors(r.report) : ['the room has no shape any more'];
      if (errs.length) { $('saveHouseMsg').textContent = `Not saved: the house changed elsewhere and the room would now have errors (${errs.join('; ')}). Fix it in the editor.`; $('saveHouse').disabled = false; return; }
      model = r.model;
      model = (await house.save(model)).value;
    }
    unsaved = false; store.set(null);
    $('saveHouseMsg').textContent = 'Saved.';
    updateSaveRow();
  } catch (e) {
    $('saveHouse').disabled = false;
    $('saveHouseMsg').textContent = `Not saved: ${e.message}`;
  }
}

const pending = () => { const r = parseLength($('len').value); return r.value ?? 0; };

/** Snap the corner onto the neighbour's far face and continue along the shared wall. */
function addShared(c) {
  w = addEdge(w, c.newLength, c.turn, true, { room: c.room, roomName: c.roomName, edge: c.edge, thickness: c.thickness, endPoint: c.endPoint });
  $('len').value = '';
  save(); render();
}

/** Slide the corner you stand in onto the neighbour's far face by adjusting the previous wall's length. */
function addAlongside(c) {
  const keep = $('len').value, last = w.edges.length - 1;
  if (c.moveStart) {
    // the first wall: corner 0 moves sideways (its offset from the start point changes)
    w = { ...w, start: c.newFrom, origin: { ...w.origin, offset: [Math.round((w.origin.offset[0] + c.moveStart[0]) * 10) / 10, Math.round((w.origin.offset[1] + c.moveStart[1]) * 10) / 10] } };
  } else w = { ...w, edges: w.edges.map((e, i) => i === last ? { ...e, length: c.newPrevLength, derived: true } : e) };
  save(); render();
  $('len').value = keep; updateShare(); drawMap();       // the length being typed stays
}

/** Offers to share a wall: the wall being measured ENDS next to another room's wall, or RUNS ALONGSIDE one. */
function updateShare() {
  const card = $('shareCard');
  const len = phase === 'measure' ? pending() : 0;   // the length box holds the worked-out length too
  const pts = pathPoints(w), from = pts[pts.length - 1];
  // live hint: the corner would land inside another room or wall
  const hit = len > 0 ? pointCollisions(level(), buildLevelGeometry(level()), pathPoints(w, len).at(-1)) : [];
  $('collideWarn').textContent = hit.length ? `This corner would be inside ${describeOverlaps(hit)}. Check the length, or the turn before it.` : '';
  const heading = currentHeading(w), prev = w.edges.at(-1);
  const ends = len > 0 ? shareCandidates({ from, heading, length: len }, level(), { thickness: shareT ?? innerThickness() }).map(c => ({ ...c, type: 'end', move: Math.abs(c.delta) })) : [];
  const along = len > 0 && (!prev || !prev.sharedWith)
    ? alongsideCandidates({ from, heading, length: len, ...(prev ? { prevHeading: currentHeading({ ...w, edges: w.edges.slice(0, -1) }), prevLength: prev.length } : {}) }, level(), { thickness: shareT ?? innerThickness() }).map(c => ({ ...c, type: 'along', move: Math.abs(c.delta) }))
    : [];
  const items = [...ends, ...along].sort((x, y) => x.move - y.move).slice(0, 2);
  card.hidden = !items.length;
  if (!items.length) return;
  const tField = c => c.thicknessKnown ? '' : `<label class="f">Wall thickness there <small>mm (no wall is modelled yet)</small><input class="shareT" inputmode="numeric" value="${shareT ?? innerThickness()}" autocomplete="off"></label>`;
  card.innerHTML = items.map((c, i) => c.type === 'end'
    ? `<div class="share"><b>Share a wall with ${esc(c.roomName)}?</b>
        <div class="help">This corner is next to the far side of ${esc(c.roomName)}'s wall ${wallName(c.edge)} (${c.thickness} mm thick). Snapping moves it ${c.delta > 0 ? '+' : ''}${c.delta} mm (${len} → ${c.newLength}), and the next wall then runs ${dirWord(c.nextHeading)} along the shared wall.</div>
        ${tField(c)}<button class="go" data-i="${i}">Share wall: snap corner and continue</button></div>`
    : `<div class="share"><b>This wall runs alongside ${esc(c.roomName)}'s wall. Share it?</b>
        <div class="help">There are ${c.gap} mm between this wall and the far side of ${esc(c.roomName)}'s wall ${wallName(c.edge)} (${c.thickness} mm thick), over ${c.overlap} mm of its length. Sharing makes the gap exactly the wall thickness: ${c.moveStart ? `corner 0 moves ${Math.abs(c.delta)} mm ${c.delta < 0 ? 'towards' : 'away from'} that wall (its offset from the start point changes)` : `the corner you stand in moves ${c.delta > 0 ? '+' : ''}${c.delta} mm by changing the previous wall (${prev.length} → ${c.newPrevLength})`}. This wall keeps the length you typed.</div>
        ${tField(c)}<button class="go" data-i="${i}">Share wall: move this corner</button></div>`).join('');
  card.querySelectorAll('button[data-i]').forEach(b => (b.onclick = () => { const c = items[+b.dataset.i]; c.type === 'end' ? addShared(c) : addAlongside(c); }));
  card.querySelectorAll('.shareT').forEach(inp => (inp.onchange = () => { const v = Number(inp.value); if (v >= 0) { shareT = v; updateShare(); } }));
}

function step(turn) {
  const derived = reach.ok;   // a valid coordinate (typed or picked) worked the length out; a typed length otherwise
  const r = derived ? { value: reach.value } : parseLength($('len').value);   // a derived length is already a number (never re-read as text)
  if (r.error) { $('err').textContent = r.error; $('len').focus(); return; }
  w = addEdge(w, r.value, turn, derived);
  $('len').value = '';
  save(); render();
}

function closeRoom() {
  if (reach.ok) clearReach();                                          // a coordinate for the closing wall is dropped: it is worked out anyway
  const typedText = $('len').value.trim();
  const r = typedText ? parseLength(typedText) : { value: null };      // empty = nothing measured: the way back is used
  if (r.error) { $('err').textContent = r.error; $('len').focus(); return; }
  const f = finish(w, r.value);
  if (f.errors.length) { $('err').textContent = f.errors[0]; return; }
  review(f.capture, { last: f.typed ? r.value : '', typed: f.typed });
  phase = 'review'; save(); render();
}

/** Solve a finished room for the review step (again after a lock is accepted). */
function review(capture, keep = {}) {
  const sol = solveCapture(capture);
  // checked against the plan as it will be after Done (walls that follow rooms make way first)
  const overlaps = sol.ok ? overlapsAfterApply(model, w.level, { name: w.name, exterior: w.exterior, polygon: sol.polygon, capture }, { settings: resolveSettings(loc, level()) }) : [];
  result = { ...keep, capture, sol, overlaps, added: false, json: JSON.stringify(exportResult(w, capture, locId), null, 1) };
}

function render() {
  for (const p of ['setup', 'measure', 'review']) $(`s-${p}`).hidden = phase !== p;
  updateSaveRow();                                                                    // the row after Done: Save, then Measure another room, Close wizard
  if (phase !== 'measure') focusedStep = null;
  $('dirs').querySelectorAll('button').forEach(b => b.classList.toggle('on', HEADINGS[b.dataset.d] === w.heading));
  $('placeMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.m === 'wall') === !!w.nextTo));
  $('placePoint').hidden = !!w.nextTo; $('placeWall').hidden = !w.nextTo; $('dirBlock').hidden = !!w.nextTo;
  const startOk = updateStart();
  if (reach.open) updateReach();                 // the run-until length depends on the start: follow it when the start or its offset moves
  $('begin').disabled = !startOk;
  const na = northAngleOf(model);
  $('headTxt').textContent = `First wall: plan heading ${roundDeg(w.heading)}° = compass bearing ${roundDeg(bearingFromHeading(w.heading, na))}° (plan north is ${na}° from true north${na ? '' : '; set it in the editor'}).`;
  if (phase === 'measure') {
    const i = w.edges.length, n = w.edges.length;
    $('stepTitle').textContent = `Wall ${wallName(i)}: corner ${i} → corner ${i + 1}`;
    $('walkTip').innerHTML = i === 0
      ? `Stand in <b>corner 0</b>, look along the first wall (${dirWord(w.heading)}), with the room on your <b>right</b>. Measure to the next corner.`
      : `Now stand in <b>corner ${i}</b>. Keep the room on your right and measure along the next wall.`;
    $('close').hidden = n < 3;
    $('closeHint').hidden = n < 3;
    $('turnQ').textContent = `At corner ${i + 1}, does the wall continue…`;
    $('customRow').hidden = true;
    if (reachStep !== w.edges.length) { reachStep = w.edges.length; clearReach(); }   // a new corner: its wall's coordinate starts empty (not on every render)
    if (!reach.axisChosen && suggestAxis(currentHeading(w)) !== reach.axis) { reach.axis = suggestAxis(currentHeading(w)); updateReach(); }   // the axis follows the wall's heading until x or y is picked
    const sh = w.edges.at(-1)?.sharedWith;
    $('shareNext').hidden = !sh;
    if (sh) {
      $('shareNext').innerHTML = `This wall runs along <b>${esc(sh.roomName)}</b>'s wall (shared, ${sh.thickness} mm). <button id="shareEnd" class="quiet" style="padding:6px 10px;margin-top:6px">Stop at the end of that wall</button>`;
      $('shareEnd').onclick = () => { setReach(true); $('reachVal').value = Math.round(sh.endPoint[reach.axis === 'x' ? 0 : 1] * 10) / 10; updateReach(); };
    }
    updateShare();
    drawAngleMini();
    $('undo').disabled = n === 0;
    const stepKey = `${w.edges.length}`;
    if (focusedStep !== stepKey) { focusedStep = stepKey; $('len').focus({ preventScroll: true }); }
  }
  if (phase === 'review') showResult();
  drawMap();
}

function showResult() {
  const s = result.sol, tol = resolveSettings(loc, level()).checkTolerance || { ok: 5, warn: 15 };
  if (!s.ok) { $('result').innerHTML = s.errors.map(e => `<div class="iss error">${esc(e)}</div>`).join(''); $('resid').innerHTML = ''; }
  else {
    $('result').innerHTML = `<div class="help">${w.edges.length + 1} walls · closure gap <b>${s.closure.distance} mm</b> over ${(s.closure.perimeter / 1000).toFixed(1)} m of walls</div>` + (s.closure.distance > s.closure.perimeter * 0.005 ? '<div class="iss error">The room does not close well (gap over 0.5% of the walls). A wall length or a left/right turn is probably wrong: go back and check before using this.</div>' : '') + s.warnings.map(x => `<div class="iss">${esc(x)}</div>`).join('');
    const cls = c => { const a = Math.abs(c.residual), [ok, warn] = c.unit === 'deg' ? [0.2, 0.5] : [tol.ok, tol.warn]; return a <= ok ? 'ok' : a <= warn ? 'warn' : 'bad'; };
    $('resid').innerHTML = `<table class="res"><tr><th></th><th>measured</th><th>drawn</th><th>Δ</th></tr>${s.residuals.map(r => residualCells(r, result.capture.raw.derived, result.capture.raw.exact)).map(c => `<tr><td>${esc(c.label)}</td><td>${esc(c.measured)}</td><td>${esc(c.model)}</td><td><b class="${cls(c)}">${esc(c.delta)}</b></td></tr>`).join('')}</table>`;
  }
  // walls whose length you are sure of: they take none of the gap (tap to toggle)
  const raw = result.capture.raw, n = raw.lengths.length;
  $('exactWalls').innerHTML = s.ok && !result.added && n
    ? `<div class="help">Sure of a length (checked twice)? Mark it exact and the other walls take the gap:</div><div class="dirs" style="grid-template-columns:repeat(${Math.min(n, 6)},1fr)">${raw.lengths.map((l, i) => (raw.derived || []).includes(i) ? '' : `<button data-e="${i}" class="${(raw.exact || []).includes(i) ? 'on' : ''}">${wallName(i)} ${Math.round(l)}</button>`).join('')}</div>`
    : '';
  $('exactWalls').querySelectorAll('button').forEach(b => (b.onclick = () => {
    const e = +b.dataset.e, ex = new Set(raw.exact || []);
    if (ex.has(e)) ex.delete(e); else ex.add(e);
    const { exact, ...rest } = raw;
    review({ ...result.capture, raw: { ...rest, ...(ex.size ? { exact: [...ex].sort((a, b) => a - b) } : {}) } }, { last: result.last, typed: result.typed });
    save(); render();
  }));
  // walls that are almost exactly on an axis: offer to make them exact
  const offers = s.ok && !result.added ? lockOffers(result.capture, s.polygon) : [];
  $('lockOffers').innerHTML = offers.length ? `<div class="help">Almost straight along the plan axes:</div>` + offers.map((o, i) => `<button class="big quiet" data-i="${i}">${esc(describeLockOffer(o))}</button>`).join('') : '';
  $('lockOffers').querySelectorAll('button').forEach(b => (b.onclick = () => { review(withLock(result.capture, offers[+b.dataset.i]), { last: result.last, typed: result.typed }); save(); render(); }));
  if (result.overlaps?.length && !result.added) $('result').insertAdjacentHTML('afterbegin', `<div class="iss error"><b>This room overlaps ${esc(describeOverlaps(result.overlaps))}.</b> Rooms must not share floor area. Go back and check a length or turn, or place the room next to its neighbour with "Next to another room".</div>`);
  $('json').textContent = result.json;
  $('copy').textContent = 'Copy';
  $('done').disabled = !s.ok || result.added || !!result.overlaps?.length;
  $('doneAnyway').hidden = !s.ok || result.added || !result.overlaps?.length;
  $('done').hidden = result.added;
  $('toEditor').hidden = !result.added;
  $('toEditor').href = `room-editor.html?loc=${encodeURIComponent(locId)}&level=${encodeURIComponent(w.level)}`;
  $('done').textContent = result.added ? 'Added ✓' : 'Done';
  $('doneHelp').textContent = result.added ? '' : saveMode
    ? `Adds "${w.name}" to ${level().name || level().id} (${house.where}). It is not saved until you press Save the house, as in the editor.`
    : 'This page cannot write to your repo (start it with run.cmd, or use Chrome/Edge on the PC). Use Copy or Download, then Import in the editor.';
}

function drawMap() {
  const svg = $('map');
  const existing = level()?.rooms || [];
  const clashing = new Set(phase === 'review' ? (result?.overlaps || []).filter(o => o.kind === 'room').map(o => o.id) : []);
  const mine = phase === 'review' && result?.sol?.ok ? result.sol.polygon : pathPoints(w, phase === 'measure' ? pending() : 0);
  // what the map zooms to: picking a start corner needs the whole level; otherwise the wall being
  // placed against (its room), or the room being measured as it grows; ⤢ shows the whole level
  const everything = [...existing.flatMap(r => r.polygon), ...mine, w.start];
  const against = phase === 'setup' && w.nextTo && wallPicked ? existing.find(x => x.id === w.nextTo.room) : null;
  const focus = phase === 'setup' ? (against ? [...against.polygon, w.start] : null) : [...mine, w.start];
  const zoomed = !!focus && !wholeHouse;
  const view = (zoomed ? focus : everything).map(toSvg);
  const xs = view.map(p => p[0]), ys = view.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span0 = Math.max(x1 - x0, y1 - y0, zoomed ? 4000 : 3000), pad = span0 * (zoomed ? 0.2 : 0.1);
  $('zoomBtn').hidden = !focus || existing.length === 0;
  $('zoomBtn').textContent = wholeHouse ? '⊙ Zoom in' : '⤢ Whole house';
  // what the map is about; pinching or dragging looks closer until the subject changes (another step, ⤢)
  const { vb, unit } = mapView.frame({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }, `${w.level}|${phase}|${wholeHouse}|${phase === 'setup' ? `${!!w.nextTo}|${against?.id || ''}` : ''}`);
  const fs = unit * 15, span = Math.min(vb.w, vb.h);   // marks and labels sized in screen pixels
  const pts = a => a.map(p => toSvg(p).join(',')).join(' ');
  let out = '';
  // the level below (blue) and above (amber), faintly: their corners are start points too (hollow rings below)
  for (const u of underlay) {
    const c = u.relation === 'below' ? '#7aa2d6' : '#d6a56b';
    for (const p of u.rooms) out += `<polygon points="${pts(p)}" fill="none" stroke="${c}" stroke-opacity="0.35" stroke-width="${fs / 10}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"/>`;
    for (const p of u.walls) out += `<polygon points="${pts(p)}" fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-opacity="0.45" stroke-width="${fs / 14}" pointer-events="none"/>`;
  }
  for (const r of existing) out += `<polygon points="${pts(r.polygon)}" fill="${r.exterior ? '#243026' : '#252a33'}" stroke="${clashing.has(r.id) ? '#e5534b' : '#46505f'}" stroke-width="${clashing.has(r.id) ? fs / 4 : fs / 8}"/>`;
  // this level's walls, very faintly, so a wall's corners and faces are easy to see when a point is picked (run until x/y)
  for (const p of wallOutlines) out += `<polygon points="${pts(p)}" fill="#9aa6b8" fill-opacity="0.14" stroke="#9aa6b8" stroke-opacity="0.3" stroke-width="${fs / 16}" pointer-events="none"/>`;
  // room names, so the rooms (and their walls) can be told apart
  for (const r of existing) {
    const lay = roomNameLayout(r.polygon, r.name || r.id, { maxSize: fs * 1.1, minSize: fs * 0.7 }), [cx, cy] = toSvg(lay.pos);
    out += `<text x="${cx}" y="${cy}" fill="#8b93a1" font-size="${lay.size}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${lay.lines.map((l, k) => `<tspan x="${cx}" dy="${k ? '1.25em' : `${-(lay.lines.length - 1) * 0.625}em`}">${esc(l)}</tspan>`).join('')}</text>`;
  }
  if (phase === 'setup' && w.nextTo) {
    // "next to another room": every wall of the existing rooms is a tap target, named like in the list
    for (const r of existing) out += wallLabelsSvg(r.polygon, { closed: true, fs: fs * 1.2, fill: '#aeb6c2', lengths: false });
    for (const r of existing) r.polygon.forEach((p, i) => {
      const q = r.polygon[(i + 1) % r.polygon.length], [x1, y1] = toSvg(p), [x2, y2] = toSvg(q), sel = w.nextTo.room === r.id && w.nextTo.edge === i;
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sel ? '#ffb454' : '#8b93a1'}" stroke-width="${sel ? fs / 2 : fs / 6}" stroke-linecap="round" pointer-events="none"/>`;
      out += `<line data-edge="${esc(r.id)}|${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${fs * 2.6}" style="cursor:pointer"><title>${esc(r.name || r.id)} · wall ${wallName(i)}</title></line>`;
    });
    // the end of the chosen wall that "Start … mm from the end" counts from
    const room = existing.find(x => x.id === w.nextTo.room);
    if (room) {
      const q = room.polygon[(w.nextTo.edge + 1) % room.polygon.length], [qx, qy] = toSvg(q);
      out += `<rect x="${qx - fs * 0.5}" y="${qy - fs * 0.5}" width="${fs}" height="${fs}" fill="#4cc38a" stroke="#14161a" stroke-width="${fs / 10}" pointer-events="none"/>`;
      out += `<text x="${qx}" y="${qy - fs * 1.1}" fill="#4cc38a" font-size="${fs * 1.05}" text-anchor="middle" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.35}" pointer-events="none">Start counts from here</text>`;
    }
  }
  if (phase === 'setup' && !w.nextTo) {
    // tappable corners of existing rooms: choose the start corner
    for (const r of existing) r.polygon.forEach(p => {
      const [x, y] = toSvg(p), on = `${r.id}#p${r.polygon.indexOf(p)}` === w.origin.ref;
      // a generous invisible tap target around a small ring
      out += `<g data-ref="${r.id}#p${r.polygon.indexOf(p)}" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="${fs * 1.1}" fill="transparent"/><circle cx="${x}" cy="${y}" r="${fs * 0.45}" fill="${on ? '#ffb454' : '#14161a'}" stroke="#ffb454" stroke-width="${fs / 8}"/></g>`;
    });
    for (const s of snaps) {
      if (!s.adjacent || !/^r_[^#]+#p\d+$/.test(s.ref)) continue;
      const [x, y] = toSvg(s.pos), on = s.ref === w.origin.ref;
      const c = s.relation === 'above' ? '#d6a56b' : '#7aa2d6', no = nameOpts();
      out += `<g data-ref="${esc(s.ref)}" style="cursor:pointer"><title>${esc(no.name(s.ref))} · ${esc(no.levelName(s.level))}</title><circle cx="${x}" cy="${y}" r="${fs * 0.9}" fill="transparent"/><circle cx="${x}" cy="${y}" r="${fs * 0.4}" fill="${on ? c : 'none'}" stroke="${c}" stroke-width="${fs / 8}" pointer-events="none"/></g>`;
    }
    const [ox, oy] = toSvg([0, 0]);
    out += `<path d="M${ox - fs},${oy} H${ox + fs} M${ox},${oy - fs} V${oy + fs}" stroke="#8b93a1" stroke-width="${fs / 6}"/>`;
  }
  const polar = (P, deg, r) => toSvg([P[0] + r * Math.cos(deg * Math.PI / 180), P[1] + r * Math.sin(deg * Math.PI / 180)]);
  if (phase === 'setup') {
    // corner 0 where it will be, and which way the first wall runs
    const [sx, sy] = toSvg(w.start), [ax, ay] = polar(w.start, w.heading, fs * 4);
    out += `<line x1="${sx}" y1="${sy}" x2="${ax}" y2="${ay}" stroke="#ffb454" stroke-width="${fs / 4}" stroke-dasharray="${fs / 1.5} ${fs / 2}" pointer-events="none"/>`;
    out += cornerSvg(w.start, 0, { fs, active: true, tag: w.nextTo ? '' : 'corner 0', toward: [w.start[0] - Math.cos(w.heading * Math.PI / 180) * 1000, w.start[1] - Math.sin(w.heading * Math.PI / 180) * 1000] });
  }
  if (phase === 'measure') {
    const last = mine[mine.length - 1];
    if (pending() === 0) {   // which way the wall about to be measured runs
      const [ax, ay] = polar(last, currentHeading(w), fs * 5), [lx, ly] = toSvg(last);
      out += `<line x1="${lx}" y1="${ly}" x2="${ax}" y2="${ay}" stroke="#ffb454" stroke-width="${fs / 4}" stroke-dasharray="${fs / 1.5} ${fs / 2}" opacity=".7" pointer-events="none"/>`;
    }
    if (reach.open && reach.ok) {   // the coordinate the wall runs to
      out += reach.axis === 'x'
        ? `<line x1="${reach.target}" y1="${vb.y - vb.h}" x2="${reach.target}" y2="${vb.y + 2 * vb.h}" stroke="#4cc38a" stroke-width="${fs / 6}" stroke-dasharray="${fs} ${fs / 2}" pointer-events="none"/>`
        : `<line x1="${vb.x - vb.w}" y1="${-reach.target}" x2="${vb.x + 2 * vb.w}" y2="${-reach.target}" stroke="#4cc38a" stroke-width="${fs / 6}" stroke-dasharray="${fs} ${fs / 2}" pointer-events="none"/>`;
    }
  }
  const closed = phase === 'review' && result?.sol?.ok;
  if (mine.length > 1) out += closed ? `<polygon points="${pts(mine)}" fill="#ffb45433" stroke="#ffb454" stroke-width="${fs / 5}"/>` : `<polyline points="${pts(mine)}" fill="none" stroke="#ffb454" stroke-width="${fs / 5}" stroke-linejoin="round"/>`;
  if (mine.length > 1) out += wallLabelsSvg(mine, { closed, fs: fs * 1.3 });   // "A · 4000" inside the room, along each wall
  // the corners by number; while measuring, the one you stand in stands out
  const here = phase === 'measure' ? w.edges.length : -1, mid = mine.reduce((a, p) => [a[0] + p[0] / mine.length, a[1] + p[1] / mine.length], [0, 0]);
  mine.forEach((p, i) => {
    if (closed ? false : i > w.edges.length + 1) return;
    out += cornerSvg(p, i, { fs, active: i === here, tag: i === here ? 'you are here' : '', toward: mine.length > 2 ? [2 * p[0] - mid[0], 2 * p[1] - mid[1]] : null });   // outside the room, clear of the wall labels
  });
  // "run until x/y =" (fixes list 24): every point it can take is a tap target on the map, named when tapped
  if (phase === 'measure' && reach.open) {
    reachPoints().forEach((p, i) => {
      const [px, py] = toSvg(p.pos);
      out += `<g data-reachi="${i}" style="cursor:pointer"><title>${esc(p.label)}</title><circle cx="${px}" cy="${py}" r="${fs * 0.9}" fill="transparent"/><circle cx="${px}" cy="${py}" r="${fs * 0.3}" fill="#8b93a1" stroke="#14161a" stroke-width="${fs / 10}" pointer-events="none"/></g>`;
    });
  }
  // the point "run until x/y =" took its value from
  const rp =phase === 'measure' && reach.open && $('reachPt').value !== '' ? reachPoints()[+$('reachPt').value] : null;
  if (rp) { const [px, py] = toSvg(rp.pos); out += `<circle cx="${px}" cy="${py}" r="${fs * 0.7}" fill="none" stroke="#4cc38a" stroke-width="${fs / 5}" pointer-events="none"/>`; }
  const ang = phase === 'measure' ? typedAngle() : null;
  if (ang !== null && mine.length > 1 && pending() > 0) {
    // ghost of the next wall and the room-side arc at the corner being defined
    const h = currentHeading(w), c = cornerPreview(h, ang), P = mine[mine.length - 1], rad = d => d * Math.PI / 180;
    const at = (deg, r) => toSvg([P[0] + r * Math.cos(rad(deg)), P[1] + r * Math.sin(rad(deg))]);
    const arc = [];
    for (let i = 0; i <= 32; i++) arc.push(at(c.arcFrom - (ang * i) / 32, fs * 2.5).join(','));
    out += `<polygon points="${toSvg(P).join(',')} ${arc.join(' ')}" fill="#ffffff22" stroke="#ffffff88" stroke-width="${fs / 10}" pointer-events="none"/>`;
    out += `<line x1="${toSvg(P)[0]}" y1="${toSvg(P)[1]}" x2="${at(c.next, span * 0.22)[0]}" y2="${at(c.next, span * 0.22)[1]}" stroke="#ffb454" stroke-width="${fs / 5}" stroke-dasharray="${fs / 1.5} ${fs / 2}" pointer-events="none"/>`;
    const [tx, ty] = at(c.arcFrom - ang / 2, fs * 4);
    out += `<text x="${tx}" y="${ty}" fill="#d9dde4" font-size="${fs * 0.9}" text-anchor="middle" dy="${fs * 0.3}" pointer-events="none">${+ang.toFixed(2)}°</text>`;
  }
  svg.innerHTML = out;
  svg.querySelectorAll('[data-ref]').forEach(c => (c.onclick = () => { w.origin = { ref: c.dataset.ref, offset: [0, 0] }; loadSnaps(); save(); render(); }));
  svg.querySelectorAll('[data-edge]').forEach(l => (l.onclick = () => { const [room, edge] = l.dataset.edge.split('|'); pickEdge(room, Number(edge)); }));
  svg.querySelectorAll('[data-reachi]').forEach(c => (c.onclick = () => { $('reachPt').value = c.dataset.reachi; $('reachPt').dispatchEvent(new Event('change')); }));
  const sameAs = $('sameAs').value && level()?.rooms ? model.levels.flatMap(l => l.rooms || []).find(r => r.id === $('sameAs').value) : null;
  $('hint').textContent = phase !== 'setup' ? '' : w.nextTo ? 'Tap the wall the new room shares with its neighbour (or pick it in the list below).'
    : sameAs ? `The shape of ${sameAs.name || sameAs.id}: its corner 0 goes where corner 0 is now${w.origin.ref === `${sameAs.id}#p0` && !w.origin.offset[0] && !w.origin.offset[1] ? ' (exactly over or under it)' : ''}. Tap another corner to move it, then Check the result.`
      : 'Tap a corner of an existing room to start from it, or measure from the origin (+).';
}

init().catch(e => { $('hint').innerHTML = e.noHouses ? e.html : `<span style="color:var(--bad)">${esc(e.message)}</span>`; console.error(e); });
