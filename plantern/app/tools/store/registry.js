// The storages Plantern knows (stores.json) plus the built-in one (the app's own locations/ folder, which
// holds the demo), and the houses in them. Keeps the last known version of every house file, so a
// change made elsewhere (another editor, Syncthing, a text editor, a git pull) is noticed and announced
// to the pages, while its own writes are not. Saves merge with what changed meanwhile (decision 105).

import path from 'node:path';
import { EventEmitter } from 'node:events';
import { FolderStore, versionOf } from './folder.js';
import { loadSettings, saveSettings, loadSecrets, saveSecrets } from './settings.js';
import { merge3 } from '../../src/model/merge.js';
import { formatJson } from '../../src/model/format.js';

export const BUILTIN = 'builtin';
const DEMO = 'demo';                                // the example house in the app folder, which the Storage page can hide
const HOUSE_ID = /^[A-Za-z0-9_.-]+$/;

/** Make a store object from its settings (git comes with phase 6). */
export async function makeStore(cfg, ctx) {
  if (cfg.type === 'folder') return new FolderStore(cfg, ctx);
  if (cfg.type === 'git') { const { GitStore } = await import('./git.js'); return new GitStore(cfg, ctx); }
  throw new Error(`unknown storage type "${cfg.type}"`);
}

export class Registry extends EventEmitter {
  /** appRoot: the app folder (its locations/ is the built-in storage); dataDir: Plantern's settings folder. */
  constructor({ appRoot, dataDir, watch = true }) {
    super();
    this.setMaxListeners(200);                       // one per open page (server-sent events)
    this.appRoot = appRoot;
    this.dataDir = dataDir;
    this.watching = watch;                           // false: no file watching, polling or fetch timers (tests, which refresh by hand)
    this.stores = [];
    this.known = new Map();                          // `${houseId}/${file}` → version last seen or written
    this.stamps = new Map();                         // houseId → cheap stat stamp, to read files only when they change
    this.ready = this.init();
  }

  async init() {
    this.settings = await loadSettings(this.dataDir);
    this.secrets = await loadSecrets(this.dataDir);
    const builtin = new FolderStore({ id: BUILTIN, name: 'Built-in (app folder)', path: path.join(this.appRoot, 'locations'), pollSeconds: 3 });
    builtin.builtin = true;
    const stores = [builtin];
    for (const cfg of this.settings.stores) {
      try { stores.push(await makeStore(cfg, this.ctx())); }
      catch (e) { stores.push({ id: cfg.id, cfg, type: cfg.type, houses: [], status: { state: 'error', error: e.message }, open() {}, refresh() { return []; }, watch() {}, close() {} }); }
    }
    this.stores = stores;
    for (const s of stores) {
      try { await s.open(); } catch (e) { s.status = { state: 'error', error: e.message }; }
      if (this.watching) s.watch?.(() => this.poke(s));
    }
    await this.rememberAll();
  }

  /** What a store needs from Plantern: its secrets and the settings folder. */
  ctx() { return { dataDir: this.dataDir, secret: id => this.secrets[id] || {}, secrets: () => this.secrets, emit: (ev, data) => this.emit(ev, data), patch: (id, patch) => this.patchStore(id, patch) }; }

  /** Change settings of a storage that is open (a git storage's branch): stored, the storage object stays. */
  async patchStore(id, patch) {
    const i = this.settings.stores.findIndex(s => s.id === id);
    if (i < 0) return;
    this.settings.stores[i] = { ...this.settings.stores[i], ...patch };
    await saveSettings(this.dataDir, this.settings);
  }

  close() { for (const s of this.stores) s.close?.(); }

  /** Is git installed (for the wizard)? Its version text, or null. */
  async gitAvailable() { const { gitVersion } = await import('./git.js'); return gitVersion(); }

  /** Every house: { id, name, store, storeName, type, readOnly, hidden }; an id in two storages: the first wins. */
  houses({ all = false } = {}) {
    const seen = new Map(), out = [];
    // the person's own storages first, the built-in one last
    for (const s of [...this.stores.filter(x => !x.builtin), ...this.stores.filter(x => x.builtin)]) {
      for (const h of s.houses || []) {
        if (seen.has(h.id)) { seen.get(h.id).duplicates.push(s.id); continue; }
        const e = { id: h.id, name: h.name, store: s.id, storeName: s.cfg?.name || s.id, type: s.type, readOnly: !!s.readOnly, hidden: !!s.builtin && h.id === DEMO && this.settings.showDemo === false, duplicates: [] };
        seen.set(h.id, e); out.push(e);
      }
    }
    return all ? out : out.filter(h => !h.hidden);
  }

  /** { store, house } for a house id, or null. */
  find(id) {
    if (!HOUSE_ID.test(String(id))) return null;
    const e = this.houses({ all: true }).find(h => h.id === id);
    if (!e) return null;
    const store = this.stores.find(s => s.id === e.store);
    return { store, house: store.house(id) };
  }

  /** Write an exported object's files into a house's assets/<name>/ (see the storage's writeAsset). */
  async writeAsset(id, name, files) {
    const f = this.find(id);
    if (!f) throw Object.assign(new Error(`no house "${id}"`), { status: 404 });
    return f.store.writeAsset(f.house, name, files);
  }

  /** Both files of a house: { id, name, store, readOnly, location: { text, version }, model: { text, version } }. */
  async load(id) {
    const f = this.find(id);
    if (!f) throw Object.assign(new Error(`no house "${id}"`), { status: 404 });
    const location = await f.store.read(f.house, 'location'), model = await f.store.read(f.house, 'model');
    this.known.set(`${id}/location`, location.version); this.known.set(`${id}/model`, model.version);
    return { id, name: f.house.name, store: f.store.id, storeType: f.store.type, readOnly: !!f.store.readOnly, sync: f.store.status, location, model };
  }

  /**
   * Save `value` as file ('location' | 'model') of a house. `base` = the text the page loaded. When the
   * file changed since then, the change is merged by entity id: { version, merged: value } when that
   * worked, { conflict: { theirs, theirsVersion, merged, conflicts } } when the person has to choose.
   */
  async save(id, file, value, base, client) {
    const f = this.find(id);
    if (!f) throw Object.assign(new Error(`no house "${id}"`), { status: 404 });
    if (file !== 'location' && file !== 'model') throw Object.assign(new Error('file must be location or model'), { status: 400 });
    if (f.store.readOnly) throw Object.assign(new Error(`${f.store.cfg?.name || f.store.id} is read-only`), { status: 403 });
    const now = await f.store.read(f.house, file);
    let out = value, merged = false;
    if (base !== undefined && now.text !== null && versionOf(base) !== now.version) {
      let r;
      try { r = merge3(JSON.parse(base), value, JSON.parse(now.text)); }
      catch { return { conflict: { theirs: now.text, theirsVersion: now.version, merged: value, conflicts: [{ path: [], base: null, mine: value, theirs: null }] } }; }
      if (r.conflicts.length) return { conflict: { theirs: now.text, theirsVersion: now.version, merged: r.merged, conflicts: r.conflicts } };
      out = r.merged; merged = true;
    }
    const text = formatJson(out), version = versionOf(text);
    this.known.set(`${id}/${file}`, version);                     // before writing: our own write is not "a change elsewhere"
    const w = await f.store.write(f.house, file, text, { message: `${f.house.name}: ${file}.json` });
    this.stamps.delete(id);
    if (file === 'location') await f.store.refresh();
    this.emit('changed', { house: id, file, version, source: 'here', client });
    return { version, text, ...(merged ? { merged: out } : {}), sync: w?.sync };
  }

  /** Remember what every house file is now (at start, after a storage was added). */
  async rememberAll() {
    for (const s of this.stores) for (const h of s.houses || []) {
      for (const file of ['location', 'model']) { try { this.known.set(`${h.id}/${file}`, (await s.read(h, file)).version); } catch { /* reported when opened */ } }
      try { this.stamps.set(h.id, JSON.stringify(await s.stamp(h))); } catch { /* polling will retry */ }
    }
  }

  /** Something in storage s may have changed: compare, and announce what really did. */
  async poke(s) {
    if (this.poking?.has(s.id)) return;
    (this.poking ??= new Set()).add(s.id);
    try {
      const before = new Set((s.houses || []).map(h => h.id));
      await s.refresh?.();
      const after = new Set((s.houses || []).map(h => h.id));
      if (before.size !== after.size || [...after].some(id => !before.has(id))) this.emit('houses', {});
      for (const h of s.houses || []) {
        const stamp = JSON.stringify(await s.stamp(h));
        if (this.stamps.get(h.id) === stamp) continue;
        this.stamps.set(h.id, stamp);
        for (const file of ['location', 'model']) {
          const { version } = await s.read(h, file), key = `${h.id}/${file}`;
          if (this.known.has(key) && this.known.get(key) !== version) this.emit('changed', { house: h.id, file, version, source: s.type === 'git' ? 'remote' : 'elsewhere' });
          this.known.set(key, version);
        }
      }
    } catch { /* an unreachable share: its status says so */ }
    finally { this.poking.delete(s.id); }
  }

  // ---- storages (the Storage page) ----

  /** What the Storage page shows: no secrets, only whether one is saved. */
  storeList() {
    return this.stores.map(s => ({
      id: s.id, name: s.cfg?.name || s.id, type: s.type, builtin: !!s.builtin, readOnly: !!s.readOnly,
      path: s.cfg?.path, dir: s.cfg?.dir, url: s.cfg?.url, branch: s.cfg?.branch, status: s.status,
      houses: (s.houses || []).map(h => ({ id: h.id, name: h.name })),
      saved: Object.fromEntries(Object.entries(this.secrets[s.id] || {}).map(([k, v]) => [k, !!v])),
    }));
  }

  /** Add a storage (cfg without id gets one) and its secrets; it is opened and watched at once. */
  async addStore(cfg, secrets = {}) {
    const id = cfg.id || this.newStoreId(cfg.name || cfg.type);
    const clean = { ...cfg, id };
    const store = await makeStore(clean, this.ctx());
    if (Object.keys(secrets).length) { this.secrets[id] = { ...(this.secrets[id] || {}), ...secrets }; await saveSecrets(this.dataDir, this.secrets); }
    await store.open();
    if (this.watching) store.watch?.(() => this.poke(store));
    this.stores.push(store);
    this.settings.stores.push(clean);
    await saveSettings(this.dataDir, this.settings);
    await this.rememberAll();
    this.emit('houses', {});
    return store;
  }

  async updateStore(id, cfg, secrets) {
    const i = this.settings.stores.findIndex(s => s.id === id);
    if (i < 0) throw Object.assign(new Error(`no storage "${id}"`), { status: 404 });
    const old = this.stores.find(s => s.id === id);
    old?.close?.();
    this.settings.stores[i] = { ...this.settings.stores[i], ...cfg, id };
    if (secrets && Object.keys(secrets).length) { this.secrets[id] = { ...(this.secrets[id] || {}), ...secrets }; await saveSecrets(this.dataDir, this.secrets); }
    const store = await makeStore(this.settings.stores[i], this.ctx());
    await store.open();
    if (this.watching) store.watch?.(() => this.poke(store));
    this.stores = this.stores.map(s => (s.id === id ? store : s));
    await saveSettings(this.dataDir, this.settings);
    await this.rememberAll();
    this.emit('houses', {});
    return store;
  }

  /** Forget a storage (nothing on disk is deleted). */
  async removeStore(id) {
    if (!this.settings.stores.some(s => s.id === id)) throw Object.assign(new Error(`no storage "${id}"`), { status: 404 });
    this.stores.find(s => s.id === id)?.close?.();
    this.stores = this.stores.filter(s => s.id !== id);
    this.settings.stores = this.settings.stores.filter(s => s.id !== id);
    delete this.secrets[id];
    await saveSettings(this.dataDir, this.settings);
    await saveSecrets(this.dataDir, this.secrets);
    this.emit('houses', {});
  }

  async setShowDemo(on) {
    this.settings.showDemo = !!on;
    await saveSettings(this.dataDir, this.settings);
    this.emit('houses', {});
  }

  newStoreId(name) {
    const base = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'storage';
    let id = base, n = 2;
    while (id === BUILTIN || this.stores.some(s => s.id === id)) id = `${base}_${n++}`;
    return id;
  }
}
