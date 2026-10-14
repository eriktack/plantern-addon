// The browser's own copy of the GLBs of placed objects (object-templates T8, decision 21): a file is kept under its hash, and
// a link from an object's settings (the same key the asset cache uses) to that hash, so an object can be shown without the
// server. IndexedDB. Where the browser has none (a private window, an old browser) every call answers null and the page
// asks the server as before. Browser only; nothing here runs at import time.

const NAME = 'plantern-glb';
const VERSION = 1;
let opened = null;

function open() {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      const rq = indexedDB.open(NAME, VERSION);
      rq.onupgradeneeded = () => {
        rq.result.createObjectStore('links', { keyPath: 'key' });   // settings → { key, hash, size }
        rq.result.createObjectStore('files', { keyPath: 'hash' });  // hash → { hash, bytes }
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    opened.catch(() => { opened = null; });   // try again next time
  }
  return opened;
}

/** One request in one transaction; resolves with its result. */
async function run(store, mode, make) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const rq = make(tx.objectStore(store));
    tx.oncomplete = () => resolve(rq.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** The store the asset cache uses in a browser, or null when the browser has no IndexedDB. */
export function glbStore() {
  if (typeof indexedDB === 'undefined') return null;
  const quiet = p => p.catch(() => null);
  return {
    getLink: key => quiet(run('links', 'readonly', s => s.get(key))).then(v => v ?? null),
    putLink: (key, hash, size) => quiet(run('links', 'readwrite', s => s.put({ key, hash, size }))),
    getFile: hash => quiet(run('files', 'readonly', s => s.get(hash))).then(v => v?.bytes ?? null),
    putFile: (hash, bytes) => quiet(run('files', 'readwrite', s => s.put({ hash, bytes }))),
  };
}
