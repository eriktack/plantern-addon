// The GLB routes of the local server (docs/archive/2026-10-14-object-templates.md, T4 and T5; decision 185).
//   POST   /api/glb          { house?, blueprint, params?, partMaterials? } → { hash, size, light, colour, cutout, rest }   (builds the GLB when it is not cached;
//            cutout and rest: the holes a model needs in what it is set into and the height of it that rests there, niches: the niches it
//            has for appliances, each null when it has none; decisions 284, 285)
//            { house?, batch: [{ blueprint, params?, partMaterials? }, …] } → { results: [{ hash, size, light, colour } | { error, status }, …] }:
//            many objects in one request, answered in the same order (the Editor asks for a whole house at once, PF15)
//   GET    /api/glb/<hash>   → the GLB (model/gltf-binary); it never changes for a hash, so it is cached for a year
//   GET    /api/houses/<id>/blueprints → { blueprints: [{ id, source, meta, json? }], refused }: the built-in models and the house's own
//   DELETE /api/glb-cache    → { objects, bytes }: empties the cache (*Clear cache* on the Settings page)
//   POST   /api/houses/<id>/export-asset { blueprint, params?, partMaterials?, name? } → { name, path, size, sync }
//            writes the model and its meta.json into the house's own assets/<name>/ (default name: the blueprint id;
//            an existing one is replaced), in whatever storage the house is (decision 225)
// Only from your own network (checked before the routes run) and as same-origin JSON, like the other write routes.

import { readJsonBody, writeGuard } from '../store/api.js';
import { ASSET_NAME } from '../../src/model/assets.js';
import { formatMeta } from '../../object-designs/lib/asset-meta.js';

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

/** Handle /api/glb… and /api/glb-cache; false when the path is not ours. */
export async function glbApi(cache, registry, req, res, url) {
  const p = url.pathname;
  if (p === '/api/glb-cache') {
    if (req.method !== 'DELETE') return json(res, 405, { error: 'DELETE only' }), true;
    const bad = writeGuard(req);
    if (bad) return json(res, 403, { error: bad }), true;
    try { return json(res, 200, await cache.clear()), true; }
    catch (e) { return json(res, 500, { error: e.message }), true; }
  }
  const listed = /^\/api\/houses\/([^/]+)\/blueprints$/.exec(p);
  if (listed) {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' }), true;
    try {
      await registry.ready;
      const id = decodeURIComponent(listed[1]), house = registry.find(id)?.house;
      if (!house) return json(res, 404, { error: `there is no house "${id}"` }), true;
      return json(res, 200, await cache.list(house.dir)), true;
    } catch (e) { return json(res, 500, { error: e.message }), true; }
  }
  const exported = /^\/api\/houses\/([^/]+)\/export-asset$/.exec(p);
  if (exported) {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' }), true;
    const bad = writeGuard(req);
    if (bad) return json(res, 403, { error: bad }), true;
    try {
      await registry.ready;
      const id = decodeURIComponent(exported[1]), found = registry.find(id);
      if (!found) return json(res, 404, { error: `there is no house "${id}"` }), true;
      const body = await readJsonBody(req);
      if (typeof body.blueprint !== 'string') return json(res, 400, { error: 'blueprint must be a blueprint id' }), true;
      const name = body.name ?? body.blueprint;
      if (typeof name !== 'string' || !ASSET_NAME.test(name)) return json(res, 400, { error: `the asset name "${name}" must be lower-case letters, digits and dashes` }), true;
      const r = await cache.exportAsset({ houseDir: found.house.dir, blueprint: body.blueprint, params: body.params, partMaterials: body.partMaterials });
      const w = await registry.writeAsset(id, name, { 'model.glb': r.glb, 'meta.json': formatMeta(r.meta) });
      return json(res, 200, { name, path: `assets/${name}`, size: r.size, sync: w.sync }), true;
    } catch (e) {
      return json(res, e.status || 500, { error: e.message }), true;
    }
  }
  if (p !== '/api/glb' && !p.startsWith('/api/glb/')) return false;
  try {
    if (p === '/api/glb') {
      if (req.method !== 'POST') return json(res, 405, { error: 'POST only' }), true;
      const bad = writeGuard(req);
      if (bad) return json(res, 403, { error: bad }), true;
      const body = await readJsonBody(req);
      let houseDir;
      if (body.house !== undefined) {
        await registry.ready;
        houseDir = typeof body.house === 'string' ? registry.find(body.house)?.house.dir : undefined;
        if (!houseDir) return json(res, 404, { error: `there is no house "${body.house}"` }), true;
      }
      if (body.batch !== undefined) {
        if (!Array.isArray(body.batch) || body.batch.length > 500) return json(res, 400, { error: 'batch must be a list of at most 500 requests' }), true;
        const results = [];
        for (const r of body.batch) {
          try { results.push(await cache.ensure({ houseDir, blueprint: r?.blueprint, params: r?.params, partMaterials: r?.partMaterials })); }
          catch (e) { results.push({ error: e.message, status: e.status || 500 }); }
        }
        return json(res, 200, { results }), true;
      }
      const { hash, size, light, colour, cutout, rest, niches } = await cache.ensure({ houseDir, blueprint: body.blueprint, params: body.params, partMaterials: body.partMaterials });
      return json(res, 200, { hash, size, light, colour, cutout, rest, niches }), true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' }), true;
    const hash = decodeURIComponent(p.slice('/api/glb/'.length));
    const data = await cache.read(hash);
    if (!data) return json(res, 404, { error: 'no such file' }), true;
    res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': data.length, 'Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${hash}"` });
    res.end(req.method === 'HEAD' ? undefined : data);
    return true;
  } catch (e) {
    json(res, e.status || 500, { error: e.message });
    return true;
  }
}
