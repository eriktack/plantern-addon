// "New level" form, shared by the Editor and the wizard. DOM wiring only: the level itself is made
// by addLevel() (src/edit/ops.js).

import { addLevel, setLevel, setDatum, deleteLevel, newLevelId, DEFAULT_CEILING, DEFAULT_FLOOR_THICKNESS } from '../edit/ops.js';
import { levelLabel } from '../model/names.js';
import { askConfirm } from './dialog.js';
import { describeElevationFrom } from '../model/elevation.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Render the form into `box` and show it. onCreate(result) gets addLevel()'s { model, report, level };
 * onCancel() is offered unless this is the first level (a house needs one before anything else).
 * cls = { label, input, button, go } CSS classes of the host page.
 */
export function showLevelForm(box, model, { onCreate, onCancel, cls = {} }) {
  const first = !model.levels.length;
  const top = [...model.levels].sort((a, b) => b.elevation - a.elevation)[0];
  const L = cls.label ? ` class="${cls.label}"` : '', I = cls.input ? ` class="${cls.input}"` : '';
  box.innerHTML = `
    <h2>${first ? 'Create the first level' : 'New level'}</h2>
    <p class="help">${first
      ? 'This house has no levels yet. Start with the floor you measure first (usually the ground floor): it is the datum, elevation 0. Leave a height empty if you have not measured it; the default is used and listed as still to measure.'
      : 'Leave a value empty to use the default (listed as still to measure). A level on top of (or under, or level with) another follows it: when that one\'s ceiling or floor changes, this one moves along.'}</p>
    <label${L}>Name<input${I} data-f="name" value="${first ? 'Ground floor' : ''}" autocomplete="off"></label>
    <label${L}>Id <small>used in references; letters, digits, _</small><input${I} data-f="id" autocomplete="off" spellcheck="false"></label>
    <label${L}>Ceiling height <small>mm, finished floor to ceiling; empty = ${DEFAULT_CEILING}</small><input${I} data-f="ceilingHeight" inputmode="numeric" autocomplete="off"></label>
    <label${L}>Floor build-up <small>mm below this floor (finish, slab or joists, ceiling below); empty = ${DEFAULT_FLOOR_THICKNESS}</small><input${I} data-f="floorThickness" inputmode="numeric" autocomplete="off"></label>
    ${first ? '' : `<label${L}>Its floor is <select${I} data-f="mode"><option value="above">on top of</option><option value="below">under</option><option value="same">level with (a part of that floor)</option><option value="">at an elevation I type</option></select></label>
    <label${L} data-f="refRow">…this level <select${I} data-f="ref">${[...model.levels].sort((a, b) => b.elevation - a.elevation).map(l => `<option value="${esc(l.id)}">${esc(levelLabel(l))}</option>`).join('')}</select></label>
    <label${L} data-f="offRow">Offset <small>mm up (− down) from there, e.g. a step; empty = 0</small><input${I} data-f="offset" inputmode="numeric" autocomplete="off"></label>
    <label${L} data-f="elevRow" style="display:none">Elevation <small>mm, this floor above the ground floor (negative = basement)</small><input${I} data-f="elevation" inputmode="numeric" autocomplete="off"></label>`}
    <div class="err" data-f="err" style="color:var(--bad);font-size:13px;min-height:18px"></div>
    <div class="row btns">
      <button data-f="create" class="${cls.go || ''}">Create level</button>
      ${first ? '' : `<button data-f="cancel" class="${cls.button || ''}">Cancel</button>`}
    </div>`;
  const f = k => box.querySelector(`[data-f="${k}"]`);
  let idTouched = false;
  const syncId = () => { if (!idTouched) f('id').value = newLevelId(model, f('name').value); };
  f('name').addEventListener('input', syncId);
  f('id').addEventListener('input', () => { idTouched = true; });
  syncId();
  if (!first) {
    f('ref').value = top.id;                         // on top of the highest level, to start with
    f('mode').onchange = () => { const typed = f('mode').value === '', show = (k, on) => { f(k).style.display = on ? '' : 'none'; }; show('elevRow', typed); show('refRow', !typed); show('offRow', !typed); };   // style, not hidden: the pages' label rules would win
  }
  f('create').onclick = () => {
    const spec = { name: f('name').value, id: f('id').value.trim() || undefined };
    for (const k of ['ceilingHeight', 'floorThickness']) { const t = f(k)?.value.trim(); if (t) spec[k] = t; }
    if (!first && f('mode').value) spec.elevationFrom = { level: f('ref').value, relation: f('mode').value, offset: f('offset').value.trim() || 0 };
    else if (!first && f('elevation').value.trim()) spec.elevation = f('elevation').value.trim();
    const r = addLevel(model, spec);
    if (r.report.errors.length) { f('err').textContent = r.report.errors.join('; '); return; }
    box.hidden = true;
    onCreate(r);
  };
  if (!first) f('cancel').onclick = () => { box.hidden = true; onCancel?.(); };
  box.hidden = false;
  f('name').focus();
}

/**
 * Edit a level: name, elevation, ceiling height, floor build-up and what was measured (ceiling height, floor to the floor
 * above). onApply(result) gets setLevel()'s { model, report }; onDelete(result) deleteLevel()'s (offered while the level
 * is empty). Values the level only has as defaults say so. cls as for showLevelForm().
 */
export function showLevelEditForm(box, model, levelId, { onApply, onDelete, onClose, cls = {} }) {
  const lv = model.levels.find(l => l.id === levelId);
  if (!lv) return;
  const L = cls.label ? ` class="${cls.label}"` : '', I = cls.input ? ` class="${cls.input}"` : '';
  const datum = lv.elevation === 0, guess = k => (lv.assumed || []).includes(k) ? ' · still a default' : '';
  const above = [...model.levels].sort((a, b) => a.elevation - b.elevation).find(l => l.elevation > lv.elevation);
  const empty = !['rooms', 'walls', 'openings', 'solids', 'objects', 'fixtures', 'stairs'].some(c => (lv[c] || []).length);
  const others = model.levels.filter(l => l.id !== levelId).sort((a, b) => b.elevation - a.elevation), followers = model.levels.filter(l => l.elevationFrom?.level === levelId);
  box.innerHTML = `
    <h2>Level <small>${esc(lv.id)}</small></h2>
    <label${L}>Name<input${I} data-f="name" value="${esc(lv.name || '')}" autocomplete="off"></label>
    ${datum ? `<label${L}>Elevation <small>mm; the datum: stays 0, the other levels are measured from it. Started with the basement? Open the ground floor and use <i>Make this the ground floor</i>: this one then hangs under it.</small><input${I} data-f="elevation" inputmode="numeric" value="${lv.elevation}" disabled autocomplete="off"></label>` : `
    <label${L}>Its floor is <select${I} data-f="mode"><option value="above">on top of</option><option value="below">under</option><option value="same">level with (a part of that floor)</option><option value="">at an elevation I type</option></select></label>
    <label${L} data-f="refRow">…this level <select${I} data-f="ref">${others.map(l => `<option value="${esc(l.id)}">${esc(levelLabel(l))}</option>`).join('')}</select></label>
    <label${L} data-f="offRow">Offset <small>mm up (− down) from there, e.g. a step; empty = 0</small><input${I} data-f="offset" inputmode="numeric" value="${lv.elevationFrom?.offset ?? ''}" autocomplete="off"></label>
    <label${L} data-f="elevRow">Elevation <small>mm, this floor above the ground floor (negative = basement)${guess('elevation')}</small><input${I} data-f="elevation" inputmode="numeric" value="${lv.elevation}" autocomplete="off"></label>`}
    ${followers.length ? `<p class="help">Following this level: ${followers.map(l => `${esc(l.name || l.id)} (${esc(describeElevationFrom(model, l))})`).join(', ')}; they move with it.</p>` : ''}
    <label${L}>Ceiling height <small>mm, finished floor to ceiling${guess('ceilingHeight')}</small><input${I} data-f="ceilingHeight" inputmode="numeric" value="${lv.ceilingHeight ?? ''}" autocomplete="off"></label>
    <label${L}>Floor build-up <small>mm below this floor (finish, slab or joists, ceiling below)${guess('floorThickness')}</small><input${I} data-f="floorThickness" inputmode="numeric" value="${lv.floorThickness ?? ''}" autocomplete="off"></label>
    <p class="help">Measured heights (optional): they are what the heights are checked against.${above ? ` With the floor-to-floor, ${esc(above.name || above.id)} should be at ${lv.elevation} + that.` : ''}</p>
    <label${L}>Measured ceiling height <small>mm</small><input${I} data-f="capCeiling" inputmode="numeric" value="${lv.capture?.ceilingHeight ?? ''}" autocomplete="off"></label>
    <label${L}>Measured floor to the floor above <small>mm, in the stairwell</small><input${I} data-f="capFloor" inputmode="numeric" value="${lv.capture?.floorToFloor ?? ''}" autocomplete="off"></label>
    <div class="help" data-f="out"></div>
    <div class="err" data-f="err" style="color:var(--bad);font-size:13px;min-height:18px"></div>
    <div class="row btns">
      <button data-f="apply" class="${cls.go || ''}">Apply</button>
      <button data-f="close" class="${cls.button || ''}">Close</button>
      ${datum ? '' : `<button data-f="datum" class="${cls.button || ''}" title="This floor becomes elevation 0 and every level moves by the same amount; a level it was on top of (a basement created first) then hangs under it">Make this the ground floor (elevation 0)</button>`}
      ${empty && model.levels.length > 1 ? `<button data-f="delete" class="${cls.button || ''}" title="Only an empty level can be deleted">Delete level</button>` : ''}
    </div>`;
  const f = k => box.querySelector(`[data-f="${k}"]`), val = k => f(k)?.value.trim() ?? '';
  const show = (k, on) => { if (f(k)) f(k).style.display = on ? '' : 'none'; };   // style, not hidden: the pages' label rules would win
  if (!datum) {
    // not following yet: offered as on top of the level just below (the usual case); the typed number stays until changed
    const below = others.filter(l => l.elevation < lv.elevation)[0];
    f('mode').value = lv.elevationFrom?.relation ?? ''; f('ref').value = lv.elevationFrom?.level ?? below?.id ?? others[0]?.id ?? '';
  }
  const where = () => {
    if (datum) return {};
    if (f('mode').value) {
      const from = { level: f('ref').value, relation: f('mode').value, offset: val('offset') === '' ? 0 : Number(val('offset')) }, was = lv.elevationFrom;
      return !was || was.level !== from.level || was.relation !== from.relation || (was.offset ?? 0) !== from.offset ? { elevationFrom: from } : {};
    }
    return lv.elevationFrom || val('elevation') !== String(lv.elevation) ? { elevation: val('elevation') } : {};
  };
  // which rows apply, and what Apply would move (this level and the ones that follow it)
  const preview = () => {
    if (!datum) { const typed = !f('mode').value; show('elevRow', typed); show('refRow', !typed); show('offRow', !typed); }
    const props = where();
    for (const k of ['ceilingHeight', 'floorThickness']) if (val(k) !== '' && val(k) !== String(lv[k] ?? '')) props[k] = val(k);
    if (!Object.keys(props).length) { f('out').textContent = ''; return; }
    const r = setLevel(model, levelId, props), nm = id => model.levels.find(l => l.id === id)?.name || id;
    f('out').innerHTML = r.report.errors.length ? `<span style="color:var(--bad)">${esc(r.report.errors.join('; '))}</span>`
      : r.report.moved.length ? `Apply moves: ${r.report.moved.map(m => `${esc(nm(m.level))} ${m.from} → ${m.to} mm`).join(', ')}.`
        : `No floor moves.${lv.capture?.floorToFloor && followers.some(l => l.elevationFrom.relation === 'above') ? ` The level on top keeps the measured floor-to-floor (${lv.capture.floorToFloor} mm): change that measurement below to move it.` : ''}`;
  };
  box.querySelectorAll('input, select').forEach(el => { el.addEventListener('input', preview); el.addEventListener('change', preview); });
  preview();
  f('apply').onclick = async () => {
    const props = { name: val('name'), ...where() }, cap = {};
    for (const k of ['ceilingHeight', 'floorThickness']) if (val(k) !== String(lv[k] ?? '') || (lv.assumed || []).includes(k) && val(k) !== '') props[k] = val(k);
    if (props.ceilingHeight === '' || props.floorThickness === '') { f('err').textContent = 'Ceiling height and floor build-up need a value.'; return; }
    for (const [fk, ck] of [['capCeiling', 'ceilingHeight'], ['capFloor', 'floorToFloor']]) if (val(fk) !== String(lv.capture?.[ck] ?? '')) cap[ck] = val(fk) === '' ? null : val(fk);
    if (Object.keys(cap).length) props.capture = cap;
    const r = setLevel(model, levelId, props);
    if (r.report.errors.length) { f('err').textContent = r.report.errors.join('; '); return; }
    f('err').textContent = '';
    onApply(r);
  };
  f('close').onclick = () => { box.hidden = true; onClose?.(); };
  if (f('datum')) f('datum').onclick = async () => {
    const r = setDatum(model, levelId), nm = id => model.levels.find(l => l.id === id)?.name || id;
    if (r.report.errors.length) { f('err').textContent = r.report.errors.join('; '); return; }
    const lines = [`${lv.name || levelId} becomes elevation 0: every level moves ${Math.abs(r.report.shift)} mm ${r.report.shift < 0 ? 'down' : 'up'} (nothing changes height against the others).`,
      ...r.report.flipped.map(x => `${nm(x.level)} now hangs ${{ above: 'on top of', below: 'under', same: 'level with' }[x.relation]} ${nm(x.follows)}.`)];
    if (!(await askConfirm([...lines, 'Go ahead?'].join('\n\n'), { ok: 'Go ahead' }))) return;
    onApply({ ...r, report: { ...r.report, moved: [] } });
  };
  if (f('delete')) f('delete').onclick = async () => {
    const r = deleteLevel(model, levelId);
    if (r.report.errors.length) { f('err').textContent = r.report.errors.join('; '); return; }
    if (!(await askConfirm(`Delete the empty level ${lv.name || lv.id}?`, { ok: 'Delete' }))) return;
    box.hidden = true;
    onDelete(r);
  };
  box.hidden = false;
}
