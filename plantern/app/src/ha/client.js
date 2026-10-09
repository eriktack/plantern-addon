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

/**
 * Resolve the connection for a location: location.integrations.ha.connection names a connection kept
 * by Plantern's server (serverConnections: the names it has, from api/ha/connections; the token stays
 * there), else an entry in config.local.json → connections. Missing → mock, with a reason the UI can show.
 */
export function resolveConnection(location, localConfig, serverConnections = []) {
  const name = location.integrations?.ha?.connection;
  // in the HA add-on a house without a connection uses the add-on's own
  if (!name && serverConnections.includes('home_assistant')) return { name: 'home_assistant', conn: { type: 'server', name: 'home_assistant' } };
  if (!name) return { name: null, conn: { type: 'mock' }, note: 'location has no HA connection; using mock' };
  if (serverConnections.includes(name)) return { name, conn: { type: 'server', name } };
  const conn = localConfig.connections?.[name];
  if (!conn) return { name, conn: { type: 'mock' }, note: `connection "${name}" is neither set up in Plantern (Storage page) nor in config.local.json; using mock` };
  return { name, conn };
}

/** Unique entity ids bound in a location. */
export const boundEntities = location => [...new Set(Object.values(location.bindings || {}).map(b => b.entity).filter(Boolean))];
