// Editor page: panel-stairs. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { newStairsId, applyStairs } from '../../edit/ops.js';
import { totalRisers, stairLayout } from '../../geometry/stairs.js';
import { startOptions } from '../start.js';
import { outerOf, landingAfter, runOf, stepsOf } from '../stair-dims.js';
import { stairSketch } from '../stair-sketch.js';
import { parseNumbers } from '../edit.js';
import { dropFresh, enterEdit, mayLeave, setStatus, startFresh } from './session.js';
import { $, commit, esc, level, opts, room, stairs } from './core.js';
import { nameOpts, titleHtml } from './selection.js';
import { fillCopyInto } from './copy.js';
import { Ed } from './state.js';


/** + Stairs: a straight stair from the selected room's corner 0 up to the next level, to adjust in its panel. */
export async function newStairs() {
  if (!(await mayLeave())) return;
  if (!dropFresh()) return;
  const lv = level(), above = Ed.model.levels.filter(l => l.elevation > lv.elevation && (l.building ?? null) === (lv.building ?? null)).sort((a, b) => a.elevation - b.elevation)[0];
  if (!above) { setStatus('There is no level above this one: add one first (+ New level…)'); return; }
  const rm = Ed.shape === 'room' ? room() : null, at = rm || lv.rooms?.[0];
  if (!at) { setStatus('Add a room first: the stairs start at a corner of one'); return; }
  const risers = Math.max(2, Math.round((above.elevation - lv.elevation) / 180));
  const st = { id: newStairsId(Ed.model, 'stairs'), to: above.id, start: { ref: `${at.id}#p0`, offset: [300, 300] }, heading: 90, width: 900, flights: [{ risers, length: (risers - 1) * 250 }] };
  const r = applyStairs(Ed.model, Ed.levelId, st, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  const base = Ed.model;
  commit(r.model);
  enterEdit('stairs', st.id, { ask: false }); startFresh('stairs', st.id, base, 'stairs');
  setStatus(`${st.id} is new, at corner 0 of ${at.name || at.id}: set where it starts, which way it goes and how many risers, name it and Apply to create it`);
}

/** The stairs panel: where they start, the flights, the landing, the underside; what follows from it. */
export function showStairs() {
  const st = stairs();
  if (!st) { Ed.stairsId = null; $('stairsPanel').hidden = true; return; }
  const entry = Ed.curGeo?.stairs?.find(s => s.id === st.id), L = entry?.layout;
  $('stTitle').innerHTML = titleHtml(st);
  const toName = Ed.model.levels.find(l => l.id === st.to)?.name || st.to;
  $('stInfo').innerHTML = entry?.error ? `<span style="color:var(--bad)">${esc(entry.error)}</span>`
    : L ? `up ${entry.rise} mm to ${esc(toName)} in ${totalRisers(st)} risers of ${L.riser} mm; treads ${(() => { const d = L.depths.map(x => Math.round(x)); return d.length > 1 ? `${d.slice(0, -1).join(', ')} and ${d.at(-1)}` : d.join(''); })()} mm deep${st.flights.some(f => f.treads?.length) ? ` (measured: ${Math.round(Math.min(...L.treadDepths))}–${Math.round(Math.max(...L.treadDepths))})` : ''}${entry.opening.length ? '' : '; no opening in the floor above (it stays under the slab)'}` : '';
  if (Ed.stairsFormFor !== st) {
    const lv = level(), up = Ed.model.levels.filter(l => l.elevation > lv.elevation && (l.building ?? null) === (lv.building ?? null));
    $('stTo').innerHTML = up.map(l => `<option value="${esc(l.id)}">${esc(l.name || l.id)}</option>`).join('');
    $('stRef').innerHTML = '<option value="">a point on the plan (x, y)</option>' + startOptions(Ed.snapsAround, nameOpts()).map(o => `<option value="${esc(o.ref)}">${esc(o.label)}</option>`).join('');
    $('stTo').value = st.to;
    $('stRef').value = st.start?.ref ?? '';
    if (st.start?.ref && $('stRef').value !== st.start.ref) { $('stRef').insertAdjacentHTML('beforeend', `<option value="${esc(st.start.ref)}">${esc(st.start.ref)} (missing)</option>`); $('stRef').value = st.start.ref; }
    const off = st.start?.ref ? st.start.offset ?? [0, 0] : st.start?.pos ?? [0, 0];
    $('stOx').value = off[0]; $('stOy').value = off[1];
    $('stHead').value = st.heading; $('stWidth').value = st.width;
    const fl = st.flights;
    $('stShape').value = String(Math.min(Math.max(fl.length, 1), 3));
    [1, 2, 3].forEach(k => { const f = fl[k - 1]; $(`stR${k}`).value = f?.risers ?? ''; $(`stL${k}`).value = Number.isFinite(f?.length) ? Math.round(outerOf(f.length, landingAfter(fl, k - 1, st.width))) : ''; $(`stT${k}`).value = (f?.treads || []).join(', '); $(`stW${k}`).value = f?.width ?? ''; });
    $('stTurn').value = st.turn ?? 'L'; $('stLanding').value = st.landing ?? 'square'; $('stWinders').value = st.winders ?? 3;
    $('stPivX').value = st.winderPivot?.[0] ?? ''; $('stPivY').value = st.winderPivot?.[1] ?? '';
    $('stUnder').value = st.underside ?? 'closed'; $('stSides').value = st.sides ?? 'stepped'; $('stWaist').value = st.waist ?? '';
    $('stRail').value = st.handrail ?? 'none'; $('stRailH').value = st.handrailHeight ?? '';
    $('stRailMount').value = st.handrailMount ?? ''; $('stRailD').value = st.handrailDiameter ?? ''; $('stRailS').value = st.handrailStart ?? ''; $('stRailE').value = st.handrailEnd ?? '';
    $('stIgnore').checked = st.ignoreDepthWarning === true;
    $('stEdgeOk').checked = st.ignoreEdgeWarning === true;
    const rc = st.openingRect;
    $('stOpenOn').checked = !!rc;
    ['stRx1', 'stRy1', 'stRx2', 'stRy2'].forEach((id, i) => { $(id).value = rc ? (i < 2 ? rc.from[i] : rc.to[i - 2]) : ''; });
    $('stName').value = st.name ?? ''; $('stErr').textContent = ''; Ed.stairsFormFor = st;
    fillCopyInto('stairs', st);
  }
  syncStairsRows();
}
/** A number typed in a field: a minus sign may be the typographic one (−), and a decimal comma is accepted (NaN when empty or not a number). */
export const numOf = id => { const t = String($(id).value).trim().replace(/[−–]/g, '-').replace(',', '.'); return t === '' ? NaN : Number(t); };
/** The stair as the panel's fields say it now, for the sketch: { layout, outer } or null when it does not work out (proposal 2026-10-13). */
function stairsPreview() {
  const n = Number($('stShape').value), num = numOf, W = num('stWidth');
  const flights = [], outer = [];
  for (let k = 1; k <= n; k++) {
    const w = num(`stW${k}`);
    flights.push({ risers: num(`stR${k}`), ...(Number.isFinite(w) ? { width: w } : {}) });
    outer.push(num(`stL${k}`));
  }
  if (!Number.isFinite(W) || flights.some(f => !Number.isFinite(f.risers) || f.risers < 1) || outer.some(o => !Number.isFinite(o))) return null;
  const runs = flights.map((f, k) => runOf(outer[k], landingAfter(flights, k, W)));
  if (runs.some(r => !(r > 0))) return null;
  flights.forEach((f, k) => { f.length = runs[k]; });
  // the winder pivot as typed (an empty box is 0; a box that is not a number leaves the pivot at the inside corner)
  const px = $('stPivX').value.trim() === '' ? 0 : num('stPivX'), py = $('stPivY').value.trim() === '' ? 0 : num('stPivY');
  const winderPivot = ($('stPivX').value.trim() !== '' || $('stPivY').value.trim() !== '') && Number.isFinite(px) && Number.isFinite(py) ? [px, py] : undefined;
  const layout = stairLayout({ heading: 0, width: W, flights, turn: $('stTurn').value, landing: $('stLanding').value, winders: num('stWinders'), ...(winderPivot ? { winderPivot } : {}) }, [0, 0], 2750);
  if (layout?.error) return { error: layout.error };            // the panel says why the stair would not be drawn
  return layout ? { layout, outer } : null;
}
/** The panel's hints: the steps of each flight (risers − 1) and the sketch, both from the fields as they are now. */
export function updateStairsHints() {
  const risers = [1, 2, 3].map(k => Number($(`stR${k}`).value));
  [1, 2, 3].forEach(k => { $(`stSteps${k}`).textContent = Number.isFinite(risers[k - 1]) && risers[k - 1] >= 1 ? `${stepsOf(risers[k - 1])} steps` : '–'; });
  // the sketch is drawn when a value in the panel has changed, not on every fill: the same values draw the same sketch
  const key = [...$('stairsPanel').querySelectorAll('input, select')].map(e => (e.type === 'checkbox' ? (e.checked ? 1 : 0) : e.value)).join('|');
  if (key === Ed.sketchKey) return;
  Ed.sketchKey = key;
  const prev = stairsPreview();
  $('stSketch').hidden = !prev?.layout;
  $('stSketch').innerHTML = prev?.layout ? stairSketch(prev.layout, prev.outer, { width: 300 }) : '';
  // a pivot that makes the stair impossible is explained here, as it is typed (the stair is not drawn on the plan until it is fixed)
  $('stPivHint').textContent = prev?.error ? `This pivot cannot be used: ${prev.error}.` : '';
}
export function syncStairsRows() {
  const n = Number($('stShape').value), ref = $('stRef').value;
  $('stTwoRows').hidden = $('stT2Row').hidden = $('stTurnRows').hidden = n < 2;
  $('stThreeRows').hidden = $('stT3Row').hidden = n < 3;
  $('stWindersRow').hidden = n < 2 || $('stLanding').value !== 'winders';
  $('stPivotRow').hidden = $('stWindersRow').hidden;
  $('stWaistRow').hidden = $('stUnder').value !== 'sloped';
  const railOn = $('stRail').value !== 'none', roundRail = railOn && $('stRailMount').value !== '';
  $('stRailHRow').hidden = $('stRailMountRow').hidden = !railOn;
  $('stRailDRow').hidden = $('stRailSRow').hidden = $('stRailERow').hidden = !roundRail;
  $('stOpenRow').hidden = !$('stOpenOn').checked;
  $('stOxLbl').textContent = ref ? 'x offset' : 'x'; $('stOyLbl').textContent = ref ? 'y offset' : 'y';
  updateStairsHints();
}
/** The reset button of the pivot: both boxes empty, so the pivot is the inside corner again (Apply stores it). */
export function resetWinderPivot() {
  $('stPivX').value = ''; $('stPivY').value = '';
  updateStairsHints();
}
export function applyStairsForm() {
  const st = stairs(), num = numOf, n = Number($('stShape').value), two = n > 1, ref = $('stRef').value;
  const flights = [];
  const outers = [];   // the outer length typed for each flight; the run the model keeps is worked out from it below
  for (let k = 1; k <= n; k++) {
    const f = { risers: num(`stR${k}`) }, tr = parseNumbers($(`stT${k}`).value);
    if ($(`stW${k}`).value.trim() !== '') f.width = num(`stW${k}`);             // its own width, else the stair's (fixes list 3)
    if (tr.errors.length) { $('stErr').textContent = `Flight ${k} treads: ${tr.errors.join('; ')}`; return; }
    const o = $(`stL${k}`).value.trim() === '' ? undefined : num(`stL${k}`);
    if (tr.values.length) { f.treads = tr.values; outers[k - 1] = o; }   // the outer length too: a check on the treads
    else outers[k - 1] = o ?? null;
    flights.push(f);
  }
  const next = { ...st, to: $('stTo').value, heading: num('stHead'), width: num('stWidth'), flights, start: ref ? { ref, offset: [num('stOx') || 0, num('stOy') || 0] } : { pos: [num('stOx'), num('stOy')] } };
  flights.forEach((f, k) => {                                     // the run the model keeps: the outer length without the landing after the flight
    const o = outers[k];
    if (o === undefined) return;
    f.length = o === null ? 0 : runOf(o, landingAfter(flights, k, next.width));
  });
  delete next.turn; delete next.landing; delete next.winders; delete next.underside; delete next.sides; delete next.waist; delete next.handrail; delete next.handrailHeight; delete next.handrailMount; delete next.handrailDiameter; delete next.handrailStart; delete next.handrailEnd; delete next.ignoreDepthWarning; delete next.ignoreEdgeWarning; delete next.openingRect;
  if (two) { next.turn = $('stTurn').value; next.landing = $('stLanding').value; if (next.landing === 'winders') next.winders = num('stWinders'); }
  // the winder pivot (W3): both boxes filled, else the inside corner (none stored)
  delete next.winderPivot;
  if (two && next.landing === 'winders' && ($('stPivX').value.trim() !== '' || $('stPivY').value.trim() !== '')) {
    const px = $('stPivX').value.trim() === '' ? 0 : num('stPivX'), py = $('stPivY').value.trim() === '' ? 0 : num('stPivY');
    if (!Number.isFinite(px) || !Number.isFinite(py)) { $('stErr').textContent = 'The pivot: x and y must be numbers in mm'; return; }
    next.winderPivot = [px, py];
  }
  if ($('stUnder').value !== 'closed') next.underside = $('stUnder').value;
  if ($('stSides').value === 'sloped') next.sides = 'sloped';
  if ($('stRail').value !== 'none') {
    next.handrail = $('stRail').value;
    if ($('stRailH').value.trim() !== '') next.handrailHeight = num('stRailH');
    if ($('stRailMount').value !== '') {                          // a round rail on poles or on the wall (stair-handrails plan); empty = the square bar
      next.handrailMount = $('stRailMount').value;
      for (const [id, key] of [['stRailD', 'handrailDiameter'], ['stRailS', 'handrailStart'], ['stRailE', 'handrailEnd']]) if ($(id).value.trim() !== '') next[key] = num(id);
    }
  }
  if ($('stUnder').value === 'sloped' && $('stWaist').value.trim() !== '') next.waist = num('stWaist');
  if ($('stIgnore').checked) next.ignoreDepthWarning = true;      // the steps were checked (fixes list 28)
  if ($('stEdgeOk').checked) next.ignoreEdgeWarning = true;       // an opening past the rooms' edge is fine (cut there)
  if ($('stOpenOn').checked) {                                    // only a rectangle of the hole opens (fixes list 8)
    const c = ['stRx1', 'stRy1', 'stRx2', 'stRy2'].map(num);
    if (c.some(v => !Number.isFinite(v))) { $('stErr').textContent = 'The opening rectangle needs four numbers in mm (two corners).'; return; }
    next.openingRect = { from: [c[0], c[1]], to: [c[2], c[3]] };
  }
  next.name = $('stName').value.trim() || null;                 // empty: no name (applyStairs drops it)
  if ([next.heading, next.width, ...flights.map(f => f.risers)].some(v => !Number.isFinite(v))) { $('stErr').textContent = 'Direction, width and risers must be numbers.'; return; }
  const r = applyStairs(Ed.model, Ed.levelId, next, opts());
  if (r.report.errors.length) { $('stErr').textContent = r.report.errors.join('; '); return; }
  $('stErr').textContent = '';
  commit(r.model);
  setStatus(`${st.id} changed (not saved yet)`);
}
