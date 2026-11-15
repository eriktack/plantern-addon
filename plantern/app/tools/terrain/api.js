// Ground heights from Lantmäteriet through Plantern's server (decision 311). The Geotorget login is kept in <dataDir>/secrets.json
// under "lantmateriet" and never leaves the server (pages see only whether one is saved, and the user name).
//   GET    /api/terrain/login        → { set, user? }
//   PUT    /api/terrain/login        { user, password }
//   DELETE /api/terrain/login
//   POST   /api/terrain/fetch        { site, boundary } → { terrain }   (the yard.terrain for that outline)

import { loadSecrets, saveSecrets, redact } from '../store/settings.js';
import { fetchTerrain, swerefBox } from './lm.js';

const KEY = 'lantmateriet';

export async function terrainApi(req, res, url, { dataDir, json, readJsonBody, writeGuard, fetchImpl }) {
  if (!url.pathname.startsWith('/api/terrain/')) return false;
  const secrets = await loadSecrets(dataDir), login = secrets[KEY];
  if (url.pathname === '/api/terrain/login') {
    if (req.method === 'GET') return json(res, 200, { set: !!(login?.user && login?.password), ...(login?.user ? { user: login.user } : {}) }), true;
    const bad = writeGuard(req);
    if (bad) return json(res, 403, { error: bad }), true;
    if (req.method === 'DELETE') { delete secrets[KEY]; await saveSecrets(dataDir, secrets); return json(res, 200, { set: false }), true; }
    if (req.method !== 'PUT') return json(res, 405, { error: 'GET, PUT or DELETE' }), true;
    let body;
    try { body = await readJsonBody(req); } catch (e) { return json(res, e.status ?? 400, { error: e.message }), true; }
    const user = String(body?.user ?? '').trim(), password = String(body?.password ?? '');
    if (!user || !password) return json(res, 400, { error: 'both the user name and the password are needed' }), true;
    secrets[KEY] = { user, password };
    await saveSecrets(dataDir, secrets);
    return json(res, 200, { set: true, user }), true;
  }
  if (url.pathname === '/api/terrain/fetch') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' }), true;
    const bad = writeGuard(req);
    if (bad) return json(res, 403, { error: bad }), true;
    let body;
    try { body = await readJsonBody(req); } catch (e) { return json(res, e.status ?? 400, { error: e.message }), true; }
    if (!login?.user) return json(res, 400, { error: 'no Geotorget login saved yet' }), true;
    try {
      const terrain = await fetchTerrain(swerefBox(body?.boundary, body?.site), login, fetchImpl ? { fetchImpl } : {});
      return json(res, 200, { terrain }), true;
    } catch (e) { return json(res, 502, { error: redact(e.message, { [KEY]: login }) }), true; }
  }
  return json(res, 404, { error: 'not found' }), true;
}
