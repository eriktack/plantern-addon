// The Plantern Lovelace card (docs/archive/ha-11-12.md S14): the plan of a house with its lamps and switches
// live, in 2D or 3D. Home Assistant hands the card `hass`, so there is no URL and no token (HassHA). The house files
// are the ones the add-on mirrors to /local/plantern/ (S15). Config:
//   type: custom:plantern-card
//   location: /local/plantern/locations/<house>/location.json
//   level: <level id>   (optional, the floor it opens on)   title: <text>   (optional)
//   levels: [<level id>, …]   (optional: only these floors. One: that floor, no picker. Several: shown together, no picker)
//   cycle: <seconds>          (optional: with several floors, show them one at a time, a slideshow; no levels = all of them)
//   view: 2d | 3d             (optional, what it opens on; the header has a switch)
//   background: dark | card | transparent   (optional: the plan's dark, the theme's card colour, or the dashboard behind; on a light theme the plan goes light)
//   shadows: none | few | average | lots | all   (optional: how many lamps cast shadows in 3D; empty = the house's setting for this kind of device)
//   height: <px>              (optional, the least height: the card fills the space its dashboard gives it)
// Everything but the DOM lives in card-core.js, ../ha/fixture.js and the same geometry and plan modules the viewer uses.

import { cardConfig, houseUrls, housesFromIndex, chooseCardLevel, cardLevels, nextLevel, stepLevel, cardStack, STACK_CHOICES, DEFAULT_INDEX } from './card-core.js';
import { paletteFor, backgroundColour } from '../render2d/palette.js';
import { readPrefs, writePrefs } from '../model/prefs.js';
import { shadowLevel, SHADOW_COUNT, SHADOW_LEVELS, SHADOW_LABEL } from '../model/shadows.js';
import { buildModelGeometry } from '../geometry/level.js';
import { addLitLamps } from '../model/lit.js';
import { resolveSettings } from '../model/settings.js';
import { createPlanView } from '../render2d/plan.js';
import { createAssetCache } from '../render3d/assets.js';
import { HassHA } from '../ha/hass.js';
import { boundEntities } from '../ha/client.js';
import { fixtureAppearance, toggleCalls } from '../ha/fixture.js';
import { doorStates, doorEntities } from '../ha/door.js';
import { coalesce } from '../coalesce.js';
import { materialTable, setDesignLibrary, setLibraryTextureBase } from '../model/materials.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const getJson = async url => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  try { return await r.json(); } catch (e) { throw new Error(`${url}: malformed JSON (${e.message})`); }
};

const STYLE = `
  :host { display: block; height: 100%; }
  ha-card { display: flex; flex-direction: column; height: 100%; overflow: hidden; box-sizing: border-box; }
  .hd { display: flex; align-items: center; gap: 8px; padding: 12px 16px 0; }
  .hd .t { flex: 1; font-size: 1.1em; font-weight: 500; color: var(--primary-text-color); }
  .seg { display: inline-flex; border: 1px solid var(--divider-color, #888); border-radius: 999px; overflow: hidden; }
  .seg button { font: inherit; border: 0; padding: 4px 14px; cursor: pointer; color: var(--primary-text-color); background: transparent; }
  .seg button.on { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
  .lv { display: flex; gap: 8px; padding: 10px 16px 0; overflow-x: auto; scrollbar-width: none; }
  .lv button { font: inherit; font-weight: 500; flex: 0 0 auto; border: 1px solid var(--divider-color, #888); border-radius: 999px; padding: 7px 18px; cursor: pointer; color: var(--primary-text-color); background: transparent; transition: background .15s, color .15s; }
  .lv button:hover { background: var(--secondary-background-color, #0001); }
  .lv button.on { background: var(--primary-color, #03a9f4); border-color: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
  .lv .now { flex: 0 0 auto; padding: 6px 4px; color: var(--secondary-text-color); font-weight: 500; }
  .lv button.arr { padding: 6px 12px; }
  .stage { position: relative; flex: 1 1 auto; min-height: var(--plantern-height, 420px); margin-top: 8px; }
  .plans { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); grid-auto-rows: minmax(0, 1fr); gap: 2px; }
  .pl { position: relative; min-width: 0; min-height: 0; }
  svg, .v3d { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  svg { background: #1a1d22; touch-action: pan-y; user-select: none; }
  .cap { position: absolute; left: 10px; top: 8px; padding: 2px 10px; border-radius: 999px; font-size: 0.85em; color: #fff; background: rgba(0, 0, 0, .45); pointer-events: none; }
  .v3d canvas { display: block; width: 100%; height: 100%; }
  [hidden] { display: none !important; }
  ha-card[data-bg="card"] svg, ha-card[data-bg="transparent"] svg { background: transparent; }
  ha-card[data-bg="card"] .cap, ha-card[data-bg="transparent"] .cap { color: var(--primary-text-color); background: var(--secondary-background-color, #0001); }
  ha-card[data-bg="transparent"] { background: none; box-shadow: none; border: 0; }
  .fix { cursor: pointer; }
  .lbl { pointer-events: none; }
  ha-card { position: relative; }
  /* messages float over the plan as a toast, so showing or hiding one never moves the plan */
  .msg { position: absolute; left: 50%; bottom: 14px; transform: translate(-50%, 8px); max-width: calc(100% - 32px); box-sizing: border-box;
         padding: 8px 16px; border-radius: 999px; font-size: 0.9em; line-height: 1.3; text-align: center; color: #fff;
         background: rgba(32, 36, 42, .92); box-shadow: 0 2px 8px rgba(0, 0, 0, .35); opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; z-index: 2; }
  .msg.show { opacity: 1; transform: translate(-50%, 0); }
  .msg.err { background: var(--error-color, #db4437); }
`;

class PlanternCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._token = 0;                                              // a newer load makes an older one stop
    this._plans = [];                                             // the 2D plans on show: [{ level, svg, view }]
  }

  setConfig(config) {
    this._cfg = cardConfig(config);                               // throws a message HA shows in the editor
    this._load();
  }

  set hass(hass) {
    this._hass = hass;
    this._ha?.setHass(hass);
    // the dashboard's theme (or its light/dark mode) changed: the plan may need the other palette, once HA has applied the colours
    const theme = `${hass?.themes?.theme ?? ''}|${hass?.themes?.darkMode ?? ''}`;
    if (this._theme !== undefined && theme !== this._theme) requestAnimationFrame(() => this._themeChanged?.());
    this._theme = theme;
  }

  getCardSize() { return Math.max(3, Math.round((this._cfg?.height || 420) / 50)); }

  connectedCallback() {
    this._ro ??= new ResizeObserver(() => { if (this._mode !== '3d') this._plans.forEach(p => p.view.fit()); });
    this._plans.forEach(p => this._ro.observe(p.svg));
    this._startCycle?.();
  }
  disconnectedCallback() { this._ro?.disconnect(); this._stopCycle?.(); }

  static getConfigElement() { return document.createElement('plantern-card-editor'); }
  static async getStubConfig() {
    try {
      const first = housesFromIndex(DEFAULT_INDEX, await getJson(DEFAULT_INDEX))[0];
      if (first) return { location: first.url };
    } catch { /* not mirrored yet: the editor explains */ }
    return { location: '/local/plantern/locations/demo/location.json' };
  }

  /** A toast over the plan. `''` hides it. It fades out by itself after a few seconds (longer for errors) unless `sticky`. */
  _say(text, err = false, sticky = false) {
    const m = this.shadowRoot.querySelector('.msg');
    if (!m) return;
    clearTimeout(this._toast);
    if (!text) { m.classList.remove('show'); return; }
    m.textContent = text;
    m.className = err ? 'msg err show' : 'msg show';
    if (!sticky) this._toast = setTimeout(() => m.classList.remove('show'), err ? 7000 : 4000);
  }

  async _load() {
    const token = ++this._token, cfg = this._cfg;
    this._stopCycle?.(); this._startCycle = this._stopCycle = null;
    this._ro?.disconnect(); this._plans = [];
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card data-bg="${cfg.background || 'dark'}"><div class="hd"></div><div class="lv" hidden></div><div class="stage"><div class="plans"></div><div class="v3d" hidden></div></div><div class="msg"></div></ha-card>`;
    this._say('Loading…', false, true);
    this._v3dEl = this.shadowRoot.querySelector('.v3d');
    this._view3d = null; this._loading3d = null; this._mode = '2d';
    try {
      const loc = await getJson(cfg.location);
      const { baseUrl, modelUrl } = houseUrls(cfg.location, loc);
      const model = await getJson(modelUrl);
      model.levels ??= []; model.checks ??= [];
      // the design library's materials, published next to the card (object-designs/ under the same root as the card)
      const root = cfg.location.replace(/locations\/.*$/, '');
      setDesignLibrary(await getJson(`${root}object-designs/materials/library.json`).catch(() => ({})));
      setLibraryTextureBase(`${root}object-designs/textures/`);
      if (token !== this._token) return;
      this._show(cfg, loc, model, baseUrl);
    } catch (e) {
      if (token === this._token) this._say(`Plantern: ${e.message}`, true, true);
    }
  }

  _show(cfg, loc, model, baseUrl) {
    const root = this.shadowRoot, bindings = loc.bindings || {};
    const geos = buildModelGeometry(model, { headroom: l => resolveSettings(loc, l).stairHeadroom });
    addLitLamps(model, geos, o => o.light);   // a lit object is a lamp (lit.js); the card has no server, so only the light its object stores
    const ha = new HassHA({ entities: boundEntities(loc) });
    const getState = id => ha.getState(id);
    const { levels: pool, mode: levelMode } = cardLevels(model, cfg);   // select | single | together | cycle
    let current = pool.find(l => l.id === cfg.level) || (levelMode === 'select' ? chooseCardLevel(model, cfg.level) : pool[0]) || null;
    const shown = () => levelMode === 'together' ? pool : current ? [current] : [];
    const levelName = l => l.name || l.id;

    const hd = root.querySelector('.hd'), lv = root.querySelector('.lv'), plansEl = root.querySelector('.plans');
    hd.innerHTML = `<div class="t">${esc(cfg.title ?? loc.name ?? '')}</div><span class="seg view"><button data-v="2d" class="on">2D</button><button data-v="3d">3D</button></span><span class="seg stack" hidden><button data-s="this">This floor</button><button data-s="below">Below too</button><button data-s="all">All floors</button></span>`;
    if (cfg.height) this.shadowRoot.host.style.setProperty('--plantern-height', `${cfg.height}px`);

    const fixtureLabel = fx => fx.name || fx.id;
    const hooks = {
      onFixtureClick: async fx => {
        const r = toggleCalls(bindings, getState, fx);
        if (r.error) return this._say(r.error, true);
        try { await Promise.all(r.calls.map(c => ha.callService(c.domain, c.service, {}, c.target))); this._say(''); }
        catch (e) { this._say(`Home Assistant: ${e.message}`, true); }
      },
    };
    let view3d = null;
    // asset models of the house (its own assets/ folder; the card has no shared one), decision 146
    // models that have loaded redraw the plans once after a quiet moment, not once each; the 3D view places each model itself when it arrives
    const plansAfterAssets = coalesce(() => renderPlans({ with3d: false }));
    const assets = createAssetCache({ houseBase: baseUrl, sharedBase: null, onChange: plansAfterAssets });
    for (const lv of model.levels) for (const o of lv.objects || []) if (o.kind === 'asset' && !o.blueprint) assets.load(o.asset);   // an object made from a blueprint needs Plantern's server, which the card does not reach
    const looks = { materials: materialTable(model), baseUrl, assets, assetStatus: n => assets.status(n), assetColour: n => assets.mainColour(n) };
    // the plan's colours: the dark plan, or the light one on a light theme (CD3); the 3D shadows: the house's setting for this device, or the card's own (CD6)
    // (what the plan sits on is read again when the dashboard's theme changes, see `set hass`)
    const cardStyle = getComputedStyle(root.querySelector('ha-card'));
    const pickPalette = () => paletteFor(cfg.background, backgroundColour(cfg.background, name => cardStyle.getPropertyValue(name)));
    let palette = pickPalette();
    this._themeChanged = () => { const next = pickPalette(); if (next !== palette) { palette = next; renderPlans(); } };
    const deviceKind = () => (globalThis.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'desktop');
    const stackChoice = () => (STACK_CHOICES.includes(readPrefs().stack) ? readPrefs().stack : undefined);
    const doorKey = () => JSON.stringify([...doorStates(model, bindings, getState)]);
    let drawnDoors = null;                                          // the door states the plans were drawn with
    const refresh = () => shown().forEach(l => l.fixtures?.forEach(fx => {
      const a = fixtureAppearance(bindings, getState, fx);
      this._plans.find(p => p.level === l)?.view.setFixture(fx.id, a);
      view3d?.setFixture(fx.id, a);
    }));
    const build3d = () => {
      const list = shown();
      // several floors at once are pulled apart, so the lower ones are not hidden under the upper ones; the header's stack switch (CD4) chooses otherwise
      const levels = cardStack(model, list, stackChoice());
      view3d.build({ level: list[0], geo: list[0] && geos.get(list[0].id), levels: levels.map(st => ({ ...st, geo: geos.get(st.level.id) })), settings: resolveSettings(loc, list[0]), fixtureLabel, ...looks, doorStates: doorStates(model, bindings, getState) });
      view3d.setShadows(SHADOW_COUNT[shadowLevel(resolveSettings(loc, list[0]).render3d, deviceKind(), cfg.shadows)]);
    };

    // ---- the floors on show ----
    const renderPlans = ({ with3d = true } = {}) => {
      plansAfterAssets.cancel();
      this._ro?.disconnect();
      plansEl.replaceChildren();
      this._plans = [];
      const list = shown();
      plansEl.style.gridTemplateColumns = list.length > 1 ? '' : '1fr';
      for (const l of list.length ? list : [null]) {
        const block = document.createElement('div');
        block.className = 'pl';
        block.innerHTML = `<svg></svg>${list.length > 1 ? `<span class="cap">${esc(levelName(l))}</span>` : ''}`;
        plansEl.append(block);
        const svg = block.querySelector('svg');
        const view = createPlanView(svg, { interactive: false, palette, ...hooks });   // the page keeps its scroll; only taps on lamps and switches act
        view.render({ level: l, geo: l && geos.get(l.id), settings: resolveSettings(loc, l), fixtureLabel, ...looks, doorStates: doorStates(model, bindings, getState) });
        this._plans.push({ level: l, svg, view });
        this._ro?.observe(svg);
      }
      if (view3d && with3d) build3d();
      refresh();
      drawnDoors = doorKey();
      if (this._mode !== '3d') requestAnimationFrame(() => this._plans.forEach(p => p.view.fit()));
    };

    // ---- the floor picker: pills, not a system dropdown; a plain name while a slideshow runs ----
    // the arrows and swipes step one floor; in a slideshow that restarts the floor's time (CD5)
    let restartCycle = () => {};
    const stepFloor = dir => { current = stepLevel(pool, current, dir); drawPicker(); renderPlans(); restartCycle(); };
    const drawPicker = () => {
      const arrows = '<button class="arr" data-d="-1" aria-label="Previous floor">‹</button>', arrowsNext = '<button class="arr" data-d="1" aria-label="Next floor">›</button>';
      if (levelMode === 'select' && pool.length > 1) {
        lv.hidden = false;
        lv.innerHTML = arrows + pool.map(l => `<button data-l="${esc(l.id)}"${l === current ? ' class="on"' : ''}>${esc(levelName(l))}</button>`).join('') + arrowsNext;
        for (const b of lv.querySelectorAll('button[data-l]')) b.onclick = () => { current = pool.find(l => l.id === b.dataset.l); drawPicker(); renderPlans(); };
      } else if (levelMode === 'cycle' && current) {
        lv.hidden = false;
        lv.innerHTML = `${arrows}<span class="now">${esc(levelName(current))}</span>${arrowsNext}`;
      } else lv.hidden = true;
      for (const b of lv.querySelectorAll('button.arr')) b.onclick = () => stepFloor(Number(b.dataset.d));
    };
    drawPicker(); renderPlans();

    // ---- the slideshow ----
    if (levelMode === 'cycle') {
      let timer = null, hovering = false;
      const tick = () => {
        if (hovering || document.hidden || !this.isConnected) return;
        current = nextLevel(pool, current);
        drawPicker(); renderPlans();
      };
      this._startCycle = () => { if (!timer) timer = setInterval(tick, cfg.cycle * 1000); };
      restartCycle = () => { if (timer) { clearInterval(timer); timer = setInterval(tick, cfg.cycle * 1000); } };
      this._stopCycle = () => { clearInterval(timer); timer = null; };
      const ha1 = root.querySelector('ha-card');
      ha1.addEventListener('pointerenter', () => { hovering = true; });
      ha1.addEventListener('pointerleave', () => { hovering = false; });
      if (this.isConnected) this._startCycle();
    }

    // a swipe across the plan steps one floor (touch), and the arrow keys do too while the card has the focus
    if (levelMode === 'select' || levelMode === 'cycle') {
      let x0 = null, y0 = null;
      plansEl.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      plansEl.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) stepFloor(dx < 0 ? 1 : -1);
      }, { passive: true });
      const card = root.querySelector('ha-card');
      card.tabIndex = 0;
      card.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepFloor(e.key === 'ArrowRight' ? 1 : -1); } });
    }

    // ---- 2D / 3D; three.js loads only when 3D is first asked for (the add-on mirrors it next to the card, with plain relative imports) ----
    const ensure3d = () => this._loading3d ??= import('../render3d/view.js').then(m => {
      view3d = this._view3d = m.createView3d(this._v3dEl, hooks);
      view3d.setProjection('persp');                                // the card opens in perspective (issue #3)
      view3d.setBackground(cfg.background && cfg.background !== 'dark' ? 'transparent' : 'dark');
      build3d(); refresh();
      return view3d;
    }).catch(e => { this._loading3d = null; throw e; });
    const mark = mode => { for (const b of hd.querySelectorAll('.view button')) b.classList.toggle('on', b.dataset.v === mode); };
    // the 3D stack: this floor, this and below, or all (remembered in this browser; without a choice, several floors are pulled apart)
    const stackEl = hd.querySelector('.stack');
    const markStack = () => { const c = stackChoice() ?? (shown().length > 1 ? 'all' : 'this'); for (const b of stackEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.s === c); };
    for (const b of stackEl.querySelectorAll('button')) b.onclick = () => { writePrefs({ stack: b.dataset.s }); markStack(); if (view3d) { build3d(); view3d.render(); } };
    const setMode = async mode => {
      if (mode === '3d') {
        try { await ensure3d(); this._say(''); } catch (e) { this._say(`Plantern: the 3D view could not load (${e.message})`, true); mode = '2d'; }
      }
      this._mode = mode; mark(mode);
      plansEl.hidden = mode === '3d'; this._v3dEl.hidden = mode !== '3d';
      stackEl.hidden = mode !== '3d'; markStack();
      if (mode === '3d') view3d.render(); else requestAnimationFrame(() => this._plans.forEach(p => p.view.fit()));
    };
    for (const b of hd.querySelectorAll('.view button')) b.onclick = () => setMode(b.dataset.v);
    if (cfg.view === '3d') setMode('3d');

    // a door sensor changed (or its state arrived after the first drawing): the plans and the 3D view are drawn again with the leaf and the light
    // as they are now. The 3D camera stays where it was (a build frames the house again).
    const doorSensors = doorEntities(model, bindings);
    ha.subscribe(id => {
      if (doorSensors.has(id) && doorKey() !== drawnDoors) {
        const cam = view3d?.getCamera?.();
        renderPlans();
        if (cam && view3d) { view3d.setCamera(cam); view3d.render(); }
      } else refresh();
    });
    ha.onStatus(s => { if (s === 'connected') this._say(''); });
    this._say(this._hass ? '' : 'Waiting for Home Assistant…', false, true);
    this._ha = ha;
    if (this._hass) ha.setHass(this._hass);
  }
}

/** The card's visual editor: a house picker (from the mirrored index), the floors, how it looks, title and height. */
class PlanternCardEditor extends HTMLElement {
  setConfig(config) { this._config = config || {}; this._render(); }
  set hass(h) { this._hass = h; }

  async _levelsOf(url) {
    this._levelCache ??= {};
    if (!url) return [];
    if (!(url in this._levelCache)) {
      try {
        const loc = await getJson(url), model = await getJson(houseUrls(url, loc).modelUrl);
        this._levelCache[url] = (model.levels || []).slice().sort((a, b) => a.elevation - b.elevation).map(l => ({ id: l.id, name: l.name || l.id }));
      } catch { this._levelCache[url] = []; }
    }
    return this._levelCache[url];
  }

  async _render() {
    if (!this._houses) {
      try { this._houses = housesFromIndex(DEFAULT_INDEX, await getJson(DEFAULT_INDEX)); } catch { this._houses = []; }
    }
    const c = this._config, houses = this._houses;
    const known = houses.some(h => h.url === c.location);
    const levels = await this._levelsOf(c.location);
    const picked = new Set(Array.isArray(c.levels) ? c.levels : String(c.levels || '').split(',').map(x => x.trim()).filter(Boolean));
    this.innerHTML = `
      <div style="display:grid;gap:12px;padding:4px 0">
        ${houses.length ? `<label>House<br><select id="house">${known || !c.location ? '' : `<option value="${esc(c.location)}" selected>${esc(c.location)}</option>`}${houses.map(h => `<option value="${esc(h.url)}"${h.url === c.location ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>`
          : `<label>Location (URL of the house's location.json)<br><input id="loc" style="width:100%" value="${esc(c.location || '')}" placeholder="/local/plantern/locations/&lt;house&gt;/location.json"></label>
             <div style="opacity:.7;font-size:.9em">No mirrored houses found at ${esc(DEFAULT_INDEX)}. Start the Plantern add-on and connect a storage first.</div>`}
        <label>Title (optional)<br><input id="title" style="width:100%" value="${esc(c.title || '')}"></label>
        ${levels.length > 1 ? `<fieldset id="levels" style="border:1px solid var(--divider-color,#888);border-radius:6px"><legend>Floors shown</legend>
          ${levels.map(l => `<label style="display:block"><input type="checkbox" data-l="${esc(l.id)}"${picked.has(l.id) ? ' checked' : ''}> ${esc(l.name)}</label>`).join('')}
          <div style="opacity:.7;font-size:.9em;margin-top:4px">None ticked: all floors, with a floor picker. One: only that floor. Several: shown together (or one at a time with a slideshow), no picker.</div></fieldset>
        <label>Slideshow: seconds per floor (empty = off)<br><input id="cycle" type="number" min="2" max="3600" value="${esc(c.cycle ?? '')}"></label>` : ''}
        <label>Opens in<br><select id="view"><option value="2d"${c.view === '3d' ? '' : ' selected'}>2D plan</option><option value="3d"${c.view === '3d' ? ' selected' : ''}>3D view</option></select></label>
        <label>Background<br><select id="background">${[['dark', "Dark (the plan's own)"], ['card', 'Card colour (follows the theme)'], ['transparent', 'Transparent (the dashboard shows through)']].map(([v, n]) => `<option value="${v}"${(c.background || 'dark') === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label>Shadows in 3D (empty: the house's setting for this kind of device)<br><select id="shadows">${['', ...SHADOW_LEVELS].map(v => `<option value="${v}"${(c.shadows || '') === v ? ' selected' : ''}>${v ? esc(SHADOW_LABEL[v]) : 'House setting'}</option>`).join('')}</select></label>
        <label>Least height in pixels (optional; the card fills the space it is given)<br><input id="height" type="number" min="120" max="2000" value="${esc(c.height ?? '')}"></label>
      </div>`;
    const changed = ev => {
      const next = { ...this._config, location: (this.querySelector('#house') || this.querySelector('#loc'))?.value || '' };
      if (ev?.target?.id === 'house') { delete next.levels; delete next.level; delete next.cycle; }   // another house has other floors
      for (const [k, id] of [['title', '#title'], ['height', '#height'], ['cycle', '#cycle']]) {
        const v = this.querySelector(id)?.value.trim();
        if (v) next[k] = k === 'title' ? v : Number(v); else delete next[k];
      }
      for (const k of ['view', 'background']) {
        const v = this.querySelector(`#${k}`).value;
        if (v && v !== (k === 'view' ? '2d' : 'dark')) next[k] = v; else delete next[k];
      }
      if (this.querySelector('#levels') && ev?.target?.id !== 'house') {
        const ids = [...this.querySelectorAll('#levels input:checked')].map(i => i.dataset.l);
        if (ids.length) next.levels = ids; else delete next.levels;
      }
      const shadows = this.querySelector('#shadows')?.value;
      if (shadows) next.shadows = shadows; else delete next.shadows;
      this._config = next;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: next }, bubbles: true, composed: true }));
      if (ev?.target?.id === 'house') this._render();
    };
    this.querySelectorAll('select, input').forEach(i => i.addEventListener('change', changed));
  }
}

if (!customElements.get('plantern-card')) {
  customElements.define('plantern-card', PlanternCard);
  customElements.define('plantern-card-editor', PlanternCardEditor);
}
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'plantern-card')) {
  window.customCards.push({ type: 'plantern-card', name: 'Plantern', description: 'A floor plan of your house with its lights live.', preview: false });
}
