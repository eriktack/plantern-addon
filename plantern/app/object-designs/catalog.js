// catalog.js
// The catalog page: lists models/, builds the form from each model's meta, previews the result
// (textures included) and downloads the glTF or GLB. Only wiring: the geometry, parameters and glTF come from lib/.
// The preview is built from the same meshes that go into the file, through the same axis mapping.
// Each field is checked as it changes and shows its own message; the preview waits for a short pause
// and builds only what it shows. glTF and GLB are built when the person downloads (docs/archive/2026-10-14-object-catalog-ux.md).

import { createPreview } from './preview.js';
import { buildModel } from './lib/build.js';
import { resolveParams } from './lib/params.js';
import { resolvePartMaterials } from './lib/materials.js';
import { geomToMesh, addPlanarUvs, triangleCount } from './lib/geom.js';
import { createParamForm } from '../src/param-form.js';
import { wirePanelResize } from '../src/panel-resize.js';
import { openHouseContext, wireHousePanel } from './house-context.js';

const $ = id => document.getElementById(id);


/* ---------- 1. Find the models and the material library ---------- */

// Reads models/index.json, written by tools/index-models.js (the main server does not list folders).
async function listModels() {
  const res = await fetch('models/index.json');
  if (!res.ok) throw new Error('Cannot read models/index.json. Run: node object-designs/tools/index-models.js');
  const { models: files } = await res.json();

  const models = [];
  for (const file of files) {
    try {
      const mod = await import(`./models/${file}`);
      if (mod.meta && typeof mod.build === 'function') models.push({ file, mod });
      else console.warn(`${file} skipped: must export meta and build`);
    } catch (e) {
      console.error(`${file} failed to load:`, e);
    }
  }
  return models.sort((a, b) => a.mod.meta.name.localeCompare(b.mod.meta.name));
}

async function loadLibrary() {
  const res = await fetch('materials/library.json');
  if (!res.ok) throw new Error('Cannot read materials/library.json.');
  return res.json();
}

/* ---------- 2. The 3D preview ---------- */

// The 3D preview (preview.js, shared with the validator).
const preview = createPreview($('view'), () => textures);
const showParts = parts => preview.show(parts);
const resize = () => preview.resize();

/* ---------- 3. The model, its materials and the form ---------- */

let models = [];
let current = null;
const library = {};         // the materials library, filled in at startup (the form reads it when a model is shown)
let textures = new Map();   // path -> { bytes, mime }, for every texture the library names
let meshCache = null;       // { key, meshes } for the current model's shape
let lastInfo = '';

// The form is built from the model's meta by src/param-form.js (shared with the Objects page); it calls refresh() a short
// pause after the last change, and only when every field is valid.
const form = createParamForm({ container: $('form'), summary: $('summary'), library, onValid: () => refresh() });

// The library a model builds with: the shared one, and a house blueprint's own colours (meta.materials; never stored in the house's model).
const libraryOf = mod => ({ ...library, ...(mod.meta.materials || {}) });

// Reads the texture files the library names (textures/ next to this page). A file that is not there
// is left out; buildModel then says which texture a model needs.
async function loadTextures() {
  for (const entry of Object.values(library)) {
    const path = entry?.texture;
    if (!path || textures.has(path)) continue;
    const res = await fetch(path);
    if (res.ok) {
      const mime = /.png$/i.test(path) ? 'image/png' : 'image/jpeg';
      textures.set(path, { bytes: new Uint8Array(await res.arrayBuffer()), mime });
    }
  }
}

// Builds only what the preview shows: the same parameters and meshes as buildModel, without the
// glTF text and the GLB (only a download needs them). The shape's meshes are kept while only a
// material changes.
function buildPreview(model, input) {
  const params = resolveParams(model.meta, input);
  const materials = resolvePartMaterials(model.meta, params, libraryOf(model));
  const shape = {};
  for (const d of model.meta.params) if (d.type !== 'material') shape[d.key] = params[d.key];
  const key = JSON.stringify([model.meta.id, shape]);
  if (!meshCache || meshCache.key !== key) {
    const geoms = model.build(params);
    meshCache = {
      key,
      meshes: model.meta.parts.map(part => {
        if (!(part.key in geoms)) throw new Error(`build() returned no geometry for part "${part.key}"`);
        return geomToMesh(geoms[part.key]);
      }),
    };
  }
  return model.meta.parts.map((part, i) => {
    const material = materials[part.key];
    let mesh = meshCache.meshes[i];
    if (material.texture) {
      const path = material.texture.path;
      if (!textures.has(path)) throw new Error(`Texture file "${path}" is not loaded (it must be in textures/)`);
      mesh = addPlanarUvs(mesh, material.texture.uvScale);
    }
    return { label: part.label, mesh, material, triangles: triangleCount(mesh), name: material.name };
  });
}

// Previews the form as it is now. Called after a short pause, and only when every field is valid.
function refresh() {
  if (!current) return;
  try {
    const parts = buildPreview(current.mod, form.read());
    form.setBuildError(null);
    showParts(parts.map(p => ({ mesh: p.mesh, material: p.material })));
    lastInfo = parts.map(p => `${p.label}: ${p.triangles} triangles, ${p.name}`).join('<br>');
    $('info').innerHTML = lastInfo;
  } catch (e) {
    form.setBuildError(e.message);
  }
}

// values: { params, partMaterials } of an object already placed, else the form starts at the defaults
function selectModel(index, values) {
  current = models[index];
  meshCache = null;
  $('desc').textContent = current.mod.meta.description || '';
  form.show(current.mod.meta, values);
  for (const f of onSelect) f(current.mod.meta, !!values);
}
const onSelect = [];       // the house panel follows the picked blueprint (where it starts: house-context.js)

/* ---------- 4. Download ---------- */

function download(data, type, fileName) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The glTF and the GLB are built here, from the form as it is now (buildModel, the same as the file).
function downloadAs(kind) {
  if (!current) return;
  try {
    const built = buildModel(current.mod, form.read(), libraryOf(current.mod), { textures });
    form.setBuildError(null);
    if (kind === 'gltf') download(built.gltf, 'model/gltf+json', `${current.mod.meta.id}.gltf`);
    else download(built.glb, 'model/gltf-binary', `${current.mod.meta.id}.glb`);
  } catch (e) {
    form.setBuildError(e.message);
  }
}

$('download').addEventListener('click', () => downloadAs('gltf'));
$('downloadGlb').addEventListener('click', () => downloadAs('glb'));

/* ---------- 5. Startup ---------- */

wirePanelResize($('resizer'), document.querySelector('aside'), 'plantern.objects.aside', resize);
$('picker').addEventListener('change', e => selectModel(e.target.selectedIndex));

try {
  Object.assign(library, await loadLibrary());
  await loadTextures();
  models = await listModels();
  // with Plantern's server and a house: the house's own blueprints too, and the house panel (house-context.js)
  const house = await openHouseContext();
  if (house) models = [...models, ...house.houseModels].sort((a, b) => a.mod.meta.name.localeCompare(b.mod.meta.name));
  if (models.length === 0) {
    form.setBuildError('No models found in models/. Copy _template.js to a new file to start.');
  } else {
    for (const m of models) {
      const opt = document.createElement('option');
      opt.textContent = m.source === 'house' ? `${m.mod.meta.name} · this house` : m.mod.meta.name;
      $('picker').append(opt);
    }
    selectModel(0);
  }
  if (house) {
    wireHousePanel(house, {
      form,
      current: () => current,
      // f(meta, placed) after every pick, and once now for the blueprint shown
      onSelect(f) { onSelect.push(f); if (current) f(current.mod.meta, false); },
      // picks a blueprint by id and fills its form with the values of a placed object; false when there is no such blueprint
      show(id, values) {
        const i = models.findIndex(m => m.mod.meta.id === id);
        if (i < 0) return false;
        $('picker').selectedIndex = i;
        $('picker').disabled = true;
        selectModel(i, values);
        return true;
      },
    });
  }
} catch (e) {
  form.setBuildError(e.message);
}
