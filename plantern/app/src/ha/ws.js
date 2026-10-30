import { HaClientBase } from './base.js';

/**
 * Home Assistant WebSocket API client for the standalone page.
 * connection: { type: "ws", url: "http://homeassistant.local:8123", token: "<long-lived token>" }
 * Reconnects with exponential backoff; re-fetches all states after every reconnect.
 * The token is never logged. Also used by Plantern's server (tools/ha/bridge.js, Node 22's WebSocket):
 * there `url` may be a ws:// address used as it is (the add-on's ws://supervisor/core/websocket) and
 * `WebSocketImpl` can be a test double.
 */
export class WsHA extends HaClientBase {
  constructor({ url, token, WebSocketImpl = globalThis.WebSocket, handshakeMs = 20000 }) {
    super();
    if (!url || !token) throw new Error('ws connection needs "url" and "token"');
    this.wsUrl = /^wss?:/.test(url) ? url : url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/api/websocket';
    this.WS = WebSocketImpl;
    this.token = token;
    this.nextId = 1;
    this.pending = new Map();
    this.backoff = 1000;
    this.stopped = false;
    this.handshakeMs = handshakeMs;
    this._ready = new Promise(r => (this._resolveReady = r));
  }

  /** Open the connection (once; a second call only waits for the same one). */
  connect() { if (!this._started) { this._started = true; this._open(); } return this._ready; }

  close() { this.stopped = true; clearTimeout(this._timer); clearTimeout(this._handshake); this.ws?.close(); }

  _open() {
    this._setStatus('connecting');
    let ws;
    try { ws = this.ws = new this.WS(this.wsUrl); }
    catch (e) { this._setStatus('error', e.message); return this._retry(); }
    // Not connected (states loaded) within handshakeMs: drop this socket and try again, so a socket that never opens,
    // or a proxy that stops answering halfway (the add-on's Supervisor proxy), cannot leave the client 'connecting' for good.
    clearTimeout(this._handshake);
    this._handshake = setTimeout(() => this._drop(ws, `no answer from Home Assistant within ${Math.round(this.handshakeMs / 1000)} s`), this.handshakeMs);
    this._handshake?.unref?.();
    ws.onmessage = ev => {
      // a frame may come as a Blob or bytes rather than text (Node's WebSocket hands binary frames over as a Blob)
      if (typeof ev.data === 'string') return this._message(ws, ev.data);
      if (typeof ev.data?.text === 'function') return ev.data.text().then(t => this._message(ws, t), () => {});
      if (ev.data) this._message(ws, new TextDecoder().decode(ev.data));
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;               // a socket already dropped
      clearTimeout(this._handshake);
      for (const p of this.pending.values()) p.reject(new Error('connection closed'));
      this.pending.clear();
      if (this.status !== 'auth_invalid') this._setStatus('disconnected');
      this._retry();
    };
  }

  /** Give up on socket `ws` (stuck or failed after auth): reject what waits on it, say why, and open a new one later. */
  _drop(ws, reason) {
    if (ws !== this.ws || this.stopped) return;
    clearTimeout(this._handshake);
    this.ws = null;
    ws.onmessage = ws.onclose = null;
    try { ws.close(); } catch { /* already closed */ }
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
    this._setStatus('error', reason);
    this._retry();
  }

  _message(ws, text) {
    if (ws !== this.ws) return;
    let m;
    try { m = JSON.parse(text); } catch { return; }
    switch (m.type) {
      case 'auth_required': ws.send(JSON.stringify({ type: 'auth', access_token: this.token })); break;
      case 'auth_ok': this.haVersion = m.ha_version; this._afterAuth().catch(e => this._drop(ws, `Home Assistant accepted the token, then: ${e.message}`)); break;
      case 'auth_invalid': this.stopped = true; clearTimeout(this._handshake); this._setStatus('auth_invalid', m.message); ws.close(); break;
      case 'result': {
        const p = this.pending.get(m.id);
        if (!p) break;
        this.pending.delete(m.id);
        m.success ? p.resolve(m.result) : p.reject(new Error(m.error?.message || 'HA error'));
        break;
      }
      case 'event': {
        const e = m.event;
        if (e?.event_type === 'state_changed') e.data.new_state ? this._set(e.data.new_state) : this._remove(e.data.entity_id);
        break;
      }
    }
  }

  _retry() {
    if (this.stopped) return;
    this._timer = setTimeout(() => this._open(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 30000);
  }

  async _afterAuth() {
    // Subscribe first, then fetch states, so no change between the two is missed.
    await this._send({ type: 'subscribe_events', event_type: 'state_changed' });
    const states = await this._send({ type: 'get_states' });
    for (const s of states) this._set(s);
    clearTimeout(this._handshake);
    this.backoff = 1000;                        // reset only once fully connected, so a proxy that accepts the token and then fails still backs off
    this._setStatus('connected');
    this._resolveReady();
  }

  _send(msg) {
    if (this.ws?.readyState !== (this.WS.OPEN ?? 1)) return Promise.reject(new Error('not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, ...msg }));
    });
  }

  /** Any other WebSocket API command (e.g. lovelace/resources), once connected: resolves with its result. */
  request(msg) { return this._send(msg); }

  callService(domain, service, data = {}, target = {}) {
    return this._send({ type: 'call_service', domain, service, service_data: data, target });
  }
}
