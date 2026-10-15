// preview.js
// The 3D preview of a built model, shared by the catalog and the validator. The parts come from buildModel(): they are
// drawn in metres, y up, with the camera framed on them. Renders on demand only (after a change, a camera move or a resize),
// never in a loop.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toGltfPoint, toGltfNormal } from './lib/gltf-lib.js';

// mm: where a wall-mounted model's bottom sits when its placement gives no z (a wall item's default mounting height)
const DEFAULT_WALL_HEIGHT = 1400;

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
  // the floor grid: at the model's bottom, or for a ceiling-mounted model at floor level (see show())
  const grid = new THREE.GridHelper(4, 40, 0x3a404b, 0x2a2f38);
  scene.add(grid);

  let shown = null;
  let framedKey = null;   // the key the camera was last framed for (see show())
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

  // The wall or ceiling the object is mounted on (its placement, lib/params.js placementOf): drawn faintly, so the place
  // is clear. A wall stands behind the object (at its largest y, the back) and is 2400 mm high; a ceiling lies at the
  // object's top. Plan mm in, converted like the object's own points.
  function addSurface(group, parts, mount) {
    const pts = parts.flatMap(p => p.mesh.pos);
    if (pts.length === 0) return;
    const lo = [0, 1, 2].map(k => Math.min(...pts.map(v => v[k])));
    const hi = [0, 1, 2].map(k => Math.max(...pts.map(v => v[k])));
    const margin = 600;
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
    const faint = () => new THREE.MeshStandardMaterial({
      color: 0xc9ced8, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false,
    });
    const place = (geo, at) => {
      const mesh = new THREE.Mesh(geo, faint());
      mesh.position.set(...toGltfPoint(at));
      group.add(mesh);
    };
    if (mount.mount === 'wall') {
      const wallHeight = 2400;
      place(new THREE.PlaneGeometry((hi[0] - lo[0] + 2 * margin) * 0.001, wallHeight * 0.001), [cx, hi[1], wallHeight / 2]);
    } else if (mount.mount === 'ceiling') {
      // a ceiling-mounted model hangs in a corner of a room: two walls (the far ones) hang down from its ceiling, 2400 mm
      // high, as the reference. No ceiling plane: it would hide the model from above.
      const roomHeight = 2400;
      const x0 = lo[0] - margin, x1 = hi[0] + margin, y0 = lo[1] - margin, y1 = hi[1] + margin;
      place(new THREE.PlaneGeometry((x1 - x0) * 0.001, roomHeight * 0.001), [(x0 + x1) / 2, y1, hi[2] - roomHeight / 2]);
      const east = new THREE.PlaneGeometry((y1 - y0) * 0.001, roomHeight * 0.001);
      east.rotateY(Math.PI / 2);
      place(east, [x1, (y0 + y1) / 2, hi[2] - roomHeight / 2]);
      return (hi[2] - roomHeight) * 0.001;   // the floor of that room, in metres (y up)
    }
    return null;
  }

  // mount: the placement of the model ({ mount: 'floor' | 'wall' | 'ceiling' }), for a surface the object hangs from.
  function show(parts, { mount = null, view = null, frameKey = undefined } = {}) {
    clear();
    shown = new THREE.Group();
    const objects = new THREE.Group();
    shown.add(objects);
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
      objects.add(new THREE.Mesh(geo, mat));
    }
    // a ceiling-mounted model is shown in its room, so the grid is the room's floor; otherwise it is the model's bottom
    const floorY = mount ? addSurface(shown, parts, mount) : null;
    grid.position.y = floorY ?? 0;
    // a wall-mounted model is lifted to its wall height: its bottom at `z` above the floor (the placement's z), or the
    // default wall height when the placement gives none. The wall and the floor stay where they are.
    if (mount?.mount === 'wall') objects.position.y = (typeof mount.z === 'number' ? mount.z : DEFAULT_WALL_HEIGHT) * 0.001;
    scene.add(shown);

    // The camera frames the object only when the model or its variant changes (frameKey), so that changing a value
    // resizes the object in place instead of moving the view. Without a frameKey it is framed every time.
    if (frameKey === undefined || frameKey !== framedKey) {
      framedKey = frameKey;
      const box = new THREE.Box3().setFromObject(objects);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      controls.target.copy(center);
      // a model that asks for its front (meta.frontView) starts straight on: the front is -y in plan, which is +z in the preview
      const offset = view === 'front' ? new THREE.Vector3(0, size * 0.5, size * 1.0) : new THREE.Vector3(size * 0.8, size * 0.6, size * 0.9);
      camera.position.copy(center).add(offset);
      controls.update();
    }
    requestRender();
  }

  return { show, clear, resize };
}
