// Saving location files (PLANTERN.md §11). Uses the File System Access API (Chrome/Edge): the user
// picks the repo root once, the directory handle is kept in IndexedDB, paths inside are relative.
// Everything that takes a handle works on the minimal FileSystemDirectoryHandle interface, so it is
// testable in Node with a fake. Browser-only parts (picker, IndexedDB) are at the bottom.

import { formatJson } from './format.js';

/** Paths we may write: inside locations/, JSON only, never config.local.json. */
export function checkWritablePath(rel) {
  if (typeof rel !== 'string' || !rel) return 'empty path';
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel) || rel.split('/').some(p => p === '..' || p === '' || p === '.')) return `unsafe path "${rel}"`;
  if (!rel.startsWith('locations/')) return `refusing to write outside locations/: "${rel}"`;
  if (!rel.endsWith('.json')) return `refusing to write non-JSON file "${rel}"`;
  return null;
}

/** The chosen folder must be the repo root: it contains locations/index.json. */
export async function verifyRepoRoot(root) {
  try {
    const dir = await root.getDirectoryHandle('locations');
    await dir.getFileHandle('index.json');
    return true;
  } catch { return false; }
}

/** Write `text` to a relative path below `root`, creating folders as needed. */
export async function writeText(root, rel, text) {
  const bad = checkWritablePath(rel);
  if (bad) throw new Error(bad);
  const parts = rel.split('/'), file = parts.pop();
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const fh = await dir.getFileHandle(file, { create: true });
  const w = await fh.createWritable();
  try { await w.write(text); } finally { await w.close(); }
}

/** Read a relative file as text, or null if it does not exist. */
export async function readText(root, rel) {
  try {
    let dir = root;
    const parts = rel.split('/'), file = parts.pop();
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    return await (await (await dir.getFileHandle(file)).getFile()).text();
  } catch (e) {
    if (e?.name === 'NotFoundError') return null;
    throw e;
  }
}

/**
 * Save a JSON value in canonical format. Refuses to overwrite a file that changed on disk since it
 * was loaded (Syncthing, a second editor): pass the text you loaded as `expectedBefore`.
 */
export async function saveJson(root, rel, value, { expectedBefore } = {}) {
  if (expectedBefore !== undefined) {
    const now = await readText(root, rel);
    if (now !== null && now.replace(/\r\n/g, '\n') !== expectedBefore.replace(/\r\n/g, '\n')) {
      throw Object.assign(new Error(`${rel} changed on disk since it was loaded; reload the page before saving (Syncthing or another editor?)`), { conflict: true });
    }
  }
  await writeText(root, rel, formatJson(value));
}

// ---- browser only ----

/**
 * How can this page save? 'server' = served by tools/serve.js (works on phones too),
 * 'folder' = File System Access API (Chrome/Edge on a PC), null = download only.
 */
export async function detectSaveMode() {
  try {
    const r = await fetch('api/info', { cache: 'no-store' });
    if (r.ok && (await r.json()).plantern) return 'server';
  } catch { /* plain static server or offline */ }
  return canSaveToFolder() ? 'folder' : null;
}

/**
 * Save one JSON file by the best available route. `expectedBefore` = the text loaded from disk.
 * A file that changed on disk since then is refused with an error whose `conflict` is true.
 */
export async function saveModelFile(mode, rel, value, expectedBefore) {
  if (mode === 'server') {
    const bad = checkWritablePath(rel);
    if (bad) throw new Error(bad);
    const res = await fetch('api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: rel, value, expectedBefore }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.error || `save failed (HTTP ${res.status})`), { conflict: res.status === 409 });
    return;
  }
  if (mode === 'folder') return saveJson(await getRepoRoot(), rel, value, { expectedBefore });
  throw new Error('this browser cannot save to the repo; use Download');
}

export const canSaveToFolder = () => typeof globalThis.showDirectoryPicker === 'function';

const DB = 'plantern', STORE = 'handles', KEY = 'repoRoot';
const idb = () => new Promise((res, rej) => {
  const rq = indexedDB.open(DB, 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => rej(rq.error);
});
const tx = async (mode, fn) => {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), rq = fn(t.objectStore(STORE));
    t.oncomplete = () => res(rq?.result);
    t.onerror = () => rej(t.error);
  });
};

/**
 * The repo root handle: remembered one if permission is (or can be) granted, else a new pick.
 * Must be called from a click handler (permission and picker need a user gesture).
 */
export async function getRepoRoot() {
  if (!canSaveToFolder()) throw new Error('this browser cannot write to folders (use Chrome or Edge); download the file instead');
  let handle = null;
  try { handle = await tx('readonly', s => s.get(KEY)); } catch { /* private mode etc.: just ask */ }
  if (handle) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted' || (await handle.requestPermission(opts)) === 'granted') {
      if (await verifyRepoRoot(handle)) return handle;
    }
  }
  handle = await globalThis.showDirectoryPicker({ id: 'plantern-repo', mode: 'readwrite' });
  if (!(await verifyRepoRoot(handle))) throw new Error('that folder does not contain locations/index.json; pick the Plantern repo root');
  try { await tx('readwrite', s => s.put(handle, KEY)); } catch { /* not remembering is fine */ }
  return handle;
}
