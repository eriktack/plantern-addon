// Editor page (room-editor.html): click a room or a wall in the plan and edit it; enter measurements
// room by room, see the solved shape and residuals; undo/redo; save. All logic lives in solve.js,
// src/edit/ (operations, reconcile, inspect, history) and save.js; this file only wires the DOM.

import { resolveSettings } from '../model/settings.js';
import { validateModel } from '../model/validate.js';
import { formatJson } from '../model/format.js';
import { buildLevelGeometry, buildModelGeometry, labelObstacles } from '../geometry/level.js';
import { listHouses, openHouse, houseOptions } from '../model/house.js';
import { askConflict } from './conflict-ui.js';
import { download } from '../export/download.js';
import { toSvg } from '../render2d/coords.js';
import { solveCapture } from './solve.js';
import { importResult } from './wizard-state.js';
import { collectSnapPoints, collectSnapLines, collectSnapPointsAround, adjacentOutlines } from '../tools/snap.js';
import { createEditorMeasure } from './editor-measure.js';
import { nearestPoint, nearestLine, pointToLine } from '../tools/measure-core.js';
import { startOptions, startDots, placeAgainstEdge, placeWallAgainstEdge, bestWallAgainst, edgeWallThickness } from './start.js';
import { overlapsAfterApply, describeOverlaps } from './overlap.js';
import { bearingFromHeading, northAngleOf, roundDeg } from '../model/orientation.js';
import { buildCapture, captureToForm, captureFromPolygon, newRoomId, lockOffers, residualCells, describeLockOffer, parseNumbers } from './edit.js';
import { wallName, wallLabelsSvg } from './labels.js';
import { moveCapture, dragCorner, snapMove, dragWallEnd, moveWall, rotateObject } from './drag.js';
import { roundCapture, roundToForm, roundMovedTo, crossWall } from './round.js';
import { solidCircle, roomEdge } from '../geometry/circle.js';
import { solveExtra, checkRows, checkCorners } from '../model/checks.js';
import { suggestEntities, setBinding, sameBinding } from '../ha/suggest.js';
import { serialRunner } from './save-queue.js';
import { stripForm } from '../model/fixtures.js';
import { FITTING_DEFAULTS } from '../geometry/fittings.js';
import { checkLook } from '../ha/appearance.js';
import { compassSvg } from '../render2d/compass.js';
import { roomNameLayout, labelPoint, pointInPolygon } from '../geometry/polygon.js';
import { cornerAt } from '../edit/inspect.js';
import { applySolid, removeSolid, newSolidId, joinableWalls, joinWalls, addWall } from '../edit/ops.js';
import { SOLID_COLOR } from '../model/solids.js';
import { solidStretches, paintStrip } from '../geometry/solids.js';
import { wallLookPieces, wallFaceRooms } from '../geometry/paint.js';
import { applyStairs, removeStairs, newStairsId, addAnchor, deleteAnchor, alignLevel, addObject, setObject, deleteObject, addCheck, setCheck, deleteCheck } from '../edit/ops.js';
import { hasBody, wallFrame, wallCut } from '../geometry/walls.js';
import { cornerSvg, dimensionSvg, pointOn } from './plan-marks.js';
import { refNamer } from './ref-names.js';
import { displayName, nameChange } from '../model/names.js';
import { fitTo, pinchView } from './map-view.js';
import { anchorStatus } from '../model/anchors.js';
import { modelAreas, fmtArea } from '../geometry/area.js';
import { stairsPlan, totalRisers } from '../geometry/stairs.js';
import { renameFromName, applyRoom, removeRoom, setWallProps, unbindWall, deleteWall, linkWalls, fillWalls, setNorthAngle, splitWall, addOpening, setOpening, deleteOpening, addFixture, setFixture, deleteFixture, setMaterial, deleteMaterial, nameColor, materialFromColor } from '../edit/ops.js';
import { resolveSide, materialUse, usedColors } from '../model/materials.js';
import { sideStrips, wallProfile } from '../geometry/walls.js';
import { wallInfo, wallToForm, wallPropsFromForm, stillToMeasure, openingInfo, openingToForm, openingPropsFromForm, offsetFrom, offsetTo, measureCorners, defaultCorner } from '../edit/inspect.js';
import { openingSymbol, arcPathSvg } from '../geometry/openings.js';
import { openingAssumed } from '../model/openings.js';
import { createHistory } from '../edit/history.js';
import { levelTree, pathsTo } from '../edit/tree.js';
import { showLevelForm, showLevelEditForm } from './level-form.js';
import { chooseLocation, chooseLevel, remember, linkPages } from '../model/current.js';
import { describeReconcile } from '../edit/reconcile.js';
import { copySources, shapeDraftFrom, objectSpecFrom, openingSpecFrom, fixtureSpecFrom, stairsWithShapeOf, duplicate, findIn } from '../edit/copy.js';
import { peekInfo } from '../edit/inspect.js';
import { adjacentLevels } from '../tools/snap.js';
import { readPrefs, writePrefs } from '../model/prefs.js';
import { levelLabel } from '../model/names.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const params = new URLSearchParams(location.search);
const FIELDS = ['mode', 'lengths', 'turns', 'corners', 'diagonals', 'originRef', 'ox', 'oy', 'heading', 'closure', 'derived', 'exact', 'checks', 'locks'];

let loc, model, entry, house;   // house: where the model is loaded from and saved to (src/model/house.js)
let levelId = null;
let roomId = null;          // selected existing room id, or null while creating a new one
let draft = null;           // { name, exterior } of a new room ({ name, solid: true } of a new chimney or pillar)
let shape = 'room';         // what the measurement panel edits: a 'room' or a 'solid' (chimney, pillar)
let solved = null;          // last solver result for the form
let dirty = false;
let saveMode = null;
let curGeo = null;          // derived geometry of the current level (overlap checks)
let snaps = [];          // snap points of the current level
let snapsAround = [];    // …and those of the level below and above (where a room or solid can start)
let underlay = [];       // faint outlines of those levels
let wallId = null;       // selected wall id (then no room is selected)
let openingId = null;    // selected opening id (then no room or wall is selected)
let fixtureId = null;    // selected lamp or switch
let stairsId = null;     // selected stairs
let stairsFormFor = null;
let objectId = null;     // selected object
let objectFormFor = null;
let dragging = null;     // a lamp, switch or object being dragged on the plan
const expanded = new Set();   // open nodes of the sidebar tree (by key)
let treeShownFor = null;      // the selection the tree last opened itself to
let fixtureFormFor = null;
let openingFormFor = null;
let wallFormFor = null;  // the wall object the wall panel was last filled from (refill only when it changes)
let history = null;      // undo/redo snapshots of the model
let savedModel = null;   // the model as last loaded or saved (dirty = anything else)
let issuesNow = [];      // validation issues of the current model
let modelGeos = null;    // derived geometry of every level, from the last validation
// Edit mode: the sidebar shows only the thing being edited, with Apply / Revert / Close in a bar at the
// bottom. A single click selects; double-click, Enter or ✎ edits. Leaving with unapplied changes asks first.
let editing = null;      // { kind: 'room' | 'solid' | 'wall' | 'opening' | 'fixture' | 'material', id, back? } or null
let editSnap = null;     // the panel's field values when it was last filled (dirty = anything else)
let measure = null;      // the measuring tool on the plan (also while editing: clicks then measure)
let peekId = null;       // while editing: another level shown read-only (nothing selected or changed there)
let peekSel = null;      // { kind, id } picked on the level looked at (its info card)
let underlayMode = ['auto', 'always', 'off'].includes(readPrefs().editorUnderlay) ? readPrefs().editorUnderlay : 'auto';
let drawing = null;      // + Wall: { a: point | null, hover } while a wall is being drawn on the plan
// Zoom and pan: `view` is the part of the plan shown (SVG units, as the viewBox); null = the whole level.
let view = null, lastFit = null, autoZoomed = false, pan = null, suppressClick = false, panFrame = 0;
const touches = new Map(); let pinch = null;
const measureFrom = new Map();  // opening or wall-fixture id → the key of the corner its position is measured from (this session; measureCorners())           // two fingers on the plan: pinch to zoom

const level = () => model.levels.find(l => l.id === levelId);
const room = () => level()?.[shape === 'solid' ? 'solids' : 'rooms']?.find(r => r.id === roomId);   // the room or solid being measured
const wall = () => level()?.walls?.find(w => w.id === wallId);
const opening = () => level()?.openings?.find(o => o.id === openingId);
const fixture = () => level()?.fixtures?.find(x => x.id === fixtureId);
const stairs = () => level()?.stairs?.find(s => s.id === stairsId);
const object = () => level()?.objects?.find(o => o.id === objectId);
const opts = () => ({ settings: resolveSettings(loc, level()) });
const innerThickness = () => resolveSettings(loc, level()).wallThickness?.inner ?? 200;   // between rooms, until modelled

/** Every model change ends here: one undo step (same key = same step), then redraw. */
function commit(next, key = null) {
  model = history.push(next, key);
  dirty = model !== savedModel;
  refresh();
  queueMicrotask(afterCommit);              // after the caller has finished (it may reopen a form)
}

// ---- edit mode ----
const PANEL = { room: 'editor', solid: 'editor', wall: 'wallPanel', opening: 'openingPanel', fixture: 'fixturePanel', stairs: 'stairsPanel', object: 'objectPanel', material: 'matForm' };
const BAR = { room: ['apply', 'delRoom'], solid: ['apply', 'delRoom'], wall: ['wApply', 'wDelete'], opening: ['oApply', 'oDelete'], fixture: ['xApply', 'xDelete'], stairs: ['stApply', 'stDelete'], object: ['obApply', 'obDelete'], material: ['mApply', 'mDelete'] };
const SELECT = { room: id => selectRoom(id), solid: id => selectSolid(id), wall: id => selectWall(id), opening: id => selectOpening(id), fixture: id => selectFixture(id), stairs: id => selectStairs(id), object: id => selectObject(id) };

/** The edited panel's field values, to tell whether anything was changed and not applied. */
function panelState() {
  const el = editing && $(PANEL[editing.kind]);
  return el ? JSON.stringify([...el.querySelectorAll('input, select, textarea')].filter(c => !c.closest('#nextTo') && !c.closest('#xBindBox') && !['wSplitAt', 'oFrom', 'xFrom', 'copyFrom', 'obCopy', 'oCopy', 'xCopy', 'stCopy'].includes(c.id)).map(c => c.type === 'checkbox' ? c.checked : c.value)) : '';
}
const isDirty = () => !!editing && editSnap !== null && panelState() !== editSnap;
// A double-click is two clicks on the same thing within DOUBLE ms. Counted here, not with the browser's
// dblclick: the first click selects, which redraws the plan and the tree, and the browser then sees the
// second click land on a new element and fires no dblclick.
const DOUBLE = 450;
let lastClick = null;
function isDoubleClick(kind, id) {
  const now = performance.now(), hit = !!lastClick && lastClick.kind === kind && lastClick.id === id && now - lastClick.t < DOUBLE;
  lastClick = hit ? null : { kind, id, t: now };
  return hit;
}
// ---- new things are created by their first Apply (decision 120) ----
// + Object, + Door, + Lamp, + Stairs, a drawn wall and Duplicate put the thing into the model so the plan and its form can
// show it, but it is "fresh" until its first Apply: leaving the editor (Cancel, Esc, another click) takes it out again, Save
// waits for it, and its id is made from the name typed (ob_kitchen_cabinet) when it is applied, not before.
let fresh = null;                                                // { kind, id, autoId, base (the model before it), what }
const FRESH_ERR = { object: 'obErr', opening: 'oErr', fixture: 'xErr', wall: 'wErr', stairs: 'stErr' };
const isFresh = () => !!fresh && !!editing && editing.kind === fresh.kind && editing.id === fresh.id;
const setSelectedId = (kind, id) => { if (kind === 'object') objectId = id; else if (kind === 'opening') openingId = id; else if (kind === 'fixture') fixtureId = id; else if (kind === 'wall') wallId = id; else if (kind === 'stairs') stairsId = id; };
const forgetForms = () => { objectFormFor = null; openingFormFor = null; fixtureFormFor = null; wallFormFor = null; stairsFormFor = null; };   // the forms refill from the model
/** Call right after a new thing was made and opened: `base` is the model from before it. */
function startFresh(kind, id, base, what) { fresh = { kind, id, autoId: id, base, what }; showEditBar(); }
/** Take the unapplied new thing out again (the model goes back to before it was made). */
function discardFresh() {
  const f = fresh; fresh = null;
  if (!f) return;
  model = history.rewindTo(f.base) || f.base;
  dirty = model !== savedModel;
  setSelectedId(f.kind, null);
  forgetForms();
}
/**
 * Before something new is made: a new thing still being edited and never applied is dropped first (asking when it was
 * changed). `hosts` are the ids the new thing goes on (a wall, an opening): when that is the unapplied thing itself it must
 * be applied first, because its id is not settled yet. Returns false when it stays.
 */
function dropFresh(hosts = []) {
  if (!isFresh()) { if (fresh && !editing) fresh = null; return true; }
  if (hosts.includes(fresh.id)) { setStatus(`Apply the new ${fresh.what} first: Apply creates it and gives it its id`); return false; }
  return leaveEdit();
}
/** The first Apply of a new thing worked (or had nothing to change): it exists now, with the id its name makes. */
function settleFresh() {
  const f = fresh; fresh = null;
  $(FRESH_ERR[f.kind]).textContent = '';
  let id = f.id;
  const r = id === f.autoId ? renameFromName(model, levelId, f.kind, id, opts()) : null;
  if (r?.renamed && !r.report.errors.length) {
    id = r.id; setSelectedId(f.kind, id); if (editing) editing.id = id;           // before the commit redraws, which looks the thing up by its id
    forgetForms();
    commit(r.model);
  }
  setStatus(`${id} created (not saved yet)`);
}
function snap() { if (!editing) return; editSnap = panelState(); showEditBar(); }
function showEditBar() {
  if (!editing) return;
  const [a, d] = BAR[editing.kind], changed = isDirty();
  const isNew = isFresh();
  $('edApply').disabled = $(a).disabled;
  $('edApply').textContent = /anyway/.test($(a).textContent) ? 'Apply anyway' : isNew ? 'Apply (create)' : 'Apply';
  $('edDelete').hidden = $(d).hidden || isNew;                    // a new thing is cancelled, not deleted
  $('edDup').hidden = isNew || !(['object', 'opening', 'fixture'].includes(editing.kind) || (editing.kind === 'wall' && wall() && !wall().from?.length));
  $('edRevert').disabled = !changed;
  $('edClose').textContent = changed || isNew ? 'Cancel' : 'Close';
  $('edState').textContent = isNew ? `● new ${fresh.what}: created when you Apply` : changed ? '● changes not applied yet' : '';
}
/** Open the editor for one thing (leaving the current one first, asking if it has unapplied changes). */
function enterEdit(kind, id, o = {}) {
  if (editing && !leaveEdit({ ask: o.ask !== false, noBack: true })) return false;
  if (measure?.isOn()) measure.setOn(false);
  wallFormFor = null; openingFormFor = null; fixtureFormFor = null; stairsFormFor = null; objectFormFor = null;          // always start from what is stored
  for (const e of ['wErr', 'oErr', 'xErr', 'stErr', 'obErr', 'mErr']) $(e).textContent = '';
  if (kind === 'material') { editing = { kind, id, back: o.back }; openMaterial(id, o.forSide); }
  else { SELECT[kind]?.(id); editing = { kind, id }; }
  refresh(); snap();
  $('cap').scrollTop = 0;
  if (kind === 'room' || kind === 'solid') zoomToIfSmall(room()?.polygon);
  return true;
}
/** A new room or chimney: the editor with an empty measurement form. */
function editDraft(d) {
  if (editing && !leaveEdit({ noBack: true })) return false;
  if (measure?.isOn()) measure.setOn(false);
  roomId = null; wallId = null; openingId = null; fixtureId = null; stairsId = null; objectId = null; draft = d;
  loadFormForSelection();
  editing = { kind: d.solid ? 'solid' : 'room', id: null };
  refresh(); snap();
  $('cap').scrollTop = 0;
  return true;
}
/** Back to the house view; false when the user keeps the unapplied changes. */
function leaveEdit({ ask = true, noBack = false } = {}) {
  if (!editing) return true;
  if (isFresh()) {                                                // a new thing that was never applied: leaving removes it
    if (ask && isDirty() && !confirm(`Discard this new ${fresh.what}?`)) return false;
    discardFresh();
  } else if (ask && isDirty() && !confirm('Discard the changes you have not applied?')) return false;
  const was = editing;
  if (peekId) { peekId = null; peekSel = null; $('peekBar').hidden = true; $('peekCard').hidden = true; }
  editing = null; editSnap = null; draft = null;
  wallFormFor = null; openingFormFor = null; fixtureFormFor = null; stairsFormFor = null; objectFormFor = null;           // forms refill from the model next time
  if (was.kind === 'material') { matId = null; $('matForm').dataset.forSide = ''; }
  if (roomId) loadFormForSelection();
  if (autoZoomed) { view = null; autoZoomed = false; }
  refresh();
  if (was.back && !noBack) enterEdit(was.back.kind, was.back.id);
  return true;
}
/** Revert: the form back to what is stored. */
function revertEdit() {
  const k = editing.kind;
  if (k === 'room' || k === 'solid') loadFormForSelection();
  else if (k === 'wall') wallFormFor = null;
  else if (k === 'opening') openingFormFor = null;
  else if (k === 'fixture') fixtureFormFor = null;
  else if (k === 'stairs') stairsFormFor = null;
  else if (k === 'object') objectFormFor = null;
  else if (k === 'material') openMaterial(matId, $('matForm').dataset.forSide);
  for (const e of ['wErr', 'oErr', 'xErr', 'stErr', 'mErr']) $(e).textContent = '';
  refresh(); snap();
}
/** Is it all right to throw away unapplied changes for an action that refills the form (+ Door, Split, …)? */
const okToDiscard = () => !isDirty() || confirm('This refreshes the form: discard the changes you have not applied?');
/** After a change: follow what is edited (a new room got its id, a deleted thing ends the editor). */
function afterCommit() {
  if (!editing) return;
  const k = editing.kind;
  if (k === 'room' || k === 'solid') editing.id = roomId ?? (draft ? null : editing.id);
  if (k === 'material' && matId) editing.id = matId;
  const there = k === 'room' || k === 'solid' ? !!(room() || draft) : k === 'wall' ? !!wall() : k === 'opening' ? !!opening() : k === 'fixture' ? !!fixture() : k === 'stairs' ? !!stairs() : k === 'object' ? !!object() : !!(editing.id && model.materials?.[editing.id]);
  if (!there) { editing = null; editSnap = null; refresh(); return; }
  snap();
}
function undoRedo(which) {
  if (editing) { setStatus('Close the editor first (Esc); inside a field Ctrl+Z undoes your typing'); return; }
  model = which === 'undo' ? history.undo() : history.redo();
  dirty = model !== savedModel;
  if (!level()) { levelId = model.levels[0].id; roomId = null; wallId = null; draft = null; }
  fillLevels();
  if (roomId && !room()) roomId = null;
  if (wallId && !wall()) wallId = null;
  if (openingId && !opening()) openingId = null;
  if (fixtureId && !fixture()) fixtureId = null;
  if (stairsId && !stairs()) stairsId = null;
  if (objectId && !object()) objectId = null;
  openingFormFor = null; fixtureFormFor = null;
  $('north').value = northAngleOf(model) || '';
  wallFormFor = null;
  if (!wallId) loadFormForSelection();
  refresh();
  setStatus(which === 'undo' ? 'undone' : 'redone');
}
const setStatus = t => ($('status').textContent = t);

async function init() {
  const index = await listHouses();
  const locId = chooseLocation(index, params.get('loc'));
  house = await openHouse(index, locId);
  entry = house.entry;
  saveMode = house.canSave ? house.saveMode : null;
  remember(locId); linkPages(locId);
  $('loc').innerHTML = houseOptions(index, locId);
  $('loc').onchange = () => { if (!dirty || confirm('Discard unsaved changes?')) { remember($('loc').value); params.set('loc', $('loc').value); params.delete('level'); location.search = params; } else $('loc').value = locId; };

  loc = house.location; model = house.model;
  house.watch(changedElsewhere);
  document.title = `Plantern · Editor · ${loc.name}`;
  savedModel = model;

  if (!model.levels.length) {
    // a new house: the first level comes before anything else (it is part of the first undo state)
    setStatus('create the first level to start');
    const r = await new Promise(resolve => showLevelForm($('levelBox'), model, { onCreate: resolve }));
    model = r.model; dirty = true;
  }
  history = createHistory(model);
  levelId = chooseLevel(model, locId, params.get('level'));
  remember(locId, levelId); linkPages(locId, levelId);
  fillLevels();
  $('level').onchange = () => {
    if ($('level').value === NEW_LEVEL) { $('level').value = levelId; newLevel(); return; }
    goToLevel($('level').value);
  };
  $('uMode').onclick = () => { underlayMode = { auto: 'always', always: 'off', off: 'auto' }[underlayMode]; writePrefs({ editorUnderlay: underlayMode }); showUnderlayMode(); draw(); };
  showUnderlayMode();

  FIELDS.filter(f => f !== 'originRef').forEach(f => $(f).addEventListener('input', recompute));
  $('originRef').addEventListener('change', () => pickStart($('originRef').value));
  // the panel can be resized by dragging its left edge; the width is remembered in this browser
  try { const wd = Number(localStorage.getItem('plantern.editor.aside')); if (wd >= 240) $('cap').style.width = `${wd}px`; } catch { /* no storage */ }
  $('resizer').addEventListener('pointerdown', e => {
    const bar = $('resizer'); bar.setPointerCapture(e.pointerId); bar.classList.add('drag');
    const move = ev => { $('cap').style.width = `${Math.max(240, Math.min(innerWidth * 0.7, innerWidth - ev.clientX))}px`; };
    const up = () => { bar.classList.remove('drag'); bar.removeEventListener('pointermove', move); try { localStorage.setItem('plantern.editor.aside', parseInt($('cap').style.width, 10)); } catch { /* no storage */ } draw(); };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up, { once: true });
  });
  $('north').value = northAngleOf(model) || '';
  $('north').addEventListener('input', () => {
    const t = $('north').value.trim(), v = t === '' ? 0 : Number(t);
    const r = setNorthAngle(model, v);
    if (!r.report.errors.length) commit(r.model, 'north');
  });
  $('name').addEventListener('input', () => { if (draft) { draft.name = $('name').value; $('rid').value = draft.solid ? newSolidId(model, draft.name || $('sKind').value) : newRoomId(model, draft.name); refreshNextTo(); } recompute(); });
  $('sShape').addEventListener('change', () => { if (isRound()) loadRound(solved?.capture?.mode === 'circle' ? solved.capture : null); else syncRound(); recompute(); });
  $('rRoom').addEventListener('change', () => { fillRoundWalls(); syncRound(); recompute(); });
  for (const id of ['rWA', 'rWB']) $(id).addEventListener('change', recompute);
  for (const id of ['rDia', 'rDA', 'rDB', 'rX', 'rY']) $(id).addEventListener('input', recompute);
  $('sKind').addEventListener('change', () => {
    if (draft?.solid && !draft.name) $('rid').value = newSolidId(model, $('sKind').value);
  });
  // the edit bar: Apply / Revert / Close (Cancel with unapplied changes) / Delete
  $('edApply').onclick = () => {
    const f = isFresh() ? fresh : null, before = model;
    $(BAR[editing.kind][0]).click();
    // the first Apply creates a new thing, also when the defaults are fine as they are ("Nothing changed")
    if (f && fresh === f && (model !== before || $(FRESH_ERR[f.kind]).textContent === 'Nothing changed.')) settleFresh();
  };
  $('edDelete').onclick = () => $(BAR[editing.kind][1]).click();
  $('edRevert').onclick = revertEdit;
  $('edClose').onclick = () => leaveEdit();
  $('edBack').onclick = () => leaveEdit();
  for (const ev of ['input', 'change']) $('edit').addEventListener(ev, () => queueMicrotask(showEditBar));
  $('exterior').addEventListener('change', () => { if (draft) draft.exterior = $('exterior').checked; recompute(); });
  $('newSolid').onclick = () => { if (editDraft({ name: '', solid: true })) $('name').focus(); };
  $('copyFrom').onchange = () => { const v = $('copyFrom').value; if (v) useShapeOf(v); };
  for (const [sel, kind] of [['obCopy', 'object'], ['oCopy', 'opening'], ['xCopy', 'fixture'], ['stCopy', 'stairs']]) $(sel).onchange = () => copyInto(kind, $(sel).value);
  $('edDup').onclick = duplicateEdited;
  $('newRoom').onclick = () => { if (editDraft({ name: '', exterior: false })) $('name').focus(); };
  $('importBtn').onclick = () => { $('importBox').hidden = !$('importBox').hidden; $('importText').focus(); };
  $('importUse').onclick = () => importRoom($('importText').value);
  $('ntEdge').onchange = () => ntPickEdge($('ntEdge').value);
  $('ntOwn').onchange = ntPreview;
  $('nextTo').addEventListener('toggle', () => { if ($('nextTo').open) { ntFillOwn(); ntPreview(); } else draw(); });
  $('ntT').addEventListener('input', ntPreview); $('ntSlide').addEventListener('input', ntPreview);
  $('ntUse').onclick = ntUse;
  $('apply').onclick = apply;
  $('delRoom').onclick = deleteRoom;
  $('fromPoly').onclick = () => { const r = room(); if (r) { loadForm(captureFromPolygon(r.polygon)); recompute(); } };
  $('linkWalls').onclick = doLinkWalls;
  $('fillWalls').onclick = doFillWalls;
  $('wApply').onclick = applyWall;
  $('wUnbind').onclick = () => {
    if (!okToDiscard()) return;
    const id = wallId, r = unbindWall(model, levelId, id, opts());
    if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
    commit(r.model); setStatus(`${id} is a hand-drawn wall now (not saved yet)`);
  };
  $('wDelete').onclick = removeWall;
  $('wSloped').addEventListener('change', () => {
    // ticking it starts from the wall's current flat heights at both ends
    if ($('wSloped').checked && !$('wTopA').value && !$('wTopB').value) {
      const w = level().walls.find(x => x.id === wallId), e = w && wallProfile(w, level()).ends;
      if (e) { $('wTopA').value = e.top.a; $('wTopB').value = e.top.b; $('wBottomA').value = e.bottom.a || ''; $('wBottomB').value = e.bottom.b || ''; }
    }
    showSlopeRows();
  });
  for (const S of ['Left', 'Right']) {
    $(`w${S}Mode`).addEventListener('change', showSideRows);
    $(`w${S}Color`).addEventListener('input', showSideRows);
    // a new material from a wall side: its own editor, back to the wall when closed
    $(`w${S}Mat`).addEventListener('change', () => { if ($(`w${S}Mat`).value === '+new') { $(`w${S}Mat`).value = ''; const back = { kind: 'wall', id: wallId }; enterEdit('material', '', { forSide: S.toLowerCase(), back }); } });
  }
  $('newMat').onclick = () => enterEdit('material', '');
  $('mApply').onclick = applyMaterial;
  $('mColor').addEventListener('input', materialSwatches);
  $('mClose').onclick = () => leaveEdit();
  $('mDelete').onclick = () => {
    const r = deleteMaterial(model, matId);
    if (r.report.errors.length) { $('mErr').textContent = r.report.errors.join('; '); return; }
    matId = null; $('matForm').hidden = true; commit(r.model);
  };
  for (const [btn, type] of [['wAddDoor', 'door'], ['wAddWindow', 'window'], ['wAddPassage', 'passage']]) $(btn).onclick = () => {
    if (!dropFresh([wallId]) || !okToDiscard()) return;
    const base = model, r = addOpening(model, levelId, wallId, type, {}, opts());
    if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
    commit(r.model); enterEdit('opening', r.opening.id, { ask: false }); startFresh('opening', r.opening.id, base, type);
    setStatus(`${r.opening.id} is a new ${type} with default sizes: measure it, name it and Apply to create it`);
  };
  $('oApply').onclick = applyOpening;
  const placeFixture = (spec, what) => {
    if (!dropFresh([spec.attach?.wall, spec.attach?.opening]) || !okToDiscard()) return;
    const base = model, r = addFixture(model, levelId, spec, opts());
    if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
    commit(r.model); enterEdit('fixture', r.fixture.id, { ask: false }); startFresh('fixture', r.fixture.id, base, spec.kind === 'switch' ? 'switch' : spec.kind === 'strip' ? 'LED strip' : 'lamp');
    setStatus(`${r.fixture.id} is new: ${what}. Name it and Apply to create it`);
  };
  $('newStairs').onclick = newStairs;
  $('editLevel').onclick = editLevel;
  $('sBaseDown').onclick = e => {
    e.preventDefault();
    const ft = level().floorThickness ?? 0;
    if (!ft) { setStatus('This level has no floor build-up to go down through'); return; }
    $('sBase').value = -ft; $('sBase').dispatchEvent(new Event('input', { bubbles: true }));
  };
  $('newObject').onclick = () => {
    const rm = shape === 'room' ? room() : null, at = rm || level().rooms?.[0];
    if (!at) { setStatus('Add a room first'); return; }
    placeObject({ pos: labelPoint(at.polygon).pos.map(v => Math.round(v)) }, 'in the middle of the room: drag it where it belongs');
  };
  $('wAddObject').onclick = () => { const w = wall(); placeObject({ attach: { wall: w.id, side: wallInfo(level(), w.id)?.sides?.right?.length ? 'right' : 'left', offset: Math.max(0, Math.round((Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) - 900) / 2)) } }, 'on the wall: drag it along, or set its position'); };
  $('obApply').onclick = applyObjectForm;
  $('obDelete').onclick = () => {
    if (!confirm(`Delete ${objectId}?`)) return;
    const r = deleteObject(model, levelId, objectId, opts());
    if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
    objectId = null; commit(r.model);
  };
  $('xBind').onclick = saveBinding;
  for (const id of ['xLookBri', 'xLookK']) $(id).addEventListener('change', saveBinding);
  for (const id of ['xLookUseColor', 'xLookColor']) $(id).addEventListener('change', saveBinding);
  $('xEntity').addEventListener('input', () => showEntityPick(true));
  $('xEntity').addEventListener('focus', () => showEntityPick(true));
  $('xEntity').addEventListener('blur', () => showEntityPick(false));
  $('preview').addEventListener('pointerdown', dragStart);
  addEventListener('pointermove', dragMove);
  addEventListener('pointerup', () => { const was = dragging; if (was?.moved) suppressClick = true; dragging = null; if (was?.moved && ['room', 'corner', 'wall', 'wallend'].includes(was.kind)) { draw(); if (was.msg) setStatus(was.msg); } });
  $('anAdd').onclick = () => {
    const r = addAnchor(model, { refs: [$('anA').value, $('anB').value] });
    if (r.report.errors.length) { $('anErr').textContent = r.report.errors.join('; '); return; }
    $('anErr').textContent = '';
    commit(r.model);
    setStatus(`${r.anchor.id} added (not saved yet)`);
  };
  $('stApply').onclick = applyStairsForm;
  $('stDelete').onclick = () => {
    if (!confirm(`Delete ${stairsId}? The opening it makes in the floor above goes with it.`)) return;
    const r = removeStairs(model, levelId, stairsId, opts());
    if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
    stairsId = null; commit(r.model);
  };
  for (const id of ['stShape', 'stLanding', 'stRef', 'stUnder', 'stRail']) $(id).onchange = syncStairsRows;
  $('obAddStrip').onclick = () => {                               // under the front of the object (the side farthest from its wall)
    const o = object(), fp = o && curGeo.objectFootprint(o);
    if (!fp) return;
    const a = o.attach && curGeo.resolveAttach(o.attach);
    const mid = i => [(fp[i][0] + fp[(i + 1) % fp.length][0]) / 2, (fp[i][1] + fp[(i + 1) % fp.length][1]) / 2];
    let edge = 0;
    if (a) { let far = -Infinity; fp.forEach((_, i) => { const d = (mid(i)[0] - a.p[0]) * a.dir[0] + (mid(i)[1] - a.p[1]) * a.dir[1]; if (d > far) { far = d; edge = i; } }); }
    placeFixture({ kind: 'strip', attach: { object: o.id, edge, at: 'bottom' } }, `under the ${a ? 'front' : 'first side'} of the object; choose the side and whether it is under or on top`);
  };
  $('oAddStrip').onclick = () => {                                // along the window (its sill) or door (its top), on the room side
    const o = opening(), w = o && level().walls.find(v => v.id === o.wall);
    if (!w) return;
    placeFixture({ kind: 'strip', attach: { opening: o.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', at: o.type === 'window' ? 'sill' : 'head' } }, `along the ${o.type === 'window' ? 'sill' : 'top'} of the ${o.type}; choose which edge and which side of the wall`);
  };
  $('wAddStrip').onclick = () => {
    const w = wall(), L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), length = Math.min(1200, Math.round(L / 2));
    placeFixture({ kind: 'strip', attach: { wall: w.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', offset: Math.round((L - length) / 2), length } }, 'along the middle of the wall; set where it starts and how long it is');
  };
  $('addCeilingLamp').onclick = () => placeFixture({ kind: 'lamp', pos: labelPoint(room().polygon).pos }, 'in the middle of the room; set its position and height');
  $('wAddSwitch').onclick = () => { const w = wall(), L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); placeFixture({ kind: 'switch', attach: { wall: w.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', offset: Math.round(L / 2) } }, 'in the middle of the wall'); };
  $('wAddWallLamp').onclick = () => { const w = wall(), L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); placeFixture({ kind: 'lamp', attach: { wall: w.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', offset: Math.round(L / 2) } }, 'in the middle of the wall'); };
  $('xApply').onclick = applyFixture;
  $('oAddLamp').onclick = () => {                                 // a lamp that stands in this opening (window star, lamp on the sill)
    const o = opening(), w = o && level().walls.find(v => v.id === o.wall);
    if (!w) return;
    placeFixture({ kind: 'lamp', attach: { wall: w.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', offset: Math.round(o.offset + o.width / 2), opening: o.id }, z: Math.round((o.sill + o.head) / 2), assumed: ['z'] }, 'in the middle of the opening; set its position and height');
  };
  $('xDelete').onclick = () => {
    if (!confirm(`Delete ${fixtureId}? (A Home Assistant binding for it in location.json would then point at nothing.)`)) return;
    const r = deleteFixture(model, levelId, fixtureId, opts());
    if (r.report.errors.length) { $('xErr').textContent = r.report.errors.join('; '); return; }
    fixtureId = null; commit(r.model);
  };
  $('oDelete').onclick = () => {
    if (!confirm(`Delete ${openingId}?`)) return;
    const w = opening()?.wall, r = deleteOpening(model, levelId, openingId, opts());
    if (r.report.errors.length) { $('oErr').textContent = r.report.errors.join('; '); return; }
    commit(r.model); selectWall(w);
  };
  $('oBack').onclick = () => enterEdit('wall', opening()?.wall);
  for (const id of ['oType', 'oOpens', 'oDoorOpens']) $(id).addEventListener('change', showOpeningRows);
  $('wSplit').onclick = () => { if (okToDiscard()) doSplit(); };
  $('wSplitAt').addEventListener('input', draw);
  for (const id of ['oOffset', 'oWidth', 'xOffset']) $(id).addEventListener('input', draw);
  for (const id of ['stRef', 'wAnchA', 'wAnchB', 'anA', 'anB']) $(id).addEventListener('change', draw);
  $('oFrom').addEventListener('change', () => switchFrom('opening'));
  $('xFrom').addEventListener('change', () => switchFrom('fixture'));    // the chosen point is ringed on the plan
  $('anchorCount').closest('details').addEventListener('toggle', draw);   // the distance on the plan follows the typing
  $('undo').onclick = () => undoRedo('undo');
  $('redo').onclick = () => undoRedo('redo');
  measure = createEditorMeasure({
    svg: $('preview'), dom: { btn: $('mOn'), modes: $('mModes'), read: $('mRead') },
    snaps: () => snapsAround, lines: linesAround, name: refName,
    onChange: on => { if (on) { lastClick = null; endPeek(); selectNone(); } },
    onPin: (a, b, measured) => {
      const r = addCheck(model, { a, b, measured, note: 'measured in the Editor' }, opts());
      if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
      commit(r.model);
      setStatus(`${r.check.id} kept: ${refName(a)} ↔ ${refName(b)}, ${measured} mm (not saved yet)`);
    },
  });
  $('preview').addEventListener('mousemove', e => { if (drawing) { drawing.hover = wallPoint(e); drawing.shift = e.shiftKey; drawWallOverlay(); } else measure.hover(e); });
  $('newWall').onclick = startDrawing;
  // a different corner for the start: the wall stays where it is, its start is now counted from that corner
  $('wAnchA').addEventListener('change', () => {
    const prev = snapPos($('wAnchA').dataset.was) || [0, 0], v = ['wSx', 'wSy', 'wLx', 'wLy'].map(id => Number($(id).value));
    const a = [prev[0] + v[0], prev[1] + v[1]];
    fillWallPos(a, [a[0] + v[2], a[1] + v[3]]);
  });
  for (const id of ['wSx', 'wSy', 'wLx', 'wLy']) $(id).addEventListener('input', () => { showWallPos(); draw(); });
  // kept along x or y: the shorter of the two lengths becomes 0
  $('wLock').addEventListener('change', () => {
    if (!$('wLock').checked) return;
    const x = Number($('wLx').value), y = Number($('wLy').value);
    if (Number.isFinite(x) && Number.isFinite(y) && x && y) { $(Math.abs(x) >= Math.abs(y) ? 'wLy' : 'wLx').value = 0; showWallPos(); draw(); }
  });
  // zoom with the wheel (around the pointer) or the buttons, move the plan by dragging it
  $('preview').addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.0015))), e); }, { passive: false });
  $('zIn').onclick = () => zoomAt(1 / 1.4);
  $('zOut').onclick = () => zoomAt(1.4);
  $('zFit').onclick = () => { view = null; autoZoomed = false; draw(); };
  $('preview').addEventListener('pointerdown', e => {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && lastFit) {
      // two fingers: pinch to zoom (whatever the first finger had started is dropped)
      const svg = $('preview'), r = svg.getBoundingClientRect(), [a, b] = [...touches.values()].map(p => [p[0] - r.left, p[1] - r.top]);
      pinch = { vb: fitTo(view || lastFit, svg.clientWidth, svg.clientHeight), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
      pan = null; dragging = null;
      return;
    }
    if (dragging) return;                                          // this pointer moves a lamp or an object, not the plan
    if (e.button === 0 || e.button === 1) pan = { x: e.clientX, y: e.clientY, vb: { ...(view || lastFit) }, moved: false };
  });
  addEventListener('pointermove', e => {
    if (pinch && touches.has(e.pointerId)) {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size < 2) return;
      const svg = $('preview'), r = svg.getBoundingClientRect(), [a, b] = [...touches.values()].map(p => [p[0] - r.left, p[1] - r.top]);
      view = pinchView(pinch.vb, [svg.clientWidth, svg.clientHeight], pinch.m, pinch.d, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.hypot(a[0] - b[0], a[1] - b[1]), { min: 300, max: lastFit.w * 4 });
      autoZoomed = false; suppressClick = true;
      cancelAnimationFrame(panFrame); panFrame = requestAnimationFrame(draw);
      return;
    }
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < 5) return;               // a click, not a drag (yet)
    pan.moved = true; $('preview').classList.add('panning');
    const k = 1 / Math.abs($('preview').getScreenCTM()?.a || 1);
    view = { ...pan.vb, x: pan.vb.x - dx * k, y: pan.vb.y - dy * k }; autoZoomed = false;
    cancelAnimationFrame(panFrame); panFrame = requestAnimationFrame(draw);
  });
  const lift = e => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (pan?.moved) suppressClick = true;
    pan = null; $('preview').classList.remove('panning');
    // a finger lifted after a pinch or a drag brings no click: do not swallow the next real one
    if (!touches.size && suppressClick) setTimeout(() => { suppressClick = false; }, 350);
  };
  addEventListener('pointerup', lift);
  addEventListener('pointercancel', lift);
  $('preview').addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; return; }        // the end of a drag that moved the plan
    if (peekId) {                                                // looking at another level: read, never select or leave
      const pk = e.target.closest('[data-pk]');
      if (pk) { const [k, id] = pk.dataset.pk.split('|'); showPeekCard(k, id); } else { peekSel = null; $('peekCard').hidden = true; draw(); }
      return;
    }
    if (drawing) { drawingClick(e); return; }                    // + Wall: the start, then the end
    const ntHit = e.target.closest('[data-ntedge]');              // "Place next to another room": a neighbour's wall
    if (ntHit) { ntPickEdge(ntHit.dataset.ntedge); return; }
    if (measure.click(e)) return;                                // measuring: clicks pick points and planes
    const pt = e.target.closest('[data-ref]') || nearStartDot(e);    // a start point for corner 0 (while editing a room)
    if (pt) { pickStart(pt.dataset.ref); return; }
    const el = e.target.closest('[data-kind]'), kind = el?.dataset.kind, id = el?.dataset.id;
    if (editing) {
      if (el && editing.kind === kind && editing.id === id) return;          // inside what is being edited
      if (!leaveEdit()) return;                                             // anywhere else: leave it (asked when changed)
    }
    if (!el) { lastClick = null; selectNone(); return; }          // empty space: let go of the selection
    if (isDoubleClick(kind, id)) { enterEdit(kind, id); return; }           // double-click: edit it
    SELECT[kind]?.(id);
  });
  addEventListener('keydown', e => {
    const inField = e.target?.closest?.('input, textarea, select');
    if (e.key === 'Escape') {
      if (drawing) { stopDrawing(); return; }
      if (peekId) { e.preventDefault(); endPeek(); return; }              // back to the level being edited
      if (measure.isOn() && !inField) { measure.escape(); return; }         // measuring (also while editing): stop that first
      if (editing) { e.preventDefault(); e.target?.blur?.(); leaveEdit(); return; }
      if (!inField) { selectNone(); return; }
    }
    if ((e.key === 'm' || e.key === 'M') && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) { measure.toggle(); return; }
    if (e.key === 'Enter' && !editing && !inField && !e.target?.closest?.('button')) {
      const sel = roomId ? [shape, roomId] : wallId ? ['wall', wallId] : openingId ? ['opening', openingId] : fixtureId ? ['fixture', fixtureId] : stairsId ? ['stairs', stairsId] : objectId ? ['object', objectId] : null;
      if (sel) { e.preventDefault(); enterEdit(...sel); return; }
    }
    if (!(e.ctrlKey || e.metaKey) || e.target.closest('input, textarea, select')) return;   // fields keep their own undo
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoRedo('undo'); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); undoRedo('redo'); }
  });
  $('save').onclick = save;
  $('dl').onclick = () => download(new Blob([formatJson(model)], { type: 'application/json' }), 'model.json');
  $('save').disabled = !saveMode;
  if (!saveMode) $('saveOut').textContent = house.readOnly ? `${house.where} is read-only: use Download, or copy the house to your own storage on the Storage page.` : 'This page cannot save. Start Plantern with run.cmd (or use Chrome/Edge on the PC); until then use Download and replace the file by hand.';
  $('save').title = saveMode === 'server' ? `Save into ${house.where}` : saveMode ? 'Save into the repo folder you pick (first time only)' : 'This page cannot save: use Download';
  addEventListener('beforeunload', e => { if (dirty || isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  roomId = null;                                                  // start with nothing selected: the plan and the tree
  loadFormForSelection();
  refresh();
  if (!level().rooms?.length) editDraft({ name: '', exterior: false });   // an empty level: the new-room form
  let pending = null;
  try { pending = localStorage.getItem('plantern.import'); localStorage.removeItem('plantern.import'); } catch { /* no storage */ }
  if (pending) importRoom(pending);
}

const NEW_LEVEL = '+new';
const LEVEL_COLOR = { below: '#7aa2d6', above: '#d6a56b' };   // the level below and above, faintly under the plan
const DOT_HIT = 0.95;                                            // a start dot reacts this far out (× the label size)
function fillLevels() {
  $('level').innerHTML = model.levels.map(l => `<option value="${esc(l.id)}">${esc(levelLabel(l))}${l.elevationFrom ? ' ⇅' : ''}</option>`).join('') + `<option value="${NEW_LEVEL}">+ New level…</option>`;
  $('level').value = levelId;
}
/** Show another level (leaving what is edited first, asked when changed); false when the user stays. */
function goToLevel(id) {
  if (!model.levels.some(l => l.id === id)) return false;
  if (editing && !leaveEdit()) { $('level').value = levelId; return false; }
  levelId = id; roomId = null; wallId = null; openingId = null; fixtureId = null; stairsId = null; objectId = null; draft = null; view = null; autoZoomed = false;
  remember(entry.id, levelId); linkPages(entry.id, levelId);
  $('level').value = levelId;
  loadFormForSelection();
  refresh();
  return true;
}

// ---- the levels below and above: faintly under the plan, and looked at while editing ----
function showUnderlayMode() {
  $('uMode').textContent = `Levels: ${underlayMode}`;
  $('uMode').title = { auto: 'Levels below (blue) and above (amber) show faintly while placing something. Click: always', always: 'Levels below and above always show faintly. Click: never', off: 'Levels below and above are not shown. Click: while placing something' }[underlayMode];
}
/** Is the faint underlay of the neighbouring levels drawn now? */
function showUnderlay() {
  if (underlayMode === 'off') return false;
  if (underlayMode === 'always') return true;
  return !!drawing || (!!editing && ['room', 'solid', 'stairs'].includes(editing.kind)) || (!editing && $('anchorCount').closest('details').open);
}
/** The level strip on the plan while editing: every level of the building; click one to look at it. */
function renderLevelStrip() {
  const lv = level(), same = model.levels.filter(l => (l.building ?? null) === (lv.building ?? null)).sort((a, b) => b.elevation - a.elevation);
  const show = !!editing && same.length > 1;
  $('lvStrip').hidden = !show;
  if (!show) return;
  const near = adjacentLevels(model, lv).map(l => l.id), shown = peekId || levelId;
  $('lvStrip').innerHTML = same.map(l => {
    const cls = [l.id === shown ? 'on' : '', l.id === levelId ? 'edited' : '', near.includes(l.id) ? (l.elevation < lv.elevation ? 'below' : 'above') : ''].filter(Boolean).join(' ');
    return `<button data-lv="${esc(l.id)}" class="${cls}" title="${l.id === levelId ? 'The level you are editing' : `Look at ${esc(l.name || l.id)} (nothing there is changed; you keep editing)`}">${esc(l.name || l.id)}${l.id === levelId ? ' ✎' : ''}</button>`;
  }).join('');
  $('lvStrip').querySelectorAll('[data-lv]').forEach(b => (b.onclick = () => (b.dataset.lv === levelId ? endPeek() : startPeek(b.dataset.lv))));
}
function startPeek(id) {
  if (measure?.isOn()) measure.setOn(false);
  peekId = id; peekSel = null;
  const pl = model.levels.find(l => l.id === id);
  $('peekBar').hidden = false;
  $('peekBar').innerHTML = `<span>Looking at <b>${esc(pl?.name || id)}</b>, still editing <b>${esc(editing?.id ? nameOf(editing.id) : 'the new one')}</b> on ${esc(level().name || levelId)}. Click a wall or room to read it.</span><button id="peekBack">‹ Back</button>`;
  $('peekBack').onclick = endPeek;
  $('peekCard').hidden = true;
  renderLevelStrip(); draw();
}
function endPeek() {
  if (!peekId) return;
  peekId = null; peekSel = null;
  $('peekBar').hidden = true; $('peekCard').hidden = true;
  renderLevelStrip(); draw();
}
/** The info card for something on the level looked at. */
function showPeekCard(kind, id) {
  const pl = model.levels.find(l => l.id === peekId), c = pl && peekInfo(pl, kind, id, { name: refName });
  peekSel = c ? { kind, id } : null;
  $('peekCard').hidden = !c;
  if (c) $('peekCard').innerHTML = `<h3>${esc(c.title)} <small class="k">${esc(c.sub)}</small></h3>${c.rows.map(([k, v]) => `<div><span class="k">${esc(k)}:</span> ${esc(v)}</div>`).join('')}`;
  draw();
}

/**
 * Another level, read-only, while the editor stays open: its rooms, walls, solids, openings and stairs,
 * clickable for the info card, with the level being edited faintly on top (and the room being measured).
 */
function drawPeek() {
  const svg = $('preview'), pl = model.levels.find(l => l.id === peekId), geo = (modelGeos || buildModelGeometry(model)).get(peekId);
  if (!pl || !geo) { peekId = null; draw(); return; }
  if (!lastFit) {
    const pts = (pl.rooms || []).flatMap(r => r.polygon).map(toSvg);
    if (!pts.length) { svg.innerHTML = ''; return; }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 1000;
    lastFit = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
  }
  const vb = view || lastFit;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const fs = Math.max(vb.w / (svg.clientWidth || 800), vb.h / (svg.clientHeight || 600)) * 16;
  const poly = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;
  const on = (k, id) => peekSel?.kind === k && peekSel.id === id;
  let out = `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="${fs * 0.7}" height="${fs * 0.7}" patternTransform="rotate(45)"><rect width="${fs * 0.7}" height="${fs * 0.7}" fill="#6b7482"/><line x1="0" y1="0" x2="0" y2="${fs * 0.7}" stroke="#ffb454" stroke-width="${fs / 6}"/></pattern></defs>`;
  const obstacles = labelObstacles(pl, geo);
  for (const r of pl.rooms || []) {
    if (!(r.polygon?.length >= 3)) continue;
    out += `<g data-pk="room|${esc(r.id)}" style="cursor:help">${poly(r.polygon, `fill="${r.exterior ? '#243026' : '#252a33'}" stroke="${on('room', r.id) ? '#ffb454' : '#46505f'}" stroke-width="${fs / (on('room', r.id) ? 4 : 8)}"`)}</g>`;
    const lay = roomNameLayout(r.polygon, r.name || r.id, { maxSize: fs * 1.2, minSize: fs * 0.6, avoid: obstacles }), [cx, cy] = toSvg(lay.pos);
    out += `<text x="${cx}" y="${cy}" fill="#8b93a1" font-size="${lay.size}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${lay.lines.map((l, k) => `<tspan x="${cx}" dy="${k ? '1.25em' : `${-(lay.lines.length - 1) * 0.625}em`}">${esc(l)}</tspan>`).join('')}</text>`;
  }
  for (const s of pl.solids || []) if (s.polygon?.length >= 3) out += `<g data-pk="solid|${esc(s.id)}" style="cursor:help">${poly(s.polygon, `fill="${esc(s.color || SOLID_COLOR)}" stroke="${on('solid', s.id) ? '#ffb454' : '#999'}" stroke-width="${fs / 8}"`)}</g>`;
  for (const w of pl.walls || []) {
    const pieces = geo.pieces.get(w.id), sel = on('wall', w.id);
    out += `<g data-pk="wall|${esc(w.id)}" style="cursor:help"><title>${esc(refName(w.id))} · ${w.kind === 'virtual' ? 'boundary' : `${Math.round(w.thickness)} mm${w.assumed?.includes('thickness') ? ' (assumed)' : ''}`}</title>`;
    if (pieces?.length) for (const pc of pieces) out += poly(pc, `fill="${w.assumed?.includes('thickness') ? 'url(#hatch)' : '#6b7482'}" ${sel ? `stroke="#ffb454" stroke-width="${fs / 4}"` : 'stroke="none"'}`);
    else { const [ax, ay] = toSvg(w.a), [bx, by] = toSvg(w.b); out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${sel ? '#ffb454' : '#6b7482'}" stroke-width="${fs / 6}" stroke-dasharray="${fs / 2}"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="transparent" stroke-width="${fs}"/>`; }
    out += '</g>';
  }
  for (const o of pl.openings || []) {
    const f = geo.frames.get(o.wall);
    if (!f) continue;
    const [h0, h1] = geo.openingLine(o).map(toSvg), c = on('opening', o.id) ? '#ffb454' : o.type === 'window' ? '#6cb6ff' : o.type === 'door' ? '#e0a060' : '#8b93a1';
    out += `<g data-pk="opening|${esc(o.id)}" style="cursor:help"><line x1="${h0[0]}" y1="${h0[1]}" x2="${h1[0]}" y2="${h1[1]}" stroke="transparent" stroke-width="${fs * 1.2}"/><line x1="${h0[0]}" y1="${h0[1]}" x2="${h1[0]}" y2="${h1[1]}" stroke="${c}" stroke-width="${fs / 5}"/></g>`;
  }
  if (geo.stairs) for (const s of stairsPlan(geo, resolveSettings(loc, pl).cutPlane).up) for (const st of s.steps) out += poly(st.poly, `fill="none" stroke="#9aa3b2" stroke-width="${fs / 14}" pointer-events="none"`);
  // the level being edited, faintly on top, and what is being measured on it
  const lv = level(), c = lv.elevation > pl.elevation ? LEVEL_COLOR.above : LEVEL_COLOR.below;
  for (const pcs of (curGeo?.pieces || new Map()).values()) for (const pc of pcs) out += poly(pc, `fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-opacity="0.6" stroke-width="${fs / 12}" pointer-events="none"`);
  const cur = solved?.ok && (editing?.kind === 'room' || editing?.kind === 'solid') ? solved.polygon : null;
  if (cur) out += poly(cur, `fill="none" stroke="#4cc38a" stroke-width="${fs / 5}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"`);
  svg.innerHTML = out;
  setStatus(`looking at ${pl.name || pl.id}: click a wall, room, solid or opening to read it · Esc or ‹ Back returns`);
}
/** ✎ beside the level menu: edit the level itself (name, heights, measurements), or delete it while it is empty. */
function editLevel() {
  if (editing && !leaveEdit()) return;
  const cls = { label: '', input: '', button: '', go: 'primary' };
  showLevelEditForm($('levelBox'), model, levelId, {
    cls,
    onApply: r => {
      model = history.push(r.model); dirty = model !== savedModel;
      fillLevels(); refresh();
      editLevel();                                         // the form again, from what is stored
      const nm = id => model.levels.find(l => l.id === id)?.name || id;
      setStatus(`level ${nm(levelId)} changed${r.report.moved?.length ? `; moved: ${r.report.moved.map(m => `${nm(m.level)} to ${m.to} mm`).join(', ')}` : ''} (not saved yet)`);
    },
    onDelete: r => {
      model = history.push(r.model); dirty = model !== savedModel;
      levelId = model.levels[0].id; roomId = null; wallId = null; draft = null;
      fillLevels(); loadFormForSelection(); refresh();
      remember(entry.id, levelId); linkPages(entry.id, levelId);
      setStatus('level deleted (not saved yet)');
    },
  });
}
function newLevel() {
  showLevelForm($('levelBox'), model, {
    onCreate: r => {
      levelId = r.level.id; roomId = null; wallId = null; draft = null;
      model = history.push(r.model); dirty = model !== savedModel;
      fillLevels(); loadFormForSelection(); refresh();
      editDraft({ name: '', exterior: false });
      remember(entry.id, levelId); linkPages(entry.id, levelId);
      setStatus(`level ${r.level.id} created (not saved yet)`);
    },
  });
}

/**
 * Pick the point corner 0 is placed at. A room that already has a shape stays where it is: the
 * offset becomes the distance from the new point to corner 0. A new room starts on the point.
 */
function pickStart(ref) {
  const c0 = solved?.ok && (roomId || draft) ? solved.polygon[0] : room()?.polygon?.[0];
  const p = ref ? snapsAround.find(s => s.ref === ref)?.pos : [0, 0];
  $('originRef').value = ref;
  if (c0 && p && roomId) { $('ox').value = Math.round((c0[0] - p[0]) * 10) / 10; $('oy').value = Math.round((c0[1] - p[1]) * 10) / 10; }
  recompute(); showEditBar();
  if (c0 && p && roomId) setStatus(`corner 0 stays where it is: ${ref || 'the plan origin'} + (${$('ox').value}, ${$('oy').value}) mm`);
}

/**
 * A click just beside a start dot (while a room or solid is edited) still picks it: the point within
 * 22 px of the click, as { dataset: { ref } } like the dot's element, or null. A near-miss must not
 * fall through to the room underneath, which would leave the editor.
 */
function nearStartDot(e) {
  if (!(editing?.kind === 'room' || editing?.kind === 'solid') || isRound()) return null;
  const svg = $('preview'), m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(m.inverse()), p = [q.x, -q.y], reach = 22 / Math.abs(m.a);
  let best = null;
  for (const o of startDots(snapsAround, { excludeRoom: roomId || $('rid').value })) {
    const d = Math.hypot(o.pos[0] - p[0], o.pos[1] - p[1]);
    if (d <= reach && (!best || d < best.d)) best = { d, ref: o.ref };
  }
  return best ? { dataset: { ref: best.ref } } : null;
}

// ---- + Wall: draw a hand-drawn wall with two clicks ----
/** The plan point under the pointer: a snap point, else a point on a wall face or room edge, else free (Alt: always free). */
function wallPoint(e) {
  const svg = $('preview'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(m.inverse()), p = [q.x, -q.y], k = 1 / Math.abs(m.a);
  if (e.altKey) return { pos: p };
  const s = nearestPoint(p, showUnderlay() ? snapsAround : snaps, 14 * k);   // a corner of the level below or above too
  if (s) return { pos: s.pos, ref: s.ref };
  const l = nearestLine(p, collectSnapLines(model, level(), curGeo), 10 * k);
  if (l) { const f = pointToLine(p, l); return { pos: f.foot.map(v => Math.round(v * 10) / 10), on: l.ref }; }
  return { pos: p.map(v => Math.round(v)) };
}
/** The end point, kept straight along x or y when close to an axis (Shift: always). */
function straighten(a, b, force) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 90;
  if (!force && Math.min(ang, 90 - ang) > 2) return b;
  return Math.abs(dx) >= Math.abs(dy) ? [b[0], a[1]] : [a[0], b[1]];
}
const ROOM_CORNER = /^r_[^#]+#p\d+$/;
/** What a wall end at `pos` hangs on: the room corner it was snapped to, else the nearest corner of the room the wall stands in (or of any room). */
function anchorFor(pos, ref, mid) {
  if (ref && ROOM_CORNER.test(ref) && snaps.some(s => s.ref === ref)) return { ref, offset: [0, 0] };   // a corner of this level
  const inRoom = (level().rooms || []).find(r => r.polygon?.length >= 3 && pointInPolygon(mid, r.polygon));
  const corners = snaps.filter(s => ROOM_CORNER.test(s.ref) && (!inRoom || s.ref.startsWith(`${inRoom.id}#`)));
  const best = corners.reduce((x, s) => (!x || Math.hypot(s.pos[0] - pos[0], s.pos[1] - pos[1]) < Math.hypot(x.pos[0] - pos[0], x.pos[1] - pos[1]) ? s : x), null);
  return best ? { ref: best.ref, offset: [Math.round((pos[0] - best.pos[0]) * 10) / 10, Math.round((pos[1] - best.pos[1]) * 10) / 10] } : null;
}
// A hand-drawn wall in the panel, as it is measured: its start x/y from the corner it follows (or from the
// plan origin), then how far it runs (length x east, length y north). The stored wall keeps its two ends.
const snapPos = ref => snaps.find(s => s.ref === ref)?.pos;
const r1 = v => Math.round(v * 10) / 10;
/** The two ends the position fields describe, or null while a field is not a number. */
function wallEnds() {
  const o = snapPos($('wAnchA').value) || [0, 0], v = ['wSx', 'wSy', 'wLx', 'wLy'].map(id => Number($(id).value.trim() === '' ? NaN : $(id).value));
  if (v.some(x => !Number.isFinite(x))) return null;
  const a = [r1(o[0] + v[0]), r1(o[1] + v[1])];
  return { a, b: [r1(a[0] + v[2]), r1(a[1] + v[3])] };
}
/** Fill the position fields from a wall's ends (start relative to the corner its start follows). */
function fillWallPos(a, b) {
  const ref = $('wAnchA').value, o = snapPos(ref) || [0, 0];
  $('wSx').value = r1(a[0] - o[0]); $('wSy').value = r1(a[1] - o[1]); $('wLx').value = r1(b[0] - a[0]); $('wLy').value = r1(b[1] - a[1]);
  const where = ref ? $('wAnchA').selectedOptions[0]?.textContent : 'the plan origin';
  $('wSxNote').textContent = `east of ${where}`; $('wSyNote').textContent = `north of ${where}`;
  $('wAnchA').dataset.was = ref;
  showWallPos();
}
function showWallPos() {
  const e = wallEnds();
  $('wPosOut').textContent = e ? `${Math.round(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]))} mm long, from (${e.a.join(', ')}) to (${e.b.join(', ')})` : 'start and lengths: numbers of mm';
}
/** The anchors the wall form describes (room corner per end, offsets so the ends stay where the fields say). */
function anchorForm() {
  const out = {}, e = wallEnds();
  if (!e) return wall()?.anchor ?? null;
  for (const [end, sel] of [['a', 'wAnchA'], ['b', 'wAnchB']]) {
    const ref = $(sel).value, p = snapPos(ref);
    if (ref && p) out[end] = { ref, offset: [r1(e[end][0] - p[0]), r1(e[end][1] - p[1])] };
  }
  return Object.keys(out).length ? out : null;
}

function startDrawing() {
  if (editing && !leaveEdit()) return;
  if (measure?.isOn()) measure.setOn(false);
  selectNone();
  drawing = { a: null, hover: null };
  $('preview').classList.add('measuring');
  setStatus('+ Wall: click where it starts (corners snap, or a point on a wall face; Alt = anywhere). Esc cancels.');
}
function stopDrawing() { drawing = null; $('preview').classList.remove('measuring'); $('preview').querySelector('#dOverlay')?.remove(); setStatus(''); }
function drawingClick(e) {
  const p = wallPoint(e);
  if (!drawing.a) { drawing.a = p; setStatus('+ Wall: click where it ends (it keeps straight near x or y; Shift = always). Esc cancels.'); drawWallOverlay(); return; }
  const b = straighten(drawing.a.pos, p.pos, e.shiftKey);
  // each end hangs on a room corner (the one clicked, else the nearest of the room it stands in), so it follows the room
  const mid = [(drawing.a.pos[0] + b[0]) / 2, (drawing.a.pos[1] + b[1]) / 2];
  const anchor = { a: anchorFor(drawing.a.pos, drawing.a.ref, mid), b: anchorFor(b, b === p.pos ? p.ref : null, mid) };
  for (const k of ['a', 'b']) if (!anchor[k]) delete anchor[k];
  const r = addWall(model, levelId, { a: drawing.a.pos, b, anchor }, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  stopDrawing();
  const base = model;
  commit(r.model);
  enterEdit('wall', r.wall.id, { ask: false }); startFresh('wall', r.wall.id, base, 'wall');
  setStatus(`${r.wall.id} drawn: set its thickness, height or base (a lintel: its underside), name it and Apply to create it`);
}
function drawWallOverlay() {
  const svg = $('preview');
  svg.querySelector('#dOverlay')?.remove();
  if (!drawing) return;
  const k = 1 / Math.abs(svg.getScreenCTM()?.a || 1), NS = 'http://www.w3.org/2000/svg', g = document.createElementNS(NS, 'g');
  g.id = 'dOverlay'; g.setAttribute('pointer-events', 'none');
  const add = (tag, at) => { const el = document.createElementNS(NS, tag); for (const [x, v] of Object.entries(at)) el.setAttribute(x, v); g.appendChild(el); return el; };
  const dot = (p, c) => { const [x, y] = toSvg(p); add('circle', { cx: x, cy: y, r: 6 * k, fill: 'none', stroke: c, 'stroke-width': 2 * k }); };
  if (drawing.a) dot(drawing.a.pos, '#4cc38a');
  if (drawing.hover) {
    const end = drawing.a ? straighten(drawing.a.pos, drawing.hover.pos, drawing.shift) : drawing.hover.pos;
    dot(end, '#ffb454');
    if (drawing.a) {
      const [x1, y1] = toSvg(drawing.a.pos), [x2, y2] = toSvg(end);
      add('line', { x1, y1, x2, y2, stroke: '#ffb454', 'stroke-width': 3 * k, 'stroke-dasharray': `${8 * k} ${5 * k}` });
      const t = add('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 8 * k, 'text-anchor': 'middle', 'font-size': 13 * k, fill: '#ffb454', 'paint-order': 'stroke', stroke: '#14161a', 'stroke-width': 4 * k });
      t.textContent = `${Math.round(Math.hypot(end[0] - drawing.a.pos[0], end[1] - drawing.a.pos[1]))} mm`;
    }
  }
  svg.appendChild(g);
}

/**
 * What a panel's numbers count from, drawn on the plan: the corner named in "mm from corner 3 of Salong"
 * and the distance from it to the opening's near edge (and its width), or to a wall lamp or switch; for a
 * wall, the corners at its ends and its left and right side. Values being typed are shown as typed.
 */
function selectionMarks(lv, fs) {
  return pickedPoints(fs) + panelMarks(lv, fs);
}

/**
 * The points chosen in the pickers of the open panel, ringed and named on the plan: where stairs start,
 * the corners a drawn wall's ends follow, the two points of a new anchor.
 */
function pickedPoints(fs) {
  const at = ref => (snapsAround.find(s => s.ref === ref) || snaps.find(s => s.ref === ref))?.pos;
  const ring = (ref, text, color = '#4cc38a') => {
    const P = ref && at(ref);
    if (!P) return '';
    const [x, y] = toSvg(P);
    return `<g pointer-events="none"><circle cx="${x}" cy="${y}" r="${fs * 0.8}" fill="none" stroke="${color}" stroke-width="${fs / 5}"/>`
      + `<text x="${x + fs}" y="${y - fs}" fill="${color}" font-size="${fs * 0.8}" font-weight="600" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.3}">${esc(text)}</text></g>`;
  };
  if (editing?.kind === 'stairs') return ring($('stRef').value, 'stairs counted from here');
  if (editing?.kind === 'wall' && !$('wPosBox').hidden) return ring($('wAnchA').value, 'start follows') + ring($('wAnchB').value, 'end follows', '#ffb454');
  if (!editing && $('anchorCount').closest('details').open) return ring($('anA').value, 'anchor point 1') + ring($('anB').value, 'anchor point 2', '#ffb454');
  return '';
}

function panelMarks(lv, fs) {
  const typed = (id, v) => { const t = $(id).value.trim(), n = Number(t); return t !== '' && Number.isFinite(n) ? n : v; };
  // the thing at t0 … t1 along the wall (from its start), measured from corner `c` (measureCorners())
  const mark = (w, t0, t1, c) => {
    // dimensions on the side of the wall a room is on (the right side for a wall made from a room edge)
    const f = wallFrame(w), info = wallInfo(lv, w.id), right = !!info?.sides.right.length || !info?.sides.left.length;
    const d = right ? f.offR + fs * 2.6 : -(f.offL + fs * 2.6), near = c.dir > 0 ? t0 : t1;
    let out = Math.abs(near - c.s) >= 1 ? dimensionSvg(pointOn(w.a, w.b, c.s, d), pointOn(w.a, w.b, near, d), { fs, text: Math.round(Math.abs(near - c.s)) }) : '';
    if (t1 - t0 >= 1) out += dimensionSvg(pointOn(w.a, w.b, t0, d), pointOn(w.a, w.b, t1, d), { fs, color: '#d9dde4', text: Math.round((t1 - t0) * 10) / 10 });
    out += cornerSvg(c.pos, /#p(\d+)$/.exec(c.key)?.[1] ?? c.key, { fs, active: true, tag: 'from here', toward: pointOn(w.a, w.b, c.s + c.dir * Math.min(f.L / 2, fs * 3), d) });
    return out;
  };
  const o = openingId && lv.openings?.find(x => x.id === openingId), ow = o && lv.walls?.find(x => x.id === o.wall);
  if (ow) {
    const c = fromOf(o.id, ow), editingIt = editing?.kind === 'opening', wd = editingIt ? typed('oWidth', o.width) : o.width;
    const dist = editingIt ? typed('oOffset', offsetFrom(o, c)) : offsetFrom(o, c), t0 = offsetTo(dist, c, wd);
    return mark(ow, t0, t0 + wd, c);
  }
  const x = fixtureId && lv.fixtures?.find(v => v.id === fixtureId), xw = x?.attach && lv.walls?.find(v => v.id === x.attach.wall);
  if (xw) {
    const c = fromOf(x.id, xw), shown = offsetFrom({ offset: x.attach.offset, width: 0 }, c);
    const t = offsetTo(editing?.kind === 'fixture' ? typed('xOffset', shown) : shown, c);
    return mark(xw, t, t, c);
  }
  const w = wallId && wall();
  if (w) {
    // the corners named in the panel ("Split at … from corner 2"), and which side is left and right
    const f = wallFrame(w), ca = cornerAt(lv, w.a), cb = cornerAt(lv, w.b);
    let out = cornerSvg(w.a, ca ? ca.index : 'a', { fs, active: true, tag: ca ? 'start' : '' }) + (cb ? cornerSvg(w.b, cb.index, { fs, hot: true }) : '');
    for (const [side, k] of [['left', f.offL + fs * 1.4], ['right', -(f.offR + fs * 1.4)]]) {
      const P = pointOn(w.a, w.b, f.L / 2, -k), [tx, ty] = toSvg(P);
      out += `<text x="${tx}" y="${ty}" fill="#d9dde4" font-size="${fs * 0.8}" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.3}" pointer-events="none">${side} side</text>`;
    }
    const at = Number($('wSplitAt').value);
    if (at > 0 && at < f.L) out += dimensionSvg(pointOn(w.a, w.b, 0, f.offR + fs * 2.6), pointOn(w.a, w.b, at, f.offR + fs * 2.6), { fs, color: '#e5534b' });
    return out;
  }
  return '';
}

/** Zoom by factor f (< 1 = in) around the pointer of event e, or around the middle. */
function zoomAt(f, e) {
  const svg = $('preview'), vb = view || lastFit, m = svg.getScreenCTM();
  if (!vb || !m) return;
  let c = [vb.x + vb.w / 2, vb.y + vb.h / 2];
  if (e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(m.inverse()); c = [q.x, q.y]; }
  const w = Math.min(Math.max(vb.w * f, 300), lastFit.w * 4), k = w / vb.w;     // from 30 cm across to 4 × the level
  view = { x: c[0] - (c[0] - vb.x) * k, y: c[1] - (c[1] - vb.y) * k, w: vb.w * k, h: vb.h * k };
  autoZoomed = false;
  draw();
}
/** Opening something small (a bump, a closet) zooms in on it; leaving the editor zooms back out. */
function zoomToIfSmall(poly) {
  if (!poly?.length || !lastFit || view) return;
  const pts = poly.map(toSvg), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), size = Math.max(w, h);
  if (size > 0.2 * Math.max(lastFit.w, lastFit.h)) return;
  const span = Math.max(size * 5, 1500), k = span / Math.max(lastFit.w, lastFit.h);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  view = { x: cx - lastFit.w * k / 2, y: cy - lastFit.h * k / 2, w: lastFit.w * k, h: lastFit.h * k };
  autoZoomed = true;
  draw();
}

/** A panel title: the friendly name with the id beside it, smaller; just the id without a name. */
const titleHtml = e => (e?.name ? `${esc(e.name)} <small style="text-transform:none;letter-spacing:0">${esc(e.id)}</small>` : esc(e?.id ?? ''));
/** A tooltip or status: "Bathroom window (o_window_7)", or the id; `what` adds the kind after the id. */
const tip = (e, what = '') => (e?.name ? `${e.name} (${e.id}${what ? `, ${what}` : ''})` : `${e?.id ?? ''}${what ? ` (${what})` : ''}`);
/** The friendly name of anything in the model by id (for messages that carry ids), or the id. */
function nameOf(id) {
  for (const lv of model.levels) for (const k of ['rooms', 'walls', 'openings', 'solids', 'objects', 'fixtures', 'stairs']) { const e = lv[k]?.find(x => x.id === id); if (e) return displayName(e); }
  return id;
}

/** A snap ref as a person reads it: "Salong wall D", "Salong wall D, room face", "Murstock side 2" (ref-names.js). */
const refName = ref => refNamer(model)(ref);
const nameOpts = () => ({ name: refNamer(model), levelName: id => model.levels.find(l => l.id === id)?.name || id });

/** Planes the measure tool can use: wall faces, room edges and solid sides of this level and the ones just below and above. */
function linesAround() {
  const geos = modelGeos || buildModelGeometry(model);
  return [...collectSnapLines(model, level(), curGeo), ...adjacentLevels(model, level()).flatMap(l => collectSnapLines(model, l, geos.get(l.id)))];
}

/** Nothing selected: the plan alone. A new room being typed is kept (a stray click must not lose it). */
function selectNone() {
  if (editing) return;
  roomId = null; wallId = null; openingId = null; fixtureId = null; stairsId = null; objectId = null;
  collapseTree();
  refresh();
}
/** Fold the sidebar tree up again (nothing selected, or just saved): only the top level shows. */
function collapseTree() { expanded.clear(); treeShownFor = null; }

function selectObject(id) { objectId = id; stairsId = null; fixtureId = null; openingId = null; wallId = null; roomId = null; draft = null; objectFormFor = null; refresh(); }
function selectStairs(id) { stairsId = id; objectId = null; fixtureId = null; openingId = null; wallId = null; roomId = null; draft = null; stairsFormFor = null; refresh(); }
function selectWall(id) { wallId = id; openingId = null; fixtureId = null; stairsId = null; objectId = null; roomId = null; draft = null; refresh(); }
function selectOpening(id) { openingId = id; wallId = null; fixtureId = null; stairsId = null; objectId = null; roomId = null; draft = null; openingFormFor = null; refresh(); }
function selectFixture(id) { fixtureId = id; openingId = null; wallId = null; stairsId = null; objectId = null; roomId = null; draft = null; fixtureFormFor = null; refresh(); }

/** Phone-wizard result → a new room draft in the form (nothing is stored until "Apply"). */
function importRoom(text) {
  const r = importResult(text);
  if (r.error) { $('importBox').hidden = false; $('importErr').textContent = r.error; return; }
  const { room: info, capture, level: lvl } = r.value;
  if (lvl && lvl !== levelId && model.levels.some(l => l.id === lvl)) { levelId = lvl; $('level').value = lvl; }
  if (!editDraft({ name: info?.name || '', exterior: !!info?.exterior })) return;
  loadForm(capture);
  $('importBox').hidden = true; $('importText').value = ''; $('importErr').textContent = '';
  refresh();
  setStatus('imported from the phone wizard: check the result, then Apply');
}

function loadForm(capture) {
  const round = capture?.mode === 'circle';
  if (shape === 'solid') { $('sShape').value = round ? 'round' : 'outline'; loadRound(round ? capture : null); } else syncRound();
  const f = captureToForm(round ? null : capture);
  refreshSnaps();
  if (f.originRef && ![...$('originRef').options].some(o => o.value === f.originRef)) {
    // the referenced point is not offered (gone or excluded): keep it visible so the error is explicit
    $('originRef').insertAdjacentHTML('beforeend', `<option value="${esc(f.originRef)}">${esc(f.originRef)} (missing)</option>`);
  }
  FIELDS.forEach(k => { $(k).value = f[k]; });
}

function loadFormForSelection() {
  if (draft) shape = draft.solid ? 'solid' : 'room';
  const r = room(), solid = shape === 'solid';
  $('name').value = r ? r.name ?? '' : draft?.name ?? '';
  $('rid').value = r ? r.id : solid ? newSolidId(model, draft?.name || $('sKind').value) : newRoomId(model, draft?.name);
  $('exterior').checked = r ? !!r.exterior : !!draft?.exterior;
  $('rFloor').value = r?.floor ?? 'slab'; $('rFloorOff').value = r?.floorOffset ?? ''; $('rCeil').value = r?.ceilingHeight ?? '';
  $('rCeilNote').textContent = `(${level().ceilingHeight ?? 2400})`;
  $('roomOptions').hidden = solid;
  // a solid is measured like a room (walking round it, the solid on your right) and has a kind, colour and height
  $('exteriorRow').hidden = solid; $('solidFields').hidden = !solid; $('addCeilingLamp').hidden = solid || !roomId;
  $('edTitle').textContent = solid ? 'Solid' : 'Room';
  $('walkHelp').innerHTML = solid
    ? 'Walk round it <b>clockwise</b>, keeping it on your <b>right</b>; a face hidden in a wall is measured or estimated from the rooms. Corner 0 is where you start; side A runs from corner 0 to 1, and so on. Its faces bound the rooms around it: they need no wall there. All lengths in mm.'
    : 'Walk <b>clockwise</b>, room on your <b>right</b>. Corner 0 is where you start; wall A runs from corner 0 to 1, B from 1 to 2, and so on (the letters are on the plan). Lengths are listed in that order. All lengths in mm.';
  $('delRoom').textContent = solid ? 'Delete' : 'Delete room';
  if (solid) { $('sKind').value = r?.kind || 'chimney'; $('sColor').value = r?.color || SOLID_COLOR; $('sBase').value = r?.base ?? ''; $('sHeight').value = r?.height ?? ''; $('sCuts').checked = r ? !!r.cutsWalls : true; }
  $('sCutsRow').hidden = !solid;
  $('sSidesBox').hidden = !solid;
  if (solid) renderSolidSides();
  $('name').readOnly = false;
  loadForm(r?.capture ?? null);
  fillShapeCopy();
}

// ---- Copy from another one, Copy to the level below/above, Duplicate (src/edit/copy.js) ----
const COLL = { room: 'rooms', solid: 'solids', object: 'objects', opening: 'openings', fixture: 'fixtures', stairs: 'stairs' };
/** <option>s of what can be copied, grouped by level (this one first, then below and above). */
function copyOptions(coll, keep = () => true, label = x => displayName(x)) {
  const rel = { here: 'this level', below: 'below', above: 'above', other: '' };
  return copySources(model, coll, levelId, keep).map(g => `<optgroup label="${esc(g.level.name || g.level.id)}${rel[g.relation] ? ` (${rel[g.relation]})` : ''}">${g.items.map(x => `<option value="${esc(x.id)}">${esc(label(x))}${x.name ? ` · ${esc(x.id)}` : ''}</option>`).join('')}</optgroup>`).join('');
}
/** The room form's Copy from (a new room or solid) and Copy to buttons (a stored one). */
function fillShapeCopy() {
  const coll = shape === 'solid' ? 'solids' : 'rooms', isNew = !roomId;
  $('copyRow').hidden = !isNew;
  if (isNew) $('copyFrom').innerHTML = `<option value="">— measure it from scratch —</option>${copyOptions(coll, x => x.polygon?.length >= 3)}`;
  const lv = level(), near = isNew ? [] : adjacentLevels(model, lv);
  $('copyTo').innerHTML = near.map(l => `<button data-copyto="${esc(l.id)}" title="A new ${shape} on ${esc(l.name || l.id)} with this one's shape, exactly ${l.elevation > lv.elevation ? 'above' : 'below'} it (it follows this one when it is re-measured)">Copy to ${esc(l.name || l.id)} ${l.elevation > lv.elevation ? '↑' : '↓'}</button>`).join(' ');
  $('copyTo').querySelectorAll('[data-copyto]').forEach(b => (b.onclick = () => copyToLevel(b.dataset.copyto)));
}
/** Fill the open draft from shapeDraftFrom(): name, options and measurements (nothing stored until Apply). */
function fillDraft(d) {
  draft.name = d.name; $('name').value = d.name;
  if (d.kind === 'solid') {
    $('rid').value = newSolidId(model, d.name || d.solidKind);
    $('sKind').value = d.solidKind; $('sColor').value = d.color || SOLID_COLOR; $('sBase').value = d.base ?? ''; $('sHeight').value = d.height ?? ''; $('sCuts').checked = d.cutsWalls;
  } else {
    $('rid').value = newRoomId(model, d.name);
    draft.exterior = d.exterior; $('exterior').checked = d.exterior;
    $('rFloor').value = d.floor ?? 'slab'; $('rFloorOff').value = d.floorOffset ?? ''; $('rCeil').value = d.ceilingHeight ?? '';
  }
  loadForm(d.capture);
  recompute(); draw(); showEditBar();
  const src = nameOf(d.source);
  setStatus(d.placed === 'stacked' ? `the shape of ${src}, exactly over it (it follows ${src} when that is re-measured): check it, then Apply`
    : d.placed === 'beside' ? `the shape of ${src}, set beside it: pick where corner 0 goes (a dot on the plan, or "Place next to another room"), then Apply`
      : `the shape of ${src}, at the same place in the plan: pick where corner 0 goes, then Apply`);
}
function useShapeOf(srcId) {
  const d = shapeDraftFrom(model, shape === 'solid' ? 'solids' : 'rooms', srcId, levelId);
  if (d.error) { setStatus(d.error); return; }
  fillDraft({ ...d, source: srcId });
}
/** A new room (or solid) on the level below or above, stacked on this one. */
function copyToLevel(target) {
  const coll = shape === 'solid' ? 'solids' : 'rooms', src = roomId;
  const d = shapeDraftFrom(model, coll, src, target);
  if (d.error) { setStatus(d.error); return; }
  if (!goToLevel(target)) return;
  if (!editDraft({ name: d.name, ...(coll === 'solids' ? { solid: true } : { exterior: d.exterior }) })) return;
  fillDraft({ ...d, source: src });             // not applied yet: Close asks before dropping it
}
/** Copy from… in the object, opening, fixture and stairs panels: its sizes onto this one, which stays where it is. */
function copyInto(kind, srcId) {
  const sel = { object: 'obCopy', opening: 'oCopy', fixture: 'xCopy', stairs: 'stCopy' }[kind];
  if (!srcId) return;
  if (!okToDiscard()) { $(sel).value = ''; return; }
  const src = findIn(model, COLL[kind], srcId)?.item, id = editing?.id;
  let r;
  if (kind === 'object') r = setObject(model, levelId, id, { ...objectSpecFrom(src), color: src.color ?? null }, opts());
  else if (kind === 'opening') { const spec = openingSpecFrom(src); for (const k of ['hinge', 'swing', 'opens', 'leaves', 'thickness']) spec[k] ??= null; r = setOpening(model, levelId, id, spec, opts()); }
  else if (kind === 'fixture') { const { kind: _k, ...spec } = fixtureSpecFrom(src); r = setFixture(model, levelId, id, spec, opts()); }
  else r = applyStairs(model, levelId, stairsWithShapeOf(stairs(), src), opts());
  $(sel).value = '';
  if (!src || r.report.errors.length) { setStatus(src ? r.report.errors.join('; ') : `no ${kind} "${srcId}"`); return; }
  objectFormFor = null; openingFormFor = null; fixtureFormFor = null; stairsFormFor = null;
  commit(r.model);
  setStatus(`${id}: sizes copied from ${nameOf(srcId)}, still where it was (not saved yet)`);
}
/** The Copy from list of a panel: the others of the same kind (lamps with lamps, switches with switches). */
function fillCopyInto(kind, self) {
  const sel = { object: 'obCopy', opening: 'oCopy', fixture: 'xCopy', stairs: 'stCopy' }[kind];
  const label = kind === 'opening' ? x => `${displayName(x)} (${x.type} ${x.width} × ${x.head - x.sill})` : kind === 'object' ? x => `${displayName(x)} (${x.size.join(' × ')})` : kind === 'fixture' ? x => `${displayName(x)} (${x.z} mm)` : x => displayName(x);
  const opts2 = copyOptions(COLL[kind], x => x.id !== self.id && (kind !== 'fixture' || x.kind === self.kind), label);
  $(sel).innerHTML = `<option value="">—</option>${opts2}`;
  $(sel).closest('label').hidden = !opts2;
}
/** Duplicate: a copy beside it, then opened. */
function duplicateEdited() {
  if (!editing || !okToDiscard()) return;
  const { kind, id } = editing, base = model, r = duplicate(model, levelId, kind, id, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  commit(r.model);
  enterEdit(kind, r.id, { ask: false }); startFresh(kind, r.id, base, `copy of ${nameOf(id)}`);
  setStatus(`${r.id}: a copy of ${nameOf(id)} beside it. Name it and Apply to create it`);
}

function selectSolid(id) { shape = 'solid'; roomId = id; wallId = null; openingId = null; fixtureId = null; stairsId = null; objectId = null; draft = null; loadFormForSelection(); refresh(); }
function selectRoom(id) { shape = 'room'; roomId = id; wallId = null; openingId = null; fixtureId = null; stairsId = null; draft = null; loadFormForSelection(); refresh(); }

function refreshSnaps() {
  const lv = level(), geos = buildModelGeometry(model), geo = geos.get(lv.id);
  curGeo = geo;
  snaps = collectSnapPoints(model, lv, geo);
  snapsAround = collectSnapPointsAround(model, lv, l => geos.get(l.id));
  underlay = adjacentOutlines(model, lv, l => geos.get(l.id));
  const keep = $('originRef').value;
  $('originRef').innerHTML = `<option value="">Plan origin (0, 0)</option>` + startOptions(snapsAround, { excludeRoom: roomId || ($('rid').value || undefined), ...nameOpts() }).map(o => `<option value="${esc(o.ref)}">${esc(o.label)}</option>`).join('');
  $('originRef').value = [...$('originRef').options].some(o => o.value === keep) ? keep : '';
}

/** "Place next to another room": pick a shared wall, get corner 0 and the first heading. */
function ntPick() {
  const [id, i] = ($('ntEdge').value || '').split('|'), room = level().rooms?.find(r => r.id === id);
  return { room, i: Number(i) };
}
/** This room's outline as solved from the form now (its own walls for "This room's wall"), or null. */
const ntShape = () => (solved?.ok ? solved.polygon : null);
function ntPlacement() {
  const { room, i } = ntPick();
  if (!room) return { error: 'pick the neighbour\'s wall first' };
  const t = $('ntT').value.trim(), opts = { thickness: t === '' ? NaN : Number(t), slide: Number($('ntSlide').value) || 0 };
  const poly = ntShape(), k = Number($('ntOwn').value);
  // a room with a shape: its chosen wall goes against it; a room not measured yet: its first wall
  return poly && Number.isInteger(k) ? placeWallAgainstEdge(poly, Number($('heading').value) || 0, k, room, i, opts) : placeAgainstEdge(room, i, opts);
}
function ntPreview() {
  const p = ntPlacement(), { room, i } = ntPick(), k = Number($('ntOwn').value);
  $('ntOut').textContent = p.error ? p.error
    : `${ntShape() ? `Wall ${wallName(k)}` : 'The first wall'} goes against ${room.name || room.id} wall ${wallName(i)}${p.rot ? `; the room turns ${p.rot}°` : '; the room only moves'}. Corner 0 at (${p.start[0]}, ${p.start[1]}).`;
  $('ntUse').disabled = !!p.error;
  draw();
}
/** This room's walls in the second list; keeps the choice when it still exists. */
function ntFillOwn() {
  const poly = ntShape(), keep = $('ntOwn').value;
  $('ntOwn').innerHTML = poly ? poly.map((p, k) => { const q = poly[(k + 1) % poly.length]; return `<option value="${k}">Wall ${wallName(k)} · ${Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]))} mm</option>`; }).join('') : '<option value="">(measure the room first: its first wall then)</option>';
  if ([...$('ntOwn').options].some(o => o.value === keep)) $('ntOwn').value = keep;
}
/** Pick the neighbour's wall (list or plan): its thickness, and this room's wall that already faces it. */
function ntPickEdge(value) {
  $('ntEdge').value = value;
  const { room, i } = ntPick();
  if (room) $('ntT').value = edgeWallThickness(level(), room, i) ?? $('ntT').value ?? '';
  $('ntSlide').value = '';
  ntFillOwn();
  const poly = ntShape();
  if (room && poly) $('ntOwn').value = String(bestWallAgainst(poly, room, i));
  ntPreview();
}
function ntUse() {
  const p = ntPlacement();
  if (p.error) return;
  $('originRef').value = p.ref; $('ox').value = p.offset[0]; $('oy').value = p.offset[1]; $('heading').value = p.heading;
  recompute();
}
function refreshNextTo() {
  const lv = level(), cur = roomId || $('rid').value, keep = $('ntEdge').value;
  const rooms = (lv.rooms || []).filter(r => r.id !== cur && r.polygon?.length >= 3);
  $('ntEdge').innerHTML = rooms.flatMap(r => r.polygon.map((p, i) => {
    const q = r.polygon[(i + 1) % r.polygon.length], t = edgeWallThickness(lv, r, i);
    return `<option value="${esc(r.id)}|${i}">${esc(r.name || r.id)} · wall ${wallName(i)}: (${Math.round(p[0])}, ${Math.round(p[1])}) → (${Math.round(q[0])}, ${Math.round(q[1])})${t ? ` · wall ${t} mm` : ''}</option>`;
  })).join('');
  if ([...$('ntEdge').options].some(o => o.value === keep)) $('ntEdge').value = keep;
  if ($('ntT').value.trim() === '') { const { room, i } = ntPick(); $('ntT').value = (room && edgeWallThickness(lv, room, i)) || innerThickness(); }
  ntFillOwn();
  const p = ntPlacement();
  $('ntOut').textContent = p.error || ''; $('ntUse').disabled = !!p.error;
}

function refresh() {
  refreshSnaps();
  refreshNextTo();
  // the house view, or only the thing being edited
  const k = editing?.kind;
  $('top').hidden = $('browse').hidden = !!editing;
  $('edit').hidden = $('edBar').hidden = !editing;
  $('cap').classList.toggle('editing', !!editing);
  renderLevelStrip();
  $('editor').hidden = !(k === 'room' || k === 'solid');
  $('wallPanel').hidden = k !== 'wall';
  $('openingPanel').hidden = k !== 'opening';
  $('fixturePanel').hidden = k !== 'fixture';
  $('stairsPanel').hidden = k !== 'stairs';
  $('objectPanel').hidden = k !== 'object';
  $('matForm').hidden = k !== 'material';
  $('addCeilingLamp').hidden = !roomId || shape === 'solid';
  showIssues();
  $('compass').innerHTML = compassSvg(northAngleOf(model));
  if (wallId) showWall();
  if (openingId) showOpening();
  if (fixtureId) showFixture();
  if (stairsId) showStairs();
  if (objectId) showObject();
  const rooms = level().rooms || [];
  renderTree(rooms);
  renderMaterials();
  renderColors();
  renderAnchors();
  renderChecks();
  renderAreas();
  const todo = stillToMeasure(level());
  $('todo').innerHTML = todo.map(t => `<div class="chk${t.id === wallId ? ' sel' : ''}" data-id="${esc(t.id)}" data-kind="${esc(t.kind)}"><span class="dot warn"></span><span>${esc(t.id)} <small>${esc(t.kind)}</small></span><small>${esc(t.fields.join(', '))}</small></div>`).join('') || '<small>Nothing assumed on this level.</small>';
  $('todoCount').textContent = todo.length ? `(${todo.length})` : '';
  $('todo').querySelectorAll('.chk').forEach(el => (el.onclick = () => { if (SELECT[el.dataset.kind]) enterEdit(el.dataset.kind, el.dataset.id); }));
  recompute();
  // the save bar: unsaved or saved, and errors block Save (Download still works)
  const errs = issuesNow.filter(i => i.severity === 'error').length;
  $('saveState').classList.toggle('dirty', dirty);
  $('saveStateTxt').textContent = dirty ? 'Unsaved changes' : 'All saved';
  $('save').disabled = !saveMode || !dirty || errs > 0;
  $('save').classList.toggle('primary', !!saveMode && dirty && !errs);
  $('save').title = errs ? 'Fix the errors below to save (Download still works)' : $('save').title.replace(/^Fix the errors.*$/, `Save into ${house.where}`);
  $('undo').disabled = !history.canUndo; $('redo').disabled = !history.canRedo;
  showEditBar();
}

/**
 * The sidebar tree: rooms → walls → openings and fixtures. A selection (from the plan or the tree)
 * opens the tree down to it; the ▸ opens or closes a node without selecting it.
 */
function renderTree(rooms) {
  const tree = levelTree(level()), sel = roomId || wallId || openingId || fixtureId || stairsId || objectId;
  if (sel && sel !== treeShownFor) {
    for (const k of pathsTo(tree, sel)) expanded.add(k);
    const self = nodes => nodes.forEach(n => { if (n.id === sel && n.children.length) expanded.add(n.key); self(n.children); });
    self(tree);
  }
  treeShownFor = sel;
  const row = (n, depth) => {
    const open = expanded.has(n.key), has = n.children.length > 0;
    return `<div class="tn${n.kind === 'group' ? ' group' : ''}${n.id === sel ? ' sel' : ''}" data-key="${esc(n.key)}" data-tkind="${n.kind}" data-tid="${esc(n.id)}" style="padding-left:${depth * 14}px">`
      + `<span class="caret" data-toggle="${esc(n.key)}">${has ? (open ? '▾' : '▸') : ''}</span><span class="dot${n.warn ? ' warn' : ''}"></span>`
      + `<span class="lbl">${esc(n.label)}</span><small>${esc(n.note || '')}</small>${n.kind === 'group' ? '<span></span>' : `<button class="ed" data-edit title="Edit (or double-click)">✎</button>`}</div>`
      + (open ? n.children.map(c => row(c, depth + 1)).join('') : '');
  };
  $('tree').innerHTML = tree.map(n => row(n, 0)).join('') || '<small>No rooms on this level yet: + New room, or measure one with the phone wizard.</small>';
  $('tree').querySelectorAll('.tn').forEach(el => (el.onclick = e => {
    const key = el.dataset.key;
    if (e.target.closest('[data-edit]') || (SELECT[el.dataset.tkind] && !e.target.closest('[data-toggle]') && isDoubleClick(el.dataset.tkind, el.dataset.tid))) { enterEdit(el.dataset.tkind, el.dataset.tid); return; }
    if (e.target.closest('[data-toggle]') || el.dataset.tkind === 'group') { if (expanded.has(key)) expanded.delete(key); else expanded.add(key); renderTree(rooms); return; }
    expanded.add(key);
    ({ room: selectRoom, solid: selectSolid, wall: selectWall, opening: selectOpening, fixture: selectFixture, stairs: selectStairs, object: selectObject })[el.dataset.tkind]?.(el.dataset.tid);
  }));
}

/** The wall panel: what the selected wall is, and its own properties as a form. */
function showWall() {
  const info = wallInfo(level(), wallId, issuesNow);
  if (!info) { wallId = null; $('wallPanel').hidden = true; return; }
  const w = info.wall, nm = id => level().rooms?.find(r => r.id === id)?.name || id;
  const rooms = ids => ids.length ? ids.map(nm).join(', ') : 'no room';
  $('wTitle').innerHTML = titleHtml(w);
  $('wInfo').innerHTML = [
    `${info.length} mm long`,
    info.bound ? `${info.facade ? 'facade along' : 'follows'} ${esc(rooms(info.sides.right))}${info.shared ? `; ${esc(rooms(info.sides.left))} on the other face` : ''}`
      : w.anchor ? `hand-drawn, hangs on ${esc([...new Set(Object.values(w.anchor).map(an => nm(an.ref.split('#')[0])))].join(' and '))}: moves and turns with it` : 'hand-drawn: never moved by room changes',
    info.attached.length ? `attached: ${esc(info.attached.join(', '))}` : '',
    info.orphan ? `<span style="color:var(--bad)">${esc(info.orphan)}</span>` : '',
    w.kind !== 'virtual' && curGeo?.pieces.get(w.id)?.length === 0 ? 'hidden: a solid it gives way to stands where it is' : '',
  ].filter(Boolean).join(' · ');
  if (wallFormFor !== w) {
    const f = wallToForm(w);
    $('wName').value = f.name; $('wKind').value = f.kind; $('wLight').value = f.lightBlocking; $('wThick').value = f.thickness; $('wMeasured').checked = f.measured;
    $('wHeight').value = f.height; $('wBase').value = f.base;
    $('wPosBox').hidden = !!w.from?.length;
    $('wJustify').value = f.justify;
    $('wLock').checked = f.lock;
    if (!w.from?.length) {
      const nm = ref => { const [id, h] = ref.split('#'), r = level().rooms.find(x => x.id === id); return `${r?.name || id} corner ${h.slice(1)}`; };
      const opts = '<option value="">nothing (stays where it is)</option>' + snaps.filter(s => ROOM_CORNER.test(s.ref)).map(s => `<option value="${esc(s.ref)}">${esc(nm(s.ref))}</option>`).join('');
      for (const [sel, end] of [['wAnchA', 'a'], ['wAnchB', 'b']]) {
        $(sel).innerHTML = opts;
        const ref = w.anchor?.[end]?.ref;
        if (ref && ![...$(sel).options].some(o => o.value === ref)) $(sel).insertAdjacentHTML('beforeend', `<option value="${esc(ref)}">${esc(ref)} (missing)</option>`);
        $(sel).value = ref || '';
      }
      fillWallPos(w.a, w.b);
    }
    $('wSloped').checked = f.sloped; $('wTopA').value = f.topA; $('wTopB').value = f.topB; $('wBottomA').value = f.bottomA; $('wBottomB').value = f.bottomB;
    $('wTopFlatA').value = f.topFlatA; $('wTopFlatB').value = f.topFlatB; $('wBotFlatA').value = f.bottomFlatA; $('wBotFlatB').value = f.bottomFlatB;
    fillMaterialSelects();
    for (const S of ['Left', 'Right']) { const s = S.toLowerCase(); $(`w${S}Mode`).value = f[`${s}Mode`]; $(`w${S}Color`).value = f[`${s}Color`]; $(`w${S}Mat`).value = f[`${s}Mat`]; }
    // a per-room look on a face that runs along only that room is that face's own look: shown (and saved) as such
    foldedLooks = new Set();
    if (w.roomSides) for (const S of ['Left', 'Right']) {
      const on = [...new Set(wallFaceRooms(w, curGeo.frames.get(w.id), level().rooms).filter(x => x.side === S.toLowerCase()).map(x => x.room))], look = on.length === 1 && w.roomSides[on[0]];
      if (!look) continue;
      foldedLooks.add(on[0]);
      $(`w${S}Mode`).value = look.material ? 'material' : 'color';
      if (look.color) $(`w${S}Color`).value = look.color;
      if (look.material) $(`w${S}Mat`).value = look.material;
    }
    renderWallRoomLooks(w);
    $('wErr').textContent = '';
    wallFormFor = w;
  }
  const fixed = info.shared && w.kind !== 'virtual';
  $('wThick').readOnly = fixed;
  $('wThickNote').textContent = fixed ? 'mm · the distance between the two rooms (move a room to change it)' : info.assumed.includes('thickness') ? 'mm · still a guess: measure it in a door or window opening in this wall (surface to surface)' : 'mm';
  $('wMeasuredRow').hidden = !info.assumed.includes('thickness');
  $('wLeftRoom').textContent = `faces ${rooms(info.sides.left).replace('no room', 'outside')}`;
  $('wRightRoom').textContent = `faces ${rooms(info.sides.right).replace('no room', 'outside')}`;
  showSideRows();
  // the ends of a sloped wall are named by the room corner they are at
  const endName = p => { const c = cornerAt(level(), p); return c ? `corner ${c.index} of ${c.name}` : `(${Math.round(p[0])}, ${Math.round(p[1])})`; };
  for (const [k, p] of [['A', w.a], ['B', w.b]]) { const t = endName(p); $(`wEnd${k}`).textContent = t; $('wSlope').querySelector(`.end${k}`).textContent = t; }
  showSlopeRows();
  $('wOpenings').innerHTML = info.openings.length ? 'Openings (click to edit): ' + info.openings.map(o => `<a href="#" data-o="${esc(o.id)}">${esc(o.id)}</a> (${esc(o.type)}, ${o.width} mm at ${o.offset})`).join(', ') : 'No openings yet.';
  $('wOpenings').querySelectorAll('a[data-o]').forEach(a => (a.onclick = e => { e.preventDefault(); enterEdit('opening', a.dataset.o); }));
  $('wSplitNote').textContent = info.start ? `mm from corner ${info.start.index} of ${info.start.name} (wall ${info.length} mm)` : `mm from its start (${Math.round(w.a[0])}, ${Math.round(w.a[1])}); wall ${info.length} mm`;
  // the other part of a split wall (or a hand-drawn wall continuing it): join them into one again
  const joins = joinableWalls(level(), w.id);
  $('wJoinRow').hidden = !joins.length;
  $('wJoinRow').innerHTML = joins.map(j => `<button data-join="${esc(j.id)}" title="One wall again, with this wall's thickness, kind and colours; what is on ${esc(j.id)} moves onto it">Join with ${esc(j.id)} <small>(at its ${j.side === 'b' ? 'end' : 'start'})</small></button>`).join('');
  $('wJoinRow').querySelectorAll('[data-join]').forEach(b => (b.onclick = () => doJoin(b.dataset.join)));
  $('wUnbind').hidden = !info.bound;
  $('wDelete').hidden = info.bound && !info.orphan;
}

const wallForm = () => ({ name: $('wName').value, kind: $('wKind').value, lightBlocking: $('wLight').value, thickness: $('wThick').value, measured: $('wMeasured').checked, height: $('wHeight').value, base: $('wBase').value,
  roomSides: readLookRows($('wRoomLooks'), Object.fromEntries(Object.entries(wall()?.roomSides || {}).filter(([id]) => !foldedLooks.has(id)))),
  ...(wall()?.from?.length ? {} : (() => { const e = wallEnds(); return { ax: e ? String(e.a[0]) : '', ay: e ? String(e.a[1]) : '', bx: e ? String(e.b[0]) : '', by: e ? String(e.b[1]) : '', justify: $('wJustify').value, lock: $('wLock').checked, anchor: anchorForm() }; })()),
  topFlatA: $('wTopFlatA').value, topFlatB: $('wTopFlatB').value, bottomFlatA: $('wBotFlatA').value, bottomFlatB: $('wBotFlatB').value,
  sloped: $('wSloped').checked, topA: $('wTopA').value, topB: $('wTopB').value, bottomA: $('wBottomA').value, bottomB: $('wBottomB').value,
  leftMode: $('wLeftMode').value, leftColor: $('wLeftColor').value, leftMat: $('wLeftMat').value, rightMode: $('wRightMode').value, rightColor: $('wRightColor').value, rightMat: $('wRightMat').value });

/** A sloped wall shows its end heights instead of height and base. */
function showSlopeRows() {
  const on = $('wSloped').checked;
  $('wSlope').hidden = !on;
  document.querySelectorAll('#wallPanel label.flat').forEach(l => (l.hidden = on));
}

/** Each side shows the colour picker or the material list, by its mode; colour sides get the palette. */
function showSideRows() {
  for (const S of ['Left', 'Right']) {
    const m = $(`w${S}Mode`).value;
    $(`w${S}Color`).hidden = m !== 'color'; $(`w${S}Mat`).hidden = m !== 'material';
    fillSwatches($(`w${S}Swatches`), m === 'material' ? null : $(`w${S}Color`).value, m === 'color', color => {
      $(`w${S}Mode`).value = 'color'; $(`w${S}Color`).value = color; showSideRows();
    }, () => $(`w${S}Color`).value, m === 'color', m === 'color' ? () => makeMaterialFromSide(S.toLowerCase()) : null);
  }
}

/**
 * The colour palette as swatches: colours already used in the house (named ones first, with their
 * name as tooltip). pick(color) is called on a click; withName adds "Name…" for the current colour.
 */
function fillSwatches(box, current, highlight, pick, currentColor, withName, makeMaterial = null) {
  const list = usedColors(model);
  box.innerHTML = list.map(c => `<button class="sw${highlight && current?.toLowerCase() === c.color ? ' on' : ''}" data-c="${c.color}" style="background:${c.color}" title="${esc(c.name ? `${c.name} (${c.color})` : c.color)}${c.count ? ` · used ${c.count}×` : ''}"></button>`).join('')
    + (withName ? `<button class="nm" title="Give this colour a name so it is easy to find again">Name…</button>` : '')
    + (makeMaterial ? `<button class="nm mk" title="Make a material with this colour; wall sides using the material all change when it does">Make material…</button>` : '');
  box.querySelector('.mk')?.addEventListener('click', makeMaterial);
  box.querySelectorAll('.sw').forEach(b => (b.onclick = () => pick(b.dataset.c)));
  box.querySelector('.nm')?.addEventListener('click', () => {
    const c = currentColor().toLowerCase(), old = usedColors(model).find(x => x.color === c)?.name || '';
    const name = prompt(`Name for ${c} (empty = no name):`, old);
    if (name === null) return;
    const r = nameColor(model, c, name);
    if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
    commit(r.model);
    setStatus(name.trim() ? `${c} is now called "${name.trim()}" (not saved yet)` : `${c} has no name now`);
  });
}

/**
 * A material from this side's colour: named (its palette name suggested), used for this side, and
 * for the other sides painted exactly that colour if you say so.
 */
function makeMaterialFromSide(side) {
  const S = side === 'left' ? 'Left' : 'Right', c = $(`w${S}Color`).value.toLowerCase();
  const name = prompt(`Name for the new material with colour ${c}:`, usedColors(model).find(x => x.color === c)?.name || '');
  if (name === null) return;
  const here = { level: levelId, wall: wallId, side };
  const others = model.levels.flatMap(lv => (lv.walls || []).flatMap(w => ['left', 'right'].filter(s => w.sides?.[s]?.color?.toLowerCase() === c && !w.sides[s].material && !(w.id === wallId && s === side)).map(s => ({ level: lv.id, wall: w.id, side: s }))));
  const all = others.length && confirm(`${others.length} other wall side${others.length > 1 ? 's are' : ' is'} painted ${c} too. Switch ${others.length > 1 ? 'them' : 'it'} to the new material as well (so they all change together)?`);
  const r = materialFromColor(model, c, name, [here, ...(all ? others : [])]);
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  wallFormFor = null;
  commit(r.model);
  setStatus(`material ${r.id} made from ${c}, used by ${r.report.replaced.length} wall side${r.report.replaced.length > 1 ? 's' : ''} (not saved yet)`);
}

/** The named colours, under Materials: click one to rename it. */
function renderColors() {
  const named = usedColors(model).filter(c => c.name);
  $('colorList').innerHTML = named.length ? 'Colours: ' + named.map(c => `<a href="#" data-c="${c.color}" title="${c.color}: click to rename"><span class="swatch" style="background:${c.color}"></span> ${esc(c.name)}</a>`).join(' · ')
    : 'Colours you use show as swatches under a wall side\'s colour; name one with "Name…" to keep it in the list.';
  $('colorList').querySelectorAll('a[data-c]').forEach(a => (a.onclick = e => {
    e.preventDefault();
    const c = a.dataset.c, name = prompt(`Name for ${c} (empty = no name):`, usedColors(model).find(x => x.color === c)?.name || '');
    if (name === null) return;
    const r = nameColor(model, c, name);
    if (!r.report.errors.length) commit(r.model);
  }));
}
function fillMaterialSelects() {
  const mats = Object.entries(model.materials || {});
  const opts = '<option value="">choose…</option>' + mats.map(([id, m]) => `<option value="${esc(id)}">${esc(m.name || id)}</option>`).join('') + '<option value="+new">+ New material…</option>';
  for (const S of ['Left', 'Right']) { const keep = $(`w${S}Mat`).value; $(`w${S}Mat`).innerHTML = opts; if ([...$(`w${S}Mat`).options].some(o => o.value === keep)) $(`w${S}Mat`).value = keep; }
}

// ---- materials ----
let matId = null;                       // the material being edited ('' = a new one)
function renderMaterials() {
  const mats = Object.entries(model.materials || {}), use = materialUse(model);
  $('matList').innerHTML = mats.map(([id, m]) => `<div class="chk${id === matId ? ' sel' : ''}" data-mat="${esc(id)}"><span class="swatch" style="background:${esc(m.color || '#888')}"></span><span>${esc(m.name || id)} <small>${esc(id)}${m.texture ? ' · texture' : ''}</small></span><small>${use.get(id).length ? `${use.get(id).length} wall${use.get(id).length > 1 ? 's' : ''}` : 'unused'}</small></div>`).join('')
    || '<small>No materials yet. A wall side can have a colour, or a material that several walls share (with a texture image if you like).</small>';
  $('matList').querySelectorAll('[data-mat]').forEach(el => (el.onclick = () => enterEdit('material', el.dataset.mat)));
}
function openMaterial(id, forSide) {
  matId = id;
  const m = (id && model.materials?.[id]) || {}, use = id ? materialUse(model).get(id) || [] : [];
  $('matForm').hidden = false;
  $('mName').value = m.name || ''; $('mId').value = id || '(from the name)'; $('mColor').value = m.color || '#cccccc'; $('mTex').value = m.texture || ''; $('mUv').value = m.uvScale ?? '';
  $('mUse').textContent = id ? (use.length ? `Used by ${use.join(', ')}.` : 'Not used by any wall yet.') : forSide ? `Will be used for the ${forSide} side of ${wallId}.` : '';
  $('mDelete').hidden = !id; $('mErr').textContent = '';
  materialSwatches();
  $('matForm').dataset.forSide = forSide || '';
  renderMaterials();
  $('mName').focus();
}
/** The palette under the material's colour picker. */
function materialSwatches() {
  fillSwatches($('mSwatches'), $('mColor').value, true, c => { $('mColor').value = c; materialSwatches(); }, () => $('mColor').value, false);
}

function applyMaterial() {
  const props = { name: $('mName').value.trim() || null, color: $('mColor').value, texture: $('mTex').value.trim() || null, uvScale: $('mUv').value.trim() || null };
  if (!props.name && !matId) { $('mErr').textContent = 'Give it a name.'; return; }
  const r = setMaterial(model, matId, props);
  if (r.report.errors.length) { $('mErr').textContent = r.report.errors.join('; '); return; }
  let next = r.model;
  const side = $('matForm').dataset.forSide;
  if (side && wallId) {
    // a material made from a wall side: use it there straight away
    const w = level().walls.find(x => x.id === wallId), sides = { ...(w.sides || {}), [side]: { material: r.id } };
    const s = setWallProps(next, levelId, wallId, { sides }, opts());
    if (!s.report.errors.length) next = s.model;
    wallFormFor = null;
  }
  matId = r.id; $('matForm').dataset.forSide = '';
  commit(next);
  openMaterial(r.id);
  setStatus(`material ${r.id} saved in the model (not saved to the repo yet)`);
}

function applyWall() {
  const { props, errors } = wallPropsFromForm(wall(), wallForm());
  if (errors.length) { $('wErr').textContent = errors.join('; '); return; }
  if (!Object.keys(props).length) { $('wErr').textContent = 'Nothing changed.'; return; }
  const id = wallId, r = setWallProps(model, levelId, id, props, opts());
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  const lines = describeReconcile(r.report);
  if (r.report.preview.length && !confirm(['This changes the plan:', ...lines, 'Apply?'].join('\n\n'))) return;
  $('wallsOut').innerHTML = lines.map(esc).join('<br>');
  commit(r.model);
  setStatus(`${id}: ${Object.keys(props).join(', ')} changed (not saved yet)`);
}

/** The opening panel: where it is, its sizes, and how a door or window opens (into which room). */
function showOpening() {
  const info = openingInfo(level(), openingId);
  if (!info) { openingId = null; $('openingPanel').hidden = true; return; }
  const o = info.opening, nm = ids => ids.map(id => level().rooms?.find(r => r.id === id)?.name || id).join(', ') || 'outside';
  $('oTitle').innerHTML = titleHtml(o);
  $('oInfo').innerHTML = `in <a href="#" id="oWall" title="${esc(o.wall)}">${esc(refName(o.wall))}</a> (${info.length} mm, ${info.top} mm high)` + (openingAssumed(o).length ? ` · <b class="warn">still default: ${esc(openingAssumed(o).join(', '))}</b>` : '');
  $('oWall').onclick = e => { e.preventDefault(); enterEdit('wall', o.wall); };
  fillFrom('oFrom', info.wall, o.id);
  $('oOffsetNote').textContent = 'mm from that corner to the nearer edge';
  $('oBelowNote').textContent = `mm, top to the ceiling (${info.top})`;
  // the edges named by the corners of the room it is in, on each side of it
  const cs = measureCorners(level(), o.wall), before = defaultCorner(cs, o.offset, o.offset + o.width);
  const after = cs.filter(c => c.dir < 0 && c.s >= o.offset + o.width - 1).sort((a, b) => a.s - b.s)[0];
  const side = c => (c && /#p\d+$/.test(c.key) ? ` (${c.label.replace(/ of .*/, '')} side)` : '');
  $('oHinge').options[0].textContent = `near edge${side(before?.dir > 0 ? before : null)}`;
  $('oHinge').options[1].textContent = `far edge${side(after)}`;
  $('oHinge').options[2].textContent = 'both sides (double)';
  // a wall standing inside one room faces it on both sides: then say which side (plan directions)
  let [onRight, onLeft] = [nm(info.sides.right), nm(info.sides.left)];
  if (onRight === onLeft) {
    const w = info.wall, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
    const dir = v => ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'][((Math.round(Math.atan2(v[1], v[0]) / (Math.PI / 4)) % 8) + 8) % 8];
    onRight = `${onRight}, ${dir([u[1], -u[0]])} side`; onLeft = `${onLeft}, ${dir([-u[1], u[0]])} side`;
  }
  $('oSwing').options[0].textContent = onRight;
  $('oSwing').options[1].textContent = onLeft;
  $('oPlace').options[1].textContent = `flush with the ${onLeft} side`; $('oPlace').options[2].textContent = `flush with the ${onRight} side`;
  if (openingFormFor !== o) {
    const f = openingToForm(o, info.top, fromOf(o.id, info.wall));
    $('oName').value = f.name; $('oType').value = f.type; $('oOffset').value = f.offset; $('oWidth').value = f.width; $('oSill').value = f.sill; $('oHead').value = f.head;
    $('oHeight').value = f.height; $('oBelow').value = f.below; $('oHinge').value = f.hinge; $('oSwing').value = f.swing;
    if (f.type === 'door') $('oDoorOpens').value = f.opens; else { $('oDoorOpens').value = 'swing'; $('oOpens').value = f.opens; }
    for (const [id, k] of [['oOffset', 'offset'], ['oWidth', 'width'], ['oSill', 'sill'], ['oHead', 'head'], ['oHeight', 'height'], ['oBelow', 'below']]) $(id).placeholder = f.placeholders[k];
    $('oThick').value = f.thickness;
    $('oColorUse').checked = f.colorUse; $('oColor').value = f.color || FITTING_DEFAULTS[o.type]?.color || '#f2f0ea';
    $('oPlace').value = f.placement; $('oSillDepth').value = f.sillDepth; $('oSillColorUse').checked = f.sillColorUse; $('oSillColor').value = f.sillColor || FITTING_DEFAULTS.sill.color;
    $('oMeasured').checked = f.measured; $('oErr').textContent = '';
    openingFormFor = o;
    fillCopyInto('opening', o);
  }
  $('oMeasuredRow').hidden = !openingAssumed(o).length;
  showOpeningRows();
}
function showOpeningRows() {
  const t = $('oType').value;
  $('oOpensRow').hidden = t !== 'window';
  $('oDoorOpensRow').hidden = t !== 'door';
  $('oLeafRow').hidden = !(t === 'door' || (t === 'window' && ['side-hung', 'tilt-turn'].includes($('oOpens').value)));
  // a sliding door: which way it slides open, and the side of the wall it runs on (a pocket door runs inside it)
  const slides = t === 'door' && $('oDoorOpens').value !== 'swing';
  $('oHingeLbl').textContent = slides ? 'Slides open toward' : 'Hinge';
  $('oHinge').options[2].textContent = slides ? 'both ways (two leaves)' : 'both sides (double)';
  $('oSwingLbl').textContent = slides ? 'Runs on the side of' : 'Opens into';
  $('oSwingRow').hidden = slides && $('oDoorOpens').value === 'pocket';
  $('oThickRow').hidden = t === 'passage';
  $('oThickWhat').textContent = t;
  $('oLookBox').hidden = t === 'passage'; $('oSillRow').hidden = t !== 'window'; $('oPlaceWhat').textContent = t;
}
/**
 * The corner an opening's or wall fixture's position is measured from: { key, s, dir, pos, label }
 * (measureCorners()): the one picked in "Measured from", else the nearest room corner before it.
 */
function fromOf(id, w) {
  const cs = w ? measureCorners(level(), w.id) : [];
  const [t0, t1] = spanOf(id);
  return cs.find(c => c.key === measureFrom.get(id)) || defaultCorner(cs, t0, t1) || { key: 'a', s: 0, dir: 1, pos: w?.a, label: '' };
}

/** Where an opening or wall fixture is along its wall: [t0, t1] mm from the wall's start. */
function spanOf(id) {
  const thing = level().openings?.find(o => o.id === id) || level().fixtures?.find(x => x.id === id);
  const t0 = thing?.offset ?? thing?.attach?.offset ?? 0;
  return [t0, t0 + (thing?.width ?? 0)];
}

/** The "Measured from" picker: every room corner along the wall (both corners of the room you stand in). */
function fillFrom(sel, w, id) {
  const cs = measureCorners(level(), w.id), [t0, t1] = spanOf(id);
  // the rooms whose stretch of this wall the thing is on come first: those are the corners you can reach
  const here = new Set(cs.filter(c => c.dir > 0 && c.s <= t0 + 1 && cs.some(d => d.dir < 0 && d.s >= t1 - 1 && d.key.split('#')[0] === c.key.split('#')[0])).map(c => c.key.split('#')[0]));
  const opt = c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`, mine = cs.filter(c => here.has(c.key.split('#')[0])), rest = cs.filter(c => !mine.includes(c));
  $(sel).innerHTML = mine.length && rest.length ? `<optgroup label="Where it is">${mine.map(opt).join('')}</optgroup><optgroup label="Other corners along this wall">${rest.map(opt).join('')}</optgroup>` : cs.map(opt).join('');
  $(sel).value = fromOf(id, w).key;
  measureFrom.set(id, $(sel).value);        // kept, so the corner does not change under you when the thing moves past another one
}

/**
 * Another corner picked to measure from: a typed position is converted so the opening stays where it is;
 * with nothing typed yet the panel is simply refilled for that corner.
 */
function switchFrom(kind) {
  const isO = kind === 'opening', id = isO ? openingId : fixtureId, thing = isO ? opening() : fixture();
  if (!thing) return;
  const w = level().walls.find(v => v.id === (isO ? thing.wall : thing.attach?.wall));
  if (!w) return;
  const field = isO ? 'oOffset' : 'xOffset', was = isDirty(), t = $(field).value.trim(), v = Number(t);
  const width = isO ? (Number($('oWidth').value.trim()) || thing.width) : 0, old = fromOf(id, w);
  measureFrom.set(id, $(isO ? 'oFrom' : 'xFrom').value);
  if (was && t !== '' && Number.isFinite(v)) $(field).value = offsetFrom({ offset: offsetTo(v, old, width), width }, fromOf(id, w));
  else { if (isO) openingFormFor = null; else fixtureFormFor = null; refresh(); snap(); return; }
  draw();
}

const openingForm = () => ({ name: $('oName').value, type: $('oType').value, offset: $('oOffset').value, width: $('oWidth').value, sill: $('oSill').value, head: $('oHead').value, height: $('oHeight').value, below: $('oBelow').value, hinge: $('oHinge').value, swing: $('oSwing').value, opens: $('oType').value === 'door' ? $('oDoorOpens').value : $('oOpens').value, thickness: $('oThick').value, measured: $('oMeasured').checked, colorUse: $('oColorUse').checked, color: $('oColor').value, placement: $('oPlace').value, sillDepth: $('oSillDepth').value, sillColorUse: $('oSillColorUse').checked, sillColor: $('oSillColor').value });

function applyOpening() {
  const info = openingInfo(level(), openingId);
  const { props, errors } = openingPropsFromForm(info.opening, openingForm(), info.top, fromOf(openingId, info.wall));
  if (errors.length) { $('oErr').textContent = errors.join('; '); return; }
  if (!Object.keys(props).length) { $('oErr').textContent = 'Nothing changed.'; return; }
  const r = setOpening(model, levelId, openingId, props, opts());
  if (r.report.errors.length) { $('oErr').textContent = r.report.errors.join('; '); return; }
  commit(r.model);
  setStatus(`${openingId}: ${Object.keys(props).join(', ')} changed (not saved yet)`);
}

// ---- objects: boxes with a size, on a wall or standing in a room ----
function placeObject(spec, what) {
  if (!dropFresh([spec.attach?.wall])) return;
  const base = model, r = addObject(model, levelId, spec, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  commit(r.model);
  enterEdit('object', r.object.id, { ask: false }); startFresh('object', r.object.id, base, 'object');
  setStatus(`${r.object.id} is a new object ${what}. Name it and Apply to create it`);
}

function showObject() {
  const o = object();
  if (!o) { objectId = null; $('objectPanel').hidden = true; return; }
  const lv = level(), w = o.attach && lv.walls.find(v => v.id === o.attach.wall);
  $('obTitle').innerHTML = titleHtml(o);
  $('obInfo').innerHTML = `${o.attach ? `on wall <a href="#" id="obWall">${esc(o.attach.wall)}</a>` : 'standing in the plan'}${o.assumed?.length ? ` · <b class="warn">still default: ${esc(o.assumed.join(', '))}</b>` : ''}`;
  $('obWall')?.addEventListener('click', e => { e.preventDefault(); enterEdit('wall', o.attach.wall); });
  for (const [id, show] of [['obOffsetRow', !!o.attach], ['obSideRow', !!o.attach], ['obGapRow', !!o.attach], ['obXRow', !o.attach], ['obYRow', !o.attach], ['obRotRow', !o.attach]]) $(id).hidden = !show;
  if (w) { const start = cornerAt(lv, w.a); $('obOffsetNote').textContent = start ? `mm from corner ${start.index} of ${start.name}` : "mm from the wall's start"; }
  if (objectFormFor !== o) {
    $('obName').value = o.name ?? ''; $('obColor').value = o.color || '#888888';
    [$('obW').value, $('obD').value, $('obH').value] = o.size; $('obZ').value = o.z;
    if (o.attach) { $('obOffset').value = o.attach.offset; $('obSide').value = o.attach.side; $('obGap').value = o.attach.gap ?? ''; }
    else { $('obX').value = o.pos[0]; $('obY').value = o.pos[1]; $('obRot').value = o.rotationDeg ?? ''; }
    $('obErr').textContent = ''; objectFormFor = o;
    fillCopyInto('object', o);
  }
}

function applyObjectForm() {
  const o = object(), num = id => Number($(id).value.trim() === '' ? NaN : $(id).value), props = {};
  const size = [num('obW'), num('obD'), num('obH')];
  if (size.some((v, i) => v !== o.size[i])) props.size = size;
  if (num('obZ') !== o.z) props.z = num('obZ');
  const name = $('obName').value.trim();
  if (name !== (o.name ?? '')) props.name = name || null;
  if ($('obColor').value !== (o.color || '#888888')) props.color = $('obColor').value;
  if (o.attach) {
    const gap = $('obGap').value.trim() === '' ? undefined : num('obGap');
    if (num('obOffset') !== o.attach.offset || $('obSide').value !== o.attach.side || gap !== o.attach.gap) props.attach = { ...o.attach, offset: num('obOffset'), side: $('obSide').value, ...(gap === undefined ? { gap: undefined } : { gap }) };
  } else {
    const rot = $('obRot').value.trim() === '' ? 0 : num('obRot');
    if (num('obX') !== o.pos[0] || num('obY') !== o.pos[1]) props.pos = [num('obX'), num('obY')];
    if (rot !== (o.rotationDeg ?? 0)) { props.rotationDeg = rot; props.pos ??= [...o.pos]; }
  }
  if (Object.values(props).some(v => Array.isArray(v) ? v.some(n => !Number.isFinite(n)) : typeof v === 'number' && !Number.isFinite(v))) { $('obErr').textContent = 'Sizes, heights and positions must be numbers of mm.'; return; }
  if (!Object.keys(props).length) { $('obErr').textContent = 'Nothing changed.'; return; }
  const r = setObject(model, levelId, objectId, props, opts());
  if (r.report.errors.length) { $('obErr').textContent = r.report.errors.join('; '); return; }
  $('obErr').textContent = '';
  commit(r.model);
  setStatus(`${objectId}: ${Object.keys(props).join(', ')} changed (not saved yet)`);
}

// ---- dragging a lamp, switch or object on the plan ----
const r1d = v => Math.round(v * 10) / 10;
/** Where a thing on a wall goes when its middle is dragged to p: the nearest wall within reach, the side p is on, the offset along it. */
function attachNear(p, cur, width) {
  const lv = level(), geo = curGeo;
  let best = null;
  for (const w of lv.walls || []) {
    if (!hasBody(w)) continue;
    const f = geo.frames.get(w.id), s = (p[0] - w.a[0]) * f.u[0] + (p[1] - w.a[1]) * f.u[1], t = (p[0] - w.a[0]) * f.n[0] + (p[1] - w.a[1]) * f.n[1];
    const along = Math.min(Math.max(s, 0), f.L), dist = Math.hypot(s - along, t);
    if (dist < 900 && (!best || dist < best.dist)) best = { w, f, s, t, dist };
  }
  if (!best) return cur;
  const { w, f, s, t } = best;
  return { ...cur, wall: w.id, side: t >= 0 ? 'left' : 'right', offset: r1d(Math.min(Math.max(s - width / 2, 0), Math.max(f.L - width, 0))) };
}
const freePoint = e => wallPoint({ clientX: e.clientX, clientY: e.clientY, altKey: true }).pos;
function dragStart(e) {
  if (e.button !== 0 || drawing || measure?.isOn() || peekId) return;
  if (roomDragStart(e)) return;
  if (wallDragStart(e)) return;
  const endEl = e.target.closest('[data-send]');                  // an end of the selected LED strip: drag it to change where it starts or how long it is
  if (endEl && !(editing && !(editing.kind === 'fixture' && editing.id === endEl.dataset.id))) { pan = null; dragging = { kind: 'send', id: endEl.dataset.id, end: endEl.dataset.send, x: e.clientX, y: e.clientY, moved: false, frame: 0, key: `send:${endEl.dataset.id}:${Math.round(performance.now())}` }; return; }
  const rotEl = e.target.closest('[data-orot]');
  if (rotEl) { pan = null; dragging = { kind: 'orot', id: rotEl.dataset.orot, x: e.clientX, y: e.clientY, moved: false, frame: 0, key: `rot:${rotEl.dataset.orot}:${Math.round(performance.now())}` }; return; }
  const el = e.target.closest('[data-kind="fixture"], [data-kind="object"]');
  if (!el) return;
  const kind = el.dataset.kind, id = el.dataset.id;
  if (editing && !(editing.kind === kind && editing.id === id)) return;
  { const sx = kind === 'fixture' && level().fixtures?.find(f => f.id === id); if (sx?.kind === 'strip' && stripForm(sx) !== 'wall') return; }   // on an object or a window it follows that: move that
  pan = null;                                                    // this pointer moves the thing, not the plan
  // where the thing's middle is against the pointer, kept while dragging (the thing does not jump under the pointer)
  const lv = level(), thing = kind === 'fixture' ? lv.fixtures?.find(f => f.id === id) : lv.objects?.find(o => o.id === id);
  const mid = !thing ? null : kind === 'fixture' ? curGeo.fixturePos(thing) : (fp => fp && [fp.reduce((s, q) => s + q[0], 0) / fp.length, fp.reduce((s, q) => s + q[1], 0) / fp.length])(curGeo.objectFootprint(thing));
  const p0 = freePoint(e);
  dragging = { kind, id, x: e.clientX, y: e.clientY, moved: false, key: `drag:${id}:${Math.round(performance.now())}`, frame: 0, grab: mid ? [mid[0] - p0[0], mid[1] - p0[1]] : [0, 0] };
}
// ---- dragging the room (or solid) being edited: inside it moves it, a corner reshapes it ----
/** The plan point under the pointer for a room drag, and the start points it may snap to (not its own). */
function roomDragSnaps() {
  const own = new Set((level().walls || []).filter(w => (w.from || []).some(f => f.startsWith(`${roomId}#`))).map(w => w.id));
  return (showUnderlay() ? snapsAround : snaps).filter(s => !(roomId && s.ref.startsWith(`${roomId}#`)) && !own.has(s.ref.split('#')[0]));
}
function roomDragStart(e) {
  if (!solved?.ok || !(roomId || draft) || !solved.capture) return false;
  const corner = e.target.closest('[data-corner]'), body = !corner && e.target.closest('[data-cur]');
  if (!corner && !body) return false;
  if (editing && !(editing.kind === shape && (editing.id ?? null) === (roomId ?? null))) return false;
  pan = null;
  dragging = { kind: corner ? 'corner' : 'room', i: corner ? +corner.dataset.corner : null, x: e.clientX, y: e.clientY, moved: false, frame: 0,
    p0: freePoint(e), cap0: solved.capture, poly0: solved.polygon.map(p => [...p]), pts: roomDragSnaps() };
  return true;
}
function roomDragMove(e, d) {
  if (!d.moved) {
    d.moved = true;
    if (!editing && roomId && !enterEdit(shape, roomId)) { dragging = null; return; }     // the house view: open it first
  }
  cancelAnimationFrame(d.frame);
  d.frame = requestAnimationFrame(() => {
    if (dragging !== d) return;
    const svg = $('preview'), k = 1 / Math.abs(svg.getScreenCTM()?.a || 1), q = freePoint(e);
    let cap, msg;
    if (d.kind === 'room') {
      let delta = [q[0] - d.p0[0], q[1] - d.p0[1]], on = null;
      const sm = e.altKey ? null : snapMove(d.poly0, delta, d.pts, 14 * k);    // a corner lands on a point near it
      if (sm) { delta = [delta[0] + sm.fix[0], delta[1] + sm.fix[1]]; on = sm.ref; }
      delta = delta.map(v => Math.round(v));
      if (d.cap0.mode === 'circle') {
        // a round pillar: the distances from its two walls (or its middle) follow
        const c0 = d.cap0.raw.start, f = roundMovedTo(roundForm(), level(), [c0[0] + delta[0], c0[1] + delta[1]], d.cap0.raw.diameter);
        $('rDA').value = f.distA ?? ''; $('rDB').value = f.distB ?? ''; $('rX').value = f.x ?? ''; $('rY').value = f.y ?? '';
        recompute(); showEditBar();
        d.msg = `Moved ${delta[0]} mm east, ${delta[1]} mm north${on ? ` (on ${on})` : ''}. Apply to keep it.`;
        setStatus(d.msg);
        return;
      }
      cap = moveCapture(d.cap0, delta);
      msg = `Moved ${delta[0]} mm east, ${delta[1]} mm north${on ? ` (a corner on ${on})` : ''}: only where corner 0 is changes. Apply to keep it.`;
    } else {
      let t = q;
      const sp = e.altKey ? null : nearestPoint(q, d.pts, 14 * k);
      if (sp) t = sp.pos;
      if (e.shiftKey) {
        // along one of the two walls at the corner only: the other wall keeps its place
        const P = d.poly0[d.i], n = d.poly0.length, dirOf = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
        const u = dirOf(d.poly0[(d.i + n - 1) % n], P), v = dirOf(P, d.poly0[(d.i + 1) % n]), w = [t[0] - P[0], t[1] - P[1]];
        const along = dir => { const s = w[0] * dir[0] + w[1] * dir[1]; return [P[0] + dir[0] * s, P[1] + dir[1] * s]; };
        const a = along(u), b = along(v);
        t = Math.hypot(a[0] - t[0], a[1] - t[1]) <= Math.hypot(b[0] - t[0], b[1] - t[1]) ? a : b;
      }
      t = t.map(v => Math.round(v * 10) / 10);
      const r = dragCorner(d.cap0, d.poly0, d.i, t, solveCapture);
      if (r.error) { setStatus(r.error === 'exact' ? `Wall ${r.exact.map(wallName).join(', ')} is marked exact: take it out of Exact lengths to move this corner.` : r.error); return; }
      cap = r.capture;
      msg = r.changed.length ? `Corner ${d.i}: wall ${r.changed.map(wallName).join(', ')} worked out${r.checks.length ? `; the measured ${r.checks.map(wallName).join(', ')} kept as checks` : ''}${sp ? ` (on ${sp.ref})` : ''}. Apply to keep it.` : '';
    }
    const f = captureToForm(cap);
    for (const key of ['ox', 'oy', 'lengths', 'derived', 'checks']) $(key).value = f[key];
    recompute(); showEditBar();
    d.msg = msg;
    if (msg) setStatus(msg);
  });
}
// ---- dragging a hand-drawn wall: as a whole, or by one end (the form's position fields follow; Apply keeps it) ----
function wallDragStart(e) {
  const w = wallId && wall();
  if (!w || w.from?.length) return false;
  const end = e.target.closest('[data-wend]'), body = !end && (e.target.closest('[data-wbody]') || e.target.closest(`[data-kind="wall"][data-id="${CSS.escape(w.id)}"]`));
  if (!end && !body) return false;
  if (editing && !(editing.kind === 'wall' && editing.id === w.id)) return false;
  pan = null;
  dragging = { kind: end ? 'wallend' : 'wall', end: end?.dataset.wend, x: e.clientX, y: e.clientY, moved: false, frame: 0, p0: freePoint(e),
    ends0: (editing && wallEnds()) || { a: [...w.a], b: [...w.b] }, pts: (showUnderlay() ? snapsAround : snaps).filter(s => !s.ref.startsWith(`${w.id}#`)) };
  return true;
}
function wallDragMove(e, d) {
  if (!d.moved) {
    d.moved = true;
    if (!editing && !enterEdit('wall', wallId)) { dragging = null; return; }
  }
  cancelAnimationFrame(d.frame);
  d.frame = requestAnimationFrame(() => {
    if (dragging !== d) return;
    const k = 1 / Math.abs($('preview').getScreenCTM()?.a || 1), q = freePoint(e);
    let ends, on = null;
    if (d.kind === 'wall') {
      let delta = [q[0] - d.p0[0], q[1] - d.p0[1]];
      const sm = e.altKey ? null : snapMove([d.ends0.a, d.ends0.b], delta, d.pts, 14 * k);
      if (sm) { delta = [delta[0] + sm.fix[0], delta[1] + sm.fix[1]]; on = sm.ref; }
      ends = moveWall(d.ends0, delta.map(v => Math.round(v)));
    } else {
      const sp = e.altKey ? null : nearestPoint(q, d.pts, 14 * k);
      ends = dragWallEnd(d.ends0, d.end, sp ? sp.pos : q.map(v => Math.round(v)), { lock: $('wLock').checked ? 'axis' : null, force: e.shiftKey });
      // dropped on a room corner: that end hangs on it from now on
      const p = ends[d.end], sel = d.end === 'a' ? 'wAnchA' : 'wAnchB';
      if (sp && Math.hypot(p[0] - sp.pos[0], p[1] - sp.pos[1]) < 0.5) { on = sp.ref; if (ROOM_CORNER.test(sp.ref) && [...$(sel).options].some(o => o.value === sp.ref)) $(sel).value = sp.ref; }
    }
    fillWallPos(ends.a, ends.b);
    draw(); showEditBar();
    d.msg = `${d.kind === 'wall' ? 'Wall moved' : `${d.end === 'a' ? 'Start' : 'End'} moved`}${on ? ` (on ${on})` : ''}: ${$('wPosOut').textContent}. Apply to keep it.`;
    setStatus(d.msg);
  });
}
function dragMove(e) {
  const d = dragging;
  if (!d || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6)) return;
  if (d.kind === 'room' || d.kind === 'corner') { roomDragMove(e, d); return; }
  if (d.kind === 'wall' || d.kind === 'wallend') { wallDragMove(e, d); return; }
  if (d.kind === 'send') {
    d.moved = true;
    cancelAnimationFrame(d.frame);
    d.frame = requestAnimationFrame(() => {
      const x = dragging === d && level().fixtures?.find(f => f.id === d.id), w = x && stripForm(x) === 'wall' && level().walls.find(v => v.id === x.attach.wall);
      if (!w) return;
      const f = curGeo.frames.get(w.id), q = freePoint(e), s = (q[0] - w.a[0]) * f.u[0] + (q[1] - w.a[1]) * f.u[1], MIN = 50;
      const start = x.attach.offset, end = x.attach.offset + x.attach.length;
      const offset = d.end === 'a' ? Math.min(Math.max(s, 0), end - MIN) : start, length = d.end === 'a' ? end - offset : Math.min(Math.max(s - start, MIN), f.L - start);
      const r = setFixture(model, levelId, d.id, { attach: { ...x.attach, offset: r1d(offset), length: r1d(length) } }, opts());
      if (r.report.errors.length) return;
      commit(r.model, d.key);
      setStatus(`${d.id}: ${Math.round(length)} mm long, from ${Math.round(offset)} mm (not saved yet)`);
    });
    return;
  }
  if (d.kind === 'orot') {
    d.moved = true;
    cancelAnimationFrame(d.frame);
    d.frame = requestAnimationFrame(() => {
      const o = dragging === d && level().objects?.find(x => x.id === d.id);
      if (!o) return;
      const r = setObject(model, levelId, d.id, rotateObject(o, freePoint(e), { free: e.altKey }), opts());
      if (r.report.errors.length) return;
      commit(r.model, d.key);                                    // one undo step for the whole turn
      setStatus(`${d.id} turned to ${level().objects.find(x => x.id === d.id)?.rotationDeg}° (not saved yet)`);
    });
    return;
  }
  if (!d.moved) { d.moved = true; if (!editing) (d.kind === 'fixture' ? selectFixture : selectObject)(d.id); }
  cancelAnimationFrame(d.frame);
  d.frame = requestAnimationFrame(() => {
    if (dragging !== d) return;
    const q = freePoint(e), p = [q[0] + d.grab[0], q[1] + d.grab[1]], lv = level();      // p = where the middle of the thing goes
    let r;
    if (d.kind === 'fixture') {
      const x = lv.fixtures.find(f => f.id === d.id);
      if (!x) return;
      r = setFixture(model, levelId, d.id, x.attach ? { attach: attachNear(p, x.attach, x.kind === 'strip' ? x.attach.length : 0) } : { pos: [Math.round(p[0]), Math.round(p[1])] }, opts());
    } else {
      const o = lv.objects.find(f => f.id === d.id);
      if (!o) return;
      if (o.attach) r = setObject(model, levelId, d.id, { attach: attachNear(p, o.attach, o.size[0]) }, opts());
      else {
        // pos is the corner the box is measured from: put its middle on the pointer
        const a = (o.rotationDeg || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = o.size[0] / 2, hd = o.size[1] / 2;
        r = setObject(model, levelId, d.id, { pos: [Math.round(p[0] - (hw * c - hd * s)), Math.round(p[1] - (hw * s + hd * c))] }, opts());
      }
    }
    if (r.report.errors.length) return;
    commit(r.model, d.key);                                      // one undo step for the whole drag
    setStatus(`${d.id} moved (not saved yet)`);
  });
}

/** The Floor areas section: every level's rooms and totals, and the interior total of the house. */
function renderAreas() {
  const all = modelAreas(model, modelGeos || buildModelGeometry(model)), house = [...all.values()].reduce((s, a) => s + a.interior, 0);
  $('areaTotal').textContent = house ? `(${fmtArea(house)})` : '';
  $('areas').innerHTML = [...model.levels].sort((a, b) => b.elevation - a.elevation).map(lv => {
    const a = all.get(lv.id);
    if (!a.rooms.length) return '';
    const rows = a.rooms.map(r => {
      const parts = [...r.solids.map(s => `− ${s.id.replace(/^s_/, '')} ${fmtArea(s.area)}`), r.stairwell ? `− stairwell ${fmtArea(r.stairwell)}` : '', r.approx.length ? '(approximate)' : ''].filter(Boolean).join(' ');
      return `<div class="arow${lv.id === levelId && r.id === roomId ? ' sel' : ''}" data-aroom="${esc(lv.id)}|${esc(r.id)}"><span>${esc(r.name)}${r.exterior ? ' <small>outdoors</small>' : ''}${r.open ? ' <small>open to the level below</small>' : ''}${parts ? `<br><small>${esc(fmtArea(r.gross))} ${esc(parts)}</small>` : ''}</span><b>${r.open ? '–' : esc(fmtArea(r.net))}</b></div>`;
    }).join('');
    return `<div class="arow ahead"><span>${esc(lv.name || lv.id)}</span><span>${esc(fmtArea(a.interior))}${a.exterior ? ` <small>+ ${esc(fmtArea(a.exterior))} outdoors</small>` : ''}</span></div>${rows}`;
  }).join('') || '<small>No rooms yet.</small>';
  $('areas').querySelectorAll('[data-aroom]').forEach(el => (el.onclick = () => {
    const [lv, id] = el.dataset.aroom.split('|');
    if (lv !== levelId && !goToLevel(lv)) return;
    selectRoom(id);
  }));
}

/** The Anchors section: each anchor with how far its levels are apart, and a way to line a level up. */
function renderAnchors() {
  const list = anchorStatus(model, modelGeos || buildModelGeometry(model)), lvName = id => model.levels.find(l => l.id === id)?.name || id;
  $('anchorCount').textContent = list.length ? `(${list.length})` : '';
  const dir = d => [Math.abs(d[0]) >= 0.5 ? `${Math.round(Math.abs(d[0]))} mm ${d[0] > 0 ? 'east' : 'west'}` : '', Math.abs(d[1]) >= 0.5 ? `${Math.round(Math.abs(d[1]))} mm ${d[1] > 0 ? 'north' : 'south'}` : ''].filter(Boolean).join(' and ');
  $('anchorList').innerHTML = list.map(a => {
    const off = Object.entries(a.deltas).filter(([, d]) => Math.hypot(d[0], d[1]) > 5);
    const state = a.points.some(p => p.error) ? `<span style="color:var(--bad)">${esc(a.points.find(p => p.error).error)}</span>`
      : off.length ? off.map(([lv, d]) => `<span style="color:var(--warn)">${esc(lvName(lv))} is ${dir(d)} of ${esc(lvName(a.ref))}</span> <button data-align="${esc(a.id)}|${esc(lv)}">Align ${esc(lvName(lv))}</button>`).join('<br>')
      : '<span style="color:var(--good, #4cc38a)">lined up</span>';
    return `<div class="arow"><span>${esc(a.name || a.id)} <small>${a.points.map(p => esc(p.ref || `${p.level} (x, y)`)).join(' ↔ ')}</small><br>${state}</span><button data-delanchor="${esc(a.id)}" title="Remove the anchor (nothing moves)">×</button></div>`;
  }).join('') || '<small>None yet.</small>';
  $('anchorList').querySelectorAll('[data-align]').forEach(b => (b.onclick = () => {
    const [id, lv] = b.dataset.align.split('|');
    const r = alignLevel(model, id, lv, opts());
    if (r.report.errors.length) { $('anErr').textContent = r.report.errors.join('; '); return; }
    $('anErr').textContent = '';
    commit(r.model);
    setStatus(`${lv} moved ${dir(r.delta)} (not saved yet)`);
  }));
  $('anchorList').querySelectorAll('[data-delanchor]').forEach(b => (b.onclick = () => { const r = deleteAnchor(model, b.dataset.delanchor); if (!r.report.errors.length) commit(r.model); }));
  const opts2 = startOptions(snapsAround, nameOpts()).filter(o => /^(r|s|w|st)_[^#]+#/.test(o.ref)).map(o => `<option value="${esc(o.ref)}">${esc(o.label)}</option>`).join('');
  for (const id of ['anA', 'anB']) { const keep = $(id).value; $(id).innerHTML = opts2; if (keep && [...$(id).options].some(o => o.value === keep)) $(id).value = keep; }
  if ($('anB').selectedIndex === $('anA').selectedIndex && $('anB').options.length > 1) $('anB').selectedIndex = $('anB').options.length - 1;
}

/** The Checks section: every check, worst first, with its place in the solve; a click shows it on the plan. */
function renderChecks() {
  const geos = modelGeos || buildModelGeometry(model), index = new Map();
  for (const lv of model.levels) for (const s of collectSnapPoints(model, lv, geos.get(lv.id))) index.set(s.ref, { pos: s.pos, level: lv.id });
  const tol = resolveSettings(loc, level()).checkTolerance || { ok: 5, warn: 15 }, rows = checkRows(model.checks, ref => index.get(ref), tol);
  const rooms = model.levels.flatMap(l => l.rooms || []), off = rows.filter(r => r.cls !== 'ok').length;
  $('checkCount').textContent = rows.length ? `(${rows.length}${off ? `, ${off} off` : ''})` : '';
  const sign = v => `${v > 0 ? '+' : ''}${Math.round(v)}`;
  $('checkList').innerHTML = rows.map(r => {
    const c = r.check, k = checkCorners(c), room = k && rooms.find(x => x.id === k.room), can = room && checkCorners(c, room.polygon?.length) && room.capture?.mode === 'lengths';
    const solve = can || c.solve ? `<label class="inl" title="${can ? `Counts as one more diagonal when ${esc(room.name || room.id)} is solved` : 'Only a room measured by lengths and diagonals takes checks into its solve'}"><input type="checkbox" data-cksolve="${esc(c.id)}"${c.solve ? ' checked' : ''}${can || c.solve ? '' : ' disabled'}> in the solve</label>` : '';
    const what = r.broken ? `<span style="color:var(--bad)">a point is gone: ${esc(r.missing)}</span>` : `${Math.round(r.model)} / ${c.measured} <b class="${r.cls}">${sign(r.delta)}</b>`;
    return `<div class="arow" style="cursor:pointer" data-ck="${esc(c.id)}"><span><span class="dot ${r.cls}" style="display:inline-block;margin-right:6px"></span>${esc(refName(c.a))} ↔ ${esc(refName(c.b))}<br><small>${esc(c.note || c.id)}</small> ${solve}</span><span>${what} <button data-ckdel="${esc(c.id)}" title="Remove the check">×</button></span></div>`;
  }).join('') || '<small>None yet.</small>';
  $('checkList').querySelectorAll('[data-ck]').forEach(el => (el.onclick = e => {
    if (e.target.closest('button, input, label')) return;
    const c = model.checks.find(x => x.id === el.dataset.ck), a = index.get(c.a), b = index.get(c.b);
    if (!a || !b) return;
    if (a.level !== levelId && !goToLevel(a.level)) return;
    measure.show({ ref: c.a, pos: a.pos }, { ref: c.b, pos: b.pos });
  }));
  const run = r => { if (r.report.errors.length) { $('ckErr').textContent = r.report.errors.join('; '); return; } $('ckErr').textContent = ''; commit(r.model); };
  $('checkList').querySelectorAll('[data-cksolve]').forEach(b => (b.onchange = () => run(setCheck(model, b.dataset.cksolve, { solve: b.checked }, opts()))));
  $('checkList').querySelectorAll('[data-ckdel]').forEach(b => (b.onclick = () => run(deleteCheck(model, b.dataset.ckdel, opts()))));
}

/** + Stairs: a straight stair from the selected room's corner 0 up to the next level, to adjust in its panel. */
function newStairs() {
  if (!dropFresh()) return;
  const lv = level(), above = model.levels.filter(l => l.elevation > lv.elevation && (l.building ?? null) === (lv.building ?? null)).sort((a, b) => a.elevation - b.elevation)[0];
  if (!above) { setStatus('There is no level above this one: add one first (+ New level…)'); return; }
  const rm = shape === 'room' ? room() : null, at = rm || lv.rooms?.[0];
  if (!at) { setStatus('Add a room first: the stairs start at a corner of one'); return; }
  const risers = Math.max(2, Math.round((above.elevation - lv.elevation) / 180));
  const st = { id: newStairsId(model, 'stairs'), to: above.id, start: { ref: `${at.id}#p0`, offset: [300, 300] }, heading: 90, width: 900, flights: [{ risers, length: (risers - 1) * 250 }] };
  const r = applyStairs(model, levelId, st, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  const base = model;
  commit(r.model);
  enterEdit('stairs', st.id, { ask: false }); startFresh('stairs', st.id, base, 'stairs');
  setStatus(`${st.id} is new, at corner 0 of ${at.name || at.id}: set where it starts, which way it goes and how many risers, name it and Apply to create it`);
}

/** The stairs panel: where they start, the flights, the landing, the underside; what follows from it. */
function showStairs() {
  const st = stairs();
  if (!st) { stairsId = null; $('stairsPanel').hidden = true; return; }
  const entry = curGeo?.stairs?.find(s => s.id === st.id), L = entry?.layout;
  $('stTitle').innerHTML = titleHtml(st);
  const toName = model.levels.find(l => l.id === st.to)?.name || st.to;
  $('stInfo').innerHTML = entry?.error ? `<span style="color:var(--bad)">${esc(entry.error)}</span>`
    : L ? `up ${entry.rise} mm to ${esc(toName)} in ${totalRisers(st)} risers of ${L.riser} mm; treads ${(() => { const d = L.depths.map(x => Math.round(x)); return d.length > 1 ? `${d.slice(0, -1).join(', ')} and ${d.at(-1)}` : d.join(''); })()} mm deep${st.flights.some(f => f.treads?.length) ? ` (measured: ${Math.round(Math.min(...L.treadDepths))}–${Math.round(Math.max(...L.treadDepths))})` : ''}${entry.opening.length ? '' : '; no opening in the floor above (it stays under the slab)'}` : '';
  if (stairsFormFor !== st) {
    const lv = level(), up = model.levels.filter(l => l.elevation > lv.elevation && (l.building ?? null) === (lv.building ?? null));
    $('stTo').innerHTML = up.map(l => `<option value="${esc(l.id)}">${esc(l.name || l.id)}</option>`).join('');
    $('stRef').innerHTML = '<option value="">a point on the plan (x, y)</option>' + startOptions(snapsAround, nameOpts()).map(o => `<option value="${esc(o.ref)}">${esc(o.label)}</option>`).join('');
    $('stTo').value = st.to;
    $('stRef').value = st.start?.ref ?? '';
    if (st.start?.ref && $('stRef').value !== st.start.ref) { $('stRef').insertAdjacentHTML('beforeend', `<option value="${esc(st.start.ref)}">${esc(st.start.ref)} (missing)</option>`); $('stRef').value = st.start.ref; }
    const off = st.start?.ref ? st.start.offset ?? [0, 0] : st.start?.pos ?? [0, 0];
    $('stOx').value = off[0]; $('stOy').value = off[1];
    $('stHead').value = st.heading; $('stWidth').value = st.width;
    const fl = st.flights;
    $('stShape').value = String(Math.min(Math.max(fl.length, 1), 3));
    [1, 2, 3].forEach(k => { const f = fl[k - 1]; $(`stR${k}`).value = f?.risers ?? ''; $(`stL${k}`).value = f?.length ?? ''; $(`stT${k}`).value = (f?.treads || []).join(', '); });
    $('stTurn').value = st.turn ?? 'L'; $('stLanding').value = st.landing ?? 'square'; $('stWinders').value = st.winders ?? 3;
    $('stUnder').value = st.underside ?? 'closed'; $('stSides').value = st.sides ?? 'stepped'; $('stWaist').value = st.waist ?? '';
    $('stRail').value = st.handrail ?? 'none'; $('stRailH').value = st.handrailHeight ?? '';
    $('stName').value = st.name ?? ''; $('stErr').textContent = ''; stairsFormFor = st;
    fillCopyInto('stairs', st);
  }
  syncStairsRows();
}
function syncStairsRows() {
  const n = Number($('stShape').value), ref = $('stRef').value;
  $('stTwoRows').hidden = $('stT2Row').hidden = $('stTurnRows').hidden = n < 2;
  $('stThreeRows').hidden = $('stT3Row').hidden = n < 3;
  $('stWindersRow').hidden = n < 2 || $('stLanding').value !== 'winders';
  $('stWaistRow').hidden = $('stUnder').value !== 'sloped';
  $('stRailHRow').hidden = $('stRail').value === 'none';
  $('stOxLbl').textContent = ref ? 'x offset' : 'x'; $('stOyLbl').textContent = ref ? 'y offset' : 'y';
}
function applyStairsForm() {
  const st = stairs(), num = id => Number($(id).value.trim() === '' ? NaN : $(id).value), n = Number($('stShape').value), two = n > 1, ref = $('stRef').value;
  const flights = [];
  for (let k = 1; k <= n; k++) {
    const f = { risers: num(`stR${k}`) }, tr = parseNumbers($(`stT${k}`).value);
    if (tr.errors.length) { $('stErr').textContent = `Flight ${k} treads: ${tr.errors.join('; ')}`; return; }
    if (tr.values.length) { f.treads = tr.values; if ($(`stL${k}`).value.trim() !== '') f.length = num(`stL${k}`); }   // the run measured too: a check on the treads
    else f.length = num(`stL${k}`) || 0;
    flights.push(f);
  }
  const next = { ...st, to: $('stTo').value, heading: num('stHead'), width: num('stWidth'), flights, start: ref ? { ref, offset: [num('stOx') || 0, num('stOy') || 0] } : { pos: [num('stOx'), num('stOy')] } };
  delete next.turn; delete next.landing; delete next.winders; delete next.underside; delete next.sides; delete next.waist; delete next.handrail; delete next.handrailHeight;
  if (two) { next.turn = $('stTurn').value; next.landing = $('stLanding').value; if (next.landing === 'winders') next.winders = num('stWinders'); }
  if ($('stUnder').value !== 'closed') next.underside = $('stUnder').value;
  if ($('stSides').value === 'sloped') next.sides = 'sloped';
  if ($('stRail').value !== 'none') { next.handrail = $('stRail').value; if ($('stRailH').value.trim() !== '') next.handrailHeight = num('stRailH'); }
  if ($('stUnder').value === 'sloped' && $('stWaist').value.trim() !== '') next.waist = num('stWaist');
  next.name = $('stName').value.trim() || null;                 // empty: no name (applyStairs drops it)
  if ([next.heading, next.width, ...flights.map(f => f.risers)].some(v => !Number.isFinite(v))) { $('stErr').textContent = 'Direction, width and risers must be numbers.'; return; }
  const r = applyStairs(model, levelId, next, opts());
  if (r.report.errors.length) { $('stErr').textContent = r.report.errors.join('; '); return; }
  $('stErr').textContent = '';
  commit(r.model);
  setStatus(`${st.id} changed (not saved yet)`);
}

/** The fixture panel: height, where it is (on a wall, or x/y), how far a lamp's light reaches. */
function showFixture() {
  const x = fixture();
  if (!x) { fixtureId = null; $('fixturePanel').hidden = true; return; }
  const lv = level(), w = x.attach && lv.walls.find(v => v.id === x.attach.wall), info = w && wallInfo(lv, w.id);
  const form = stripForm(x), onObject = form === 'object' ? lv.objects?.find(o => o.id === x.attach.object) : null, onOpening = form === 'opening' ? lv.openings?.find(o => o.id === x.attach.opening) : null;
  const nm = ids => ids.map(id => lv.rooms?.find(r => r.id === id)?.name || id).join(', ') || 'outside';
  $('xTitle').innerHTML = titleHtml(x);
  $('xInfo').innerHTML = `${x.kind === 'switch' ? 'switch' : x.kind === 'strip' ? 'LED strip' : x.attach ? 'wall lamp' : 'lamp'}${w ? ` on <a href="#" id="xWall" title="${esc(w.id)}">${esc(refName(w.id))}</a>` : ''}${form === 'object' || form === 'opening' ? ` on <a href="#" id="xTargetLink" title="${esc(x.attach.object ?? x.attach.opening)}">${esc(refName(x.attach.object ?? x.attach.opening))}</a>` : ''}` + (x.assumed?.length ? ` · <b class="warn">still default: ${esc(x.assumed.join(', '))}</b>` : '');
  $('xWall')?.addEventListener('click', e => { e.preventDefault(); enterEdit('wall', w.id); });
  $('xTargetLink')?.addEventListener('click', e => { e.preventDefault(); enterEdit(form, x.attach.object ?? x.attach.opening); });
  for (const [id, show] of [['xRadiusRow', x.kind !== 'switch'], ['xOffsetRow', !!w], ['xLenRow', (!!w && x.kind === 'strip') || form === 'object'], ['xStartRow', form === 'object'], ['xInsetRow', form === 'object'], ['xFromRow', !!w], ['xSideRow', !!w], ['xInRow', !!w && x.kind === 'lamp'], ['xXRow', !x.attach], ['xYRow', !x.attach], ['xTargetRow', !!onObject || !!onOpening || form === 'object' || form === 'opening'], ['xEdgeRow', form === 'object'], ['xAtRow', form === 'object' || form === 'opening']]) $(id).hidden = !show;
  $('xSideRow').hidden = !(w || form === 'opening');
  $('xZ').closest('label').hidden = form === 'object' || form === 'opening';                       // its height is the height of what it follows
  if (w) {
    fillFrom('xFrom', w, x.id);
    $('xOffsetNote').textContent = x.kind === 'strip' ? 'mm from that corner to where the strip starts' : 'mm from that corner to its middle';
    $('xSide').options[0].textContent = nm(info.sides.right); $('xSide').options[1].textContent = nm(info.sides.left);
    if (fixtureFormFor !== x) {                                   // the openings of this wall a lamp may stand in
      const here = (lv.openings || []).filter(o => o.wall === w.id);
      $('xIn').innerHTML = `<option value="">nothing (on the wall face)</option>` + here.map(o => `<option value="${esc(o.id)}">${esc(o.name || refName(o.id))} · ${esc(o.type)}, ${Math.round(o.offset)}–${Math.round(o.offset + o.width)} mm</option>`).join('');
      if (x.attach.opening && !here.some(o => o.id === x.attach.opening)) $('xIn').insertAdjacentHTML('beforeend', `<option value="${esc(x.attach.opening)}">${esc(x.attach.opening)} (missing)</option>`);
      $('xIn').value = x.attach.opening || '';
    }
  }
  if (form === 'opening' && onOpening) { const oi = wallInfo(lv, onOpening.wall); if (oi) { $('xSide').options[0].textContent = nm(oi.sides.right); $('xSide').options[1].textContent = nm(oi.sides.left); } }
  $('xZNote').textContent = `mm above the floor (ceiling ${lv.ceilingHeight ?? 2400})`;
  if (fixtureFormFor !== x) {
    $('xName').value = x.name ?? ''; $('xZ').value = x.z ?? ''; $('xRadius').value = x.radius ?? '';
    if (form === 'object' || form === 'opening') {                // what it follows, and which edge of it
      const list = form === 'object' ? lv.objects || [] : lv.openings || [];
      $('xTarget').innerHTML = list.map(o => `<option value="${esc(o.id)}">${esc(o.name || refName(o.id))}</option>`).join('');
      if (!list.some(o => o.id === (x.attach.object ?? x.attach.opening))) $('xTarget').insertAdjacentHTML('beforeend', `<option value="${esc(x.attach.object ?? x.attach.opening)}">${esc(x.attach.object ?? x.attach.opening)} (missing)</option>`);
      $('xTarget').value = x.attach.object ?? x.attach.opening;
      $('xTargetNote').textContent = form === 'object' ? 'the object it runs along (it moves with it)' : 'the window or door it runs along (it moves with it)';
      $('xAt').innerHTML = form === 'object' ? '<option value="bottom">under the object (its bottom)</option><option value="top">on top of the object</option>' : '<option value="sill">the bottom of the opening (sill)</option><option value="head">the top of the opening</option>';
      $('xAt').value = x.attach.at ?? (form === 'object' ? 'bottom' : 'sill');
      $('xAtNote').textContent = form === 'object' ? 'under it, or on top' : 'along its bottom or its top';
      if (form === 'object') {
        const fp = curGeo.objectFootprint(onObject || {}) || [];
        $('xEdge').innerHTML = [0, 1, 2, 3].map(i => `<option value="${i}">side ${wallName(i)}${fp[i] ? ` · ${Math.round(Math.hypot(fp[(i + 1) % fp.length][0] - fp[i][0], fp[(i + 1) % fp.length][1] - fp[i][1]))} mm long` : ''}</option>`).join('');
        $('xEdge').value = String(x.attach.edge ?? 0);
        $('xLen').value = x.attach.length ?? ''; $('xStart').value = x.attach.offset ?? ''; $('xInset').value = x.attach.inset ?? '';
        $('xLenNote').textContent = 'mm, empty = the rest of the side';
      }
      if (form === 'opening') $('xSide').value = x.attach.side;
    }
    if (w) { $('xOffset').value = offsetFrom({ offset: x.attach.offset, width: 0 }, fromOf(x.id, w)); $('xSide').value = x.attach.side; $('xLen').value = x.attach.length ?? ''; $('xLenNote').textContent = 'mm along the wall'; }
    else if (!x.attach) { $('xX').value = x.pos[0]; $('xY').value = x.pos[1]; }
    $('xErr').textContent = ''; fixtureFormFor = x;
    fillCopyInto('fixture', x);
    showBinding(x);
  }
}

// ---- the link to Home Assistant: location.json → bindings (saved at once, a file of its own) ----
let haStates = null;       // the states of the house's connection kept by Plantern's server, once loaded
async function loadHaStates() {
  const name = loc.integrations?.ha?.connection;
  if (haStates || !name || !house?.server) return haStates;
  try { const r = await fetch(`api/ha/${encodeURIComponent(name)}/states`); if (r.ok) haStates = (await r.json()).states; } catch { /* not reachable: type the id */ }
  return haStates;
}
async function showBinding(x) {
  const b = loc.bindings?.[x.id] || {}, lv = level();
  $('xEntity').value = b.entity || ''; $('xBindOut').textContent = '';
  $('xControlsRow').hidden = x.kind !== 'switch';
  $('xLookRow').hidden = x.kind === 'switch';
  const lk = b.look || {};
  $('xLookBri').value = lk.brightness ?? ''; $('xLookK').value = lk.kelvin ?? ''; $('xLookUseColor').checked = !!lk.color; $('xLookColor').value = lk.color || '#ffd6aa';
  $('xControls').onchange = saveBinding;                              // a ticked lamp is linked at once
  const lamps = model.levels.flatMap(l => (l.fixtures || []).filter(f => f.kind !== 'switch').map(f => ({ f, l })));
  $('xControls').innerHTML = lamps.map(({ f, l }) => `<label class="inl"><input type="checkbox" value="${esc(f.id)}"${(b.controls || []).includes(f.id) ? ' checked' : ''}> ${esc(displayName(f))}${l.id !== lv.id ? ` <small>${esc(l.name || l.id)}</small>` : ''}</label>`).join('') || 'No lamps yet.';
  const name = loc.integrations?.ha?.connection;
  $('xEntityNote').textContent = name ? `in ${name}: type a name or id, the best matches come first; picking one links it at once` : 'pick the house\'s Home Assistant on the Storage page to get a list; or type the entity id';
  const states = await loadHaStates();
  if (fixture() !== x) return;
  const room = (lv.rooms || []).find(r => (x.pos && pointInPolygon(x.pos, r.polygon)) || (x.attach && lv.walls.find(w => w.id === x.attach.wall)?.rooms?.includes(r.id)));
  entityChoices = suggestEntities(states || [], { kind: x.kind, names: [x.name, room?.name, room && loc.areas?.[room.id]] });
  showEntityPick();
}
let entityChoices = [];
/** The entity field: what is chosen (friendly name, id, state), and while typing a list to pick from (name + id). */
function showEntityPick(open = false) {
  const v = $('xEntity').value.trim(), st = haStates?.find(s => s.entity_id === v);
  $('xEntityNow').innerHTML = v ? (st ? `<b>${esc(st.attributes?.friendly_name || v)}</b> <small>${esc(v)} · ${esc(st.state)}</small>` : `<small>${esc(v)}${haStates ? ' · not found in Home Assistant' : ''}</small>`) : '<small>not linked</small>';
  if (!open || !entityChoices.length) { $('xEntityPick').hidden = true; return; }
  const q = v.toLowerCase(), shown = entityChoices.filter(e => !q || e.id.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)).slice(0, 40);
  $('xEntityPick').innerHTML = shown.map(e => { const s = haStates?.find(x => x.entity_id === e.id); return `<div class="pick" data-ent="${esc(e.id)}"><b>${esc(e.label)}</b><small>${esc(e.id)}${s ? ` · ${esc(s.state)}` : ''}</small></div>`; }).join('') || '<div class="help">No entity matches.</div>';
  $('xEntityPick').hidden = false;
  $('xEntityNow').innerHTML = '';                                    // while searching, the list is what counts
  $('xEntityPick').querySelectorAll('[data-ent]').forEach(el => (el.onmousedown = ev => { ev.preventDefault(); $('xEntity').value = el.dataset.ent; showEntityPick(false); $('xEntity').blur(); saveBinding(); }));
}
// The fields save themselves on change and the Save link saves too: typing a value and clicking the link fires both,
// so the saves are run one at a time, and one that would change nothing is not sent (decision 118).
const saveBinding = serialRunner(saveBindingNow);
async function saveBindingNow() {
  if (isFresh()) { $('xBindOut').textContent = 'Apply the new lamp first: it is linked to Home Assistant by its id, which Apply settles.'; return; }
  const x = fixture(), entity = $('xEntity').value.trim(), controls = [...$('xControls').querySelectorAll('input:checked')].map(i => i.value);
  if (entity && !/^[a-z_]+\.[a-z0-9_]+$/.test(entity)) { $('xBindOut').textContent = 'An entity id looks like light.kitchen'; return; }
  if (!house?.canSave) { $('xBindOut').textContent = 'This house cannot be saved from here.'; return; }
  const num = id => ($(id).value.trim() === '' ? undefined : Number($(id).value));
  const look = x.kind !== 'switch' ? { brightness: num('xLookBri'), kelvin: $('xLookUseColor').checked ? undefined : num('xLookK'), color: $('xLookUseColor').checked ? $('xLookColor').value : undefined } : undefined;
  const bad = look ? checkLook(Object.fromEntries(Object.entries(look).filter(([, v]) => v !== undefined))) : [];
  if (bad.length) { $('xBindOut').textContent = bad.join('; '); return; }
  const next = setBinding(loc, x.id, { entity, ...(x.kind === 'switch' ? { controls } : {}), ...(look ? { look } : {}) });
  if (sameBinding(loc, next, x.id)) {
    if (!/^(Linked and saved|Link removed)/.test($('xBindOut').textContent)) $('xBindOut').textContent = entity || controls.length || look ? 'Already saved: nothing changed.' : 'Not linked: nothing to save.';
    return;                                                       // (a run that just saved keeps its "Linked and saved")
  }
  $('xBindOut').textContent = 'Saving…';
  try { const r = await house.save(next, 'location'); loc = r.value; showEntityPick(); $('xBindOut').textContent = entity || controls.length ? 'Linked and saved (location.json).' : 'Link removed and saved.'; }
  catch (e) { $('xBindOut').textContent = e.conflict ? 'location.json was changed elsewhere meanwhile: reload the page and try again.' : `Not saved: ${e.message}`; }
}

function applyFixture() {
  const x = fixture(), props = {}, num = id => Number($(id).value.trim());
  const changed = (id, v) => $(id).value.trim() !== String(v ?? '');
  const nm = nameChange(x.name, $('xName').value);
  if (nm !== undefined) props.name = nm;
  for (const [id, k] of [['xZ', 'z'], ['xRadius', 'radius']]) if (!$(id).closest('label').hidden && changed(id, x[k])) props[k] = num(id);
  const form = stripForm(x);
  if (form === 'object') {
    const opt = id => ($(id).value.trim() === '' ? undefined : num(id));
    const start = opt('xStart'), len = opt('xLen'), inset = opt('xInset');
    const next = { object: $('xTarget').value, edge: Number($('xEdge').value), at: $('xAt').value, ...(start ? { offset: start } : {}), ...(len !== undefined ? { length: len } : {}), ...(inset ? { inset } : {}) };
    if (next.object !== x.attach.object || next.edge !== x.attach.edge || next.at !== (x.attach.at ?? 'bottom') || (next.offset ?? 0) !== (x.attach.offset ?? 0) || next.length !== x.attach.length || (next.inset ?? 0) !== (x.attach.inset ?? 0)) props.attach = next;
  } else if (form === 'opening') {
    const next = { opening: $('xTarget').value, side: $('xSide').value, at: $('xAt').value };
    if (next.opening !== x.attach.opening || next.side !== x.attach.side || next.at !== (x.attach.at ?? 'sill')) props.attach = next;
  } else if (x.attach) {
    const w = level().walls.find(v => v.id === x.attach.wall), where = fromOf(x.id, w);
    const shown = offsetFrom({ offset: x.attach.offset, width: 0 }, where), d = num('xOffset');
    const lenChanged = x.kind === 'strip' && changed('xLen', x.attach.length);
    if (changed('xOffset', shown) || $('xSide').value !== x.attach.side || lenChanged) props.attach = { ...x.attach, offset: changed('xOffset', shown) ? offsetTo(d, where) : x.attach.offset, side: $('xSide').value, ...(x.kind === 'strip' ? { length: num('xLen') } : {}) };
    if (!$('xInRow').hidden && $('xIn').value !== (x.attach.opening ?? '')) {                 // stands in an opening, or not any more
      props.attach = { ...(props.attach || x.attach) };
      if ($('xIn').value) props.attach.opening = $('xIn').value; else delete props.attach.opening;
    }
  }
  if (x.pos && (changed('xX', x.pos[0]) || changed('xY', x.pos[1]))) props.pos = [num('xX'), num('xY')];
  if (props.attach && [props.attach.offset, props.attach.length, props.attach.inset].some(v => v !== undefined && !Number.isFinite(v))) { $('xErr').textContent = 'Values must be numbers of mm.'; return; }
  if (Object.entries(props).some(([k, v]) => k !== 'name' && k !== 'attach' && (Array.isArray(v) ? v.some(n => !Number.isFinite(n)) : typeof v === 'object' ? !Number.isFinite(v.offset) : !Number.isFinite(v)))) { $('xErr').textContent = 'Values must be numbers of mm.'; return; }
  if (!Object.keys(props).length) { $('xErr').textContent = 'Nothing changed.'; return; }
  const r = setFixture(model, levelId, fixtureId, props, opts());
  if (r.report.errors.length) { $('xErr').textContent = r.report.errors.join('; '); return; }
  commit(r.model);
  setStatus(`${fixtureId}: ${Object.keys(props).join(', ')} changed (not saved yet)`);
}

function doSplit() {
  const at = Number($('wSplitAt').value);
  if (!Number.isFinite(at) || $('wSplitAt').value.trim() === '') { $('wErr').textContent = 'Type where to split, in mm from the start.'; return; }
  const r = splitWall(model, levelId, wallId, at, opts());
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  $('wSplitAt').value = '';
  $('wallsOut').innerHTML = [`Split into ${r.report.parts.join(' and ')}: set each part's thickness and kind on its own.`, ...describeReconcile(r.report)].map(esc).join('<br>');
  commit(r.model);
  setStatus(`${r.report.parts.join(' + ')} (not saved yet)`);
}

/** Join the other part of a split wall into this one (its own properties are kept). */
function doJoin(otherId) {
  if (!okToDiscard()) return;
  const r = joinWalls(model, levelId, wallId, otherId, opts());
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  const lost = r.report.dropped.length ? `

${otherId}'s own ${r.report.dropped.join(', ')} ${r.report.dropped.length > 1 ? 'are' : 'is'} dropped: the joined wall keeps ${wallId}'s.` : '';
  if (!confirm(`Join ${otherId} into ${wallId}, making one wall again?${lost}`)) return;
  $('wallsOut').innerHTML = [`Joined ${otherId} into ${wallId}.`, ...describeReconcile(r.report)].map(esc).join('<br>');
  wallFormFor = null;
  commit(r.model);
  setStatus(`${otherId} joined into ${wallId} (not saved yet)`);
}

function removeWall() {
  const info = wallInfo(level(), wallId, issuesNow);
  const lines = [`Delete wall ${wallId}?`];
  if (info.openings.length) lines.push(`Its openings go too: ${info.openings.map(o => o.id).join(', ')}.`);
  if (!confirm(lines.join('\n\n'))) return;
  const id = wallId, r = deleteWall(model, levelId, id, opts());
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  wallId = null;
  commit(r.model);
  setStatus(`deleted ${id} (not saved yet)`);
}

function doLinkWalls() {
  const r = linkWalls(model, levelId, opts());
  $('wallsOut').innerHTML = [
    r.report.bound.length ? `Linked to their rooms: ${r.report.bound.map(b => esc(b.id)).join(', ')}.` : 'No walls to link.',
    ...r.report.skipped.map(x => `${esc(x.id)} stays hand-drawn: ${esc(x.reason)}.`),
  ].join('<br>');
  if (r.report.bound.length) commit(r.model);
}

function doFillWalls() {
  const r = fillWalls(model, levelId, opts());
  const lines = describeReconcile(r.report);
  if (r.report.preview.length && !confirm(['This changes the plan:', ...lines, 'Apply?'].join('\n\n'))) return;
  $('wallsOut').innerHTML = lines.length ? lines.map(esc).join('<br>') : 'Every room edge already has a wall.';
  if (r.report.added.length || r.report.moved.length || r.report.merged.length) commit(r.model);
}

// ---- a round pillar (capture mode "circle"): diameter, the room it stands in and two walls, or its middle ----
const isRound = () => shape === 'solid' && $('sShape').value === 'round';
const roundForm = () => ({ diameter: $('rDia').value, room: $('rRoom').value, edgeA: Number($('rWA').value), distA: $('rDA').value, edgeB: Number($('rWB').value), distB: $('rDB').value, x: $('rX').value, y: $('rY').value });
function fillRoundWalls(a, b) {
  const room = (level().rooms || []).find(r => r.id === $('rRoom').value);
  const opts = room ? room.polygon.map((p, i) => { const q = room.polygon[(i + 1) % room.polygon.length]; return `<option value="${i}">${wallName(i)} · ${Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]))} mm</option>`; }).join('') : '';
  $('rWA').innerHTML = opts; $('rWB').innerHTML = opts;
  if (room) { $('rWA').value = String(a ?? 0); $('rWB').value = String(b ?? crossWall(room, Number($('rWA').value))); }
}
function loadRound(capture) {
  const rooms = (level().rooms || []).filter(r => r.polygon?.length >= 3), f = roundToForm(capture);
  $('rRoom').innerHTML = '<option value="">no room: type its middle</option>' + rooms.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)}</option>`).join('');
  if (!capture) f.room = rooms[0]?.id ?? '';
  if (f.room && !rooms.some(r => r.id === f.room)) $('rRoom').insertAdjacentHTML('beforeend', `<option value="${esc(f.room)}">${esc(f.room)} (missing)</option>`);
  $('rRoom').value = f.room;
  fillRoundWalls(capture ? f.edgeA : undefined, capture ? f.edgeB : undefined);
  $('rDia').value = f.diameter; $('rDA').value = f.distA; $('rDB').value = f.distB; $('rX').value = f.x; $('rY').value = f.y;
  syncRound();
}
function syncRound() {
  const round = isRound(), byWalls = !!$('rRoom').value;
  $('roundBox').hidden = !round; $('polyBox').hidden = round; $('fromPoly').hidden = round;
  document.querySelectorAll('#roundBox .rWalls').forEach(el => (el.hidden = !byWalls));
  document.querySelectorAll('#roundBox .rXY').forEach(el => (el.hidden = byWalls));
}

function currentForm() {
  const form = {};
  FIELDS.forEach(f => (form[f] = $(f).value));
  return form;
}

function recompute() {
  if (isRound()) {
    const { capture, errors } = roundCapture(roundForm(), level());
    solved = errors.length ? { ok: false, errors } : solveCapture(capture);
    solved.capture = capture; solved.overlaps = [];
    showResult(); draw();
    $('apply').disabled = !solved.ok || (!roomId && !draft); $('delRoom').hidden = !roomId; $('apply').textContent = 'Apply';
    return;
  }
  const mode = $('mode').value;
  $('turnsRow').hidden = mode === 'traverse';
  $('cornersRow').hidden = mode === 'rectilinear';
  $('closureRow').hidden = mode === 'lengths';
  $('locksRow').hidden = mode === 'lengths';
  const sq = $('closure').querySelector('[value=square]');
  sq.disabled = mode !== 'rectilinear';
  if (sq.disabled && $('closure').value === 'square') $('closure').value = 'line';
  $('diagRow').hidden = false;
  const snapPos = ref => snapsAround.find(s => s.ref === ref)?.pos;
  const { capture, errors } = buildCapture(currentForm(), snapPos);
  const h = Number($('heading').value || 0);
  $('headingTrue').textContent = Number.isFinite(h) ? `= compass bearing ${roundDeg(bearingFromHeading(h, northAngleOf(model)))}°` : '';
  const st = capture.raw.start || [0, 0];
  $('startAt').textContent = errors.length ? '' : capture.raw.origin ? `corner 0 at (${st[0]}, ${st[1]}) = ${capture.raw.origin.ref} + (${capture.raw.origin.offset.join(', ')})` : capture.raw.start ? `corner 0 at (${st[0]}, ${st[1]})` : 'corner 0 at the plan origin (0, 0)';
  // checks between two of its corners marked "in the solve" count as measured diagonals (model/checks.js)
  solved = errors.length ? { ok: false, errors } : solveCapture(capture, shape === 'room' && roomId ? solveExtra(model, { id: roomId, capture }) : {});
  solved.capture = capture;
  // checked against the plan as it will be after Apply (walls that follow rooms make way first)
  solved.overlaps = solved.ok && shape === 'room' ? overlapsAfterApply(model, levelId, { ...(room() || {}), id: roomId || $('rid').value, name: $('name').value, exterior: $('exterior').checked, polygon: solved.polygon, capture: solved.capture }, opts()) : [];
  showResult();
  draw();
  $('apply').disabled = !solved.ok || (!roomId && !draft);
  $('delRoom').hidden = !roomId;
  $('apply').textContent = solved.overlaps?.length ? 'Apply anyway (overlaps)' : shape === 'solid' ? 'Apply' : 'Apply to room';
}

function showResult() {
  const s = solved, tol = resolveSettings(loc, level()).checkTolerance || { ok: 5, warn: 15 };
  if (s.ok && s.capture?.mode === 'circle') { const c = s.capture.raw; $('result').innerHTML = `<div class="help">⌀ ${c.diameter} mm, its middle at (${c.start.join(', ')})</div>`; $('resid').innerHTML = ''; $('lockOffers').innerHTML = ''; return; }
  if (!s.ok) { $('result').innerHTML = s.errors.map(e => `<div class="iss error">${esc(e)}</div>`).join(''); $('resid').innerHTML = ''; $('lockOffers').innerHTML = ''; return; }
  const ov = s.overlaps?.length ? `<div class="iss error"><b>Overlaps ${esc(describeOverlaps(s.overlaps))}.</b> Rooms must not share floor area: check the measurements or the start position ("Place next to another room" helps).</div>` : '';
  const head = [`RMS ${s.rms.toFixed(1)} mm`, `max ${s.maxAbs.toFixed(1)} mm`];
  if (s.closure) head.push(`closure ${s.closure.distance} mm`);
  if (s.redundancy !== undefined) head.push(`${s.redundancy} redundant`);
  $('result').innerHTML = ov + `<div class="help">${head.join(' · ')}</div>` + s.warnings.map(w => `<div class="iss">${esc(w)}</div>`).join('');
  const cls = c => { const a = Math.abs(c.residual), [ok, warn] = c.unit === 'deg' ? [0.2, 0.5] : [tol.ok, tol.warn]; return a <= ok ? 'ok' : a <= warn ? 'warn' : 'bad'; };
  $('resid').innerHTML = `<table class="res"><tr><th></th><th>measured</th><th>solved</th><th>Δ</th></tr>${s.residuals.map((r, i) => {
    const c = residualCells(r, s.capture.raw.derived, s.capture.raw.exact);
    return `<tr${i === s.worst && s.maxAbs > tol.ok ? ' class="worst"' : ''}><td>${esc(c.label)}</td><td>${esc(c.measured)}</td><td>${esc(c.model)}</td><td><b class="${cls(c)}">${esc(c.delta)}</b></td></tr>`;
  }).join('')}</table>`;
  // walls that are almost exactly on an axis: offer to lock them (fills the Locked walls field)
  const offers = lockOffers(s.capture, s.polygon);
  $('lockOffers').innerHTML = offers.map((o, i) => `<button data-i="${i}" style="margin:2px 0">${esc(describeLockOffer(o))}</button>`).join(' ');
  $('lockOffers').querySelectorAll('button').forEach(b => (b.onclick = () => {
    const o = offers[+b.dataset.i];
    $('locks').value = [$('locks').value.trim(), `${wallName(o.edge)} ${o.axis}`].filter(Boolean).join(', ');
    recompute();
  }));
}

function draw() {
  const svg = $('preview'), lv = level(), cur = solved?.ok && (roomId || draft) ? solved.polygon : null;
  const others = (lv.rooms || []).filter(r => shape === 'solid' || r.id !== roomId);
  const solidsShown = (lv.solids || []).filter(s => s.polygon?.length >= 3);   // the selected one too, under the outline being measured
  const pts = [...others.flatMap(r => r.polygon), ...solidsShown.flatMap(s => s.polygon), ...(cur || room()?.polygon || [])].map(toSvg);
  if (!pts.length) { if (peekId) { lastFit = null; drawPeek(); } else svg.innerHTML = ''; return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 1000), pad = span * 0.12;
  lastFit = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  if (peekId) { drawPeek(); return; }                                // another level, read-only, while editing this one
  const vb = view || lastFit;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  // labels and marks sized in screen pixels, so they read the same on a phone, a big screen and zoomed in
  const fs = Math.max(vb.w / (svg.clientWidth || 800), vb.h / (svg.clientHeight || 600)) * 16;
  $('zFit').hidden = !view;
  const poly = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;
  // rooms and walls are clickable; assumed thicknesses hatched, orphans red, the selection highlighted
  let out = `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="${fs * 0.7}" height="${fs * 0.7}" patternTransform="rotate(45)"><rect width="${fs * 0.7}" height="${fs * 0.7}" fill="#6b7482"/><line x1="0" y1="0" x2="0" y2="${fs * 0.7}" stroke="#ffb454" stroke-width="${fs / 6}"/></pattern></defs>`;
  // while placing something (or always, Levels: always): the walls and rooms of the level below (blue) and
  // above (amber), faintly, with their room names; their corners are start points too
  const underNames = [];
  if (showUnderlay()) for (const u of underlay) {
    const c = LEVEL_COLOR[u.relation];
    for (const p of u.rooms) out += poly(p, `fill="none" stroke="${c}" stroke-opacity="0.35" stroke-width="${fs / 10}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"`);
    for (const p of u.walls) out += poly(p, `fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-opacity="0.45" stroke-width="${fs / 14}" pointer-events="none"`);
    for (const r of u.named || []) {
      // above the room names of this level, moved down a little so the two can both be read
      const lay = labelPoint(r.polygon), [cx, cy] = toSvg(lay.pos);
      underNames.push(`<text x="${cx}" y="${cy + fs * 1.3}" fill="${c}" fill-opacity="0.75" font-size="${fs * 0.7}" font-style="italic" text-anchor="middle" dominant-baseline="central" pointer-events="none">${esc(r.name)} · ${esc(u.name)}</text>`);
    }
  }
  const obstacles = labelObstacles(lv, curGeo);         // room names keep clear of lamps, furniture, chimneys and stairs
  const roomNames = [];                                  // drawn after the stairs, so an opening in the floor does not hide them
  for (const r of others) {
    out += `<g data-kind="room" data-id="${esc(r.id)}" style="cursor:pointer">${poly(r.polygon, r.floor === 'none' ? `fill="#1a1d22" stroke="#46505f" stroke-width="${fs / 8}" stroke-dasharray="${fs / 2} ${fs / 3}"` : `fill="${r.exterior ? '#243026' : '#252a33'}" stroke="#46505f" stroke-width="${fs / 8}"`)}</g>`;
    const lay = roomNameLayout(r.polygon, r.name || r.id, { maxSize: fs * 1.2, minSize: fs * 0.6, avoid: obstacles }), [cx, cy] = toSvg(lay.pos);
    roomNames.push(`<text x="${cx}" y="${cy}" fill="#8b93a1" font-size="${lay.size}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${lay.lines.map((l, k) => `<tspan x="${cx}" dy="${k ? '1.25em' : `${-(lay.lines.length - 1) * 0.625}em`}">${esc(l)}</tspan>`).join('')}</text>`);
  }
  // stairs going up from here (clickable; steps above the cut plane dashed) and the openings of those arriving from below
  if (curGeo?.stairs) {
    const sp = stairsPlan(curGeo, resolveSettings(loc, lv).cutPlane);
    for (const h of sp.down) out += poly(h.poly, `fill="#14161a" stroke="#6b7482" stroke-width="${fs / 10}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"`);
    for (const s of sp.up) {
      const sel = s.id === stairsId, edge = sel ? '#ffb454' : '#9aa3b2';
      out += `<g data-kind="stairs" data-id="${esc(s.id)}" style="cursor:pointer"><title>${esc(tip(lv.stairs?.find(x => x.id === s.id) || s))}</title>`;
      for (const st of s.steps) out += poly(st.poly, st.above ? `fill="transparent" stroke="${edge}" stroke-opacity="0.7" stroke-width="${fs / 12}" stroke-dasharray="${fs / 2} ${fs / 3}"` : `fill="#3a404b" stroke="${edge}" stroke-width="${fs / 12}"`);
      if (s.arrow.length > 1) out += `<polyline points="${s.arrow.map(q => toSvg(q).join(',')).join(' ')}" fill="none" stroke="${sel ? '#ffb454' : '#e6ebf3'}" stroke-width="${fs / 8}" pointer-events="none"/>`;
      if (s.head) out += poly(s.head, `fill="${sel ? '#ffb454' : '#e6ebf3'}" pointer-events="none"`);
      out += '</g>';
    }
  }
  out += roomNames.join('');
  // wall bodies as they are built (joins and openings included), so a wall reaching into a room shows
  const orphans = new Set(issuesNow.filter(i => i.severity === 'error' && /orphan/.test(i.msg)).map(i => i.id));
  for (const w of lv.walls || []) {
    const pieces = curGeo?.pieces.get(w.id), sel = w.id === wallId, bad = orphans.has(w.id);
    const fill = w.assumed?.includes('thickness') ? 'url(#hatch)' : w.kind === 'railing' ? '#4a525e' : '#6b7482';
    const cut = wallCut(w, lv, opts().settings?.cutPlane ?? 1200), overhead = cut === 'above';    // a lintel: dashed, see-through
    const low = cut === 'low' && w.kind === 'wall';                     // a half-height wall: seen from above, lighter
    const stroke = sel ? `stroke="#ffb454" stroke-width="${fs / 4}"` : bad ? `stroke="#e5534b" stroke-width="${fs / 4}"` : 'stroke="none"';
    out += `<g data-kind="wall" data-id="${esc(w.id)}" style="cursor:pointer"><title>${esc(tip(w))}</title>`;
    if (pieces?.length) for (const pc of pieces) {
      out += poly(pc, `fill="${fill}"${overhead ? ` fill-opacity="0.3" stroke-dasharray="${fs / 2} ${fs / 3}"` : low ? ' fill-opacity="0.4"' : ''} ${(overhead || low) && !sel && !bad ? `stroke="${fill === 'url(#hatch)' ? '#6b7482' : fill}" stroke-width="${fs / 10}"` : stroke}`);
      for (const lp of wallLookPieces(w, curGeo.frames.get(w.id), [pc], lv.rooms)) {
        const strips = sideStrips(lp.poly, w.thickness);
        for (const side of ['left', 'right']) { const look = resolveSide(lp[side], model.materials); if (look?.color) out += poly(strips[side], `fill="${look.color}" pointer-events="none"`); }
      }
    }
    else {
      const [ax, ay] = toSvg(w.a), [bx, by] = toSvg(w.b);
      out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${sel ? '#ffb454' : bad ? '#e5534b' : '#6b7482'}" stroke-width="${fs / 6}" stroke-dasharray="${fs / 2}"/>`;
      out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="transparent" stroke-width="${fs}"/>`;   // easier to hit
    }
    out += '</g>';
  }
  for (const s of solidsShown) {
    const sel = shape === 'solid' && s.id === roomId;
    const above = (s.base ?? 0) >= (opts().settings?.cutPlane ?? 1200);   // a beam overhead: dashed, see-through
    const look = `fill="${esc(s.color || SOLID_COLOR)}" fill-opacity="${above ? 0.35 : 1}" stroke="${sel ? '#ffb454' : '#999'}" stroke-width="${fs / (sel ? 4 : 10)}"${above ? ` stroke-dasharray="${fs / 2} ${fs / 3}"` : ''}`, circ = solidCircle(s);
    const body = circ ? (([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${circ.diameter / 2}" ${look}/>`)(toSvg(circ.center)) : poly(s.polygon, look);   // a round pillar: the true circle
    out += `<g data-kind="solid" data-id="${esc(s.id)}" style="cursor:pointer"><title>${esc(s.name || s.kind || s.id)} (${esc(s.id)})</title>${body}`;
    if (s.sides) for (const st of solidStretches(s, lv.rooms)) { const look = resolveSide(s.sides[st.room], model.materials); if (look?.color) out += poly(paintStrip(st), `fill="${look.color}" pointer-events="none"`); }
    out += '</g>';
  }
  const curCircle = cur && solved.capture?.mode === 'circle' ? solved.capture.raw : null;
  if (curCircle) {
    // a round pillar as the form puts it: the circle, its middle, and the two distances it was measured with
    const [cx, cy] = toSvg(curCircle.start), attrs = `fill="#ffb45422" stroke="#ffb454" stroke-width="${fs / 5}"`;
    out += roomId ? `<g data-kind="solid" data-id="${esc(roomId)}" data-cur="1" style="cursor:move"><circle cx="${cx}" cy="${cy}" r="${curCircle.diameter / 2}" ${attrs}/></g>` : `<g data-cur="1" style="cursor:move"><circle cx="${cx}" cy="${cy}" r="${curCircle.diameter / 2}" ${attrs}/></g>`;
    out += `<circle cx="${cx}" cy="${cy}" r="${fs / 5}" fill="#ffb454" pointer-events="none"/>`;
    for (const f of curCircle.from || []) {
      const e = roomEdge(lv, f.ref);
      if (!e) continue;
      const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), u = [(e.b[0] - e.a[0]) / L, (e.b[1] - e.a[1]) / L], inward = [u[1], -u[0]], c = curCircle.start;
      const s0 = (c[0] - e.a[0]) * u[0] + (c[1] - e.a[1]) * u[1], foot = [e.a[0] + u[0] * s0, e.a[1] + u[1] * s0], surf = [foot[0] + inward[0] * f.distance, foot[1] + inward[1] * f.distance];
      out += dimensionSvg(foot, surf, { fs, text: `${f.distance}` });
    }
  } else if (cur) {
    // the selected room (or chimney) as solved from its form; clickable like the rest (double-click edits it)
    // dragged inside, it moves as a whole; dragged by a corner, it reshapes (roadmap 8)
    out += roomId ? `<g data-kind="${shape}" data-id="${esc(roomId)}" data-cur="1" style="cursor:move">${poly(cur, `fill="#ffb45422" stroke="#ffb454" stroke-width="${fs / 5}"`)}</g>` : `<g data-cur="1" style="cursor:move">${poly(cur, `fill="#ffb45422" stroke="#ffb454" stroke-width="${fs / 5}"`)}</g>`;
    out += wallLabelsSvg(cur, { fs });                                  // "A · 4000" inside the room, along each wall
    cur.forEach((p, i) => { out += cornerSvg(p, i, { fs, hot: i === 0, active: dragging?.kind === 'corner' && dragging.i === i && dragging.moved }); });
    // arrow on edge 0 shows the walking direction
    const [a, b] = [toSvg(cur[0]), toSvg(cur[1])], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d, ax = a[0] + ux * d * 0.5, ay = a[1] + uy * d * 0.5, k = fs;
    out += `<path d="M${ax - ux * k - uy * k * 0.5},${ay - uy * k + ux * k * 0.5} L${ax + ux * k},${ay + uy * k} L${ax - ux * k + uy * k * 0.5},${ay - uy * k - ux * k * 0.5}" fill="none" stroke="#ffb454" stroke-width="${fs / 5}"/>`;
  }
  // openings: door leaf and swing, window frame, passage faces; clickable, the selected one highlighted
  for (const o of lv.openings || []) {
    const ow = lv.walls?.find(x => x.id === o.wall), f = ow && curGeo?.frames.get(ow.id);
    if (!f) continue;
    const sym = openingSymbol(ow, f, o), sel = o.id === openingId;
    const color = sel ? '#ffb454' : o.type === 'window' ? '#6cb6ff' : o.type === 'door' ? '#e0a060' : '#8b93a1', sw = fs / (sel ? 5 : 8);
    const seg = ([p, q], dash) => { const [a, b] = [toSvg(p), toSvg(q)]; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${fs / 3} ${fs / 4}"` : ''}/>`; };
    const s0 = curGeo.openingLine(o), [h0, h1] = s0.map(toSvg);
    out += `<g data-kind="opening" data-id="${esc(o.id)}" style="cursor:pointer"><title>${esc(tip(o, o.type))}</title>`;
    out += `<line x1="${h0[0]}" y1="${h0[1]}" x2="${h1[0]}" y2="${h1[1]}" stroke="${openingAssumed(o).length ? '#ffb45455' : 'transparent'}" stroke-width="${fs * 1.2}"/>`;   // hit area (tinted while still default)
    out += sym.lines.map(l => seg(l, false)).join('') + sym.dashed.map(l => seg(l, true)).join('');
    for (const a of sym.arcs) out += `<path d="${arcPathSvg(toSvg(a.c), a.r, toSvg(a.from), toSvg(a.to))}" fill="none" stroke="${color}" stroke-width="${sw * 0.7}" stroke-dasharray="${fs / 3} ${fs / 4}"/>`;
    out += '</g>';
  }
  let onTop = '';                                                      // handles drawn last, over lamps and start dots
  // objects: boxes (dashed above the cut plane, like a wall cabinet), clickable and draggable
  for (const o of lv.objects || []) {
    const fp = curGeo?.objectFootprint(o);
    if (!fp) continue;
    const sel = o.id === objectId, above = (o.z ?? 0) >= resolveSettings(loc, lv).cutPlane, col = sel ? '#ffb454' : o.assumed?.length ? '#e5a93a' : (o.color || '#888');
    out += `<g data-kind="object" data-id="${esc(o.id)}" style="cursor:grab"><title>${esc(o.name || o.id)} (${esc(o.id)})</title>${poly(fp, `fill="${col}" fill-opacity="0.25" stroke="${col}" stroke-width="${fs / (sel ? 5 : 9)}"${above ? ` stroke-dasharray="${fs / 2} ${fs / 3}"` : ''}`)}</g>`;
    if (sel && !o.attach && o.pos) {
      // a handle in front of it: drag it round to turn the object about its middle (15° steps snap; Alt: free)
      const a = (o.rotationDeg || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), hw = o.size[0] / 2, hd = o.size[1] / 2;
      const mid = [o.pos[0] + hw * c - hd * sn, o.pos[1] + hw * sn + hd * c], f = [-sn, c], front = [mid[0] + f[0] * hd, mid[1] + f[1] * hd], h = [front[0] + f[0] * fs * 2, front[1] + f[1] * fs * 2];
      const [x1, y1] = toSvg(front), [x2, y2] = toSvg(h);
      onTop += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffb454" stroke-width="${fs / 8}" pointer-events="none"/><circle cx="${x2}" cy="${y2}" r="${fs * 0.4}" fill="#14161a" stroke="#ffb454" stroke-width="${fs / 7}" pointer-events="none"/><circle data-orot="${esc(o.id)}" cx="${x2}" cy="${y2}" r="${fs * 0.8}" fill="transparent" style="cursor:grab"><title>Drag round to turn it (${o.rotationDeg || 0}°; 15° steps snap, Alt: free)</title></circle>`;
    }
  }
  // lamps (circles) and switches (squares), clickable; tinted while a value is still a default
  for (const x of lv.fixtures || []) {
    const P = curGeo?.fixturePos(x);
    if (!P) continue;
    const [cx, cy] = toSvg(P), sel = x.id === fixtureId, c = sel ? '#ffb454' : x.assumed?.length ? '#e5a93a' : '#f5d76e', r = fs * 0.4;
    const line = curGeo.fixtureLine?.(x), lc = line ? line.map(q => toSvg(q).join(',')).join(' ') : '';
    out += `<g data-kind="fixture" data-id="${esc(x.id)}" style="cursor:pointer"><title>${esc(tip(x))}</title>` + (line ? `<polyline points="${lc}" fill="none" stroke="transparent" stroke-width="${fs * 1.6}" stroke-linecap="round"/><polyline points="${lc}" fill="none" stroke="${c}" stroke-width="${fs / 3}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>` : '') + `<circle cx="${cx}" cy="${cy}" r="${fs}" fill="transparent"/>` + (x.kind === 'strip' ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.7}" fill="${c}" stroke="${sel ? '#fff' : '#14161a'}" stroke-width="${fs / 10}"/>` : x.kind === 'switch'
      ? `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${r / 3}" fill="#14161a" stroke="${c}" stroke-width="${fs / (sel ? 5 : 8)}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" stroke="${sel ? '#fff' : '#14161a'}" stroke-width="${fs / 10}"/>`) + '</g>';
  }
  for (const x of lv.fixtures || []) {                            // the ends of the selected LED strip on a wall: handles to drag
    if (x.id !== fixtureId || stripForm(x) !== 'wall') continue;
    const line = curGeo.fixtureLine?.(x);
    if (line) [['a', line[0]], ['b', line[1]]].forEach(([end, q]) => { const [hx, hy] = toSvg(q); out += `<circle data-send="${end}" data-id="${esc(x.id)}" cx="${hx}" cy="${hy}" r="${fs * 0.55}" fill="#fff" fill-opacity=".85" stroke="#ffb454" stroke-width="${fs / 8}" style="cursor:ew-resize"><title>Drag to change where the strip ${end === 'a' ? 'starts' : 'ends'}</title></circle>`; });
  }
  out += underNames.join('');
  out += selectionMarks(lv, fs);
  // the split point being typed for the selected wall
  const sw = wallId && wall(), at = sw && Number($('wSplitAt').value);
  if (sw && at > 0) {
    const L = Math.hypot(sw.b[0] - sw.a[0], sw.b[1] - sw.a[1]), u = [(sw.b[0] - sw.a[0]) / L, (sw.b[1] - sw.a[1]) / L], n = [-u[1], u[0]];
    if (at < L) {
      const P = [sw.a[0] + u[0] * at, sw.a[1] + u[1] * at], k = fs * 1.2, [x1, y1] = toSvg([P[0] + n[0] * k, P[1] + n[1] * k]), [x2, y2] = toSvg([P[0] - n[0] * k, P[1] - n[1] * k]);
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e5534b" stroke-width="${fs / 5}" pointer-events="none"/>`;
    }
  }
  // where corner 0 is placed: every start point as a dot (click to pick), the chosen one ringed and named
  if (editing && (roomId || draft) && !isRound()) {
    const ex = roomId || $('rid').value, chosen = $('originRef').value;
    // each dot sits on a larger invisible disc: a click anywhere on it picks the point (a hollow ring of
    // another level included), never the room under it
    for (const o of startDots(snapsAround, { excludeRoom: ex, ...nameOpts() })) {
      const [x, y] = toSvg(o.pos), on = o.ref === chosen, ring = o.adjacent ? LEVEL_COLOR[o.relation] : null;
      out += `<g data-ref="${esc(o.ref)}" style="cursor:pointer"><title>${esc(o.label)}</title><circle cx="${x}" cy="${y}" r="${fs * DOT_HIT}" fill="transparent"/>`
        + `<circle cx="${x}" cy="${y}" r="${on ? fs * 0.55 : fs * 0.4}" fill="${on ? '#4cc38a' : ring ? '#14161a' : '#8b93a1'}" fill-opacity="${on ? 1 : ring ? 0.6 : 0.55}" stroke="${ring && !on ? ring : '#14161a'}" stroke-width="${ring ? fs / 7 : fs / 12}" pointer-events="none"/></g>`;
    }
    const sel = snapsAround.find(s => s.ref === chosen), c0 = cur?.[0];
    const [sx, sy] = toSvg(sel ? sel.pos : [0, 0]);
    out += `<circle cx="${sx}" cy="${sy}" r="${fs * 0.9}" fill="none" stroke="#4cc38a" stroke-width="${fs / 6}" pointer-events="none"/>`;
    out += `<text x="${sx}" y="${sy - fs * 1.3}" fill="#4cc38a" font-size="${fs * 0.75}" text-anchor="middle" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.3}" pointer-events="none">${esc(sel ? refName(sel.ref) : 'origin (0, 0)')}</text>`;
    if (c0 && Math.hypot(c0[0] - (sel ? sel.pos[0] : 0), c0[1] - (sel ? sel.pos[1] : 0)) > 1) {
      const [cx, cy] = toSvg(c0);
      out += `<line x1="${sx}" y1="${sy}" x2="${cx}" y2="${cy}" stroke="#4cc38a" stroke-width="${fs / 8}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"/>`;
    }
  }
  // "Place next to another room" open: the other rooms' walls with their letters, clickable; the chosen
  // one highlighted with the end "Start" counts from, and this room's wall that goes against it
  if (editing && (roomId || draft) && $('nextTo').open) {
    const [nid, ni] = ($('ntEdge').value || '').split('|');
    for (const r of (lv.rooms || []).filter(r => r.id !== roomId && r.polygon?.length >= 3)) {
      out += wallLabelsSvg(r.polygon, { fs: fs * 1.2, lengths: false, fill: '#aeb6c2' });
      r.polygon.forEach((p, i) => {
        const q = r.polygon[(i + 1) % r.polygon.length], [x1, y1] = toSvg(p), [x2, y2] = toSvg(q), on = r.id === nid && String(i) === ni;
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? '#ffb454' : '#8b93a1'}" stroke-width="${on ? fs / 2.5 : fs / 8}" stroke-linecap="round" pointer-events="none"/>`;
        out += `<line data-ntedge="${esc(r.id)}|${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${fs * 1.6}" style="cursor:pointer"><title>${esc(r.name || r.id)} · wall ${wallName(i)}</title></line>`;
        if (on) { const [qx, qy] = toSvg(q); out += `<rect x="${qx - fs * 0.45}" y="${qy - fs * 0.45}" width="${fs * 0.9}" height="${fs * 0.9}" fill="#4cc38a" stroke="#14161a" stroke-width="${fs / 10}" pointer-events="none"/>`; }
      });
    }
    const k = Number($('ntOwn').value);
    if (cur && Number.isInteger(k) && cur[k]) { const [x1, y1] = toSvg(cur[k]), [x2, y2] = toSvg(cur[(k + 1) % cur.length]); out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4cc38a" stroke-width="${fs / 3}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"/>`; }
  }
  // a hand-drawn wall selected or edited: where the form puts it (dashed while it differs from what is stored), its ends draggable
  const hw = wallId && wall();
  const wEditing = editing?.kind === 'wall' && editing.id === hw?.id;
  if (hw && !hw.from?.length && (wEditing || !editing)) {
    const e = (wEditing && wallEnds()) || { a: hw.a, b: hw.b }, L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (L > 1) {
      const n = [-(e.b[1] - e.a[1]) / L, (e.b[0] - e.a[0]) / L], t = (wEditing && Number($('wThick').value)) || hw.thickness || 0, j = (wEditing && $('wJustify').value) || hw.justify || 'center';
      const [o0, o1] = j === 'left' ? [0, t] : j === 'right' ? [-t, 0] : [-t / 2, t / 2], at = (p, o) => [p[0] + n[0] * o, p[1] + n[1] * o];
      const moved = Math.hypot(e.a[0] - hw.a[0], e.a[1] - hw.a[1]) > 0.5 || Math.hypot(e.b[0] - hw.b[0], e.b[1] - hw.b[1]) > 0.5;
      if (moved) out += `<g data-wbody="1" style="cursor:move">${poly([at(e.a, o0), at(e.b, o0), at(e.b, o1), at(e.a, o1)], `fill="#ffb45433" stroke="#ffb454" stroke-width="${fs / 6}" stroke-dasharray="${fs / 2} ${fs / 3}"`)}</g>`;
      for (const [end, p] of [['a', e.a], ['b', e.b]]) { const [x, y] = toSvg(p); out += `<rect x="${x - fs * 0.35}" y="${y - fs * 0.35}" width="${fs * 0.7}" height="${fs * 0.7}" fill="${end === 'a' ? '#4cc38a' : '#ffb454'}" stroke="#14161a" stroke-width="${fs / 10}" pointer-events="none"/><circle data-wend="${end}" cx="${x}" cy="${y}" r="${fs * 0.75}" fill="transparent" style="cursor:crosshair"><title>Drag the ${end === 'a' ? 'start' : 'end'} (snaps to corners; Shift: straight, Alt: free)</title></circle>`; }
    }
  }
  // the corners of the room being edited can be dragged (on top of the start dots: a click without a drag still picks the dot under it)
  out += onTop;
  if (cur && !$('nextTo').open && !['lengths', 'circle'].includes(solved.capture?.mode) && cur.length > 3) cur.forEach((p, i) => { const [x, y] = toSvg(p); out += `<circle data-corner="${i}" cx="${x}" cy="${y}" r="${fs * 0.75}" fill="transparent" style="cursor:crosshair"><title>Drag corner ${i} to reshape (the walls keep their directions; Shift: along one wall, Alt: no snapping)</title></circle>`; });
  svg.innerHTML = out;
  measure?.draw();
  drawWallOverlay();                                                   // the measurement on top
  setStatus(cur ? `${roomId || 'new room'} · walking direction shown on wall A` : wallId ? `wall ${tip(wall())}` : openingId ? tip(opening(), opening()?.type) : fixtureId ? tip(fixture()) : 'click a room, a wall, an opening or a lamp');
}

function apply() {
  if (!solved?.ok) return;
  if (shape === 'solid') return applySolidForm();
  const base = room() || {};
  const id = roomId || $('rid').value;
  const next = { ...base, id, name: $('name').value.trim() || id, exterior: $('exterior').checked, polygon: solved.polygon, capture: solved.capture };
  delete next.floor; delete next.floorOffset; delete next.ceilingHeight;
  const off = $('rFloorOff').value.trim(), ceil = $('rCeil').value.trim();
  if ($('rFloor').value === 'none') next.floor = 'none';
  if (off !== '') next.floorOffset = Number(off);
  if (ceil !== '') next.ceilingHeight = Number(ceil);
  if ((off !== '' && !Number.isFinite(next.floorOffset)) || (ceil !== '' && !(next.ceilingHeight > 0))) { setStatus('Floor level and ceiling height must be numbers of mm (ceiling more than 0)'); return; }
  const r = applyRoom(model, levelId, next, { settings: resolveSettings(loc, level()) });
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  const lines = describeReconcile(r.report);
  // moves over 5 mm are confirmed first; smaller ones just happen (and are listed under Walls)
  if (r.report.preview.length && !confirm(['Applying this room changes the plan:', ...lines, 'Apply?'].join('\n\n'))) return;
  roomId = id; draft = null;
  $('wallsOut').innerHTML = lines.map(esc).join('<br>');
  commit(r.model);
}

/**
 * The chimney's sides, one row per room it borders: default (its own colour), a colour or a material,
 * like a wall side. Filled from the stored solid; the rows are read back by applySolidForm().
 */
function renderSolidSides() {
  const s = room();
  if (!s) { $('sSides').innerHTML = '<small>Apply it first; then each room around it can have its own colour or material on it.</small>'; return; }
  const rooms = [...new Set(solidStretches(s, level().rooms).map(x => x.room))], stale = Object.keys(s.sides || {}).filter(id => !rooms.includes(id));
  if (!rooms.length && !stale.length) { $('sSides').innerHTML = '<small>It borders no room yet.</small>'; return; }
  const nm = id => level().rooms.find(r => r.id === id)?.name || id;
  fillLookRows($('sSides'), [...rooms.map(id => ({ key: id, label: `Facing ${nm(id)}` })), ...stale.map(id => ({ key: id, label: `Facing ${nm(id)}: no longer bordering it (default removes it)` }))], s.sides);
}
const solidSidesForm = () => readLookRows($('sSides'), room()?.sides);

/**
 * Rows to paint something per room (a chimney's sides, a wall side along several rooms): each row is
 * default / colour / material with the palette, like a wall side. rows = [{ key: roomId, label }].
 */
function fillLookRows(box, rows, looks = {}) {
  const matOpts = Object.entries(model.materials || {}).map(([id, m]) => `<option value="${esc(id)}">${esc(m.name || id)}</option>`).join('');
  box.innerHTML = rows.map(r => `<div class="sideLook" data-room="${esc(r.key)}"><label>${esc(r.label)}
      <select class="sMode"><option value="">default</option><option value="color">colour</option><option value="material"${matOpts ? '' : ' disabled'}>material</option></select></label>
      <input type="color" class="sCol" title="Colour: ${esc(r.label)}"><select class="sMat">${matOpts}</select></div><div class="swatches"></div>`).join('');
  box.querySelectorAll('.sideLook').forEach(row => {
    const look = looks?.[row.dataset.room] || {}, mode = row.querySelector('.sMode'), col = row.querySelector('.sCol'), mat = row.querySelector('.sMat');
    mode.value = look.material ? 'material' : look.color ? 'color' : '';
    col.value = look.color || '#e6e2da'; if (look.material) mat.value = look.material;
    const show = () => {
      col.hidden = mode.value !== 'color'; mat.hidden = mode.value !== 'material';
      fillSwatches(row.nextElementSibling, mode.value === 'material' ? null : col.value, mode.value === 'color', c => { mode.value = 'color'; col.value = c; show(); }, () => col.value, mode.value === 'color');
    };
    mode.onchange = show; col.oninput = show;
    show();
  });
}
/** The looks from fillLookRows() rows over `base` (rooms without a row keep theirs); null when none. */
function readLookRows(box, base) {
  const out = { ...(base || {}) };
  box.querySelectorAll('.sideLook').forEach(row => {
    const m = row.querySelector('.sMode').value, id = row.dataset.room;
    if (m === 'color') out[id] = { color: row.querySelector('.sCol').value };
    else if (m === 'material' && row.querySelector('.sMat').value) out[id] = { material: row.querySelector('.sMat').value };
    else delete out[id];
  });
  return Object.keys(out).length ? out : null;
}

/** A wall side running along several rooms (a facade): one row per room on that side. */
let foldedLooks = new Set();   // per-room looks shown as their face's own look (the face runs along only that room)
function renderWallRoomLooks(w) {
  const along = wallFaceRooms(w, curGeo.frames.get(w.id), level().rooms), nm = id => level().rooms.find(r => r.id === id)?.name || id;
  const rows = [], alongIds = new Set(along.map(x => x.room));
  for (const side of ['left', 'right']) {
    const ids = [...new Set(along.filter(x => x.side === side).map(x => x.room))];
    if (ids.length > 1) for (const id of ids) rows.push({ key: id, label: `${side === 'left' ? 'Left' : 'Right'} side · facing ${nm(id)}` });
  }
  // a look for a room it no longer runs along (and no other wall took over): shown so it can be set back to default
  for (const id of Object.keys(w.roomSides || {})) if (!rows.some(r => r.key === id) && !alongIds.has(id)) rows.push({ key: id, label: `Facing ${nm(id)}: no longer along this wall (default removes it)` });
  $('wRoomLooksBox').hidden = !rows.length;
  fillLookRows($('wRoomLooks'), rows, w.roomSides);
}

/** Apply the measured chimney or pillar (kind, colour, base, height and sides from the form). */
function applySolidForm() {
  const id = roomId || $('rid').value, num = t => { t = String(t).trim(); if (t === '') return null; const v = Number(t); return Number.isFinite(v) ? v : NaN; };
  const base = num($('sBase').value), height = num($('sHeight').value);
  if (Number.isNaN(base) || Number.isNaN(height)) { setStatus('base and height are numbers of mm'); return; }
  const s = { ...(room() || {}), id, name: $('name').value.trim() || null, kind: $('sKind').value, color: $('sColor').value, base: base || null, height, cutsWalls: $('sCuts').checked || null, polygon: solved.polygon, capture: solved.capture, sides: room() ? solidSidesForm() : null };
  const r = applySolid(model, levelId, s, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  const lines = describeReconcile(r.report);
  if (r.report.preview.length && !confirm([`Applying ${id} changes the plan:`, ...lines, 'Apply?'].join('\n\n'))) return;
  shape = 'solid'; roomId = id; draft = null;
  $('wallsOut').innerHTML = lines.map(esc).join('<br>');
  commit(r.model);
  renderSolidSides();
  zoomToIfSmall(s.polygon);
}

function deleteRoom() {
  const r = room();
  if (!r) return;
  if (shape === 'solid') {
    const p = removeSolid(model, levelId, r.id, opts());
    if (p.report.errors.length) { setStatus(p.report.errors.join('; ')); return; }
    const lines = [`Delete ${r.name || r.id} and its measurements? The rooms around it get walls there again (thickness to measure).`];
    if (p.report.dependents.length) lines.push(`Placed at one of its corners (they stay where they are, but that start point will be reported missing): ${p.report.dependents.join(', ')}.`);
    lines.push(...describeReconcile(p.report));
    if (!confirm(lines.join('\n\n'))) return;
    roomId = null; shape = 'room';
    commit(p.model);
    return;
  }
  const preview = removeRoom(model, levelId, r.id, { settings: resolveSettings(loc, level()) });
  if (preview.report.errors.length) { setStatus(preview.report.errors.join('; ')); return; }
  const d = preview.report;
  const lines = [`Delete room "${r.name || r.id}" and its measurements?`];
  if (d.removedWalls.length) lines.push(`Its own walls go too: ${d.removedWalls.join(', ')}.`);
  if (d.removedOpenings.length) lines.push(`Openings in those walls go too: ${d.removedOpenings.join(', ')}.`);
  if (d.heldWalls.length) lines.push(`Kept because something is attached to them: ${d.heldWalls.join(', ')}.`);
  if (d.keptWalls.length) lines.push(`Shared walls stay for the neighbour: ${d.keptWalls.join(', ')}.`);
  if (d.dependents.length) lines.push(`Placed at one of its corners (they stay where they are, but that start point will be reported missing): ${d.dependents.join(', ')}.`);
  lines.push(...describeReconcile(preview.report));
  if (!confirm(lines.join('\n\n'))) return;
  model = history.push(preview.model); dirty = model !== savedModel;
  roomId = null; draft = null; editing = null; editSnap = null;
  loadFormForSelection(); refresh();
  if (!level().rooms?.length) editDraft({ name: '', exterior: false });
  setStatus(`deleted ${r.id} (not saved yet)`);
}

// one save at a time: a double-click (or a click while the last save is still on its way) saves once, then at most once
// more, and a save with nothing changed says so instead of writing the same file again (decision 118)
const save = serialRunner(saveNow);
async function saveNow() {
  if (fresh && editing) { $('saveOut').textContent = `Apply or cancel the new ${fresh.what} first: it is not created yet.`; return; }
  if (!dirty) { if (!/^Saved at/.test($('saveOut').textContent)) $('saveOut').textContent = 'All saved: nothing to save.'; return; }
  const errs = issuesNow.filter(i => i.severity === 'error');
  if (errs.length) { $('saveOut').innerHTML = `<span style="color:var(--bad)">Not saved: ${errs.length} error(s), listed just below. Fix them, or use Download.</span>`; return; }
  $('saveOut').textContent = 'Saving…';
  try {
    let r;
    try { r = await house.save(model); }
    catch (e) {
      if (!e.conflict) throw e;
      // changed elsewhere in the same places: pick per thing, then save over what is stored now
      const a = await askConflict(e.details, { what: loc.name });
      if (a.action === 'theirs') { await reloadHouse('Loaded the version saved elsewhere; your changes are dropped.'); return; }
      if (a.action !== 'save') { $('saveOut').textContent = 'Not saved yet: it was changed elsewhere. Save again to choose.'; return; }
      r = await house.saveOver(a.value, e.details.theirs);
      r.merged = true;
    }
    if (r.merged) model = history.push(r.value);                       // what was changed elsewhere is in it now
    savedModel = model; dirty = false;
    $('elsewhere').hidden = true;
    $('saveOut').textContent = `Saved at ${new Date().toLocaleTimeString()}${r.merged ? ', together with changes made elsewhere' : ''}.`;
    collapseTree();                                                  // a fresh start after saving
    if (!editing) { roomId = null; wallId = null; openingId = null; fixtureId = null; stairsId = null; objectId = null; }
  } catch (e) {
    $('saveOut').innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`;
  }
  refresh();
}

/** Read the house again (what is stored now); the undo history starts over. */
async function reloadHouse(note) {
  await house.load();
  loc = house.location; model = savedModel = house.model; dirty = false;
  history = createHistory(model);
  if (!model.levels.some(l => l.id === levelId)) levelId = model.levels[0]?.id ?? null;
  $('elsewhere').hidden = true;
  fillLevels(); refresh();
  $('saveOut').textContent = note;
}

/**
 * The house was saved by someone else (another page or device, a text editor, a git pull). With nothing
 * unsaved here it is simply read again; otherwise the save bar offers to merge it into the changes here
 * (by entity id: the same thing changed on both sides asks mine or theirs) or to take theirs.
 */
function changedElsewhere(ev) {
  const when = new Date().toLocaleTimeString();
  if (!dirty && !editing) { reloadHouse(`Updated at ${when}: the house was ${ev.source === 'remote' ? 'changed in the repository' : 'saved elsewhere'}.`).catch(e => setStatus(e.message)); return; }
  const box = $('elsewhere');
  box.hidden = false;
  box.innerHTML = `<b>Changed elsewhere</b> at ${when}${ev.source === 'remote' ? ' (in the repository)' : ''}. <button id="elMerge">Merge into my changes</button> <button id="elTheirs">Take theirs</button>`;
  $('elMerge').onclick = async () => {
    if (editing && !leaveEdit({ noBack: true })) return;
    const r = await house.mergeIncoming(model);
    let value = r.merged;
    if (r.conflicts.length) {
      const a = await askConflict({ theirs: r.theirsText, merged: r.merged, conflicts: r.conflicts }, { what: loc.name });
      if (a.action === 'theirs') { await reloadHouse('Loaded the version saved elsewhere; your changes are dropped.'); return; }
      if (a.action !== 'save') return;
      value = a.value;
    }
    box.hidden = true;
    commit(value);
    setStatus('merged with the changes made elsewhere (not saved yet)');
  };
  $('elTheirs').onclick = async () => { if (!confirm('Drop your unsaved changes and load the version saved elsewhere?')) return; if (editing) leaveEdit({ ask: false, noBack: true }); await reloadHouse('Loaded the version saved elsewhere.'); };
}

/**
 * Validation in the save bar, only when there is something to say: a count line, errors listed,
 * warnings folded away. Clicking an issue selects what it is about.
 */
function showIssues() {
  modelGeos = buildModelGeometry(model);
  const issues = issuesNow = validateModel(model, modelGeos);
  const errs = issues.filter(i => i.severity === 'error'), warns = issues.filter(i => i.severity !== 'error');
  $('valBox').hidden = !issues.length;
  if (!issues.length) return;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  $('valSum').innerHTML = [errs.length ? `<span style="color:var(--bad)">${plural(errs.length, 'error')} (blocks Save)</span>` : '', warns.length ? `<span style="color:var(--warn)">${plural(warns.length, 'warning')}</span>` : ''].filter(Boolean).join(' · ');
  const item = i => `<div class="iss ${i.severity}" data-iid="${esc(i.id)}" data-ilevel="${esc(i.level || '')}"><b>${esc(nameOf(i.id))}</b>${nameOf(i.id) !== i.id ? ` <small>${esc(i.id)}</small>` : ''}${i.level && i.level !== levelId ? ` <small>${esc(i.level)}</small>` : ''} ${esc(i.msg)}</div>`;
  $('issues').innerHTML = errs.map(item).join('') + (warns.length ? `<details${errs.length ? '' : ' open'}><summary>${plural(warns.length, 'warning')}</summary>${warns.map(item).join('')}</details>` : '');
  $('issues').querySelectorAll('.iss').forEach(el => (el.onclick = () => {
    const id = el.dataset.iid;
    if (el.dataset.ilevel && el.dataset.ilevel !== levelId && !goToLevel(el.dataset.ilevel)) return;
    const lv = level();
    const kind = lv.rooms?.some(r => r.id === id) ? 'room' : lv.solids?.some(s => s.id === id) ? 'solid' : lv.walls?.some(w => w.id === id) ? 'wall'
      : lv.openings?.some(o => o.id === id) ? 'opening' : lv.fixtures?.some(x => x.id === id) ? 'fixture' : null;
    if (kind) enterEdit(kind, id);
  }));
}

init().catch(e => {
  setStatus(e.message); console.error(e);
  if (e.noHouses) { $('saveOut').innerHTML = `<div class="iss">${e.html}</div>`; return; }   // nothing connected yet: point to the Storage page
  $('valBox').hidden = false; $('issues').innerHTML = `<div class="iss error">${esc(e.message)}</div>`;
});
