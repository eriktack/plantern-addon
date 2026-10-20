// Editor page (room-editor.html): click a room or a wall in the plan and edit it; enter measurements room by room, see the solved shape
// and residuals; undo/redo; save. All logic lives in solve.js, src/edit/ (operations, reconcile, inspect, history), save.js and the modules
// in editor/ (one per concern, ui-consistency plan UX34); this file starts the page.

import { enhanceSegmented } from '../segmented.js';
import { enhanceAll } from '../select.js';
import { enhanceNumbers } from '../number-input.js';
import { listHouses, openHouse, houseOptions } from '../model/house.js';
import { chooseLocation, remember, linkPages, chooseLevel } from '../model/current.js';
import { setDesignLibrary } from '../model/materials.js';
import { askConfirm } from './dialog.js';
import { showLevelForm } from './level-form.js';
import { createHistory } from '../edit/history.js';
import { writePrefs } from '../model/prefs.js';
import { wirePanelResize, wirePanelResizeVertical } from '../panel-resize.js';
import { ICONS } from '../icons.js';
import { createLongPress } from './long-press.js';
import { createRepeater, NUDGE_DIRS } from './nudge-pad.js';
import { newSolidId, unbindWall, deleteMaterial, addOpening, addFixture, deleteObject, addAnchor, removeStairs, deleteFixture, deleteOpening, addCheck } from '../edit/ops.js';
import { newRoomId, captureFromPolygon } from './edit.js';
import { wallProfile } from '../geometry/walls.js';
import { wallInfo } from '../edit/inspect.js';
import { createMenu } from '../menu.js';
import { editorHelpText, pointerIsCoarse } from '../touch.js';
import { assetEntries } from '../model/assets.js';
import { pruneBindings } from '../ha/suggest.js';
import { createEditorMeasure } from './editor-measure.js';
import { fitTo, pinchView } from './map-view.js';
import { download } from '../export/download.js';
import { formatJson } from '../model/format.js';
import { $, FIELDS, NEW_LEVEL, addSlidersAndDials, commit, esc, level, loadDesignLibrary, locOf, object, opening, opts, params, perfAs, room, touches, wall } from './editor/core.js';
import { applyObjectForm, assetCache, placeObject, showPlacedChoice } from './editor/panel-object.js';
import { apply, changedElsewhere, deleteRoom, save } from './editor/room-apply.js';
import { BAR, FRESH_ERR, PANEL_MSG, SELECT, afterLeave, closeEdit, decideLeave, dropFresh, editDraft, enterEdit, isDirty, isDoubleClick, isFresh, leaveEdit, mayLeave, mayRefill, renameEditing, revertEdit, selected, setStatus, settleFresh, showEditBar, startFresh, syncEdMsg, undoRedo } from './editor/session.js';
import { endPeek, fillLevels, goToLevel, showPeekCard, showUnderlayMode } from './editor/levels.js';
import { HS_FIELDS, applyHouse, applyPlace, editLevel, fillHouse, fillPlace, fillPlaceWalls, hideHouseView, newLevel, previewPlace, showHouseView, useWallBearing } from './editor/house.js';
import { draw, moveViewBox } from './editor/plan-draw.js';
import { fillRoundWalls, isRound, loadRound, recompute, scheduleOverlaps, syncRound, wireWallTable } from './editor/panel-room.js';
import { drawWallOverlay, drawingClick, fillWallPos, nearStartDot, pickStart, showWallPos, snapPos, startDrawing, stopDrawing, typedWallEnd, wallPoint } from './editor/walldraw.js';
import { HEIGHT_BOXES, applyOpening, chooseFrom, linkOpeningHeights, showOpeningRows, startFromPick, stopFromPick, switchFrom, syncOriginPick } from './editor/panel-opening.js';
import { ntFillOwn, ntPickEdge, ntPreview, ntUse, refresh, refreshNextTo } from './editor/refresh.js';
import { act, addSwatchPicker, addWallMeasure, assetNote, drawPlacingGhost, finishPlacing, foldHelp, nameColour, placeRoom, refreshWallMeasure, roomSpot, stopPlacing, wallSpot, wireAddMenus } from './editor/add-menus.js';
import { copyInto, duplicateEdited, useShapeOf } from './editor/copy.js';
import { linesAround, loadForm, loadFormForSelection, refName, selectNone, selectWall, zoomAt } from './editor/selection.js';
import { doFillWalls, doLinkWalls, removeWall, splitAtPointer, startSplitPick, stopSplitPick } from './editor/wall-ops.js';
import { applyMaterial, applyWall, makeMaterialFromSide, materialSwatches, showSideRows, showSlopeRows } from './editor/panel-wall.js';
import { applyStairsForm, newStairs, resetWinderPivot, syncStairsRows, updateStairsHints } from './editor/panel-stairs.js';
import { applyFixture, doSplit, showEntityPick, useObjectLight } from './editor/panel-fixture.js';
import { cancelDrag, dragMove, dragStart, endDrag, freePoint } from './editor/drag.js';
import { hoverStatus, nudgeBy, openContextMenu, planKey, showShortcuts } from './editor/keys.js';
import { Ed } from './editor/state.js';

enhanceSegmented();                  // choices of up to four: a row of buttons (UX20); before the menus, which leave these alone
enhanceAll(document, { skip: '#preview, #tree' });     // the plan and the tree are rebuilt all the time and hold no select (PF16)
enhanceNumbers();

async function init() {
  const index = await listHouses();
  const locId = chooseLocation(index, params.get('loc'));
  Ed.house = await openHouse(index, locId);
  setDesignLibrary(await loadDesignLibrary());
  Ed.entry = Ed.house.entry;
  Ed.saveMode = Ed.house.canSave ? Ed.house.saveMode : null;
  remember(locId); linkPages(locId);
  $('loc').innerHTML = houseOptions(index, locId);
  $('loc').onchange = async () => { if (!Ed.dirty || await askConfirm('Discard unsaved changes?', { ok: 'Discard' })) { remember($('loc').value); params.set('loc', $('loc').value); params.delete('level'); location.search = params; } else $('loc').value = locId; };

  Ed.loc = Ed.house.location; Ed.model = Ed.house.model;
  assetCache();                              // the models of this house: the + Asset picker lists them
  Ed.house.watch(changedElsewhere);
  document.title = `Plantern · Editor · ${Ed.loc.name}`;
  Ed.savedModel = Ed.model; Ed.savedLoc = Ed.loc;

  if (!Ed.model.levels.length) {
    // a new house: the first level comes before anything else (it is part of the first undo state)
    setStatus('create the first level to start');
    const r = await new Promise(resolve => showLevelForm($('levelBox'), Ed.model, { onCreate: resolve }));
    Ed.model = r.model; Ed.dirty = true;
  }
  Ed.history = createHistory(Ed.model); locOf.set(Ed.model, Ed.loc);
  Ed.levelId = chooseLevel(Ed.model, locId, params.get('level'));
  remember(locId, Ed.levelId); linkPages(locId, Ed.levelId);
  fillLevels();
  $('level').onchange = () => {
    if ($('level').value === NEW_LEVEL) { $('level').value = Ed.levelId; newLevel(); return; }
    goToLevel($('level').value);
  };
  $('uMode').onclick = () => { Ed.underlayMode = { auto: 'always', always: 'off', off: 'auto' }[Ed.underlayMode]; writePrefs({ editorUnderlay: Ed.underlayMode }); showUnderlayMode(); draw(); };
  showUnderlayMode();

  FIELDS.filter(f => f !== 'originRef').forEach(f => $(f).addEventListener('input', recompute));
  $('originRef').addEventListener('change', () => pickStart($('originRef').value));
  $('originPick').onclick = () => { Ed.startPick = !Ed.startPick; syncOriginPick(); draw(); };
  // the panel can be resized by dragging its left edge; the width is remembered in this browser
  wirePanelResize($('resizer'), $('cap'), 'plantern.editor.aside', draw);
  wirePanelResizeVertical($('vresizer'), $('cap'), 'plantern.editor.aside.h', draw);   // a phone: the bar between the plan and the panel
  // Place the house: position, north angle and ground-floor height; Apply writes them with setSite() (place.js has the logic)
  fillPlace();
  for (const id of ['placePos', 'north', 'placeHeight', 'placeBearing']) {
    $(id).addEventListener('input', () => previewPlace());
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (id === 'placeBearing') useWallBearing(); else applyPlace(); } });
  }
  $('placeApply').onclick = applyPlace;
  $('placeRevert').onclick = fillPlace;
  // the House view: "Place the house" moves into it from the sidebar; its settings are wired here
  $('houseBox').querySelector('.edhead').after($('placeSect'));   // under the House header, above the settings
  $('browse').after($('houseBox'), $('levelBox'));          // the forms sit where the browse list sits, not under the top row
  $('editHouse').onclick = showHouseView;
  $('houseClose').onclick = hideHouseView;
  $('hsApply').onclick = applyHouse;
  $('hsRevert').onclick = fillHouse;
  for (const [id] of HS_FIELDS) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyHouse(); } });
  $('placeWall').addEventListener('focus', fillPlaceWalls);
  $('placeSect').addEventListener('toggle', () => { if ($('placeSect').open) fillPlaceWalls(); });
  $('placeUseWall').onclick = useWallBearing;
  $('name').addEventListener('input', () => { if (Ed.draft) { Ed.draft.name = $('name').value; $('rid').value = Ed.draft.solid ? newSolidId(Ed.model, Ed.draft.name || $('sKind').value) : newRoomId(Ed.model, Ed.draft.name); refreshNextTo(); } recompute(); });
  $('sShape').addEventListener('change', () => { if (isRound()) loadRound(Ed.solved?.capture?.mode === 'circle' ? Ed.solved.capture : null); else syncRound(); recompute(); });
  $('rRoom').addEventListener('change', () => { fillRoundWalls(); syncRound(); recompute(); });
  for (const id of ['rWA', 'rWB']) $(id).addEventListener('change', recompute);
  for (const id of ['rDia', 'rDA', 'rDB', 'rX', 'rY']) $(id).addEventListener('input', recompute);
  $('sKind').addEventListener('change', () => {
    if (Ed.draft?.solid && !Ed.draft.name) $('rid').value = newSolidId(Ed.model, $('sKind').value);
  });
  // the edit bar: Apply / Revert / Close (Cancel with unapplied changes) / Delete
  $('edApply').onclick = async () => {
    const f = isFresh() ? Ed.fresh : null, before = Ed.model;
    // an Apply that builds on the server (a blueprint object's options or size) is asked to finish before the model is looked at
    const apply = $(BAR[Ed.editing.kind][0]);
    if (typeof apply.onclick === 'function') await apply.onclick(new MouseEvent('click')); else apply.click();
    // the first Apply creates a new thing, also when the defaults are fine as they are ("Nothing changed")
    if (f && Ed.fresh === f && (Ed.model !== before || $(FRESH_ERR[f.kind]).textContent === 'Nothing changed.')) settleFresh();
  };
  $('edDelete').onclick = () => $(BAR[Ed.editing.kind][1]).click();
  for (const b of document.querySelectorAll('#nudgePad [data-nudge]')) {         // a touch screen's arrow keys: a tap is one 10 mm step, a hold repeats
    const rep = createRepeater({ fire: () => nudgeBy(NUDGE_DIRS[b.dataset.nudge]) });
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ } rep.start(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, rep.stop);
  }
  for (const el of document.querySelectorAll('#edBar [data-icon]')) el.innerHTML = ICONS[el.dataset.icon];   // the phone shows these buttons as their icon (S1)
  $('edId').onclick = renameEditing;
  $('edRevert').onclick = revertEdit;
  $('edClose').onclick = closeEdit;
  $('edBack').onclick = closeEdit;
  for (const ev of ['input', 'change']) $('edit').addEventListener(ev, () => queueMicrotask(showEditBar));
  $('exterior').addEventListener('change', () => { if (Ed.draft) Ed.draft.exterior = $('exterior').checked; recompute(); });
  act.solid = afterLeave(() => { if (editDraft({ name: '', solid: true })) $('name').focus(); });
  $('copyFrom').onchange = () => { const v = $('copyFrom').value; if (v) useShapeOf(v); };
  for (const [sel, kind] of [['obCopy', 'object'], ['oCopy', 'opening'], ['xCopy', 'fixture'], ['stCopy', 'stairs']]) $(sel).onchange = () => copyInto(kind, $(sel).value);
  $('edDup').onclick = duplicateEdited;
  act.room = afterLeave(() => { if (editDraft({ name: '', exterior: false })) $('name').focus(); });
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
  $('wUnbind').onclick = async () => {
    if (!(await mayRefill())) return;
    const id = Ed.wallId, r = unbindWall(Ed.model, Ed.levelId, id, opts());
    if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
    commit(r.model); setStatus(`${id} is a hand-drawn wall now (not saved yet)`);
  };
  $('wDelete').onclick = removeWall;
  $('wSloped').addEventListener('change', () => {
    // ticking it starts from the wall's current flat heights at both ends
    if ($('wSloped').checked && !$('wTopA').value && !$('wTopB').value) {
      const w = level().walls.find(x => x.id === Ed.wallId), e = w && wallProfile(w, level()).ends;
      if (e) { $('wTopA').value = e.top.a; $('wTopB').value = e.top.b; $('wBottomA').value = e.bottom.a || ''; $('wBottomB').value = e.bottom.b || ''; }
    }
    showSlopeRows();
  });
  for (const S of ['Left', 'Right']) {
    $(`w${S}Mode`).addEventListener('change', showSideRows);
    $(`w${S}Color`).addEventListener('input', showSideRows);
    // a new material from a wall side: its own editor, back to the wall when closed
    $(`w${S}Mat`).addEventListener('change', async () => { if ($(`w${S}Mat`).value === '+new') { if (!(await mayLeave())) { $(`w${S}Mat`).value = ''; return; } $(`w${S}Mat`).value = ''; const back = { kind: 'wall', id: Ed.wallId }; enterEdit('material', '', { forSide: S.toLowerCase(), back }); } });
  }
  $('newMat').onclick = afterLeave(() => enterEdit('material', ''));
  $('mApply').onclick = applyMaterial;
  $('mColor').addEventListener('input', materialSwatches);
  $('mClose').onclick = closeEdit;
  $('mDelete').onclick = () => {
    const r = deleteMaterial(Ed.model, Ed.matId);
    if (r.report.errors.length) { $('mErr').textContent = r.report.errors.join('; '); return; }
    Ed.matId = null; $('matForm').hidden = true; commit(r.model);
  };
  for (const type of ['door', 'window', 'passage']) act[type] = async () => {
    if (!(await mayLeave())) return;
    if (!dropFresh([Ed.wallId])) return;
    const base = Ed.model, r = addOpening(Ed.model, Ed.levelId, Ed.wallId, type, {}, opts());
    if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
    commit(r.model); enterEdit('opening', r.opening.id, { ask: false }); startFresh('opening', r.opening.id, base, type);
    setStatus(`${r.opening.id} is a new ${type} with default sizes: measure it, name it and Apply to create it`);
  };
  $('oApply').onclick = applyOpening;
  const placeFixture = async (spec, what) => {
    if (!(await mayLeave())) return;
    if (!dropFresh([spec.attach?.wall, spec.attach?.opening])) return;
    const base = Ed.model, r = addFixture(Ed.model, Ed.levelId, spec, opts());
    if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
    commit(r.model); enterEdit('fixture', r.fixture.id, { ask: false }); startFresh('fixture', r.fixture.id, base, spec.kind === 'switch' ? 'switch' : spec.kind === 'strip' ? 'LED strip' : 'lamp');
    setStatus(`${r.fixture.id} is new: ${what}. Name it and Apply to create it`);
  };
  act.stairs = newStairs;
  $('editLevel').onclick = editLevel;
  $('sBaseDown').onclick = e => {
    e.preventDefault();
    const ft = level().floorThickness ?? 0;
    if (!ft) { setStatus('This level has no floor build-up to go down through'); return; }
    $('sBase').value = -ft; $('sBase').dispatchEvent(new Event('input', { bubbles: true }));
  };
  act.box = () => {
    const at = placeRoom();
    if (!at) { setStatus('Add a room first'); return; }
    placeObject({ pos: roomSpot(at.polygon) }, Ed.addAt ? 'where you clicked: drag it where it belongs' : 'in the middle of the room: drag it where it belongs');
  };
  act.model = async name => {
    const spot = Ed.addAt, entry = assetCache().load(name);   // a right-click's place, read before waiting
    await entry.ready;                        // its size comes from its meta.json
    const at = placeRoom();
    if (!at) { setStatus('Add a room first'); return; }
    const missing = ['missing', 'broken'].includes(entry.status) ? ` (${entry.status === 'missing' ? 'not found' : 'cannot be shown'}: a red marker until it is)` : '';
    placeObject({ asset: name, size: entry.meta?.size, pos: (() => { Ed.addAt = spot; const p = roomSpot(at.polygon); Ed.addAt = null; return p; })() }, `a model of "${name}"${missing} in the middle of the room: drag it where it belongs`);
  };
  act.wallBox = () => { const w = wall(); placeObject({ attach: { wall: w.id, side: wallInfo(level(), w.id)?.sides?.right?.length ? 'right' : 'left', offset: wallSpot(w, 900) } }, 'on the wall: drag it along, or set its position'); };
  $('obApply').onclick = applyObjectForm;
  $('obPlaced').addEventListener('change', () => { const o = object(); if (!o || !Ed.placeDraft) return; Ed.placeDraft.to = $('obPlaced').value; showPlacedChoice(o); });
  $('obOpening').addEventListener('change', () => { const o = object(); if (!o || !Ed.placeDraft) return; Ed.placeDraft.opening = $('obOpening').value; showPlacedChoice(o); });
  $('obAt').addEventListener('change', () => { const o = object(); if (!o || !Ed.placeDraft) return; Ed.placeDraft.at = $('obAt').value; showPlacedChoice(o); });
  $('obAsset').addEventListener('input', () => { $('obAssetNote').textContent = assetNote($('obAsset').value.trim()); });
  // the model menu beside the field (ND8): searchable by what is typed; the field still takes any name
  const assetHost = document.createElement('div');
  $('obAsset').after(assetHost);
  createMenu(assetHost, { label: 'Pick a model', icon: 'model', entries: () => assetEntries(Ed.assetPickNames, $('obAsset').value), onPick: e => { $('obAsset').value = e.id; $('obAsset').dispatchEvent(new Event('input')); }, align: 'full' });
  // a swatch menu beside each colour input (ND10): the house's palette and colours, the library's, then Other colour…
  // one colour control everywhere (UX21): a colour box and its swatch menu
  for (const S of ['Left', 'Right']) addSwatchPicker($(`w${S}Color`), {
    onColour: () => { if ($(`w${S}Mode`).value !== 'color') { $(`w${S}Mode`).value = 'color'; $(`w${S}Mode`).dispatchEvent(new Event('change', { bubbles: true })); } },
    extra: () => ($(`w${S}Mode`).value === 'color' ? [
      { id: 'name', label: 'Name this colour…', icon: 'edit', hint: 'So it is easy to find again' },
      { id: 'mat', label: 'Make a material of it…', icon: 'colour', hint: 'Sides with the material all change together' },
    ].map(x => ({ ...x, onPick: x.id === 'name' ? () => nameColour($(`w${S}Color`).value) : () => makeMaterialFromSide(S.toLowerCase()) })) : []),
  });
  for (const id of ['sColor', 'obColor', 'mColor']) addSwatchPicker($(id), { extra: () => [{ id: 'name', label: 'Name this colour…', icon: 'edit', onPick: () => nameColour($(id).value) }] });
  // colours behind a "use a colour" box: picking a swatch ticks it
  for (const [id, box] of [['oColor', 'oColorUse'], ['oSillColor', 'oSillColorUse'], ['xLookColor', 'xLookUseColor'], ['obLookColor', 'obLookUseColor']]) {
    addSwatchPicker($(id), { onColour: () => { if (!$(box).checked) { $(box).checked = true; $(box).dispatchEvent(new Event('change', { bubbles: true })); } } });
  }
  $('obDelete').onclick = async () => {
    if (!(await askConfirm(`Delete ${Ed.objectId}?`, { ok: 'Delete' }))) return;
    const r = deleteObject(Ed.model, Ed.levelId, Ed.objectId, opts());
    if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
    Ed.objectId = null; Ed.loc = pruneBindings(Ed.loc, r.model); commit(r.model);
  };
  $('xEntity').addEventListener('input', () => showEntityPick(true));
  $('xEntity').addEventListener('focus', () => showEntityPick(true));
  $('xEntity').addEventListener('blur', () => showEntityPick(false));
  $('oEntity').addEventListener('input', () => showEntityPick(true, 'o'));
  $('oEntity').addEventListener('focus', () => showEntityPick(true, 'o'));
  $('oEntity').addEventListener('blur', () => showEntityPick(false, 'o'));
  $('olEntity').addEventListener('input', () => showEntityPick(true, 'ol'));
  $('olEntity').addEventListener('focus', () => showEntityPick(true, 'ol'));
  $('olEntity').addEventListener('blur', () => showEntityPick(false, 'ol'));
  $('obEntity').addEventListener('input', () => showEntityPick(true, 'ob'));
  $('obEntity').addEventListener('focus', () => showEntityPick(true, 'ob'));
  $('obEntity').addEventListener('blur', () => showEntityPick(false, 'ob'));
  $('xUseLight').onclick = useObjectLight;
  $('preview').addEventListener('pointerdown', dragStart);
  addEventListener('pointermove', dragMove);
  addEventListener('pointerup', () => { const was = Ed.dragging; if (was?.moved) Ed.suppressClick = true; Ed.dragging = null; if (was?.moved && ['room', 'corner', 'wall', 'wallend'].includes(was.kind)) { draw(); if (was.kind === 'room' || was.kind === 'corner') scheduleOverlaps(0); if (was.msg) setStatus(was.msg); if ((was.kind === 'wall' || was.kind === 'wallend') && was.clean && !isFresh()) { cancelAnimationFrame(was.frame); applyWall(); } } else if (was) { cancelAnimationFrame(was.frame); endDrag(was); } });   // a hand-drawn wall is stored on release (Q1); with unapplied changes before, the form waits for Apply
  $('anAdd').onclick = () => {
    const r = addAnchor(Ed.model, { refs: [$('anA').value, $('anB').value] });
    if (r.report.errors.length) { $('anErr').textContent = r.report.errors.join('; '); return; }
    $('anErr').textContent = '';
    commit(r.model);
    setStatus(`${r.anchor.id} added (not saved yet)`);
  };
  $('stApply').onclick = applyStairsForm;
  $('stDelete').onclick = async () => {
    if (!(await askConfirm(`Delete ${Ed.stairsId}? The opening it makes in the floor above goes with it.`, { ok: 'Delete' }))) return;
    const r = removeStairs(Ed.model, Ed.levelId, Ed.stairsId, opts());
    if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
    Ed.stairsId = null; commit(r.model);
  };
  for (const id of ['stShape', 'stLanding', 'stRef', 'stUnder', 'stRail', 'stRailMount', 'stOpenOn']) $(id).onchange = syncStairsRows;
  $('stairsPanel').addEventListener('input', updateStairsHints);
  $('stPivReset').onclick = resetWinderPivot;
  $('obAddStrip').onclick = () => {                               // under the front of the object (the side farthest from its wall)
    const o = object(), fp = o && Ed.curGeo.objectFootprint(o);
    if (!fp) return;
    const a = o.attach && Ed.curGeo.resolveAttach(o.attach);
    const mid = i => [(fp[i][0] + fp[(i + 1) % fp.length][0]) / 2, (fp[i][1] + fp[(i + 1) % fp.length][1]) / 2];
    let edge = 0;
    if (a) { let far = -Infinity; fp.forEach((_, i) => { const d = (mid(i)[0] - a.p[0]) * a.dir[0] + (mid(i)[1] - a.p[1]) * a.dir[1]; if (d > far) { far = d; edge = i; } }); }
    placeFixture({ kind: 'strip', attach: { object: o.id, edge, at: 'bottom' } }, `under the ${a ? 'front' : 'first side'} of the object; choose the side and whether it is under or on top`);
  };
  act.openingStrip = () => {                                // along the window (its sill) or door (its top), on the room side
    const o = opening(), w = o && level().walls.find(v => v.id === o.wall);
    if (!w) return;
    placeFixture({ kind: 'strip', attach: { opening: o.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', at: o.type === 'window' ? 'sill' : 'head' } }, `along the ${o.type === 'window' ? 'sill' : 'top'} of the ${o.type}; choose which edge and which side of the wall`);
  };
  act.strip = () => {
    const w = wall(), L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), length = Math.min(1200, Math.round(L / 2));
    placeFixture({ kind: 'strip', attach: { wall: w.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', offset: wallSpot(w, length), length } }, 'along the middle of the wall; set where it starts and how long it is');
  };
  act.ceilingLamp = () => placeFixture({ kind: 'lamp', pos: roomSpot(room().polygon) }, `${Ed.addAt ? 'where you clicked' : 'in the middle of the room'}; set its position and height`);
  act.switch = () => { const w = wall(); placeFixture({ kind: 'switch', attach: { wall: w.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', offset: wallSpot(w) } }, Ed.addAt ? 'where you clicked' : 'in the middle of the wall'); };
  act.wallLamp = () => { const w = wall(); placeFixture({ kind: 'lamp', attach: { wall: w.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', offset: wallSpot(w) } }, Ed.addAt ? 'where you clicked' : 'in the middle of the wall'); };
  $('xApply').onclick = applyFixture;
  act.openingLamp = () => {                                 // a lamp that stands in this opening (window star, lamp on the sill)
    const o = opening(), w = o && level().walls.find(v => v.id === o.wall);
    if (!w) return;
    placeFixture({ kind: 'lamp', attach: { wall: w.id, side: wallInfo(level(), w.id).sides.right.length ? 'right' : 'left', offset: Math.round(o.offset + o.width / 2), opening: o.id }, z: Math.round((o.sill + o.head) / 2), assumed: ['z'] }, 'in the middle of the opening; set its position and height');
  };
  $('xDelete').onclick = async () => {
    if (!(await askConfirm(`Delete ${Ed.fixtureId}? (A Home Assistant binding for it in location.json would then point at nothing.)`, { ok: 'Delete' }))) return;
    const r = deleteFixture(Ed.model, Ed.levelId, Ed.fixtureId, opts());
    if (r.report.errors.length) { $('xErr').textContent = r.report.errors.join('; '); return; }
    Ed.fixtureId = null; Ed.loc = pruneBindings(Ed.loc, r.model); commit(r.model);
  };
  $('oDelete').onclick = async () => {
    if (!(await askConfirm(`Delete ${Ed.openingId}?`, { ok: 'Delete' }))) return;
    const w = opening()?.wall, r = deleteOpening(Ed.model, Ed.levelId, Ed.openingId, opts());
    if (r.report.errors.length) { $('oErr').textContent = r.report.errors.join('; '); return; }
    Ed.loc = pruneBindings(Ed.loc, r.model); commit(r.model); selectWall(w);
  };
  $('oBack').onclick = afterLeave(() => enterEdit('wall', opening()?.wall));
  for (const id of ['oType', 'oOpens', 'oDoorOpens']) $(id).addEventListener('change', showOpeningRows);
  for (const [id, k] of HEIGHT_BOXES) $(id).addEventListener('input', () => linkOpeningHeights(k));
  $('wSplit').onclick = async () => { if (await mayRefill()) doSplit(); };
  $('wSplitAt').addEventListener('input', draw);
  $('wSplitPick').onclick = async () => { if (await mayRefill()) startSplitPick(); };
  for (const id of ['oOffset', 'oWidth', 'xOffset']) $(id).addEventListener('input', draw);
  for (const id of ['stRef', 'wAnchA', 'wAnchB', 'anA', 'anB']) $(id).addEventListener('change', draw);
  $('oFrom').addEventListener('change', () => switchFrom('opening'));
  $('oFromPick').onclick = () => startFromPick('oFrom');
  $('xFromPick').onclick = () => startFromPick('xFrom');
  $('xFrom').addEventListener('change', () => switchFrom('fixture'));    // the chosen point is ringed on the plan
  $('anchorCount').closest('details').addEventListener('toggle', draw);   // the distance on the plan follows the typing
  wireAddMenus();
  foldHelp();
  for (const id of Object.values(PANEL_MSG)) new MutationObserver(syncEdMsg).observe($(id), { childList: true, characterData: true, subtree: true });
  addSlidersAndDials();
  addWallMeasure('x'); addWallMeasure('ob');
  wireWallTable();
  for (const id of ['obW', 'obD', 'obRot']) $(id).addEventListener('input', () => refreshWallMeasure('ob'));
  $('undo').onclick = () => undoRedo('undo');
  $('redo').onclick = () => undoRedo('redo');
  Ed.measure = createEditorMeasure({
    svg: $('preview'), dom: { btn: $('mOn'), modes: $('mModes'), read: $('mRead') },
    snaps: () => Ed.snapsAround, lines: linesAround, name: refName,
    onChange: on => { if (on) { Ed.lastClick = null; endPeek(); selectNone(); } },
    onPin: (a, b, measured) => {
      const r = addCheck(Ed.model, { a, b, measured, note: 'measured in the Editor' }, opts());
      if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
      commit(r.model);
      setStatus(`${r.check.id} kept: ${refName(a)} ↔ ${refName(b)}, ${measured} mm (not saved yet)`);
    },
  });
  $('preview').addEventListener('pointerover', hoverStatus);
  $('preview').addEventListener('contextmenu', openContextMenu);
  // a press that stays put opens the same menu on a touch screen (mobile UX plan S3): Android sends contextmenu itself, iOS does not
  const longPress = createLongPress({
    onLong: (x, y) => {
      Ed.dragging = null; Ed.pan = null; Ed.pinch = null; Ed.suppressClick = true;     // the press is no drag, and its lift is no click
      Ed.lastMenuAt = performance.now();
      openContextMenu({ type: 'longpress', preventDefault() {}, target: document.elementFromPoint(x, y) ?? $('preview'), clientX: x, clientY: y, altKey: true });
    },
  });
  $('preview').addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && e.isPrimary) longPress.down(e.clientX, e.clientY); else longPress.cancel(); });
  addEventListener('pointermove', e => { if (e.pointerType === 'touch') longPress.move(e.clientX, e.clientY); });
  addEventListener('pointerup', () => longPress.cancel());
  addEventListener('pointercancel', () => longPress.cancel());
  $('keysHelp').onclick = e => { e.preventDefault(); showShortcuts(); };
  // a touch screen gets the tap wording and no keys link (mobile UX plan H6); the help line keeps its link after the text
  const coarse = pointerIsCoarse();
  $('edHelp').firstChild.textContent = editorHelpText(coarse) + ' ';
  if (coarse) $('keysHelp').hidden = true;
  $('preview').addEventListener('pointerleave', () => { $('status').textContent = Ed.baseStatus; });
  $('preview').addEventListener('mousemove', e => { if (Ed.splitPick) { const at = splitAtPointer(e); if (at !== null && String(at) !== $('wSplitAt').value) { $('wSplitAt').value = at; draw(); setStatus(`Split ${at} mm from the wall's start · click to split, Esc: cancel`); } return; } if (Ed.placing) { drawPlacingGhost(e); return; } if (Ed.drawing) { Ed.drawing.hover = wallPoint(e); Ed.drawing.shift = e.shiftKey; drawWallOverlay(); } else Ed.measure.hover(e); });
  act.wall = startDrawing;
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
  $('zFit').onclick = () => { Ed.view = null; Ed.autoZoomed = false; draw(); };
  $('preview').addEventListener('pointerdown', e => {
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && Ed.lastFit) {
      // two fingers: pinch to zoom (whatever the first finger had started is dropped)
      const svg = $('preview'), r = svg.getBoundingClientRect(), [a, b] = [...touches.values()].map(p => [p[0] - r.left, p[1] - r.top]);
      Ed.pinch = { vb: fitTo(Ed.view || Ed.lastFit, svg.clientWidth, svg.clientHeight), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
      Ed.pan = null; Ed.dragging = null;
      return;
    }
    if (Ed.dragging) return;                                          // this pointer moves a lamp or an object, not the plan
    if (e.button === 0 || e.button === 1) Ed.pan = { x: e.clientX, y: e.clientY, vb: { ...(Ed.view || Ed.lastFit) }, moved: false };
  });
  addEventListener('pointermove', e => {
    if (Ed.pinch && touches.has(e.pointerId)) {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size < 2) return;
      const svg = $('preview'), r = svg.getBoundingClientRect(), [a, b] = [...touches.values()].map(p => [p[0] - r.left, p[1] - r.top]);
      Ed.view = pinchView(Ed.pinch.vb, [svg.clientWidth, svg.clientHeight], Ed.pinch.m, Ed.pinch.d, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.hypot(a[0] - b[0], a[1] - b[1]), { min: 300, max: Ed.lastFit.w * 4 });
      Ed.autoZoomed = false; Ed.suppressClick = true;
      cancelAnimationFrame(Ed.panFrame); Ed.panFrame = requestAnimationFrame(draw);
      return;
    }
    if (!Ed.pan) return;
    const dx = e.clientX - Ed.pan.x, dy = e.clientY - Ed.pan.y;
    if (!Ed.pan.moved && Math.hypot(dx, dy) < 5) return;               // a click, not a drag (yet)
    Ed.pan.moved = true; $('preview').classList.add('panning');
    const k = 1 / Math.abs($('preview').getScreenCTM()?.a || 1);
    Ed.view = { ...Ed.pan.vb, x: Ed.pan.vb.x - dx * k, y: Ed.pan.vb.y - dy * k }; Ed.autoZoomed = false;
    // PF5: a pan moves the view box only (the content depends on the size of the view, not on where it is); one draw on release
    cancelAnimationFrame(Ed.panFrame); Ed.panFrame = requestAnimationFrame(moveViewBox);
  });
  const lift = e => {
    touches.delete(e.pointerId);
    if (touches.size < 2) Ed.pinch = null;
    if (Ed.pan?.moved) Ed.suppressClick = true;
    const panned = !!Ed.pan?.moved;
    Ed.pan = null; $('preview').classList.remove('panning');
    if (panned) draw();
    // a finger lifted after a pinch or a drag brings no click: do not swallow the next real one
    if (!touches.size && Ed.suppressClick) setTimeout(() => { Ed.suppressClick = false; }, 350);
  };
  addEventListener('pointerup', lift);
  addEventListener('pointercancel', lift);
  $('preview').addEventListener('click', async e => {
    if (Ed.suppressClick) { Ed.suppressClick = false; return; }        // the end of a drag that moved the plan
    if (Ed.splitPick) { const at = splitAtPointer(e); stopSplitPick(); if (at !== null) { $('wSplitAt').value = at; doSplit(); } return; }   // UX16
    if (Ed.placing) { const w = Ed.placing.wall && level().walls.find(x => x.id === Ed.placing.wall); let p = freePoint(e); if (w) { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], s0 = (p[0] - w.a[0]) * u[0] + (p[1] - w.a[1]) * u[1]; p = [w.a[0] + u[0] * s0, w.a[1] + u[1] * s0]; } finishPlacing(p); return; }   // UX10
    if (Ed.peekId) {                                                // looking at another level: read, never select or leave
      const pk = e.target.closest('[data-pk]');
      if (pk) { const [k, id] = pk.dataset.pk.split('|'); showPeekCard(k, id); } else { Ed.peekSel = null; $('peekCard').hidden = true; draw(); }
      return;
    }
    if (Ed.fromPick) { const fk = e.target.closest('[data-fromkey]'); if (fk) chooseFrom(fk.dataset.fromkey); else stopFromPick(); return; }   // a corner measured from
    if (Ed.drawing) { drawingClick(e); return; }                    // + Wall: the start, then the end
    const ntHit = e.target.closest('[data-ntedge]');              // "Place next to another room": a neighbour's wall
    if (ntHit) { ntPickEdge(ntHit.dataset.ntedge); return; }
    if (Ed.measure.click(e)) return;                                // measuring: clicks pick points and planes
    const pt = e.target.closest('[data-ref]') || nearStartDot(e);    // a start point for corner 0 (while editing a room)
    if (pt) { pickStart(pt.dataset.ref); return; }
    const el = e.target.closest('[data-kind]'), kind = el?.dataset.kind, id = el?.dataset.id;
    if (Ed.editing) {
      if (el && Ed.editing.kind === kind && Ed.editing.id === id) return;          // inside what is being edited
      if (!(await decideLeave())) return;                                   // anywhere else: leave it (asked when changed)
      leaveEdit({ ask: false });
    }
    if (!el) { Ed.lastClick = null; selectNone(); return; }          // empty space: let go of the selection
    if (isDoubleClick(kind, id)) { enterEdit(kind, id); return; }           // double-click: edit it
    perfAs('select');
    SELECT[kind]?.(id);
  });
  // leaving the page by a link (the tabs, Storage): the same question as leaving an edit (fixes list 32)
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a || !Ed.editing || a.getAttribute('href').startsWith('#') || (!isDirty() && !isFresh())) return;
    e.preventDefault();                                          // held until the question is answered; then the link is followed
    decideLeave().then(ok => { if (ok) { leaveEdit({ ask: false }); location.href = a.href; } });
  });
  addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('keydown', e => {
    const inField = e.target?.closest?.('input, textarea, select');
    if (e.key === 'Escape') {
      if (Ed.dragging?.patch && cancelDrag()) return;
      if (Ed.placing) { stopPlacing('Placing cancelled'); return; }
      if (Ed.splitPick) { $('wSplitAt').value = ''; stopSplitPick('Split cancelled'); draw(); return; }
      if (Ed.drawing) { stopDrawing(); return; }
      if (Ed.fromPick) { stopFromPick(); return; }                           // picking a corner: Esc stops that first
      if (Ed.startPick) { Ed.startPick = false; syncOriginPick(); draw(); return; }   // picking a start point: Esc stops it
      if (Ed.peekId) { e.preventDefault(); endPeek(); return; }              // back to the level being edited
      if (Ed.measure.isOn() && !inField) { Ed.measure.escape(); return; }         // measuring (also while editing): stop that first
      if (Ed.editing) { e.preventDefault(); e.target?.blur?.(); closeEdit(); return; }
      if (!inField) { selectNone(); return; }
    }
    if (Ed.drawing?.a && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {          // typing a length while drawing a wall (UX12)
      if (/^[0-9.,cm ]$/i.test(e.key) && (e.key !== ' ' || Ed.drawing.typed)) { e.preventDefault(); Ed.drawing.typed = (Ed.drawing.typed || '') + e.key; drawWallOverlay(); return; }
      if (e.key === 'Backspace' && Ed.drawing.typed) { e.preventDefault(); Ed.drawing.typed = Ed.drawing.typed.slice(0, -1); drawWallOverlay(); return; }
      if (e.key === 'Enter' && Ed.drawing.typed) { e.preventDefault(); if (!typedWallEnd()) setStatus(`"${Ed.drawing.typed}" is not a length (mm, or with cm or m)`); return; }
    }
    if ((e.key === 'm' || e.key === 'M') && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) { Ed.measure.toggle(); return; }
    if (e.key === 'Enter' && !Ed.editing && !inField && !e.target?.closest?.('button')) {
      const sel = selected();
      if (sel) { e.preventDefault(); enterEdit(sel.kind, sel.id); return; }
    }
    if (Ed.placing && e.key === 'Enter' && !inField) { e.preventDefault(); finishPlacing(null); return; }
    if (!inField && planKey(e)) return;                                   // Delete, arrows, F, ?, Ctrl+D, Ctrl+S (UX8)
    if (!(e.ctrlKey || e.metaKey) || e.target.closest('input, textarea, select')) return;   // fields keep their own undo
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoRedo('undo'); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); undoRedo('redo'); }
  });
  $('save').onclick = save;
  $('dl').onclick = () => download(new Blob([formatJson(Ed.model)], { type: 'application/json' }), 'model.json');
  $('save').disabled = !Ed.saveMode;
  if (!Ed.saveMode) $('saveOut').textContent = Ed.house.readOnly ? `${Ed.house.where} is read-only: use Download, or copy the house to your own storage on the Settings page.` : 'This page cannot save. Start Plantern with run.cmd (or use Chrome/Edge on the PC); until then use Download and replace the file by hand.';
  $('save').title = Ed.saveMode === 'server' ? `Save into ${Ed.house.where}` : Ed.saveMode ? 'Save into the repo folder you pick (first time only)' : 'This page cannot save: use Download';
  addEventListener('beforeunload', e => { if (Ed.dirty || isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  Ed.roomId = null;                                                  // start with nothing selected: the plan and the tree
  loadFormForSelection();
  refresh();
  if (!level().rooms?.length) editDraft({ name: '', exterior: false });   // an empty level: the new-room form (nothing unapplied: the level was just changed)
}
/** The lists of the opening panel: a click selects the thing, Remove deletes it (after a question). */
$('oHosted')?.addEventListener('click', async e => {
  const rm = e.target.closest('[data-remove]'), pick = e.target.closest('[data-kind]');
  if (rm) {
    const id = rm.dataset.id;
    if (!(await askConfirm(`Remove ${id}?`, { ok: 'Remove' }))) return;
    const r = rm.dataset.remove === 'object' ? deleteObject(Ed.model, Ed.levelId, id, opts()) : deleteFixture(Ed.model, Ed.levelId, id, opts());
    if (r.report.errors.length) { $('oErr').textContent = r.report.errors.join('; '); return; }
    if (rm.dataset.remove === 'object') Ed.loc = pruneBindings(Ed.loc, r.model);
    commit(r.model);
  } else if (pick) afterLeave(() => enterEdit(pick.dataset.kind, pick.dataset.id))();
});

init().catch(e => {
  setStatus(e.message); console.error(e);
  if (e.noHouses) { $('saveOut').innerHTML = `<div class="iss">${e.html}</div>`; return; }   // nothing connected yet: point to the Settings page
  $('valBox').hidden = false; $('issues').innerHTML = `<div class="iss error">${esc(e.message)}</div>`;
});
