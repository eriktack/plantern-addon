import { HaClientBase } from './base.js';

export const RETRY_MIN = 2000, RETRY_MAX = 30000;   // ms between attempts to get the event stream back
export const STALE_AFTER = 30000;                   // ms hidden after which a page coming back reads everything again

/**
 * Home Assistant through Plantern's server (roadmap 11): the server keeps the connection and the
 * token (tools/ha/api.js); this page reads states from `api/ha/<name>/states`, follows `ha` and
 * `ha-status` events on `api/events` and calls services with a POST. No URL or token here.
 * connection: { type: "server", name }. URLs are relative, so it also works behind HA's ingress.
 *
 * It never needs a reload (decision 291): every time the event stream (re)opens, all states are read
 * again (changes made while it was down are not lost, and reading them starts the server's own
 * connection again after the server restarted, e.g. an add-on update); a stream the browser gave up
 * on (it does after an error answer, such as ingress's 502 while the add-on restarts) is opened
 * again with a growing pause; a page that was hidden for a while (a phone app in the background)
 * opens a fresh stream when it is shown again.
 */
export class ServerHA extends HaClientBase {
  constructor({ name, fetchImpl = globalThis.fetch?.bind(globalThis), EventSourceImpl = globalThis.EventSource, doc = globalThis.document, win = globalThis.window, now = () => Date.now() }) {
    super();
    if (!name) throw new Error('server connection needs a "name"');
    this.name = name; this.fetch = fetchImpl; this.ES = EventSourceImpl; this.now = now;
    this._ready = null; this._retry = RETRY_MIN; this._timer = null; this._closed = false; this._hiddenAt = null; this._gen = 0;
    if (doc?.addEventListener) {
      doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'hidden') { this._hiddenAt = this.now(); return; }
        const away = this._hiddenAt == null ? 0 : this.now() - this._hiddenAt;
        this._hiddenAt = null;
        if (away >= STALE_AFTER || this._dead()) this._restart();
      });
    }
    win?.addEventListener?.('online', () => this._restart());
    win?.addEventListener?.('pageshow', e => { if (e?.persisted) this._restart(); });   // back from the back-forward cache
  }

  connect() {
    this._ready ??= new Promise(resolve => { this._first = resolve; this._stream(); });
    return this._ready;
  }

  /** Is the event stream gone for good (closed by the browser, or never made)? */
  _dead() { return !this.es || this.es.readyState === 2; }

  /** A new event stream; when it opens, everything is read again. */
  _stream() {
    if (this._closed) return;
    clearTimeout(this._timer); this._timer = null;
    this.es?.close();
    const gen = ++this._gen;
    if (this.status !== 'connected') this._setStatus('connecting');
    let es;
    try { es = this.es = new this.ES('api/events'); } catch (e) { this._later(String(e?.message || e)); return; }
    const mine = e => { if (gen !== this._gen) return null; try { const d = JSON.parse(e.data); return d.connection === this.name ? d : null; } catch { return null; } };
    es.addEventListener('ha', e => { const d = mine(e); if (d) d.state ? this._set(d.state) : this._remove(d.entity); });
    es.addEventListener('ha-status', e => { const d = mine(e); if (d) this._setStatus(d.status); });
    // `open` comes again after every reconnect the browser makes by itself (the server's `retry`): read everything then too
    es.addEventListener('open', () => { if (gen === this._gen) this._read(gen); });
    es.addEventListener('error', () => {
      if (gen !== this._gen) return;
      if (es.readyState === 2) this._later('the event stream closed');           // the browser gave up: we try again
      else if (this.status === 'connected') this._setStatus('connecting');       // it is reconnecting by itself
    });
  }

  /** Try the stream again after a pause that doubles up to RETRY_MAX. */
  _later(detail) {
    if (this._closed || this._timer) return;
    this._setStatus('disconnected', detail);
    this._first?.(); this._first = null;          // connect() does not wait for a server that is not there
    this._timer = setTimeout(() => { this._timer = null; this._stream(); }, this._retry);
    this._retry = Math.min(RETRY_MAX, this._retry * 2);
  }

  _restart() { if (!this._closed && this._ready) { this._retry = RETRY_MIN; this._stream(); } }

  /** All states of this connection from the server (this also wakes the server's own connection to Home Assistant). */
  async _read(gen) {
    try {
      const r = await this.fetch(`api/ha/${encodeURIComponent(this.name)}/states`);
      const body = await r.json().catch(() => ({}));
      if (gen !== this._gen) return;
      if (!r.ok) {
        // 404: the server has no such connection; that does not get better by itself. Anything else (a 502 while it restarts) does.
        if (r.status === 404) { this._setStatus('error', body.error || 'HTTP 404'); this._first?.(); return; }
        this.es?.close(); this._later(body.error || `HTTP ${r.status}`); return;
      }
      const fresh = new Set();
      for (const s of body.states || []) { fresh.add(s.entity_id); this._set(s); }
      for (const id of [...this.states.keys()]) if (!fresh.has(id)) this._remove(id);
      this._retry = RETRY_MIN;
      this._setStatus(body.status || 'connected');
    } catch (e) {
      if (gen !== this._gen) return;
      this.es?.close(); this._later(String(e?.message || e));
    }
    this._first?.(); this._first = null;
  }

  close() { this._closed = true; clearTimeout(this._timer); this.es?.close(); }

  async callService(domain, service, data = {}, target = {}) {
    const r = await this.fetch(`api/ha/${encodeURIComponent(this.name)}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, service, data, target }) });
    if (!r.ok) {
      if (this._dead()) this._restart();
      throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    }
  }
}
