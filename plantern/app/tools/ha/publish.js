// Publishes the Lovelace card from the add-on (docs/plans/ha-11-12.md S15): mirrors what the card needs to
// Home Assistant's /config/www/plantern/ (served as /local/plantern/, without login: the trade-off accepted
// in the plan) and registers the card as a dashboard resource over the HA WebSocket API.
//
//   <target>/src/…                the modules the card imports (its import closure, nothing else)
//   <target>/locations/index.json the houses; <target>/locations/<id>/{location.json,<model>,assets/…}
//
// Runs at start and after every change to a house (registry events), debounced. Never touches anything outside
// <target>. Pure Node, no dependencies.

import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { writeAtomic } from '../store/settings.js';
import { connectWithin } from './bridge.js';

export const CARD_ENTRY = 'src/card/plantern-card.js';
export const BUILTIN_CONNECTION = 'home_assistant';

/** Where to publish: PLANTERN_PUBLISH_DIR, else /config/www/plantern when running as an add-on, else nowhere. */
export function publishDir(env = process.env) {
  return env.PLANTERN_PUBLISH_DIR || (env.SUPERVISOR_TOKEN ? '/config/www/plantern' : null);
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

/** The files a module needs: itself and everything it imports by a relative path, transitively (relative to root, sorted). */
export async function importClosure(entry, root) {
  const seen = new Set(), todo = [entry];
  while (todo.length) {
    const rel = todo.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const text = await fs.readFile(path.join(root, ...rel.split('/')), 'utf8');
    for (const m of text.matchAll(IMPORT)) {
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      if (next.startsWith('..')) throw new Error(`${rel} imports ${m[1]}, outside the app folder`);
      todo.push(next);
    }
  }
  return [...seen].sort();
}

/** The dashboard resource URL for a card version (the query makes browsers fetch a changed card). */
export const resourceUrl = hash => `/local/plantern/${CARD_ENTRY}?v=${hash}`;

/**
 * Make sure the card is a dashboard resource of type module: 'created', 'updated' (another version was
 * registered) or 'unchanged'. bridge: a connected HA bridge. Throws when HA refuses (a dashboard in YAML mode,
 * or a connection that is not an administrator).
 */
export async function ensureResource(bridge, url) {
  const base = url.split('?')[0];
  const list = await bridge.request({ type: 'lovelace/resources' });
  const have = (list || []).find(r => String(r.url).split('?')[0] === base);
  if (!have) { await bridge.request({ type: 'lovelace/resources/create', res_type: 'module', url }); return 'created'; }
  if (have.url === url && have.type === 'module') return 'unchanged';
  await bridge.request({ type: 'lovelace/resources/update', resource_id: have.id, res_type: 'module', url });
  return 'updated';
}

async function writeIfChanged(file, content) {
  try { if ((await fs.readFile(file)).equals(content)) return false; } catch { /* new file */ }
  await writeAtomic(file, content);
  return true;
}

async function listFiles(dir, rel = '') {
  let entries;
  try { entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await listFiles(dir, r)); else if (e.isFile()) out.push(r);
  }
  return out;
}

/** Copy the files of a house's assets/ folder (textures) into target; returns the relative names. */
async function mirrorAssets(from, to) {
  const names = await listFiles(from);
  for (const n of names) await writeIfChanged(path.join(to, ...n.split('/')), await fs.readFile(path.join(from, ...n.split('/'))));
  return names;
}

/**
 * The publisher. registry: the Registry (houses(), load(), find(), events 'changed' and 'houses'); hub: the HA hub
 * (bridge(name)) used to register the resource, or null; root: the app folder; target: the folder to publish to.
 */
export function createPublisher({ registry, hub = null, root, target, connection = BUILTIN_CONNECTION, log = console.log, debounceMs = 1000 }) {
  let timer = null, running = null, again = false, registered = null, warned = false, stopped = false;

  async function publish() {
    const summary = { files: 0, houses: [], skipped: [], resource: 'none' };
    // 1. the card's modules
    const closure = await importClosure(CARD_ENTRY, root), hash = crypto.createHash('sha1');
    for (const rel of closure) {
      const data = await fs.readFile(path.join(root, ...rel.split('/')));
      hash.update(rel).update(data);
      await writeIfChanged(path.join(target, ...rel.split('/')), data);
    }
    summary.files = closure.length;
    for (const rel of await listFiles(path.join(target, 'src'))) if (!closure.includes(`src/${rel}`)) await fs.rm(path.join(target, 'src', ...rel.split('/')), { force: true });
    // 2. the houses
    await registry.ready;
    const houses = registry.houses(), listed = [], keep = new Set();
    for (const h of houses) {
      keep.add(h.id);
      try {
        const loaded = await registry.load(h.id), loc = JSON.parse(loaded.location.text);
        const dir = path.join(target, 'locations', h.id);
        await writeIfChanged(path.join(dir, 'location.json'), Buffer.from(loaded.location.text));
        await writeIfChanged(path.join(dir, loc.model || 'model.json'), Buffer.from(loaded.model.text));
        const src = registry.find(h.id)?.house?.dir;
        if (src) await mirrorAssets(path.join(src, 'assets'), path.join(dir, 'assets'));
        listed.push({ id: h.id, name: h.name || h.id, path: `${h.id}/` });
        summary.houses.push(h.id);
      } catch (e) { summary.skipped.push(`${h.id}: ${e.message}`); }
    }
    await writeIfChanged(path.join(target, 'locations', 'index.json'), Buffer.from(JSON.stringify({ default: listed[0]?.id, locations: listed }, null, 2) + '\n'));
    try {                                                           // houses that are gone (or hidden) disappear from /local too
      for (const e of await fs.readdir(path.join(target, 'locations'), { withFileTypes: true })) {
        if (e.isDirectory() && !keep.has(e.name)) await fs.rm(path.join(target, 'locations', e.name), { recursive: true, force: true });
      }
    } catch { /* nothing yet */ }
    // 3. the dashboard resource
    const url = resourceUrl(hash.digest('hex').slice(0, 10));
    if (registered !== url) {
      try {
        const bridge = hub && await hub.bridge(connection);
        if (!bridge || !(await connectWithin(bridge, 8000))) throw new Error('no connection to Home Assistant yet');
        summary.resource = await ensureResource(bridge, url);
        registered = url;
      } catch (e) {
        summary.resource = 'manual';
        if (!warned) { warned = true; log(`Plantern card: could not add it as a dashboard resource automatically (${e.message}). Add it yourself in Settings, Dashboards, three dots, Resources: URL ${url.split('?')[0]}, type JavaScript module.`); }
      }
    }
    return summary;
  }

  /** One publish at a time; a request that arrives meanwhile runs once more afterwards. */
  function run() {
    if (running) { again = true; return running; }
    running = publish().catch(e => { log(`Plantern card: publishing failed: ${e.message}`); return null; }).then(s => {
      running = null;
      if (s) log(`Plantern card published: ${s.files} files, houses ${s.houses.join(', ') || 'none'}${s.skipped.length ? `; skipped ${s.skipped.join('; ')}` : ''}${s.resource === 'created' || s.resource === 'updated' ? `; dashboard resource ${s.resource}` : ''}.`);
      if (again && !stopped) { again = false; return run(); }
      return s;
    });
    return running;
  }
  const soon = () => { if (stopped) return; clearTimeout(timer); timer = setTimeout(run, debounceMs); timer.unref?.(); };

  return {
    /** Publish now, and again after every change to a house. Resolves with the first publish's summary. */
    start() { registry.on('changed', soon); registry.on('houses', soon); return run(); },
    publish: run,
    stop() { stopped = true; clearTimeout(timer); registry.off('changed', soon); registry.off('houses', soon); },
  };
}
