// The library route of the local server (object-designs/, decision 233).
//   POST /api/library/models  { source } → { file, id, warnings }
//   GET  /api/library/textures/<file>  the image of a library material (object-designs/textures/), for a house that uses it
// Adds a generated model to object-designs/models/ and refreshes models/index.json, so the catalog lists it. The file
// must pass the same checks as the validator page (no errors), and an id already in the library is refused. Same-origin
// JSON, like the other write routes.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJsonBody, writeGuard } from '../store/api.js';
import { checkModule } from '../../object-designs/tools/check-core.js';
import { DESIGNS_DIR, loadTextures, readLibrary } from '../../object-designs/tools/node-io.js';
import { MODELS_DIR, indexText } from '../../object-designs/tools/index-models.js';

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const TEXTURE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Handle /api/library/models and /api/library/textures/<file>; false when the path is not ours. `dir` is the models folder and `textures` the textures folder (tests use their own). */
export async function libraryApi(req, res, url, { dir = MODELS_DIR, textures = resolve(DESIGNS_DIR, 'textures') } = {}) {
  const tex = /^\/api\/library\/textures\/([^/]+)$/.exec(url.pathname);
  if (tex) {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' }), true;
    const name = decodeURIComponent(tex[1]);
    const type = TEXTURE_TYPES[extname(name).toLowerCase()];
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name) || !type) return json(res, 404, { error: 'no such texture' }), true;
    try {
      const data = readFileSync(resolve(textures, name));
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch { json(res, 404, { error: 'no such texture' }); }
    return true;
  }
  if (url.pathname !== '/api/library/models') return false;
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' }), true;
  const bad = writeGuard(req);
  if (bad) return json(res, 403, { error: bad }), true;
  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return json(res, e.status ?? 400, { error: e.message }), true; }
  if (typeof body.source !== 'string' || !body.source.trim()) return json(res, 400, { error: 'send the model file as source' }), true;

  // The file is loaded from a temporary name in the models folder (so its ../lib imports resolve), checked, then renamed.
  const tmp = resolve(dir, `_incoming-${randomUUID()}.js`);
  try {
    writeFileSync(tmp, body.source);
    let model;
    try { model = await import(pathToFileURL(tmp).href); }
    catch (e) { return json(res, 400, { error: `does not load: ${e.message}` }), true; }
    const id = model.meta?.id;
    const fileName = `${id ?? ''}.js`;
    const library = readLibrary();
    const r = checkModule({ fileName, source: body.source, model, library, textures: loadTextures(library) });
    if (r.errors.length) return json(res, 400, { error: 'the model did not pass the checks', errors: r.errors, warnings: r.warnings }), true;
    const dest = resolve(dir, fileName);
    if (existsSync(dest)) return json(res, 409, { error: `${fileName} is already in the library` }), true;
    renameSync(tmp, dest);
    writeFileSync(resolve(dir, 'index.json'), indexText(dir));
    return json(res, 200, { file: fileName, id, warnings: r.warnings }), true;
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
  }
}
