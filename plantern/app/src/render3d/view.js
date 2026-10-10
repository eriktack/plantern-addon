import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { levelPrisms } from '../geometry/prisms.js';
import { MM, toThree, dirToThree, prismGeometry, cylinderGeometry } from './coords.js';
import { pointAlong, polylineLength } from '../geometry/strip.js';
import { pickShadowLamps, SHADOW_COUNT } from '../model/shadows.js';

/**
 * three.js view of one level. Geometry comes only from levelPrisms() (pure, tested);
 * this module only turns prisms into meshes and fixtures into lights.
 * Renders on demand (camera change, HA state change), never in a continuous loop.
 * hooks: { onFixtureClick(fx) }
 */
export function createView3d(container, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xdde6ff, 0x3a3226, 0.3);
  const sun = new THREE.DirectionalLight(0xfff4e0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(hemi, sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const root = new THREE.Group();   // everything generated from the model (this is what GLB export writes)
  root.name = 'plantern';
  scene.add(root);

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500);
  const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  let camera = ortho, controls = null, bounds = new THREE.Box3(), daylight = false, fixtures = new Map(), pickables = [];
  let settings = {};
  let transparent = false;   // setBackground: nothing behind the house (the page shows through), only its shadows on the ground
  let shadowBudget = SHADOW_COUNT.average;   // lamps that may cast shadows (setShadows)

  const render = () => renderer.render(scene, camera);
  function makeControls() {
    controls?.dispose();
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;   // stay above ground
    controls.addEventListener('change', render);
    controls.addEventListener('end', () => hooks.onView?.(getCamera()));   // after a drag or zoom: the page may keep it
  }

  /** Where the camera is: { projection, position, target, zoom } (three.js metres), to be kept and restored. */
  function getCamera() {
    const r = v => v.toArray().map(x => Math.round(x * 1000) / 1000);
    return { projection: camera === persp ? 'persp' : 'ortho', position: r(camera.position), target: r(controls.target), zoom: Math.round(camera.zoom * 1000) / 1000 };
  }

  /** Put the camera back where getCamera() found it (anything missing keeps the framed default). */
  function setCamera(c) {
    if (!c) return;
    if (c.projection) setProjection(c.projection);
    if (Array.isArray(c.position)) camera.position.fromArray(c.position);
    if (Array.isArray(c.target)) controls.target.fromArray(c.target);
    if (c.zoom > 0) { camera.zoom = c.zoom; camera.updateProjectionMatrix(); }
    controls.update();
    render();
  }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1, aspect = w / h;
    renderer.setSize(w, h, false);
    persp.aspect = aspect;
    persp.updateProjectionMatrix();
    const size = ortho.userData.size || 10;
    Object.assign(ortho, { left: -size * aspect / 2, right: size * aspect / 2, top: size / 2, bottom: -size / 2 });
    ortho.updateProjectionMatrix();
    render();
  }
  new ResizeObserver(resize).observe(container);

  /** Isometric-ish view from the south-east, framing the whole model. */
  function resetView() {
    const c = bounds.getCenter(new THREE.Vector3()), s = bounds.getSize(new THREE.Vector3());
    const span = Math.max(s.x, s.z, 4) + Math.max(0, s.y - 3) * 1.1, dir = new THREE.Vector3(0.75, 1.05, 0.95).normalize();
    ortho.userData.size = span * 1.05;
    ortho.position.copy(c).addScaledVector(dir, span * 3);
    persp.position.copy(c).addScaledVector(dir, span * 1.6);
    for (const cam of [ortho, persp]) { cam.lookAt(c); cam.zoom = 1; cam.updateProjectionMatrix(); }
    makeControls();
    controls.target.copy(c);
    controls.update();
    resize();
  }

  function material(p) {
    const opts = { color: p.sides ? 0xffffff : new THREE.Color(p.color), roughness: p.kind === 'glass' ? 0.1 : 0.85, metalness: 0, vertexColors: !!p.sides };
    if (p.opacity != null && p.opacity < 1) Object.assign(opts, { transparent: true, opacity: p.opacity, depthWrite: false });
    return new THREE.MeshStandardMaterial(opts);
  }

  const SIDE_DOT = 0.9;   // how squarely a face must point along the wall's normal to count as a side

  /** Colour each triangle by which wall face it belongs to (left / right / top and ends). */
  function paintSides(geo, sides) {
    const n = new THREE.Vector3(...dirToThree(sides.n)), nrm = geo.attributes.normal, cols = new Float32Array(nrm.count * 3);
    const cL = new THREE.Color(sides.left), cR = new THREE.Color(sides.right), cO = new THREE.Color(sides.other), v = new THREE.Vector3();
    for (let i = 0; i < nrm.count; i++) {
      // a side face points straight out (±n); a mitred end points at most 45° sideways, so it stays an end
      const d = v.fromBufferAttribute(nrm, i).dot(n), c = d > SIDE_DOT ? cL : d < -SIDE_DOT ? cR : cO;
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }

  // ---- textures (wall sides with a material that has an image) ----
  const textures = new Map();
  function texture(url) {
    if (!textures.has(url)) {
      const t = new THREE.TextureLoader().load(url, () => render(), undefined, () => console.warn(`texture ${url} could not be loaded; the material's colour is used`));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      textures.set(url, t);
    }
    return textures.get(url);
  }

  /**
   * A wall prism whose side(s) carry a texture: the triangles are regrouped by face (top and ends,
   * left, right) so each textured face gets its own material, with UVs running along the wall and up
   * it in repeats of the material's uvScale (mm).
   */
  function texturedWall(geom, p, baseUrl, base) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const pos = g.attributes.position, nrm = g.attributes.normal, col = g.attributes.color;
    const n = new THREE.Vector3(...dirToThree(p.sides.n)), u = new THREE.Vector3(...dirToThree(p.sides.u)), v = new THREE.Vector3();
    const groups = [[], [], []];                                     // top and ends, left, right
    for (let t = 0; t < pos.count / 3; t++) { const d = v.fromBufferAttribute(nrm, t * 3).dot(n); groups[d > SIDE_DOT ? 1 : d < -SIDE_DOT ? 2 : 0].push(t); }
    const order = groups.flat(), out = new THREE.BufferGeometry();
    const copy = (attr, size) => { const a = new Float32Array(order.length * 3 * size); order.forEach((t, k) => { for (let i = 0; i < 3 * size; i++) a[k * 3 * size + i] = attr.array[t * 3 * size + i]; }); return new THREE.BufferAttribute(a, size); };
    out.setAttribute('position', copy(pos, 3)); out.setAttribute('normal', copy(nrm, 3)); if (col) out.setAttribute('color', copy(col, 3));
    const uv = new Float32Array(order.length * 3 * 2), P = out.attributes.position;
    order.forEach((t, k) => {
      const side = k < groups[0].length ? null : k < groups[0].length + groups[1].length ? 'left' : 'right';
      const scale = (p.sides.tex?.[side]?.uvScale || 1000) * MM;
      for (let i = 0; i < 3; i++) {
        const j = k * 3 + i; v.fromBufferAttribute(P, j);
        uv[j * 2] = (v.x * u.x + v.z * u.z) / scale; uv[j * 2 + 1] = v.y / scale;
      }
    });
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    let at = 0;
    groups.forEach((gr, i) => { out.addGroup(at, gr.length * 3, i); at += gr.length * 3; });
    const face = side => {
      const t = p.sides.tex?.[side];
      return t ? new THREE.MeshStandardMaterial({ map: texture(baseUrl + t.texture), roughness: 0.85, metalness: 0 }) : base;
    };
    return { geometry: out, materials: [base, face('left'), face('right')] };
  }

  function clear() {
    root.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => m.dispose()); });
    root.clear();
    fixtures.clear();
    pickables = [];
  }

  /**
   * Build one level (level + geo = buildLevelGeometry) or several: `levels` = [{ level, geo, lift, shift }] (lift in mm moves
   * a level up, shift [dx, dy] sideways in the plan, for the exploded view). Lamps and switches of every shown level are live; the number of lamps casting
   * shadows is shared between them.
   */
  function build({ level, geo, levels, settings: s, fixtureLabel = fx => fx.id, materials = {}, baseUrl = '', ceilings = false }) {
    clear();
    settings = s;
    const shown = levels ?? (level ? [{ level, geo, lift: 0 }] : []);
    if (!shown.length) { bounds.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 1, 2)); resetView(); return; }
    for (const sh of shown) buildLevel(sh.level, sh.geo, sh.lift || 0, sh.shift || [0, 0]);
    finishBuild();

    function buildLevel(level, geo, lift, shift) {
    const g = new THREE.Group();
    g.name = level.id;
    g.position.y = ((level.elevation || 0) + lift) * MM;
    g.position.x = shift[0] * MM; g.position.z = -shift[1] * MM;      // plan (x, y) → three (x, -y)
    root.add(g);

    for (const p of levelPrisms(level, geo, materials, { ceilings })) {
      let geom = p.circle ? cylinderGeometry(THREE, p.circle.center, p.circle.diameter / 2, p.z0, p.z1) : prismGeometry(THREE, p.poly, p.z0, p.z1, p.slope, p.holes), mat;
      if (p.sides) paintSides(geom, p.sides);
      mat = material(p);
      if (p.sides?.tex) ({ geometry: geom, materials: mat } = texturedWall(geom, p, baseUrl, mat));
      const m = new THREE.Mesh(geom, mat);
      m.name = `${p.id}:${p.kind}`;
      m.userData = { id: p.id, kind: p.kind };
      m.castShadow = !['glass', 'railing', 'floor'].includes(p.kind);
      m.receiveShadow = p.kind !== 'glass';
      g.add(m);
    }

    for (const fx of level.fixtures || []) {
      const pos = geo.fixturePos(fx);
      if (!pos) continue;
      if (fx.kind === 'strip') { addStrip(fx, geo, level, g, fixtureLabel); continue; }
      const at = new THREE.Vector3(...toThree(pos, fx.z ?? (fx.kind === 'lamp' ? level.ceilingHeight - 100 : 1100)));
      if (fx.kind === 'lamp') {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000 }));
        bulb.position.copy(at);
        bulb.name = fx.id;
        bulb.userData = { fixture: fx, label: fixtureLabel(fx) };
        const light = new THREE.PointLight(0xffffff, 0, (fx.radius || 3000) * MM * 1.8, 2);
        light.position.copy(at);
        light.name = `${fx.id}:light`;
        // whether it casts a shadow is decided by assignShadows(): lamps that are on, brightest first, up to the budget
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.002;
        light.shadow.camera.near = 0.05;
        g.add(bulb, light);
        pickables.push(bulb);
        fixtures.set(fx.id, { kind: 'lamp', bulb, light });
      } else {
        const a = fx.attach && geo.resolveAttach(fx.attach);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
        box.position.copy(at);
        if (a) box.lookAt(at.clone().add(new THREE.Vector3(...dirToThree(a.dir))));
        box.name = fx.id;
        box.userData = { fixture: fx, label: fixtureLabel(fx) };
        g.add(box);
        pickables.push(box);
        fixtures.set(fx.id, { kind: 'switch', box });
      }
    }
    }

    /**
   * An LED strip (decision 121): thin emissive segments along its line, and three real lights (its two ends and its middle),
   * so the room is lit along it without one light per few centimetres. Strips never cast shadows.
   */
  function addStrip(fx, geo, level, g, fixtureLabel) {
    let line = geo.fixtureLine(fx);
    if (!line) return;
    // just off the wall face (a strip on a wall or along a window); one on an object follows the object's edge as it is
    const face = fx.attach?.wall !== undefined ? fx.attach : fx.attach?.opening !== undefined ? { wall: geo.level.openings?.find(o => o.id === fx.attach.opening)?.wall, side: fx.attach.side, offset: 0 } : null;
    const a = face?.wall && geo.resolveAttach(face);
    if (a) line = line.map(p => [p[0] + a.dir[0] * 12, p[1] + a.dir[1] * 12]);
    const z = geo.fixtureZ(fx) ?? 1400, meshes = [], halos = [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!(len > 0)) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(len * MM, 0.02, 0.02), new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000 }));
      m.position.set(...toThree([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], z));
      m.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
      m.name = fx.id;
      m.userData = { fixture: fx, label: fixtureLabel(fx) };
      // a soft halo round it (the look of a diffuser): wider, additive, only visible when the strip is on
      const h = new THREE.Mesh(new THREE.BoxGeometry(len * MM, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      h.position.copy(m.position); h.rotation.y = m.rotation.y; h.raycast = () => {};
      g.add(m, h); pickables.push(m); meshes.push(m); halos.push(h);
    }
    const lights = [0, 0.5, 1].map(t => {
      const L = new THREE.PointLight(0xffffff, 0, (fx.radius || 1200) * MM * 1.8, 2);
      L.position.set(...toThree(pointAlong(line, polylineLength(line) * t), z));
      L.name = `${fx.id}:light`;
      g.add(L);
      return L;
    });
    fixtures.set(fx.id, { kind: 'strip', meshes, halos, lights });
  }

  function finishBuild() {
    bounds = new THREE.Box3().setFromObject(root);
    ground.position.y = bounds.min.y - 0.002;
    const c = bounds.getCenter(new THREE.Vector3()), r = bounds.getSize(new THREE.Vector3()).length() / 2 + 1;
    sun.position.copy(c).add(new THREE.Vector3(-0.6, 1.2, 0.8).normalize().multiplyScalar(r * 2));
    sun.target.position.copy(c);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.1, far: r * 4 });
    sun.shadow.camera.updateProjectionMatrix();
    assignShadows();
    resetView();
    }
  }

  /** How many lamps may cast shadows (shadows.js); the lit ones get them, brightest first. */
  function setShadows(count) { shadowBudget = count; assignShadows(); render(); }
  function assignShadows() {
    const lamps = [...fixtures].filter(([, f]) => f.kind === 'lamp').map(([id, f]) => ({ id, f, on: !!f.state?.on, brightness: f.state?.brightness ?? 1 }));
    const chosen = pickShadowLamps(lamps, shadowBudget);
    for (const l of lamps) if (l.f.light.castShadow !== chosen.has(l.id)) l.f.light.castShadow = chosen.has(l.id);   // changes only: each one rebuilds shaders
  }

  /** a = appearance(state): { available, on, brightness 0..1, rgb } */
  function setFixture(id, a) {
    const f = fixtures.get(id);
    if (!f) return;
    f.state = a;
    const col = new THREE.Color(`rgb(${a.rgb.join(',')})`);
    if (f.kind === 'strip') {
      for (const L of f.lights) { L.visible = a.on; L.color.copy(col); L.intensity = (settings.render3d?.lampIntensity ?? 80) * a.brightness * 0.5; }
      for (const m of f.meshes) {
        m.material.color.set(a.available ? (a.on ? col : 0x555555) : 0x7a2a2a);
        m.material.emissive.copy(a.on ? col : new THREE.Color(0));
        m.material.emissiveIntensity = a.on ? 2 : 0;
      }
      for (const h of f.halos) { h.material.color.copy(col); h.material.opacity = a.on ? 0.25 * a.brightness : 0; }
    } else if (f.kind === 'lamp') {
      f.light.visible = a.on;
      f.light.color.copy(col);
      f.light.intensity = (settings.render3d?.lampIntensity ?? 80) * a.brightness;
      f.bulb.material.color.set(a.available ? (a.on ? col : 0x555555) : 0x7a2a2a);
      f.bulb.material.emissive.copy(a.on ? col : new THREE.Color(0));
      f.bulb.material.emissiveIntensity = a.on ? 2 : 0;
      assignShadows();
    } else {
      f.box.material.color.set(!a.available ? 0x7a2a2a : a.on ? col : 0x666666);
      f.box.material.emissive.copy(a.on ? col : new THREE.Color(0));
      f.box.material.emissiveIntensity = a.on ? 0.6 : 0;
    }
    render();
  }

  function setDaylight(on) {
    daylight = on;
    hemi.intensity = on ? 1.1 : 0.3;
    sun.intensity = on ? 2.2 : 0;
    scene.background = transparent ? null : new THREE.Color(on ? 0xb9cde0 : 0x14161a);
    render();
    return daylight;
  }

  /** 'dark' (the default: sky or night behind, a dark ground) or 'transparent' (the page behind shows through; the ground only catches shadows). */
  function setBackground(kind) {
    transparent = kind === 'transparent';
    ground.material = transparent ? new THREE.ShadowMaterial({ opacity: 0.3 }) : new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 1 });
    renderer.setClearAlpha(transparent ? 0 : 1);
    return setDaylight(daylight);
  }

  function setProjection(kind) {
    camera = kind === 'persp' ? persp : ortho;
    makeControls();
    controls.target.copy(bounds.getCenter(new THREE.Vector3()));
    controls.update();
    resize();
    return kind;
  }

  // Click (not drag) on a bulb or switch → hooks.onFixtureClick
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) hooks.onFixtureClick?.(hit.object.userData.fixture);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    renderer.domElement.style.cursor = hit ? 'pointer' : '';
    renderer.domElement.title = hit ? hit.object.userData.label : '';
  });

  setDaylight(false);
  return { build, setFixture, setShadows, setDaylight, setBackground, setProjection, resetView, getCamera, setCamera, render, root, isDaylight: () => daylight };
}
