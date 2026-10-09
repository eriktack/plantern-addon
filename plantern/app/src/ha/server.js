import { HaClientBase } from './base.js';

/**
 * Home Assistant through Plantern's server (roadmap 11): the server keeps the connection and the
 * token (tools/ha/api.js); this page reads states from `api/ha/<name>/states`, follows `ha` and
 * `ha-status` events on `api/events` and calls services with a POST. No URL or token here.
 * connection: { type: "server", name }. URLs are relative, so it also works behind HA's ingress.
 */
export class ServerHA extends HaClientBase {
  constructor({ name, fetchImpl = globalThis.fetch?.bind(globalThis), EventSourceImpl = globalThis.EventSource }) {
    super();
    if (!name) throw new Error('server connection needs a "name"');
    this.name = name; this.fetch = fetchImpl; this.ES = EventSourceImpl;
    this._ready = null;
  }

  connect() {
    this._ready ??= this._open();
    return this._ready;
  }

  async _open() {
    this._setStatus('connecting');
    // follow changes first, then read everything, so nothing between the two is missed
    const es = this.es = new this.ES('api/events');
    const mine = e => { try { const d = JSON.parse(e.data); return d.connection === this.name ? d : null; } catch { return null; } };
    es.addEventListener('ha', e => { const d = mine(e); if (d) d.state ? this._set(d.state) : this._remove(d.entity); });
    es.addEventListener('ha-status', e => { const d = mine(e); if (d) this._setStatus(d.status); });
    const r = await this.fetch(`api/ha/${encodeURIComponent(this.name)}/states`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { this._setStatus('error', body.error || `HTTP ${r.status}`); return; }
    for (const s of body.states || []) this._set(s);
    this._setStatus(body.status || 'connected');
  }

  close() { this.es?.close(); }

  async callService(domain, service, data = {}, target = {}) {
    const r = await this.fetch(`api/ha/${encodeURIComponent(this.name)}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, service, data, target }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  }
}
