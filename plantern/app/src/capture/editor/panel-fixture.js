// Editor page: panel-fixture. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { wallInfo, offsetFrom, openingInfo, offsetTo } from '../../edit/inspect.js';
import { stripForm, lampOnObject } from '../../model/fixtures.js';
import { wallName } from '../labels.js';
import { displayName, nameChange } from '../../model/names.js';
import { pointInPolygon } from '../../geometry/polygon.js';
import { suggestEntities, setBinding, sameBinding } from '../../ha/suggest.js';
import { stateClass, domainIcon } from '../../ha/pick.js';
import { ICONS } from '../../icons.js';
import { checkLook } from '../../ha/appearance.js';
import { resolveConnection } from '../../ha/client.js';
import { litRadius } from '../../model/lit.js';
import { askConfirm } from '../dialog.js';
import { deleteFixture, setFixture, splitWall } from '../../edit/ops.js';
import { describeReconcile } from '../../edit/reconcile.js';
import { $, commit, esc, fixture, level, object, opening, opts } from './core.js';
import { refName, titleHtml } from './selection.js';
import { afterLeave, enterEdit, isFresh, rebase, setStatus } from './session.js';
import { fillFrom, fromOf } from './panel-opening.js';
import { refreshWallMeasure } from './add-menus.js';
import { fillCopyInto } from './copy.js';
import { assetCache } from './panel-object.js';
import { Ed } from './state.js';


/** The fixture panel: height, where it is (on a wall, or x/y), how far a lamp's light reaches. */
export function showFixture() {
  const x = fixture();
  if (!x) { Ed.fixtureId = null; $('fixturePanel').hidden = true; return; }
  const lv = level(), w = x.attach && lv.walls.find(v => v.id === x.attach.wall), info = w && wallInfo(lv, w.id);
  const lampObj = lampOnObject(x), form = stripForm(x), onObject = form === 'object' || lampObj ? lv.objects?.find(o => o.id === x.attach.object) : null, onOpening = form === 'opening' ? lv.openings?.find(o => o.id === x.attach.opening) : null;
  const nm = ids => ids.map(id => lv.rooms?.find(r => r.id === id)?.name || id).join(', ') || 'outside';
  $('xTitle').innerHTML = titleHtml(x);
  $('xInfo').innerHTML = `${x.kind === 'switch' ? 'switch' : x.kind === 'strip' ? 'LED strip' : lampObj ? 'light' : x.attach ? 'wall lamp' : 'lamp'}${w ? ` on <a href="#" id="xWall" title="${esc(w.id)}">${esc(refName(w.id))}</a>` : ''}${form === 'object' || form === 'opening' || lampObj ? ` on <a href="#" id="xTargetLink" title="${esc(x.attach.object ?? x.attach.opening)}">${esc(refName(x.attach.object ?? x.attach.opening))}</a>` : ''}` + (x.assumed?.length ? ` · <b class="warn">still default: ${esc(x.assumed.join(', '))}</b>` : '');
  $('xWall')?.addEventListener('click', e => { e.preventDefault(); afterLeave(() => enterEdit('wall', w.id))(); });
  $('xTargetLink')?.addEventListener('click', e => { e.preventDefault(); afterLeave(() => enterEdit(lampObj ? 'object' : form, x.attach.object ?? x.attach.opening))(); });
  for (const [id, show] of [['xRadiusRow', x.kind !== 'switch'], ['xOffsetRow', !!w], ['xLenRow', (!!w && x.kind === 'strip') || form === 'object'], ['xVertRow', !!w && x.kind === 'strip'], ['xStartRow', form === 'object'], ['xInsetRow', form === 'object'], ['xFromRow', !!w], ['xSideRow', !!w], ['xInRow', !!w && x.kind === 'lamp'], ['xXRow', !x.attach || lampObj], ['xYRow', !x.attach || lampObj], ['xTargetRow', !!onObject || !!onOpening || form === 'object' || form === 'opening' || lampObj], ['xEdgeRow', form === 'object'], ['xAtRow', form === 'object' || form === 'opening']]) $(id).hidden = !show;
  $('xSideRow').hidden = !(w || form === 'opening');
  $('xXRow').querySelector('small').textContent = lampObj ? 'mm from the middle of the object, along its width' : 'mm, east';
  $('xYRow').querySelector('small').textContent = lampObj ? 'mm from the middle, out from its back' : 'mm, north';
  $('xZ').closest('label').hidden = form === 'object' || form === 'opening';                       // its height is the height of what it follows
  if (w) {
    fillFrom('xFrom', w, x.id);
    $('xOffsetNote').textContent = x.kind === 'strip' ? 'mm from that corner to where the strip starts' : 'mm from that corner to its middle';
    $('xSide').options[0].textContent = nm(info.sides.right); $('xSide').options[1].textContent = nm(info.sides.left);
    if (Ed.fixtureFormFor !== x) {                                   // the openings of this wall a lamp may stand in
      const here = (lv.openings || []).filter(o => o.wall === w.id);
      $('xIn').innerHTML = `<option value="">nothing (on the wall face)</option>` + here.map(o => `<option value="${esc(o.id)}">${esc(o.name || refName(o.id))} · ${esc(o.type)}, ${Math.round(o.offset)}–${Math.round(o.offset + o.width)} mm</option>`).join('');
      if (x.attach.opening && !here.some(o => o.id === x.attach.opening)) $('xIn').insertAdjacentHTML('beforeend', `<option value="${esc(x.attach.opening)}">${esc(x.attach.opening)} (missing)</option>`);
      $('xIn').value = x.attach.opening || '';
    }
  }
  if (form === 'opening' && onOpening) { const oi = wallInfo(lv, onOpening.wall); if (oi) { $('xSide').options[0].textContent = nm(oi.sides.right); $('xSide').options[1].textContent = nm(oi.sides.left); } }
  $('xZNote').textContent = lampObj ? 'mm above the bottom of the object' : `mm above the floor (ceiling ${lv.ceilingHeight ?? 2400})`;
  if (Ed.fixtureFormFor !== x) {
    $('xName').value = x.name ?? ''; $('xZ').value = lampObj ? x.attach.up ?? 0 : x.z ?? ''; $('xRadius').value = x.radius ?? '';
    if (lampObj) {                                                  // the object it follows, and where it stands in it
      $('xTarget').innerHTML = (lv.objects || []).map(o => `<option value="${esc(o.id)}">${esc(o.name || refName(o.id))}</option>`).join('');
      if (!(lv.objects || []).some(o => o.id === x.attach.object)) $('xTarget').insertAdjacentHTML('beforeend', `<option value="${esc(x.attach.object)}">${esc(x.attach.object)} (missing)</option>`);
      $('xTarget').value = x.attach.object;
      $('xTargetNote').textContent = 'the object it follows (it moves with it)';
      $('xX').value = x.attach.offset?.[0] ?? 0; $('xY').value = x.attach.offset?.[1] ?? 0;
    }
    if (form === 'object' || form === 'opening') {                // what it follows, and which edge of it
      const list = form === 'object' ? lv.objects || [] : lv.openings || [];
      $('xTarget').innerHTML = list.map(o => `<option value="${esc(o.id)}">${esc(o.name || refName(o.id))}</option>`).join('');
      if (!list.some(o => o.id === (x.attach.object ?? x.attach.opening))) $('xTarget').insertAdjacentHTML('beforeend', `<option value="${esc(x.attach.object ?? x.attach.opening)}">${esc(x.attach.object ?? x.attach.opening)} (missing)</option>`);
      $('xTarget').value = x.attach.object ?? x.attach.opening;
      $('xTargetNote').textContent = form === 'object' ? 'the object it runs along (it moves with it)' : 'the window or door it runs along (it moves with it)';
      $('xAt').innerHTML = form === 'object' ? '<option value="bottom">under the object (its bottom)</option><option value="top">on top of the object</option>' : '<option value="sill">the bottom of the opening (sill)</option><option value="head">the top of the opening</option>';
      $('xAt').value = x.attach.at ?? (form === 'object' ? 'bottom' : 'sill');
      $('xAtNote').textContent = form === 'object' ? 'under it, or on top' : 'along its bottom or its top';
      if (form === 'object') {
        const fp = Ed.curGeo.objectFootprint(onObject || {}) || [];
        $('xEdge').innerHTML = [0, 1, 2, 3].map(i => `<option value="${i}">side ${wallName(i)}${fp[i] ? ` · ${Math.round(Math.hypot(fp[(i + 1) % fp.length][0] - fp[i][0], fp[(i + 1) % fp.length][1] - fp[i][1]))} mm long` : ''}</option>`).join('');
        $('xEdge').value = String(x.attach.edge ?? 0);
        $('xLen').value = x.attach.length ?? ''; $('xStart').value = x.attach.offset ?? ''; $('xInset').value = x.attach.inset ?? '';
        $('xLenNote').textContent = 'mm, empty = the rest of the side';
      }
      if (form === 'opening') $('xSide').value = x.attach.side;
    }
    if (w) { $('xOffset').value = offsetFrom({ offset: x.attach.offset, width: 0 }, fromOf(x.id, w)); $('xSide').value = x.attach.side; $('xLen').value = x.attach.length ?? ''; $('xVertical').checked = x.attach.vertical === true; $('xLenNote').textContent = $('xVertical').checked ? 'mm up the wall' : 'mm along the wall'; }
    else if (!x.attach) { $('xX').value = x.pos[0]; $('xY').value = x.pos[1]; }
    refreshWallMeasure('x');
    $('xErr').textContent = ''; Ed.fixtureFormFor = x;
    fillCopyInto('fixture', x);
    showBinding(x);
    showUseLight(x);
  }
}
const HA_RETRY_MS = 60000;
/** The states of the house's connection, asked for only when Plantern's server keeps that connection: a computer
 *  without Home Assistant gets no 404 for every lamp shown. The names come first (api/ha/connections). */
async function loadHaStates() {
  if (Ed.haStates || !Ed.house?.server) return Ed.haStates;
  if (Date.now() - Ed.haAsked < HA_RETRY_MS) return Ed.haStates;
  Ed.haAsked = Date.now();
  try {
    // the same rule as the viewer (resolveConnection): the house's connection, else the add-on's own (a house without one, or one this Plantern lacks)
    const conns = (await (await fetch('api/ha/connections')).json()).connections;
    Ed.haConn = resolveConnection(Ed.loc, {}, conns);
    if (Ed.haConn.conn.type === 'server') { const r = await fetch(`api/ha/${encodeURIComponent(Ed.haConn.name)}/states`); if (r.ok) Ed.haStates = (await r.json()).states; }
  } catch { /* not reachable: type the id */ }
  return Ed.haStates;
}
/** The connection the Editor talks to: its name, or the house's own name before the server has answered; null for none. */
const connName = () => Ed.haConn?.conn.type === 'server' ? Ed.haConn.name : Ed.loc.integrations?.ha?.connection;
/** A hint line for the entity fields: where the list comes from, and why it may be empty (a fallback to the add-on's connection, or no connection). */
const connHint = what => {
  const name = connName();
  const base = name ? `in ${name}: ${what}` : 'pick the house\'s Home Assistant on the Settings page to get a list; or type the entity id';
  return Ed.haConn?.note ? `${Ed.haConn.note}. ${base}` : base;
};
async function showBinding(x) {
  const b = Ed.loc.bindings?.[x.id] || {}, lv = level();
  $('xEntity').value = b.entity || ''; $('xBindOut').textContent = '';
  $('xControlsRow').hidden = x.kind !== 'switch';
  $('xLookRow').hidden = x.kind === 'switch';
  const lk = b.look || {};
  $('xLookBri').value = lk.brightness ?? ''; $('xLookLm').value = lk.lumens ?? ''; $('xLookK').value = lk.kelvin ?? ''; $('xLookUseColor').checked = !!lk.color; $('xLookColor').value = lk.color || '#ffd6aa';
  const lamps = Ed.model.levels.flatMap(l => (l.fixtures || []).filter(f => f.kind !== 'switch').map(f => ({ f, l })));
  $('xControls').innerHTML = lamps.map(({ f, l }) => `<label class="inl"><input type="checkbox" value="${esc(f.id)}"${(b.controls || []).includes(f.id) ? ' checked' : ''}> ${esc(displayName(f))}${l.id !== lv.id ? ` <small>${esc(l.name || l.id)}</small>` : ''}</label>`).join('') || 'No lamps yet.';
  const xHint = 'type a name or id, the best matches come first; picking one links it when you Apply';
  $('xEntityNote').textContent = connHint(xHint);
  const states = await loadHaStates();
  if (fixture() !== x) return;
  $('xEntityNote').textContent = connHint(xHint);                   // now that the server has said which connection it is
  const room = (lv.rooms || []).find(r => (x.pos && pointInPolygon(x.pos, r.polygon)) || (x.attach && lv.walls.find(w => w.id === x.attach.wall)?.rooms?.includes(r.id)));
  entityChoices.x = suggestEntities(states || [], { kind: x.kind, names: [x.name, room?.name, room && Ed.loc.areas?.[room.id]] });
  showEntityPick();
}
export const entityChoices = { x: [], o: [], ol: [], ob: [] };
/** The entity field of a lamp or switch (prefix x) or of a door (prefix o): what is chosen (friendly name, id, state), and while typing a list to pick from (name + id). */
export function showEntityPick(open = false, p = 'x') {
  const input = $(`${p}Entity`), now = $(`${p}EntityNow`), pick = $(`${p}EntityPick`), choices = entityChoices[p];
  const v = input.value.trim(), st = Ed.haStates?.find(s => s.entity_id === v);
  // the linked entity: a dot for its state, its name, and Try it (toggles it, so the person sees which lamp it is; UX31)
  const canTry = st && ['light', 'switch', 'fan', 'input_boolean'].includes(v.split('.')[0]);
  now.innerHTML = v ? (st ? `<span class="dot ${stateClass(st.state)}"></span> <b>${esc(st.attributes?.friendly_name || v)}</b> <small>${esc(v)} · ${esc(st.state)}</small>${canTry ? ' <button type="button" class="trybtn" title="Switch it on or off in Home Assistant now, to see which lamp it is (nothing is stored)">Try it</button>' : ''}` : `<small>${esc(v)}${Ed.haStates ? ' · not found in Home Assistant' : ''}</small>`) : '<small>not linked</small>';
  now.querySelector('.trybtn')?.addEventListener('click', () => tryEntity(v, p));
  if (!open || !choices.length) { pick.hidden = true; return; }
  const q = v.toLowerCase(), shown = choices.filter(e => !q || e.id.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)).slice(0, 40);
  // a row: the domain's icon and a dot for its state, then the name and the id (ND8)
  pick.innerHTML = shown.map(e => { const s = Ed.haStates?.find(x => x.entity_id === e.id), ic = domainIcon(e.id); return `<div class="pick" data-ent="${esc(e.id)}"><span class="dot ${stateClass(s?.state)}"></span>${ic ? `<span class="pic">${ICONS[ic]}</span>` : ''}<b>${esc(e.label)}</b><small>${esc(e.id)}${s ? ` · ${esc(s.state)}` : ''}</small></div>`; }).join('') || '<div class="help">No entity matches.</div>';
  pick.hidden = false;
  now.innerHTML = '';                                                // while searching, the list is what counts
  pick.querySelectorAll('[data-ent]').forEach(el => (el.onmousedown = ev => { ev.preventDefault(); input.value = el.dataset.ent; showEntityPick(false, p); input.blur(); input.dispatchEvent(new Event('input')); }));
}
/** Toggle an entity through Plantern's server and show its new state (UX31); nothing in the house changes. */
async function tryEntity(id, p) {
  const name = connName();
  try {
    const r = await fetch(`api/ha/${encodeURIComponent(name)}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: id.split('.')[0], service: 'toggle', target: { entity_id: id } }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    setStatus(`${id} toggled in Home Assistant`);
  } catch (e) { setStatus(`Could not reach ${id}: ${e.message}`); return; }
  await new Promise(res => setTimeout(res, 400));                  // Home Assistant reports the change a moment later
  Ed.haStates = null; Ed.haAsked = 0;
  await loadHaStates();
  showEntityPick(false, p);
}
/** The sensor of a door opening (location.json → bindings[<opening id>].entity): the field and its note, then the sensors that fit. */
export function showDoorBinding(o) {
  $('oEntity').value = Ed.loc.bindings?.[o.id]?.entity || '';
  $('olEntity').value = Ed.loc.bindings?.[o.id]?.lock || '';
  entityChoices.o = []; entityChoices.ol = [];
  loadDoorChoices(o);
}
export async function loadDoorChoices(o) {
  const info = openingInfo(level(), o.id);
  const noteDoor = () => { $('oEntityNote').textContent = connHint('a binary_sensor that says open (on) or closed (off); type a name or id, picking one links it when you Apply'); $('olEntityNote').textContent = connHint('a lock that says locked or unlocked, shown as a padlock on the door (green and closed when locked, red and open when not)'); };
  noteDoor();
  const states = await loadHaStates();
  if (opening() !== o) return;
  noteDoor();
  const rooms = [...new Set([...(info?.sides?.left || []), ...(info?.sides?.right || [])])].map(id => (level().rooms || []).find(r => r.id === id)).filter(Boolean);
  entityChoices.o = suggestEntities(states || [], { kind: 'door', names: [o.name, 'door', ...rooms.flatMap(r => [r.name, Ed.loc.areas?.[r.id]])] });
  entityChoices.ol = suggestEntities(states || [], { kind: 'lock', names: [o.name, 'door', ...rooms.flatMap(r => [r.name, Ed.loc.areas?.[r.id]])] });
  showEntityPick(false, 'o'); showEntityPick(false, 'ol');
}
/** The sensor of a door as its field says it now: { next } is the location with it, or { error } when it is not valid. Written when the opening is applied, with the house's save. */
export function doorBindingDraft(o, type) {
  if (type !== 'door') return { next: Ed.loc.bindings?.[o.id] ? setBinding(Ed.loc, o.id, { entity: '', lock: '' }) : Ed.loc };      // not a door any more: no sensor or lock
  const entity = $('oEntity').value.trim(), lock = $('olEntity').value.trim();
  if (entity && !/^[a-z_]+\.[a-z0-9_]+$/.test(entity)) return { error: 'The Home Assistant sensor looks like binary_sensor.front_door' };
  if (lock && !/^lock\.[a-z0-9_]+$/.test(lock)) return { error: 'The Home Assistant lock looks like lock.front_door' };
  return { next: setBinding(Ed.loc, o.id, { entity, lock }) };
}

/**
 * The link of a lamp or switch as its fields say it now (fixes list 34): { next } is the location with it, or { error }
 * when a field is not valid. It is written when the lamp is applied, with the house's save.
 */
function bindingDraft(x) {
  const entity = $('xEntity').value.trim(), controls = [...$('xControls').querySelectorAll('input:checked')].map(i => i.value);
  if (entity && !/^[a-z_]+.[a-z0-9_]+$/.test(entity)) return { error: 'The Home Assistant entity looks like light.kitchen' };
  const num = id => ($(id).value.trim() === '' ? undefined : Number($(id).value));
  const look = x.kind !== 'switch' ? { brightness: num('xLookBri'), lumens: num('xLookLm'), kelvin: $('xLookUseColor').checked ? undefined : num('xLookK'), color: $('xLookUseColor').checked ? $('xLookColor').value : undefined } : undefined;
  const bad = look ? checkLook(Object.fromEntries(Object.entries(look).filter(([, v]) => v !== undefined))) : [];
  if (bad.length) return { error: bad.join('; ') };
  return { next: setBinding(Ed.loc, x.id, { entity, ...(x.kind === 'switch' ? { controls } : {}), ...(look ? { look } : {}) }) };
}
const litOf = o => o.light ?? (o.blueprint ? assetCache().light(o) : null);
export function showObjectLight(o) {
  const lit = !!litOf(o);
  $('obBindBox').hidden = !lit;
  if (o.blueprint && !lit) { assetCache().loadFor(o); return; }     // its build says whether it has a light; shown again when it has
  if (!lit) return;
  $('obLightRadius').placeholder = String(litRadius(o));
  if (Ed.objectLightFilledFor !== o) {
    const b = Ed.loc.bindings?.[o.id] || {}, l = b.look || {};
    $('obEntity').value = b.entity || ''; $('obLightRadius').value = o.lightRadius ?? '';
    $('obLookBri').value = l.brightness ?? ''; $('obLookLm').value = l.lumens ?? ''; $('obLookK').value = l.kelvin ?? ''; $('obLookUseColor').checked = !!l.color; $('obLookColor').value = l.color || '#ffd6aa';
    Ed.objectLightFilledFor = o;
    rebase('obEntity', 'obLightRadius', 'obLookBri', 'obLookLm', 'obLookK', 'obLookUseColor', 'obLookColor');   // filled from the house, not typed
  }
  loadHaStates().then(states => {
    if (object() !== o) return;
    entityChoices.ob = suggestEntities(states || [], { kind: 'lamp', names: [o.name, o.blueprint] });
    showEntityPick(false, 'ob');
  });
}
/** The link and look of a lit object as its fields say them now: { next } is the location with them, or { error }. Written when the object is applied. */
export function objectBindingDraft(o) {
  const entity = $('obEntity').value.trim();
  if (entity && !/^[a-z_]+\.[a-z0-9_]+$/.test(entity)) return { error: 'The Home Assistant entity looks like light.kitchen' };
  const num = id => ($(id).value.trim() === '' ? undefined : Number($(id).value));
  const useColor = $('obLookUseColor').checked;
  const look = Object.fromEntries(Object.entries({ brightness: num('obLookBri'), lumens: num('obLookLm'), kelvin: useColor ? undefined : num('obLookK'), color: useColor ? $('obLookColor').value : undefined }).filter(([, v]) => v !== undefined));
  const bad = Object.keys(look).length ? checkLook(look) : [];
  if (bad.length) return { error: bad.join('; ') };
  return { next: setBinding(Ed.loc, o.id, { entity, look }) };
}
/** A lamp can give way to the light of a lit object on its level (LA6): the lit objects are offered; hidden when there are none. */
function showUseLight(x) {
  const lit = x.kind === 'lamp' ? (level().objects || []).filter(o => litOf(o)) : [];
  $('xUseRow').hidden = !lit.length;
  $('xUseObject').innerHTML = lit.map(o => `<option value="${esc(o.id)}">${esc(o.name || o.id)}</option>`).join('');
}
/** The lamp is removed and the lit object takes its link. A lit object that already has another link is not changed. */
export async function useObjectLight() {
  const x = fixture(), o = (level().objects || []).find(v => v.id === $('xUseObject').value);
  if (!x || !o) return;
  const lampLink = Ed.loc.bindings?.[x.id]?.entity, objLink = Ed.loc.bindings?.[o.id]?.entity;
  if (lampLink && objLink && lampLink !== objLink) { $('xErr').textContent = `${o.id} is already linked to ${objLink}: unlink one of them first.`; return; }
  if (!(await askConfirm(`Use the light of ${o.name || o.id} instead of ${x.name || x.id}?`, { ok: 'Use it' }))) return;
  const r = deleteFixture(Ed.model, Ed.levelId, x.id, opts());
  if (r.report.errors.length) { $('xErr').textContent = r.report.errors.join('; '); return; }
  let next = setBinding(Ed.loc, x.id, { entity: '' });
  if (lampLink) next = setBinding(next, o.id, { entity: lampLink });
  Ed.fixtureId = null; Ed.loc = next; commit(r.model);
  setStatus(`${x.id} removed: ${o.id} gives its light`);
}

export function applyFixture() {
  const x = fixture(), props = {}, num = id => Number($(id).value.trim());
  const bd = !isFresh() && x ? bindingDraft(x) : null;
  if (bd?.error) { $('xErr').textContent = bd.error; return; }
  const bindingChanged = !!bd && !sameBinding(Ed.loc, bd.next, x.id);
  const changed = (id, v) => $(id).value.trim() !== String(v ?? '');
  const nm = nameChange(x.name, $('xName').value);
  if (nm !== undefined) props.name = nm;
  for (const [id, k] of [['xZ', 'z'], ['xRadius', 'radius']]) if (!(lampOnObject(x) && k === 'z') && !$(id).closest('label').hidden && changed(id, x[k])) props[k] = num(id);
  const form = stripForm(x);
  if (lampOnObject(x)) {
    const dx = num('xX') || 0, dy = num('xY') || 0, up = num('xZ') || 0;
    const [ox, oy] = x.attach.offset ?? [0, 0];
    if ([dx, dy, up].some(v => !Number.isFinite(v))) { $('xErr').textContent = 'Values must be numbers of mm.'; return; }
    if ($('xTarget').value !== x.attach.object || dx !== ox || dy !== oy || up !== (x.attach.up ?? 0)) props.attach = { object: $('xTarget').value, ...(dx || dy ? { offset: [dx, dy] } : {}), ...(up ? { up } : {}) };
  } else if (form === 'object') {
    const opt = id => ($(id).value.trim() === '' ? undefined : num(id));
    const start = opt('xStart'), len = opt('xLen'), inset = opt('xInset');
    const next = { object: $('xTarget').value, edge: Number($('xEdge').value), at: $('xAt').value, ...(start ? { offset: start } : {}), ...(len !== undefined ? { length: len } : {}), ...(inset ? { inset } : {}) };
    if (next.object !== x.attach.object || next.edge !== x.attach.edge || next.at !== (x.attach.at ?? 'bottom') || (next.offset ?? 0) !== (x.attach.offset ?? 0) || next.length !== x.attach.length || (next.inset ?? 0) !== (x.attach.inset ?? 0)) props.attach = next;
  } else if (form === 'opening') {
    const next = { opening: $('xTarget').value, side: $('xSide').value, at: $('xAt').value };
    if (next.opening !== x.attach.opening || next.side !== x.attach.side || next.at !== (x.attach.at ?? 'sill')) props.attach = next;
  } else if (x.attach) {
    const w = level().walls.find(v => v.id === x.attach.wall), where = fromOf(x.id, w);
    const shown = offsetFrom({ offset: x.attach.offset, width: 0 }, where), d = num('xOffset');
    const lenChanged = x.kind === 'strip' && changed('xLen', x.attach.length);
    const vertNow = $('xVertical').checked, vertBefore = x.attach.vertical === true;   // runs up the wall (fixes list 48)
    if (changed('xOffset', shown) || $('xSide').value !== x.attach.side || lenChanged || vertNow !== vertBefore) props.attach = { ...x.attach, offset: changed('xOffset', shown) ? offsetTo(d, where) : x.attach.offset, side: $('xSide').value, ...(x.kind === 'strip' ? { length: num('xLen') } : {}) };
    if (props.attach && x.kind === 'strip') { if (vertNow) props.attach.vertical = true; else delete props.attach.vertical; }
    if (!$('xInRow').hidden && $('xIn').value !== (x.attach.opening ?? '')) {                 // stands in an opening, or not any more
      props.attach = { ...(props.attach || x.attach) };
      if ($('xIn').value) props.attach.opening = $('xIn').value; else delete props.attach.opening;
    }
  }
  if (x.pos && (changed('xX', x.pos[0]) || changed('xY', x.pos[1]))) props.pos = [num('xX'), num('xY')];
  if (props.attach && [props.attach.offset, props.attach.length, props.attach.inset].some(v => v !== undefined && (Array.isArray(v) ? !v.every(Number.isFinite) : !Number.isFinite(v)))) { $('xErr').textContent = 'Values must be numbers of mm.'; return; }
  if (Object.entries(props).some(([k, v]) => k !== 'name' && k !== 'attach' && (Array.isArray(v) ? v.some(n => !Number.isFinite(n)) : typeof v === 'object' ? !Number.isFinite(v.offset) : !Number.isFinite(v)))) { $('xErr').textContent = 'Values must be numbers of mm.'; return; }
  if (!Object.keys(props).length && !bindingChanged) { $('xErr').textContent = 'Nothing changed.'; return; }
  const r = Object.keys(props).length ? setFixture(Ed.model, Ed.levelId, Ed.fixtureId, props, opts()) : { model: Ed.model, report: { errors: [] } };
  if (r.report.errors.length) { $('xErr').textContent = r.report.errors.join('; '); return; }
  if (bindingChanged) { if (Ed.dry) Ed.dry.loc = bd.next; else Ed.loc = bd.next; }                   // the link is stored with the house (Save), undone with the model
  commit(bindingChanged && r.model === Ed.model ? { ...Ed.model } : r.model);
  setStatus(`${Ed.fixtureId}: ${[...Object.keys(props), ...(bindingChanged ? ['link'] : [])].join(', ')} changed (not saved yet)`);
}

export function doSplit() {
  const at = Number($('wSplitAt').value);
  if (!Number.isFinite(at) || $('wSplitAt').value.trim() === '') { $('wErr').textContent = 'Type where to split, in mm from the start.'; return; }
  const r = splitWall(Ed.model, Ed.levelId, Ed.wallId, at, opts());
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); setStatus(`Not split: ${r.report.errors.join('; ')}`); return; }
  $('wSplitAt').value = '';
  $('wallsOut').innerHTML = [`Split into ${r.report.parts.join(' and ')}: set each part's thickness and kind on its own.`, ...describeReconcile(r.report)].map(esc).join('<br>');
  commit(r.model);
  setStatus(`${r.report.parts.join(' + ')} (not saved yet)`);
}
