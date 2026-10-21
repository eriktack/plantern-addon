// Editor page: panel-opening. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { groupByRoom } from '../option-hints.js';
import { openingInfo, wallInfo, measureCorners, defaultCorner, openingToForm, offsetFrom, offsetTo, linkHeights, openingPropsFromForm } from '../../edit/inspect.js';
import { openingAssumed } from '../../model/openings.js';
import { FITTING_DEFAULTS } from '../../geometry/fittings.js';
import { displayName } from '../../model/names.js';
import { sameBinding } from '../../ha/suggest.js';
import { setOpening } from '../../edit/ops.js';
import { $, commit, esc, fixture, level, measureFrom, opening, opts } from './core.js';
import { showOpeningHosted } from './panel-object.js';
import { refName, titleHtml } from './selection.js';
import { afterLeave, enterEdit, isDirty, isFresh, setStatus, snap } from './session.js';
import { doorBindingDraft, entityChoices, loadDoorChoices, showDoorBinding } from './panel-fixture.js';
import { fillCopyInto } from './copy.js';
import { draw } from './plan-draw.js';
import { refresh } from './refresh.js';
import { Ed } from './state.js';


/** The opening panel: where it is, its sizes, and how a door or window opens (into which room). */
export function showOpening() {
  const info = openingInfo(level(), Ed.openingId);
  if (!info) { Ed.openingId = null; $('openingPanel').hidden = true; return; }
  const o = info.opening, nm = ids => ids.map(id => level().rooms?.find(r => r.id === id)?.name || id).join(', ') || 'outside';
  showOpeningHosted(o);
  $('oTitle').innerHTML = titleHtml(o);
  const wr = wallInfo(level(), o.wall), rn = ids => (ids || []).map(id => level().rooms?.find(r => r.id === id)?.name || id).join(', ');
  const R = rn(wr?.sides.right), Lf = rn(wr?.sides.left);
  const wallText = R && Lf ? `the wall between ${R} and ${Lf}` : R || Lf ? `the outer wall of ${R || Lf}` : refName(o.wall);
  $('oInfo').innerHTML = `in <a href="#" id="oWall" title="${esc(refName(o.wall))} (${esc(o.wall)})">${esc(wallText)}</a> (${info.length} mm, ${info.top} mm high)` + (openingAssumed(o).length ? ` · <b class="warn">still default: ${esc(openingAssumed(o).join(', '))}</b>` : '');
  $('oWall').onclick = e => { e.preventDefault(); afterLeave(() => enterEdit('wall', o.wall))(); };
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
  if (Ed.openingFormFor !== o) {
    const f = openingToForm(o, info.top, fromOf(o.id, info.wall));
    $('oName').value = f.name; $('oType').value = f.type; $('oOffset').value = f.offset; $('oWidth').value = f.width; $('oSill').value = f.sill; $('oHead').value = f.head;
    $('oHeight').value = f.height; $('oBelow').value = f.below; $('oHinge').value = f.hinge; $('oSwing').value = f.swing;
    if (f.type === 'door') $('oDoorOpens').value = f.opens; else { $('oDoorOpens').value = 'swing'; $('oOpens').value = f.opens; }
    for (const [id, k] of [['oOffset', 'offset'], ['oWidth', 'width'], ['oSill', 'sill'], ['oHead', 'head'], ['oHeight', 'height'], ['oBelow', 'below']]) $(id).placeholder = f.placeholders[k];
    $('oThick').value = f.thickness;
    $('oColorUse').checked = f.colorUse; $('oColor').value = f.color || FITTING_DEFAULTS[o.type]?.color || '#f2f0ea';
    $('oPlace').value = f.placement; $('oShift').value = f.shift; $('oSillDepth').value = f.sillDepth; $('oSillColorUse').checked = f.sillColorUse; $('oSillColor').value = f.sillColor || FITTING_DEFAULTS.sill.color;
    $('oMeasured').checked = f.measured; $('oErr').textContent = '';
    Ed.openingFormFor = o;
    Ed.openingHeightFrom = null; for (const id of ['oHead', 'oHeight', 'oBelow']) $(id).classList.remove('kept');
    if (o.type === 'door') showDoorBinding(o);
    fillCopyInto('opening', o);
  }
  $('oMeasuredRow').hidden = !openingAssumed(o).length;
  showOpeningRows();
}
export function showOpeningRows() {
  const t = $('oType').value;
  $('oBindBox').hidden = t !== 'door' || isFresh();                // a new door gets its sensor after its first Apply (its id is made then)
  if (t === 'door' && Ed.openingFormFor && !entityChoices.o.length) loadDoorChoices(Ed.openingFormFor);
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
  $('oLookBox').hidden = t === 'passage'; $('oSillRow').hidden = t !== 'window'; $('oShiftRow').hidden = t === 'passage'; $('oPlaceWhat').textContent = t;
}
/**
 * The corner an opening's or wall fixture's position is measured from: { key, s, dir, pos, label }
 * (measureCorners()): the one picked in "Measured from", else the nearest room corner before it.
 */
export function fromOf(id, w) {
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
export function fillFrom(sel, w, id) {
  const cs = measureCorners(level(), w.id), [t0, t1] = spanOf(id);
  // the rooms whose stretch of this wall the thing is on come first: those are the corners you can reach
  const here = new Set(cs.filter(c => c.dir > 0 && c.s <= t0 + 1 && cs.some(d => d.dir < 0 && d.s >= t1 - 1 && d.key.split('#')[0] === c.key.split('#')[0])).map(c => c.key.split('#')[0]));
  const opt = c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`;
  // one group per room (the rooms the thing is in first), so a corner is found under its room's name
  const groups = groupByRoom(cs, c => c.key.split('#')[0], rid => { const r = (level().rooms || []).find(x => x.id === rid); return r ? displayName(r) : ''; }, here);
  $(sel).innerHTML = groups.length > 1 ? groups.map(g => `<optgroup label="${esc(g.label)}">${g.items.map(opt).join('')}</optgroup>`).join('') : cs.map(opt).join('');
  $(sel).value = fromOf(id, w).key;
  measureFrom.set(id, $(sel).value);        // kept, so the corner does not change under you when the thing moves past another one
}
export function syncOriginPick() {
  const b = $('originPick');
  b.classList.toggle('on', Ed.startPick);
  b.textContent = Ed.startPick ? 'Click a point on the plan (Esc stops)' : 'Select from point';
}
export function startFromPick(sel) {
  const wallId = sel === 'oFrom' ? opening()?.wall : fixture()?.attach?.wall;
  if (!wallId) return;
  Ed.fromPick = { sel, wallId };
  setStatus('Click the corner on the plan to measure from (Esc or a click elsewhere cancels)');
  draw();
}
export function stopFromPick() { if (!Ed.fromPick) return; Ed.fromPick = null; draw(); }
export function chooseFrom(key) {
  const sel = Ed.fromPick.sel;
  Ed.fromPick = null;
  $(sel).value = key;
  $(sel).dispatchEvent(new Event('change'));                     // the same as picking it in the list: the thing keeps its place
  setStatus(`measured from ${key}`);
  draw();
}

export function switchFrom(kind) {
  const isO = kind === 'opening', id = isO ? Ed.openingId : Ed.fixtureId, thing = isO ? opening() : fixture();
  if (!thing) return;
  const w = level().walls.find(v => v.id === (isO ? thing.wall : thing.attach?.wall));
  if (!w) return;
  const field = isO ? 'oOffset' : 'xOffset', was = isDirty(), t = $(field).value.trim(), v = Number(t);
  const width = isO ? (Number($('oWidth').value.trim()) || thing.width) : 0, old = fromOf(id, w);
  measureFrom.set(id, $(isO ? 'oFrom' : 'xFrom').value);
  if (was && t !== '' && Number.isFinite(v)) $(field).value = offsetFrom({ offset: offsetTo(v, old, width), width }, fromOf(id, w));
  else { if (isO) Ed.openingFormFor = null; else Ed.fixtureFormFor = null; refresh(); snap(); return; }
  draw();
}
export const HEIGHT_BOXES = [['oSill', 'sill'], ['oHead', 'head'], ['oHeight', 'height'], ['oBelow', 'below']];
export function linkOpeningHeights(key) {
  const info = Ed.openingId && openingInfo(level(), Ed.openingId);
  if (!info) return;
  if (key !== 'sill') Ed.openingHeightFrom = key;
  const box = Object.fromEntries(HEIGHT_BOXES.map(([id, k]) => [k, $(id)]));
  const defaults = Object.fromEntries(HEIGHT_BOXES.map(([id, k]) => [k, parseFloat($(id).placeholder)]));
  const out = linkHeights(Object.fromEntries(Object.entries(box).map(([k, el]) => [k, el.value])), key, info.top, defaults);
  for (const [k, v] of Object.entries(out)) box[k].value = v;
  for (const k of ['head', 'height', 'below']) box[k].classList.toggle('kept', k === Ed.openingHeightFrom);
}
const openingForm = () => ({ heightFrom: Ed.openingHeightFrom ?? undefined, name: $('oName').value, type: $('oType').value, offset: $('oOffset').value, width: $('oWidth').value, sill: $('oSill').value, head: $('oHead').value, height: $('oHeight').value, below: $('oBelow').value, hinge: $('oHinge').value, swing: $('oSwing').value, opens: $('oType').value === 'door' ? $('oDoorOpens').value : $('oOpens').value, thickness: $('oThick').value, measured: $('oMeasured').checked, colorUse: $('oColorUse').checked, color: $('oColor').value, placement: $('oPlace').value, shift: $('oShift').value, sillDepth: $('oSillDepth').value, sillColorUse: $('oSillColorUse').checked, sillColor: $('oSillColor').value });

export function applyOpening() {
  const info = openingInfo(level(), Ed.openingId);
  const { props, errors } = openingPropsFromForm(info.opening, openingForm(), info.top, fromOf(Ed.openingId, info.wall));
  if (errors.length) { $('oErr').textContent = errors.join('; '); return; }
  const bd = isFresh() ? null : doorBindingDraft(info.opening, props.type ?? info.opening.type);
  if (bd?.error) { $('oErr').textContent = bd.error; return; }
  const bindingChanged = !!bd && !sameBinding(Ed.loc, bd.next, Ed.openingId);
  if (!Object.keys(props).length && !bindingChanged) { $('oErr').textContent = 'Nothing changed.'; return; }
  const r = Object.keys(props).length ? setOpening(Ed.model, Ed.levelId, Ed.openingId, props, opts()) : { model: Ed.model, report: { errors: [] } };
  if (r.report.errors.length) { $('oErr').textContent = r.report.errors.join('; '); return; }
  if (bindingChanged && !Ed.dry) Ed.loc = bd.next;                   // the sensor is stored with the house (Save), undone with the model
  commit(bindingChanged && r.model === Ed.model ? { ...Ed.model } : r.model);
  setStatus(`${Ed.openingId}: ${[...Object.keys(props), ...(bindingChanged ? ['sensor'] : [])].join(', ')} changed (not saved yet)`);
}
