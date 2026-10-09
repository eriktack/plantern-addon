// The Plantern Lovelace card (docs/plans/ha-11-12.md S14): the 2D plan of a house with its lamps and switches
// live. Home Assistant hands the card `hass`, so there is no URL and no token (HassHA). The house files are the
// ones the add-on mirrors to /local/plantern/ (S15). Config:
//   type: custom:plantern-card
//   location: /local/plantern/locations/<house>/location.json
//   level: <level id>   (optional)   title: <text>   (optional)   height: <px>   (optional)
// Everything but the DOM lives in card-core.js, ../ha/fixture.js and the same geometry and plan modules the viewer uses.

import { cardConfig, houseUrls, housesFromIndex, chooseCardLevel, DEFAULT_INDEX } from './card-core.js';
import { buildModelGeometry } from '../geometry/level.js';
import { resolveSettings } from '../model/settings.js';
import { createPlanView } from '../render2d/plan.js';
import { HassHA } from '../ha/hass.js';
import { boundEntities } from '../ha/client.js';
import { fixtureAppearance, toggleCalls } from '../ha/fixture.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const getJson = async url => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  try { return await r.json(); } catch (e) { throw new Error(`${url}: malformed JSON (${e.message})`); }
};

const STYLE = `
  :host { display: block; }
  ha-card { overflow: hidden; }
  .hd { display: flex; align-items: center; gap: 8px; padding: 12px 16px 0; }
  .hd .t { flex: 1; font-size: 1.1em; font-weight: 500; color: var(--primary-text-color); }
  select { font: inherit; color: var(--primary-text-color); background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #888); border-radius: 6px; padding: 4px 6px; }
  svg { display: block; width: 100%; height: var(--plantern-height, 420px); background: #1a1d22; touch-action: pan-y; user-select: none; }
  .fix { cursor: pointer; }
  .lbl { pointer-events: none; }
  .msg { padding: 8px 16px; color: var(--secondary-text-color); font-size: 0.9em; }
  .msg.err { color: var(--error-color, #db4437); }
`;

class PlanternCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._token = 0;                                              // a newer load makes an older one stop
  }

  setConfig(config) {
    this._cfg = cardConfig(config);                               // throws a message HA shows in the editor
    this._load();
  }

  set hass(hass) {
    this._hass = hass;
    this._ha?.setHass(hass);
  }

  getCardSize() { return Math.max(3, Math.round((this._cfg?.height || 420) / 50)); }

  connectedCallback() {
    this._ro ??= new ResizeObserver(() => this._view?.fit());
    if (this._svg) this._ro.observe(this._svg);
  }
  disconnectedCallback() { this._ro?.disconnect(); }

  static getConfigElement() { return document.createElement('plantern-card-editor'); }
  static async getStubConfig() {
    try {
      const first = housesFromIndex(DEFAULT_INDEX, await getJson(DEFAULT_INDEX))[0];
      if (first) return { location: first.url };
    } catch { /* not mirrored yet: the editor explains */ }
    return { location: '/local/plantern/locations/demo/location.json' };
  }

  _say(text, err = false) {
    const m = this.shadowRoot.querySelector('.msg');
    if (m) { m.textContent = text; m.className = err ? 'msg err' : 'msg'; }
  }

  async _load() {
    const token = ++this._token, cfg = this._cfg;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="hd"></div><svg></svg><div class="msg">Loading…</div></ha-card>`;
    this._svg = this.shadowRoot.querySelector('svg');
    try {
      const loc = await getJson(cfg.location);
      const { baseUrl, modelUrl } = houseUrls(cfg.location, loc);
      const model = await getJson(modelUrl);
      model.levels ??= []; model.checks ??= [];
      if (token !== this._token) return;
      this._show(cfg, loc, model, baseUrl);
    } catch (e) {
      if (token === this._token) this._say(`Plantern: ${e.message}`, true);
    }
  }

  _show(cfg, loc, model, baseUrl) {
    const bindings = loc.bindings || {};
    const geos = buildModelGeometry(model, { headroom: l => resolveSettings(loc, l).stairHeadroom });
    const ha = new HassHA({ entities: boundEntities(loc) });
    const getState = id => ha.getState(id);
    let level = chooseCardLevel(model, cfg.level);

    const hd = this.shadowRoot.querySelector('.hd');
    hd.innerHTML = `<div class="t">${esc(cfg.title ?? loc.name ?? '')}</div>${model.levels.length > 1 ? `<select>${model.levels.map(l => `<option value="${esc(l.id)}">${esc(l.name || l.id)}</option>`).join('')}</select>` : ''}`;
    if (cfg.height) this.shadowRoot.host.style.setProperty('--plantern-height', `${cfg.height}px`);
    const select = hd.querySelector('select');
    if (select && level) select.value = level.id;

    const fixtureLabel = fx => fx.name || fx.id;
    const view = createPlanView(this._svg, {
      interactive: false,                                         // the page keeps its scroll; only taps on lamps and switches act
      onFixtureClick: async fx => {
        const r = toggleCalls(bindings, getState, fx);
        if (r.error) return this._say(r.error, true);
        try { await Promise.all(r.calls.map(c => ha.callService(c.domain, c.service, {}, c.target))); this._say(''); }
        catch (e) { this._say(`Home Assistant: ${e.message}`, true); }
      },
    });
    const refresh = () => level?.fixtures?.forEach(fx => view.setFixture(fx.id, fixtureAppearance(bindings, getState, fx)));
    const showLevel = () => {
      view.render({ level, geo: level && geos.get(level.id), settings: resolveSettings(loc, level), fixtureLabel, materials: model.materials || {}, baseUrl });
      refresh();
    };
    showLevel();
    if (select) select.onchange = () => { level = model.levels.find(l => l.id === select.value); showLevel(); };
    ha.subscribe(() => refresh());
    ha.onStatus(s => { if (s === 'connected') this._say(''); });
    this._say(this._hass ? '' : 'Waiting for Home Assistant…');
    this._ha = ha; this._view = view;
    if (this._hass) ha.setHass(this._hass);
    this._ro?.disconnect(); this._ro?.observe(this._svg);
    requestAnimationFrame(() => view.fit());
  }
}

/** The card's visual editor: a house picker (from the mirrored index), title and height. */
class PlanternCardEditor extends HTMLElement {
  setConfig(config) { this._config = config || {}; this._render(); }
  set hass(h) { this._hass = h; }

  async _render() {
    if (!this._houses) {
      try { this._houses = housesFromIndex(DEFAULT_INDEX, await getJson(DEFAULT_INDEX)); } catch { this._houses = []; }
    }
    const c = this._config, houses = this._houses;
    const known = houses.some(h => h.url === c.location);
    this.innerHTML = `
      <div style="display:grid;gap:12px;padding:4px 0">
        ${houses.length ? `<label>House<br><select id="house">${known || !c.location ? '' : `<option value="${esc(c.location)}" selected>${esc(c.location)}</option>`}${houses.map(h => `<option value="${esc(h.url)}"${h.url === c.location ? ' selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>`
          : `<label>Location (URL of the house's location.json)<br><input id="loc" style="width:100%" value="${esc(c.location || '')}" placeholder="/local/plantern/locations/&lt;house&gt;/location.json"></label>
             <div style="opacity:.7;font-size:.9em">No mirrored houses found at ${esc(DEFAULT_INDEX)}. Start the Plantern add-on and connect a storage first.</div>`}
        <label>Title (optional)<br><input id="title" style="width:100%" value="${esc(c.title || '')}"></label>
        <label>Height in pixels (optional)<br><input id="height" type="number" min="120" max="2000" value="${esc(c.height ?? '')}"></label>
      </div>`;
    const changed = () => {
      const next = { ...this._config, location: (this.querySelector('#house') || this.querySelector('#loc'))?.value || '' };
      for (const [k, id] of [['title', '#title'], ['height', '#height']]) {
        const v = this.querySelector(id).value.trim();
        if (v) next[k] = k === 'height' ? Number(v) : v; else delete next[k];
      }
      this._config = next;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: next }, bubbles: true, composed: true }));
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
