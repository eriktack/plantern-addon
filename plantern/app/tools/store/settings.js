// Plantern's own settings folder (decision 106): where it keeps its storages (stores.json), their
// secrets (secrets.json) and the git clones and keys the wizard makes. Chosen by Plantern, never by
// the person: %APPDATA%\Plantern on Windows, ~/.plantern elsewhere, /data in the HA add-on (whose
// start script passes it). Never served to the browser.

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export function defaultDataDir(env = process.env) {
  if (env.PLANTERN_DATA) return path.resolve(env.PLANTERN_DATA);
  if (env.SUPERVISOR_TOKEN) return '/data';                                          // running as an HA add-on
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Plantern');
  return path.join(os.homedir(), '.plantern');
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw new Error(`${file}: ${e.message}`); }
}

/** Write a file so a reader never sees half of it; secrets readable by this user only. */
export async function writeAtomic(file, text, mode) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, text, mode ? { encoding: 'utf8', mode } : 'utf8');
  await renameRetry(tmp, file);
}

/**
 * fs.rename that tries again when Windows says the target is busy for a moment (EPERM / EBUSY / EACCES: a virus scanner,
 * the indexer or a file watcher holds it): a save then goes through instead of failing on a lock that is gone a moment
 * later. After the last try the temporary file is removed and the error is thrown. `rename` and `wait` can be replaced (tests).
 */
export async function renameRetry(from, to, { tries = 6, rename = fs.rename, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  for (let i = 1; ; i++) {
    try { return await rename(from, to); }
    catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= tries) { await fs.rm(from, { force: true }).catch(() => {}); throw e; }
      await wait(25 * 2 ** (i - 1));
    }
  }
}

/** { stores: [...], showDemo } with defaults. */
export async function loadSettings(dir) {
  const s = await readJson(path.join(dir, 'stores.json'), {});
  return { stores: Array.isArray(s.stores) ? s.stores : [], showDemo: s.showDemo !== false };
}

export const saveSettings = (dir, s) => writeAtomic(path.join(dir, 'stores.json'), JSON.stringify({ stores: s.stores, ...(s.showDemo === false ? { showDemo: false } : {}) }, null, 2) + '\n');

/** { <storeId>: { token?, password?, user?, sshKey? } } */
export const loadSecrets = dir => readJson(path.join(dir, 'secrets.json'), {});
export const saveSecrets = (dir, s) => writeAtomic(path.join(dir, 'secrets.json'), JSON.stringify(s, null, 2) + '\n', 0o600);

/** Replace every secret value found in `text` (an error message, git output) with •••. */
export function redact(text, secrets) {
  let out = String(text ?? '');
  for (const s of Object.values(secrets || {})) for (const v of Object.values(s || {})) if (typeof v === 'string' && v.length >= 4) out = out.split(v).join('•••');
  return out;
}
