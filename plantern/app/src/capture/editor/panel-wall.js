// Editor page: panel-wall. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { groupByRoom } from '../option-hints.js';
import { wallInfo, wallToForm, cornerAt, wallPropsFromForm } from '../../edit/inspect.js';
import { wallFaceRooms } from '../../geometry/paint.js';
import { joinableWalls, materialFromColor, setMaterial, setWallProps } from '../../edit/ops.js';
import { usedColors, materialTable, materialUse } from '../../model/materials.js';
import { askConfirm } from '../dialog.js';
import { materialKind, MATERIAL_KINDS, materialSwatch } from '../../model/material-kind.js';
import { describeReconcile } from '../../edit/reconcile.js';
import { $, commit, esc, level, opts, wall } from './core.js';
import { titleHtml } from './selection.js';
import { ROOM_CORNER, anchorForm, fillWallPos, wallEnds } from './walldraw.js';
import { readLookRows, renderWallRoomLooks } from './room-apply.js';
import { afterLeave, enterEdit, setStatus } from './session.js';
import { doJoin } from './wall-ops.js';
import { askText, nameColour } from './add-menus.js';
import { Ed } from './state.js';


/** The wall panel: what the selected wall is, and its own properties as a form. */
export function showWall() {
  const info = wallInfo(level(), Ed.wallId, Ed.issuesNow);
  if (!info) { Ed.wallId = null; $('wallPanel').hidden = true; return; }
  const w = info.wall, nm = id => level().rooms?.find(r => r.id === id)?.name || id;
  const rooms = ids => ids.length ? ids.map(nm).join(', ') : 'no room';
  $('wTitle').innerHTML = titleHtml(w);
  $('wInfo').innerHTML = [
    `${info.length} mm long`,
    info.bound ? `${info.facade ? 'facade along' : 'follows'} ${esc(rooms(info.sides.right))}${info.shared ? `; ${esc(rooms(info.sides.left))} on the other face` : ''}`
      : w.anchor ? `hand-drawn, hangs on ${esc([...new Set(Object.values(w.anchor).map(an => nm(an.ref.split('#')[0])))].join(' and '))}: moves and turns with it` : 'hand-drawn: never moved by room changes',
    info.attached.length ? `attached: ${esc(info.attached.join(', '))}` : '',
    info.orphan ? `<span style="color:var(--bad)">${esc(info.orphan)}</span>` : '',
    w.kind !== 'virtual' && Ed.curGeo?.pieces.get(w.id)?.length === 0 ? 'hidden: a solid it gives way to stands where it is' : '',
  ].filter(Boolean).join(' · ');
  if (Ed.wallFormFor !== w) {
    const f = wallToForm(w);
    $('wName').value = f.name; $('wKind').value = f.kind; $('wLight').value = f.lightBlocking; $('wThick').value = f.thickness; $('wMeasured').checked = f.measured;
    $('wHeight').value = f.height; $('wBase').value = f.base;
    $('wPosBox').hidden = !!w.from?.length;
    $('wJustify').value = f.justify;
    $('wLock').checked = f.lock;
    if (!w.from?.length) {
      // the room corners, one group per room, each with where it is (the start and the end of the wall follow one of them)
      const corners = Ed.snaps.filter(s => ROOM_CORNER.test(s.ref));
      const roomName = id => { const r = level().rooms.find(x => x.id === id); return r?.name || id; };
      const cornerOpt = s => `<option value="${esc(s.ref)}" data-hint="${esc(`(${Math.round(s.pos[0])}, ${Math.round(s.pos[1])})`)}">${esc(`corner ${s.ref.split('#')[1].slice(1)}`)}</option>`;
      const opts = '<option value="">nothing (stays where it is)</option>' + groupByRoom(corners, s => s.ref.split('#')[0], roomName).map(g => `<optgroup label="${esc(g.label)}">${g.items.map(cornerOpt).join('')}</optgroup>`).join('');
      for (const [sel, end] of [['wAnchA', 'a'], ['wAnchB', 'b']]) {
        $(sel).innerHTML = opts;
        const ref = w.anchor?.[end]?.ref;
        if (ref && ![...$(sel).options].some(o => o.value === ref)) $(sel).insertAdjacentHTML('beforeend', `<option value="${esc(ref)}">${esc(ref)} (missing)</option>`);
        $(sel).value = ref || '';
      }
      fillWallPos(w.a, w.b);
    }
    $('wSloped').checked = f.sloped; $('wTopA').value = f.topA; $('wTopB').value = f.topB; $('wBottomA').value = f.bottomA; $('wBottomB').value = f.bottomB;
    $('wTopFlatA').value = f.topFlatA; $('wTopFlatB').value = f.topFlatB; $('wBotFlatA').value = f.bottomFlatA; $('wBotFlatB').value = f.bottomFlatB;
    fillMaterialSelects();
    for (const S of ['Left', 'Right']) { const s = S.toLowerCase(); $(`w${S}Mode`).value = f[`${s}Mode`]; $(`w${S}Color`).value = f[`${s}Color`]; $(`w${S}Mat`).value = f[`${s}Mat`]; }
    // a per-room look on a face that runs along only that room is that face's own look: shown (and saved) as such
    Ed.foldedLooks = new Set();
    if (w.roomSides) for (const S of ['Left', 'Right']) {
      const on = [...new Set(wallFaceRooms(w, Ed.curGeo.frames.get(w.id), level().rooms).filter(x => x.side === S.toLowerCase()).map(x => x.room))], look = on.length === 1 && w.roomSides[on[0]];
      if (!look) continue;
      Ed.foldedLooks.add(on[0]);
      $(`w${S}Mode`).value = look.material ? 'material' : 'color';
      if (look.color) $(`w${S}Color`).value = look.color;
      if (look.material) $(`w${S}Mat`).value = look.material;
    }
    renderWallRoomLooks(w);
    $('wErr').textContent = '';
    Ed.wallFormFor = w;
  }
  const fixed = info.shared && w.kind !== 'virtual';
  $('wThick').readOnly = fixed;
  $('wThickNote').textContent = fixed ? 'mm · the distance between the two rooms (move a room to change it)' : info.assumed.includes('thickness') ? 'mm · still a guess: measure it in a door or window opening in this wall (surface to surface)' : 'mm';
  $('wMeasuredRow').hidden = !info.assumed.includes('thickness');
  $('wLeftRoom').textContent = `faces ${rooms(info.sides.left).replace('no room', 'outside')}`;
  $('wRightRoom').textContent = `faces ${rooms(info.sides.right).replace('no room', 'outside')}`;
  showSideRows();
  // the ends of a sloped wall are named by the room corner they are at
  const endName = p => { const c = cornerAt(level(), p); return c ? `corner ${c.index} of ${c.name}` : `(${Math.round(p[0])}, ${Math.round(p[1])})`; };
  for (const [k, p] of [['A', w.a], ['B', w.b]]) { const t = endName(p); $(`wEnd${k}`).textContent = t; $('wSlope').querySelector(`.end${k}`).textContent = t; }
  showSlopeRows();
  $('wOpenings').innerHTML = info.openings.length ? 'Openings (click to edit): ' + info.openings.map(o => `<a href="#" data-o="${esc(o.id)}">${esc(o.id)}</a> (${esc(o.type)}, ${o.width} mm at ${o.offset})`).join(', ') : 'No openings yet.';
  $('wOpenings').querySelectorAll('a[data-o]').forEach(a => (a.onclick = e => { e.preventDefault(); afterLeave(() => enterEdit('opening', a.dataset.o))(); }));
  $('wSplitNote').textContent = info.start ? `mm from corner ${info.start.index} of ${info.start.name} (wall ${info.length} mm)` : `mm from its start (${Math.round(w.a[0])}, ${Math.round(w.a[1])}); wall ${info.length} mm`;
  // the other part of a split wall (or a hand-drawn wall continuing it): join them into one again
  const joins = joinableWalls(level(), w.id);
  $('wJoinRow').hidden = !joins.length;
  $('wJoinRow').innerHTML = joins.map(j => `<button data-join="${esc(j.id)}" title="One wall again, with this wall's thickness, kind and colours; what is on ${esc(j.id)} moves onto it">Join with ${esc(j.id)} <small>(at its ${j.side === 'b' ? 'end' : 'start'})</small></button>`).join('');
  $('wJoinRow').querySelectorAll('[data-join]').forEach(b => (b.onclick = () => doJoin(b.dataset.join)));
  $('wUnbind').hidden = !info.bound;
  $('wDelete').hidden = info.bound && !info.orphan;
}

const wallForm = () => ({ name: $('wName').value, kind: $('wKind').value, lightBlocking: $('wLight').value, thickness: $('wThick').value, measured: $('wMeasured').checked, height: $('wHeight').value, base: $('wBase').value,
  roomSides: readLookRows($('wRoomLooks'), Object.fromEntries(Object.entries(wall()?.roomSides || {}).filter(([id]) => !Ed.foldedLooks.has(id)))),
  ...(wall()?.from?.length ? {} : (() => { const e = wallEnds(); return { ax: e ? String(e.a[0]) : '', ay: e ? String(e.a[1]) : '', bx: e ? String(e.b[0]) : '', by: e ? String(e.b[1]) : '', justify: $('wJustify').value, lock: $('wLock').checked, anchor: anchorForm() }; })()),
  topFlatA: $('wTopFlatA').value, topFlatB: $('wTopFlatB').value, bottomFlatA: $('wBotFlatA').value, bottomFlatB: $('wBotFlatB').value,
  sloped: $('wSloped').checked, topA: $('wTopA').value, topB: $('wTopB').value, bottomA: $('wBottomA').value, bottomB: $('wBottomB').value,
  leftMode: $('wLeftMode').value, leftColor: $('wLeftColor').value, leftMat: $('wLeftMat').value, rightMode: $('wRightMode').value, rightColor: $('wRightColor').value, rightMat: $('wRightMat').value });

/** A sloped wall shows its end heights instead of height and base. */
export function showSlopeRows() {
  const on = $('wSloped').checked;
  $('wSlope').hidden = !on;
  document.querySelectorAll('#wallPanel label.flat').forEach(l => (l.hidden = on));
}

/** Each side shows the colour picker or the material list, by its mode; colour sides get the palette. */
export function showSideRows() {
  for (const S of ['Left', 'Right']) {
    const m = $(`w${S}Mode`).value;
    $(`w${S}Color`).hidden = m !== 'color'; $(`w${S}Mat`).hidden = m !== 'material';
    $(`w${S}Swatches`).hidden = true;                                // the swatch menu beside the colour has them (UX21)
    const pick = $(`w${S}Color`).nextElementSibling;
    if (pick?.classList.contains('swatchpick')) pick.hidden = m === 'material';
  }
}


/**
 * A material from this side's colour: named (its palette name suggested), used for this side, and
 * for the other sides painted exactly that colour if you say so.
 */
export async function makeMaterialFromSide(side) {
  const S = side === 'left' ? 'Left' : 'Right', c = $(`w${S}Color`).value.toLowerCase();
  const name = await askText(`New material with colour ${c}`, 'Its name', usedColors(Ed.model).find(x => x.color === c)?.name || '');
  if (name === null) return;
  const here = { level: Ed.levelId, wall: Ed.wallId, side };
  const others = Ed.model.levels.flatMap(lv => (lv.walls || []).flatMap(w => ['left', 'right'].filter(s => w.sides?.[s]?.color?.toLowerCase() === c && !w.sides[s].material && !(w.id === Ed.wallId && s === side)).map(s => ({ level: lv.id, wall: w.id, side: s }))));
  const all = others.length && await askConfirm(`${others.length} other wall side${others.length > 1 ? 's are' : ' is'} painted ${c} too. Switch ${others.length > 1 ? 'them' : 'it'} to the new material as well (so they all change together)?`);
  const r = materialFromColor(Ed.model, c, name, [here, ...(all ? others : [])]);
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  Ed.wallFormFor = null;
  commit(r.model);
  setStatus(`material ${r.id} made from ${c}, used by ${r.report.replaced.length} wall side${r.report.replaced.length > 1 ? 's' : ''} (not saved yet)`);
}

/** The named colours, under Materials: click one to rename it. */
export function renderColors() {
  const named = usedColors(Ed.model).filter(c => c.name);
  $('colorList').innerHTML = named.length ? 'Colours: ' + named.map(c => `<a href="#" data-c="${c.color}" title="${c.color}: click to rename"><span class="swatch" style="background:${c.color}"></span> ${esc(c.name)}</a>`).join(' · ')
    : 'Colours you use show as swatches under a wall side\'s colour; name one with "Name…" to keep it in the list.';
  $('colorList').querySelectorAll('a[data-c]').forEach(a => (a.onclick = e => {
    e.preventDefault();
    nameColour(a.dataset.c);
  }));
}
// The design library's names that this house does not override: listed read-only, picked by name (materials-library plan).
function libraryMaterials() { return Object.entries(materialTable(Ed.model)).filter(([, m]) => m.fromLibrary); }
/**
 * The options of a material list: the house's materials and the library's, grouped by kind with a swatch each (ND3). first and
 * last are options put before and after the groups. A house texture is not drawn in the menu (its path is the house's, not this page's).
 */
export function materialOptionsHtml(first = '', last = '') {
  const items = [
    ...Object.entries(Ed.model.materials || {}).map(([id, m]) => ({ id, label: m.name || id, entry: { ...m, texture: undefined } })),
    ...libraryMaterials().map(([id, m]) => ({ id, label: `${m.name || id} (library)`, entry: m })),
  ];
  const groups = new Map();
  for (const it of items) {
    const k = materialKind(it.id, it.entry).label;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const body = MATERIAL_KINDS.filter(k => groups.has(k.label)).map(k => `<optgroup label="${esc(k.label)}">${groups.get(k.label).map(it => `<option value="${esc(it.id)}" data-swatch="${esc(materialSwatch(it.entry, 'object-designs/'))}">${esc(it.label)}</option>`).join('')}</optgroup>`).join('');
  return first + body + last;
}
function fillMaterialSelects() {
  const opts = materialOptionsHtml('<option value="">choose…</option>', '<option value="+new">+ New material…</option>');
  for (const S of ['Left', 'Right']) { const keep = $(`w${S}Mat`).value; $(`w${S}Mat`).innerHTML = opts; if ([...$(`w${S}Mat`).options].some(o => o.value === keep)) $(`w${S}Mat`).value = keep; }
}
export function renderMaterials() {
  const mats = Object.entries(Ed.model.materials || {}), use = materialUse(Ed.model);
  $('matList').innerHTML = mats.map(([id, m]) => `<div class="chk${id === Ed.matId ? ' sel' : ''}" data-mat="${esc(id)}"><span class="swatch" style="background:${esc(m.color || '#888')}"></span><span>${esc(m.name || id)} <small>${esc(id)}${m.texture ? ' · texture' : ''}</small></span><small>${use.get(id).length ? `${use.get(id).length} wall${use.get(id).length > 1 ? 's' : ''}` : 'unused'}</small></div>`).join('')
    || '<small>No materials yet. A wall side can have a colour, or a material that several walls share (with a texture image if you like).</small>';
  $('matList').querySelectorAll('[data-mat]').forEach(el => (el.onclick = afterLeave(() => enterEdit('material', el.dataset.mat))));
  // the library's names: read-only here (change them in object-designs/materials/library.json)
  const lib = libraryMaterials();
  if (lib.length) {
    $('matList').insertAdjacentHTML('beforeend', `<small>From the library (read-only):</small>` + lib.map(([id, m]) => `<div class="chk lib"><span class="swatch" style="background:${esc(m.color || '#888')}"></span><span>${esc(id)} <small>library</small></span></div>`).join(''));
  }
}
export function openMaterial(id, forSide) {
  Ed.matId = id;
  const m = (id && Ed.model.materials?.[id]) || {}, use = id ? materialUse(Ed.model).get(id) || [] : [];
  $('matForm').hidden = false;
  $('mName').value = m.name || ''; $('mId').value = id || '(from the name)'; $('mColor').value = m.color || '#cccccc'; $('mTex').value = m.texture || ''; $('mUv').value = m.uvScale ?? '';
  $('mUse').textContent = id ? (use.length ? `Used by ${use.join(', ')}.` : 'Not used by any wall yet.') : forSide ? `Will be used for the ${forSide} side of ${Ed.wallId}.` : '';
  $('mDelete').hidden = !id; $('mErr').textContent = '';
  materialSwatches();
  $('matForm').dataset.forSide = forSide || '';
  renderMaterials();
  $('mName').focus();
}
/** The palette under the material's colour picker. */
export function materialSwatches() {
  $('mSwatches').hidden = true;                                     // its swatch menu has them (UX21)
}

export function applyMaterial() {
  const props = { name: $('mName').value.trim() || null, color: $('mColor').value, texture: $('mTex').value.trim() || null, uvScale: $('mUv').value.trim() || null };
  if (!props.name && !Ed.matId) { $('mErr').textContent = 'Give it a name.'; return; }
  const r = setMaterial(Ed.model, Ed.matId, props);
  if (r.report.errors.length) { $('mErr').textContent = r.report.errors.join('; '); return; }
  let next = r.model;
  const side = $('matForm').dataset.forSide;
  if (side && Ed.wallId) {
    // a material made from a wall side: use it there straight away
    const w = level().walls.find(x => x.id === Ed.wallId), sides = { ...(w.sides || {}), [side]: { material: r.id } };
    const s = setWallProps(next, Ed.levelId, Ed.wallId, { sides }, opts());
    if (!s.report.errors.length) next = s.model;
    Ed.wallFormFor = null;
  }
  Ed.matId = r.id; $('matForm').dataset.forSide = '';
  commit(next);
  openMaterial(r.id);
  setStatus(`material ${r.id} saved in the model (not saved to the repo yet)`);
}

export async function applyWall() {
  const { props, errors } = wallPropsFromForm(wall(), wallForm());
  if (errors.length) { $('wErr').textContent = errors.join('; '); return; }
  if (!Object.keys(props).length) { $('wErr').textContent = 'Nothing changed.'; return; }
  const id = Ed.wallId, r = setWallProps(Ed.model, Ed.levelId, id, props, opts());
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  const lines = describeReconcile(r.report);
  if (r.report.preview.length && !Ed.dry && !(await askConfirm(['This changes the plan:', ...lines, 'Apply?'].join('\n\n'), { ok: 'Apply' }))) return;
  if (!Ed.dry) $('wallsOut').innerHTML = lines.map(esc).join('<br>');
  commit(r.model);
  setStatus(`${id}: ${Object.keys(props).join(', ')} changed (not saved yet)`);
}
