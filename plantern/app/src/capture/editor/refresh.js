// Editor page: refresh. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { collectSnapPoints, collectSnapPointsAround, adjacentOutlines } from '../../tools/snap.js';
import { startOptions, placeWallAgainstEdge, placeAgainstEdge, edgeWallThickness, bestWallAgainst } from '../start.js';
import { wallName } from '../labels.js';
import { wallHint } from '../option-hints.js';
import { compassSvg } from '../../render2d/compass.js';
import { northAngleOf } from '../../model/orientation.js';
import { stillToMeasure } from '../../edit/inspect.js';
import { levelTree, pathsTo } from '../../edit/tree.js';
import { $, P, esc, expanded, geosFor, innerThickness, level } from './core.js';
import { nameOf, nameOpts, selectFixture, selectObject, selectOpening, selectRoom, selectSolid, selectStairs, selectWall } from './selection.js';
import { draw } from './plan-draw.js';
import { recompute } from './panel-room.js';
import { syncSideView } from './house.js';
import { renderLevelStrip } from './levels.js';
import { showIssues } from './room-apply.js';
import { renderColors, renderMaterials, showWall } from './panel-wall.js';
import { showOpening } from './panel-opening.js';
import { showFixture } from './panel-fixture.js';
import { showStairs } from './panel-stairs.js';
import { showObject } from './panel-object.js';
import { renderAnchors, renderAreas, renderChecks } from './checks.js';
import { SELECT, afterLeave, enterEdit, isDoubleClick, mayLeave, showEditBar } from './session.js';
import { Ed } from './state.js';


// what refreshSnaps / refreshNextTo last built their lists for: they are rebuilt only when one of these changed (UX5)
const sameKey = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
/** Whether the lists of a room's or a solid's form (Corner 0 is placed at, Next to another room) are wanted: only while one is selected or being drawn. */
const roomFormWanted = () => !!(Ed.roomId || Ed.draft);

export function refreshSnaps() {
  // the data every drawing and drag reads: once per model and level (PF12: not again when only the selected room changes)
  const dataKey = [Ed.model, Ed.levelId];
  if (!sameKey(dataKey, Ed.snapsDataKey)) {
    Ed.snapsDataKey = dataKey;
    const lv = level(), geos = geosFor(Ed.model), geo = geos.get(lv.id);
    Ed.curGeo = geo;
    Ed.snaps = collectSnapPoints(Ed.model, lv, geo);
    Ed.snapsAround = collectSnapPointsAround(Ed.model, lv, l => geos.get(l.id));
    Ed.underlay = adjacentOutlines(Ed.model, lv, l => geos.get(l.id));
  }
  // the list of start points (hundreds of options, drawn as a menu) only where a room's form shows it
  if (!roomFormWanted()) return;
  const key = [Ed.snapsAround, Ed.roomId || $('rid').value || null];
  if (sameKey(key, Ed.snapsKey)) return;
  Ed.snapsKey = key;
  const keep = $('originRef').value;
  $('originRef').innerHTML = `<option value="">Plan origin (0, 0)</option>` + startOptions(Ed.snapsAround, { excludeRoom: Ed.roomId || ($('rid').value || undefined), ...nameOpts() }).map(o => `<option value="${esc(o.ref)}">${esc(o.label)}</option>`).join('');
  $('originRef').value = [...$('originRef').options].some(o => o.value === keep) ? keep : '';
}

/** "Place next to another room": pick a shared wall, get corner 0 and the first heading. */
function ntPick() {
  const [id, i] = ($('ntEdge').value || '').split('|'), room = level().rooms?.find(r => r.id === id);
  return { room, i: Number(i) };
}
/** This room's outline as solved from the form now (its own walls for "This room's wall"), or null. */
const ntShape = () => (Ed.solved?.ok ? Ed.solved.polygon : null);
function ntPlacement() {
  const { room, i } = ntPick();
  if (!room) return { error: 'pick the neighbour\'s wall first' };
  const t = $('ntT').value.trim(), opts = { thickness: t === '' ? NaN : Number(t), slide: Number($('ntSlide').value) || 0 };
  const poly = ntShape(), k = Number($('ntOwn').value);
  // a room with a shape: its chosen wall goes against it; a room not measured yet: its first wall
  return poly && Number.isInteger(k) ? placeWallAgainstEdge(poly, Number($('heading').value) || 0, k, room, i, opts) : placeAgainstEdge(room, i, opts);
}
export function ntPreview() {
  const p = ntPlacement(), { room, i } = ntPick(), k = Number($('ntOwn').value);
  $('ntOut').textContent = p.error ? p.error
    : `${ntShape() ? `Wall ${wallName(k)}` : 'The first wall'} goes against ${room.name || room.id} wall ${wallName(i)}${p.rot ? `; the room turns ${p.rot}°` : '; the room only moves'}. Corner 0 at (${p.start[0]}, ${p.start[1]}).`;
  $('ntUse').disabled = !!p.error;
  draw();
}
/** This room's walls in the second list; keeps the choice when it still exists. */
export function ntFillOwn() {
  const poly = ntShape(), keep = $('ntOwn').value;
  $('ntOwn').innerHTML = poly ? poly.map((p, k) => { const q = poly[(k + 1) % poly.length]; return `<option value="${k}">Wall ${wallName(k)} · ${Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]))} mm</option>`; }).join('') : '<option value="">(measure the room first: its first wall then)</option>';
  if ([...$('ntOwn').options].some(o => o.value === keep)) $('ntOwn').value = keep;
}
/** Pick the neighbour's wall (list or plan): its thickness, and this room's wall that already faces it. */
export function ntPickEdge(value) {
  $('ntEdge').value = value;
  const { room, i } = ntPick();
  if (room) $('ntT').value = edgeWallThickness(level(), room, i) ?? $('ntT').value ?? '';
  $('ntSlide').value = '';
  ntFillOwn();
  const poly = ntShape();
  if (room && poly) $('ntOwn').value = String(bestWallAgainst(poly, room, i));
  ntPreview();
}
export function ntUse() {
  const p = ntPlacement();
  if (p.error) return;
  $('originRef').value = p.ref; $('ox').value = p.offset[0]; $('oy').value = p.offset[1]; $('heading').value = p.heading;
  recompute();
}
export function refreshNextTo() {
  if (!roomFormWanted()) return;                     // PF12: its lists are in the room's form only
  const key = [Ed.model, Ed.levelId, Ed.roomId || $('rid').value || null, Ed.solved?.polygon || null];
  if (sameKey(key, Ed.nextToKey)) return;
  Ed.nextToKey = key;
  const lv = level(), cur = Ed.roomId || $('rid').value, keep = $('ntEdge').value;
  const rooms = (lv.rooms || []).filter(r => r.id !== cur && r.polygon?.length >= 3);
  $('ntEdge').innerHTML = rooms.flatMap(r => r.polygon.map((p, i) => {
    const q = r.polygon[(i + 1) % r.polygon.length], t = edgeWallThickness(lv, r, i);
    return `<option value="${esc(r.id)}|${i}" data-hint="${esc(wallHint({ a: p, b: q }, [r.name || r.id]))}">${esc(r.name || r.id)} · wall ${wallName(i)}: (${Math.round(p[0])}, ${Math.round(p[1])}) → (${Math.round(q[0])}, ${Math.round(q[1])})${t ? ` · wall ${t} mm` : ''}</option>`;
  })).join('');
  if ([...$('ntEdge').options].some(o => o.value === keep)) $('ntEdge').value = keep;
  if ($('ntT').value.trim() === '') { const { room, i } = ntPick(); $('ntT').value = (room && edgeWallThickness(lv, room, i)) || innerThickness(); }
  ntFillOwn();
  const p = ntPlacement();
  $('ntOut').textContent = p.error || ''; $('ntUse').disabled = !!p.error;
}

export function refresh() {
  if (Ed.selecting) return;                          // PF4: a selection inside enterEdit() refreshes once, below
  P('snaps', refreshSnaps);
  P('nextTo', refreshNextTo);
  // the house view, or only the thing being edited
  const k = Ed.editing?.kind;
  syncSideView();
  $('cap').classList.toggle('editing', !!Ed.editing);
  renderLevelStrip();
  $('editor').hidden = !(k === 'room' || k === 'solid');
  $('wallPanel').hidden = k !== 'wall';
  $('openingPanel').hidden = k !== 'opening';
  $('fixturePanel').hidden = k !== 'fixture';
  $('stairsPanel').hidden = k !== 'stairs';
  $('objectPanel').hidden = k !== 'object';
  $('matForm').hidden = k !== 'material';
  $('addRoom').hidden = !Ed.roomId || Ed.shape === 'solid';
  P('issues', showIssues);
  $('compass').innerHTML = compassSvg(northAngleOf(Ed.model));
  P('panel', () => {
    if (Ed.wallId) showWall();
    if (Ed.openingId) showOpening();
    if (Ed.fixtureId) showFixture();
    if (Ed.stairsId) showStairs();
    if (Ed.objectId) showObject();
  });
  const rooms = level().rooms || [];
  P('tree', () => renderTree(rooms));
  // the house view's sections: hidden while editing, and drawn again only when the model, the level or the bindings
  // changed (UX5); otherwise only the selection mark in Still to measure moves
  const secKey = [Ed.model, Ed.levelId, Ed.loc, Ed.matId];
  if (Ed.editing) { /* drawn when the editor closes */ }
  else if (sameKey(secKey, Ed.sectionsKey)) $('todo').querySelectorAll('.chk').forEach(el => el.classList.toggle('sel', el.dataset.id === Ed.wallId));
  else P('sections', () => {
    Ed.sectionsKey = secKey;
    renderMaterials();
    renderColors();
    renderAnchors();
    renderChecks();
    renderAreas();
    const todo = stillToMeasure(level());
    $('todo').innerHTML = todo.map(t => `<div class="chk${t.id === Ed.wallId ? ' sel' : ''}" data-id="${esc(t.id)}" data-kind="${esc(t.kind)}"><span class="dot warn"></span><span>${esc(nameOf(t.id))} <small>${esc(nameOf(t.id) === t.id ? t.kind : `${t.kind} · ${t.id}`)}</small></span><small>${esc(t.fields.join(', '))}</small></div>`).join('') || '<small>Nothing assumed on this level.</small>';
    $('todoCount').textContent = todo.length ? `(${todo.length})` : '';
    $('todo').querySelectorAll('.chk').forEach(el => (el.onclick = afterLeave(() => { if (SELECT[el.dataset.kind]) enterEdit(el.dataset.kind, el.dataset.id); })));
  });
  P('recompute', recompute);
  // the save bar: unsaved or saved, and errors block Save (Download still works)
  const errs = Ed.issuesNow.filter(i => i.severity === 'error').length;
  $('saveState').classList.toggle('dirty', Ed.dirty);
  $('saveStateTxt').textContent = Ed.dirty ? 'Unsaved changes' : 'All saved';
  $('save').disabled = !Ed.saveMode || !Ed.dirty || errs > 0;
  $('save').classList.toggle('primary', !!Ed.saveMode && Ed.dirty && !errs);
  $('save').title = errs ? 'Fix the errors below to save (Download still works)' : $('save').title.replace(/^Fix the errors.*$/, `Save into ${Ed.house.where}`);
  $('undo').disabled = !Ed.history.canUndo; $('redo').disabled = !Ed.history.canRedo;
  showEditBar();
}

/**
 * The sidebar tree: rooms → walls → openings and fixtures. A selection (from the plan or the tree)
 * opens the tree down to it; the ▸ opens or closes a node without selecting it.
 */
function renderTree(rooms) {
  const tree = levelTree(level(), { blueprintName: id => Ed.blueprints?.get(id)?.name }), sel = Ed.roomId || Ed.wallId || Ed.openingId || Ed.fixtureId || Ed.stairsId || Ed.objectId;
  if (sel && sel !== Ed.treeShownFor) {
    for (const k of pathsTo(tree, sel)) expanded.add(k);
    const self = nodes => nodes.forEach(n => { if (n.id === sel && n.children.length) expanded.add(n.key); self(n.children); });
    self(tree);
  }
  Ed.treeShownFor = sel;
  const row = (n, depth) => {
    const open = expanded.has(n.key), has = n.children.length > 0;
    return `<div class="tn${n.kind === 'group' ? ' group' : ''}${n.id === sel ? ' sel' : ''}" data-key="${esc(n.key)}" data-tkind="${n.kind}" data-tid="${esc(n.id)}" style="padding-left:${depth * 14}px">`
      + `<span class="caret" data-toggle="${esc(n.key)}">${has ? (open ? '▾' : '▸') : ''}</span><span class="dot${n.warn ? ' warn' : ''}"></span>`
      + `<span class="lbl">${esc(n.label)}</span><small>${esc(n.note || '')}</small>${n.kind === 'group' ? '<span></span>' : `<button class="ed" data-edit title="Edit (or double-click)">✎</button>`}</div>`
      + (open ? n.children.map(c => row(c, depth + 1)).join('') : '');
  };
  $('tree').innerHTML = tree.map(n => row(n, 0)).join('') || '<small>No rooms on this level yet: + New room, or measure one with the phone wizard.</small>';
  $('tree').querySelectorAll('.tn').forEach(el => (el.onclick = async e => {
    const key = el.dataset.key;
    if (e.target.closest('[data-edit]') || (SELECT[el.dataset.tkind] && !e.target.closest('[data-toggle]') && isDoubleClick(el.dataset.tkind, el.dataset.tid))) { if (!(await mayLeave())) return; enterEdit(el.dataset.tkind, el.dataset.tid); return; }
    if (e.target.closest('[data-toggle]') || el.dataset.tkind === 'group') { if (expanded.has(key)) expanded.delete(key); else expanded.add(key); renderTree(rooms); return; }
    expanded.add(key);
    ({ room: selectRoom, solid: selectSolid, wall: selectWall, opening: selectOpening, fixture: selectFixture, stairs: selectStairs, object: selectObject })[el.dataset.tkind]?.(el.dataset.tid);
  }));
}
