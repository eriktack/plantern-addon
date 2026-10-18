// Editor page: session. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { renameFromName } from '../../edit/ops.js';
import { entityName, idFromName, renameId, renameBinding } from '../../edit/rename.js';
import { openDialog, askConfirm } from '../dialog.js';
import { loadFormForSelection, refName, selectFixture, selectNone, selectObject, selectOpening, selectRoom, selectSolid, selectStairs, selectWall, zoomToIfSmall } from './selection.js';
import { $, commit, fixture, isModelDirty, level, locOf, object, opening, opts, perfAs, room, stairs, wall } from './core.js';
import { openMaterial } from './panel-wall.js';
import { refresh } from './refresh.js';
import { fillLevels } from './levels.js';
import { fillPlace } from './house.js';
import { Ed } from './state.js';


// ---- edit mode ----
const PANEL = { room: 'editor', solid: 'editor', wall: 'wallPanel', opening: 'openingPanel', fixture: 'fixturePanel', stairs: 'stairsPanel', object: 'objectPanel', material: 'matForm' };
export const BAR = { room: ['apply', 'delRoom'], solid: ['apply', 'delRoom'], wall: ['wApply', 'wDelete'], opening: ['oApply', 'oDelete'], fixture: ['xApply', 'xDelete'], stairs: ['stApply', 'stDelete'], object: ['obApply', 'obDelete'], material: ['mApply', 'mDelete'] };
/** What is selected now: { kind, id } (kind room, solid, wall, opening, fixture, stairs or object), or null. */
export const selected = () => (Ed.roomId ? { kind: Ed.shape, id: Ed.roomId } : Ed.wallId ? { kind: 'wall', id: Ed.wallId } : Ed.openingId ? { kind: 'opening', id: Ed.openingId }
  : Ed.fixtureId ? { kind: 'fixture', id: Ed.fixtureId } : Ed.stairsId ? { kind: 'stairs', id: Ed.stairsId } : Ed.objectId ? { kind: 'object', id: Ed.objectId } : null);
/** Select one thing (null: nothing). */
const select = (kind, id) => (kind ? SELECT[kind]?.(id) : selectNone());
export const SELECT = { room: id => selectRoom(id), solid: id => selectSolid(id), wall: id => selectWall(id), opening: id => selectOpening(id), fixture: id => selectFixture(id), stairs: id => selectStairs(id), object: id => selectObject(id) };

/** The fields of the edited panel that count for "changed and not applied" (in the order the snapshot keeps them). */
function panelFields() {
  const el = Ed.editing && $(PANEL[Ed.editing.kind]);
  return el ? [...el.querySelectorAll('input, select, textarea')].filter(c => !c.closest('#nextTo') && !c.classList.contains('numslider') && !['wSplitAt', 'oFrom', 'xFrom', 'copyFrom', 'obCopy', 'oCopy', 'xCopy', 'stCopy'].includes(c.id)) : [];
}
const fieldValue = c => (c.type === 'checkbox' ? c.checked : c.value);
/** The edited panel's field values, to tell whether anything was changed and not applied. */
const baseOf = c => { if (!Ed.editBase.has(c)) Ed.editBase.set(c, fieldValue(c)); return Ed.editBase.get(c); };   // a field that appeared after the snapshot (a rebuilt options form) starts as it is
/** A form that fills fields after the panel was snapshotted (the light of a lit object once its build arrives) says so, so the fill is not a change. */
export function rebase(...ids) { if (Ed.editBase) for (const id of ids) { const c = $(id); if (c) Ed.editBase.set(c, fieldValue(c)); } }
/** The fields an unapplied change would drop, as "label: was → now" lines for the dialog (ticket #6). */
function changedFields() {
  if (!Ed.editing || Ed.editBase === null) return [];
  return panelFields().flatMap(c => {
    const was = baseOf(c), now = fieldValue(c);
    if (was === now) return [];
    const label = [...(c.closest('label')?.childNodes || [])].find(n => n.nodeType === 3 && n.textContent.trim())?.textContent.trim() || c.id || 'a field';
    const show = v => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : v === '' ? '(blank)' : String(v));
    return [`${label}: ${show(was)} → ${show(now)}`];
  });
}
export const isDirty = () => !!Ed.editing && Ed.editBase !== null && changedFields().length > 0;
// A double-click is two clicks on the same thing within DOUBLE ms. Counted here, not with the browser's
// dblclick: the first click selects, which redraws the plan and the tree, and the browser then sees the
// second click land on a new element and fires no dblclick.
const DOUBLE = 450;
export function isDoubleClick(kind, id) {
  const now = performance.now(), hit = !!Ed.lastClick && Ed.lastClick.kind === kind && Ed.lastClick.id === id && now - Ed.lastClick.t < DOUBLE;
  Ed.lastClick = hit ? null : { kind, id, t: now };
  return hit;
}
export const FRESH_ERR = { object: 'obErr', opening: 'oErr', fixture: 'xErr', wall: 'wErr', stairs: 'stErr' };
export const isFresh = () => !!Ed.fresh && !!Ed.editing && Ed.editing.kind === Ed.fresh.kind && Ed.editing.id === Ed.fresh.id;
const setSelectedId = (kind, id) => { if (kind === 'object') Ed.objectId = id; else if (kind === 'opening') Ed.openingId = id; else if (kind === 'fixture') Ed.fixtureId = id; else if (kind === 'wall') Ed.wallId = id; else if (kind === 'stairs') Ed.stairsId = id; };
const forgetForms = () => { Ed.objectFormFor = null; Ed.openingFormFor = null; Ed.fixtureFormFor = null; Ed.wallFormFor = null; Ed.stairsFormFor = null; };   // the forms refill from the model
/** Call right after a new thing was made and opened: `base` is the model from before it. */
export function startFresh(kind, id, base, what) { Ed.fresh = { kind, id, autoId: id, base, what }; showEditBar(); }
/** Take the unapplied new thing out again (the model goes back to before it was made). */
function discardFresh() {
  const f = Ed.fresh; Ed.fresh = null;
  if (!f) return;
  Ed.model = Ed.history.rewindTo(f.base) || f.base;
  Ed.dirty = isModelDirty();
  setSelectedId(f.kind, null);
  forgetForms();
}
/**
 * Before something new is made: a new thing still being edited and never applied is dropped first (asking when it was
 * changed). `hosts` are the ids the new thing goes on (a wall, an opening): when that is the unapplied thing itself it must
 * be applied first, because its id is not settled yet. Returns false when it stays.
 */
export function dropFresh(hosts = []) {
  if (!isFresh()) { if (Ed.fresh && !Ed.editing) Ed.fresh = null; return true; }
  if (hosts.includes(Ed.fresh.id)) { setStatus(`Apply the new ${Ed.fresh.what} first: Apply creates it and gives it its id`); return false; }
  return leaveEdit();
}
/** The first Apply of a new thing worked (or had nothing to change): it exists now, with the id its name makes. */
export function settleFresh() {
  const f = Ed.fresh; Ed.fresh = null;
  $(FRESH_ERR[f.kind]).textContent = '';
  let id = f.id;
  const r = id === f.autoId ? renameFromName(Ed.model, Ed.levelId, f.kind, id, opts()) : null;
  if (r?.renamed && !r.report.errors.length) {
    id = r.id; setSelectedId(f.kind, id); if (Ed.editing) Ed.editing.id = id;           // before the commit redraws, which looks the thing up by its id
    forgetForms();
    commit(r.model);
  }
  setStatus(`${id} created (not saved yet)`);
}
export function snap() { if (!Ed.editing) return; Ed.editBase = new Map(panelFields().map(c => [c, fieldValue(c)])); showEditBar(); }
// ---- one place for a panel's messages (ui-consistency plan, UX27, R9): right above the edit bar, whichever panel is open ----
// The panels still write their own message element (wErr, oErr, …); it is shown here instead, red for a refusal, grey for a
// note such as "Nothing changed." or "Building…".
export const PANEL_MSG = { wall: 'wErr', opening: 'oErr', fixture: 'xErr', stairs: 'stErr', object: 'obErr', material: 'mErr' };
export function syncEdMsg() {
  const id = Ed.editing && PANEL_MSG[Ed.editing.kind], text = (id && $(id).textContent.trim()) || '';
  $('edMsg').textContent = text;
  $('edMsg').hidden = !text;
  $('edMsg').classList.toggle('note', /^(Nothing changed|Building|Checking|Applied)/.test(text));
}
export function showEditBar() {
  if (!Ed.editing) return;
  syncEdMsg();
  const [a, d] = BAR[Ed.editing.kind], changed = isDirty();
  const isNew = isFresh();
  $('edApply').disabled = $(a).disabled;
  $('edApply').textContent = /anyway/.test($(a).textContent) ? 'Apply anyway' : isNew ? 'Apply (create)' : 'Apply';
  // the bar never changes shape (UX25, R8): what does not apply is disabled, with the reason as its tooltip
  const canDup = ['object', 'opening', 'fixture'].includes(Ed.editing.kind) || (Ed.editing.kind === 'wall' && wall() && !wall().from?.length);
  $('edDelete').disabled = $(d).hidden || isNew;
  $('edDelete').title = isNew ? 'A new thing is not created yet: Cancel throws it away' : $(d).hidden ? (Ed.editing.kind === 'wall' ? 'This wall follows its rooms: it goes when its room edges go (or Keep as hand-drawn first)' : 'This one cannot be deleted here') : 'Delete it (confirmed first; Delete key)';
  $('edDup').disabled = isNew || !canDup;
  $('edDup').title = isNew ? 'Apply it first' : !canDup ? (Ed.editing.kind === 'wall' ? 'This wall follows its rooms, so a copy would sit on top of it' : 'Rooms, solids, stairs and materials are copied with Copy from in the new one') : 'A copy beside it, with the same sizes, then opened (Ctrl+D)';
  $('edId').hidden = isNew;                                       // the id, clickable: a dialog changes it (fixes list 26)
  $('edId').textContent = Ed.editing.id;
  $('edRevert').disabled = !changed;
  $('edClose').textContent = changed || isNew ? 'Cancel' : 'Close';
  $('edState').textContent = isNew ? `● new ${Ed.fresh.what}: created when you Apply` : changed ? '● changes not applied yet' : '';
}
/** Open the editor for one thing (leaving the current one first, asking if it has unapplied changes). */
export function enterEdit(kind, id, o = {}) {
  perfAs('open');
  if (Ed.editing && !leaveEdit({ ask: o.ask !== false, noBack: true })) return false;
  if (Ed.measure?.isOn()) Ed.measure.setOn(false);
  Ed.wallFormFor = null; Ed.openingFormFor = null; Ed.fixtureFormFor = null; Ed.stairsFormFor = null; Ed.objectFormFor = null;          // always start from what is stored
  for (const e of ['wErr', 'oErr', 'xErr', 'stErr', 'obErr', 'mErr']) $(e).textContent = '';
  if (kind === 'material') { Ed.editing = { kind, id, back: o.back }; openMaterial(id, o.forSide); }
  else {
    // PF4: the selection's own refresh waits: the one below sees the editing state, and the plan is drawn once
    Ed.selecting = true;
    try { SELECT[kind]?.(id); } finally { Ed.selecting = false; }
    Ed.editing = { kind, id };
  }
  if (kind === 'room' || kind === 'solid') zoomToIfSmall(room()?.polygon, false);   // the view first, so the refresh draws it
  refresh(); snap();
  $('cap').scrollTop = 0;
  return true;
}
/** A new room or chimney: the editor with an empty measurement form. */
export function editDraft(d) {
  if (Ed.editing && !leaveEdit({ noBack: true })) return false;
  if (Ed.measure?.isOn()) Ed.measure.setOn(false);
  Ed.roomId = null; Ed.wallId = null; Ed.openingId = null; Ed.fixtureId = null; Ed.stairsId = null; Ed.objectId = null; Ed.draft = d;
  loadFormForSelection();
  Ed.editing = { kind: d.solid ? 'solid' : 'room', id: null };
  refresh(); snap();
  $('cap').scrollTop = 0;
  return true;
}
/** Back to the house view; false when the user keeps the unapplied changes. */
export function leaveEdit({ ask = true, noBack = false } = {}) {
  if (!Ed.editing) return true;
  if (ask && isDirty()) return false;                             // unapplied changes: the caller asks first (mayLeave), nothing is dropped here
  if (isFresh()) discardFresh();                                  // a new thing that was never applied: leaving removes it
  const was = Ed.editing;
  if (Ed.peekId) { Ed.peekId = null; Ed.peekSel = null; $('peekBar').hidden = true; $('peekCard').hidden = true; }
  Ed.editing = null; Ed.editBase = null; Ed.draft = null; Ed.fromPick = null; Ed.startPick = false;
  Ed.wallFormFor = null; Ed.openingFormFor = null; Ed.fixtureFormFor = null; Ed.stairsFormFor = null; Ed.objectFormFor = null;           // forms refill from the model next time
  if (was.kind === 'material') { Ed.matId = null; $('matForm').dataset.forSide = ''; }
  if (Ed.roomId) loadFormForSelection();
  if (Ed.autoZoomed) { Ed.view = null; Ed.autoZoomed = false; }
  refresh();
  if (was.back && !noBack) enterEdit(was.back.kind, was.back.id);
  return true;
}
/**
 * Change the id of what is being edited and every reference to it (fixes list 26), from a dialog reached by clicking
 * the id. The dialog checks the new id before it closes, so a taken one is changed first.
 */
export async function renameEditing() {
  if (!Ed.editing) return;
  if (isDirty() || isFresh()) { setStatus('Apply or revert your changes first, then change the id'); return; }
  const from = Ed.editing.id, kind = Ed.editing.kind, name = entityName(Ed.model, from);
  const r = await openDialog({
    title: `Id of ${refName(from)}`,
    message: 'Every reference to it is updated. Ids are lowercase letters, digits and _, and keep their prefix (r_, w_ …).',
    fields: [{ name: 'id', label: 'Id', value: from }],
    buttons: [
      { id: 'fromName', label: 'From name', fill: () => ({ id: idFromName(Ed.model, from, name) }) },
      { id: 'save', label: 'Save id', primary: true, check: v => { const t = v.id.trim(); return t === from ? null : renameId(Ed.model, from, t).report.errors[0] || null; } },
      { id: 'cancel', label: 'Cancel' },
    ],
  });
  if (r.button !== 'save') return;
  const to = r.values.id.trim();
  if (to === from) return;
  const res = renameId(Ed.model, from, to);
  if (res.report.errors.length) { setStatus(res.report.errors.join('; ')); return; }
  // a fixture's link or a door's sensor in location.json moves with it (saved with Save, undone with the rename)
  let moved = { location: Ed.loc, moved: false };
  if (res.report.fixture || res.report.opening || res.report.object) {
    moved = renameBinding(Ed.loc, from, to);
    if (moved.conflict) {
      const linkOf = b => b?.entity ?? 'no entity';
      const useOld = await askConfirm(`${to} already has a link (${linkOf(moved.conflict.existing)}). Use the link of ${from} (${linkOf(moved.conflict.old)}) instead? Cancel keeps the existing link and drops the one of ${from}.`, { title: 'Two links', ok: `Use ${from}'s link` });
      moved = renameBinding(Ed.loc, from, to, { resolve: useOld ? 'use-old' : 'keep-existing' });
    }
  }
  leaveEdit({ ask: false, noBack: true });
  Ed.loc = moved.location;
  commit(res.model);
  setStatus(`${from} is ${to} now: ${res.report.changed} references updated${moved.moved ? '; its link in location.json moved too' : ''} (not saved yet)`);
  enterEdit(kind, to, { ask: false });
}

/** Close the editor from a button or Escape: the unapplied-changes question first (decideLeave). */
export const closeEdit = async () => { if (await decideLeave()) leaveEdit({ ask: false }); };

/**
 * Leaving an edit with unapplied changes (or a new thing not created yet): Apply (writes the form into the model, as
 * the bar does; the house is still saved separately), Discard, or Cancel to stay (fixes list 12, 20). Resolves true
 * when the edit may be left.
 */
export async function decideLeave() {
  if (!Ed.editing) return true;
  const fr = isFresh(), changed = isDirty();
  if (!fr && !changed) return true;
  const applyId = BAR[Ed.editing.kind][0];
  // Apply writes the form into the model, as the bar does; the house itself is saved separately (Save in the save bar)
  const buttons = [
    { id: 'apply', label: fr ? 'Apply (create)' : 'Apply', primary: true },
    { id: 'discard', label: fr ? `Discard this new ${Ed.fresh.what}` : 'Discard' },
    { id: 'cancel', label: 'Cancel' },
  ];
  const r = await openDialog({
    title: fr ? `New ${Ed.fresh.what} not created yet` : 'Unapplied changes',
    message: fr ? 'Apply creates it. Discard throws it away. Cancel stays here.' : [
      'Apply writes these changes into the model. Discard drops them. Cancel stays here. (Save in the save bar stores the house.)',
      ...(changedFields().length ? ['', 'Not applied yet:', ...changedFields().map(l => `• ${l}`)] : []),
    ].join('\n'),
    buttons,
  });
  if (r.button === 'cancel') return false;
  if (r.button === 'discard') { leaveEdit({ ask: false, noBack: true }); return true; }   // drops the changes and leaves
  if (r.button === 'apply') {
    if ($(applyId).disabled) { setStatus('Fix the errors in the form first (or discard the changes)'); return false; }
    // writes the form into the model; awaited, because Apply may ask about changes elsewhere in the plan first,
    // and when that is cancelled the edit stays open with its changes
    const h = $(applyId).onclick;
    if (h) await h.call($(applyId)); else $(applyId).click();
    if (isDirty()) return false;
  }
  return true;
}
/** Revert: the form back to what is stored. */
export function revertEdit() {
  const k = Ed.editing.kind;
  if (k === 'room' || k === 'solid') loadFormForSelection();
  else if (k === 'wall') Ed.wallFormFor = null;
  else if (k === 'opening') Ed.openingFormFor = null;
  else if (k === 'fixture') Ed.fixtureFormFor = null;
  else if (k === 'stairs') Ed.stairsFormFor = null;
  else if (k === 'object') Ed.objectFormFor = null;
  else if (k === 'material') openMaterial(Ed.matId, $('matForm').dataset.forSide);
  for (const e of ['wErr', 'oErr', 'xErr', 'stErr', 'mErr']) $(e).textContent = '';
  refresh(); snap();
}
/** Unapplied changes stop a synchronous action (it is refused, never dropped): the caller asks first with mayLeave()/mayRefill(). */
const okToDiscard = () => !isDirty();
/** Before leaving the edit for another item (or a new one): the unapplied-changes question, in the page. True when it may go on. */
export const mayLeave = async () => !Ed.editing || decideLeave();
/** Before the form is refilled from the model (a refresh, a split, a join …): the question, in the page. Discard reverts the form. */
export async function mayRefill() {
  if (!isDirty()) return true;
  if (!(await askConfirm('This refreshes the form: discard the changes you have not applied?', { ok: 'Discard' }))) return false;
  revertEdit();
  return true;
}
/** A click handler that leaves the edit for another item: the unapplied-changes question first, then the action. */
export const afterLeave = fn => async (...args) => { if (!(await mayLeave())) return; return fn(...args); };
/** After a change: follow what is edited (a new room got its id, a deleted thing ends the editor). */
export function afterCommit() {
  if (!Ed.editing) return;
  const k = Ed.editing.kind;
  if (k === 'room' || k === 'solid') Ed.editing.id = Ed.roomId ?? (Ed.draft ? null : Ed.editing.id);
  if (k === 'material' && Ed.matId) Ed.editing.id = Ed.matId;
  const there = k === 'room' || k === 'solid' ? !!(room() || Ed.draft) : k === 'wall' ? !!wall() : k === 'opening' ? !!opening() : k === 'fixture' ? !!fixture() : k === 'stairs' ? !!stairs() : k === 'object' ? !!object() : !!(Ed.editing.id && Ed.model.materials?.[Ed.editing.id]);
  if (!there) { Ed.editing = null; Ed.editBase = null; refresh(); return; }
  snap();
}
export function undoRedo(which) {
  // with an editor open (Q5): unapplied changes are reverted first; with none, the stored change is undone and the form follows
  if (Ed.editing) {
    if (isFresh()) { setStatus(`The new ${Ed.fresh.what} is not created yet: Cancel throws it away`); return; }
    if (isDirty()) { if (which === 'undo') { revertEdit(); setStatus('Your unapplied changes were reverted (Ctrl+Z again undoes the last stored change)'); } else setStatus('Apply or revert your changes first'); return; }
    if (which === 'undo' ? !Ed.history.canUndo : !Ed.history.canRedo) { setStatus(which === 'undo' ? 'Nothing to undo' : 'Nothing to redo'); return; }
  }
  const was = Ed.editing;
  Ed.model = which === 'undo' ? Ed.history.undo() : Ed.history.redo();
  if (locOf.has(Ed.model)) Ed.loc = locOf.get(Ed.model);
  Ed.dirty = isModelDirty();
  if (!level()) { Ed.levelId = Ed.model.levels[0].id; Ed.roomId = null; Ed.wallId = null; Ed.draft = null; }
  fillLevels();
  if (Ed.roomId && !room()) Ed.roomId = null;
  if (Ed.wallId && !wall()) Ed.wallId = null;
  if (Ed.openingId && !opening()) Ed.openingId = null;
  if (Ed.fixtureId && !fixture()) Ed.fixtureId = null;
  if (Ed.stairsId && !stairs()) Ed.stairsId = null;
  if (Ed.objectId && !object()) Ed.objectId = null;
  Ed.openingFormFor = null; Ed.fixtureFormFor = null;
  fillPlace();
  Ed.wallFormFor = null;
  if (!Ed.wallId) loadFormForSelection();
  if (was) {
    // the thing being edited: still there, its form shows the model again; gone (undone before it was made), the editor closes
    const k = was.kind, there = k === 'material' ? !!Ed.model.materials?.[was.id] : (k === 'room' || k === 'solid') ? !!room() : !!selected() && selected().id === was.id;
    if (!there) { Ed.editing = null; Ed.editBase = null; refresh(); setStatus(`${which === 'undo' ? 'Undone' : 'Redone'}: ${was.id} is not in the plan now, so its editor closed`); return; }
    if (k === 'material') openMaterial(was.id);
  }
  refresh();
  if (was) snap();                                                  // the refilled form is the base again: nothing unapplied
  setStatus(which === 'undo' ? 'undone' : 'redone');
}
export const setStatus = t => { Ed.baseStatus = t; $('status').textContent = t; };
export const KIND_WORD = { room: 'room', solid: 'solid', wall: 'wall', opening: 'opening', fixture: 'lamp or switch', stairs: 'stairs', object: 'object' };
