/**
 * Common shape of every HA client (ws, hass, mock). The rest of the app depends only on this:
 *   connect(): Promise          resolves on first full state load
 *   getState(entityId)          HA state object { entity_id, state, attributes, ... } or undefined
 *   subscribe(cb)               cb(entityId, stateOrUndefined); called immediately for known states; returns unsubscribe
 *   callService(domain, service, data?, target?): Promise
 *   onStatus(cb)                cb(status, detail); 'connecting' | 'connected' | 'disconnected' | 'auth_invalid' | 'mock' | 'error'
 */
export class HaClientBase {
  constructor() {
    this.states = new Map();
    this._subs = new Set();
    this._statusSubs = new Set();
    this.status = 'disconnected';
  }
  getState(id) { return this.states.get(id); }
  subscribe(cb) {
    this._subs.add(cb);
    for (const [id, s] of this.states) cb(id, s);
    return () => this._subs.delete(cb);
  }
  onStatus(cb) { this._statusSubs.add(cb); cb(this.status); return () => this._statusSubs.delete(cb); }
  _set(state) {
    this.states.set(state.entity_id, state);
    this._emit(state.entity_id, state);
  }
  _remove(id) { this.states.delete(id); this._emit(id, undefined); }
  _emit(id, s) {
    for (const cb of this._subs) {
      try { cb(id, s); } catch (e) { console.error('[ha] subscriber failed', e); }
    }
  }
  _setStatus(status, detail) {
    this.status = status;
    for (const cb of this._statusSubs) cb(status, detail);
  }
}

/** Normalise target.entity_id to an array. */
export const targetIds = t => [].concat(t?.entity_id ?? []);
