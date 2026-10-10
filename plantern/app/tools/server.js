// Local dev server: static files plus ONE write endpoint, so the capture editor and the phone wizard
// can save the house (locations/**/*.json) without a browser folder picker. No dependencies.
//
//   GET  /api/info            → { plantern: true, save: true }          (pages use this to detect saving)
//   POST /api/save            { path, value, expectedBefore? } → { ok, path }
//        path: relative, below locations/, .json only (same rules as src/model/save.js)
//        value: the JSON to write, formatted with formatJson() (canonical)
//        expectedBefore: text the page loaded; 409 if the file on disk differs (Syncthing, other editor)
//
// Meant for your own network: writes are accepted only from loopback/private addresses, only from
// same-origin pages, only as application/json, only inside locations/. Not for the public internet.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkWritablePath } from '../src/model/save.js';
import { formatJson } from '../src/model/format.js';
import { Registry } from './store/registry.js';
import { defaultDataDir, renameRetry } from './store/settings.js';
import { houseApi, readJsonBody, sameOrigin, writeGuard } from './store/api.js';
import { createHaHub, haApi, supervisorFromEnv } from './ha/api.js';
import { createPublisher, publishDir } from './ha/publish.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};
const MAX_BODY = 5 * 1024 * 1024;

/** Loopback or private-network peer (IPv4, IPv6, IPv4-mapped). */
export function isLocalAddress(addr = '') {
  const a = addr.replace(/^::ffff:/, '');
  if (a === '::1' || a.startsWith('127.') || a.startsWith('10.') || a.startsWith('192.168.') || a.startsWith('169.254.')) return true;
  const m = a.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return /^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a);
}

const send = (res, status, body, headers = {}) => {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Cache-Control': 'no-store', ...(isObj ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
};

const norm = t => String(t).replace(/\r\n/g, '\n');

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('request too large'), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleSave(root, req, res) {
  if (!isLocalAddress(req.socket.remoteAddress)) return send(res, 403, { error: 'saving is only allowed from your own network' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'cross-origin save refused' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'send application/json' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.status || 400, { error: e.status ? e.message : 'malformed JSON body' }); }
  const rel = body?.path, bad = checkWritablePath(rel);
  if (bad) return send(res, 400, { error: bad });
  if (body.value === undefined || typeof body.value !== 'object' || body.value === null) return send(res, 400, { error: 'value must be a JSON object or array' });
  const file = path.resolve(root, ...rel.split('/'));
  if (!file.startsWith(path.resolve(root, 'locations') + path.sep)) return send(res, 400, { error: 'path escapes locations/' });
  let current = null;
  try { current = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') return send(res, 500, { error: e.message }); }
  if (body.expectedBefore !== undefined && current !== null && norm(current) !== norm(body.expectedBefore)) {
    return send(res, 409, { error: `${rel} changed on disk since it was loaded; reload the page before saving (Syncthing or another editor?)` });
  }
  const text = formatJson(body.value);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    await fs.writeFile(tmp, text, 'utf8');
    await renameRetry(tmp, file);                                // atomic: a reader never sees half a file
  } catch (e) { return send(res, 500, { error: `could not write ${rel}: ${e.message}` }); }
  send(res, 200, { ok: true, path: rel });
}

async function handleStatic(root, req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'bad url'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(root, '.' + rel);
  const base = path.resolve(root);
  if (file !== base && !file.startsWith(base + path.sep)) return send(res, 403, 'forbidden');
  const relParts = path.relative(base, file).split(path.sep);
  if (relParts[0] === '.git' || relParts[0] === 'node_modules') return send(res, 404, 'not found');
  try {
    let target = file;
    // clean URLs: /wizard → wizard.html (old links and bookmarks keep working)
    if (!path.extname(file) && !(await fs.stat(file).then(s => s.isFile(), () => false))) target = file + '.html';
    const data = await fs.readFile(target);
    send(res, 200, data, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
  } catch { send(res, 404, 'not found'); }
}

/**
 * Build the (not yet listening) server for the app folder. dataDir: Plantern's settings folder (its
 * storages and their secrets; default per platform, see store/settings.js; tests pass a temporary one).
 */
export function createPlanternServer(root, { env = process.env, dataDir = defaultDataDir(env), WebSocketImpl, publishTo = publishDir(env), publishDebounce } = {}) {
  const registry = new Registry({ appRoot: root, dataDir });
  const ha = createHaHub({ dataDir, supervisor: supervisorFromEnv(env), ...(WebSocketImpl ? { WebSocketImpl } : {}) });       // Home Assistant connections (tools/ha/)
  registry.ready.catch(e => console.error(`Plantern settings (${dataDir}): ${e.message}`));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/api/info' && req.method === 'GET') return send(res, 200, { plantern: true, save: true, stores: true });
      // houses, storages and the folder browser: your own network only (like saving)
      if (url.pathname.startsWith('/api/') && !isLocalAddress(req.socket.remoteAddress)) return send(res, 403, { error: 'only from your own network' });
      if (await haApi(ha, req, res, url, { json: send, readJsonBody, writeGuard })) return;
      if (await houseApi(registry, req, res, url, { ha })) return;
      if (url.pathname === '/api/save') return req.method === 'POST' ? await handleSave(root, req, res) : send(res, 405, { error: 'POST only' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
      await handleStatic(root, req, res);
    } catch (e) { send(res, 500, { error: e.message }); }
  });
  // As an add-on: mirror the Lovelace card and the houses to /config/www/plantern (tools/ha/publish.js, S15)
  let publisher = null;
  if (publishTo) {
    publisher = createPublisher({ registry, hub: ha, root, target: publishTo, ...(publishDebounce ? { debounceMs: publishDebounce } : {}) });
    const explicit = publishTo !== publishDir({ SUPERVISOR_TOKEN: env.SUPERVISOR_TOKEN });
    // the default folder is inside the add-on's /config mapping: without the mapping there is nothing to publish to
    const mapped = explicit ? Promise.resolve() : fs.access(path.dirname(path.dirname(publishTo)));
    server.published = mapped.then(() => publisher.start(), () => { console.log('Plantern card: the add-on has no access to the Home Assistant config folder (/homeassistant or /config), so the card is not published. Check the add-on is up to date.'); publisher = null; });
  }
  server.registry = registry; server.ha = ha; server.publisher = () => publisher;
  server.on('close', () => { publisher?.stop(); registry.close(); ha.close(); });
  return server;
}
