import { loadLocalConfig } from './model/load.js';
import { listHouses, openHouse, houseOptions } from './model/house.js';
import { resolveSettings } from './model/settings.js';
import { validateModel, validateBindings, validateEntities } from './model/validate.js';
import { materialTable, setDesignLibrary } from './model/materials.js';
import { buildModelGeometry } from './geometry/level.js';
import { levelStack, STACK_MODES } from './geometry/stack.js';
import { addLitLamps } from './model/lit.js';
import { collectSnapPoints } from './tools/snap.js';
import { createMeasureTool } from './tools/measure.js';
import { addCheck, deleteCheck } from './edit/ops.js';
import { createPlanView } from './render2d/plan.js';
import { createAssetCache } from './render3d/assets.js';
import { coalesce } from './coalesce.js';
import { createHaClient, resolveConnection, boundEntities } from './ha/client.js';
import { appearance } from './ha/appearance.js';
import { lampGroups } from './ha/lamp-list.js';
import { fixtureAppearance as fixtureAppearanceOf, toggleCalls, canPreview, previewLook } from './ha/fixture.js';
import { doorStates, doorEntities } from './ha/door.js';
import { exportSvg } from './export/svg.js';

const $ = id => document.getElementById(id);
import { chooseLocation, chooseLevel, remember, linkPages } from './model/current.js';
import { compassSvg } from './render2d/compass.js';
import { wirePanelResize } from './panel-resize.js';
import { foldOnPhone } from './fold-note.js';
import { readPrefs, writePrefs, cameraKey } from './model/prefs.js';
import { shadowLevel, SHADOW_LEVELS, SHADOW_LABEL, SHADOW_COUNT } from './model/shadows.js';
import { nightLight } from './model/night.js';
import { northAngleOf } from './model/orientation.js';

// nicer dropdowns (ND2): every select on the page is drawn as the page menu
import { enhanceAll } from './select.js';
enhanceAll();

const params = new URLSearchParams(location.search);
const status = t => ($('status').textContent = t);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The design library's materials (object-designs/materials/library.json): name → entry. Empty when the page cannot read it.
async function loadDesignLibrary() {
  try {
    const res = await fetch('object-designs/materials/library.json', { cache: 'no-store' });
    return res.ok ? await res.json() : {};
  } catch { return {}; }
}

async function main() {
  wirePanelResize($('resizer'), document.querySelector('aside'), 'plantern.viewer.aside', () => window.dispatchEvent(new Event('resize')));
  // ---- location ----
  const index = await listHouses();
  const locId = chooseLocation(index, params.get('loc'));
  const house = await openHouse(index, locId);
  remember(locId); linkPages(locId);
  const locSel = $('loc');
  locSel.innerHTML = houseOptions(index, locId);
  locSel.onchange = () => { remember(locSel.value); params.set('loc', locSel.value); params.delete('level'); location.search = params; };

  const { location: loc, model, baseUrl } = house, localConfig = await loadLocalConfig();
  // saved elsewhere (the Editor, a phone, a git pull): show the new version (the camera and choices are remembered)
  house.watch(() => location.reload());
  // asset models (decision 146): the house's own copy first, then the repo's shared assets/; a model that has loaded
  // (or failed) redraws the plan, and the 3D view places it itself
  // a model can finish loading before the plan exists: the first showLevel() below draws it then
  let planReady = false;
  // Every model that has loaded changes the plan a little (its footprint, its colour). Fifty models loading one after another must not draw
  // the whole level fifty times, so the plan is drawn again after a quiet moment; the 3D view places each model itself when it arrives.
  // A lit object's light arrives from the server after the first drawing: when that adds or moves a lamp, the whole level is drawn again
  // (the 3D view builds its lights and what is clicked from the lamps it is given), otherwise the plan alone.
  const litKey = () => model.levels.flatMap(l => (l.fixtures || []).filter(f => f.derived).map(f => `${f.id}@${f.pos}@${f.z}`)).join('|');
  let litShown = '';
  const planAfterAssets = coalesce(() => {
    if (!planReady) return;
    refreshLit();
    if (litKey() !== litShown) showLevel(); else drawPlan();
  });
  const assets = createAssetCache({ houseBase: baseUrl, sharedBase: '', house: house.id, onChange: planAfterAssets });
  for (const lv of model.levels) for (const o of lv.objects || []) if (o.kind === 'asset') assets.loadFor(o);
  // the design library's colours (decision 64, materials-library plan): a wall side may name one of them
  const library = await loadDesignLibrary();
  setDesignLibrary(library);
  const looks = { materials: materialTable(model, library), baseUrl, assets, assetStatus: n => assets.status(n), assetColour: n => assets.mainColour(n) };     // wall sides: colours, materials, textures; asset models
  document.title = `Plantern · ${loc.name}`;
  $('compass').innerHTML = compassSvg(northAngleOf(model));
  const bindings = loc.bindings || {};

  // ---- derived geometry for all levels (checks and snap refs may span levels) ----
  const geos = buildModelGeometry(model, { headroom: l => resolveSettings(loc, l).stairHeadroom });
  // a lit object is a lamp: its light comes from the server's build (assets.light), and is shown as a lamp of its level (lit.js)
  const refreshLit = () => addLitLamps(model, geos, o => assets.light(o) ?? o.light);
  refreshLit();
  litShown = litKey();
  const allSnaps = model.levels.flatMap(l => collectSnapPoints(model, l, geos.get(l.id)));
  const snapIndex = new Map(allSnaps.map(s => [s.ref, s]));

  // ---- validation ----
  const issues = [...validateModel(model, geos, { library }), ...validateBindings(loc, model)];
  const showIssues = () => {
    $('issues').innerHTML = issues.length
      ? issues.map(i => `<div class="iss ${i.severity}"><b>${esc(i.name || i.id)}</b>${i.name ? ` <small>${esc(i.id)}</small>` : ''}${i.level ?` <small>${esc(i.level)}</small>` : ''}<br>${esc(i.msg)}</div>`).join('')
      : '<small>No problems found.</small>';
    $('issueCount').textContent = issues.length ? `(${issues.length})` : '';
  };
  issues.forEach(i => console[i.severity === 'error' ? 'error' : 'warn'](`[validate] ${i.id}: ${i.msg}`));
  showIssues();

  // ---- level ----
  let level = model.levels.find(l => l.id === chooseLevel(model, locId, params.get('level'))) || null;
  linkPages(locId, level?.id);
  const levelSel = $('level');
  levelSel.innerHTML = model.levels.map(l => `<option value="${esc(l.id)}">${esc(l.name || l.id)}</option>`).join('');
  levelSel.hidden = model.levels.length < 2;
  if (level) levelSel.value = level.id;
  const state = () => ({
    geo: level && geos.get(level.id),
    snaps: level ? allSnaps.filter(s => s.level === level.id) : [],
    index: snapIndex,
    settings: resolveSettings(loc, level),
  });

  // ---- HA ----
  // connections kept by Plantern's server (the token stays there), else config.local.json
  const serverConns = house.server ? await fetch('api/ha/connections').then(r => (r.ok ? r.json() : { connections: [] })).then(b => b.connections.map(c => c.name)).catch(() => []) : [];
  const { name: connName, conn, note } = resolveConnection(loc, localConfig, serverConns);
  let ha;
  try { ha = createHaClient(conn, { entities: boundEntities(loc) }); }
  catch (e) { issues.push({ severity: 'error', id: connName || 'ha', msg: e.message }); showIssues(); ha = createHaClient({ type: 'mock' }, { entities: boundEntities(loc) }); }
  const haNote = foldOnPhone($('haStatus'));                      // on a phone the long note is one line until opened (mobile UX plan S5)
  ha.onStatus((s, detail) => { $('haStatus').textContent = `${connName || 'no connection'} · ${s}${detail ? ` (${detail})` : ''}${note && s === 'mock' ? ` — ${note}` : ''}`; haNote.update(); });

  // A lamp with no link to Home Assistant, or whose light HA cannot reach, can still be clicked on and off here, to see a room lit: a preview in the
  // colour set on the light (its look), kept only until the page is reloaded. Whatever HA reports wins as soon as it reports something.
  const preview = new Map();                                       // fixture id → on
  const previewing = fx => preview.has(fx.id) && canPreview(bindings, id => ha.getState(id), fx);
  const fixtureAppearance = fx => (previewing(fx) ? previewLook(preview.get(fx.id), bindings[fx.id]?.look) : fixtureAppearanceOf(bindings, id => ha.getState(id), fx));
  // door states (a binary_sensor per door, PLANTERN.md §6.1): an open door is drawn open and lets light past
  const doors = () => doorStates(model, bindings, id => ha.getState(id));
  const doorIds = doorEntities(model, bindings);
  // Both views show the same fixture state; the 3D view exists only after it was first opened.
  let view3d = null;
  function applyFixture(fx) {
    const a = fixtureAppearance(fx);
    view.setFixture(fx.id, a);
    view3d?.setFixture(fx.id, a);
  }
  // the 3D view can show several levels: their lamps and switches are all live
  let stackMode = STACK_MODES.includes(readPrefs().stack) ? readPrefs().stack : 'this', exploded = !!readPrefs().exploded, ceilings = !!readPrefs().ceilings;
  const shownLevels = () => levelStack(model, level, stackMode, exploded).map(s => ({ ...s, geo: geos.get(s.level.id) }));
  const refreshFixtures = () => shownLevels().forEach(s => s.level.fixtures?.forEach(applyFixture));
  const build3d = () => view3d.build({ level, geo: state().geo, levels: shownLevels(), settings: state().settings, fixtureLabel, ceilings, ...looks, doorStates: doors() });

  async function toggleFixture(fx) {
    const why = canPreview(bindings, id => ha.getState(id), fx);
    if (why) {
      preview.set(fx.id, !preview.get(fx.id));
      refreshFixtures();
      return status(`${fixtureLabel(fx).split(' → ')[0]}: ${why === 'unbound' ? 'not linked to Home Assistant' : 'Home Assistant has no state for it'}, so this is a preview only${why === 'unbound' ? ' (link it in the Editor to switch the real light)' : ''}`);
    }
    const r = toggleCalls(bindings, id => ha.getState(id), fx);
    if (r.error) return status(r.error);
    try { await Promise.all(r.calls.map(c => ha.callService(c.domain, c.service, {}, c.target))); }
    catch (e) { status(`HA: ${e.message}`); }
  }

  // ---- view + tools ----
  let measure = null;
  const view = createPlanView($('plan'), {
    onFixtureClick: fx => { if (!measure?.isActive()) toggleFixture(fx); },
    onTap: e => measure?.tap(e),
    onHover: e => measure?.hoverAt(e),
    onView: () => measure?.draw(),
  });
  measure = createMeasureTool({
    view, model, getState: state,
    dom: { read: $('read'), pin: $('pin'), checks: $('checks'), status: $('status'), toggle: $('mbtn'), note: $('ckNote') },
    onPin: (a, b, measured) => keepChecks(addCheck(model, { a, b, measured, note: 'pinned in the viewer' }), 'pinned'),
    onRemove: id => keepChecks(deleteCheck(model, id), 'removed', model.checks.find(c => c.id === id)?.solve),
  });
  /**
   * A check pinned or removed here is saved like the Editor saves (only the checks change on this page;
   * the model object is shared by the plan, the snap points and the tools, so its checks are replaced in
   * place). A page that cannot save (read-only storage, a plain static server) keeps it until reload.
   * Removing a check that was in a room's solve re-solves that room: then the page reloads.
   */
  async function keepChecks(r, what, resolves = false) {
    if (r.report.errors.length) { measure.note(r.report.errors.join('; ')); return; }
    const use = checks => { model.checks.splice(0, model.checks.length, ...(checks || [])); measure.refreshChecks(); };
    if (!house.canSave) { use(r.model.checks); measure.note(`Check ${what}, but this house cannot be saved from here (read-only, or no Plantern server): it is kept until the page is reloaded.`); return; }
    measure.note('Saving…');
    try {
      const s = await house.save(r.model);
      if (resolves) { location.reload(); return; }
      use(s.value.checks);
      measure.note(`Check ${what} and saved.`);
    } catch (e) {
      measure.note(e.conflict ? 'Not saved: this house was changed elsewhere meanwhile. Reload the page and try again.' : `Not saved: ${e.message}`);
    }
  }
  const fixtureLabel = fx => {
    const b = bindings[fx.id];
    return `${fx.name ? `${fx.name} (${fx.id})` : fx.id} → ${b?.entity || (b?.controls ? 'controls ' + b.controls.join(', ') : 'unbound')}`;
  };
  // the 2D plan alone, with the lamps as they are (a render draws every lamp as unavailable until they are applied again)
  function drawPlan() {
    refreshLit();                                                  // a light that has just arrived from the server shows now
    view.render({ level, geo: state().geo, settings: state().settings, fixtureLabel, ...looks, doorStates: doors() });
    refreshFixtures();
  }
  function showLevel() {
    refreshLit();
    litShown = litKey();
    planAfterAssets.cancel();                                      // this draws the plan now
    view.render({ level, geo: state().geo, settings: state().settings, fixtureLabel, ...looks, doorStates: doors() });
    if (view3d) build3d();
    restoreCamera();
    refreshFixtures();
    measure.reset();
  }

  // ---- 2D / 3D ----
  // three.js loads lazily (CDN via the import map), so the 2D plan works even when offline.
  let loading3d = null;
  function ensure3d() {
    loading3d ??= import('./render3d/view.js').then(m => {
      $('view3d').replaceChildren();
      view3d = m.createView3d($('view3d'), { onFixtureClick: toggleFixture, onView: keepCamera });
      build3d();
      // the 3D choices last made in this browser: daylight, projection, and the camera for this house and level
      const p = readPrefs();
      if (p.daylight) $('daylight').classList.toggle('on', view3d.setDaylight(true));
      applyShadows();
      applyNight();
      $('proj').classList.toggle('on', p.projection === 'persp');
      restoreCamera();
      refreshFixtures();
      return view3d;
    }).catch(e => {
      loading3d = null;
      console.error(e);
      $('view3d').innerHTML = `<div class="msg">3D view could not load three.js (${esc(e.message)}).<br>It is served from vendor/three/ next to the page; check that folder is there.</div>`;
      throw e;
    });
    return loading3d;
  }
  function setView(v) {
    const is3d = v === '3d';
    $('plan').toggleAttribute('hidden', is3d);        // SVG elements have no .hidden property
    $('view3d').hidden = !is3d;
    $('panel3d').hidden = !is3d;
    $('panel2d').hidden = is3d;
    $('compass').hidden = is3d;
    if (!is3d) view.fit();
    document.querySelectorAll('#viewbar button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    params.set('view', v);
    history.replaceState(null, '', '?' + params);
    writePrefs({ view: v });
    if (is3d) ensure3d().catch(() => {});
  }
  /** The camera for this house and level, as last left (else the framed default), in the last projection. */
  function restoreCamera() {
    if (!view3d || !level) return;
    const p = readPrefs(), cam = p.cameras?.[cameraKey(locId, level.id)];
    if (cam) view3d.setCamera(cam);
    else if (p.projection === 'persp') view3d.setProjection('persp');
  }
  const keepCamera = cam => { if (level) writePrefs({ projection: cam.projection, cameras: { [cameraKey(locId, level.id)]: cam } }); };
  document.querySelectorAll('#viewbar button').forEach(b => (b.onclick = () => setView(b.dataset.view)));
  $('stackRow').hidden = model.levels.length < 2;
  $('stackMode').value = stackMode; $('exploded').checked = exploded; $('ceilings').checked = ceilings;
  const restack = () => { stackMode = $('stackMode').value; exploded = $('exploded').checked; ceilings = $('ceilings').checked; writePrefs({ stack: stackMode, exploded, ceilings }); if (!view3d) return; build3d(); view3d.resetView(); refreshFixtures(); };
  $('stackMode').onchange = restack; $('exploded').onchange = restack; $('ceilings').onchange = restack;
  // shadows: a level per kind of device (the house's settings), changed with the slider and remembered in this browser
  const device = globalThis.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  $('shadowDev').textContent = device === 'mobile' ? 'on this phone or tablet' : 'on this computer';
  function applyShadows() {
    const lvl = shadowLevel(state().settings?.render3d, device, readPrefs().shadows?.[device]);
    $('shadowLvl').value = SHADOW_LEVELS.indexOf(lvl); $('shadowTxt').textContent = SHADOW_LABEL[lvl];
    view3d?.setShadows(SHADOW_COUNT[lvl]);
  }
  $('shadowLvl').oninput = () => {
    const lvl = SHADOW_LEVELS[Number($('shadowLvl').value)];
    writePrefs({ shadows: { ...(readPrefs().shadows || {}), [device]: lvl } });
    applyShadows();
  };
  applyShadows();
  // night light: the ambient light with daylight off, a slider remembered in this browser (night.js)
  function applyNight() {
    const pct = Math.round(nightLight(state().settings?.render3d, readPrefs().night) * 100);
    $('nightLvl').value = pct; $('nightTxt').textContent = `${pct} %`;
    view3d?.setNightLight(pct / 100);
  }
  $('nightLvl').oninput = () => { writePrefs({ night: Number($('nightLvl').value) / 100 }); applyNight(); };
  $('nightReset').onclick = () => { writePrefs({ night: null }); applyNight(); };
  $('shadowReset').onclick = () => { writePrefs({ shadows: { ...(readPrefs().shadows || {}), [device]: null } }); applyShadows(); };
  applyNight();
  $('daylight').onclick = () => { if (!view3d) return; const on = view3d.setDaylight(!view3d.isDaylight()); $('daylight').classList.toggle('on', on); writePrefs({ daylight: on }); };
  $('proj').onclick = () => { if (!view3d) return; const p = $('proj').classList.toggle('on') ? 'persp' : 'ortho'; view3d.setProjection(p); keepCamera(view3d.getCamera()); };
  $('resetView').onclick = () => { if (!view3d) return; view3d.setProjection('ortho'); view3d.resetView(); $('proj').classList.remove('on'); keepCamera(view3d.getCamera()); };
  levelSel.onchange = () => {
    level = model.levels.find(l => l.id === levelSel.value);
    params.set('level', level.id);
    history.replaceState(null, '', '?' + params);
    remember(locId, level.id); linkPages(locId, level.id);
    showLevel();
  };
  planReady = true;
  showLevel();
  setView((params.get('view') || readPrefs().view) === '3d' ? '3d' : '2d');      // the URL, else what was used last
  if (!level) status(`${loc.name}: model has no levels yet`);

  // ---- entity panel ----
  const rows = {};
  // grouped by level and room, highest level first (UX33); what a person reads: the lamp's name in the plan, else what it is and
  // where ("Terrace ceiling lamp", UX29), else Home Assistant's friendly name (filled in below), else the id; the entity id and
  // its state are in the tooltip, not on the row
  const middle = fp => fp && [fp.reduce((t, q) => t + q[0], 0) / fp.length, fp.reduce((t, q) => t + q[1], 0) / fp.length];
  const groups = lampGroups(model, bindings, (lv, x) => geos.get(lv.id)?.fixturePos(x) ?? null, (lv, o) => middle(geos.get(lv.id)?.objectFootprint(o)));
  const openGroups = readPrefs().lampGroupsClosed || {};
  for (const g of groups) {
    const box = document.createElement('details');
    box.className = 'lampgroup'; box.open = !openGroups[g.key];
    const title = g.level ? `${g.room?.name || 'No room'} · ${g.level.name || g.level.id}` : 'Other';
    box.innerHTML = `<summary><span>${esc(title)}</span>${g.entities.length > 1 ? '<span class="all"><button type="button" data-all="on" title="Every light here on">All on</button><button type="button" data-all="off" title="Every light here off">All off</button></span>' : ''}</summary>`;
    box.addEventListener('toggle', () => writePrefs({ lampGroupsClosed: { ...(readPrefs().lampGroupsClosed || {}), [g.key]: !box.open } }));
    box.querySelectorAll('[data-all]').forEach(b => (b.onclick = e => {
      e.preventDefault();
      for (const { id } of g.entities) ha.callService(id.split('.')[0], b.dataset.all === 'on' ? 'turn_on' : 'turn_off', {}, { entity_id: id }).catch(err => status(`HA: ${err.message}`));
    }));
    $('ents').appendChild(box);
    for (const { id, name } of g.entities) {
      const d = document.createElement('div');
      d.className = 'row';
      d.innerHTML = `<div class="ent"><span class="nm">${esc(name)}</span><label class="sw"><input type="checkbox" role="switch" aria-label="${esc(name)}"><span class="knob"></span></label></div>${id.startsWith('light.') ? '<input type="range" min="1" max="255" aria-label="Brightness">' : ''}`;
      box.appendChild(d);
      const [cb, rg] = d.querySelectorAll('input');
      rows[id] = { d, cb, rg, nm: d.querySelector('.nm'), named: name !== id };
      const domain = id.split('.')[0], call = (svc, data) => ha.callService(domain, svc, data, { entity_id: id }).catch(e => status(`HA: ${e.message}`));
      cb.onchange = () => call(cb.checked ? 'turn_on' : 'turn_off', {});
      if (rg) rg.onchange = () => call('turn_on', { brightness: +rg.value });
    }
  }
  if (!Object.keys(rows).length) $('ents').innerHTML = '<small>No bindings in location.json.</small>';
  const refreshRow = id => {
    const r = rows[id];
    if (!r) return;
    const s = ha.getState(id), a = appearance(s);
    r.d.classList.toggle('missing', !a.available);
    if (!r.named && s?.attributes?.friendly_name) { r.nm.textContent = s.attributes.friendly_name; r.cb.setAttribute('aria-label', s.attributes.friendly_name); }
    r.nm.title = `${id} · ${s ? s.state : 'not found in HA'}`;
    r.cb.disabled = !a.available;
    r.cb.checked = a.on;
    if (r.rg) { r.rg.disabled = !a.on; r.rg.value = s?.attributes?.brightness ?? 255; }
  };
  Object.keys(rows).forEach(refreshRow);

  // Only fixtures touched by the changed entity are updated.
  const affected = new Map();
  for (const [fxId, b] of Object.entries(bindings)) {
    const ents = b.entity ? [b.entity] : (b.controls || []).map(c => bindings[c]?.entity).filter(Boolean);
    for (const e of ents) affected.set(e, [...(affected.get(e) || []), fxId]);
  }
  ha.subscribe(id => {
    refreshRow(id);
    // every level on show, not only the selected one: the 3D view can show the floors below and above too (stack setting)
    const fxs = level ? shownLevels().flatMap(s => s.level.fixtures || []) : [];
    for (const fxId of affected.get(id) || []) { const fx = fxs.find(f => f.id === fxId); if (fx) applyFixture(fx); }
    // a door sensor changed: the leaf and the light through the door follow. The whole level is drawn again the way a level change does it, so the
    // lamps keep their state and the 3D camera stays where it was (a render alone draws every lamp as unavailable)
    if (level && doorIds.has(id)) showLevel();
  });

  ha.connect().then(() => {
    issues.push(...validateEntities(loc, ha));
    showIssues();
    refreshFixtures();
    Object.keys(rows).forEach(refreshRow);
  }).catch(e => status(`HA: ${e.message}`));

  // ---- export ----
  const fileBase = () => `${loc.id}${level ? '-' + level.id : ''}`;
  $('expSvg').onclick = () => { if (!level) return status('nothing to export'); exportSvg($('plan'), fileBase() + '.svg'); };
  $('expGlb').onclick = async () => {
    if (!level) return status('nothing to export');
    try {
      const v = await ensure3d();
      const { exportGlb } = await import('./export/glb.js');
      await exportGlb(v.root, fileBase() + '.glb');
      status(`${fileBase()}.glb exported`);
    } catch (e) { status(`GLB export failed: ${e.message}`); }
  };
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(model, null, 2)); status(`${loc.model || 'model.json'} copied`); }
    catch { status('clipboard blocked'); }
  };
}

main().catch(e => {
  console.error(e);
  if (e.noHouses) { status(e.message); $('issues').innerHTML = `<div class="iss">${e.html}</div>`; return; }
  status(`Failed to start: ${e.message}`);
  $('issues').innerHTML = `<div class="iss error">${esc(e.message)}</div>`;
});
