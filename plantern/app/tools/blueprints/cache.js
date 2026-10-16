// The server's GLB cache (docs/archive/2026-10-14-object-templates.md, T4; decisions 185, 186, 189).
//
// A placed object names a blueprint (a built-in model of object-designs/models/ or a house's blueprints/<id>.json), its
// params and partMaterials. The server resolves the params, hashes everything the output depends on, builds the GLB when
// that hash is not cached, and keeps it in the settings folder (never in the house). A page asks for the hash and the size,
// then fetches the file, which never changes for that hash.
//
//   cache.ensure({ houseDir, blueprint, params, partMaterials }) → { hash, size }   (builds when needed)
//   cache.read(hash) → Buffer | null
//
// Errors are GlbError with the HTTP status to answer: 400 for a bad blueprint or bad params (the reason is the message),
// 404 for a blueprint that does not exist, 503 when the code that builds changed since the server started.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildModel } from '../../object-designs/lib/build.js';
import { resolveParams } from '../../object-designs/lib/params.js';
import { meshBounds } from '../../object-designs/lib/geom.js';
import { assetMeta } from '../../object-designs/lib/asset-meta.js';
import { parseHouseBlueprint, loadBlueprints } from '../../src/blueprints/load.js';
import { blueprintModule } from '../../src/blueprints/build.js';
import { renameRetry } from '../store/settings.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGNS_DIR = path.resolve(HERE, '../../object-designs');
const SRC_DIR = path.resolve(HERE, '../../src');
const BLUEPRINT_ID = /^[a-z][a-z0-9-]*$/;
const HASH = /^[0-9a-f]{64}$/;
const round1 = v => Math.round(v * 10) / 10;
const sha = data => createHash('sha256').update(data).digest('hex');

export class GlbError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** JSON with sorted keys, so the same settings always give the same text. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** Every file below `dir` (relative paths, forward slashes), or none when the folder is missing. */
async function walk(dir, rel = '') {
  const out = [];
  for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => [])) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walk(dir, r)); else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

// The files the cache writes, and the temporary ones it may leave behind (a half-written file of a stopped server).
const CACHE_FILE = /^[0-9a-f]{64}\.(glb|json)(\.tmp-\d+)?$/;

/**
 * The size limit of the cache in bytes, from `glbCacheLimitMB` in Plantern's settings.json (optional; null when there is
 * none or it is not a positive number). Read on every build, so a change needs no restart.
 */
export async function readCacheLimit(dataDir) {
  let settings;
  try { settings = JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')); }
  catch { return null; }
  const mb = settings?.glbCacheLimitMB;
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : null;
}

export function createGlbCache({ dir, designsDir = DESIGNS_DIR, srcDir = SRC_DIR, limitBytes = async () => null } = {}) {
  if (!dir) throw new Error('createGlbCache needs a folder');
  const building = new Map();            // hash → promise, so two requests for one object build it once
  const digests = new Map();             // a digest of a set of files, kept while their size and times do not change

  /** A digest of the given files ([base, rel]): their names and bytes, re-read only when a size or time changed. */
  async function digestOf(label, files) {
    const stats = await Promise.all(files.map(async ([base, rel]) => {
      const s = await fs.stat(path.join(base, rel)).catch(() => null);
      return `${rel}:${s ? `${s.size}:${s.mtimeMs}` : 'missing'}`;
    }));
    const signature = stats.join('|');
    const hit = digests.get(label);
    if (hit?.signature === signature) return hit.digest;
    const h = createHash('sha256');
    for (const [base, rel] of files) {
      h.update(`${rel}\0`);
      h.update(await fs.readFile(path.join(base, rel)).catch(() => 'missing'));
    }
    const digest = h.digest('hex');
    digests.set(label, { signature, digest });
    return digest;
  }

  /** The code that builds: lib/, the vendored jscad and the blueprint reader and interpreter. Loaded once, so a change needs a restart. */
  async function codeDigest() {
    const files = [
      ...(await walk(path.join(designsDir, 'lib'))).map(r => [designsDir, `lib/${r}`]),
      ...(await walk(path.join(designsDir, 'vendor/jscad'))).map(r => [designsDir, `vendor/jscad/${r}`]),
      // only the reader and the interpreter shape a GLB (not place.js and the like), so those are what a change must not slip past
      ...['blueprints/load.js', 'blueprints/build.js'].map(r => [srcDir, r]),
    ];
    return digestOf('code', files);
  }
  const started = codeDigest().catch(() => null);

  async function readLibrary() {
    try { return JSON.parse(await fs.readFile(path.join(designsDir, 'materials/library.json'), 'utf8')); }
    catch (e) { throw new GlbError(500, `the materials library cannot be read: ${e.message}`); }
  }

  /** The materials library and the texture files it names: they change without a restart. */
  async function dataDigest(library) {
    const textures = [...new Set(Object.values(library).map(e => e?.texture).filter(Boolean))].sort();
    return digestOf('data', [[designsDir, 'materials/library.json'], ...textures.map(t => [designsDir, t])]);
  }

  async function loadTextures(library) {
    const out = new Map();
    for (const entry of Object.values(library)) {
      const p = entry?.texture;
      if (!p || out.has(p)) continue;
      const bytes = await fs.readFile(path.join(designsDir, p)).catch(() => null);
      if (bytes) out.set(p, { bytes: new Uint8Array(bytes), mime: /\.png$/i.test(p) ? 'image/png' : 'image/jpeg' });
    }
    return out;
  }

  /** The blueprint a request names: { kind, text, model: { meta, build }, extraMaterials }. Built-in models win over house files. */
  async function findBlueprint(id, houseDir, library) {
    if (typeof id !== 'string' || !BLUEPRINT_ID.test(id)) throw new GlbError(400, 'blueprint must be a blueprint id (lowercase letters, digits and dashes)');
    const modelFile = path.join(designsDir, 'models', `${id}.js`);
    const builtIn = await fs.readFile(modelFile, 'utf8').catch(() => null);
    if (builtIn !== null) {
      // one module per version of the file, so an edited model is read again without restarting the server
      const model = await import(`${pathToFileURL(modelFile).href}?v=${sha(builtIn).slice(0, 16)}`).catch(e => { throw new GlbError(400, `the model "${id}" cannot be loaded: ${e.message}`); });
      return { kind: 'built-in', text: builtIn, model, extraMaterials: {} };
    }
    const text = houseDir ? await fs.readFile(path.join(houseDir, 'blueprints', `${id}.json`), 'utf8').catch(() => null) : null;
    if (text === null) throw new GlbError(404, `there is no blueprint "${id}"`);
    const parsed = parseHouseBlueprint(text, { file: `${id}.json`, libraryNames: new Set(Object.keys(library)) });
    if (!parsed.ok) throw new GlbError(400, `the blueprint "${id}" is not valid: ${parsed.problems.join('; ')}`);
    return { kind: 'house', text, model: blueprintModule(parsed.json), extraMaterials: parsed.json.materials ?? {} };
  }

  /** Resolve a request and its hash (decision 186) without building. */
  async function resolve({ houseDir, blueprint, params, partMaterials } = {}) {
    if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) throw new GlbError(400, 'params must be an object');
    if (partMaterials !== undefined && (typeof partMaterials !== 'object' || partMaterials === null || Array.isArray(partMaterials))) throw new GlbError(400, 'partMaterials must be an object');
    const library = await readLibrary();
    const found = await findBlueprint(blueprint, houseDir, library);
    let resolved;
    try { resolved = resolveParams(found.model.meta, { ...params, ...(partMaterials ? { partMaterials } : {}) }); }
    catch (e) { throw new GlbError(400, e.message); }
    const hash = sha(['plantern-glb-1', await codeDigest(), await dataDigest(library), found.kind, found.text, canonical(resolved)].join('\n'));
    return { hash, found, resolved, library };
  }

  /** The built model (GLB, parts, params) for a resolved request; nothing is written. */
  async function buildOnly({ found, resolved, library }) {
    if ((await started) !== (await codeDigest())) {
      throw new GlbError(503, 'the code that builds objects (object-designs/lib, the vendored jscad or src/blueprints/load.js and build.js) changed since the server started: restart Plantern');
    }
    try { return buildModel(found.model, resolved, { ...library, ...found.extraMaterials }, { textures: await loadTextures(library) }); }
    catch (e) { throw new GlbError(400, e.message); }
  }

  /**
   * Where a lit model’s light is, [x, y, z] in mm in the model’s own frame (AGENT_INSTRUCTIONS §3.3): its lightPoint() for the
   * resolved params. null for a model that has none, or when it fails (a light is an extra, the object is still built).
   */
  function lightOf(found, resolved) {
    if (typeof found.model?.lightPoint !== 'function') return null;
    try { const p = found.model.lightPoint(resolved); return Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) ? p.map(v => Math.round(v)) : null; }
    catch { return null; }
  }

  async function build(r, blueprint) {
    const { hash } = r;
    const built = await buildOnly(r);
    const bounds = meshBounds({ pos: built.parts.flatMap(p => p.mesh.pos), nrm: [], idx: [] });
    const size = bounds ? [0, 1, 2].map(k => round1(bounds.max[k] - bounds.min[k])) : [0, 0, 0];
    const light = lightOf(r.found, r.resolved);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `${hash}.glb.tmp-${process.pid}`);
    await fs.writeFile(tmp, built.glb);
    await renameRetry(tmp, path.join(dir, `${hash}.glb`));
    // the entry is complete once its note exists, so a half-written one is never answered
    const noteTmp = path.join(dir, `${hash}.json.tmp-${process.pid}`);
    await fs.writeFile(noteTmp, JSON.stringify({ blueprint, size, light, built: new Date().toISOString() }) + '\n');
    await renameRetry(noteTmp, path.join(dir, `${hash}.json`));
    await prune(hash).catch(() => { /* a failed clean-up must not fail the build that succeeded */ });
    return { hash, size, light };
  }

  /**
   * Keeps the cache under its limit: the oldest-built objects go first (reading one does not count as use), never the
   * one just built (`keep`). Does nothing without a limit.
   */
  async function prune(keep) {
    const limit = await limitBytes();
    if (!limit) return;
    const entries = [];
    for (const name of await fs.readdir(dir).catch(() => [])) {
      const m = /^([0-9a-f]{64})\.glb$/.exec(name);
      if (!m) continue;
      const glb = await fs.stat(path.join(dir, name)).catch(() => null);
      if (!glb) continue;
      const note = await fs.stat(path.join(dir, `${m[1]}.json`)).catch(() => null);
      entries.push({ hash: m[1], bytes: glb.size + (note?.size ?? 0), time: glb.mtimeMs });
    }
    let total = entries.reduce((sum, e) => sum + e.bytes, 0);
    for (const e of entries.sort((a, b) => a.time - b.time)) {
      if (total <= limit) break;
      if (e.hash === keep) continue;
      await fs.rm(path.join(dir, `${e.hash}.glb`), { force: true }).catch(() => {});
      await fs.rm(path.join(dir, `${e.hash}.json`), { force: true }).catch(() => {});
      total -= e.bytes;
    }
  }

  return {
    dir,

    /**
     * Every blueprint a house can use: the built-in models and the house's blueprints/*.json, as loadBlueprints() lists them
     * ({ blueprints: [{ id, source, meta, json? }], refused }). For the Objects page and the validator (decision 188).
     */
    async list(houseDir) {
      const library = await readLibrary();
      const files = await fs.readFile(path.join(designsDir, 'models/index.json'), 'utf8').then(t => JSON.parse(t).models, () => []);
      const builtIn = [];
      for (const f of files) {
        const file = path.join(designsDir, 'models', f);
        const text = await fs.readFile(file, 'utf8').catch(() => null);
        if (text === null) continue;
        try { builtIn.push(await import(`${pathToFileURL(file).href}?v=${sha(text).slice(0, 16)}`)); } catch { /* a model that cannot load is not offered */ }
      }
      const house = [];
      for (const name of houseDir ? await fs.readdir(path.join(houseDir, 'blueprints')).catch(() => []) : []) {
        if (!name.endsWith('.json')) continue;
        const text = await fs.readFile(path.join(houseDir, 'blueprints', name), 'utf8').catch(() => null);
        if (text !== null) house.push({ file: name, text });
      }
      const listed = loadBlueprints({ builtIn, house, libraryNames: new Set(Object.keys(library)) });
      // a model with a lightPoint() gives light: the Add menu marks it (openings-and-lit-objects LA5)
      const lit = new Set(builtIn.filter(m => typeof m.lightPoint === 'function').map(m => m.meta?.id));
      return { ...listed, blueprints: listed.blueprints.map(b => (b.source === 'built-in' && lit.has(b.id) ? { ...b, light: true } : b)) };
    },

    /** The hash a request would have, without building it. */
    async key(request) { return (await resolve(request)).hash; },

    /**
     * The files of an exported asset (decision 225): the GLB the placed object uses and its meta.json (assetMeta: the size,
     * the parameters and the parts). Built now, not cached, since it is written into the house's own assets/ folder.
     */
    async exportAsset(request) {
      const r = await resolve(request);
      const built = await buildOnly(r);
      const meta = assetMeta(r.found.model, built, { source: `${r.found.kind}: ${request.blueprint}` });
      return { glb: built.glb, meta, size: meta.size };
    },

    /** The hash and size of the request's GLB, built (and cached) when it is not there yet. */
    async ensure(request) {
      const r = await resolve(request);
      try {
        // both files: a pruned object has neither, and a half-removed one must not be answered
        const note = JSON.parse(await fs.readFile(path.join(dir, `${r.hash}.json`), 'utf8'));
        await fs.access(path.join(dir, `${r.hash}.glb`));
        // an entry from before the light point was kept has no `light` field: it is built again once, which writes it
        if (HASH.test(r.hash) && Array.isArray(note.size) && 'light' in note) return { hash: r.hash, size: note.size, light: note.light };
      } catch { /* not cached */ }
      if (!building.has(r.hash)) building.set(r.hash, build(r, request.blueprint).finally(() => building.delete(r.hash)));
      return building.get(r.hash);
    },

    /** The GLB bytes for a hash, or null. */
    async read(hash) {
      if (!HASH.test(hash)) return null;
      return fs.readFile(path.join(dir, `${hash}.glb`)).catch(() => null);
    },

    /**
     * Removes every cached object (the *Clear cache* button). Only the cache's own files are touched. Objects are built
     * again the next time they are asked for. Answers how many objects and bytes went.
     */
    async clear() {
      let objects = 0, bytes = 0;
      for (const name of await fs.readdir(dir).catch(() => [])) {
        if (!CACHE_FILE.test(name)) continue;
        const s = await fs.stat(path.join(dir, name)).catch(() => null);
        if (!s) continue;
        await fs.rm(path.join(dir, name), { force: true }).catch(() => {});
        bytes += s.size;
        if (name.endsWith('.glb')) objects++;
      }
      return { objects, bytes };
    },
  };
}
