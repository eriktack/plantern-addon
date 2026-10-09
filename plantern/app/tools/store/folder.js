// A storage that is a folder: a local path or a network share the OS has mounted (`\\server\share`
// on Windows, /share/<name> in HA; decision 104). Houses are folders with location.json + model.json,
// either the storage folder itself or one level down. Changes made by others are found by watching
// and by polling (watching does not work over SMB/NFS or Docker bind mounts).

import path from 'node:path';
import { promises as fs, watch as fsWatch } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeAtomic } from './settings.js';

/** Version of a file's text: sha256 of it with Windows line ends made plain (a checkout may add them). */
export const versionOf = text => (text === null || text === undefined ? null : createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16));

export const isUncPath = p => /^(\\\\|\/\/)[^\\/]/.test(String(p || ''));

/** The share part of a UNC path: \\nas\plantern\houses → \\nas\plantern (null for other paths). */
export const shareOf = p => { const m = /^(?:\\\\|\/\/)([^\\/]+)[\\/]([^\\/]+)/.exec(String(p || '')); return m ? `\\\\${m[1]}\\${m[2]}` : null; };

/**
 * Sign in to a Windows network share with a user and password (decision 104: the OS mounts it; this
 * only tells Windows who we are, like typing them in Explorer). Not persistent; elsewhere a no-op.
 * Resolves { ok } or { ok: false, error }.
 */
export function connectShare(p, { user, password } = {}) {
  const share = shareOf(p);
  if (process.platform !== 'win32' || !share || !user) return Promise.resolve({ ok: false, error: 'nothing to sign in to' });
  return new Promise(resolve => execFile('net', ['use', share, password ?? '', `/user:${user}`, '/persistent:no'], { windowsHide: true, timeout: 30000 }, (e, out, err) => {
    if (!e) return resolve({ ok: true });
    const t = String(err || out || e.message);
    resolve({ ok: false, error: /1219/.test(t) ? 'Windows is already signed in to this server as someone else: disconnect that first (net use), or use the same user.' : /1326|86\b/.test(t) ? 'Wrong user name or password.' : t.replace(String(password || '\u0000'), '•••').trim() });
  }));
}

/** Read a house folder's location.json: { id, name, model } or null when it is not a house. */
export async function readHouseHead(dir) {
  try {
    const loc = JSON.parse(await fs.readFile(path.join(dir, 'location.json'), 'utf8'));
    if (typeof loc?.id !== 'string' || !loc.id) return null;
    return { id: loc.id, name: loc.name || loc.id, model: typeof loc.model === 'string' ? loc.model : 'model.json' };
  } catch { return null; }
}

/** Houses in a folder: the folder itself when it is one, else its sub-folders that are. */
export async function findHouses(root) {
  const self = await readHouseHead(root);
  if (self) return [{ ...self, dir: root }];
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const dir = path.join(root, e.name), head = await readHouseHead(dir);
    if (head) out.push({ ...head, dir });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A path below `dir` (a house file or an asset), or null if it would leave the house folder. */
export function inside(dir, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null;
  const file = path.resolve(dir, ...rel.split(/[\\/]/));
  return file.startsWith(path.resolve(dir) + path.sep) ? file : null;
}

export class FolderStore {
  /** cfg: { id, name?, path, pollSeconds?, readOnly? }; ctx: from the registry (its secrets) */
  constructor(cfg, ctx) {
    this.cfg = cfg;
    this.ctx = ctx;
    this.id = cfg.id;
    this.type = 'folder';
    this.root = path.resolve(cfg.path);
    this.readOnly = !!cfg.readOnly;
    this.pollMs = 1000 * (cfg.pollSeconds ?? (isUncPath(cfg.path) ? 15 : 3));
    this.houses = [];
    this.status = { state: 'ok' };
  }

  async open() {
    // a Windows share with a saved sign-in: tell Windows who we are first
    const sec = this.ctx?.secret?.(this.id);
    if (sec?.user && isUncPath(this.cfg.path)) await connectShare(this.cfg.path, sec);
    await this.refresh();
  }

  /** Look for houses again (after a house was added, or the folder came back). */
  async refresh() {
    try { await fs.access(this.root); this.status = { state: 'ok' }; }
    catch (e) { this.status = { state: 'offline', error: e.code === 'EACCES' || e.code === 'EPERM' ? 'access denied' : 'folder not reachable' }; this.houses = []; return []; }
    this.houses = await findHouses(this.root);
    return this.houses;
  }

  house(id) { return this.houses.find(h => h.id === id) || null; }

  /** The file name of `file` ('location' | 'model') in house h. */
  fileName(h, file) { return file === 'location' ? 'location.json' : h.model; }

  /** { text, version } of a house file (text null when missing). */
  async read(h, file) {
    try { const text = await fs.readFile(path.join(h.dir, this.fileName(h, file)), 'utf8'); return { text, version: versionOf(text) }; }
    catch (e) { if (e.code === 'ENOENT') return { text: null, version: null }; throw e; }
  }

  async write(h, file, text) {
    if (this.readOnly) throw Object.assign(new Error(`${this.cfg.name || this.id} is read-only`), { status: 403 });
    await writeAtomic(path.join(h.dir, this.fileName(h, file)), text);
    return { version: versionOf(text) };
  }

  /** Stat of the house files, cheap enough to poll: 'mtime:size' per file. */
  async stamp(h) {
    const one = async f => { try { const s = await fs.stat(path.join(h.dir, this.fileName(h, f))); return `${s.mtimeMs}:${s.size}`; } catch { return 'missing'; } };
    return { location: await one('location'), model: await one('model') };
  }

  /** Call onPoke() when something in the storage may have changed (watching where it works, plus a timer). */
  watch(onPoke) {
    this.timer = setInterval(onPoke, this.pollMs);
    this.timer.unref?.();
    this.watchers = [];
    if (!isUncPath(this.cfg.path)) {
      try { const w = fsWatch(this.root, { recursive: true }, () => onPoke()); w.on('error', () => {}); this.watchers.push(w); } catch { /* polling only */ }
    }
  }

  close() { clearInterval(this.timer); for (const w of this.watchers || []) w.close(); }

  /** A new house folder `folder` (below the storage folder) with these two files. */
  async createHouse(folder, locationText, modelText) {
    if (this.readOnly) throw Object.assign(new Error(`${this.cfg.name || this.id} is read-only`), { status: 403 });
    const dir = inside(this.root, folder);
    if (!dir) throw Object.assign(new Error(`bad folder name "${folder}"`), { status: 400 });
    try { await fs.access(path.join(dir, 'location.json')); throw Object.assign(new Error(`${folder} already holds a house`), { status: 409 }); } catch (e) { if (e.status) throw e; }
    await writeAtomic(path.join(dir, 'model.json'), modelText);
    await writeAtomic(path.join(dir, 'location.json'), locationText);
    await this.refresh();
    return dir;
  }
}
