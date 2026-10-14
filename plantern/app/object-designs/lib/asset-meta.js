// lib/asset-meta.js
// The meta.json written next to an exported model (PLANTERN.md §10: assets/<name>/model.glb + meta.json).
// Pure: takes the result of buildModel(), returns the object to write.

import { meshBounds } from './geom.js';

const round1 = v => Math.round(v * 10) / 10;

/**
 * model:  the model module (meta)
 * built:  the result of buildModel() with the same parameters
 * source: where the model file is, relative to the repo (for the record)
 */
export function assetMeta(model, built, { source }) {
  const bounds = meshBounds({ pos: built.parts.flatMap(p => p.mesh.pos), nrm: [], idx: [] });
  const size = bounds ? [0, 1, 2].map(k => round1(bounds.max[k] - bounds.min[k])) : [0, 0, 0];
  return {
    id: model.meta.id,
    name: model.meta.name,
    description: model.meta.description ?? '',
    source,
    generator: `plantern-object-designs ${model.meta.id}`,
    model: 'model.glb',
    units: 'mm',
    origin: 'feet on z = 0, centred on x and y, front at -y',
    size,
    parameters: built.params,
    parts: built.parts.map(p => ({ key: p.key, label: p.label, material: p.material, triangles: p.triangles })),
  };
}

export function formatMeta(meta) {
  return JSON.stringify(meta, null, 2) + '\n';
}
