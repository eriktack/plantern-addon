// The house and storage API of the local server (docs/proposals/2026-10-09-house-storage.md §3.4).
//   GET  /api/houses                     → { houses: [...], showDemo }
//   GET  /api/houses/:id                 → { id, name, store, readOnly, sync, location: { text, version }, model: { text, version } }
//   GET  /api/houses/:id/versions        → { location, model } (for pages that cannot keep an event stream open)
//   GET  /api/houses/:id/assets/<path>   → a file inside the house folder (textures)
//   POST /api/houses/:id/save            { file: 'location' | 'model', value, base } → { version, text, merged? } | 409 { conflict }
//   GET  /api/events                     → server-sent events: changed { house, file, version, source }, houses {}
// Everything here is for your own network only, like saving (decision 106).

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { inside } from './folder.js';
import { storeRoutes } from './manage.js';

const MAX_BODY = 8 * 1024 * 1024;

export async function readJsonBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('request too large'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('malformed JSON body'), { status: 400 }); }
}

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

/**
 * Is the Origin header (if any) this server's own address? Behind Home Assistant's ingress the
 * Supervisor proxies the page: Host is the add-on's address and the browser's is in X-Forwarded-Host,
 * which is trusted only together with X-Ingress-Path (set by the Supervisor; the guard that lets
 * only private peers in runs before this).
 */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const hosts = [req.headers.host];
  if (req.headers['x-ingress-path'] && req.headers['x-forwarded-host']) hosts.push(String(req.headers['x-forwarded-host']).split(',')[0].trim());
  return hosts.some(h => h && (origin === `http://${h}` || origin === `https://${h}`));
}

/** Same-origin JSON writes only (the same rules as /api/save). */
export function writeGuard(req) {
  if (!sameOrigin(req)) return 'cross-origin request refused';
  if (req.method !== 'DELETE' && !/^application\/json\b/i.test(req.headers['content-type'] || '')) return 'send application/json';
  return null;
}

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.json': 'application/json; charset=utf-8' };

/** Handle /api/houses… and /api/events (and the storage routes); false when the path is not ours. */
export async function houseApi(registry, req, res, url, { ha } = {}) {
  const p = url.pathname;
  if (!p.startsWith('/api/houses') && p !== '/api/events' && !p.startsWith('/api/stores') && !p.startsWith('/api/fs') && p !== '/api/settings') return false;
  await registry.ready;
  try {
    if (req.method !== 'GET') { const bad = writeGuard(req); if (bad) return json(res, 403, { error: bad }), true; }
    if (p === '/api/events' && req.method === 'GET') return events(registry, req, res, ha), true;
    if (p === '/api/houses' && req.method === 'GET') return json(res, 200, { houses: registry.houses(), showDemo: registry.settings.showDemo }), true;
    const m = /^\/api\/houses\/([^/]+)(?:\/(.*))?$/.exec(p);
    if (m) {
      const id = decodeURIComponent(m[1]), rest = m[2] || '';
      if (!rest && req.method === 'GET') return json(res, 200, await registry.load(id)), true;
      if (rest === 'versions' && req.method === 'GET') { const h = await registry.load(id); return json(res, 200, { location: h.location.version, model: h.model.version }), true; }
      if (rest === 'save' && req.method === 'POST') {
        const b = await readJsonBody(req);
        if (typeof b.value !== 'object' || b.value === null) return json(res, 400, { error: 'value must be a JSON object' }), true;
        const r = await registry.save(id, b.file, b.value, typeof b.base === 'string' ? b.base : undefined, typeof b.client === 'string' ? b.client.slice(0, 64) : undefined);
        return json(res, r.conflict ? 409 : 200, r), true;
      }
      if (rest.startsWith('assets/') && req.method === 'GET') {
        const f = registry.find(id), file = f && inside(f.house.dir, decodeURIComponent(rest));
        if (!file) return json(res, 404, { error: 'not found' }), true;
        try { const data = await fs.readFile(file); res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); }
        catch { json(res, 404, { error: 'not found' }); }
        return true;
      }
    }
    if (await storeRoutes(registry, req, res, url, { json, readJsonBody })) return true;
    return json(res, 404, { error: 'no such API' }), true;
  } catch (e) {
    json(res, e.status || 500, { error: e.status ? e.message : `${e.message}` });
    return true;
  }
}

/** Server-sent events: every change the registry announces, for the pages to react to. */
function events(registry, req, res, ha) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const send = type => data => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const handlers = { changed: send('changed'), houses: send('houses'), sync: send('sync') };
  for (const [k, f] of Object.entries(handlers)) registry.on(k, f);
  // Home Assistant: states and connection status from the server's bridges (tools/ha/api.js)
  const haHandlers = { state: send('ha'), status: send('ha-status') };
  if (ha) for (const [k, f] of Object.entries(haHandlers)) ha.on(k, f);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); for (const [k, f] of Object.entries(handlers)) registry.off(k, f); if (ha) for (const [k, f] of Object.entries(haHandlers)) ha.off(k, f); });
}
