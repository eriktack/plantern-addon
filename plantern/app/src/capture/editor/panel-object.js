// Editor page: panel-object. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { addObject, setObject } from '../../edit/ops.js';
import { cabinetRun, worktopOverRun } from '../../edit/worktop.js';
import { isOnObject, hostFrame, offsetFor } from '../../model/on-object.js';
import { pointInPolygon } from '../../geometry/polygon.js';
import { createAssetCache, listAssetNames } from '../../render3d/assets.js';
import { coalesce } from '../../coalesce.js';
import { blueprintMap } from '../../blueprints/place.js';
import { createParamForm } from '../../param-form.js';
import { optionsChanged, sizeFields, sizeEdit } from '../../blueprints/size.js';
import { assetKey, builtSizeStatus, builtFields, ASSET_NAME } from '../../model/assets.js';
import { isHosted, hostedWhere } from '../../model/hosted.js';
import { cornerAt } from '../../edit/inspect.js';
import { hostsOf, appliesTo } from '../../../object-designs/lib/params.js';
import { placedAs, switchPlacement, openingsNear } from '../../edit/placement.js';
import { buildLevelGeometry } from '../../geometry/level.js';
import { openingIcon, openingHint } from '../option-hints.js';
import { displayName } from '../../model/names.js';
import { sameBinding } from '../../ha/suggest.js';
import { afterLeave, dropFresh, enterEdit, mayLeave, setStatus, startFresh } from './session.js';
import { $, commit, esc, geosFor, level, object, opts } from './core.js';
import { draw } from './plan-draw.js';
import { showIssues } from './room-apply.js';
import { assetNote, builds, checkBuild, fillAssetNames, refreshWallMeasure } from './add-menus.js';
import { nameOf, titleHtml } from './selection.js';
import { objectBindingDraft, showObjectLight } from './panel-fixture.js';
import { fillCopyInto } from './copy.js';
import { numOf } from './panel-stairs.js';
import { paneBuilding, paneModelAnswer } from './preview3d.js';
import { Ed } from './state.js';


// ---- objects: boxes with a size, on a wall or standing in a room ----
export async function placeObject(spec, what) {
  if (!(await mayLeave())) return;
  if (!dropFresh([spec.attach?.wall])) return;
  const base = Ed.model, r = addObject(Ed.model, Ed.levelId, spec, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  commit(r.model);
  enterEdit('object', r.object.id, { ask: false }); startFresh('object', r.object.id, base, 'object');
  setStatus(`${r.object.id} is a new object ${what}. Name it and Apply to create it`);
}
export function assetCache() {
  if (!Ed.assets) {
    const houseBase = Ed.house?.baseUrl ?? null;
    // a model that has loaded redraws the plan and the panels, once after a quiet moment however many arrive in a row
    Ed.assets = createAssetCache({ houseBase, sharedBase: '', house: Ed.house?.id ?? null, sceneless: true, onChange: coalesce(() => { draw(); showIssues(); showObject(); }) });
    // the whole house in one request: sizes, lights and footprint colours of every blueprint object (PF14, PF15), no model files, no three.js
    Ed.assets.prefetch((Ed.model?.levels || []).flatMap(l => l.objects || []).filter(o => o.kind === 'asset' && o.blueprint));
    listAssetNames({ houseBase, sharedBase: '' }).then(names => { Ed.assetNameList = names; fillAssetNames(); });
    loadBlueprintList();
  }
  return Ed.assets;
}
function loadBlueprintList() {
  Ed.blueprints = Ed.blueprintList = null;
  if (!Ed.house?.server) return;
  fetch(`api/houses/${encodeURIComponent(Ed.house.id)}/blueprints`, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(list => { if (list) { Ed.blueprints = blueprintMap(list); Ed.blueprintList = list.blueprints; showIssues(); } })
    .catch(() => {});
}
export const optionLibrary = {};            // the materials library (names and colours), read once for the material fields

/** Shows the options form for a blueprint object (built again from its stored values when another object, or a changed one, is shown). */
async function showOptions(o) {
  const meta = o.blueprint && Ed.blueprints?.get(o.blueprint);
  $('obOptionsBox').hidden = !meta;
  if (!meta) { Ed.optionsShownFor = null; return; }
  if (Ed.optionsShownFor === o) return;
  Ed.optionsShownFor = o;
  Ed.optionLibraryLoaded ??= fetch('object-designs/materials/library.json').then(r => (r.ok ? r.json() : {})).then(l => Object.assign(optionLibrary, l)).catch(() => {});
  await Ed.optionLibraryLoaded;
  if (Ed.optionsShownFor !== o) return;                           // another object was shown meanwhile
  Ed.optionsForm ??= createParamForm({ container: $('obOptions'), summary: $('obOptionsSummary'), library: optionLibrary, onValid: optionsChangedNow });
  Ed.optionsForm.show(meta, { params: o.params, partMaterials: o.partMaterials });
  $('obOptionsNote').textContent = '';
}

/**
 * The server's build of the object with the options in the form now: { hash, size, light, colour }, asked once per pause. The answer is the size line's and the 3D
 * preview's (docs/archive/2026-10-21-live-3d-preview.md PV5): the pane loads that model from it without asking again, and says "Updating…" until it has arrived. Throws with the reason.
 */
export async function draftObjectBuild(o, form) {
  const draft = { ...o, params: form.params, partMaterials: form.partMaterials };
  paneBuilding('start');
  try {
    const built = await assetCache().rebuild(draft);
    paneModelAnswer(draft, built);
    paneBuilding('end');
    return built;
  } catch (e) { paneBuilding('end', e.message); throw e; }
}

/** The options form has a valid new value (after its own pause): the plan and the 3D preview show the draft (a button row sends no input event of its own), and the server is asked what it builds. */
function optionsChangedNow() {
  $('obOptions').dispatchEvent(new Event('input', { bubbles: true }));
  previewOptions();
}

/** After a pause in the options form: what these options would build (the server's answer), until Apply takes them. */
async function previewOptions() {
  const o = object(), meta = o?.blueprint && Ed.blueprints?.get(o.blueprint);
  if (!meta || Ed.optionsShownFor !== o) return;
  const form = Ed.optionsForm.readForObject();
  $('obOptionsNote').textContent = 'Building…';
  try {
    const built = await draftObjectBuild(o, form);
    if (object()?.id !== o.id) return;
    Ed.optionsForm.setBuildError(null);
    $('obOptionsNote').textContent = optionsChanged(meta, o, form) ? `With these options it builds ${built.size.join(' × ')} mm. Apply to use them.` : '';
  } catch (e) {
    if (object()?.id !== o.id) return;
    Ed.optionsForm.setBuildError(e.message);
    $('obOptionsNote').textContent = '';
  }
}

export function showBlueprintNote(o) {
  const box = $('obBlueprint');
  $('obAssetRow').hidden = $('obAssetNote').hidden = !!o.blueprint;
  box.hidden = !o.blueprint;
  const sizeInputs = ['obW', 'obD', 'obH'];
  if (!o.blueprint) { for (const id of sizeInputs) { $(id).readOnly = false; $(id).title = ''; } return; }
  const options = `object-designs/index.html?${new URLSearchParams({ loc: Ed.house?.id ?? '', object: o.id })}`;
  let html = `Made from blueprint <b>${esc(o.blueprint)}</b> · <a href="${esc(options)}">Edit options</a>`;
  const key = assetKey(o), b = builds.get(key);
  if (!b) checkBuild(o);
  if (!b || b.state === 'checking') html += '<div class="help">Checking the build with these options…</div>';
  else if (b.state === 'error') html += `<div class="help">Plantern's server cannot build it now (${esc(b.error)}), so the size is not checked. The object keeps its size.</div>`;
  else {
    const st = builtSizeStatus(o, b.size);
    if (st.matches) html += `<div class="help">The size is the build's: ${esc(b.size.join(' × '))} mm.</div>`;
    else html += `<div><b class="warn">The build is ${esc(b.size.join(' × '))} mm.</b> ${esc(st.reason)} The 3D model is the build; the plan and what is attached to the object use the size here.</div>`;
    if (b.checked) html += `<div class="help">${b.changedFrom ? `Checked now: the build changed from ${esc(b.changedFrom.join(' × '))} mm.` : 'Checked now: the build is unchanged.'}</div>`;
  }
  // the size is the outer box of the build, so a typed size changes the option that sets it (src/blueprints/size.js); an axis no option sets is read-only
  const meta = Ed.blueprints?.get(o.blueprint);
  if (meta) {
    const fields = sizeFields(meta, o.params);
    sizeInputs.forEach((id, i) => { $(id).readOnly = !fields[i].param; $(id).title = fields[i].param ? `Set by ${fields[i].param.label}` : 'Set by the build of the blueprint, not by an option'; });
    const range = p => (p.max === undefined ? `from ${p.min}` : `${p.min}–${p.max}`);
    html += `<div class="help">Typing a size changes the option that sets it, and the object is built again. ${fields.map(f => `${f.name}: ${f.param ? `${esc(f.param.label)} (${range(f.param)} ${esc(f.param.unit)})` : 'the build (read-only)'}`).join(' · ')}.</div>`;
  }
  // a base cabinet can carry a worktop in one piece over the run it stands in (docs/archive/2026-10-28-kitchen.md K2)
  const run = o.blueprint === 'kitchen-cabinet' && Ed.blueprints ? cabinetRun(Ed.model, Ed.levelId, o.id, Ed.blueprints) : null;
  html += '<div class="btns">' + (b?.state === 'ok' && builtSizeStatus(o, b.size)?.matches === false ? '<button type="button" id="obUseBuilt">Use the built size</button>' : '') + '<button type="button" id="obRebuild">Check the build</button>'
    + (run?.run ? `<button type="button" id="obWorktopRun" title="One worktop over ${run.run.length === 1 ? 'this cabinet' : `the ${run.run.length} cabinets in a row with this one`}; their own worktops are turned off">Worktop over this run</button>` : '')
    + (takesHoles(o) ? setIntoChoices().map((c, i) => `<button type="button" class="obSetNew" data-i="${i}" title="A new ${esc(c.label.toLowerCase())} set into this worktop, in its middle; the worktop gets its hole">Set ${esc(c.article)} ${esc(c.label.toLowerCase())} into it</button>`).join('') : '')
    + nicheChoices(o).map(c => `<button type="button" class="obNiche" data-niche="${c.niche}" title="A built-in ${esc(c.kind)} sized to the niche (${esc(c.size)} mm), its front flush with the doors">${esc(c.label)}</button>`).join('')
    + (isOnObject(o) ? `<button type="button" id="obLiftOut" title="It stays where it stands, as a free object, and the hole goes">Lift out of ${esc(nameOf(o.on.object))}</button>` : '')
    + (cuts(o) && !isOnObject(o) && hostUnder(o) ? `<button type="button" id="obSetInto" title="It is set into it where it stands; moving the worktop then moves it">Set into ${esc(nameOf(hostUnder(o).id))}</button>` : '')
    + '</div>';
  box.innerHTML = html;
  box.querySelectorAll('.obSetNew').forEach(b => b.addEventListener('click', () => setNewInto(o, setIntoChoices()[Number(b.dataset.i)])));
  $('obSetInto')?.addEventListener('click', () => setInto(o, hostUnder(o)));
  box.querySelectorAll('.obNiche').forEach(b => b.addEventListener('click', () => putInNiche(o, Number(b.dataset.niche))));
  $('obLiftOut')?.addEventListener('click', () => {
    const r = setObject(Ed.model, Ed.levelId, o.id, { on: null }, opts());
    if (r.report.errors.length) { $('obErr').textContent = r.report.errors.join('; '); return; }
    commit(r.model);
    setStatus(`${o.id} stands free now; its hole is gone (not saved yet)`);
  });
  $('obWorktopRun')?.addEventListener('click', async () => {
    if (!(await mayLeave())) return;
    const r = worktopOverRun(Ed.model, Ed.levelId, o.id, opts());
    if (r.report.errors.length) { $('obErr').textContent = r.report.errors.join('; '); return; }
    commit(r.model);
    enterEdit('object', r.worktop.id, { ask: false });
    setStatus(`${r.worktop.id}: one worktop over ${r.cabinets.join(', ')}, ${r.worktop.size[0]} mm long; their own worktops are off (not saved yet)`);
  });
  $('obUseBuilt')?.addEventListener('click', () => {
    const size = [...b.size];
    const r = setObject(Ed.model, Ed.levelId, o.id, { size, ...builtFields(b) }, opts());
    if (r.report.errors.length) { $('obErr').textContent = r.report.errors.join('; '); return; }
    commit(r.model);
    setStatus(`${o.id}: size is now the built ${size.join(' × ')} mm (not saved yet)`);
  });
  $('obRebuild').addEventListener('click', () => checkBuild(o, { force: true }));
}

// ---- objects set into a worktop (docs/archive/2026-10-28-kitchen.md K4): a sink stands in its hole, and the worktop is cut for it ----
/** Whether a blueprint object takes holes from what is set into it (a worktop: meta.cutouts). */
const takesHoles = o => !!(o?.blueprint && Ed.blueprints?.get(o.blueprint)?.cutouts) && !isOnObject(o);
/** Whether a blueprint object may be set into another object's top (its placement hosts list `surface`). */
const cuts = o => !!hostsOfObject(o)?.includes('surface');
/**
 * The models (and variants) that may be set into a surface, for the worktop's buttons: [{ blueprint, params, label, article }].
 * A model whose variants differ gets one button per variant that may (the appliance's hob); otherwise one for its default.
 */
function setIntoChoices() {
  const out = [];
  for (const b of Ed.blueprintList || []) {
    const variant = b.meta.params.find(d => d.key === 'variant');
    const names = variant ? variant.options : [undefined];
    const fit = names.filter(v => hostsOf(b.meta, v).includes('surface'));
    const one = variant && fit.length === 1 && fit[0] !== variant.default;      // only some variants: name the variant
    for (const v of variant && !one && fit.includes(variant.default) ? [variant.default] : fit) {
      const label = one ? (variant.labels?.[v] ?? v) : b.meta.name;
      out.push({ blueprint: b.id, params: v !== undefined && v !== variant?.default ? { variant: v } : {}, label, article: /^[aeiou]/i.test(label) ? 'an' : 'a' });
    }
  }
  return out;
}
const hostOf = o => level().objects?.find(x => x.id === o.on?.object) ?? null;
/** The object that takes holes and that this free object stands over (its middle inside the host's footprint), or null. */
function hostUnder(o) {
  if (o.attach || !o.pos) return null;
  const geo = geosFor(Ed.model).get(Ed.levelId), fp = geo?.objectFootprint(o);
  if (!fp) return null;
  const mid = [(fp[0][0] + fp[2][0]) / 2, (fp[0][1] + fp[2][1]) / 2];
  return (level().objects || []).find(h => h.id !== o.id && takesHoles(h) && (() => { const hf = geo.objectFootprint(h); return hf && pointInPolygon(mid, hf); })()) ?? null;
}
/** Sets an object into a host where it stands: its hole comes from the server's build. */
async function setInto(o, host) {
  if (!host || !(await mayLeave())) return;
  let { cutout, rest } = o;
  if (!cutout) {
    try { ({ cutout = null, rest = null } = await assetCache().rebuild(o)); }
    catch (e) { $('obErr').textContent = `Plantern's server cannot build ${o.id} now (${e.message}), so its hole is not known.`; return; }
  }
  const geo = geosFor(Ed.model).get(Ed.levelId), frame = hostFrame(host, geo.objectFootprint(host));
  const r = setObject(Ed.model, Ed.levelId, o.id, { on: { object: host.id, offset: offsetFor(o, o.pos, frame) }, cutout, rest }, opts());
  if (r.report.errors.length) { $('obErr').textContent = r.report.errors.join('; '); return; }
  commit(r.model);
  setStatus(`${o.id} is set into ${host.id}, which gets its hole (not saved yet)`);
}
/** The empty niches of an appliance housing (its stored `niches`), each with the button's words: [{ niche, kind, label, size }]. */
function nicheChoices(o) {
  if (!Array.isArray(o?.niches) || isOnObject(o) || !Ed.blueprints?.get('appliance')) return [];
  const taken = new Set((level().objects || []).filter(g => g.on?.object === o.id && g.on.niche !== undefined).map(g => g.on.niche));
  return o.niches.map((n, i) => ({ niche: i, kind: n.kind || 'appliance', size: `${n.width} × ${n.depth} × ${n.height}` }))
    .filter(c => !taken.has(c.niche))
    .map(c => ({ ...c, label: `Put ${/^[aeiou]/i.test(c.kind) ? 'an' : 'a'} ${c.kind} in ${o.niches.length > 1 ? `niche ${c.niche + 1}` : 'it'}` }));
}
/** A built-in appliance of the niche's kind, sized to fit it (rounded down to 10 mm, within the appliance's ranges), put in that niche. */
async function putInNiche(host, i) {
  const n = host.niches?.[i], meta = Ed.blueprints?.get('appliance');
  if (!n || !meta) return;
  const range = key => meta.params.find(d => d.key === key);
  const fit = (key, v) => { const d = range(key); return Math.max(d.min, Math.min(d.max, Math.floor(v / 10) * 10)); };
  const kind = meta.params[0].options.includes(n.kind) ? n.kind : 'oven';
  const params = { variant: kind, builtIn: true, width: fit('width', n.width - 4), depth: fit('depth', n.depth), height: fit('height', n.height - 5) };
  let built;
  try { built = await assetCache().rebuild({ blueprint: 'appliance', params, partMaterials: {} }); }
  catch (e) { $('obErr').textContent = `Plantern's server cannot build the ${kind} now: ${e.message}`; return; }
  await placeObject({ blueprint: 'appliance', params, size: built.size, ...builtFields(built), assumed: ['size'], on: { object: host.id, niche: i } }, `in niche ${i + 1} of ${host.id}`);
}
/** A new object of a model that is set into a surface (a sink, a hob), with its default options, in the middle of this worktop. */
async function setNewInto(host, choice) {
  if (!choice) return;
  let built;
  try { built = await assetCache().rebuild({ blueprint: choice.blueprint, params: choice.params, partMaterials: {} }); }
  catch (e) { $('obErr').textContent = `Plantern's server cannot build ${choice.article} ${choice.label.toLowerCase()} now: ${e.message}`; return; }
  await placeObject({ blueprint: choice.blueprint, params: choice.params, size: built.size, ...builtFields(built), assumed: ['size'], on: { object: host.id, offset: [0, 0] } }, `set into ${host.id}`);
}

export function showObject() {
  const o = object();
  if (!o) { Ed.objectId = null; $('objectPanel').hidden = true; return; }
  const lv = level(), w = o.attach && lv.walls.find(v => v.id === o.attach.wall);
  $('obTitle').innerHTML = titleHtml(o);
  $('obInfo').innerHTML = `${isHosted(o) ? `in ${esc(o.attach.opening)}, ${o.attach.at === 'head' ? 'hanging from its head' : o.attach.at === 'frame' ? 'on the inner sill, in its frame' : 'on its sill'}` : o.attach ? `on wall <a href="#" id="obWall">${esc(o.attach.wall)}</a>` : isOnObject(o) ? (o.on.niche !== undefined ? `in niche ${o.on.niche + 1} of ${esc(o.on.object)}` : `set into ${esc(o.on.object)}, turned with it`) : 'standing in the plan'}${o.assumed?.length ? ` · <b class="warn">still default: ${esc(o.assumed.join(', '))}</b>` : ''}`;
  $('obWall')?.addEventListener('click', e => { e.preventDefault(); afterLeave(() => enterEdit('wall', o.attach.wall))(); });
  showBlueprintNote(o);
  showOptions(o);
  showObjectLight(o);
  if (Ed.placeDraftFor !== o.id) { Ed.placeDraft = null; Ed.placeDraftFor = o.id; }
  showPlacedChoice(o);
  $('obColorRow').hidden = o.kind === 'asset';      // a model has its own colours (the plan takes its main one)
  for (const [id, show] of [['obOffsetRow', !!o.attach && !isHosted(o)], ['obSideRow', !!o.attach && !isHosted(o)], ['obGapRow', !!o.attach && !isHosted(o)], ['obXRow', !o.attach], ['obYRow', !o.attach], ['obRotRow', !o.attach]]) $(id).hidden = !show;
  applyPlacedRows(o);   // after the rows above: the Placed choice decides them for a hosted object
  if (w) { const start = cornerAt(lv, w.a); $('obOffsetNote').textContent = start ? `mm from corner ${start.index} of ${start.name}` : "mm from the wall's start"; }
  if (Ed.objectFormFor !== o) {
    $('obName').value = o.name ?? ''; $('obColor').value = o.color || '#888888'; $('obAsset').value = o.asset ?? '';
    [$('obW').value, $('obD').value, $('obH').value] = o.size; $('obHangs').checked = o.hangs === 'ceiling'; $('obZ').value = isHosted(o) ? (geosFor(Ed.model).get(Ed.levelId)?.objectZ(o) ?? '') : (o.z ?? '');
    if (o.attach) { $('obOffset').value = o.attach.offset ?? ''; $('obSide').value = o.attach.side ?? 'right'; $('obGap').value = (isHosted(o) ? o.attach.depth : o.attach.gap) ?? ''; $('obShift').value = isHosted(o) ? (o.attach.shift ?? '') : ''; }
    else { $('obX').value = o.pos[0]; $('obY').value = o.pos[1]; $('obRot').value = o.rotationDeg ?? ''; }
    refreshWallMeasure('ob');
    $('obErr').textContent = ''; $('obAssetNote').textContent = assetNote(o.asset ?? ''); Ed.objectFormFor = o;
    fillCopyInto('object', o);
  }
}
/** The hosts of a blueprint object (placement.hosts, or derived from its mount); null for a box or a model file. */
const hostsOfObject = o => (o.blueprint && Ed.blueprints?.get(o.blueprint) ? hostsOf(Ed.blueprints.get(o.blueprint), o.params?.variant) : null);
/** Which places the object may take, with the reason when it may not (a choice that cannot be used says why). */
function placedChoices(o) {
  const hosts = hostsOfObject(o), openings = level()?.openings || [];
  const at = hosts === null ? ['sill', 'frame', 'head'] : [...(hosts.includes('sill') ? ['sill', 'frame'] : []), ...(hosts.includes('head') ? ['head'] : [])];
  return {
    room: { ok: hosts === null || hosts.includes('room'), reason: 'this model does not stand in a room' },
    wall: { ok: hosts === null || hosts.includes('wall'), reason: 'this model does not stand on a wall' },
    opening: { ok: openings.length > 0 && at.length > 0, reason: !openings.length ? 'no openings on this level' : 'this model does not stand on a sill or at a head' },
    at,
  };
}
/** The switch the draft asks for, as the props it gives, or null when the draft is the object's place already. */
function previewSwitch(o) {
  if (!Ed.placeDraft || Ed.placeDraft.to === placedAs(o)) return null;
  const sw = switchPlacement(o, Ed.placeDraft.to, { level: level(), geo: buildLevelGeometry(level()), opening: Ed.placeDraft.opening, at: Ed.placeDraft.at });
  return sw.props ?? null;
}
/** The rows of the object panel follow the draft: a room shows x, y and turn; a wall shows its offset, side and gap; an opening sets the height. */
function applyPlacedRows(o) {
  const to = Ed.placeDraft?.to ?? placedAs(o);
  for (const [id, shown] of Object.entries({ obXRow: to === 'room', obYRow: to === 'room', obRotRow: to === 'room', obOffsetRow: to !== 'room', obSideRow: to !== 'room', obGapRow: to !== 'room', obShiftRow: to === 'opening' })) $(id).hidden = !shown;
  if (to === 'opening') {
    $('obOffsetNote').textContent = 'mm from the opening\'s near edge; empty = centred';
    $('obGapRow').querySelector('small').textContent = 'mm out from the wall (empty = none)';
    $('obGapRow').hidden = (Ed.placeDraft?.at ?? o.attach?.at) === 'frame';   // the inner sill's place is the window's own depth
  }
  $('obOpeningRow').hidden = to !== 'opening';
  $('obAtRow').hidden = to !== 'opening';
  $('obHangsRow').hidden = to !== 'room';
  const hangs = to === 'room' && $('obHangs').checked;
  $('obZ').readOnly = to === 'opening';
  $('obZ').disabled = hangs;                                        // worked out from the ceiling and the height
  $('obZ').title = to === 'opening' ? 'the opening sets the height' : hangs ? 'it hangs from the ceiling: the bottom is the ceiling minus its height' : '';
}
/** The things in an opening (OB4): the objects hosted by it, its lamps and its LED strips, each selectable, each with a remove button. */
export function showOpeningHosted(o) {
  const lv = level();
  const things = [...(lv.objects || []).filter(x => x.attach?.opening === o.id).map(x => ({ kind: 'object', id: x.id, name: x.name || x.id, what: hostedWhere(x.attach.at) })),
    ...(lv.fixtures || []).filter(x => x.attach?.opening === o.id).map(x => ({ kind: 'fixture', id: x.id, name: x.name || x.id, what: x.kind === 'strip' ? 'LED strip' : 'lamp' }))];
  $('oHosted').innerHTML = things.length
    ? `<div class="help">In this opening</div>` + things.map(t => `<div class="hosted"><button type="button" data-kind="${t.kind}" data-id="${esc(t.id)}">${esc(t.name)} <small>${esc(t.what)}</small></button><button type="button" class="quiet" data-remove="${t.kind}" data-id="${esc(t.id)}">Remove</button></div>`).join('')
    : '';
}

/** Shows the Placed choice: what the object may take, the openings nearest first, and the preview of a switch in the fields. */
export function showPlacedChoice(o) {
  if (!Ed.placeDraft) Ed.placeDraft = { to: placedAs(o), at: o.attach?.at, opening: o.attach?.opening };
  const ch = placedChoices(o), sel = $('obPlaced');
  for (const opt of sel.options) { const c = ch[opt.value]; opt.disabled = c ? !c.ok : false; }
  sel.value = Ed.placeDraft.to;
  const lv = level(), near = openingsNear(lv, geosFor(Ed.model).get(lv.id), o);
  $('obOpening').innerHTML = near.map(n => { const wall = (lv.walls || []).find(w => w.id === n.wall), op = (lv.openings || []).find(x => x.id === n.id); return `<option value="${esc(n.id)}" data-icon="${esc(openingIcon(op?.type))}" data-hint="${esc(openingHint(op, displayName(wall ?? { id: n.wall })))}">${esc(nameOf(n.id))} · ${esc(displayName(wall ?? { id: n.wall }))} · ${Math.round(n.distance)} mm</option>`; }).join('');
  if (!near.some(n => n.id === Ed.placeDraft.opening)) Ed.placeDraft.opening = near[0]?.id;
  $('obOpening').value = Ed.placeDraft.opening ?? '';
  if (!ch.at.includes(Ed.placeDraft.at)) Ed.placeDraft.at = ch.at[0];
    $('obAt').innerHTML = ch.at.map(a => `<option value="${a}" data-icon="${a === 'sill' ? 'sill' : a === 'head' ? 'head' : 'inOpening'}">${hostedWhere(a)}</option>`).join('');
  $('obAt').value = Ed.placeDraft.at ?? '';
  const c = ch[Ed.placeDraft.to];
  $('obPlacedNote').textContent = c && !c.ok ? c.reason : '';
  applyPlacedRows(o);
  // the fields show what the switch would give (the change is made with Apply)
  const p = previewSwitch(o);
  if (p) {
    if (p.pos) { $('obX').value = p.pos[0]; $('obY').value = p.pos[1]; }
    if (p.rotationDeg !== undefined && p.rotationDeg !== null) $('obRot').value = p.rotationDeg;
    if (p.attach?.wall) { $('obOffset').value = p.attach.offset; $('obSide').value = p.attach.side; $('obGap').value = p.attach.gap ?? ''; }
    $('obZ').value = p.z === null || p.z === undefined ? '' : p.z;
  }
}

export async function applyObjectForm() {
  const o = object(), num = numOf, props = {};
  // a pending switch of place (OB1b) gives the position and height itself: the position fields are not read then
  const switchingNow = !!Ed.placeDraft && Ed.placeDraft.to !== placedAs(o);
  const size = [num('obW'), num('obD'), num('obH')];
  if (size.some((v, i) => v !== o.size[i])) props.size = size;
  const hangsNow = $('obHangs').checked && !o.attach && !switchingNow;
  if (hangsNow !== (o.hangs === 'ceiling')) props.hangs = hangsNow ? 'ceiling' : null;
  if (!isHosted(o) && !switchingNow && !hangsNow && num('obZ') !== o.z) props.z = num('obZ');   // a hosted object's height is its opening's
  const name = $('obName').value.trim();
  if (name !== (o.name ?? '')) props.name = name || null;
  if (o.kind !== 'asset' && $('obColor').value !== (o.color || '#888888')) props.color = $('obColor').value;
  // the model: a name makes an asset object (its size is the model's, when its meta.json is there); empty makes a box
  const asset = $('obAsset').value.trim();
  if (asset !== (o.asset ?? '')) {
    if (asset && !ASSET_NAME.test(asset)) { $('obErr').textContent = 'A model name is lower-case letters, digits and -.'; return; }
    props.kind = asset ? 'asset' : 'box';
    props.asset = asset || null;
    const meta = asset ? assetCache().meta(asset) : null;
    if (meta && Array.isArray(meta.size)) props.size = [...meta.size];
  }
  if (switchingNow) {
    // a switch gives the place itself: nothing here moves it
  } else if (isHosted(o)) {
    // hosted: along the opening (empty = centred), out from the wall, on which side, sill or head, and which opening (OB1, OB1b)
    const blank = id => $(id).value.trim() === '';
    const next = { opening: Ed.placeDraft?.opening ?? o.attach.opening, at: Ed.placeDraft?.at ?? o.attach.at, side: $('obSide').value === 'left' ? 'left' : 'right',
      ...(blank('obOffset') ? {} : { offset: num('obOffset') }), ...(blank('obGap') || num('obGap') <= 0 || (Ed.placeDraft?.at ?? o.attach.at) === 'frame' ? {} : { depth: num('obGap') }),
      ...(blank('obShift') || num('obShift') === 0 ? {} : { shift: num('obShift') }) };
    if (JSON.stringify(next) !== JSON.stringify(o.attach)) props.attach = next;
  } else if (o.attach) {
    const gap = $('obGap').value.trim() === '' ? undefined : num('obGap');
    if (num('obOffset') !== o.attach.offset || $('obSide').value !== o.attach.side || gap !== o.attach.gap) props.attach = { ...o.attach, offset: num('obOffset'), side: $('obSide').value, ...(gap === undefined ? { gap: undefined } : { gap }) };
  } else {
    const rot = $('obRot').value.trim() === '' ? 0 : num('obRot');
    if (num('obX') !== o.pos[0] || num('obY') !== o.pos[1]) props.pos = [num('obX'), num('obY')];
    if (rot !== (o.rotationDeg ?? 0)) { props.rotationDeg = rot; props.pos ??= [...o.pos]; }
  }
  if (Object.values(props).some(v => Array.isArray(v) ? v.some(n => !Number.isFinite(n)) : typeof v === 'number' && !Number.isFinite(v))) { $('obErr').textContent = 'Sizes, heights and positions must be numbers of mm.'; return; }
  // the options form of a blueprint object (src/param-form.js): changed options are built again on the server, and the object
  // takes the size of that build; options and a typed size cannot both be applied at once (the size follows the options)
  const bpMeta = o.blueprint && Ed.blueprints?.get(o.blueprint);
  let optionsEdit = null;
  if (bpMeta && Ed.optionsForm && Ed.optionsShownFor === o) {
    if (!Ed.optionsForm.valid) { $('obErr').textContent = 'Some options need a fix first (see Options above).'; return; }
    const form = Ed.optionsForm.readForObject();
    if (optionsChanged(bpMeta, o, form)) optionsEdit = form;
  }
  if (optionsEdit && props.size) { $('obErr').textContent = 'You changed the options and the size: Apply one, then the other (the size follows the options).'; return; }
  // a value the variant does not use (it is ignored, and warned about) is dropped by Apply
  const metaNow = o.blueprint && Ed.blueprints?.get(o.blueprint), variantNow = o.params?.variant;
  const ignored = metaNow ? Object.keys(o.params ?? {}).filter(k => { const d = metaNow.params.find(x => x.key === k); return d && !appliesTo(d, variantNow); }) : [];
  if (ignored.length && props.params === undefined) props.params = Object.fromEntries(Object.entries(o.params).filter(([k]) => !ignored.includes(k)));
  // a lit object's link and light radius (LA4): written with the object, undone with the model
  const bd = !$('obBindBox').hidden ? objectBindingDraft(o) : null;
  if (bd?.error) { $('obErr').textContent = bd.error; return; }
  const bindingChanged = !!bd && !sameBinding(Ed.loc, bd.next, o.id);
  if (!$('obBindBox').hidden && $('obLightRadius').value.trim() !== '') {
    const radius = num('obLightRadius');
    if (!(radius > 0)) { $('obErr').textContent = 'The light radius is a number of mm above 0.'; return; }
    if (radius !== o.lightRadius) props.lightRadius = radius;
  }
  const switching = !!Ed.placeDraft && Ed.placeDraft.to !== placedAs(o);
  if (!Object.keys(props).length && !optionsEdit && !bindingChanged && !switching) { $('obErr').textContent = 'Nothing changed.'; return; }
  if (optionsEdit && !Ed.dry) {                              // (a dry run, for the live preview, never asks the server: the options form asks once per pause, draftObjectBuild())
    $('obErr').textContent = 'Building…';
    let built;
    try { built = await assetCache().rebuild({ ...o, params: optionsEdit.params, partMaterials: optionsEdit.partMaterials }); }
    catch (e) { $('obErr').textContent = `The build with these options failed: ${e.message}`; return; }
    if (object()?.id !== o.id) return;                       // another object was picked meanwhile
    props.params = optionsEdit.params;
    props.partMaterials = Object.keys(optionsEdit.partMaterials).length ? optionsEdit.partMaterials : null;
    props.size = built.size;
    Object.assign(props, builtFields(built));                // its light, holes, rest and niches (decision 285)
  }
  // a dry run (the live preview) keeps the typed options on the draft object, so the 3D preview finds its model by them; the size and the light stay as stored until the server's answer
  else if (optionsEdit) {
    props.params = optionsEdit.params;
    props.partMaterials = Object.keys(optionsEdit.partMaterials).length ? optionsEdit.partMaterials : null;
  }
  // a blueprint object's size is what its options build: a typed size changes the option that sets it, the server builds it again
  // and the object takes the size of that build (src/blueprints/size.js); nothing is applied when that cannot be done
  else if (o.blueprint && props.size && !Ed.dry) {            // a dry run shows the typed footprint without the build
    const meta = Ed.blueprints?.get(o.blueprint);
    if (!meta) { $('obErr').textContent = `The size of a blueprint object follows its options, and the blueprint "${o.blueprint}" is not known here (Plantern's server must be running).`; return; }
    const edit = sizeEdit(meta, o, props.size);
    if (!edit.ok) { $('obErr').textContent = edit.error; return; }
    $('obErr').textContent = 'Building…';
    let built;
    try { built = await assetCache().rebuild({ ...o, params: edit.params }); }
    catch (e) { $('obErr').textContent = `The build with the new size failed: ${e.message}`; return; }
    if (object()?.id !== o.id) return;                       // another object was picked meanwhile
    props.params = edit.params;
    props.size = built.size;                                  // setObject then counts the size as measured (no longer "assumed")
    Object.assign(props, builtFields(built));
  }
  if (switching) {
    // the switch works from the object as it is now, with the size the change gives it (OB1b): the place it takes is the switch's
    const sw = switchPlacement({ ...o, size: props.size ?? o.size }, Ed.placeDraft.to, { level: level(), geo: buildLevelGeometry(level()), opening: Ed.placeDraft.opening, at: Ed.placeDraft.at });
    if (sw.error) { $('obErr').textContent = sw.error; return; }
    Object.assign(props, sw.props);
  }
  const r = setObject(Ed.model, Ed.levelId, Ed.objectId, props, opts());
  if (r.report.errors.length) { $('obErr').textContent = r.report.errors.join('; '); return; }
  $('obErr').textContent = '';
  if (bindingChanged) { if (Ed.dry) Ed.dry.loc = bd.next; else Ed.loc = bd.next; }                   // the link is stored with the house (Save), undone with the model
  commit(bindingChanged && r.model === Ed.model ? { ...Ed.model } : r.model);
  setStatus(`${Ed.objectId}: ${[...Object.keys(props), ...(bindingChanged ? ['light link'] : [])].join(', ')} changed (not saved yet)`);
}
