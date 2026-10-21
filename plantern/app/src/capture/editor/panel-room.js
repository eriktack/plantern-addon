// Editor page: panel-room. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { wallName } from '../labels.js';
import { crossWall, roundToForm, roundCapture } from '../round.js';
import { tableFromForm, emptyRow, formFromTable } from '../wall-table.js';
import { resolveSettings } from '../../model/settings.js';
import { toSvg } from '../../render2d/coords.js';
import { solveCapture } from '../solve.js';
import { buildCapture, residualCells, lockOffers, describeLockOffer } from '../edit.js';
import { roundDeg, bearingFromHeading, northAngleOf } from '../../model/orientation.js';
import { solveExtra } from '../../model/checks.js';
import { overlapsAfterApply, findOverlaps, describeOverlaps } from '../overlap.js';
import { $, FIELDS, P, esc, geosFor, level, opts, room } from './core.js';
import { showEditBar } from './session.js';
import { draw, drawCurRoomOnly } from './plan-draw.js';
import { Ed } from './state.js';


// ---- a round pillar (capture mode "circle"): diameter, the room it stands in and two walls, or its middle ----
export const isRound = () => Ed.shape === 'solid' && $('sShape').value === 'round';
export const roundForm = () => ({ diameter: $('rDia').value, room: $('rRoom').value, edgeA: Number($('rWA').value), distA: $('rDA').value, edgeB: Number($('rWB').value), distB: $('rDB').value, x: $('rX').value, y: $('rY').value });
export function fillRoundWalls(a, b) {
  const room = (level().rooms || []).find(r => r.id === $('rRoom').value);
  const opts = room ? room.polygon.map((p, i) => { const q = room.polygon[(i + 1) % room.polygon.length]; return `<option value="${i}">${wallName(i)} · ${Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]))} mm</option>`; }).join('') : '';
  $('rWA').innerHTML = opts; $('rWB').innerHTML = opts;
  if (room) { $('rWA').value = String(a ?? 0); $('rWB').value = String(b ?? crossWall(room, Number($('rWA').value))); }
}
export function loadRound(capture) {
  const rooms = (level().rooms || []).filter(r => r.polygon?.length >= 3), f = roundToForm(capture);
  $('rRoom').innerHTML = '<option value="">no room: type its middle</option>' + rooms.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)}</option>`).join('');
  if (!capture) f.room = rooms[0]?.id ?? '';
  if (f.room && !rooms.some(r => r.id === f.room)) $('rRoom').insertAdjacentHTML('beforeend', `<option value="${esc(f.room)}">${esc(f.room)} (missing)</option>`);
  $('rRoom').value = f.room;
  fillRoundWalls(capture ? f.edgeA : undefined, capture ? f.edgeB : undefined);
  $('rDia').value = f.diameter; $('rDA').value = f.distA; $('rDB').value = f.distB; $('rX').value = f.x; $('rY').value = f.y;
  syncRound();
}
export function syncRound() {
  const round = isRound(), byWalls = !!$('rRoom').value;
  $('roundBox').hidden = !round; $('polyBox').hidden = round; $('fromPoly').hidden = round;
  document.querySelectorAll('#roundBox .rWalls').forEach(el => (el.hidden = !byWalls));
  document.querySelectorAll('#roundBox .rXY').forEach(el => (el.hidden = byWalls));
}

function currentForm() {
  const form = {};
  FIELDS.forEach(f => (form[f] = $(f).value));
  return form;
}
const WT_TEXT = ['lengths', 'turns', 'corners', 'derived', 'exact', 'exactCorners', 'locks', 'checks', 'diagonals'];
/** Draw the table: from the text fields (fromForm), or from its own rows (after a change made in it: empty rows stay). */
function renderWallTable(fromForm = true) {
  const box = $('wallTable');
  if (!box) return;
  box.hidden = isRound();
  if (box.hidden) return;
  const form = Object.fromEntries(WT_TEXT.map(k => [k, $(k).value])), t = fromForm || !Ed.wt ? tableFromForm(form) : { rows: Ed.wt.rows, diagonals: Ed.wt.diagonals, errors: [] }, mode = $('mode').value;
  Ed.wt = { rows: t.rows.length ? t.rows : [emptyRow(), emptyRow(), emptyRow(), emptyRow()], diagonals: t.diagonals };
  const cornerHead = mode === 'rectilinear' ? '<th title="The corner the wall starts from (corner 0 for wall A): R a normal corner, L an inside corner (walking with the room on your right)">Corner</th>' : mode === 'traverse' ? '<th title="Interior angle at the corner the wall starts from (corner 0 for wall A), degrees">Angle °</th>' : '';
  const lockHead = mode === 'lengths' ? '' : '<th title="Lock the wall to lie exactly along x or y">Lock</th>';
  const exactCornerHead = mode === 'lengths' ? '' : '<th title="The angle of this corner is exact: it is kept and the other corners and the lengths take the closing gap (at least two corners must stay free when walls are locked)">Exact °</th>';
  const row = (r, i) => `<tr data-i="${i}"><td class="wl">${wallName(i)}</td>`
    + `<td><input data-f="length" inputmode="decimal" autocomplete="off" value="${esc(r.length)}" aria-label="Wall ${wallName(i)} length"></td>`
    + (mode === 'rectilinear' ? `<td><button type="button" data-f="turn" class="tg${r.turn === 'L' ? ' on' : ''}" title="R: normal corner · L: inside corner">${r.turn || 'R'}</button></td>` : mode === 'traverse' ? `<td><input data-f="corner" inputmode="decimal" autocomplete="off" placeholder="90" value="${esc(r.corner)}"></td>` : '')
    + (mode === 'lengths' ? '' : `<td><input type="checkbox" data-f="exactCorner"${r.exactCorner ? ' checked' : ''} title="Corner ${i}'s angle is exact" aria-label="Corner ${i} exact"></td>`)
    + `<td><input type="checkbox" data-f="derived"${r.derived ? ' checked' : ''} title="Worked out, not measured"></td>`
    + `<td><input type="checkbox" data-f="exact"${r.exact ? ' checked' : ''} title="Exact: takes none of the closing gap"></td>`
    + (mode === 'lengths' ? '' : `<td><button type="button" data-f="lock" class="tg${r.lock ? ' on' : ''}" title="Lock it along an axis: none, x, y">${r.lock || '—'}</button></td>`)
    + `<td><input data-f="replaced" inputmode="numeric" autocomplete="off" placeholder="—" value="${esc(r.replaced)}" title="A length measured but replaced by a worked-out one (kept as a check)"></td>`
    + `<td class="res" data-res="${i}"></td></tr>`;
  const n = Ed.wt.rows.length, corner = (v, f) => `<select data-d="${f}" data-native>${Array.from({ length: n }, (_, k) => `<option value="${k}"${k === v ? ' selected' : ''}>${k}</option>`).join('')}</select>`;
  box.innerHTML = (t.errors.length ? `<div class="iss">The text below has something the table cannot show: ${esc(t.errors[0])}. Fix it there.</div>` : '')
    + `<table class="wt"><thead><tr><th>Wall</th><th>Length <small>mm</small></th>${cornerHead}${exactCornerHead}<th title="Worked out, not measured">Worked out</th><th title="Exact: takes none of the closing gap">Exact</th>${lockHead}<th title="Measured, replaced by a worked-out length">Replaced</th><th title="Solved minus measured">Δ</th></tr></thead><tbody>${Ed.wt.rows.map(row).join('')}</tbody></table>`
    + `<div class="row btns"><button type="button" data-act="add">+ Wall</button><button type="button" data-act="remove"${n ? '' : ' disabled'}>− Last wall</button><button type="button" data-act="diag">+ Diagonal</button></div>`
    + (Ed.wt.diagonals.length ? `<table class="wt diag"><thead><tr><th>Diagonal from corner</th><th>to corner</th><th>Length <small>mm</small></th><th></th><th>Δ</th></tr></thead><tbody>${Ed.wt.diagonals.map((d, j) => `<tr data-j="${j}"><td>${corner(d.a, 'a')}</td><td>${corner(d.b, 'b')}</td><td><input data-d="length" inputmode="decimal" autocomplete="off" value="${esc(d.length)}"></td><td><button type="button" data-act="undiag" title="Remove this diagonal">×</button></td><td class="res" data-dres="${j}"></td></tr>`).join('')}</tbody></table>` : '');
  if (t.errors.length) $('asText').open = true;
  updateWallTableResiduals();
}
function writeWallTable() {
  const f = formFromTable(Ed.wt.rows, Ed.wt.diagonals);
  for (const k of WT_TEXT) $(k).value = f[k];
  Ed.tableWriting = true;
  try { recompute(); } finally { Ed.tableWriting = false; }
  showEditBar();
}
/** The Δ column: each wall's solved length minus the measured one, coloured by the check tolerances. */
function updateWallTableResiduals() {
  const box = $('wallTable');
  if (!box || !Ed.wt) return;
  const tol = resolveSettings(Ed.loc, level()).checkTolerance || { ok: 5, warn: 15 }, s = Ed.solved;
  const cls = v => (Math.abs(v) <= tol.ok ? 'ok' : Math.abs(v) <= tol.warn ? 'warn' : 'bad');
  box.querySelectorAll('[data-res]').forEach(td => { const r = s?.ok && s.residuals.find(x => x.kind === 'edge' && x.a === Number(td.dataset.res)); td.innerHTML = r ? `<b class="${cls(r.residual)}">${r.residual > 0 ? '+' : ''}${Math.round(r.residual * 10) / 10}</b>` : ''; });
  box.querySelectorAll('[data-dres]').forEach(td => { const d = Ed.wt.diagonals[Number(td.dataset.dres)], r = d && s?.ok && s.residuals.find(x => x.kind === 'diagonal' && x.a === d.a && x.b === d.b); td.innerHTML = r ? `<b class="${cls(r.residual)}">${r.residual > 0 ? '+' : ''}${Math.round(r.residual * 10) / 10}</b>` : ''; });
}
/** The wall of the row being typed in, marked on the plan. */
function markTableWall(i) {
  const svg = $('preview');
  svg.querySelector('#wtMark')?.remove();
  const poly = Ed.solved?.ok && Ed.solved.polygon;
  if (i === null || !poly?.[i]) return;
  const [x1, y1] = toSvg(poly[i]), [x2, y2] = toSvg(poly[(i + 1) % poly.length]);
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'wtMark'; g.setAttribute('pointer-events', 'none');
  g.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4cc38a" stroke-width="${Ed.planFs / 2.5}" stroke-linecap="round" opacity="0.8"/>`;
  svg.appendChild(g);
}
export function wireWallTable() {
  const box = $('wallTable');
  box.addEventListener('input', e => {
    const el = e.target, tr = el.closest('tr');
    if (!Ed.wt || !tr) return;
    if (el.dataset.f && tr.dataset.i !== undefined) Ed.wt.rows[Number(tr.dataset.i)][el.dataset.f] = el.value;
    else if (el.dataset.d === 'length') Ed.wt.diagonals[Number(tr.dataset.j)].length = el.value;
    else return;
    writeWallTable();
  });
  box.addEventListener('change', e => {
    const el = e.target, tr = el.closest('tr');
    if (!Ed.wt || !tr) return;
    if (el.type === 'checkbox') { const r = Ed.wt.rows[Number(tr.dataset.i)]; r[el.dataset.f] = el.checked; if (el.dataset.f === 'exact' && el.checked) r.derived = false; if (el.dataset.f === 'derived' && el.checked) r.exact = false; writeWallTable(); renderWallTable(false); }
    else if (el.dataset.d === 'a' || el.dataset.d === 'b') { Ed.wt.diagonals[Number(tr.dataset.j)][el.dataset.d] = Number(el.value); writeWallTable(); }
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !Ed.wt) return;
    const tr = b.closest('tr'), i = tr && Number(tr.dataset.i);
    if (b.dataset.f === 'turn') Ed.wt.rows[i].turn = Ed.wt.rows[i].turn === 'L' ? 'R' : 'L';
    else if (b.dataset.f === 'lock') Ed.wt.rows[i].lock = { '': 'x', x: 'y', y: '' }[Ed.wt.rows[i].lock];
    else if (b.dataset.act === 'add') Ed.wt.rows.push(emptyRow());
    else if (b.dataset.act === 'remove') Ed.wt.rows.pop();
    else if (b.dataset.act === 'diag') Ed.wt.diagonals.push({ a: 0, b: Math.min(2, Math.max(0, Ed.wt.rows.length - 1)), length: '' });
    else if (b.dataset.act === 'undiag') Ed.wt.diagonals.splice(Number(tr.dataset.j), 1);
    else return;
    writeWallTable(); renderWallTable(false);
    if (b.dataset.act === 'add') box.querySelector(`tr[data-i="${Ed.wt.rows.length - 1}"] input[data-f="length"]`)?.focus();
  });
  box.addEventListener('focusin', e => { const tr = e.target.closest('tr[data-i]'); markTableWall(tr ? Number(tr.dataset.i) : null); });
  box.addEventListener('focusout', () => markTableWall(null));
  // the text boxes typed in directly: the table follows
  for (const k of WT_TEXT) $(k).addEventListener('input', () => { if (!Ed.tableWriting) queueMicrotask(renderWallTable); });
}

export function recompute() {
  if (isRound()) {
    $('wallTable').hidden = true;                                   // a round pillar has no walls to list
    const { capture, errors } = roundCapture(roundForm(), level());
    Ed.solved = errors.length ? { ok: false, errors } : solveCapture(capture);
    Ed.solved.capture = capture; Ed.solved.overlaps = [];
    showResult(); draw();
    $('apply').disabled = !Ed.solved.ok || (!Ed.roomId && !Ed.draft); $('delRoom').hidden = !Ed.roomId; $('apply').textContent = 'Apply';
    return;
  }
  const mode = $('mode').value;
  $('turnsRow').hidden = mode === 'traverse';
  $('cornersRow').hidden = mode === 'rectilinear';
  $('closureRow').hidden = mode === 'lengths';
  $('locksRow').hidden = mode === 'lengths'; $('exactCornersRow').hidden = mode === 'lengths';
  const sq = $('closure').querySelector('[value=square]');
  sq.disabled = mode !== 'rectilinear';
  if (sq.disabled && $('closure').value === 'square') $('closure').value = 'line';
  $('diagRow').hidden = false;
  const snapPos = ref => Ed.snapsAround.find(s => s.ref === ref)?.pos;
  const { capture, errors } = buildCapture(currentForm(), snapPos);
  const prevOverlaps = (Ed.solved?.forRoom === (Ed.roomId ?? '+new') && Ed.solved?.overlaps) || [];     // kept until checked again, so the message does not blink
  const h = Number($('heading').value || 0);
  $('headingTrue').textContent = Number.isFinite(h) ? `= compass bearing ${roundDeg(bearingFromHeading(h, northAngleOf(Ed.model)))}°` : '';
  const st = capture.raw.start || [0, 0];
  $('startAt').textContent = errors.length ? '' : capture.raw.origin ? `corner 0 at (${st[0]}, ${st[1]}) = ${capture.raw.origin.ref} + (${capture.raw.origin.offset.join(', ')})` : capture.raw.start ? `corner 0 at (${st[0]}, ${st[1]})` : 'corner 0 at the plan origin (0, 0)';
  // checks between two of its corners marked "in the solve" count as measured diagonals (model/checks.js)
  Ed.solved = errors.length ? { ok: false, errors } : solveCapture(capture, Ed.shape === 'room' && Ed.roomId ? solveExtra(Ed.model, { id: Ed.roomId, capture }) : {});
  Ed.solved.capture = capture;
  // checked against the plan as it will be after Apply (walls that follow rooms make way first)
  // the overlap check runs a whole Apply: never per drag frame, and after a pause in typing (UX3)
  Ed.solved.overlaps = prevOverlaps; Ed.solved.forRoom = Ed.roomId ?? '+new';
  if (!Ed.tableWriting) renderWallTable(); else updateWallTableResiduals();
  const roomDrag = (Ed.dragging?.kind === 'room' || Ed.dragging?.kind === 'corner') && Ed.dragging.moved;
  scheduleOverlaps(Ed.dragging?.kind === 'room' || Ed.dragging?.kind === 'corner' ? null : 150);
  showResult();
  if (!(roomDrag && drawCurRoomOnly())) draw();          // PF7: a room or corner drag draws the room being edited, the rest of the plan once at the end
  $('apply').disabled = !Ed.solved.ok || (!Ed.roomId && !Ed.draft);
  $('delRoom').hidden = !Ed.roomId;
  applyLabel();
}
const applyLabel = () => { $('apply').textContent = Ed.solved?.overlaps?.length ? 'Apply anyway (overlaps)' : Ed.shape === 'solid' ? 'Apply' : 'Apply to room'; showEditBar(); };
/** Check the room being edited for overlaps after `ms` (null: not now, a drag is going on; it runs when it ends). */
export function scheduleOverlaps(ms) {
  clearTimeout(Ed.overlapTimer);
  if (ms !== null) Ed.overlapTimer = setTimeout(checkOverlaps, ms);
}
/** The plan as it will be after Apply (walls that follow rooms make way first): does this room share floor with anything? */
function checkOverlaps() {
  const s = Ed.solved;
  if (!s?.ok || Ed.shape !== 'room' || !s.capture || !(Ed.roomId || Ed.draft)) { if (s) s.overlaps = []; return; }
  // PF10: a room whose shape and capture are the stored ones is already the plan (reconciled): its overlaps are those of the stored plan,
  // so the check does not run an Apply for it. Anything changed still goes through overlapsAfterApply().
  const stored = Ed.roomId ? (level().rooms || []).find(r => r.id === Ed.roomId) : null;
  if (stored && JSON.stringify(stored.polygon) === JSON.stringify(s.polygon) && JSON.stringify(stored.capture) === JSON.stringify(s.capture)) s.overlaps = findOverlaps(level(), geosFor(Ed.model).get(Ed.levelId), s.polygon, { ignoreRoom: Ed.roomId });
  else s.overlaps = P('overlaps', () => overlapsAfterApply(Ed.model, Ed.levelId, { ...(room() || {}), id: Ed.roomId || $('rid').value, name: $('name').value, exterior: $('exterior').checked, polygon: s.polygon, capture: s.capture }, opts()));
  if (Ed.solved !== s) return;
  showResult(); applyLabel();
}

function showResult() {
  const s = Ed.solved, tol = resolveSettings(Ed.loc, level()).checkTolerance || { ok: 5, warn: 15 };
  if (s.ok && s.capture?.mode === 'circle') { const c = s.capture.raw; $('result').innerHTML = `<div class="help">⌀ ${c.diameter} mm, its middle at (${c.start.join(', ')})</div>`; $('resid').innerHTML = ''; $('lockOffers').innerHTML = ''; return; }
  if (!s.ok) { $('result').innerHTML = s.errors.map(e => `<div class="iss error">${esc(e)}</div>`).join(''); $('resid').innerHTML = ''; $('lockOffers').innerHTML = ''; return; }
  const ov = s.overlaps?.length ? `<div class="iss error"><b>Overlaps ${esc(describeOverlaps(s.overlaps))}.</b> Rooms must not share floor area: check the measurements or the start position ("Place next to another room" helps).</div>` : '';
  const head = [`RMS ${s.rms.toFixed(1)} mm`, `max ${s.maxAbs.toFixed(1)} mm`];
  if (s.closure) head.push(`closure ${s.closure.distance} mm`);
  if (s.redundancy !== undefined) head.push(`${s.redundancy} redundant`);
  $('result').innerHTML = ov + `<div class="help">${head.join(' · ')}</div>` + s.warnings.map(w => `<div class="iss">${esc(w)}</div>`).join('');
  const cls = c => { const a = Math.abs(c.residual), [ok, warn] = c.unit === 'deg' ? [0.2, 0.5] : [tol.ok, tol.warn]; return a <= ok ? 'ok' : a <= warn ? 'warn' : 'bad'; };
  $('resid').innerHTML = `<table class="res"><tr><th></th><th>measured</th><th>solved</th><th>Δ</th></tr>${s.residuals.map((r, i) => {
    const c = residualCells(r, s.capture.raw.derived, s.capture.raw.exact, s.capture.raw.exactCorners);
    return `<tr${i === s.worst && s.maxAbs > tol.ok ? ' class="worst"' : ''}><td>${esc(c.label)}</td><td>${esc(c.measured)}</td><td>${esc(c.model)}</td><td><b class="${cls(c)}">${esc(c.delta)}</b></td></tr>`;
  }).join('')}</table>`;
  // walls that are almost exactly on an axis: offer to lock them (fills the Locked walls field)
  const offers = lockOffers(s.capture, s.polygon);
  $('lockOffers').innerHTML = offers.map((o, i) => `<button data-i="${i}" style="margin:2px 0">${esc(describeLockOffer(o))}</button>`).join(' ');
  $('lockOffers').querySelectorAll('button').forEach(b => (b.onclick = () => {
    const o = offers[+b.dataset.i];
    $('locks').value = [$('locks').value.trim(), `${wallName(o.edge)} ${o.axis}`].filter(Boolean).join(', ');
    recompute();
  }));
}
