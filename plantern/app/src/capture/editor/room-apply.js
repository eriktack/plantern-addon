// Editor page: room-apply. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { applyRoom, applySolid, removeSolid, removeRoom, cutWall } from '../../edit/ops.js';
import { resolveSettings } from '../../model/settings.js';
import { describeReconcile } from '../../edit/reconcile.js';
import { askConfirm, openDialog } from '../dialog.js';
import { solidStretches } from '../../geometry/solids.js';
import { wallFaceRooms } from '../../geometry/paint.js';
import { serialRunner } from '../save-queue.js';
import { askConflict } from '../conflict-ui.js';
import { createHistory } from '../../edit/history.js';
import { assetKey, assetWarnings } from '../../model/assets.js';
import { clearInactiveValues } from '../../model/objects.js';
import { validateModelCached as validateModel } from '../../model/validate.js';
import { $, commit, esc, geosFor, isModelDirty, level, locOf, opts, room } from './core.js';
import { afterLeave, editDraft, enterEdit, isDirty, leaveEdit, mayLeave, setStatus } from './session.js';
import { materialOptionsHtml } from './panel-wall.js';
import { addSwatchPicker, nameColour } from './add-menus.js';
import { collapseTree, loadFormForSelection, nameOf, refName, zoomToIfSmall } from './selection.js';
import { refresh } from './refresh.js';
import { assetCache } from './panel-object.js';
import { fillLevels, goToLevel } from './levels.js';
import { Ed } from './state.js';


export async function apply() {
  if (!Ed.solved?.ok) return;
  if (Ed.shape === 'solid') return applySolidForm();
  const base = room() || {};
  const id = Ed.roomId || $('rid').value;
  const next = { ...base, id, name: $('name').value.trim() || id, exterior: $('exterior').checked, polygon: Ed.solved.polygon, capture: Ed.solved.capture };
  delete next.floor; delete next.floorOffset; delete next.ceilingHeight;
  const off = $('rFloorOff').value.trim(), ceil = $('rCeil').value.trim();
  if ($('rFloor').value === 'none') next.floor = 'none';
  if (off !== '') next.floorOffset = Number(off);
  if (ceil !== '') next.ceilingHeight = Number(ceil);
  if ((off !== '' && !Number.isFinite(next.floorOffset)) || (ceil !== '' && !(next.ceilingHeight > 0))) { setStatus('Floor level and ceiling height must be numbers of mm (ceiling more than 0)'); return; }
  const r = applyRoom(Ed.model, Ed.levelId, next, { settings: resolveSettings(Ed.loc, level()) });
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  const lines = describeReconcile(r.report);
  // moves over 5 mm are confirmed first; smaller ones just happen (and are listed under Walls)
  if (r.report.preview.length && !(await askConfirm(['Applying this room changes the plan:', ...lines, 'Apply?'].join('\n\n'), { ok: 'Apply' }))) return;
  Ed.roomId = id; Ed.draft = null;
  $('wallsOut').innerHTML = lines.map(esc).join('<br>');
  commit(r.model);
}

/**
 * The chimney's sides, one row per room it borders: default (its own colour), a colour or a material,
 * like a wall side. Filled from the stored solid; the rows are read back by applySolidForm().
 */
export function renderSolidSides() {
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
  const matOpts = materialOptionsHtml('');
  box.innerHTML = rows.map(r => `<div class="sideLook" data-room="${esc(r.key)}"><label>${esc(r.label)}
      <select class="sMode"><option value="">default</option><option value="color">colour</option><option value="material"${matOpts ? '' : ' disabled'}>material</option></select></label>
      <input type="color" class="sCol" title="Colour: ${esc(r.label)}"><select class="sMat">${matOpts}</select></div>`).join('');
  box.querySelectorAll('.sideLook').forEach(row => {
    const look = looks?.[row.dataset.room] || {}, mode = row.querySelector('.sMode'), col = row.querySelector('.sCol'), mat = row.querySelector('.sMat');
    mode.value = look.material ? 'material' : look.color ? 'color' : '';
    col.value = look.color || '#e6e2da'; if (look.material) mat.value = look.material;
    const pick = addSwatchPicker(col, { onColour: () => { if (mode.value !== 'color') { mode.value = 'color'; show(); } }, extra: () => [{ id: 'name', label: 'Name this colour…', icon: 'edit', onPick: () => nameColour(col.value) }] });
    const show = () => { col.hidden = mode.value !== 'color'; mat.hidden = mode.value !== 'material'; pick.hidden = mode.value === 'material'; };
    mode.onchange = show; col.oninput = show;
    show();
  });
}
/** The looks from fillLookRows() rows over `base` (rooms without a row keep theirs); null when none. */
export function readLookRows(box, base) {
  const out = { ...(base || {}) };
  box.querySelectorAll('.sideLook').forEach(row => {
    const m = row.querySelector('.sMode').value, id = row.dataset.room;
    if (m === 'color') out[id] = { color: row.querySelector('.sCol').value };
    else if (m === 'material' && row.querySelector('.sMat').value) out[id] = { material: row.querySelector('.sMat').value };
    else delete out[id];
  });
  return Object.keys(out).length ? out : null;
}
export function renderWallRoomLooks(w) {
  const along = wallFaceRooms(w, Ed.curGeo.frames.get(w.id), level().rooms), nm = id => level().rooms.find(r => r.id === id)?.name || id;
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
async function applySolidForm() {
  const id = Ed.roomId || $('rid').value, num = t => { t = String(t).trim(); if (t === '') return null; const v = Number(t); return Number.isFinite(v) ? v : NaN; };
  const base = num($('sBase').value), height = num($('sHeight').value);
  if (Number.isNaN(base) || Number.isNaN(height)) { setStatus('base and height are numbers of mm'); return; }
  const s = { ...(room() || {}), id, name: $('name').value.trim() || null, kind: $('sKind').value, color: $('sColor').value, base: base || null, height, cutsWalls: $('sCuts').checked || null, polygon: Ed.solved.polygon, capture: Ed.solved.capture, sides: room() ? solidSidesForm() : null };
  const r = applySolid(Ed.model, Ed.levelId, s, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  const lines = describeReconcile(r.report);
  if (r.report.preview.length && !(await askConfirm([`Applying ${id} changes the plan:`, ...lines, 'Apply?'].join('\n\n'), { ok: 'Apply' }))) return;
  Ed.shape = 'solid'; Ed.roomId = id; Ed.draft = null;
  $('wallsOut').innerHTML = lines.map(esc).join('<br>');
  commit(r.model);
  renderSolidSides();
  zoomToIfSmall(s.polygon);
}

export async function deleteRoom() {
  const r = room();
  if (!r) return;
  if (Ed.shape === 'solid') {
    const p = removeSolid(Ed.model, Ed.levelId, r.id, opts());
    if (p.report.errors.length) { setStatus(p.report.errors.join('; ')); return; }
    const lines = [`Delete ${r.name || r.id} and its measurements? The rooms around it get walls there again (thickness to measure).`];
    if (p.report.dependents.length) lines.push(`Placed at one of its corners (they stay where they are, but that start point will be reported missing): ${p.report.dependents.join(', ')}.`);
    lines.push(...describeReconcile(p.report));
    if (!(await askConfirm(lines.join('\n\n'), { ok: 'Delete' }))) return;
    Ed.roomId = null; Ed.shape = 'room';
    commit(p.model);
    return;
  }
  const preview = removeRoom(Ed.model, Ed.levelId, r.id, { settings: resolveSettings(Ed.loc, level()) });
  if (preview.report.errors.length) { setStatus(preview.report.errors.join('; ')); return; }
  const d = preview.report;
  const lines = [`Delete room "${r.name || r.id}" and its measurements?`];
  if (d.removedWalls.length) lines.push(`Its own walls go too: ${d.removedWalls.join(', ')}.`);
  if (d.removedOpenings.length) lines.push(`Openings in those walls go too: ${d.removedOpenings.join(', ')}.`);
  if (d.heldWalls.length) lines.push(`Kept because something is attached to them: ${d.heldWalls.join(', ')}.`);
  if (d.keptWalls.length) lines.push(`Shared walls stay for the neighbour: ${d.keptWalls.join(', ')}.`);
  if (d.dependents.length) lines.push(`Placed at one of its corners (they stay where they are, but that start point will be reported missing): ${d.dependents.join(', ')}.`);
  lines.push(...describeReconcile(preview.report));
  if (!(await askConfirm(lines.join('\n\n'), { ok: 'Delete' }))) return;
  Ed.model = Ed.history.push(preview.model); Ed.dirty = isModelDirty();
  Ed.roomId = null; Ed.draft = null; Ed.editing = null; Ed.editBase = null;
  loadFormForSelection(); refresh();
  if (!level().rooms?.length) editDraft({ name: '', exterior: false });
  setStatus(`deleted ${r.id} (not saved yet)`);
}

// one save at a time: a double-click (or a click while the last save is still on its way) saves once, then at most once
// more, and a save with nothing changed says so instead of writing the same file again (decision 118)
export const save = serialRunner(saveNow);
async function saveNow() {
  if (Ed.fresh && Ed.editing) { $('saveOut').textContent = `Apply or cancel the new ${Ed.fresh.what} first: it is not created yet.`; return; }
  if (!Ed.dirty) { if (!/^Saved at/.test($('saveOut').textContent)) $('saveOut').textContent = 'All saved: nothing to save.'; return; }
  const errs = Ed.issuesNow.filter(i => i.severity === 'error');
  if (errs.length) { $('saveOut').innerHTML = `<span style="color:var(--bad)">Not saved: ${errs.length} error(s), listed just below. Fix them, or use Download.</span>`; return; }
  $('saveOut').textContent = 'Saving…';
  try {
    let r;
    try { r = await Ed.house.save(clearInactiveValues(Ed.model, Ed.blueprints)); }   // values that do not apply to a variant are dropped on save
    catch (e) {
      if (!e.conflict) throw e;
      // changed elsewhere in the same places: pick per thing, then save over what is stored now
      const a = await askConflict(e.details, { what: Ed.loc.name });
      if (a.action === 'theirs') { await reloadHouse('Loaded the version saved elsewhere; your changes are dropped.'); return; }
      if (a.action !== 'save') { $('saveOut').textContent = 'Not saved yet: it was changed elsewhere. Save again to choose.'; return; }
      r = await Ed.house.saveOver(a.value, e.details.theirs);
      r.merged = true;
    }
    if (Ed.loc !== Ed.savedLoc) { const rl = await Ed.house.save(Ed.loc, 'location'); Ed.loc = rl.value; }   // the links, with the model (fixes list 34)
    if (r.merged) Ed.model = Ed.history.push(r.value);                       // what was changed elsewhere is in it now
    Ed.savedModel = Ed.model; Ed.savedLoc = Ed.loc; Ed.dirty = false;
    $('elsewhere').hidden = true;
    $('saveOut').textContent = `Saved at ${new Date().toLocaleTimeString()}${r.merged ? ', together with changes made elsewhere' : ''}.`;
    collapseTree();                                                  // a fresh start after saving
    if (!Ed.editing) { Ed.roomId = null; Ed.wallId = null; Ed.openingId = null; Ed.fixtureId = null; Ed.stairsId = null; Ed.objectId = null; }
  } catch (e) {
    $('saveOut').innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`;
  }
  refresh();
}

/** Read the house again (what is stored now); the undo history starts over. */
async function reloadHouse(note) {
  Ed.assets = null;   // the house's asset models are read again with it
  await Ed.house.load();
  Ed.loc = Ed.house.location; Ed.model = Ed.savedModel = Ed.house.model; Ed.savedLoc = Ed.loc; Ed.dirty = false;
  assetCache();
  Ed.history = createHistory(Ed.model); locOf.set(Ed.model, Ed.loc);
  if (!Ed.model.levels.some(l => l.id === Ed.levelId)) Ed.levelId = Ed.model.levels[0]?.id ?? null;
  $('elsewhere').hidden = true;
  fillLevels(); refresh();
  $('saveOut').textContent = note;
}

/**
 * The house was saved by someone else (another page or device, a text editor, a git pull). With nothing
 * unsaved here it is simply read again; otherwise the save bar offers to merge it into the changes here
 * (by entity id: the same thing changed on both sides asks mine or theirs) or to take theirs.
 */
export function changedElsewhere(ev) {
  const when = new Date().toLocaleTimeString();
  if (!Ed.dirty && !Ed.editing) { reloadHouse(`Updated at ${when}: the house was ${ev.source === 'remote' ? 'changed in the repository' : 'saved elsewhere'}.`).catch(e => setStatus(e.message)); return; }
  const box = $('elsewhere');
  box.hidden = false;
  box.innerHTML = `<b>Changed elsewhere</b> at ${when}${ev.source === 'remote' ? ' (in the repository)' : ''}. <button id="elMerge">Merge into my changes</button> <button id="elTheirs">Take theirs</button>`;
  $('elMerge').onclick = async () => {
    if (!(await mayLeave())) return;
    const r = await Ed.house.mergeIncoming(Ed.model);
    let value = r.merged;
    if (r.conflicts.length) {
      const a = await askConflict({ theirs: r.theirsText, merged: r.merged, conflicts: r.conflicts }, { what: Ed.loc.name });
      if (a.action === 'theirs') { await reloadHouse('Loaded the version saved elsewhere; your changes are dropped.'); return; }
      if (a.action !== 'save') return;
      value = a.value;
    }
    box.hidden = true;
    commit(value);
    setStatus('merged with the changes made elsewhere (not saved yet)');
  };
  $('elTheirs').onclick = async () => { if (!(await askConfirm('Drop your unsaved changes and load the version saved elsewhere?', { ok: 'Load it' }))) return; if (Ed.editing) leaveEdit({ ask: false, noBack: true }); await reloadHouse('Loaded the version saved elsewhere.'); };
}

/**
 * Validation in the save bar, only when there is something to say: a count line, errors listed,
 * warnings folded away. Clicking an issue selects what it is about.
 */
/**
 * Warnings about the asset models (missing, or a size that is not the model's), listed with the validator's. They wait
 * until every model of the house has settled, so a model still loading is never reported missing. A model that is
 * broken is not reported here: its red marker says so.
 */
function assetIssues() {
  return [...modelIssues(), ...blueprintIssues()];
}

/**
 * Warnings about objects made from a blueprint: a size that is not the one its build has (the object panel's *Use the built
 * size* fixes it), and a blueprint the server refuses to build (the reason it gives). A server that cannot be reached says
 * nothing here (the red marker does); nothing is said while a model is still loading.
 */
function blueprintIssues() {
  const objs = (Ed.model?.levels || []).flatMap(l => (l.objects || []).filter(o => o.kind === 'asset' && o.blueprint).map(o => ({ o, level: l.id })));
  if (!objs.length || objs.some(x => ['loading', 'unknown'].includes(assetCache().status(assetKey(x.o))))) return [];
  const out = [];
  for (const { o, level: lvId } of objs) {
    const key = assetKey(o), st = assetCache().status(key);
    // a size that differs from the build is shown in the object's panel, with the rebuild, not here (every edit of a size would list it)
    if (st === 'broken') out.push({ id: o.id, severity: 'warning', level: lvId, msg: `blueprint "${o.blueprint}" cannot be built: ${assetCache().error(key) ?? 'it cannot be shown'}` });
  }
  return out;
}

function modelIssues() {
  const objs = (Ed.model?.levels || []).flatMap(l => (l.objects || []).filter(o => o.kind === 'asset' && !o.blueprint).map(o => ({ o, level: l.id })));
  const names = [...new Set(objs.map(x => x.o.asset))];
  if (!names.length || names.some(n => ['loading', 'unknown'].includes(assetCache().status(n)))) return [];
  // a missing model is left out of the map (assetWarnings reads that as missing); one that is there but has no
  // meta.json, or is broken, has nothing to compare, so it gets an empty meta
  const metas = new Map();
  for (const n of names) {
    const st = assetCache().status(n), meta = assetCache().meta(n);
    if (meta && st === 'ok') metas.set(n, meta);
    else if (st === 'broken' || st === 'ok') metas.set(n, {});
  }
  // the list prints the object's name and id already, so the message keeps only what is wrong
  return assetWarnings(Ed.model, metas).map(w => ({ id: w.id, severity: 'warning', msg: w.msg.replace(`${w.id}: `, ''), level: objs.find(x => x.o.id === w.id)?.level }));
}

export function showIssues() {
  Ed.modelGeos = geosFor(Ed.model);
  const issues = Ed.issuesNow = [...validateModel(Ed.model, Ed.modelGeos, Ed.blueprints ? { blueprints: Ed.blueprints } : {}), ...assetIssues()];
  const errs = issues.filter(i => i.severity === 'error'), warns = issues.filter(i => i.severity !== 'error');
  $('valBox').hidden = !issues.length;
  if (!issues.length) return;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  $('valSum').innerHTML = [errs.length ? `<span style="color:var(--bad)">${plural(errs.length, 'error')} (blocks Save)</span>` : '', warns.length ? `<span style="color:var(--warn)">${plural(warns.length, 'warning')}</span>` : ''].filter(Boolean).join(' · ');
  // two walls that both follow room edges cannot be cut (the rooms place them): the message says what to check instead
  const bothBound = pair => { const ws = Ed.model.levels.find(l => l.id === pair.level)?.walls || []; return pair.ids.every(id => ws.find(w => w.id === id)?.from?.length); };
  const item = i => `<div class="iss ${i.severity}" data-iid="${esc(i.id)}" data-ilevel="${esc(i.level || '')}"><b>${esc(nameOf(i.id))}</b>${nameOf(i.id) !== i.id ? ` <small>${esc(i.id)}</small>` : ''}${i.level && i.level !== Ed.levelId ? ` <small>${esc(i.level)}</small>` : ''} ${esc(i.msg)}${i.pair && !bothBound({ ids: i.pair, level: i.level || Ed.levelId }) ? ` <button type="button" class="cutPair" data-pair="${esc(i.pair.join('|'))}">Cut one of them…</button>` : ''}</div>`;
  $('issues').innerHTML = errs.map(item).join('') + (warns.length ? `<details${errs.length ? '' : ' open'}><summary>${plural(warns.length, 'warning')}</summary>${warns.map(item).join('')}</details>` : '');
  $('issues').querySelectorAll('.iss').forEach(el => (el.onclick = async () => {
    const id = el.dataset.iid;
    if (el.dataset.ilevel && el.dataset.ilevel !== Ed.levelId && !(await goToLevel(el.dataset.ilevel))) return;
    const lv = level();
    const kind = lv.rooms?.some(r => r.id === id) ? 'room' : lv.solids?.some(s => s.id === id) ? 'solid' : lv.walls?.some(w => w.id === id) ? 'wall'
      : lv.openings?.some(o => o.id === id) ? 'opening' : lv.fixtures?.some(x => x.id === id) ? 'fixture' : lv.objects?.some(o => o.id === id) ? 'object' : null;
    if (kind) afterLeave(() => enterEdit(kind, id))();
  }));
  $('issues').querySelectorAll('.cutPair').forEach(b => (b.onclick = e => { e.stopPropagation(); cutOverlap(b.dataset.pair.split('|'), b.closest('.iss').dataset.ilevel || Ed.levelId); }));
}

/**
 * Cut one of two overlapping walls (overlapping-walls plan, O3): asks which one, then trims it to the other's face with
 * cutWall(). A refusal is shown in the status line with its reason; nothing changes.
 */
async function cutOverlap([a, b], lvId) {
  if (isDirty()) { setStatus('Apply or revert your changes first, then cut the wall'); return; }
  if (lvId !== Ed.levelId && !(await goToLevel(lvId))) return;
  const r = await openDialog({
    title: 'Cut one of the two walls',
    message: `${refName(a)} and ${refName(b)} overlap. The wall you cut is trimmed to the face of the other, and the part beyond that face is removed.`,
    buttons: [{ id: 'a', label: `Cut ${refName(a)}`, primary: true }, { id: 'b', label: `Cut ${refName(b)}` }, { id: 'cancel', label: 'Cancel' }],
  });
  if (r.button !== 'a' && r.button !== 'b') return;
  const [cutId, keepId] = r.button === 'a' ? [a, b] : [b, a];
  const res = cutWall(Ed.model, Ed.levelId, cutId, keepId, opts());
  if (res.report.errors.length) { setStatus(res.report.errors.join('; ')); return; }
  commit(res.model);
  const { kept, removed } = res.report.cut;
  setStatus(`${cutId} is cut at ${keepId}: ${removed} mm removed on the ${kept === 'a' ? 'b' : 'a'} side (not saved yet)`);
}
