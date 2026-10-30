// Home Assistant connections kept by Plantern's server (roadmap 11, docs/archive/ha-11-12.md S2/S3).
// The URL is in <dataDir>/ha.json, the token in secrets.json under "ha:<name>"; the token never
// leaves the server (responses say only tokenSet). One bridge per connection, opened when first
// needed and kept open (tools/ha/bridge.js).
//   GET    /api/ha/connections              → { connections: [{ name, url, tokenSet, status, version }] }
//   PUT    /api/ha/connections/:name        { url, token? } (token omitted = keep the stored one)
//   DELETE /api/ha/connections/:name
//   POST   /api/ha/connections/:name/test   { url?, token? } → { ok, version, entities } | { ok: false, error }
//   POST   /api/ha/connections/:name/rename { to, houses? } → { name, houses: [ids changed], failed: [{ id, error }] }
//   GET    /api/ha/:name/states[?entities=a,b] → { status, states: [HA state objects] } (connects on first use)
//   POST   /api/ha/:name/call               { domain, service, data?, target? } (only the domains the pages use)
// Live: `ha` { connection, entity, state } and `ha-status` { connection, status } on /api/events.

import path from 'node:path';
import { EventEmitter } from 'node:events';
import { promises as fs, readFileSync } from 'node:fs';
import { loadSecrets, saveSecrets, writeAtomic, redact } from '../store/settings.js';
import { createHaBridge, connectWithin } from './bridge.js';

const NAME = /^[a-z0-9_]{1,40}$/;
const URL_OK = /^(https?|wss?):\/\/[^\s]+$/i;
const key = name => `ha:${name}`;
/** Service domains a page may call (toggling lamps and switches). */
export const CALLABLE = ['light', 'switch', 'fan', 'input_boolean'];

/** The add-on's own connection: HA's Supervisor proxy, signed in with SUPERVISOR_TOKEN (never stored or shown). Its name is an add-on option (connection_name). */
export const BUILTIN = 'home_assistant';
export const SUPERVISOR_URL = 'ws://supervisor/core/websocket';
/** The connection name from the add-on's options (/data/options.json): BUILTIN when it is missing or not a valid name (logged). */
export function connectionNameFromOptions(options, log = () => {}) {
  const v = options?.connection_name;
  if (v === undefined || v === null || v === '') return BUILTIN;
  if (typeof v === 'string' && NAME.test(v) && v !== 'connections') return v;
  log(`Plantern: the add-on option connection_name "${v}" is not a valid name (lowercase letters, digits and _); using ${BUILTIN}`);
  return BUILTIN;
}
/** Reads the add-on's options file; {} when there is none or it is not JSON. */
export function readAddonOptions(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}
/** { token, url, name } when running as an HA add-on (env has SUPERVISOR_TOKEN), else null. name: the built-in connection's name (options.connection_name, default home_assistant). */
export function supervisorFromEnv(env = process.env, { options = {}, log } = {}) {
  return env.SUPERVISOR_TOKEN ? { token: env.SUPERVISOR_TOKEN, url: env.PLANTERN_SUPERVISOR_URL || SUPERVISOR_URL, name: connectionNameFromOptions(options, log) } : null;
}

/** The connections and their bridges; emits 'state' { connection, entity, state } and 'status' { connection, status }. */
export function createHaHub({ dataDir, WebSocketImpl = globalThis.WebSocket, testTimeout = 8000, supervisor = null, handshakeMs, log = () => {} } = {}) {
  const builtin = supervisor ? (supervisor.name || BUILTIN) : null;       // the built-in connection's name
  const hub = new EventEmitter(), bridges = new Map(), file = path.join(dataDir, 'ha.json');
  const read = async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return { connections: {} }; throw e; } };
  const write = conf => writeAtomic(file, JSON.stringify(conf, null, 2) + '\n');
  const stop = name => { bridges.get(name)?.close(); bridges.delete(name); };

  hub.builtin = builtin;
  const guardBuiltin = name => { if (supervisor && name === builtin) throw Object.assign(new Error('this connection belongs to the add-on and cannot be changed'), { status: 400 }); };
  hub.list = async () => {
    const conf = await read(), secrets = await loadSecrets(dataDir);
    // a stored connection with the built-in's name is shadowed by it: listed with shadowed: true, so the Settings page can say so and offer to remove it
    const own = Object.entries(conf.connections || {}).map(([name, c]) => {
      const shadowed = !!supervisor && name === builtin, b = shadowed ? null : bridges.get(name);
      return { name, url: c.url, tokenSet: !!secrets[key(name)]?.token, status: b?.status ?? 'idle', ...(shadowed ? { shadowed: true } : {}), ...(b?.haVersion ? { version: b.haVersion } : {}) };
    });
    if (!supervisor) return own;
    const b = bridges.get(builtin);
    return [{ name: builtin, url: 'Home Assistant (this add-on)', tokenSet: true, builtin: true, status: b?.status ?? 'idle', ...(b?.haVersion ? { version: b.haVersion } : {}) }, ...own];
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
    const conf = await read();
    if (!conf.connections?.[name]) guardBuiltin(name);                // the built-in has nothing stored; a stored one it shadows can go
    delete conf.connections?.[name];
    await write(conf);
    const s = await loadSecrets(dataDir);
    if (s[key(name)]) { delete s[key(name)]; await saveSecrets(dataDir, s); }
    stop(name);
  };
  /**
   * Gives a stored connection another name: its address and token move to the new key (the new one first, then the old removed) and the old bridge is closed.
   * Refuses a bad name, the built-in connection (its name is the add-on option) and a name that is taken. Houses are not touched here (renameConnection does that).
   */
  hub.rename = async (from, to) => {
    guardBuiltin(from);
    if (!NAME.test(to || '') || to === 'connections') throw Object.assign(new Error('a connection name: lowercase letters, digits and _'), { status: 400 });
    if (supervisor && to === builtin) throw Object.assign(new Error(`"${to}" is the name of the add-on's own connection`), { status: 400 });
    const conf = await read();
    if (!conf.connections?.[from]) throw Object.assign(new Error(`no connection "${from}"`), { status: 404 });
    if (conf.connections[to]) throw Object.assign(new Error(`there is already a connection "${to}"`), { status: 409 });
    const secrets = await loadSecrets(dataDir);
    if (secrets[key(from)]) { secrets[key(to)] = secrets[key(from)]; await saveSecrets(dataDir, secrets); }
    conf.connections = { ...conf.connections, [to]: conf.connections[from] };
    await write(conf);
    delete conf.connections[from];
    await write(conf);
    if (secrets[key(from)]) { delete secrets[key(from)]; await saveSecrets(dataDir, secrets); }
    stop(from);
  };
  /** The bridge of a stored connection, connecting on first use (null when there is no such connection or token). */
  hub.bridge = async name => {
    if (bridges.has(name)) return bridges.get(name);
    let url, token;
    if (supervisor && name === builtin) ({ url, token } = supervisor);
    else {
      const c = (await read()).connections?.[name];
      url = c?.url; token = (await loadSecrets(dataDir))[key(name)]?.token;
    }
    if (!url || !token) return null;
    const b = createHaBridge({ url, token }, { WebSocketImpl, handshakeMs });
    bridges.set(name, b);
    let said;
    b.onStatus((status, detail) => {
      hub.emit('status', { connection: name, status });
      // in the log (the add-on's Log tab), so a connection that does not come up says why; the token never goes in
      const line = `Home Assistant connection "${name}": ${status}${detail ? ` (${redact(String(detail), { t: { token } })})` : ''}`;
      if (status && line !== said) { said = line; log(line); }
    });
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
export async function haApi(hub, req, res, url, { json, readJsonBody, writeGuard, registry = null }) {
  const p = url.pathname;
  if (!p.startsWith('/api/ha/')) return false;
  try {
    if (req.method !== 'GET') { const bad = writeGuard(req); if (bad) return json(res, 403, { error: bad }), true; }
    if (p === '/api/ha/connections' && req.method === 'GET') return json(res, 200, { connections: await hub.list() }), true;
    const m = /^\/api\/ha\/connections\/([^/]+)(\/test|\/rename)?$/.exec(p);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (m[2] === '/rename' && req.method === 'POST') return json(res, 200, await renameConnection(hub, registry, name, await readJsonBody(req))), true;
      if (m[2] === '/test' && req.method === 'POST') return json(res, 200, await hub.test(name, await readJsonBody(req))), true;
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

/** The houses on this server whose location.json names connection `name`: [{ id, name, readOnly }] (read-only storages included, they cannot be changed). */
export async function housesUsing(registry, name) {
  const out = [];
  for (const h of registry?.houses?.() || []) {
    try { const d = await registry.load(h.id); if (JSON.parse(d.location.text).integrations?.ha?.connection === name) out.push({ id: h.id, name: h.name, readOnly: !!d.readOnly }); } catch { /* unreadable: not ours to change */ }
  }
  return out;
}

/** Rename a stored connection; with houses: true also the houses that name it, through the registry's save (a git storage commits and pushes). */
export async function renameConnection(hub, registry, from, { to, houses = false } = {}) {
  const users = houses ? await housesUsing(registry, from) : [];
  await hub.rename(from, to);
  const changed = [], failed = [];
  for (const h of users) {
    try {
      if (h.readOnly) throw new Error('its storage is read-only');
      const d = await registry.load(h.id), loc = JSON.parse(d.location.text);
      loc.integrations.ha.connection = to;
      const r = await registry.save(h.id, 'location', loc, d.location.text);
      if (r.conflict) throw new Error('it was changed elsewhere meanwhile');
      changed.push(h.id);
    } catch (e) { failed.push({ id: h.id, error: e.message }); }
  }
  return { name: to, houses: changed, failed };
}
