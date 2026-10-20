import { MockHA } from './mock.js';
import { WsHA } from './ws.js';
import { HassHA } from './hass.js';
import { ServerHA } from './server.js';

/**
 * The only place a connection type is chosen. Nothing else in src/ knows URLs or tokens.
 * @param conn  connection object from config.local.json (or undefined → mock)
 * @param opts  { entities: string[] } entity ids bound in the location
 */
export function createHaClient(conn, { entities = [] } = {}) {
  switch (conn?.type ?? 'mock') {
    case 'ws': return new WsHA(conn);
    case 'hass': return new HassHA({ entities });
    case 'server': return new ServerHA(conn);
    case 'mock': return new MockHA({ entities, states: conn?.states });
    default: throw new Error(`unknown HA connection type "${conn.type}"`);
  }
}

/** The connections of api/ha/connections as { name, builtin } (plain names are accepted too); a stored connection the built-in one shadows is left out. */
export const serverConnectionList = list => (list || []).filter(c => !c?.shadowed).map(c => (typeof c === 'string' ? { name: c, builtin: false } : { name: c.name, builtin: !!c.builtin }));

/**
 * Resolve the connection for a location: location.integrations.ha.connection names a connection kept by Plantern's server
 * (serverConnections: what it has, from api/ha/connections, as { name, builtin } or plain names; the token stays there), else an
 * entry in config.local.json → connections. One rule:
 *  (a) the house names a connection the server has (the built-in one included): use it;
 *  (b) it names none: use the server's built-in connection (the Home Assistant add-on's own);
 *  (c) it names one that is neither on the server nor in config.local.json, and the server has a built-in one: use that, with fallback: true and a note;
 *  (d) otherwise mock, with a reason the UI can show. A PC has no built-in connection, so nothing there is a silent stand-in.
 * Returns { name, conn, note?, fallback? }.
 */
export function resolveConnection(location, localConfig, serverConnections = []) {
  const name = location.integrations?.ha?.connection, list = serverConnectionList(serverConnections), builtin = list.find(c => c.builtin);
  if (!name && builtin) return { name: builtin.name, conn: { type: 'server', name: builtin.name } };
  if (!name) return { name: null, conn: { type: 'mock' }, note: 'location has no HA connection; using mock' };
  if (list.some(c => c.name === name)) return { name, conn: { type: 'server', name } };
  const conn = localConfig.connections?.[name];
  if (conn) return { name, conn };
  if (builtin) return { name: builtin.name, conn: { type: 'server', name: builtin.name }, fallback: true, note: `connection "${name}" is not set up in this Plantern; using the Home Assistant add-on's own connection ("${builtin.name}")` };
  return { name, conn: { type: 'mock' }, note: `connection "${name}" is neither set up in Plantern (Settings page) nor in config.local.json; using mock` };
}

/** Unique entity ids bound in a location. */
export const boundEntities = location => [...new Set(Object.values(location.bindings || {}).flatMap(b => [b.entity, b.lock]).filter(Boolean))];
