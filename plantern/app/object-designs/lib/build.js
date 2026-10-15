// lib/build.js
// Runs one model from its parameters to glTF. Pure: the model module, the materials library and
// the texture files are passed in. This is the glue between the model file contract
// (AGENT_INSTRUCTIONS.md §3) and the libraries; agents never call it from a model file.

import { partBuilt, resolveParams } from './params.js';
import { resolvePartMaterials } from './materials.js';
import { geomToMesh, addPlanarUvs, triangleCount } from './geom.js';
import { buildGltfParts, toGltfText, toGlb } from './gltf-lib.js';

/**
 * model:    a module with `meta` and `build(params)`
 * input:    parameter values (any subset)
 * library:  the parsed materials/library.json
 * options:  { textures: Map path -> { bytes: Uint8Array, mime } } for every texture the library names
 *
 * Returns { gltf (text), glb (Uint8Array), params, resolved: { [partKey]: material },
 *           parts: [{ key, label, mesh, triangles, material (name) }] }.
 */
export function buildModel(model, input = {}, library = {}, { textures = new Map() } = {}) {
  const params = resolveParams(model.meta, input);
  const materials = resolvePartMaterials(model.meta, params, library);
  const geoms = model.build(params);

  const images = new Map();
  // The variant the part list depends on (a part with its own appliesTo, see AGENT_INSTRUCTIONS §3.1).
  const variant = model.meta.params.some(d => d.key === 'variant') ? params.variant : undefined;
  const parts = model.meta.parts.map(part => {
    if (!(part.key in geoms)) throw new Error(`build() returned no geometry for part "${part.key}"`);
    const material = materials[part.key];
    let mesh = geomToMesh(geoms[part.key]);
    if (mesh.idx.length === 0) {
      // a part with no geometry is only allowed where it is not built for these values (it does not apply to the variant, or the
      // yes/no parameter it `needs` is off, like the glass of doors that are not glazed); it is then left out of the model
      if (partBuilt(part, params, variant)) throw new Error(`part "${part.label}" has no geometry`);
      return null;
    }
    if (material.texture) {
      const path = material.texture.path;
      if (!textures.has(path)) throw new Error(`Texture file "${path}" is not loaded (it must be in textures/)`);
      images.set(path, textures.get(path));
      mesh = addPlanarUvs(mesh, material.texture.uvScale);
    }
    return { key: part.key, label: part.label, mesh, material };
  }).filter(p => p !== null);

  const assembled = buildGltfParts(
    parts.map(p => ({ name: p.label, mesh: p.mesh, material: p.material })),
    { name: model.meta.name, generator: `plantern-object-designs ${model.meta.id}`, images },
  );
  return {
    gltf: toGltfText(assembled),
    glb: toGlb(assembled),
    params,
    resolved: materials,
    parts: parts.map(p => ({ key: p.key, label: p.label, mesh: p.mesh, triangles: triangleCount(p.mesh), material: p.material.name })),
  };
}
