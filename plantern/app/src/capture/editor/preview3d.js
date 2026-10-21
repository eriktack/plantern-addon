// The Editor's 3D preview pane (docs/archive/2026-10-21-live-3d-preview.md): the thing being edited, with the values the form says now, in its surroundings, in 3D.
// It draws the draft that live-preview.js publishes (draft-bus.js: the real Apply run as a dry run, shared with the plan), cut down to the room round
// the selection (focus.js) and drawn by the viewer's createView3d(). Nothing is stored. It is built only while the pane is open, after its own pause,
// and three.js is loaded the first time something is shown. Lights can be switched on and off here (a preview that never calls Home Assistant), by day
// or by night, and Before shows what is stored now while the button is held.

import { Ed } from './state.js';
import { $, geosFor, level } from './core.js';
import { onDraft } from './draft-bus.js';
import { selected } from './session.js';
import { nameOf } from './selection.js';
import { draw } from './plan-draw.js';
import { focusLevel, FOCUS_RADIUS } from '../../render3d/focus.js';
import { createAssetCache } from '../../render3d/assets.js';
import { readPrefs, writePrefs } from '../../model/prefs.js';
import { resolveSettings } from '../../model/settings.js';
import { materialTable } from '../../model/materials.js';
import { litLamps } from '../../model/lit.js';
import { assetKey } from '../../model/assets.js';
import { nightLight } from '../../model/night.js';
import { SHADOW_COUNT } from '../../model/shadows.js';
import { canPreview } from '../../ha/fixture.js';
import { openByDefault, paneAppearance, showsNight } from '../preview-pane.js';
import { wirePanelResize } from '../../panel-resize.js';

/** The pause before the pane builds: the plan draws at the dry run's pace, the 3D view only when the form has been still for a moment. */
export const PANE_MS = 200;
/** How see-through the walls round the thing are (the walls that are not its own). */
const DIM_OPACITY = 0.3;
/** What the pane shows: the thing being edited, else the thing selected; null when there is none (a new room not measured yet). */
export function previewSelection() {
  const e = Ed.editing;
  if (e) return e.id !== null && e.id !== undefined ? { kind: e.kind, id: e.id } : null;
  return selected();
}

/** The links of the house as the pane shows them: the form's draft when it changes them, else the stored ones. */
const bindingsNow = () => (Ed.pv.draft?.loc ?? Ed.loc)?.bindings ?? {};
/** A state of Home Assistant if the Editor has read them (the server's connection), else nothing: then lights are previews only. */
const stateOf = id => Ed.haStates?.find(s => s.entity_id === id);
const labelOf = fx => fx.name || fx.id;

// ---- the pane ----

const pv = () => Ed.pv;
const msg = text => { $('pvMsg').textContent = text || ''; $('pvMsg').hidden = !text; };
const note = text => { $('pvNote').textContent = text || ''; $('pvNote').hidden = !text; };

function setNote() {
  const p = pv();
  note(p.error ? `Build failed: ${p.error}` : p.updating > 0 ? 'Updating…' : p.before ? 'Before: what is stored now' : '');
}

/** Opens or closes the pane. A choice made by the person is remembered; closing frees the renderer. */
export function setPreviewOpen(open, { remember = true } = {}) {
  const p = pv();
  p.open = open;
  $('pv').hidden = !open;
  $('pvResizer').hidden = !open;
  $('pvToggle').classList.toggle('on', open);
  $('pvToggle').setAttribute('aria-pressed', String(open));
  $('edPv').classList.toggle('on', open);
  $('edPv').setAttribute('aria-pressed', String(open));
  if (remember) writePrefs({ editorPreview3d: open });
  if (open) schedulePane();
  else disposePane();
  draw();                                                            // the plan has the room the pane took, or gave back
}
export const togglePreview = () => setPreviewOpen(!pv().open);

function disposePane() {
  const p = pv();
  clearTimeout(p.timer); p.timer = 0; p.seq++;
  try { p.view?.dispose(); } catch (e) { console.error(e); }
  p.view = null; p.loading = null; p.frameKey = null;
}

/** Asks for a build after the pane's own pause (only the newest ask counts). With the pane closed nothing is built. */
export function schedulePane() {
  const p = pv();
  if (!p.open) return;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => { p.timer = 0; build(); }, PANE_MS);
}

/** three.js and the view, made the first time something is shown. */
function ensureView() {
  const p = pv();
  p.loading ??= import('../../render3d/view.js').then(m => {
    const view = m.createView3d($('pvCanvas'), { onFixtureClick: lightClick });
    view.setShadows(SHADOW_COUNT[globalThis.matchMedia?.('(pointer: coarse)').matches ? 'few' : 'average']);
    p.view = view;
    return view;
  }).catch(e => { p.loading = null; throw e; });
  return p.loading;
}

/** The pane's own asset cache: models, not the Editor's sceneless one (the Editor stays light). A model arriving may change a lamp, so the pane is built again. */
function paneAssets() {
  const p = pv();
  if (!p.assets || p.assetsFor !== Ed.house) {
    p.assetsFor = Ed.house;
    const base = Ed.house?.baseUrl ?? null;
    p.cache = createAssetCache({ houseBase: base, sharedBase: '', house: Ed.house?.id ?? null, onChange: () => schedulePane() });
    // The edited object has a new model on its way when its options changed: until the answer arrives the model it had stays on screen (one request per pause:
    // the answer comes from draftObjectBuild() in panel-object.js, which also feeds the size line), never a second request from here.
    p.assets = {
      loadFor: o => {
        const key = assetKey(o);
        if (o.blueprint && p.cache.status(key) === 'unknown' && p.edited?.id === o.id && key !== p.edited.storedKey) {
          const standIn = p.cache.entry(p.edited.storedKey) ?? p.cache.loadFor(p.edited.stored);
          return standIn;
        }
        return p.cache.loadFor(o);
      },
      light: o => p.cache.light(o),
    };
  }
  return p.assets;
}

/** The answer of a build the Editor asked the server for (a blueprint object's draft options): the pane loads that model and shows it. */
export function paneModelAnswer(o, answer) {
  const p = pv();
  if (!p.open || !p.assets) return;
  p.cache.loadFromAnswer(o, answer);
}
/** An object's build is on its way (or finished, or failed with `error`): the pane says so and keeps the last good model. */
export function paneBuilding(state, error = '') {
  const p = pv();
  if (state === 'start') { p.updating++; p.error = ''; } else { p.updating = Math.max(0, p.updating - 1); p.error = error || ''; }
  if (p.open) setNote();
}

const keyOf = (sel, levelId) => `${levelId}|${sel.kind}|${sel.id}`;

async function build() {
  const p = pv();
  if (!p.open) return;
  const sel = previewSelection(), lv = level();
  if (!sel || !lv || !Ed.model) {
    p.sel = null; p.frameKey = null;
    $('pvWhat').textContent = '';
    p.view?.build({ levels: [], settings: {} });                       // an empty scene: nothing is selected
    msg('Select or edit something on the plan to see it here in 3D.');
    setNote();
    return;
  }
  const seq = ++p.seq;
  let view;
  try { view = await ensureView(); } catch (e) { msg(`The 3D view could not load three.js (${e.message}).`); return; }
  if (seq !== p.seq || !p.open) return;

  const draft = p.before ? null : p.draft;
  const model = draft?.model ?? Ed.model, loc = draft?.loc ?? Ed.loc;
  const f = focusLevel(model, Ed.levelId, sel, FOCUS_RADIUS, geosFor(model));
  if (!f) { msg('This level is not in the model.'); return; }
  const assets = paneAssets();

  // the object being edited, with the settings it is stored with: the model its stand-in is until the draft's own model has arrived
  const stored = sel.kind === 'object' ? (level().objects || []).find(o => o.id === sel.id) : null;
  p.edited = stored?.blueprint ? { id: stored.id, stored, storedKey: assetKey(stored) } : null;

  // a lit object is a lamp of its level (lit.js): from its light as the server built it, else as stored
  const lightOf = o => p.cache.light(o) ?? o.light ?? null;
  f.level.fixtures = [...(f.level.fixtures || []).filter(x => !x.derived), ...litLamps(f.level, f.geo, lightOf)];

  const settings = resolveSettings(loc, f.level), key = keyOf(sel, Ed.levelId), fresh = p.frameKey !== key;
  const dim = p.solidWalls || !f.focus.dim.length ? null : { ids: new Set(f.focus.dim), opacity: DIM_OPACITY };
  p.focus = f.focus; p.fixtures = f.level.fixtures; p.settings = settings; p.elevation = f.level.elevation || 0;
  msg('');
  view.build({
    level: f.level, geo: f.geo, settings, fixtureLabel: labelOf, materials: materialTable(model), baseUrl: Ed.house?.baseUrl ?? '',
    assets, doorStates: null, keepView: !fresh, dim,
  });
  if (fresh) { p.frameKey = key; p.side = 1; frameFocus(); }
  $('pvWhat').textContent = nameOf(sel.id);
  $('pvSide').hidden = !f.focus.azimuth;
  applyLooks();
  setNote();
}

/** Aims the camera at what is being edited, from the side the person chose (a thing on a wall: along the wall's normal). */
function frameFocus() {
  const p = pv();
  if (!p.view || !p.focus) return;
  const az = p.focus.azimuth ? p.focus.azimuth.map(v => v * p.side) : null;   // from the middle of the thing's room; Other side turns it round
  p.view.frame(p.focus, p.elevation, { azimuth: az });
}

/** Whether the pane shows night now (a lit object is a light once its build has said so). */
const nightNow = bindings => showsNight(pv().dayChoice, pv().lightsUsed, previewSelection(), level(), bindings, o => o.light ?? pv().cache?.light(o) ?? null);

/** Light and sky of the pane: the lamps as previewed, daylight or night. */
function applyLooks() {
  const p = pv();
  if (!p.view) return;
  const bindings = bindingsNow(), byId = new Map((p.fixtures || []).map(x => [x.id, x]));
  for (const fx of p.fixtures || []) p.view.setFixture(fx.id, paneAppearance(fx, bindings, p.lights, stateOf, id => byId.get(id)));
  const night = nightNow(bindings);
  p.view.setDaylight(!night);
  if (night) p.view.setNightLight(nightLight(p.settings?.render3d, readPrefs().night));
  $('pvDay').textContent = night ? 'Night' : 'Day';
  $('pvDay').classList.toggle('on', night);
}

/** A click on a lamp, strip, lit object or switch in the pane: a preview of that light being on or off (never sent to Home Assistant). */
function lightClick(fx) {
  const p = pv(), bindings = bindingsNow();
  if (fx.kind === 'switch') {
    const controlled = bindings[fx.id]?.controls || [];
    if (!controlled.length) { note(`${labelOf(fx)} controls no lamp here: pick the lamps it controls in its form to try it.`); return; }
    const byId = new Map((p.fixtures || []).map(x => [x.id, x])), on = id => !!paneAppearance(byId.get(id) ?? { id, kind: 'lamp' }, bindings, p.lights, stateOf, i => byId.get(i)).on;
    const to = !controlled.some(on);
    for (const id of controlled) p.lights.set(id, to);
  } else {
    if (!canPreview(bindings, stateOf, fx)) { note(`${labelOf(fx)} is linked to Home Assistant and shown as it is there.`); return; }
    p.lights.set(fx.id, !p.lights.get(fx.id));
  }
  p.lightsUsed = true;
  note('');
  applyLooks();
}

/** All previewable lights on or off at once (the lamps and strips with nothing to switch, or whose state Home Assistant does not give). */
function allLights(on) {
  const p = pv(), bindings = bindingsNow();
  for (const fx of p.fixtures || []) if ((fx.kind === 'lamp' || fx.kind === 'strip') && canPreview(bindings, stateOf, fx)) p.lights.set(fx.id, on);
  p.lightsUsed = true;
  applyLooks();
}

/** Wires the pane's markup; the pane is open or closed as the person last left it, else open on a desktop. */
export function wirePreview3d() {
  const p = pv();
  onDraft(d => { p.draft = d; schedulePane(); });
  $('pvToggle').onclick = togglePreview;
  $('edPv').onclick = togglePreview;                                 // the same button in the edit bar's row, where the form is (a phone has no plan tools in reach)
  $('pvClose').onclick = () => setPreviewOpen(false);
  $('pvReset').onclick = () => { p.side = 1; frameFocus(); };
  $('pvSide').onclick = () => { p.side = -p.side; frameFocus(); };
  $('pvWalls').onclick = () => { p.solidWalls = !p.solidWalls; $('pvWalls').textContent = p.solidWalls ? 'Walls: solid' : 'Walls: dimmed'; build(); };
  $('pvOn').onclick = () => allLights(true);
  $('pvOff').onclick = () => allLights(false);
  $('pvDay').onclick = () => {
    const night = nightNow(bindingsNow());
    p.dayChoice = night ? 'day' : 'night';
    applyLooks();
  };
  // Before: what is stored now, for as long as the button is held
  const hold = on => () => { if (p.before === on) return; p.before = on; clearTimeout(p.timer); build(); };
  const before = $('pvBefore');
  before.addEventListener('pointerdown', hold(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) before.addEventListener(ev, hold(false));
  before.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true)(); } });
  before.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hold(false)(); });
  wirePanelResize($('pvResizer'), $('pv'), 'plantern.editor.preview3d', () => { draw(); window.dispatchEvent(new Event('resize')); }, () => $('pv').getBoundingClientRect().right);
  const choice = readPrefs().editorPreview3d;
  setPreviewOpen(typeof choice === 'boolean' ? choice : openByDefault(), { remember: false });
}
