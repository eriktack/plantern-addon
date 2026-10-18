// Editor page: levels. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { levelHint } from '../option-hints.js';
import { levelLabel } from '../../model/names.js';
import { remember, linkPages } from '../../model/current.js';
import { adjacentLevels } from '../../tools/snap.js';
import { peekInfo } from '../../edit/inspect.js';
import { toSvg } from '../../render2d/coords.js';
import { labelObstacles } from '../../geometry/level.js';
import { roomNameLayout } from '../../geometry/polygon.js';
import { SOLID_COLOR } from '../../model/solids.js';
import { stairsPlan } from '../../geometry/stairs.js';
import { resolveSettings } from '../../model/settings.js';
import { $, LEVEL_COLOR, NEW_LEVEL, esc, geosFor, level } from './core.js';
import { mayLeave, setStatus } from './session.js';
import { loadFormForSelection, nameOf, refName } from './selection.js';
import { refresh } from './refresh.js';
import { draw } from './plan-draw.js';
import { Ed } from './state.js';

export function fillLevels() {
  $('level').innerHTML = Ed.model.levels.map(l => `<option value="${esc(l.id)}" data-hint="${esc(levelHint(l, Ed.model.levels))}">${esc(levelLabel(l))}${l.elevationFrom ? ' ⇅' : ''}</option>`).join('') + `<option value="${NEW_LEVEL}">+ New level…</option>`;
  $('level').value = Ed.levelId;
}
/** Show another level (leaving what is edited first, asked when changed); false when the user stays. */
export async function goToLevel(id) {
  if (!Ed.model.levels.some(l => l.id === id)) return false;
  if (!(await mayLeave())) { $('level').value = Ed.levelId; return false; }
  Ed.levelId = id; Ed.roomId = null; Ed.wallId = null; Ed.openingId = null; Ed.fixtureId = null; Ed.stairsId = null; Ed.objectId = null; Ed.draft = null; Ed.view = null; Ed.autoZoomed = false;
  remember(Ed.entry.id, Ed.levelId); linkPages(Ed.entry.id, Ed.levelId);
  $('level').value = Ed.levelId;
  loadFormForSelection();
  refresh();
  return true;
}

// ---- the levels below and above: faintly under the plan, and looked at while editing ----
export function showUnderlayMode() {
  $('uMode').textContent = `Levels: ${Ed.underlayMode}`;
  $('uMode').title = { auto: 'Levels below (blue) and above (amber) show faintly while placing something. Click: always', always: 'Levels below and above always show faintly. Click: never', off: 'Levels below and above are not shown. Click: while placing something' }[Ed.underlayMode];
}
/** Is the faint underlay of the neighbouring levels drawn now? */
export function showUnderlay() {
  if (Ed.underlayMode === 'off') return false;
  if (Ed.underlayMode === 'always') return true;
  return !!Ed.drawing || (!!Ed.editing && ['room', 'solid', 'stairs'].includes(Ed.editing.kind)) || (!Ed.editing && $('anchorCount').closest('details').open);
}
/** The level strip on the plan while editing: every level of the building; click one to look at it. */
export function renderLevelStrip() {
  const lv = level(), same = Ed.model.levels.filter(l => (l.building ?? null) === (lv.building ?? null)).sort((a, b) => b.elevation - a.elevation);
  const show = !!Ed.editing && same.length > 1;
  $('lvStrip').hidden = !show;
  if (!show) return;
  const near = adjacentLevels(Ed.model, lv).map(l => l.id), shown = Ed.peekId || Ed.levelId;
  $('lvStrip').innerHTML = same.map(l => {
    const cls = [l.id === shown ? 'on' : '', l.id === Ed.levelId ? 'edited' : '', near.includes(l.id) ? (l.elevation < lv.elevation ? 'below' : 'above') : ''].filter(Boolean).join(' ');
    return `<button data-lv="${esc(l.id)}" class="${cls}" title="${l.id === Ed.levelId ? 'The level you are editing' : `Look at ${esc(l.name || l.id)} (nothing there is changed; you keep editing)`}">${esc(l.name || l.id)}${l.id === Ed.levelId ? ' ✎' : ''}</button>`;
  }).join('');
  $('lvStrip').querySelectorAll('[data-lv]').forEach(b => (b.onclick = () => (b.dataset.lv === Ed.levelId ? endPeek() : startPeek(b.dataset.lv))));
}
function startPeek(id) {
  if (Ed.measure?.isOn()) Ed.measure.setOn(false);
  Ed.peekId = id; Ed.peekSel = null;
  const pl = Ed.model.levels.find(l => l.id === id);
  $('peekBar').hidden = false;
  $('peekBar').innerHTML = `<span>Looking at <b>${esc(pl?.name || id)}</b>, still editing <b>${esc(Ed.editing?.id ? nameOf(Ed.editing.id) : 'the new one')}</b> on ${esc(level().name || Ed.levelId)}. Click a wall or room to read it.</span><button id="peekBack">‹ Back</button>`;
  $('peekBack').onclick = endPeek;
  $('peekCard').hidden = true;
  renderLevelStrip(); draw();
}
export function endPeek() {
  if (!Ed.peekId) return;
  Ed.peekId = null; Ed.peekSel = null;
  $('peekBar').hidden = true; $('peekCard').hidden = true;
  renderLevelStrip(); draw();
}
/** The info card for something on the level looked at. */
export function showPeekCard(kind, id) {
  const pl = Ed.model.levels.find(l => l.id === Ed.peekId), c = pl && peekInfo(pl, kind, id, { name: refName });
  Ed.peekSel = c ? { kind, id } : null;
  $('peekCard').hidden = !c;
  if (c) $('peekCard').innerHTML = `<h3>${esc(c.title)} <small class="k">${esc(c.sub)}</small></h3>${c.rows.map(([k, v]) => `<div><span class="k">${esc(k)}:</span> ${esc(v)}</div>`).join('')}`;
  draw();
}

/**
 * Another level, read-only, while the editor stays open: its rooms, walls, solids, openings and stairs,
 * clickable for the info card, with the level being edited faintly on top (and the room being measured).
 */
export function drawPeek() {
  const svg = $('preview'), pl = Ed.model.levels.find(l => l.id === Ed.peekId), geo = (geosFor(Ed.model)).get(Ed.peekId);
  if (!pl || !geo) { Ed.peekId = null; draw(); return; }
  if (!Ed.lastFit) {
    const pts = (pl.rooms || []).flatMap(r => r.polygon).map(toSvg);
    if (!pts.length) { svg.innerHTML = ''; return; }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 1000;
    Ed.lastFit = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
  }
  const vb = Ed.view || Ed.lastFit;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const fs = Math.max(vb.w / (svg.clientWidth || 800), vb.h / (svg.clientHeight || 600)) * 16;
  const poly = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;
  const on = (k, id) => Ed.peekSel?.kind === k && Ed.peekSel.id === id;
  let out = `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="${fs * 0.7}" height="${fs * 0.7}" patternTransform="rotate(45)"><rect width="${fs * 0.7}" height="${fs * 0.7}" fill="#6b7482"/><line x1="0" y1="0" x2="0" y2="${fs * 0.7}" stroke="#ffb454" stroke-width="${fs / 6}"/></pattern></defs>`;
  const obstacles = labelObstacles(pl, geo);
  for (const r of pl.rooms || []) {
    if (!(r.polygon?.length >= 3)) continue;
    out += `<g data-pk="room|${esc(r.id)}" style="cursor:help">${poly(r.polygon, `fill="${r.exterior ? '#243026' : '#252a33'}" stroke="${on('room', r.id) ? '#ffb454' : '#46505f'}" stroke-width="${fs / (on('room', r.id) ? 4 : 8)}"`)}</g>`;
    const lay = roomNameLayout(r.polygon, r.name || r.id, { maxSize: fs * 1.2, minSize: fs * 0.6, avoid: obstacles }), [cx, cy] = toSvg(lay.pos);
    out += `<text x="${cx}" y="${cy}" fill="#8b93a1" font-size="${lay.size}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${lay.lines.map((l, k) => `<tspan x="${cx}" dy="${k ? '1.25em' : `${-(lay.lines.length - 1) * 0.625}em`}">${esc(l)}</tspan>`).join('')}</text>`;
  }
  for (const s of pl.solids || []) if (s.polygon?.length >= 3) out += `<g data-pk="solid|${esc(s.id)}" style="cursor:help">${poly(s.polygon, `fill="${esc(s.color || SOLID_COLOR)}" stroke="${on('solid', s.id) ? '#ffb454' : '#999'}" stroke-width="${fs / 8}"`)}</g>`;
  for (const w of pl.walls || []) {
    const pieces = geo.pieces.get(w.id), sel = on('wall', w.id);
    out += `<g data-pk="wall|${esc(w.id)}" style="cursor:help"><title>${esc(refName(w.id))} · ${w.kind === 'virtual' ? 'boundary' : `${Math.round(w.thickness)} mm${w.assumed?.includes('thickness') ? ' (assumed)' : ''}`}</title>`;
    if (pieces?.length) for (const pc of pieces) out += poly(pc, `fill="${w.assumed?.includes('thickness') ? 'url(#hatch)' : '#6b7482'}" ${sel ? `stroke="#ffb454" stroke-width="${fs / 4}"` : 'stroke="none"'}`);
    else { const [ax, ay] = toSvg(w.a), [bx, by] = toSvg(w.b); out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${sel ? '#ffb454' : '#6b7482'}" stroke-width="${fs / 6}" stroke-dasharray="${fs / 2}"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="transparent" stroke-width="${fs}"/>`; }
    out += '</g>';
  }
  for (const o of pl.openings || []) {
    const f = geo.frames.get(o.wall);
    if (!f) continue;
    const [h0, h1] = geo.openingLine(o).map(toSvg), c = on('opening', o.id) ? '#ffb454' : o.type === 'window' ? '#6cb6ff' : o.type === 'door' ? '#e0a060' : '#8b93a1';
    out += `<g data-pk="opening|${esc(o.id)}" style="cursor:help"><line x1="${h0[0]}" y1="${h0[1]}" x2="${h1[0]}" y2="${h1[1]}" stroke="transparent" stroke-width="${fs * 1.2}"/><line x1="${h0[0]}" y1="${h0[1]}" x2="${h1[0]}" y2="${h1[1]}" stroke="${c}" stroke-width="${fs / 5}"/></g>`;
  }
  if (geo.stairs) for (const s of stairsPlan(geo, resolveSettings(Ed.loc, pl).cutPlane).up) for (const st of s.steps) out += poly(st.poly, `fill="none" stroke="#9aa3b2" stroke-width="${fs / 14}" pointer-events="none"`);
  // the level being edited, faintly on top, and what is being measured on it
  const lv = level(), c = lv.elevation > pl.elevation ? LEVEL_COLOR.above : LEVEL_COLOR.below;
  for (const pcs of (Ed.curGeo?.pieces || new Map()).values()) for (const pc of pcs) out += poly(pc, `fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-opacity="0.6" stroke-width="${fs / 12}" pointer-events="none"`);
  const cur = Ed.solved?.ok && (Ed.editing?.kind === 'room' || Ed.editing?.kind === 'solid') ? Ed.solved.polygon : null;
  if (cur) out += poly(cur, `fill="none" stroke="#4cc38a" stroke-width="${fs / 5}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"`);
  svg.innerHTML = out;
  setStatus(`looking at ${pl.name || pl.id}: click a wall, room, solid or opening to read it · Esc or ‹ Back returns`);
}
