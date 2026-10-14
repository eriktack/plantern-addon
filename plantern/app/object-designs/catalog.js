// catalog.js
// The catalog page: lists models/, builds the form from each model's meta, previews the result
// (textures included) and downloads the glTF or GLB. Only wiring: the geometry, parameters and glTF come from lib/.
// The preview is built from the same meshes that go into the file, through the same axis mapping.
// Each field is checked as it changes and shows its own message; the preview waits for a short pause
// and builds only what it shows. glTF and GLB are built when the person downloads (docs/plans/object-catalog-ux.md).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildModel } from './lib/build.js';
import { toGltfPoint, toGltfNormal } from './lib/gltf-lib.js';
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
$('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2026);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(3, 5, 4);
scene.add(sun);
const grid = new THREE.GridHelper(4, 40, 0x3a404b, 0x2a2f38);
scene.add(grid);

let shown = null;

// Renders on demand only: after a change, a camera move or a resize (the damping of the orbit
// controls keeps it going while the camera is still moving). Never in a loop.
let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    controls.update();
    renderer.render(scene, camera);
  });
}
controls.addEventListener('change', requestRender);

function resize() {
  const w = $('view').clientWidth, h = $('view').clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}
window.addEventListener('resize', resize);
resize();

// Textures as three.js textures, made once per file. glTF UVs start at the image's top left, so
// flipY is off, as three's own glTF loader does.
const textureCache = new Map();
function threeTexture(path) {
  if (!textureCache.has(path)) {
    const { bytes, mime } = textures.get(path);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const tex = new THREE.TextureLoader().load(url, () => { URL.revokeObjectURL(url); requestRender(); });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.flipY = false;
    textureCache.set(path, tex);
  }
  return textureCache.get(path);
}

// Puts the built parts into the scene, in metres, y up, and frames the camera on them.
function showParts(parts) {
  if (shown) {
    scene.remove(shown);
    shown.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }
  shown = new THREE.Group();
  for (const part of parts) {
    const { mesh, material } = part;
    const pos = [], nrm = [], uv = [];
    for (const k of mesh.idx) {
      pos.push(...toGltfPoint(mesh.pos[k]));
      nrm.push(...toGltfNormal(mesh.nrm[k]));
      if (mesh.uv) uv.push(...mesh.uv[k]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    if (mesh.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(material.color[0], material.color[1], material.color[2], THREE.LinearSRGBColorSpace),
      roughness: material.roughness ?? 0.7,
      metalness: material.metallic ?? 0,
      ...(material.texture && { map: threeTexture(material.texture.path) }),
    });
    shown.add(new THREE.Mesh(geo, mat));
  }
  scene.add(shown);

  const box = new THREE.Box3().setFromObject(shown);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size * 0.8, size * 0.6, size * 0.9));
  controls.update();
  requestRender();
}

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
}

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
