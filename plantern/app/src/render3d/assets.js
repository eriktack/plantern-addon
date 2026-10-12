// The asset models of a page (decisions 145 and 146): each assets/<name>/model.glb is fetched once, parsed with
// three.js's GLTFLoader and kept. The 3D view and the plan read the status: 'loading', 'ok', 'missing' (no copy
// could be fetched) or 'broken' (fetched, but it cannot be read, or the loader is not there). A model that is missing or
// broken stays a marked box. The loader is imported only when a model is first needed, so a page without assets
// never loads it. Browser only; the pure rules are in src/model/assets.js.

import { assetSources, ASSET_NAME } from '../model/assets.js';

/**
 * houseBase: the URL of the house folder (with a trailing slash), or null; sharedBase: the URL of the folder with the
 * repo's assets/ ('' on the repo's own pages), or null. onChange(name, status) runs when a model has loaded or failed.
 */
export function createAssetCache({ houseBase = null, sharedBase = null, onChange = () => {} } = {}) {
  const entries = new Map();   // name -> { status, scene, meta, ready: Promise }
  let loader = null;

  // meta.json beside the model: optional, and a file that is not JSON counts as none
  async function readMeta(modelUrl) {
    try {
      const r = await fetch(modelUrl.replace(/model\.glb$/, 'meta.json'), { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  }

  async function parse(buffer) {
    if (!loader) {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      loader = new GLTFLoader();
    }
    return new Promise((resolve, reject) => loader.parse(buffer, '', gltf => resolve(gltf.scene), reject));
  }

  /** Starts loading the model of `name` (once). The entry's `ready` resolves when its status is known. */
  function load(name) {
    if (entries.has(name)) return entries.get(name);
    const entry = { status: 'loading', scene: null, meta: null, ready: null };
    entries.set(name, entry);
    if (!ASSET_NAME.test(name ?? '')) {
      entry.status = 'missing';
      entry.ready = Promise.resolve(entry);
      return entry;
    }
    entry.ready = (async () => {
      for (const url of assetSources(name, { houseBase, sharedBase })) {
        let res = null;
        try { res = await fetch(url, { cache: 'no-store' }); } catch { continue; }
        if (!res.ok) continue;
        entry.meta = await readMeta(url);
        try {
          entry.scene = await parse(await res.arrayBuffer());
          entry.status = 'ok';
        } catch (e) {
          entry.status = 'broken';
          console.warn(`asset ${name} at ${url} could not be shown:`, e);
        }
        break;
      }
      if (entry.status === 'loading') entry.status = 'missing';
      onChange(name, entry.status);
      return entry;
    })();
    return entry;
  }

  /** 'loading' | 'ok' | 'missing' | 'broken', or 'unknown' when the model has not been asked for yet. */
  const status = name => entries.get(name)?.status ?? 'unknown';
  /** The model's meta.json (its size in mm, its parts), once loaded; null when there is none. */
  const meta = name => entries.get(name)?.meta ?? null;

  return { load, status, meta };
}

/**
 * The names of the models a page can use: the house's own (houseBase: a server house lists them; a static one
 * may have an assets/index.json) and the shared ones (sharedBase + assets/index.json, written by the export).
 * A list that cannot be read is simply empty.
 */
export async function listAssetNames({ houseBase = null, sharedBase = null } = {}) {
  const names = new Set();
  const read = async (url, pick) => {
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) for (const n of pick(await r.json())) if (ASSET_NAME.test(n)) names.add(n); } catch { /* not there */ }
  };
  const list = j => j.assets || [];
  if (houseBase?.startsWith('api/')) await read(`${houseBase}asset-list`, list);
  else if (houseBase != null) await read(`${houseBase}assets/index.json`, list);
  if (sharedBase != null) await read(`${sharedBase}assets/index.json`, list);
  return [...names].sort();
}
