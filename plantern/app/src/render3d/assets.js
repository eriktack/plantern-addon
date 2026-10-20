// The asset models of a page (decisions 145 and 146): each assets/<name>/model.glb is fetched once, parsed with
// three.js's GLTFLoader and kept. The 3D view and the plan read the status: 'loading', 'ok', 'missing' (no copy
// could be fetched) or 'broken' (fetched, but it cannot be read, or the loader is not there). A model that is missing or
// broken stays a marked box. The loader is imported only when a model is first needed, so a page without assets
// never loads it. Browser only; the pure rules are in src/model/assets.js.

import { assetSources, ASSET_NAME, assetKey, blueprintRequest, mainColourOf } from '../model/assets.js';
import { glbStore } from './glb-store.js';

// A store call that fails counts as no answer: the page then asks the server, as it did before the store existed.
const settle = p => Promise.resolve(p).then(v => v, () => null);

/**
 * houseBase: the URL of the house folder (with a trailing slash), or null; sharedBase: the URL of the folder with the
 * repo's assets/ ('' on the repo's own pages), or null. onChange(key, status) runs when a model has loaded or failed.
 * house and apiBase are for objects made from a blueprint: the server builds their model (POST api/glb, then GET api/glb/<hash>,
 * docs/archive/2026-10-14-object-templates.md T4); house is the house id (for its own blueprints), apiBase the path from the page to the app's root.
 * store: the browser's own copy of those GLBs (glb-store.js; null for none). fetchImpl and parseImpl stand in for fetch and the
 * GLB reader in tests.
 * sceneless (the Editor, PF14): a blueprint object is not loaded as a model at all. The server's answer (size, light, main colour) is all that is
 * kept, so the page fetches no model file and never loads three.js for them; mainColour() then gives the colour the server worked out. A plain
 * model file (assets/<name>/model.glb) is still loaded as before.
 * published (the Lovelace card, docs/archive/2026-10-20-card-blueprint-models.md): a URL ending in '/' where the add-on publishes the models of the
 * house's library objects (index.json, <hash>.glb). A cache with it never asks a server: a blueprint object is looked up in that index
 * by its assetKey() and its file is read from there (the card cannot reach the add-on's API); an object that is not in the index is 'missing'.
 */
export function createAssetCache({
  houseBase = null, sharedBase = null, house = null, apiBase = '', onChange = () => {},
  store = glbStore(), fetchImpl = null, parseImpl = null, sceneless = false, published = null,
} = {}) {
  const entries = new Map();   // name -> { status, scene, meta, ready: Promise }
  let loader = null;
  const doFetch = fetchImpl ?? ((...args) => fetch(...args));

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

  // Reading a GLB is work for the page's one thread. Models arrive all at once (a house with fifty objects asks for them together), so they are read one
  // at a time and the page is let breathe between them: it keeps drawing and answering while they load, instead of freezing until the last is read.
  const breathe = () => new Promise(resolve => (globalThis.scheduler?.yield ? globalThis.scheduler.yield().then(resolve, resolve) : setTimeout(resolve, 0)));
  let reading = Promise.resolve();
  function parseInTurn(buffer) {
    const mine = reading.then(() => parse(buffer));
    reading = mine.then(breathe, breathe);
    return mine;
  }
  const readGlb = parseImpl ?? parseInTurn;

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
          entry.scene = await readGlb(await res.arrayBuffer());
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

  /**
   * Starts loading the model of an object made from a blueprint (once per blueprint and values). Three steps (decision 185, T8):
   *  1. the copy this browser kept for these settings is shown at once, with no server needed;
   *  2. the server is asked for the current hash (it changes with the code and the blueprint file), and the GLB is fetched and
   *     kept when that hash is not the one shown;
   *  3. with no server, the kept copy stays as it is; with neither, the object is 'missing' (a marked box). A blueprint the
   *     server refuses (bad values, a failed build) is 'broken' whatever was kept, with the reason in error(key).
   */
  // The published index (a page with `published`): read once, shared by every object. null when it cannot be read (no network), {} when
  // there is none (nothing published yet).
  let publishedIndex = null;
  const readPublishedIndex = () => (publishedIndex ??= doFetch(`${published}index.json`, { cache: 'no-store' })
    .then(r => (r.ok ? r.json().then(j => (j && typeof j === 'object' && !Array.isArray(j) ? j : {}), () => ({})) : r.status === 404 ? {} : null), () => null));

  /**
   * A blueprint object on a page with `published`: the kept copy first (so a phone shows it offline), then the index: an object that is
   * in it has its file read from `published` when that is not the copy shown; one that is not is 'missing' ("not published yet") unless a
   * kept copy is on screen. Nothing here ever requests api/glb.
   */
  function loadPublished(o) {
    const key = assetKey(o);
    const entry = { status: 'loading', scene: null, meta: null, error: null, hash: null, ready: null };
    entries.set(key, entry);
    entry.ready = (async () => {
      const kept = await settle(store?.getLink(key));
      const keptBytes = kept ? await settle(store.getFile(kept.hash)) : null;
      if (keptBytes) {
        try {
          entry.scene = await readGlb(keptBytes);
          Object.assign(entry, { status: 'ok', hash: kept.hash, meta: { size: kept.size }, light: kept.light ?? null });
          onChange(key, 'ok');
        } catch { /* a kept copy that cannot be read is not used */ }
      }
      const index = await readPublishedIndex();
      const item = index?.[key];
      if (!item) {
        if (!entry.scene) {
          entry.status = 'missing';
          entry.error = index === null ? 'the published models cannot be reached' : 'not published yet: the add-on publishes it after the next change';
        }
      } else if (entry.scene && entry.hash === item.hash) {
        Object.assign(entry, { meta: { size: item.size }, light: item.light ?? null, colour: item.colour ?? null, error: null });
      } else {
        let bytes = null;
        try {
          const file = await doFetch(`${published}${item.hash}.glb`);
          if (!file.ok) throw new Error(`the published model answered ${file.status}`);
          bytes = await file.arrayBuffer();
        } catch (e) {                                     // not reachable: what was kept stays on screen, else a marked box
          entry.error = e.message;
          if (!entry.scene) entry.status = 'missing';
        }
        if (bytes) {
          try {
            entry.scene = await readGlb(bytes);
            Object.assign(entry, { status: 'ok', hash: item.hash, meta: { size: item.size }, light: item.light ?? null, colour: item.colour ?? null, error: null });
            await settle(store?.putFile(item.hash, bytes));
            await settle(store?.putLink(key, item.hash, item.size, item.light ?? null));
          } catch (e) {                                   // a file that cannot be read
            entry.error = e.message;
            if (!entry.scene) entry.status = 'broken';
          }
        }
      }
      onChange(key, entry.status);
      return entry;
    })();
    return entry;
  }

  function loadObject(o) {
    const key = assetKey(o);
    if (entries.has(key)) return entries.get(key);
    if (published !== null) return loadPublished(o);
    const entry = { status: 'loading', scene: null, meta: null, error: null, hash: null, ready: null };
    entries.set(key, entry);
    entry.ready = (async () => {
      // 1. the kept copy (a sceneless cache has no models to keep)
      const kept = sceneless ? null : await settle(store?.getLink(key));
      const keptBytes = kept ? await settle(store.getFile(kept.hash)) : null;
      if (keptBytes) {
        try {
          entry.scene = await readGlb(keptBytes);
          Object.assign(entry, { status: 'ok', hash: kept.hash, meta: { size: kept.size }, light: kept.light ?? null });
          onChange(key, 'ok');
        } catch { /* a kept copy that cannot be read is not used: the server decides */ }
      }
      // 2. the server
      try {
        const res = await doFetch(`${apiBase}api/glb`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(house ? { house } : {}), ...blueprintRequest(o) }) });
        const answer = await res.json().catch(() => ({}));
        if (!res.ok) {
          entry.error = answer.error || `the server answered ${res.status}`;
          if (res.status === 400) { entry.status = 'broken'; entry.scene = null; }
          else if (!entry.scene) entry.status = 'missing';
        } else if (sceneless) {
          Object.assign(entry, { status: 'ok', hash: answer.hash, meta: { size: answer.size }, light: answer.light ?? null, colour: answer.colour ?? null, error: null });
        } else if (entry.scene && entry.hash === answer.hash) {
          entry.meta = { size: answer.size };          // the copy shown is the current one
          entry.light = answer.light ?? null;
          entry.error = null;
        } else {
          const file = await doFetch(`${apiBase}api/glb/${answer.hash}`);
          if (!file.ok) {
            entry.error = `the server answered ${file.status}`;
            if (!entry.scene) entry.status = 'missing';
          } else {
            const bytes = await file.arrayBuffer();
            try {
              entry.scene = await readGlb(bytes);
              Object.assign(entry, { status: 'ok', hash: answer.hash, meta: { size: answer.size }, light: answer.light ?? null, error: null });
              await settle(store?.putFile(answer.hash, bytes));
              await settle(store?.putLink(key, answer.hash, answer.size, answer.light ?? null));
            } catch (e) {
              entry.error = e.message;
              entry.status = 'broken';
              console.warn(`blueprint ${o.blueprint} could not be shown:`, e);
            }
          }
        }
      } catch (e) {
        // no server: what was kept stays on screen; with nothing kept the object is a marked box
        entry.error = entry.scene ? null : e.message;
        if (!entry.scene) entry.status = 'missing';
      }
      onChange(key, entry.status);
      return entry;
    })();
    return entry;
  }

  /**
   * The server's build of an object with its stored options now: { hash, size }. Unlike meta(), it is asked for again each time,
   * so a changed blueprint or library gives the size of the new build. Throws with the server's reason, or the network error.
   */
  async function rebuild(o) {
    const res = await doFetch(`${apiBase}api/glb`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(house ? { house } : {}), ...blueprintRequest(o) }) });
    const answer = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(answer.error || `the server answered ${res.status}`);
    return answer;
  }

  // The area of a mesh seen from above (y is up in a glTF): its triangles that face up, projected on the ground.
  function areaFromAbove(geometry) {
    const pos = geometry.attributes.position, index = geometry.index;
    const n = index ? index.count : pos.count;
    let area = 0;
    for (let t = 0; t < n; t += 3) {
      const [a, b, c] = [0, 1, 2].map(k => (index ? index.getX(t + k) : t + k));
      const ux = pos.getX(b) - pos.getX(a), uz = pos.getZ(b) - pos.getZ(a), vx = pos.getX(c) - pos.getX(a), vz = pos.getZ(c) - pos.getZ(a);
      const up = uz * vx - ux * vz;                       // the y of the triangle's normal, twice its projected area
      if (up > 0) area += up / 2;
    }
    return area;
  }

  /**
   * The main colour ('#rrggbb') of a loaded model: the colour of the part that shows most from above (mainColourOf), for the footprint in the plan.
   * Null until the model has loaded, and for a model with no colours. `key` is a model name or assetKey(object).
   */
  function mainColour(key) {
    const scene = entries.get(key)?.scene;
    if (!scene) return entries.get(key)?.colour ?? null;     // a sceneless cache: the one the server worked out
    const parts = [];
    scene.traverse(m => {
      if (!m.isMesh) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      parts.push({ weight: areaFromAbove(m.geometry), colour: mat?.color ? `#${mat.color.getHexString()}` : null });
    });
    return mainColourOf(parts);
  }

  /**
   * Asks for many blueprint objects at once (sceneless caches only: PF15): one request with a list instead of one each, then every object has its
   * size, light and colour. Objects already asked for are left out. A batch the server cannot answer (an older server, no network) leaves the
   * objects to be asked for one by one, as loadFor() does. onChange runs once when the batch is in.
   */
  async function prefetch(objects) {
    if (!sceneless) return;
    const todo = [], seen = new Set();
    for (const o of objects) { if (!o?.blueprint) continue; const key = assetKey(o); if (!entries.has(key) && !seen.has(key)) { seen.add(key); todo.push([key, o]); } }
    if (!todo.length) return;
    const mine = todo.map(([key]) => { const entry = { status: 'loading', scene: null, meta: null, error: null, hash: null, ready: null }; entries.set(key, entry); return entry; });
    const batch = (async () => {
      try {
        const res = await doFetch(`${apiBase}api/glb`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(house ? { house } : {}), batch: todo.map(([, o]) => blueprintRequest(o)) }) });
        const answer = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(answer.results) || answer.results.length !== todo.length) throw new Error('no batch answer');
        answer.results.forEach((r, i) => {
          const entry = mine[i];
          if (r.error) { entry.error = r.error; entry.status = r.status === 400 ? 'broken' : 'missing'; }
          else Object.assign(entry, { status: 'ok', hash: r.hash, meta: { size: r.size }, light: r.light ?? null, colour: r.colour ?? null, error: null });
        });
        onChange(todo[0][0], 'ok');
      } catch {
        todo.forEach(([key], i) => { if (entries.get(key) === mine[i]) entries.delete(key); });   // asked for one by one when drawn
      }
    })();
    mine.forEach(e => { e.ready = batch.then(() => e); });
    await batch;
  }

  /** Starts the model of an asset object, whichever way it is made. */
  const loadFor = o => (o.blueprint ? loadObject(o) : load(o.asset));
  /** The light point of a blueprint object as the server built it, [x, y, z] in its own axes; null for a model without one or not yet loaded. */
  const light = o => (o.blueprint ? entries.get(assetKey(o))?.light ?? null : null);

  /** 'loading' | 'ok' | 'missing' | 'broken', or 'unknown' when the model has not been asked for yet. `key` is a model name or assetKey(object). */
  const status = key => entries.get(key)?.status ?? 'unknown';
  /** The model's meta.json (its size in mm, its parts), once loaded; for a blueprint object { size } as built. Null when there is none. */
  const meta = key => entries.get(key)?.meta ?? null;
  /** Why a blueprint object's model is missing or broken (the server's reason), or null. */
  const error = key => entries.get(key)?.error ?? null;

  return { load, loadObject, loadFor, status, meta, error, rebuild, mainColour, light, prefetch };
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
