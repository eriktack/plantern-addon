// One way for the pages to list, open and save houses, wherever they are kept (decision 103). With
// Plantern's server and its storages, everything goes through its API: the house list, both files,
// saves that merge what changed meanwhile (decision 105) and a stream of changes made elsewhere. On a
// plain static server (viewing only) the old locations/index.json and the save fallbacks still work.
// Browser only.

import { loadLocationIndex, loadLocation } from './load.js';
import { detectSaveMode, saveModelFile } from './save.js';
import { formatJson } from './format.js';
import { merge3 } from './merge.js';

/** This page's own id: its saves come back as events, which are not "changes made elsewhere". */
export const CLIENT = (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2));

// A page in a subfolder (the Objects page) reaches the server's API with a base like '../'; the API paths below are
// relative to the app's root.
let apiBase = '';
export const setApiBase = base => { apiBase = base; };

const getJson = async (url, init) => {
  const r = await fetch(apiBase + url, { cache: 'no-store', ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw Object.assign(new Error(j.error || `${url}: HTTP ${r.status}`), { status: r.status });
  return { status: r.status, body: j };
};

/**
 * The houses this page can open: { server, locations: [{ id, name, store, storeName, readOnly }], default }.
 * server = they come from Plantern's storages (else from locations/index.json).
 */
export async function listHouses() {
  let info = null;
  try { const r = await fetch(`${apiBase}api/info`, { cache: 'no-store' }); if (r.ok) info = await r.json(); } catch { /* static hosting */ }
  if (info?.stores) {
    const { body } = await getJson('api/houses');
    return { server: true, locations: body.houses, default: undefined, showDemo: body.showDemo };
  }
  const index = await loadLocationIndex();
  return { server: false, ...index };
}

/** The house picker's options: grouped by storage when there are several. */
export function houseOptions(index, current) {
  const opt = l => `<option value="${esc(l.id)}"${l.id === current ? ' selected' : ''}>${esc(l.name)}</option>`;
  const groups = [...new Set(index.locations.map(l => l.storeName).filter(Boolean))];
  if (groups.length < 2) return index.locations.map(opt).join('');
  return groups.map(g => `<optgroup label="${esc(g)}">${index.locations.filter(l => l.storeName === g).map(opt).join('')}</optgroup>`).join('');
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** What every page says when there is no house to open: connect a storage first. */
export const NO_HOUSES = 'No houses yet. Connect the folder or git repository where your houses are kept on the <a href="storage.html">Storage</a> page, or start a new house there.';

/**
 * Open house `id` from the list: a House (below). No id (nothing to open): an error with noHouses
 * and html NO_HOUSES. An id not in the list is still tried with the server (the hidden demo, typed by hand).
 */
export async function openHouse(index, id) {
  if (!id) throw Object.assign(new Error('No houses yet: connect a storage on the Storage page.'), { noHouses: true, html: NO_HOUSES });
  const entry = index.locations.find(l => l.id === id) || (index.server ? { id, name: id } : null);
  if (!entry) throw new Error(`unknown house "${id}"`);
  const h = new House(index.server, entry);
  await h.load();
  return h;
}

export class House {
  constructor(server, entry) { this.server = server; this.entry = entry; this.id = entry.id; this.base = {}; }

  /** Read both files (again). Sets location, model, the texts they came from (the merge base) and baseUrl. */
  async load() {
    if (this.server) {
      const { body } = await getJson(`api/houses/${encodeURIComponent(this.id)}`);
      this.location = JSON.parse(body.location.text);
      this.model = JSON.parse(body.model.text);
      this.base = { location: body.location.text, model: body.model.text };
      this.versions = { location: body.location.version, model: body.model.version };
      this.readOnly = body.readOnly; this.store = body.store; this.storeType = body.storeType; this.sync = body.sync;
      this.baseUrl = `api/houses/${encodeURIComponent(this.id)}/`;
      this.saveMode = 'server';
    } else {
      const loaded = await loadLocation(this.entry);
      this.location = loaded.location; this.model = loaded.model; this.baseUrl = loaded.baseUrl;
      this.base = { model: await (await fetch(loaded.baseUrl + (this.location.model || 'model.json'), { cache: 'no-store' })).text() };
      this.saveMode = await detectSaveMode();
      this.readOnly = false;
    }
    for (const k of ['levels', 'checks', 'anchors']) this.model[k] ??= [];
    this.name = this.location.name || this.id;
    return this;
  }

  get canSave() { return !!this.saveMode && !this.readOnly; }
  /** Where saves go, for a tooltip. */
  get where() { return this.server ? `${this.entry.storeName || this.store}` : `locations/${this.entry.path || this.id + '/'}`; }

  /**
   * Save the model (or file 'location'). Returns { value, merged }: the value as stored, which includes
   * what changed elsewhere meanwhile when it could be merged. A real conflict throws an error with
   * conflict: true and details { theirs, merged, conflicts } for askConflict() (src/capture/conflict-ui.js).
   */
  async save(value, file = 'model') {
    if (!this.server) {
      const rel = `locations/${this.entry.path || this.id + '/'}${file === 'location' ? 'location.json' : (this.location.model || 'model.json')}`;
      await saveModelFile(this.saveMode, rel, value, this.base[file]);
      this.base[file] = formatJson(value);
      return { value, merged: false };
    }
    const { status, body } = await getJson(`api/houses/${encodeURIComponent(this.id)}/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file, value, base: this.base[file], client: CLIENT }),
    });
    if (status === 409) throw Object.assign(new Error('this house was changed elsewhere, also where you changed it'), { conflict: true, details: body.conflict, file });
    this.base[file] = body.text;
    (this.versions ??= {})[file] = body.version;
    if (body.sync) this.sync = body.sync;
    const stored = body.merged ?? value;
    if (file === 'model') this.model = stored; else this.location = stored;
    return { value: stored, merged: !!body.merged };
  }

  /** After a conflict: save `value` over what is stored now (`theirsText`, from the conflict details). */
  async saveOver(value, theirsText, file = 'model') {
    this.base[file] = theirsText;
    return this.save(value, file);
  }

  /**
   * What is stored now, merged with `mine` (unsaved changes) from the base this page started from:
   * { merged, conflicts, theirs, theirsText }. Nothing is saved; the base moves to what is stored.
   */
  async mergeIncoming(mine, file = 'model') {
    const before = this.base[file];
    const fresh = await new House(this.server, this.entry).load();
    const theirsText = fresh.base[file], theirs = file === 'model' ? fresh.model : fresh.location;
    const r = merge3(JSON.parse(before), mine, JSON.parse(theirsText));
    this.base[file] = theirsText;                                 // what we now build on
    if (fresh.versions) (this.versions ??= {})[file] = fresh.versions[file];
    return { ...r, theirs, theirsText };
  }

  /**
   * Call cb({ file, version, source }) when this house is changed by someone else (another page,
   * another device, a text editor, a git pull). Returns a function that stops listening.
   */
  watch(cb) {
    if (!this.server) return () => {};
    let es = null, poll = 0, known = null, stopped = false;
    const versions = async () => (await getJson(`api/houses/${encodeURIComponent(this.id)}/versions`)).body;
    const startPolling = async () => {
      if (poll || stopped) return;
      known = await versions().catch(() => null);
      poll = setInterval(async () => {
        const v = await versions().catch(() => null);
        if (!v || !known) { known = v; return; }
        for (const file of ['location', 'model']) if (v[file] !== known[file] && v[file] !== this.versions?.[file]) cb({ file, version: v[file], source: 'elsewhere' });
        known = v;
      }, 15000);
    };
    try {
      es = new EventSource(`${apiBase}api/events`);
      es.addEventListener('changed', e => { const d = JSON.parse(e.data); if (d.house === this.id && d.client !== CLIENT) cb(d); });
      es.onerror = () => { if (es.readyState === EventSource.CLOSED) startPolling(); };
    } catch { startPolling(); }
    return () => { stopped = true; es?.close(); clearInterval(poll); };
  }
}
