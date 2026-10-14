// Doors, windows & lights page (openings.html, phone): standing in a room, pick a wall, measure an
// opening, a switch or a wall lamp from a corner (or a ceiling lamp from two walls), save. Logic in opening-capture.js and src/edit/ops.js; this file only wires the DOM.

import { listHouses, openHouse, houseOptions } from '../model/house.js';
import { askConflict } from './conflict-ui.js';
import { askConfirm } from './dialog.js';
import { roomNameLayout } from '../geometry/polygon.js';
import { resolveSettings } from '../model/settings.js';
import { toSvg } from '../render2d/coords.js';
import { buildLevelGeometry } from '../geometry/level.js';
import { addOpening, setOpening, deleteOpening, blockingErrors, OPENING_DEFAULTS, addFixture, setFixture, deleteFixture, setWallProps, FIXTURE_DEFAULTS } from '../edit/ops.js';
import { isShared } from '../geometry/bound.js';
import { openingAssumed, DOOR_OPENS } from '../model/openings.js';
import { pointInPolygon } from '../geometry/polygon.js';
import { chooseLocation, chooseLevel, remember, linkPages } from '../model/current.js';
import { wallLabelsSvg } from './labels.js';
import { revealField } from '../edit/inspect.js';
import { roomWalls, placeOpening, measureOf, placeOnWall, placeInRoom, distancesInRoom, wallPointOf } from './opening-capture.js';
import { openingSymbol, arcPathSvg } from '../geometry/openings.js';
import { wallProfile } from '../geometry/walls.js';
import { displayName, nameChange, levelLabel } from '../model/names.js';
import { createMapView } from './map-view.js';
import { cornerSvg, wallMarkSvg, wallDimsSvg, dimensionSvg, along, pointOn } from './plan-marks.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const params = new URLSearchParams(location.search);

let loc, model, locId, entry, house, saveMode = null, levelId = null;
let roomId = null, edge = null;                    // the room and its wall (edge index) being worked on
let f = null;                                      // the opening form: { id?, type, corner, hingeAt, into }
let g = null;                                      // the fixture form: { id?, kind, mode: 'wall' | 'ceiling', corner }
let mapView = null;                                // zoom and pan of the map
const level = () => model.levels.find(l => l.id === levelId);
const opts = () => ({ settings: resolveSettings(loc, level()) });

async function init() {
  const index = await listHouses();
  locId = chooseLocation(index, params.get('loc'));
  house = await openHouse(index, locId);
  entry = house.entry;
  remember(locId); linkPages(locId);
  $('loc').innerHTML = houseOptions(index, locId);
  $('loc').onchange = () => { remember($('loc').value); params.set('loc', $('loc').value); params.delete('level'); location.search = params; };
  saveMode = house.canSave ? house.saveMode : null;
  mapView = createMapView($('map'), { onChange: () => drawMap() });
  await load();
  // saved elsewhere meanwhile (the Editor, another phone): take it in when nothing is being entered here
  house.watch(() => { if (f || g) return; load().then(() => { render(); $('msg').textContent = 'The house was updated from elsewhere.'; }).catch(() => {}); });
  if (!model.levels.length) { $('msg').textContent = 'This house has no levels yet: create one and measure a room first (measure rooms / editor).'; return; }
  levelId = chooseLevel(model, locId, params.get('level'));
  $('level').innerHTML = model.levels.map(l => `<option value="${esc(l.id)}">${esc(levelLabel(l))}</option>`).join('');
  $('level').value = levelId;
  $('level').onchange = () => { levelId = $('level').value; remember(locId, levelId); linkPages(locId, levelId); roomId = null; edge = null; f = null; g = null; render(); };
  linkPages(locId, levelId);
  $('room').onchange = () => { roomId = $('room').value || null; edge = null; f = null; g = null; render(); };
  document.querySelectorAll('#types button').forEach(b => (b.onclick = () => { f.type = b.dataset.t; render(); }));
  document.querySelectorAll('#corners button').forEach(b => (b.onclick = () => { f.corner = b.dataset.c; render(); }));
  document.querySelectorAll('#hinges button').forEach(b => (b.onclick = () => { f.hingeAt = b.dataset.h; render(); }));
  document.querySelectorAll('#intos button').forEach(b => (b.onclick = () => { f.into = b.dataset.i; render(); }));
  for (const id of ['dist', 'width', 'sill', 'head', 'height']) $(id).addEventListener('input', drawMap);
  $('opens').onchange = render;
  $('doorOpens').onchange = render;
  $('cancel').onclick = () => { f = null; render(); };
  document.querySelectorAll('#fixCorners button').forEach(b => (b.onclick = () => { g.corner = b.dataset.c; render(); }));
  for (const id of ['fixDist', 'fixDistA', 'fixDistB', 'fixZ']) $(id).addEventListener('input', drawMap);
  for (const id of ['fixEdgeA', 'fixEdgeB']) $(id).onchange = drawMap;
  $('fixCancel').onclick = () => { g = null; render(); };
  $('fixSave').onclick = saveFixture;
  $('fixDel').onclick = removeFixture;
  $('saveBtn').onclick = saveOpening;
  $('del').onclick = removeOpening;
  $('map').addEventListener('click', e => {
    const el = e.target.closest('[data-edge],[data-room],[data-opening],[data-fixture]');
    if (!el) return;
    if (el.dataset.fixture) editFixture(el.dataset.fixture);
    else if (el.dataset.opening) editOpening(el.dataset.opening);
    else if (el.dataset.edge !== undefined) pickWall(+el.dataset.edge);
    else { roomId = el.dataset.room; edge = null; f = null; g = null; render(); }
  });
  if (!saveMode) $('msg').textContent = 'This page cannot write to your repo: start the app with run.cmd and open it from there.';
  render();
}

async function load() {
  await house.load();
  loc = house.location; model = house.model;
}

/**
 * Save `next` as the house. Changes saved elsewhere meanwhile are merged in by id; where the same thing
 * changed on both sides, the person picks. Returns the model as stored, or null when not saved.
 */
async function store(next) {
  try { return (await house.save(next)).value; }
  catch (e) {
    if (!e.conflict) throw e;
    const a = await askConflict(e.details, { what: loc.name });
    if (a.action === 'save') return (await house.saveOver(a.value, e.details.theirs)).value;
    if (a.action === 'theirs') { await load(); render(); }
    return null;
  }
}

function pickWall(i) { edge = i; f = null; g = null; render(); }

function newOpening(type) {
  g = null;
  f = { type, corner: 'start', hingeAt: 'corner', into: 'room' };
  for (const id of ['oName', 'dist', 'width', 'sill', 'head', 'height', 'unitThick']) $(id).value = '';
  $('opens').value = 'fixed'; $('doorOpens').value = 'swing';
  render();
}

function editOpening(id) {
  const o = level().openings.find(x => x.id === id), m = o && measureOf(level(), roomId, o);
  if (!m) return;
  edge = m.edge; g = null;
  f = { id, type: o.type, corner: m.corner, hingeAt: m.hingeAt, into: m.into };
  const known = k => !openingAssumed(o).includes(k);
  $('dist').value = known('offset') ? m.distance : '';
  $('width').value = known('width') ? o.width : '';
  $('sill').value = known('sill') ? o.sill : '';
  $('head').value = known('head') ? o.head : '';
  $('unitThick').value = o.thickness ?? '';
  $('oName').value = o.name ?? '';
  $('height').value = '';
  $('opens').value = o.type === 'window' ? o.opens || 'fixed' : 'fixed';
  $('doorOpens').value = o.type === 'door' && DOOR_OPENS.includes(o.opens) ? o.opens : 'swing';
  render();
}

/** The opening as the form describes it: { spec, place } or { error }. Empty sizes stay defaults. */
function readForm() {
  const n = id => { const t = $(id).value.trim(); return t === '' ? undefined : Number(t); };
  const d = OPENING_DEFAULTS[f.type], cur = f.id && level().openings.find(x => x.id === f.id);
  const dist = n('dist'), width = n('width'), sill = n('sill'), head = n('head'), height = n('height');
  for (const [k, v] of Object.entries({ distance: dist, width, bottom: sill, top: head, height })) if (v !== undefined && !Number.isFinite(v)) return { error: `${k}: not a number of mm` };
  const w = width ?? cur?.width ?? d.width, wl = roomWalls(level(), roomId)[edge];
  // no distance typed: an existing opening stays where it is, a new one goes in the middle of the wall
  const here = cur && measureOf(level(), roomId, cur);
  const fallback = here ? (f.corner === 'end' ? wl.length - here.distance - w : here.distance) : Math.max(0, (wl.length - w) / 2);
  const place = placeOpening(level(), roomId, { edge, corner: f.corner, distance: dist ?? fallback, width: w, hingeAt: f.hingeAt, into: f.into });
  if (place.error) return { error: place.error };
  const spec = {};
  if (dist !== undefined) spec.offset = place.offset;
  if (width !== undefined) spec.width = width;
  if (sill !== undefined) spec.sill = sill;
  const bottom = sill ?? cur?.sill ?? d.sill;
  if (head !== undefined) spec.head = head; else if (height !== undefined) spec.head = bottom + height;
  const slides = f.type === 'door' && $('doorOpens').value !== 'swing';
  if (f.type === 'door' || (f.type === 'window' && ['side-hung', 'tilt-turn'].includes($('opens').value))) {
    // a sliding door: the "hinge" side is the edge it slides open toward, "into" the side of the wall it runs on
    if (slides) spec.slide = place.hinge; else spec.hinge = place.hinge;
    spec.swing = place.swing;
    if (place.leaves === 2) spec.leaves = 2; else if (cur?.leaves === 2) spec.leaves = null;
  }
  if (f.type === 'door') { if (slides) spec.opens = $('doorOpens').value; else if (cur && DOOR_OPENS.includes(cur.opens)) spec.opens = null; }
  const unit = n('unitThick');
  if (unit !== undefined && f.type !== 'passage') { if (!Number.isFinite(unit)) return { error: 'thickness: not a number of mm' }; spec.thickness = unit; }
  if (f.type === 'window') spec.opens = $('opens').value;
  const nm = nameChange(cur?.name, $('oName').value);
  if (nm !== undefined) spec.name = nm;
  return { spec, place };
}

/** The model with the form's opening in it (not saved): for the preview and for saving. */
function apply() {
  const r = readForm();
  if (r.error) return { error: r.error };
  const { spec, place } = r;
  let out;
  if (f.id) {
    const cur = level().openings.find(x => x.id === f.id), props = { ...spec, type: f.type };
    if (place.wall !== cur.wall) props.wall = place.wall;
    if (spec.offset === undefined && place.wall !== cur.wall) props.offset = place.offset;
    out = setOpening(model, levelId, f.id, props, opts());
  } else out = addOpening(model, levelId, place.wall, f.type, spec, opts());     // no distance typed: centred on that wall part, listed as still to measure
  if (out.report.errors.length) return { error: out.report.errors.join('; ') };
  return out;
}

async function saveOpening() {
  const r = apply();
  if (r.error) { $('err').textContent = r.error; return; }
  const errs = blockingErrors(r.report);
  if (errs.length) { $('err').textContent = `Not saved: ${errs.map(e => `${e.id} ${e.msg}`).join('; ')}`; return; }
  if (!saveMode) { $('err').textContent = 'This page cannot save (start the app with run.cmd).'; return; }
  const next = r.model, note = '';
  $('saveBtn').disabled = true;
  try {
    const stored = await store(next);
    if (!stored) throw Object.assign(new Error('Not saved yet: it was changed elsewhere too. Save again to choose.'), { quiet: true });
    model = stored;
    const id = f.id || r.opening?.id;
    $('msg').textContent = `Saved ${displayName(level().openings.find(o => o.id === id), id)}.${note}`;
    f = null;
  } catch (e) {
    $('err').textContent = e.message;
  }
  $('saveBtn').disabled = false;
  render();
}

async function removeOpening() {
  if (!f?.id || !(await askConfirm(`Delete ${f.id}?`, { ok: 'Delete' }))) return;
  const r = deleteOpening(model, levelId, f.id, opts());
  try {
    const stored = await store(r.model);
    if (!stored) { render(); return; }
    model = stored;
    $('msg').textContent = `Deleted ${f.id}.`; f = null;
  } catch (e) { $('err').textContent = e.message; }
  render();
}

function render() {
  const lv = level();
  if (!lv) return;
  const rooms = lv.rooms || [];
  if (roomId && !rooms.some(r => r.id === roomId)) roomId = null;
  $('room').innerHTML = `<option value="">Pick a room…</option>` + rooms.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)}</option>`).join('');
  $('room').value = roomId || '';
  $('s-form').hidden = !f;
  $('s-fix').hidden = !g;
  $('s-pick').hidden = !!f || !!g;
  if (g) renderFixture(lv, rooms);
  else if (!f) {
    const walls = roomId ? roomWalls(lv, roomId) : [];
    $('walls').innerHTML = !roomId ? '' : edge === null
      ? `<div class="help">Tap a wall on the map, or pick it here:</div>` + walls.map(w => `<button data-w="${w.i}">Wall ${w.name} · ${w.length} mm <small>(corner ${w.from} → ${w.to})</small>${count(lv, w) ? ` · ${count(lv, w)} on it` : ''}</button>`).join('')
        + `<div class="help" style="margin-top:10px">On the ceiling:</div>` + ceilingLamps(lv).map(x => `<button data-fx="${esc(x.id)}">${x.name ? `<b>${esc(x.name)}</b> · ` : ''}ceiling lamp <small>${esc(x.id)}</small>${x.assumed?.length ? ' · <b class="warn">height still default</b>' : ''}</button>`).join('') + `<button data-ceiling>+ Ceiling lamp</button>`
      : wallMenu(lv, walls[edge]);
    $('walls').querySelectorAll('[data-w]').forEach(b => (b.onclick = () => pickWall(+b.dataset.w)));
    $('walls').querySelectorAll('[data-new]').forEach(b => (b.onclick = () => newOpening(b.dataset.new)));
    $('walls').querySelectorAll('[data-o]').forEach(b => (b.onclick = () => editOpening(b.dataset.o)));
    $('walls').querySelectorAll('[data-back]').forEach(b => (b.onclick = () => { edge = null; render(); }));
    $('walls').querySelectorAll('[data-fx]').forEach(b => (b.onclick = () => editFixture(b.dataset.fx)));
    $('walls').querySelectorAll('[data-thicksave]').forEach(b => (b.onclick = () => saveThickness(b.dataset.thicksave)));
    $('walls').querySelectorAll('[data-fixnew]').forEach(b => (b.onclick = () => newFixture(b.dataset.fixnew)));
    $('walls').querySelectorAll('[data-ceiling]').forEach(b => (b.onclick = () => newFixture('ceiling')));
  } else {
    const w = roomWalls(lv, roomId)[edge], room = rooms.find(r => r.id === roomId);
    $('formTitle').innerHTML = `${f.id ? `Edit <b>${esc(displayName(lv.openings.find(o => o.id === f.id)))}</b>` : 'New opening'} in wall <b>${w.name}</b> of ${esc(room.name || room.id)} (${w.length} mm, corner ${w.from} → ${w.to})`;
    document.querySelectorAll('#types button').forEach(b => b.classList.toggle('on', b.dataset.t === f.type));
    const [cs, ce] = document.querySelectorAll('#corners button');
    cs.textContent = `corner ${w.from}`; ce.textContent = `corner ${w.to}`;
    cs.classList.toggle('on', f.corner === 'start'); ce.classList.toggle('on', f.corner === 'end');
    $('windowRow').hidden = f.type !== 'window';
    $('doorRow').hidden = f.type !== 'door';
    const slides = f.type === 'door' && $('doorOpens').value !== 'swing';
    $('hingeLbl').textContent = slides ? 'Slides open toward' : 'Hinges on';
    document.querySelector('#hinges [data-h="other"]').textContent = 'the other side';
    document.querySelector('#hinges [data-h="both"]').textContent = slides ? 'both ways (two leaves)' : 'both sides (double)';
    $('intoLbl').textContent = slides ? 'Runs on' : 'Opens';
    $('intos').hidden = $('intoLbl').hidden = $('doorOpens').value === 'pocket' && f.type === 'door';
    $('thickRow').hidden = f.type === 'passage'; $('thickWhat').textContent = f.type;
    const leaf = f.type === 'door' || (f.type === 'window' && ['side-hung', 'tilt-turn'].includes($('opens').value));
    $('leafRow').hidden = !leaf;
    const [h1, h2] = document.querySelectorAll('#hinges button');
    h1.textContent = `the corner ${f.corner === 'end' ? w.to : w.from} side`;
    h1.classList.toggle('on', f.hingeAt === 'corner'); h2.classList.toggle('on', f.hingeAt === 'other');
    document.querySelector('#hinges [data-h="both"]').classList.toggle('on', f.hingeAt === 'both');
    const [i1, i2] = document.querySelectorAll('#intos button');
    i1.textContent = f.type === 'window' ? 'inwards' : slides ? `this side (${room.name || room.id})` : `into ${room.name || room.id}`; i2.textContent = f.type === 'window' ? 'outwards' : slides ? 'the other side' : 'away from this room';
    i1.classList.toggle('on', f.into === 'room'); i2.classList.toggle('on', f.into === 'other');
    const d = OPENING_DEFAULTS[f.type], top = wallProfile(lv.walls.find(x => x.id === w.walls[0]) || {}, lv).top;
    $('width').placeholder = d.width; $('sill').placeholder = d.sill; $('head').placeholder = Math.min(d.head, top || d.head);
    $('del').hidden = !f.id;
    $('err').textContent = '';
  }
  drawMap();
}

const count = (lv, w) => (lv.openings || []).filter(o => w.walls.includes(o.wall)).length + (lv.fixtures || []).filter(x => x.attach && w.walls.includes(x.attach.wall)).length;
const ceilingLamps = lv => { const room = (lv.rooms || []).find(r => r.id === roomId); return (lv.fixtures || []).filter(x => x.pos && room && pointInPolygon(x.pos, room.polygon)); };

/**
 * How thick the wall is, per stored part of this room wall (a split wall or a facade has several).
 * Between two rooms the thickness is the gap between them, so it is shown, not typed.
 */
function thicknessRows(lv, w) {
  let editable = false;
  return w.walls.map(id => {
    const x = lv.walls.find(v => v.id === id), rf = revealField(lv, id), part = w.walls.length > 1 ? ` (${esc(id)})` : '';
    if (isShared(x, new Map((lv.rooms || []).map(r => [r.id, r])))) return `<div class="help">Thickness${part}: ${x.thickness} mm, the gap between the two rooms (set by where they are).</div>`;
    editable = true;
    return `<div class="two" style="align-items:end"><label class="f" style="margin:0">Thickness${part} <small>mm${rf.value ? '' : ', still a guess'}</small><input class="big" data-thick="${esc(id)}" value="${esc(rf.value)}" placeholder="${esc(rf.placeholder)}" inputmode="numeric" autocomplete="off"></label><button data-thicksave="${esc(id)}">Save thickness</button></div>`;
  }).join('') + (editable ? `<div class="help">Measure it in a door or window opening in this wall: surface to surface through the wall (the side of the opening, smyg).</div>` : '');
}

async function saveThickness(id) {
  const input = document.querySelector(`[data-thick="${id}"]`), rf = revealField(level(), id);
  if (!rf.apply(input.value)) { $('msg').textContent = 'Nothing to change.'; return; }
  const r = setWallProps(model, levelId, id, { thickness: Number(input.value) }, opts());
  if (r.report.errors.length) { $('msg').textContent = r.report.errors.join('; '); return; }
  try {
    const stored = await store(r.model);
    if (!stored) { render(); return; }
    model = stored;
    $('msg').textContent = `Wall ${id} is now ${input.value} mm thick (saved).`;
  } catch (e) { $('msg').textContent = e.message; }
  render();
}

function wallMenu(lv, w) {
  const mine = (lv.openings || []).filter(o => w.walls.includes(o.wall));
  return `<div class="help">Wall <b>${w.name}</b> · ${w.length} mm, from corner ${w.from} to corner ${w.to}.</div>
    ${thicknessRows(lv, w)}
    <div class="three"><button data-new="door">+ Door</button><button data-new="window">+ Window</button><button data-new="passage">+ Passage</button></div>
    <div class="two"><button data-fixnew="switch">+ Switch</button><button data-fixnew="wallLamp">+ Wall lamp</button></div>
    ${mine.map(o => `<button data-o="${esc(o.id)}">${o.name ? `<b>${esc(o.name)}</b> · ` : ''}${esc(o.type)} ${o.width} mm <small>${esc(o.id)}</small>${openingAssumed(o).length ? ' · <b class="warn">still default sizes</b>' : ''}</button>`).join('')}
    ${(lv.fixtures || []).filter(x => x.attach && w.walls.includes(x.attach.wall)).map(x => `<button data-fx="${esc(x.id)}">${x.name ? `<b>${esc(x.name)}</b> · ` : ''}${x.kind === 'switch' ? 'switch' : 'wall lamp'} at ${x.z} mm <small>${esc(x.id)}</small>${x.assumed?.length ? ' · <b class="warn">height still default</b>' : ''}</button>`).join('')}
    <button data-back class="quiet">Another wall</button>`;
}

// the walls a ceiling lamp is measured from, in the colours of their pickers
const CEIL_A = '#6cb6ff', CEIL_B = '#4cc38a';

function drawMap() {
  const svg = $('map'), lv = level();
  if (!lv) return;
  const rooms = lv.rooms || [], room = rooms.find(r => r.id === roomId);
  const pts = (room ? room.polygon : rooms.flatMap(r => r.polygon)).map(toSvg);
  if (!pts.length) { svg.innerHTML = ''; $('hint').textContent = 'No rooms on this level yet: measure one first.'; return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 2000), pad = span * 0.12;
  // the room (or the level) fills the map; pinch, drag or + / − to look closer; another room shows all of it again
  const { unit } = mapView.frame({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }, `${levelId}|${roomId || ''}|${f ? 'opening' : g ? g.mode : 'pick'}`);
  const fs = unit * 15;                       // marks and labels sized in screen pixels, whatever the zoom
  const poly = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;
  // a preview of the opening being entered (not saved)
  // what is wrong with it shows while typing, not only on Save (it then is drawn in red where it would go)
  let shown = lv, previewId = null, problem = null;
  if (f) { const r = apply(); if (!r.error) { shown = r.model.levels.find(l => l.id === levelId); previewId = f.id || r.opening?.id; } else problem = r.error; liveError('err', problem); }
  if (g) {
    const r = applyFixture();
    if (!r.error) { shown = r.model.levels.find(l => l.id === levelId); previewId = g.id || r.fixture?.id; } else if (!/^type /.test(r.error)) problem = r.error;
    liveError('fixErr', problem);
  }
  const geo = buildLevelGeometry(shown);
  const walls = room ? roomWalls(lv, roomId) : [], w = edge !== null ? walls[edge] : null;
  let out = '';
  for (const r of rooms) out += `<g data-room="${esc(r.id)}">${poly(r.polygon, `fill="${r.id === roomId ? '#ffb45422' : '#252a33'}" stroke="${r.id === roomId ? '#ffb454' : '#46505f'}" stroke-width="${fs / 8}"`)}</g>`;
  // room names while picking the room you stand in
  if (!room) for (const r of rooms) {
    const lay = roomNameLayout(r.polygon, r.name || r.id, { maxSize: fs * 1.1, minSize: fs * 0.7, avoid: (lv.fixtures || []).filter(x => x.pos).map(x => x.pos) }), [cx, cy] = toSvg(lay.pos);
    out += `<text x="${cx}" y="${cy}" fill="#aeb6c2" font-size="${lay.size}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${lay.lines.map((l, k) => `<tspan x="${cx}" dy="${k ? '1.25em' : `${-(lay.lines.length - 1) * 0.625}em`}">${esc(l)}</tspan>`).join('')}</text>`;
  }
  for (const x of shown.walls || []) for (const pc of geo.pieces.get(x.id) || []) out += poly(pc, `fill="#6b7482" pointer-events="none"`);
  // the chosen wall, under what is on it so a door or window being placed stays visible
  if (w) { const [a, b] = [toSvg(w.p), toSvg(w.q)]; out += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ffb454" stroke-opacity=".35" stroke-width="${fs * 0.9}" stroke-linecap="round" pointer-events="none"/>`; }
  if (room) room.polygon.forEach((p, i) => {
    // a wide invisible line along each wall to tap it
    const q = room.polygon[(i + 1) % room.polygon.length], [a, b] = [toSvg(p), toSvg(q)];
    out += `<line data-edge="${i}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="transparent" stroke-width="${fs * 2.2}" style="cursor:pointer"/>`;
  });
  for (const o of shown.openings || []) {
    const ow = geo.wallById.get(o.wall);
    if (!ow) continue;
    const sym = openingSymbol(ow, geo.frames.get(ow.id), o), on = o.id === previewId, c = on ? '#ffffff' : o.type === 'window' ? '#6cb6ff' : o.type === 'door' ? '#e0a060' : '#8b93a1';
    const seg = ([p, q], dash) => { const [a, b] = [toSvg(p), toSvg(q)]; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}" stroke-width="${fs / (on ? 4 : 7)}"${dash ? ` stroke-dasharray="${fs / 3} ${fs / 4}"` : ''}/>`; };
    const [h0, h1] = geo.openingLine(o).map(toSvg);
    out += `<g data-opening="${esc(o.id)}"><line x1="${h0[0]}" y1="${h0[1]}" x2="${h1[0]}" y2="${h1[1]}" stroke="transparent" stroke-width="${fs * 1.6}"/>${sym.lines.map(l => seg(l)).join('')}${sym.dashed.map(l => seg(l, true)).join('')}${sym.arcs.map(a => `<path d="${arcPathSvg(toSvg(a.c), a.r, toSvg(a.from), toSvg(a.to))}" fill="none" stroke="${c}" stroke-width="${fs / 9}" stroke-dasharray="${fs / 3} ${fs / 4}"/>`).join('')}</g>`;
  }
  for (const x of shown.fixtures || []) {
    const P = geo.fixturePos(x);
    if (!P) continue;
    const [cx, cy] = toSvg(P), on = x.id === previewId, c = on ? '#ffffff' : '#f5d76e', r = fs * (on ? 0.55 : 0.45);
    out += `<g data-fixture="${esc(x.id)}"><circle cx="${cx}" cy="${cy}" r="${fs * 1.1}" fill="transparent"/>` + (x.kind === 'switch'
      ? `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${r / 3}" fill="#14161a" stroke="${c}" stroke-width="${fs / 7}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" fill-opacity=".9" stroke="#14161a" stroke-width="${fs / 12}"/>`) + '</g>';
  }
  if (room) {
    // wall letters (the chosen wall's as a badge), then corners: the one a distance counts from stands out
    if (!f && !g) out += wallLabelsSvg(room.polygon, { fs: fs * 1.15, skip: w?.i ?? null });
    if (w) out += wallMarkSvg(w.p, w.q, w.name, { fs, color: '#ffb454', d: fs * 2, line: false });
    const n = room.polygon.length, from = w && (f || (g && g.mode === 'wall')) ? ((f || g).corner === 'end' ? w.to : w.from) : null;
    if (w && (f || g)) out += measureDims(geo, shown, previewId, w, fs, problem);
    if (g && g.mode === 'ceiling') out += ceilingMarks(geo, shown, previewId, walls, fs);
    const mid = room.polygon.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
    room.polygon.forEach((p, i) => {
      const hot = w !== null && (i === w.from || i === w.to);
      out += cornerSvg(p, i, { fs, active: i === from, hot, tag: i === from ? 'from here' : '', toward: mid });
    });
  }
  svg.innerHTML = out;
  $('hint').textContent = !roomId ? 'Tap the room you are standing in. Pinch or drag the map to look closer.'
    : g ? (g.mode === 'ceiling' ? 'Drawn as you type (not saved yet): the two walls in their colours, the distances straight out from them.' : 'Drawn as you type (not saved yet), measured from the marked corner.')
    : edge === null ? 'Tap a wall (doors, windows, switches, wall lamps), or add a ceiling lamp below.'
    : f ? 'Drawn as you type (not saved yet), measured from the marked corner.' : '';
  // a problem right under the map, where it is seen while typing (the form's own line may be scrolled away)
  if (problem) $('hint').innerHTML = `<span style="color:var(--bad)">Does not fit: ${esc(problem)}</span>`;
}

/** A problem found while typing; it replaces only an earlier one of its kind, never a message from Save. */
function liveError(id, msg) {
  const el = $(id);
  if (msg) { el.textContent = msg; el.dataset.live = '1'; } else if (el.dataset.live) { el.textContent = ''; delete el.dataset.live; }
}

/** Distance from the marked corner to the opening or wall fixture being entered (and an opening's width), along the wall inside the room. */
function measureDims(geo, shown, previewId, w, fs, problem) {
  const fromEnd = (f || g).corner === 'end';
  let t0, t1;
  if (f && problem) {
    // not placeable (overlaps, does not fit): the numbers as typed, in red
    const n = id => { const v = Number($(id).value.trim()); return $(id).value.trim() !== '' && Number.isFinite(v) ? v : null; };
    const width = n('width') ?? OPENING_DEFAULTS[f.type].width, dist = n('dist');
    if (dist === null) return '';
    t0 = fromEnd ? w.length - dist - width : dist; t1 = t0 + width;
    const [a, b] = [toSvg(pointOn(w.p, w.q, t0)), toSvg(pointOn(w.p, w.q, t1))];
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#e5534b" stroke-width="${fs / 3}" pointer-events="none"/>` + wallDimsSvg(w.p, w.q, t0, t1, { fromEnd, d: fs * 4.2, fs, color: '#e5534b', widthColor: '#e5534b' });
  }
  if (f) {
    const o = (shown.openings || []).find(x => x.id === previewId), l = o && geo.openingLine(o);
    if (!l) return '';
    [t0, t1] = l.map(P => along(w.p, w.q, P)).sort((a, b) => a - b);
  } else {
    const x = (shown.fixtures || []).find(v => v.id === previewId), P = x && geo.fixturePos(x);
    if (!P) return '';
    t0 = t1 = along(w.p, w.q, P);
  }
  return wallDimsSvg(w.p, w.q, t0, t1, { fromEnd, d: fs * 4.2, fs });
}

/** A ceiling lamp: the two walls it is measured from, coloured like their pickers, and the distances straight out from them. */
function ceilingMarks(geo, shown, previewId, walls, fs) {
  const A = walls[+$('fixEdgeA').value], B = walls[+$('fixEdgeB').value];
  let out = '';
  if (A) out += wallMarkSvg(A.p, A.q, A.name, { fs, color: CEIL_A, d: fs * 0.6 });
  if (B && B !== A) out += wallMarkSvg(B.p, B.q, B.name, { fs, color: CEIL_B, d: fs * 0.6 });
  const x = (shown.fixtures || []).find(v => v.id === previewId), P = x && geo.fixturePos(x);
  if (P) for (const [e, c] of [[A, CEIL_A], [B, CEIL_B]]) if (e) out += dimensionSvg(pointOn(e.p, e.q, along(e.p, e.q, P)), P, { fs, color: c });
  return out;
}

// ---- lamps and switches ---------------------------------------------------------------------------

function newFixture(what) {
  f = null;
  g = what === 'ceiling' ? { kind: 'lamp', mode: 'ceiling' } : { kind: what === 'switch' ? 'switch' : 'lamp', mode: 'wall', corner: 'start' };
  for (const id of ['fixName', 'fixDist', 'fixDistA', 'fixDistB', 'fixZ']) $(id).value = '';
  fillWallSelects();
  render();
}

function editFixture(id) {
  const x = level().fixtures.find(v => v.id === id);
  if (!x) return;
  f = null;
  if (x.attach) {
    const m = wallPointOf(level(), roomId, x.attach);
    if (!m) return;
    edge = m.edge;
    g = { id, kind: x.kind, mode: 'wall', corner: 'start' };
    $('fixDist').value = m.distance;
  } else {
    g = { id, kind: x.kind, mode: 'ceiling' };
    fillWallSelects();
    const d = distancesInRoom(level(), roomId, x.pos);
    $('fixEdgeA').value = d.edgeA; $('fixDistA').value = d.distA; $('fixEdgeB').value = d.edgeB; $('fixDistB').value = d.distB;
  }
  $('fixZ').value = x.assumed?.includes('z') ? '' : x.z;
  $('fixName').value = x.name ?? '';
  render();
}

function fillWallSelects() {
  const walls = roomWalls(level(), roomId), opt = walls.map(w => `<option value="${w.i}">${w.name} (${w.length})</option>`).join('');
  $('fixEdgeA').innerHTML = opt; $('fixEdgeB').innerHTML = opt;
  $('fixEdgeA').value = 0;
  const across = walls.findIndex(w => Math.abs((w.q[0] - w.p[0]) * (walls[0].q[1] - walls[0].p[1]) - (w.q[1] - w.p[1]) * (walls[0].q[0] - walls[0].p[0])) > 1e-3);
  $('fixEdgeB').value = Math.max(0, across);
}

function renderFixture(lv, rooms) {
  const room = rooms.find(r => r.id === roomId), what = g.mode === 'ceiling' ? 'ceiling lamp' : g.kind === 'switch' ? 'switch' : 'wall lamp';
  $('fixWall').hidden = g.mode !== 'wall';
  $('fixCeiling').hidden = g.mode !== 'ceiling';
  if (g.mode === 'wall') {
    const w = roomWalls(lv, roomId)[edge];
    $('fixTitle').innerHTML = `${g.id ? `Edit <b>${esc(displayName(lv.fixtures.find(v => v.id === g.id)))}</b>` : `New ${what}`} on wall <b>${w.name}</b> of ${esc(room.name || room.id)} (${w.length} mm)`;
    const [cs, ce] = document.querySelectorAll('#fixCorners button');
    cs.textContent = `corner ${w.from}`; ce.textContent = `corner ${w.to}`;
    cs.classList.toggle('on', g.corner === 'start'); ce.classList.toggle('on', g.corner === 'end');
  } else $('fixTitle').innerHTML = `${g.id ? `Edit <b>${esc(displayName(lv.fixtures.find(v => v.id === g.id)))}</b>` : 'New ceiling lamp'} in ${esc(room.name || room.id)}: measure straight out from two walls that meet at an angle`;
  const ceiling = lv.ceilingHeight ?? 2400;
  $('fixZ').placeholder = g.mode === 'ceiling' ? ceiling : g.kind === 'switch' ? FIXTURE_DEFAULTS.switch.z : FIXTURE_DEFAULTS.wallLamp.z;
  $('fixZNote').textContent = g.mode === 'ceiling' ? `mm above the floor; empty = on the ceiling (${ceiling})` : 'mm above the floor, to its middle';
  $('fixDel').hidden = !g.id;
  $('fixErr').textContent = '';
}

/** The model with the form's lamp or switch in it (not saved). */
function applyFixture() {
  const n = id => { const t = $(id).value.trim(); return t === '' ? undefined : Number(t); };
  const z = n('fixZ');
  if (z !== undefined && !Number.isFinite(z)) return { error: 'height: not a number of mm' };
  let where;
  if (g.mode === 'wall') {
    const d = n('fixDist');
    if (d === undefined || !Number.isFinite(d)) return { error: 'type the distance from the corner' };
    const len = roomWalls(level(), roomId)[edge].length;
    where = placeOnWall(level(), roomId, { edge, corner: 'start', distance: g.corner === 'end' ? len - d : d });
  } else {
    const a = n('fixDistA'), b = n('fixDistB');
    if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) return { error: 'type both distances' };
    where = placeInRoom(level(), roomId, { edgeA: +$('fixEdgeA').value, distA: a, edgeB: +$('fixEdgeB').value, distB: b });
  }
  if (where.error) return { error: where.error };
  const nm = nameChange(g.id ? level().fixtures.find(v => v.id === g.id)?.name : undefined, $('fixName').value), named = nm !== undefined ? { name: nm } : {};
  const out = g.id
    ? setFixture(model, levelId, g.id, { ...where, ...(z !== undefined ? { z } : {}), ...named }, opts())
    : addFixture(model, levelId, { kind: g.kind, ...where, ...(z !== undefined ? { z } : {}), ...named }, opts());
  if (out.report.errors.length) return { error: out.report.errors.join('; ') };
  return out;
}

async function saveFixture() {
  const r = applyFixture();
  if (r.error) { $('fixErr').textContent = r.error; return; }
  if (!saveMode) { $('fixErr').textContent = 'This page cannot save (start the app with run.cmd).'; return; }
  $('fixSave').disabled = true;
  try {
    const stored = await store(r.model);
    if (!stored) throw Object.assign(new Error('Not saved yet: it was changed elsewhere too. Save again to choose.'), { quiet: true });
    model = stored;
    $('msg').textContent = `Saved ${displayName(level().fixtures.find(v => v.id === (g.id || r.fixture?.id)), g.id || r.fixture?.id)}. Link it to Home Assistant later (bindings).`;
    g = null;
  } catch (e) { $('fixErr').textContent = e.message; }
  $('fixSave').disabled = false;
  render();
}

async function removeFixture() {
  if (!g?.id || !(await askConfirm(`Delete ${g.id}?`, { ok: 'Delete' }))) return;
  const r = deleteFixture(model, levelId, g.id, opts());
  try {
    const stored = await store(r.model);
    if (!stored) { render(); return; }
    model = stored;
    $('msg').textContent = `Deleted ${g.id}.`; g = null;
  } catch (e) { $('fixErr').textContent = e.message; }
  render();
}

init().catch(e => { if (e.noHouses) $('msg').innerHTML = e.html; else $('msg').textContent = e.message; console.error(e); });
