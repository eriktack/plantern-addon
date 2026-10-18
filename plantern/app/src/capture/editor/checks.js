// Editor page: checks. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { modelAreas, fmtArea } from '../../geometry/area.js';
import { anchorStatus } from '../../model/anchors.js';
import { alignLevel, deleteAnchor, setCheck, deleteCheck } from '../../edit/ops.js';
import { startOptions } from '../start.js';
import { collectSnapPoints } from '../../tools/snap.js';
import { resolveSettings } from '../../model/settings.js';
import { checkRows, checkCorners } from '../../model/checks.js';
import { $, commit, esc, geosFor, level, opts } from './core.js';
import { goToLevel } from './levels.js';
import { nameOpts, refName, selectRoom } from './selection.js';
import { setStatus } from './session.js';
import { Ed } from './state.js';


/** The Floor areas section: every level's rooms and totals, and the interior total of the house. */
export function renderAreas() {
  const all = modelAreas(Ed.model, geosFor(Ed.model)), house = [...all.values()].reduce((s, a) => s + a.interior, 0);
  $('areaTotal').textContent = house ? `(${fmtArea(house)})` : '';
  $('areas').innerHTML = [...Ed.model.levels].sort((a, b) => b.elevation - a.elevation).map(lv => {
    const a = all.get(lv.id);
    if (!a.rooms.length) return '';
    const rows = a.rooms.map(r => {
      const parts = [...r.solids.map(s => `− ${s.id.replace(/^s_/, '')} ${fmtArea(s.area)}`), r.stairwell ? `− stairwell ${fmtArea(r.stairwell)}` : '', r.approx.length ? '(approximate)' : ''].filter(Boolean).join(' ');
      return `<div class="arow${lv.id === Ed.levelId && r.id === Ed.roomId ? ' sel' : ''}" data-aroom="${esc(lv.id)}|${esc(r.id)}"><span>${esc(r.name)}${r.exterior ? ' <small>outdoors</small>' : ''}${r.open ? ' <small>open to the level below</small>' : ''}${parts ? `<br><small>${esc(fmtArea(r.gross))} ${esc(parts)}</small>` : ''}</span><b>${r.open ? '–' : esc(fmtArea(r.net))}</b></div>`;
    }).join('');
    return `<div class="arow ahead"><span>${esc(lv.name || lv.id)}</span><span>${esc(fmtArea(a.interior))}${a.exterior ? ` <small>+ ${esc(fmtArea(a.exterior))} outdoors</small>` : ''}</span></div>${rows}`;
  }).join('') || '<small>No rooms yet.</small>';
  $('areas').querySelectorAll('[data-aroom]').forEach(el => (el.onclick = async () => {
    const [lv, id] = el.dataset.aroom.split('|');
    if (lv !== Ed.levelId && !(await goToLevel(lv))) return;
    selectRoom(id);
  }));
}

/** The Anchors section: each anchor with how far its levels are apart, and a way to line a level up. */
export function renderAnchors() {
  const list = anchorStatus(Ed.model, geosFor(Ed.model)), lvName = id => Ed.model.levels.find(l => l.id === id)?.name || id;
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
    const r = alignLevel(Ed.model, id, lv, opts());
    if (r.report.errors.length) { $('anErr').textContent = r.report.errors.join('; '); return; }
    $('anErr').textContent = '';
    commit(r.model);
    setStatus(`${lv} moved ${dir(r.delta)} (not saved yet)`);
  }));
  $('anchorList').querySelectorAll('[data-delanchor]').forEach(b => (b.onclick = () => { const r = deleteAnchor(Ed.model, b.dataset.delanchor); if (!r.report.errors.length) commit(r.model); }));
  const opts2 = startOptions(Ed.snapsAround, nameOpts()).filter(o => /^(r|s|w|st)_[^#]+#/.test(o.ref)).map(o => `<option value="${esc(o.ref)}">${esc(o.label)}</option>`).join('');
  for (const id of ['anA', 'anB']) { const keep = $(id).value; $(id).innerHTML = opts2; if (keep && [...$(id).options].some(o => o.value === keep)) $(id).value = keep; }
  if ($('anB').selectedIndex === $('anA').selectedIndex && $('anB').options.length > 1) $('anB').selectedIndex = $('anB').options.length - 1;
}

/** The Checks section: every check, worst first, with its place in the solve; a click shows it on the plan. */
export function renderChecks() {
  const geos = geosFor(Ed.model), index = new Map();
  for (const lv of Ed.model.levels) for (const s of collectSnapPoints(Ed.model, lv, geos.get(lv.id))) index.set(s.ref, { pos: s.pos, level: lv.id });
  const tol = resolveSettings(Ed.loc, level()).checkTolerance || { ok: 5, warn: 15 }, rows = checkRows(Ed.model.checks, ref => index.get(ref), tol);
  const rooms = Ed.model.levels.flatMap(l => l.rooms || []), off = rows.filter(r => r.cls !== 'ok').length;
  $('checkCount').textContent = rows.length ? `(${rows.length}${off ? `, ${off} off` : ''})` : '';
  const sign = v => `${v > 0 ? '+' : ''}${Math.round(v)}`;
  $('checkList').innerHTML = rows.map(r => {
    const c = r.check, k = checkCorners(c), room = k && rooms.find(x => x.id === k.room), can = room && checkCorners(c, room.polygon?.length) && room.capture?.mode === 'lengths';
    const solve = can || c.solve ? `<label class="inl" title="${can ? `Counts as one more diagonal when ${esc(room.name || room.id)} is solved` : 'Only a room measured by lengths and diagonals takes checks into its solve'}"><input type="checkbox" data-cksolve="${esc(c.id)}"${c.solve ? ' checked' : ''}${can || c.solve ? '' : ' disabled'}> in the solve</label>` : '';
    const what = r.broken ? `<span style="color:var(--bad)">a point is gone: ${esc(r.missing)}</span>` : `${Math.round(r.model)} / ${c.measured} <b class="${r.cls}">${sign(r.delta)}</b>`;
    return `<div class="arow" style="cursor:pointer" data-ck="${esc(c.id)}"><span><span class="dot ${r.cls}" style="display:inline-block;margin-right:6px"></span>${esc(refName(c.a))} ↔ ${esc(refName(c.b))}<br><small>${esc(c.note || c.id)}</small> ${solve}</span><span>${what} <button data-ckdel="${esc(c.id)}" title="Remove the check">×</button></span></div>`;
  }).join('') || '<small>None yet.</small>';
  $('checkList').querySelectorAll('[data-ck]').forEach(el => (el.onclick = async e => {
    if (e.target.closest('button, input, label')) return;
    const c = Ed.model.checks.find(x => x.id === el.dataset.ck), a = index.get(c.a), b = index.get(c.b);
    if (!a || !b) return;
    if (a.level !== Ed.levelId && !(await goToLevel(a.level))) return;
    Ed.measure.show({ ref: c.a, pos: a.pos }, { ref: c.b, pos: b.pos });
  }));
  const run = r => { if (r.report.errors.length) { $('ckErr').textContent = r.report.errors.join('; '); return; } $('ckErr').textContent = ''; commit(r.model); };
  $('checkList').querySelectorAll('[data-cksolve]').forEach(b => (b.onchange = () => run(setCheck(Ed.model, b.dataset.cksolve, { solve: b.checked }, opts()))));
  $('checkList').querySelectorAll('[data-ckdel]').forEach(b => (b.onclick = () => run(deleteCheck(Ed.model, b.dataset.ckdel, opts()))));
}
