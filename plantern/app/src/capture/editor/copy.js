// Editor page: copy. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { displayName } from '../../model/names.js';
import { copySources, shapeDraftFrom, findIn, objectCopyProps, openingSpecFrom, fixtureSpecFrom, stairsWithShapeOf, canCopyObject, duplicate } from '../../edit/copy.js';
import { polygonAreaM2 } from '../../blueprints/place.js';
import { adjacentLevels } from '../../tools/snap.js';
import { newSolidId, setObject, setOpening, setFixture, applyStairs } from '../../edit/ops.js';
import { SOLID_COLOR } from '../../model/solids.js';
import { newRoomId } from '../edit.js';
import { $, commit, esc, level, opts, stairs } from './core.js';
import { loadForm, nameOf } from './selection.js';
import { recompute } from './panel-room.js';
import { draw } from './plan-draw.js';
import { editDraft, enterEdit, mayRefill, setStatus, showEditBar, startFresh } from './session.js';
import { goToLevel } from './levels.js';
import { Ed } from './state.js';


// ---- Copy from another one, Copy to the level below/above, Duplicate (src/edit/copy.js) ----
const COLL = { room: 'rooms', solid: 'solids', object: 'objects', opening: 'openings', fixture: 'fixtures', stairs: 'stairs' };
/** <option>s of what can be copied, grouped by level (this one first, then below and above). */
function copyOptions(coll, keep = () => true, label = x => displayName(x)) {
  const rel = { here: 'this level', below: 'below', above: 'above', other: '' };
  return copySources(Ed.model, coll, Ed.levelId, keep).map(g => `<optgroup label="${esc(g.level.name || g.level.id)}${rel[g.relation] ? ` (${rel[g.relation]})` : ''}">${g.items.map(x => `<option value="${esc(x.id)}"${x.polygon?.length >= 3 ? ` data-hint="${polygonAreaM2(x.polygon)} m²"` : ''}>${esc(label(x))}${x.name ? ` · ${esc(x.id)}` : ''}</option>`).join('')}</optgroup>`).join('');
}
/** The room form's Copy from (a new room or solid) and Copy to buttons (a stored one). */
export function fillShapeCopy() {
  const coll = Ed.shape === 'solid' ? 'solids' : 'rooms', isNew = !Ed.roomId;
  $('copyRow').hidden = !isNew;
  if (isNew) $('copyFrom').innerHTML = `<option value="">— measure it from scratch —</option>${copyOptions(coll, x => x.polygon?.length >= 3)}`;
  const lv = level(), near = isNew ? [] : adjacentLevels(Ed.model, lv);
  $('copyTo').innerHTML = near.map(l => `<button data-copyto="${esc(l.id)}" title="A new ${Ed.shape} on ${esc(l.name || l.id)} with this one's shape, exactly ${l.elevation > lv.elevation ? 'above' : 'below'} it (it follows this one when it is re-measured)">Copy to ${esc(l.name || l.id)} ${l.elevation > lv.elevation ? '↑' : '↓'}</button>`).join(' ');
  $('copyTo').querySelectorAll('[data-copyto]').forEach(b => (b.onclick = () => copyToLevel(b.dataset.copyto)));
}
/** Fill the open draft from shapeDraftFrom(): name, options and measurements (nothing stored until Apply). */
function fillDraft(d) {
  Ed.draft.name = d.name; $('name').value = d.name;
  if (d.kind === 'solid') {
    $('rid').value = newSolidId(Ed.model, d.name || d.solidKind);
    $('sKind').value = d.solidKind; $('sColor').value = d.color || SOLID_COLOR; $('sBase').value = d.base ?? ''; $('sHeight').value = d.height ?? ''; $('sCuts').checked = d.cutsWalls;
  } else {
    $('rid').value = newRoomId(Ed.model, d.name);
    Ed.draft.exterior = d.exterior; $('exterior').checked = d.exterior;
    $('rFloor').value = d.floor ?? 'slab'; $('rFloorOff').value = d.floorOffset ?? ''; $('rCeil').value = d.ceilingHeight ?? '';
  }
  loadForm(d.capture);
  recompute(); draw(); showEditBar();
  const src = nameOf(d.source);
  setStatus(d.placed === 'stacked' ? `the shape of ${src}, exactly over it (it follows ${src} when that is re-measured): check it, then Apply`
    : d.placed === 'beside' ? `the shape of ${src}, set beside it: pick where corner 0 goes (a dot on the plan, or "Place next to another room"), then Apply`
      : `the shape of ${src}, at the same place in the plan: pick where corner 0 goes, then Apply`);
}
export function useShapeOf(srcId) {
  const d = shapeDraftFrom(Ed.model, Ed.shape === 'solid' ? 'solids' : 'rooms', srcId, Ed.levelId);
  if (d.error) { setStatus(d.error); return; }
  fillDraft({ ...d, source: srcId });
}
/** A new room (or solid) on the level below or above, stacked on this one. */
async function copyToLevel(target) {
  const coll = Ed.shape === 'solid' ? 'solids' : 'rooms', src = Ed.roomId;
  const d = shapeDraftFrom(Ed.model, coll, src, target);
  if (d.error) { setStatus(d.error); return; }
  if (!(await goToLevel(target))) return;
  if (!editDraft({ name: d.name, ...(coll === 'solids' ? { solid: true } : { exterior: d.exterior }) })) return;
  fillDraft({ ...d, source: src });             // not applied yet: Close asks before dropping it
}
/** Copy from… in the object, opening, fixture and stairs panels: its sizes onto this one, which stays where it is. */
export async function copyInto(kind, srcId) {
  const sel = { object: 'obCopy', opening: 'oCopy', fixture: 'xCopy', stairs: 'stCopy' }[kind];
  if (!srcId) return;
  if (!(await mayRefill())) { $(sel).value = ''; return; }
  const src = findIn(Ed.model, COLL[kind], srcId)?.item, id = Ed.editing?.id;
  let r;
  if (kind === 'object') {
    const props = objectCopyProps(src, findIn(Ed.model, 'objects', id)?.item);
    r = props ? setObject(Ed.model, Ed.levelId, id, props, opts()) : { report: { errors: [`${nameOf(srcId)} cannot be copied onto ${nameOf(id)}: they are not the same kind of object`] } };
  }
  else if (kind === 'opening') { const spec = openingSpecFrom(src); for (const k of ['hinge', 'swing', 'opens', 'leaves', 'thickness']) spec[k] ??= null; r = setOpening(Ed.model, Ed.levelId, id, spec, opts()); }
  else if (kind === 'fixture') { const { kind: _k, ...spec } = fixtureSpecFrom(src); r = setFixture(Ed.model, Ed.levelId, id, spec, opts()); }
  else r = applyStairs(Ed.model, Ed.levelId, stairsWithShapeOf(stairs(), src), opts());
  $(sel).value = '';
  if (!src || r.report.errors.length) { setStatus(src ? r.report.errors.join('; ') : `no ${kind} "${srcId}"`); return; }
  Ed.objectFormFor = null; Ed.openingFormFor = null; Ed.fixtureFormFor = null; Ed.stairsFormFor = null;
  commit(r.model);
  setStatus(`${id}: sizes copied from ${nameOf(srcId)}, still where it was (not saved yet)`);
}
/** The Copy from list of a panel: the others of the same kind (lamps with lamps, switches with switches). */
export function fillCopyInto(kind, self) {
  const sel = { object: 'obCopy', opening: 'oCopy', fixture: 'xCopy', stairs: 'stCopy' }[kind];
  const label = kind === 'opening' ? x => `${displayName(x)} (${x.type} ${x.width} × ${x.head - x.sill})` : kind === 'object' ? x => `${displayName(x)} (${x.size.join(' × ')})` : kind === 'fixture' ? x => `${displayName(x)} (${x.z} mm)` : x => displayName(x);
  const opts2 = copyOptions(COLL[kind], x => x.id !== self.id && (kind !== 'fixture' || x.kind === self.kind) && (kind !== 'object' || canCopyObject(x, self)), label);
  $(sel).innerHTML = `<option value="">—</option>${opts2}`;
  $(sel).closest('label').hidden = !opts2;
}
/** Duplicate: a copy beside it, then opened. */
export async function duplicateEdited() {
  if (!Ed.editing || !(await mayRefill())) return;
  const { kind, id } = Ed.editing, base = Ed.model, r = duplicate(Ed.model, Ed.levelId, kind, id, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  commit(r.model);
  enterEdit(kind, r.id, { ask: false }); startFresh(kind, r.id, base, `copy of ${nameOf(id)}`);
  setStatus(`${r.id}: a copy of ${nameOf(id)} beside it. Name it and Apply to create it`);
}
