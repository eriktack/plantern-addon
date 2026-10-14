// preview.js
// The 3D preview of a built model, shared by the catalog and the validator. The parts come from buildModel(): they are
// drawn in metres, y up, with the camera framed on them. Renders on demand only (after a change, a camera move or a resize),
// never in a loop.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toGltfPoint, toGltfNormal } from './lib/gltf-lib.js';

/**
 * container: the element the preview fills. getTextures(): the Map of texture path to { bytes, mime } the library names.
 * Returns { show(parts), clear(), resize() }; show takes the parts of buildModel() as { mesh, material }.
 */
export function createPreview(container, getTextures = () => new Map()) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2026);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  scene.add(new THREE.GridHelper(4, 40, 0x3a404b, 0x2a2f38));

  let shown = null;
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
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  window.addEventListener('resize', resize);
  resize();

  // Textures as three.js textures, made once per file. glTF UVs start at the image's top left, so flipY is off.
  const textureCache = new Map();
  function threeTexture(path) {
    if (!textureCache.has(path)) {
      const { bytes, mime } = getTextures().get(path);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const tex = new THREE.TextureLoader().load(url, () => { URL.revokeObjectURL(url); requestRender(); });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.flipY = false;
      textureCache.set(path, tex);
    }
    return textureCache.get(path);
  }

  function clear() {
    if (!shown) return;
    scene.remove(shown);
    shown.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    shown = null;
    requestRender();
  }

  function show(parts) {
    clear();
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

  return { show, clear, resize };
}
