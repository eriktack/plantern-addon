import { HaClientBase } from './base.js';

/**
 * Adapter for the Lovelace card: HA injects a `hass` object, so there is no URL or token.
 * connection: { type: "hass" }. The card calls setHass(hass) on every update.
 * Only entities in `entities` are diffed, so large installations stay cheap.
 */
export class HassHA extends HaClientBase {
  constructor({ entities = [] } = {}) {
    super();
    this.entities = new Set(entities);
    this._ready = new Promise(r => (this._resolveReady = r));
  }
  connect() { return this._ready; }
  setHass(hass) {
    this.hass = hass;
    for (const id of this.entities) {
      const s = hass.states[id];
      if (s !== this.states.get(id)) s ? this._set(s) : this._remove(id);
    }
    if (this.status !== 'connected') { this._setStatus('connected'); this._resolveReady(); }
  }
  callService(domain, service, data = {}, target = {}) {
    if (!this.hass) return Promise.reject(new Error('hass not available yet'));
    return this.hass.callService(domain, service, data, target);
  }
}
