// lib/gltf-lib.js
// Writes glTF 2.0: as .gltf text (JSON with an embedded buffer) or as binary .glb.
// Pure: no DOM, no files; works in browsers and Node.
//
// Input is in plan space (mm, z up, see AGENT_INSTRUCTIONS.md §2). This file is the only place
// that converts to glTF (metres, y up): (x, y, z) mm -> (x, z, -y) m. That mapping is a proper
// rotation, so triangle winding and normals stay correct.
//
// Pipeline: buildGltfParts() assembles the JSON and the binary data once; toGltfText() and toGlb()
// write it in either form.

export const GL = {
  ARRAY_BUFFER: 34962,
  ELEMENT_ARRAY_BUFFER: 34963,
  FLOAT: 5126,
  UNSIGNED_INT: 5125,
};

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

// -0 would show up in JSON comparisons and tests, so negation goes through neg().
const neg = v => (v === 0 ? 0 : -v);

/** Plan point in mm -> glTF point in metres. */
export function toGltfPoint([x, y, z], unitScale = 0.001) {
  return [x * unitScale, z * unitScale, neg(y) * unitScale];
}

/** Plan normal -> glTF normal (no scaling). */
export function toGltfNormal([x, y, z]) {
  return [x, z, neg(y)];
}

function uint8ToBase64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

const pad4 = n => (4 - (n % 4)) % 4;

/**
 * Assembles the glTF JSON (without its buffer uri) and the binary data.
 * parts:  [{ name, mesh, material }]  one primitive per part. material is a resolved material:
 *         { name, color: [r,g,b,a] linear (0..1), roughness?, metallic?, texture?: { path, uvScale } }
 *         A textured material needs mesh.uv (see addPlanarUvs in geom.js).
 * opts:   { name, generator, unitScale (metres per plan unit, default 0.001 for mm),
 *           images: Map path -> { bytes: Uint8Array, mime: 'image/png' | 'image/jpeg' } }
 */
export function buildGltfParts(parts, { name = 'Model', generator = 'gltf-lib', unitScale = 0.001, images = new Map() } = {}) {
  const bufferViews = [], accessors = [], primitives = [], materials = [];
  const chunks = [];
  let offset = 0;

  // Every view starts on a 4-byte boundary (all components here are 4 bytes).
  const addBytes = (u8, target) => {
    const p = pad4(offset);
    if (p) { chunks.push(new Uint8Array(p)); offset += p; }
    chunks.push(u8);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: u8.byteLength, ...(target && { target }) });
    offset += u8.byteLength;
    return bufferViews.length - 1;
  };
  const addTyped = (typed, target) => addBytes(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), target);
  const addAccessor = acc => { accessors.push(acc); return accessors.length - 1; };

  // Textures: one image, texture and sampler per file, shared by every part that uses it.
  const textureIndex = new Map();
  const imageEntries = [];
  const sampler = { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 };
  const textureFor = path => {
    if (textureIndex.has(path)) return textureIndex.get(path);
    const img = images.get(path);
    if (!img) throw new Error(`Texture "${path}" was not loaded`);
    const view = addBytes(img.bytes);
    imageEntries.push({ bufferView: view, mimeType: img.mime });
    textureIndex.set(path, imageEntries.length - 1);
    return imageEntries.length - 1;
  };

  parts.forEach((part, matIndex) => {
    const { mesh, material } = part;
    if (mesh.idx.length === 0) throw new Error(`Part "${part.name}" has no triangles`);
    const pos = mesh.pos.map(p => toGltfPoint(p, unitScale));
    const nrm = mesh.nrm.map(toGltfNormal);
    const posArr = new Float32Array(pos.flat());
    const nrmArr = new Float32Array(nrm.flat());
    const idxArr = new Uint32Array(mesh.idx);

    const min = [0, 1, 2].map(k => pos.reduce((m, v) => Math.min(m, v[k]), Infinity));
    const max = [0, 1, 2].map(k => pos.reduce((m, v) => Math.max(m, v[k]), -Infinity));

    const attributes = {};
    attributes.POSITION = addAccessor({ bufferView: addTyped(posArr, GL.ARRAY_BUFFER), byteOffset: 0,
      componentType: GL.FLOAT, count: pos.length, type: 'VEC3', min, max });
    attributes.NORMAL = addAccessor({ bufferView: addTyped(nrmArr, GL.ARRAY_BUFFER), byteOffset: 0,
      componentType: GL.FLOAT, count: nrm.length, type: 'VEC3' });
    const textured = !!material.texture;
    if (textured) {
      if (!mesh.uv || mesh.uv.length !== mesh.pos.length) throw new Error(`Part "${part.name}" needs UVs for its texture`);
      const uvArr = new Float32Array(mesh.uv.flat());
      attributes.TEXCOORD_0 = addAccessor({ bufferView: addTyped(uvArr, GL.ARRAY_BUFFER), byteOffset: 0,
        componentType: GL.FLOAT, count: mesh.uv.length, type: 'VEC2' });
    }
    const indices = addAccessor({ bufferView: addTyped(idxArr, GL.ELEMENT_ARRAY_BUFFER), byteOffset: 0,
      componentType: GL.UNSIGNED_INT, count: mesh.idx.length, type: 'SCALAR' });

    const pbr = {
      baseColorFactor: material.color,
      metallicFactor: material.metallic ?? 0,
      roughnessFactor: material.roughness ?? 0.7,
    };
    if (textured) pbr.baseColorTexture = { index: textureFor(material.texture.path) };
    materials.push({ name: material.name || part.name, pbrMetallicRoughness: pbr, ...(material.alphaMode === 'blend' && { alphaMode: 'BLEND' }) });
    primitives.push({ attributes, indices, material: matIndex });
  });

  const json = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  if (imageEntries.length) {
    json.images = imageEntries;
    json.samplers = [sampler];
    json.textures = imageEntries.map((_, i) => ({ source: i, sampler: 0 }));
  }

  const bin = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) {
    bin.set(c, o);
    o += c.byteLength;
  }
  return { json, bin };
}

/** glTF as text: the JSON with the binary data embedded as a data URI. */
export function toGltfText({ json, bin }) {
  return JSON.stringify({ ...json, buffers: [{ byteLength: bin.byteLength, uri: 'data:application/octet-stream;base64,' + uint8ToBase64(bin) }] }, null, 2);
}

/** Binary glTF (.glb): a 12-byte header, a JSON chunk and a BIN chunk, each padded to 4 bytes. */
export function toGlb({ json, bin }) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify({ ...json, buffers: [{ byteLength: bin.byteLength }] }));
  const jsonPadded = jsonBytes.byteLength + pad4(jsonBytes.byteLength);
  const binPadded = bin.byteLength + pad4(bin.byteLength);
  const total = 12 + 8 + jsonPadded + 8 + binPadded;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded); // JSON padding is spaces
  const binStart = 20 + jsonPadded;
  view.setUint32(binStart, binPadded, true);
  view.setUint32(binStart + 4, CHUNK_BIN, true);
  out.set(bin, binStart + 8);
  return out;
}

/** Builds glTF text (see buildGltfParts for the parts). */
export function buildGltf(parts, opts = {}) {
  return toGltfText(buildGltfParts(parts, opts));
}

/** Builds a binary .glb (see buildGltfParts for the parts). */
export function buildGlb(parts, opts = {}) {
  return toGlb(buildGltfParts(parts, opts));
}
