// The Settings page's API (decision 106: setup is clicks only). Folder browser, the wizard's checks,
// adding / editing / removing storages, new houses, copying a house to another storage, and the
// *Show the demo house* switch. Secrets come in here and are never sent back.
//   GET    /api/stores                 → { stores, showDemo, platform, unc }
//   POST   /api/stores/check           { type: 'folder', path } → what is there (houses, a git repo, …)
//   POST   /api/stores                 { type, name?, path, … , secrets? } → { store }
//   PUT    /api/stores/:id             same body → { store }
//   DELETE /api/stores/:id             forget it (files stay)
//   POST   /api/stores/:id/refresh     look for houses again
//   GET    /api/stores/:id/branches    a git storage's branches { current, local, remote, hasRemote, dirty }
//   POST   /api/stores/:id/branch      { name, create? } switch (or start) a branch → the branches view
//   GET    /api/fs/list?path=          folders in a path (no path: the places to start from)
//   POST   /api/fs/mkdir               { path, name } → { path }
//   POST   /api/settings               { showDemo }
//   POST   /api/houses                 { store, name } → a new empty house
//   POST   /api/houses/:id/copy        { store } → the house copied to another storage

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { findHouses, isUncPath, inside, readHouseHead, connectShare } from './folder.js';
import { formatJson } from '../../src/model/format.js';
import { redact } from './settings.js';

const isWin = process.platform === 'win32';

/** Where the folder browser starts: drives on Windows; /, home and HA's shared folders elsewhere. */
export async function startPlaces() {
  const out = [], ok = async p => { try { await fs.access(p); return true; } catch { return false; } };
  out.push({ name: 'Home', path: os.homedir() });
  if (isWin) {
    for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') if (await ok(`${l}:\\`)) out.push({ name: `${l}:`, path: `${l}:\\` });
  } else {
    for (const [name, p] of [['/', '/'], ['share (HA)', '/share'], ['media (HA)', '/media'], ['config (HA)', '/config'], ['mnt', '/mnt']]) if (await ok(p)) out.push({ name, path: p });
  }
  return out;
}

/** The folders in `dir`, marked when they hold a house or are a git repo. */
export async function listFolder(dir) {
  const abs = path.resolve(dir);
  let entries;
  try { entries = await fs.readdir(abs, { withFileTypes: true }); }
  catch (e) {
    const denied = e.code === 'EACCES' || e.code === 'EPERM' || e.code === 'UNKNOWN';
    return { path: abs, error: denied ? 'access denied' : e.code === 'ENOENT' ? 'no such folder' : e.message, needs: denied && isWin && isUncPath(dir) ? 'password' : undefined };
  }
  const folders = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules' || e.name === '$RECYCLE.BIN' || e.name === 'System Volume Information') continue;
    const p = path.join(abs, e.name);
    folders.push({ name: e.name, path: p, house: !!(await readHouseHead(p)), git: await exists(path.join(p, '.git')) });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const parent = path.dirname(abs);
  return { path: abs, parent: parent !== abs ? parent : null, folders, house: !!(await readHouseHead(abs)), git: await exists(path.join(abs, '.git')) };
}

const exists = async p => { try { await fs.access(p); return true; } catch { return false; } };

/**
 * What a folder holds, for the wizard: { ok, path, houses, git, empty, others } or { ok: false, error, needs? }.
 * creds { user, password }: sign in to a Windows share first (when it refused access).
 */
export async function checkFolder(dir, creds) {
  if (!dir || typeof dir !== 'string') return { ok: false, error: 'pick a folder' };
  const abs = path.resolve(dir);
  if (creds?.user && isWin && isUncPath(dir)) {
    const c = await connectShare(dir, creds);
    if (!c.ok) return { ok: false, path: abs, error: c.error, needs: 'password' };
  }
  let entries;
  try { entries = await fs.readdir(abs, { withFileTypes: true }); }
  catch (e) {
    const denied = e.code === 'EACCES' || e.code === 'EPERM' || e.code === 'UNKNOWN';
    return { ok: false, path: abs, error: denied ? 'access denied' : e.code === 'ENOENT' ? 'no such folder' : e.message, needs: denied && isWin && isUncPath(dir) ? 'password' : undefined };
  }
  const houses = (await findHouses(abs)).map(h => ({ id: h.id, name: h.name, folder: path.relative(abs, h.dir) || '.' }));
  const visible = entries.filter(e => !e.name.startsWith('.'));
  const others = visible.filter(e => !houses.some(h => h.folder === e.name)).length;
  return { ok: true, path: abs, houses, git: await exists(path.join(abs, '.git')), empty: visible.length === 0, others: houses.some(h => h.folder === '.') ? 0 : others };
}

const EMPTY_MODEL = { schemaVersion: 1, units: 'mm', site: { origin: [0, 0], northAngleDeg: 0 }, levels: [], anchors: [], checks: [] };

/** A house id from a name: "Huset BBV28" → house_huset_bbv28, unique among `taken`. */
export function houseIdFor(name, taken) {
  const base = 'house_' + (String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'new');
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}_${n++}`;
  return id;
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) await copyDir(a, b); else await fs.copyFile(a, b);
  }
}

export async function storeRoutes(registry, req, res, url, { json, readJsonBody }) {
  const p = url.pathname, m = /^\/api\/stores\/([^/]+)(?:\/(.*))?$/.exec(p);
  const say = e => redact(e.message, registry.secrets);
  if (p === '/api/stores' && req.method === 'GET') return json(res, 200, { stores: registry.storeList(), showDemo: registry.settings.showDemo, platform: process.platform, git: await registry.gitAvailable?.() }), true;
  if (p === '/api/stores/check' && req.method === 'POST') {
    const b = await readJsonBody(req);
    if (b.type === 'git') { const { checkGit } = await import('./git.js'); return json(res, 200, await checkGit(b, registry)), true; }
    return json(res, 200, await checkFolder(b.path, b.user ? { user: b.user, password: b.password } : null)), true;
  }
  if (p === '/api/stores/sshkey' && req.method === 'POST') { const { makeSshKey } = await import('./git.js'); return json(res, 200, await makeSshKey(registry, await readJsonBody(req))), true; }
  if (p === '/api/stores' && req.method === 'POST') {
    const b = await readJsonBody(req), { secrets, ...cfg } = b;
    if (cfg.type === 'folder') {
      const c = await checkFolder(cfg.path, secrets?.user ? secrets : null);
      if (!c.ok) return json(res, 400, { error: c.error, needs: c.needs }), true;
      cfg.path = c.path;
      if (!cfg.name) cfg.name = path.basename(c.path) || c.path;
    } else if (cfg.type === 'git') {
      const { prepareGit } = await import('./git.js');
      const r = await prepareGit(cfg, secrets || {}, registry);
      if (r.error) return json(res, 400, r), true;
      for (const k of Object.keys(cfg)) delete cfg[k];
      Object.assign(cfg, r.cfg);
    } else return json(res, 400, { error: 'type must be folder or git' }), true;
    try { const s = await registry.addStore(cfg, secrets || {}); return json(res, 200, { store: registry.storeList().find(x => x.id === s.id) }), true; }
    catch (e) { return json(res, 400, { error: say(e) }), true; }
  }
  if (m && m[1] !== 'check' && m[1] !== 'sshkey') {
    const id = decodeURIComponent(m[1]);
    if (!m[2] && req.method === 'PUT') { const { secrets, ...cfg } = await readJsonBody(req); await registry.updateStore(id, cfg, secrets); return json(res, 200, { store: registry.storeList().find(x => x.id === id) }), true; }
    if (!m[2] && req.method === 'DELETE') { await registry.removeStore(id); return json(res, 200, { ok: true }), true; }
    if (m[2] === 'refresh' && req.method === 'POST') { const s = registry.stores.find(x => x.id === id); if (!s) return json(res, 404, { error: 'no such storage' }), true; await s.sync?.(); await registry.poke(s); return json(res, 200, { store: registry.storeList().find(x => x.id === id) }), true; }
    if (m[2] === 'branches' && req.method === 'GET') {
      const s = registry.stores.find(x => x.id === id);
      if (!s?.branches) return json(res, 400, { error: 'only a git storage has branches' }), true;
      try { return json(res, 200, await s.branches()), true; } catch (e) { return json(res, 400, { error: say(e) }), true; }
    }
    if (m[2] === 'branch' && req.method === 'POST') {
      const s = registry.stores.find(x => x.id === id), b = await readJsonBody(req);
      if (!s?.switchBranch) return json(res, 400, { error: 'only a git storage has branches' }), true;
      try {
        const view = await s.switchBranch(b.name, { create: !!b.create });
        await registry.rememberAll();
        await registry.poke(s);
        registry.emit('houses', {});
        return json(res, 200, { ...view, store: registry.storeList().find(x => x.id === id) }), true;
      } catch (e) { return json(res, 400, { error: say(e) }), true; }
    }
    if (m[2] === 'resolve' && req.method === 'POST') {
      // after a conflict in a git storage: keep the version on this computer, or take the repository's
      const s = registry.stores.find(x => x.id === id), b = await readJsonBody(req);
      if (!s?.resolve) return json(res, 400, { error: 'nothing to resolve here' }), true;
      try { await s.resolve(b.use); } catch (e) { return json(res, 400, { error: say(e) }), true; }
      await registry.poke(s);
      return json(res, 200, { store: registry.storeList().find(x => x.id === id) }), true;
    }
  }
  if (p === '/api/fs/list' && req.method === 'GET') {
    const dir = url.searchParams.get('path');
    return json(res, 200, dir ? await listFolder(dir) : { path: null, places: await startPlaces(), folders: [] }), true;
  }
  if (p === '/api/fs/mkdir' && req.method === 'POST') {
    const b = await readJsonBody(req);
    if (!b.path || !b.name || /[\\/:*?"<>|]/.test(b.name) || b.name.startsWith('.')) return json(res, 400, { error: 'that name cannot be a folder name' }), true;
    const dir = path.join(path.resolve(b.path), b.name);
    try { await fs.mkdir(dir); } catch (e) { return json(res, 400, { error: e.code === 'EEXIST' ? 'that folder already exists' : e.message }), true; }
    return json(res, 200, { path: dir }), true;
  }
  if (p === '/api/settings' && req.method === 'POST') { const b = await readJsonBody(req); if ('showDemo' in b) await registry.setShowDemo(b.showDemo); return json(res, 200, { showDemo: registry.settings.showDemo }), true; }
  if (p === '/api/houses' && req.method === 'POST') {
    const b = await readJsonBody(req), store = registry.stores.find(s => s.id === b.store);
    if (!store) return json(res, 404, { error: 'no such storage' }), true;
    if (store.builtin) return json(res, 400, { error: 'new houses go into a storage of your own, not the app folder' }), true;
    const name = String(b.name || '').trim();
    if (!name) return json(res, 400, { error: 'give the house a name' }), true;
    const id = houseIdFor(name, new Set(registry.houses({ all: true }).map(h => h.id)));
    const location = { schemaVersion: 1, id, name, model: 'model.json', bindings: {}, settings: {} };
    // the first house in an empty storage may be the storage folder itself; otherwise a folder named after it
    await store.createHouse(id, formatJson(location), formatJson(EMPTY_MODEL), { message: `New house ${name}` });
    await registry.rememberAll();
    registry.emit('houses', {});
    return json(res, 200, { house: { id, name, store: store.id } }), true;
  }
  const cm = /^\/api\/houses\/([^/]+)\/copy$/.exec(p);
  if (cm && req.method === 'POST') {
    const b = await readJsonBody(req), f = registry.find(decodeURIComponent(cm[1])), to = registry.stores.find(s => s.id === b.store);
    if (!f || !to) return json(res, 404, { error: 'no such house or storage' }), true;
    if (to === f.store) return json(res, 400, { error: 'it is already there' }), true;
    if (to.builtin) return json(res, 400, { error: 'houses are copied out of the app folder, not into it' }), true;
    const folder = path.basename(f.house.dir) === path.basename(f.store.root) ? f.house.id : path.basename(f.house.dir), target = inside(to.root, folder);
    if (!target) return json(res, 400, { error: 'bad folder' }), true;
    if (await exists(target)) return json(res, 409, { error: `${to.cfg?.name || to.id} already has a folder ${folder}` }), true;
    await copyDir(f.house.dir, target);
    await to.added?.(folder, `Copy of ${f.house.name}`);
    await to.refresh();
    await registry.rememberAll();
    registry.emit('houses', {});
    return json(res, 200, { ok: true, note: registry.houses({ all: true }).find(h => h.id === f.house.id)?.store !== to.id ? 'The copy has the same id, so the original is still the one that opens; disconnect or hide the old one to use the copy.' : undefined }), true;
  }
  return false;
}
