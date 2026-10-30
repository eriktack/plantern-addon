// Plantern's server talking to Home Assistant (roadmap 11, docs/archive/ha-11-12.md): one WebSocket API
// connection per configured connection, kept open, with all states in memory. The token stays here
// (secrets.json, or the add-on's SUPERVISOR_TOKEN) and never goes to a page; pages get states and
// call services through the server (tools/ha/api.js). The protocol is the browser client's
// (src/ha/ws.js), run on Node 22's built-in WebSocket.

import { WsHA } from '../../src/ha/ws.js';

/**
 * A bridge for { url, token }: connect() resolves after the first full state load (and is retried in
 * the background with backoff when HA is away); close() stops it. Same interface as the page clients
 * (getState, subscribe, onStatus, callService) plus request(msg), haVersion and states (a Map).
 */
export function createHaBridge({ url, token }, { WebSocketImpl = globalThis.WebSocket, handshakeMs } = {}) {
  if (typeof WebSocketImpl !== 'function') throw new Error('this Node has no WebSocket (Node 22 or newer is needed)');
  return new WsHA({ url, token, WebSocketImpl, ...(handshakeMs ? { handshakeMs } : {}) });
}

/** connect(), but give up waiting after `ms` (the bridge keeps trying): resolves true when connected. */
export function connectWithin(bridge, ms = 8000) {
  let timer;
  return Promise.race([bridge.connect().then(() => true), new Promise(r => (timer = setTimeout(() => r(false), ms)))]).finally(() => clearTimeout(timer));
}
