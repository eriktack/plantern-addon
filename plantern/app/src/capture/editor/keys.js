// Editor page: keys. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { openDialog } from '../dialog.js';
import { setObject, setFixture, setOpening, setWallProps } from '../../edit/ops.js';
import { moveWall } from '../drag.js';
import { addEntries } from '../add-menu.js';
import { openMenuAt } from '../../menu.js';
import { BAR, KIND_WORD, SELECT, decideLeave, enterEdit, isDirty, leaveEdit, selected, setStatus } from './session.js';
import { $, commit, level, opts } from './core.js';
import { freePoint, r1d } from './drag.js';
import { addContext, addPick } from './add-menus.js';
import { stopDrawing } from './walldraw.js';
import { editHint, pointerIsCoarse } from '../../touch.js';
import { NUDGE_STEP } from '../nudge-pad.js';
import { readableName, selectNone } from './selection.js';
import { splitAtPointer } from './wall-ops.js';
import { doSplit } from './panel-fixture.js';
import { save } from './room-apply.js';
import { togglePreview } from './preview3d.js';
import { Ed } from './state.js';

// ---- the keyboard on the plan (ui-consistency plan, UX8); never while a field has focus ----
const SHORTCUTS = [
  ['Click', 'select what is under the pointer (the status line names it while hovering)'],
  ['Double-click, Enter, ✎', 'edit it'],
  ['Esc', 'stop drawing, measuring or picking; put back a drag; close the editor; let go of the selection'],
  ['Delete, Backspace', 'delete the selection (asks first, as its panel does)'],
  ['Arrow keys', 'move the selected object, lamp, switch, opening or hand-drawn wall 10 mm (Shift 100 mm, Alt 1 mm); one undo step per burst'],
  ['Ctrl+D', 'duplicate the selection'],
  ['Ctrl+S', 'save'],
  ['Ctrl+Z, Ctrl+Y', 'undo, redo'],
  ['M', 'measure on the plan'],
  ['F', 'show the whole level'],
  ['3', 'show or hide the 3D preview of what is selected or edited'],
  ['Drag', 'move the plan; on a selected thing, move it (stored when you let go); on a corner of the room being edited, reshape it'],
  ['Alt while dragging', 'no snapping, exact millimetres'],
  ['Shift while dragging', 'keep a line straight'],
  ['Scroll wheel, two fingers', 'zoom'],
  ['?', 'this list'],
];
export function showShortcuts() {
  openDialog({ title: 'Keys and mouse in the Editor', message: SHORTCUTS.map(([k, v]) => `${k}: ${v}`).join('\n'), buttons: [{ id: 'close', label: 'Close', primary: true }] });
}
/** The nudge pad's arrows (mobile UX plan S4): the same move as an arrow key, `dir` one of NUDGE_DIRS, NUDGE_STEP mm; one undo step per burst. */
export const nudgeBy = dir => nudge([dir[0] * NUDGE_STEP, dir[1] * NUDGE_STEP]);
/** Move the selection by d mm (plan axes) with an edit operation; things on a wall slide along it by the part of d along the wall. */
function nudge(d) {
  const sel = selected(), lv = level();
  if (!sel) return false;
  if (Ed.editing && isDirty()) { setStatus('Apply or revert your changes first, then move it with the arrow keys'); return true; }
  const along = wallId0 => { const f = Ed.curGeo.frames.get(wallId0); return f ? r1d(d[0] * f.u[0] + d[1] * f.u[1]) : 0; };
  // a thing on a wall slides along it: an arrow across the wall does nothing, and says which arrows do
  const across = wallId0 => { const f = Ed.curGeo.frames.get(wallId0); if (!f || Math.abs(along(wallId0)) >= 0.5) return false; setStatus(`It slides along its wall: use ${Math.abs(f.u[0]) >= Math.abs(f.u[1]) ? '← and →' : '↑ and ↓'}`); return true; };
  const onWall = sel.kind === 'opening' ? lv.openings.find(x => x.id === sel.id)?.wall : (sel.kind === 'object' ? lv.objects : sel.kind === 'fixture' ? lv.fixtures : []).find(x => x.id === sel.id)?.attach?.wall;
  if (onWall && across(onWall)) return true;
  let r = null;
  if (sel.kind === 'object') {
    const o = lv.objects.find(x => x.id === sel.id);
    if (o?.attach?.wall) r = setObject(Ed.model, Ed.levelId, o.id, { attach: { ...o.attach, offset: Math.max(0, r1d(o.attach.offset + along(o.attach.wall))) } }, opts());
    else if (o?.pos) r = setObject(Ed.model, Ed.levelId, o.id, { pos: [o.pos[0] + d[0], o.pos[1] + d[1]] }, opts());
    else { setStatus('This object follows its opening: move the opening instead'); return true; }
  } else if (sel.kind === 'fixture') {
    const x = lv.fixtures.find(f => f.id === sel.id);
    if (x?.attach?.wall && !x.attach.opening) r = setFixture(Ed.model, Ed.levelId, x.id, { attach: { ...x.attach, offset: Math.max(0, r1d(x.attach.offset + along(x.attach.wall))) } }, opts());
    else if (x?.pos) r = setFixture(Ed.model, Ed.levelId, x.id, { pos: [x.pos[0] + d[0], x.pos[1] + d[1]] }, opts());
    else { setStatus('This one follows what it is on: move that instead'); return true; }
  } else if (sel.kind === 'opening') {
    const o = lv.openings.find(x => x.id === sel.id);
    if (o) r = setOpening(Ed.model, Ed.levelId, o.id, { offset: Math.max(0, r1d(o.offset + along(o.wall))) }, opts());
  } else if (sel.kind === 'wall') {
    const w = lv.walls.find(x => x.id === sel.id);
    if (w?.from?.length) { setStatus('This wall follows its rooms: move the room instead'); return true; }
    if (w) {
      const props = moveWall(w, d);
      if (w.anchor) props.anchor = Object.fromEntries(Object.entries(w.anchor).map(([k, v]) => [k, { ...v, offset: [(v.offset?.[0] ?? 0) + d[0], (v.offset?.[1] ?? 0) + d[1]] }]));
      r = setWallProps(Ed.model, Ed.levelId, w.id, props, opts());
    }
  } else { setStatus(`Arrow keys move objects, lamps, switches, openings and hand-drawn walls; ${sel.kind === 'room' || sel.kind === 'solid' ? 'drag a room or solid, or change where its corner 0 is' : 'use its panel'}`); return true; }
  if (!r) return true;
  if (r.report.errors.length) { setStatus(`Not moved: ${r.report.errors.join('; ')}`); return true; }
  if (!Ed.nudgeBurst || Ed.nudgeBurst.id !== sel.id) Ed.nudgeBurst = { id: sel.id, key: `nudge:${sel.id}:${Math.round(performance.now())}` };
  clearTimeout(Ed.nudgeBurst.timer); Ed.nudgeBurst.timer = setTimeout(() => { Ed.nudgeBurst = null; }, 600);
  commit(r.model, Ed.nudgeBurst.key);
  setStatus(`${sel.id} moved ${Math.hypot(d[0], d[1])} mm (not saved yet)`);
  return true;
}
/** Duplicate what is selected (or edited): its editor opens on the copy, as Duplicate in the edit bar does. */
function duplicateSelection() {
  const sel = selected();
  if (!sel && !Ed.editing) return;
  if (!Ed.editing && !enterEdit(sel.kind, sel.id)) return;
  if ($('edDup').disabled) setStatus($('edDup').title); else $('edDup').click();
}
/** Delete what is selected (or edited), through its panel's own Delete (which asks first and says why it cannot). */
function deleteSelection() {
  const sel = Ed.editing ? { kind: Ed.editing.kind } : selected();
  if (!sel || !BAR[sel.kind]) return;
  const del = $(Ed.editing ? 'edDelete' : BAR[sel.kind][1]);
  if (del.hidden || del.disabled) setStatus(del.title || 'This one cannot be deleted here'); else del.click();
}

// ---- the right-click menu on the plan (ui-consistency plan, UX9) ----
const ADD_WHERE = { wall: 'wall', room: 'room', opening: 'opening' };
/** The menu for the thing right-clicked (kind, id), or for the empty plan (no kind): its actions, then its Add entries. */
function contextEntries(kind, id) {
  const out = [];
  if (kind) {
    out.push({ id: '@edit', label: 'Edit', icon: 'edit', hint: editHint(pointerIsCoarse()) });
    const canDup = ['object', 'opening', 'fixture'].includes(kind) || (kind === 'wall' && !level().walls.find(w => w.id === id)?.from?.length);
    out.push({ id: '@dup', label: 'Duplicate', icon: 'duplicate', hint: 'Ctrl+D', ...(canDup ? {} : { disabled: kind === 'wall' ? 'It follows its rooms' : 'Not for this kind' }) });
    out.push({ id: '@del', label: 'Delete', icon: 'trash', hint: 'Delete key; asks first' });
    if (kind === 'wall') out.push({ id: '@split', label: 'Split here', icon: 'wall', hint: 'Two walls, each with its own thickness and look' });
  }
  const where = kind ? ADD_WHERE[kind] : 'house';
  if (where) out.push(...addEntries(addContext(where)).map(e => ({ ...e, group: e.group ? `Add · ${e.group}` : 'Add' })));
  return out;
}
export async function openContextMenu(e) {
  e.preventDefault();
  // a long press on a touch screen opens the menu itself; the contextmenu event that Android sends for the same press must not open it twice
  if (e.type === 'contextmenu' && performance.now() - Ed.lastMenuAt < 900) return;
  if (Ed.drawing) { stopDrawing(); return; }
  if (Ed.measure?.isOn() || Ed.peekId || Ed.fromPick || Ed.startPick || Ed.dragging) return;
  const el = e.target.closest('[data-kind]'), kind = el?.dataset.kind ?? null, id = el?.dataset.id ?? null, at = freePoint(e);
  if (Ed.editing && !(el && Ed.editing.kind === kind && Ed.editing.id === id)) {
    if (!(await decideLeave())) return;
    leaveEdit({ ask: false });
  }
  if (!Ed.editing) { if (kind) SELECT[kind]?.(id); else selectNone(); }
  const lv = level(), thing = kind && { room: lv.rooms, solid: lv.solids, wall: lv.walls, opening: lv.openings, fixture: lv.fixtures, stairs: lv.stairs, object: lv.objects }[kind]?.find(x => x.id === id);
  openMenuAt(e.clientX, e.clientY, {
    title: thing ? `${readableName(thing, { room: 'rooms', solid: 'solids', wall: 'walls', opening: 'openings', fixture: 'fixtures', stairs: 'stairs', object: 'objects' }[kind])} · ${id}` : `${level().name || Ed.levelId}`,
    entries: contextEntries(kind, id),
    onPick: entry => {
      if (entry.id === '@edit') { if (!Ed.editing) enterEdit(kind, id); return; }
      if (entry.id === '@dup') { duplicateSelection(); return; }
      if (entry.id === '@del') { deleteSelection(); return; }
      if (entry.id === '@split') { const at = splitAtPointer(e); if (at !== null) { $('wSplitAt').value = at; doSplit(); } return; }
      Ed.addAt = at;                                                 // the new thing goes where the menu was opened
      try { addPick(kind ? ADD_WHERE[kind] : 'house', entry); } finally { Ed.addAt = null; }
    },
  });
}

/** Keys on the plan (not in a field). Returns true when the key was used. */
export function planKey(e) {
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); if (!$('save').disabled) save(); else setStatus($('save').title || 'Nothing to save'); return true; }
  if (ctrl && (k === 'd' || k === 'D')) {
    e.preventDefault();
    duplicateSelection();
    return true;
  }
  if (ctrl || e.altKey && !k.startsWith('Arrow')) return false;
  if (k === '?') { showShortcuts(); return true; }
  if (k === '3' && !e.shiftKey) { togglePreview(); return true; }          // the 3D preview pane (preview3d.js); never while a field has focus
  if ((k === 'f' || k === 'F') && !e.shiftKey) { if (Ed.view) $('zFit').click(); return true; }
  if (k === 'Delete' || k === 'Backspace') {
    if (!(Ed.editing || selected())) return false;
    e.preventDefault();
    deleteSelection();
    return true;
  }
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
  if (dir) {
    const step = e.shiftKey ? 100 : e.altKey ? 1 : 10;
    if (nudge([dir[0] * step, dir[1] * step])) { e.preventDefault(); return true; }
  }
  return false;
}

/** Hover (UX7): the status line names what is under the pointer; leaving it brings back what the line said before. */
export function hoverStatus(e) {
  const el = !Ed.drawing && !Ed.measure?.isOn() && !Ed.dragging && !Ed.pan?.moved && e.target.closest?.('[data-kind]');
  if (!el) { $('status').textContent = Ed.baseStatus; return; }
  const k = el.dataset.kind, id = el.dataset.id, lv = level();
  const thing = { room: lv.rooms, solid: lv.solids, wall: lv.walls, opening: lv.openings, fixture: lv.fixtures, stairs: lv.stairs, object: lv.objects }[k]?.find(x => x.id === id);
  const what = k === 'fixture' && thing ? (thing.kind === 'switch' ? 'switch' : thing.kind === 'strip' ? 'LED strip' : 'lamp') : k === 'opening' && thing ? thing.type : KIND_WORD[k] || k;
  const sel = selected(), isSel = sel && sel.kind === k && sel.id === id;
  $('status').textContent = `${thing ? readableName(thing, { room: 'rooms', solid: 'solids', wall: 'walls', opening: 'openings', fixture: 'fixtures', stairs: 'stairs', object: 'objects' }[k]) : id} · ${what}${thing?.name ? ` (${id})` : ''} · ${isSel ? 'double-click or Enter to edit' : 'click to select, double-click to edit'}`;
}
