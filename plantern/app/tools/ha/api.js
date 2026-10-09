// Home Assistant connections kept by Plantern's server (roadmap 11, docs/plans/ha-11-12.md S2/S3).
// The URL is in <dataDir>/ha.json, the token in secrets.json under "ha:<name>"; the token never
// leaves the server (responses say only tokenSet). One bridge per connection, opened when first
// needed and kept open (tools/ha/bridge.js).
//   GET    /api/ha/connections              → { connections: [{ name, url, tokenSet, status, version }] }
//   PUT    /api/ha/connections/:name        { url, token? } (token omitted = keep the stored one)
//   DELETE /api/ha/connections/:name
//   POST   /api/ha/connections/:name/test   { url?, token? } → { ok, version, entities } | { ok: false, error }
//   GET    /api/ha/:name/states[?entities=a,b] → { status, states: [HA state objects] } (connects on first use)
//   POST   /api/ha/:name/call               { domain, service, data?, target? } (only the domains the pages use)
// Live: `ha` { connection, entity, state } and `ha-status` { connection, status } on /api/events.

import path from 'node:path';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { loadSecrets, saveSecrets, writeAtomic, redact } from '../store/settings.js';
import { createHaBridge, connectWithin } from './bridge.js';

const NAME = /^[a-z0-9_]{1,40}$/;
const URL_OK = /^(https?|wss?):\/\/[^\s]+$/i;
const key = name => `ha:${name}`;
/** Service domains a page may call (toggling lamps and switches). */
export const CALLABLE = ['light', 'switch', 'fan', 'input_boolean'];

/** The add-on's own connection: HA's Supervisor proxy, signed in with SUPERVISOR_TOKEN (never stored or shown). */
export const BUILTIN = 'home_assistant';
export const SUPERVISOR_URL = 'ws://supervisor/core/websocket';
/** { token, url } when running as an HA add-on (env has SUPERVISOR_TOKEN), else null. */
export function supervisorFromEnv(env = process.env) {
  return env.SUPERVISOR_TOKEN ? { token: env.SUPERVISOR_TOKEN, url: env.PLANTERN_SUPERVISOR_URL || SUPERVISOR_URL } : null;
}

/** The connections and their bridges; emits 'state' { connection, entity, state } and 'status' { connection, status }. */
export function createHaHub({ dataDir, WebSocketImpl = globalThis.WebSocket, testTimeout = 8000, supervisor = null } = {}) {
  const hub = new EventEmitter(), bridges = new Map(), file = path.join(dataDir, 'ha.json');
  const read = async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return { connections: {} }; throw e; } };
  const write = conf => writeAtomic(file, JSON.stringify(conf, null, 2) + '\n');
  const stop = name => { bridges.get(name)?.close(); bridges.delete(name); };

  const guardBuiltin = name => { if (supervisor && name === BUILTIN) throw Object.assign(new Error('this connection belongs to the add-on and cannot be changed'), { status: 400 }); };
  hub.list = async () => {
    const conf = await read(), secrets = await loadSecrets(dataDir);
    const own = Object.entries(conf.connections || {}).filter(([name]) => !(supervisor && name === BUILTIN)).map(([name, c]) => {
      const b = bridges.get(name);
      return { name, url: c.url, tokenSet: !!secrets[key(name)]?.token, status: b?.status ?? 'idle', ...(b?.haVersion ? { version: b.haVersion } : {}) };
    });
    if (!supervisor) return own;
    const b = bridges.get(BUILTIN);
    return [{ name: BUILTIN, url: 'Home Assistant (this add-on)', tokenSet: true, builtin: true, status: b?.status ?? 'idle', ...(b?.haVersion ? { version: b.haVersion } : {}) }, ...own];
  };
  hub.set = async (name, { url, token } = {}) => {
    guardBuiltin(name);
    if (!NAME.test(name || '') || name === 'connections') throw Object.assign(new Error('a connection name: lowercase letters, digits and _'), { status: 400 });
    if (!URL_OK.test(url || '')) throw Object.assign(new Error('the address must start with http://, https://, ws:// or wss://'), { status: 400 });
    const conf = await read();
    conf.connections = { ...(conf.connections || {}), [name]: { url: url.replace(/\/+$/, '') } };
    await write(conf);
    if (token) { const s = await loadSecrets(dataDir); s[key(name)] = { token: String(token) }; await saveSecrets(dataDir, s); }
    stop(name);                                                     // the next use connects with what is stored now
  };
  hub.remove = async name => {
    guardBuiltin(name);
    const conf = await read();
    delete conf.connections?.[name];
    await write(conf);
    const s = await loadSecrets(dataDir);
    if (s[key(name)]) { delete s[key(name)]; await saveSecrets(dataDir, s); }
    stop(name);
  };
  /** The bridge of a stored connection, connecting on first use (null when there is no such connection or token). */
  hub.bridge = async name => {
    if (bridges.has(name)) return bridges.get(name);
    let url, token;
    if (supervisor && name === BUILTIN) ({ url, token } = supervisor);
    else {
      const c = (await read()).connections?.[name];
      url = c?.url; token = (await loadSecrets(dataDir))[key(name)]?.token;
    }
    if (!url || !token) return null;
    const b = createHaBridge({ url, token }, { WebSocketImpl });
    bridges.set(name, b);
    b.onStatus(status => hub.emit('status', { connection: name, status }));
    b.subscribe((entity, state) => hub.emit('state', { connection: name, entity, state }));
    b.connect().catch(() => {});
    return b;
  };
  /** Try an address and token (given, or the stored ones) without keeping the connection. */
  hub.test = async (name, { url, token } = {}) => {
    guardBuiltin(name);
    const c = (await read()).connections?.[name], secrets = await loadSecrets(dataDir);
    url ||= c?.url; token ||= secrets[key(name)]?.token;
    if (!url || !token) return { ok: false, error: 'give the address and a long-lived access token' };
    let b;
    try {
      b = createHaBridge({ url, token }, { WebSocketImpl });
      const ok = await connectWithin(b, testTimeout);
      if (ok) return { ok: true, version: b.haVersion, entities: b.states.size };
      return { ok: false, error: b.status === 'auth_invalid' ? 'Home Assistant refused the token' : `no answer from ${url} (is the address right, and reachable from this computer?)` };
    } catch (e) {
      return { ok: false, error: redact(e.message, { t: { token } }) };
    } finally { b?.close(); }
  };
  hub.close = () => { for (const name of [...bridges.keys()]) stop(name); };
  return hub;
}

/** Handle /api/ha/…; false when the path is not ours. helpers: { json, readJsonBody, writeGuard }. */
export async function haApi(hub, req, res, url, { json, readJsonBody, writeGuard }) {
  const p = url.pathname;
  if (!p.startsWith('/api/ha/')) return false;
  try {
    if (req.method !== 'GET') { const bad = writeGuard(req); if (bad) return json(res, 403, { error: bad }), true; }
    if (p === '/api/ha/connections' && req.method === 'GET') return json(res, 200, { connections: await hub.list() }), true;
    const m = /^\/api\/ha\/connections\/([^/]+)(\/test)?$/.exec(p);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (m[2] && req.method === 'POST') return json(res, 200, await hub.test(name, await readJsonBody(req))), true;
      if (!m[2] && req.method === 'PUT') { await hub.set(name, await readJsonBody(req)); return json(res, 200, { ok: true }), true; }
      if (!m[2] && req.method === 'DELETE') { await hub.remove(name); return json(res, 200, { ok: true }), true; }
    }
    const s = /^\/api\/ha\/([^/]+)\/(states|call)$/.exec(p);
    if (s) {
      const b = await hub.bridge(decodeURIComponent(s[1]));
      if (!b) return json(res, 404, { error: `no Home Assistant connection "${decodeURIComponent(s[1])}" with a token` }), true;
      await connectWithin(b, 5000);
      if (s[2] === 'states' && req.method === 'GET') {
        const want = url.searchParams.get('entities')?.split(',').filter(Boolean);
        return json(res, 200, { status: b.status, states: want ? want.map(id => b.getState(id)).filter(Boolean) : [...b.states.values()] }), true;
      }
      if (s[2] === 'call' && req.method === 'POST') {
        const { domain, service, data = {}, target = {} } = await readJsonBody(req);
        if (!CALLABLE.includes(domain) || !/^[a-z_]+$/.test(service || '')) return json(res, 400, { error: `only ${CALLABLE.join(', ')} services` }), true;
        if (b.status !== 'connected') return json(res, 503, { error: `Home Assistant is ${b.status}` }), true;
        await b.callService(domain, service, data, target);
        return json(res, 200, { ok: true }), true;
      }
    }
    return json(res, 404, { error: 'no such API' }), true;
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
    return true;
  }
}
