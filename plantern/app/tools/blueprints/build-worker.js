// The thread that builds GLBs (decision 287): jscad and the GLB writer are synchronous and take from a tenth of a second to
// several seconds per object, so they run here and never block the server's own thread (pages, saves, the Home Assistant
// connection). The cache (cache.js) resolves, hashes and writes files; this only turns one request into a model.
//
// In:  { id, op: 'build' | 'export', model: { kind: 'built-in', file, version } | { kind: 'house', text, file },
//        resolved, library, extraMaterials, textures: [[path, { bytes, mime }]], source? }
// Out: { id, glb, size, colour, meta? } or { id, error }

import { parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { buildModel } from '../../object-designs/lib/build.js';
import { meshBounds } from '../../object-designs/lib/geom.js';
import { assetMeta } from '../../object-designs/lib/asset-meta.js';
import { mainColourOfBuild } from '../../src/blueprints/colour.js';
import { parseHouseBlueprint } from '../../src/blueprints/load.js';
import { blueprintModule } from '../../src/blueprints/build.js';

const round1 = v => Math.round(v * 10) / 10;

async function loadModel(m, library) {
  if (m.kind === 'built-in') return import(`${pathToFileURL(m.file).href}?v=${m.version}`);
  const parsed = parseHouseBlueprint(m.text, { file: m.file, libraryNames: new Set(Object.keys(library)) });
  if (!parsed.ok) throw new Error(parsed.problems.join('; '));
  return blueprintModule(parsed.json);
}

parentPort.on('message', async job => {
  try {
    const model = await loadModel(job.model, job.library);
    const built = buildModel(model, job.resolved, { ...job.library, ...job.extraMaterials }, { textures: new Map(job.textures) });
    const bounds = meshBounds({ pos: built.parts.flatMap(p => p.mesh.pos), nrm: [], idx: [] });
    const size = bounds ? [0, 1, 2].map(k => round1(bounds.max[k] - bounds.min[k])) : [0, 0, 0];
    const colour = mainColourOfBuild(built.parts, built.resolved);
    const meta = job.op === 'export' ? assetMeta(model, built, { source: job.source }) : undefined;
    const glb = built.glb instanceof Uint8Array ? built.glb : new Uint8Array(built.glb);
    parentPort.postMessage({ id: job.id, glb, size, colour, meta }, [glb.buffer]);
  } catch (e) {
    parentPort.postMessage({ id: job.id, error: e?.message || String(e) });
  }
});
