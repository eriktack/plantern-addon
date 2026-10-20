import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { levelPrisms } from '../geometry/prisms.js';
import { MM, toThree, dirToThree, prismGeometry, cylinderGeometry, barGeometry, ballGeometry } from './coords.js';
import { pointAlong, polylineLength } from '../geometry/strip.js';
import { pickShadowLamps, SHADOW_COUNT } from '../model/shadows.js';
import { lampReach } from '../geometry/leak.js';

/** The faint ball round a lit object's light, clicked with the object (m, and its opacity off / on). */
const LIT_HALO_RADIUS = 0.16, LIT_HALO_OFF = 0.1, LIT_HALO_ON = 0.2;
import { installLampMask, setLampMasks, packMasks, decayFor, MAX_MASKS } from './lamp-mask.js';
import { DEFAULT_NIGHT_LIGHT } from '../model/night.js';
import { assetPlacement } from '../model/assets.js';
import { textureUrl } from '../model/materials.js';

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
  sun.shadow.autoUpdate = false;                  // drawn when something changed (flushShadows), not on every frame
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
  const leakOf = new Map();                  // lamp id → mm² of its reach that walls hide (geometry/leak.js), set by build
  const maskInput = [];                      // the lamps a mask is made for: { id, reach, group, level }, set by build (lamp-mask.js)
  const maskUniforms = installLampMask(THREE);   // null when this three.js is not the one the shader patch is for: the lights stay as they are
  let nightLight = DEFAULT_NIGHT_LIGHT;      // the ambient light with daylight off (setNightLight)
  let buildGen = 0;

  // Light counts stay the same whatever is on. Three compiles a shader for every material for every number of lights and of
  // shadow casters, so lamps that were switched off and on (visible = false / true) recompiled every shader the first time each new
  // count was reached: a stall on the first change, none on the second, and one that depended on which other lamps were on. A lamp that is
  // off now keeps its light in the scene at no intensity, and the lamps that cast shadows are chosen when the house is built, not by what is on.
  // Their shadow maps are then drawn when something changed (a lamp turned on, a model arrived), not on every frame. A house with
  // more lights than STEADY_LIGHTS_MAX (every light is in every shader, and the GPU has a limit) keeps the old way.
  const STEADY_LIGHTS_MAX = 40, SHADOWS_PER_FRAME = 6;
  let steadyLights = true;
  const shadowDirty = new Set();             // lamp ids whose shadow map is out of date
  let sunShadowDirty = true;
  const markShadowsDirty = id => { if (id === undefined) { for (const [k, f] of fixtures) if (f.kind === 'lamp') shadowDirty.add(k); sunShadowDirty = true; } else shadowDirty.add(id); };
  // the shadow maps that are out of date, for the lamps that are on and cast one: a few per frame, the rest on the next
  function flushShadows() {
    if (!steadyLights) return;
    let done = 0, waiting = false;
    for (const id of shadowDirty) {
      const f = fixtures.get(id);
      if (!f || !f.light.castShadow) { shadowDirty.delete(id); continue; }
      if (!f.state?.on) continue;                                        // an off lamp's map is made when it goes on
      if (done >= SHADOWS_PER_FRAME) { waiting = true; continue; }
      f.light.shadow.needsUpdate = true; shadowDirty.delete(id); done++;
    }
    if (sunShadowDirty) { sun.shadow.needsUpdate = true; sunShadowDirty = false; }
    if (waiting) renderSoon();
  }
  const render = () => { flushShadows(); renderer.render(scene, camera); };
  // a change of state (a lamp, the shadows, the light) asks for one frame, not one each: a loop that sets 30 lamps draws once.
  // A frame per lamp was the slow start of a house with many lights: each frame compiled the shaders for the lights on so far.
  let frameQueued = false;
  // models arrive one after another, each in a task of its own: one frame after the last of a quiet stretch, not a full render for each
  let frameWanted = false;
  const renderSoon = () => { if (frameWanted) return; frameWanted = true; requestAnimationFrame(() => { frameWanted = false; render(); }); };
  const requestRender = () => { if (frameQueued) return; frameQueued = true; queueMicrotask(() => { frameQueued = false; render(); }); };
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
      return t ? new THREE.MeshStandardMaterial({ map: texture(textureUrl(t.texture, baseUrl)), roughness: 0.85, metalness: 0 }) : base;
    };
    return { geometry: out, materials: [base, face('left'), face('right')] };
  }

  function clear() {
    root.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => m.dispose()); });
    root.clear();
    fixtures.clear();
    pickables = [];
    maskInput.length = 0;
  }

  /**
   * Build one level (level + geo = buildLevelGeometry) or several: `levels` = [{ level, geo, lift, shift }] (lift in mm moves
   * a level up, shift [dx, dy] sideways in the plan, for the exploded view). Lamps and switches of every shown level are live; the number of lamps casting
   * shadows is shared between them.
   */
  function build({ level, geo, levels, settings: s, fixtureLabel = fx => fx.id, materials = {}, baseUrl = '', ceilings = false, assets = null, doorStates = null }) {
    const gen = ++buildGen;     // asset models that finish loading after a newer build are dropped
    clear();
    settings = s;
    const shown = levels ?? (level ? [{ level, geo, lift: 0 }] : []);
    if (!shown.length) { bounds.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 1, 2)); resetView(); return; }
    for (const sh of shown) buildLevel(sh.level, sh.geo, sh.lift || 0, sh.shift || [0, 0]);
    finishBuild();

    // An asset object: its model replaces the object's box once loaded, at its footprint's centre and heading (the
    // model's own x axis is the object's width). A missing model leaves the box, in red with a red outline.
    function placeAsset(o, geo, g, box, lit) {
      const fp = geo.objectFootprint(o);
      if (!fp) return;
      const { centre, z, heading } = assetPlacement(o, fp, geo.objectZ(o));   // a hosted object has no z of its own: its opening gives the height
      const entry = assets.loadFor(o);
      entry.ready.then(() => {
        if (gen !== buildGen) return;
        if (entry.scene) {
          const m = entry.scene.clone(true);
          m.name = `${o.id}:asset`;
          m.userData = { id: o.id, kind: 'asset' };
          m.position.set(...toThree(centre, z));
          m.rotation.y = heading;
          m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
          g.add(m);
          if (box) box.visible = false;
          // a lit object is its lamp (lit.js): its model is what is clicked to switch the light, not a ball at the light
          if (lit) {
            if (box) { const k = pickables.indexOf(box); if (k >= 0) pickables.splice(k, 1); }
            m.traverse(c => { if (c.isMesh) { c.userData = { ...c.userData, fixture: lit, label: fixtureLabel(lit) }; pickables.push(c); } });
          }
        } else {
          if (box) box.material.color.set(0xb00020);
          const [w, d, h] = o.size;
          const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w * MM, h * MM, d * MM)), new THREE.LineBasicMaterial({ color: 0xff2a2a }));
          outline.name = `${o.id}:missing`;
          outline.position.set(...toThree(centre, z + h / 2));
          outline.rotation.y = heading;
          g.add(outline);
        }
        markShadowsDirty();
        renderSoon();
      });
    }

    function buildLevel(level, geo, lift, shift) {
    const g = new THREE.Group();
    g.name = level.id;
    g.position.y = ((level.elevation || 0) + lift) * MM;
    g.position.x = shift[0] * MM; g.position.z = -shift[1] * MM;      // plan (x, y) → three (x, -y)
    root.add(g);

    // the shadows go to the lamps whose light the walls would otherwise let through (a shadowless lamp lights through walls)
    for (const [id, reach] of lampReach(geo, (level.fixtures || []).filter(f => f.kind === 'lamp'), { cutPlane: settings?.cutPlane ?? 1200, doorStates })) {
      leakOf.set(id, reach.leak);
      maskInput.push({ id, reach, group: g, level });
    }

    const objectMeshes = new Map();
    for (const p of levelPrisms(level, geo, materials, { ceilings, doorStates })) {
      let geom = p.bar ? barGeometry(THREE, p.bar.a, p.bar.b, p.bar.diameter) : p.ball ? ballGeometry(THREE, p.ball.center, p.ball.diameter) : p.circle ? cylinderGeometry(THREE, p.circle.center, p.circle.diameter / 2, p.z0, p.z1) : prismGeometry(THREE, p.poly, p.z0, p.z1, p.slope, p.holes), mat;
      if (p.sides) paintSides(geom, p.sides);
      mat = material(p);
      if (p.sides?.tex) ({ geometry: geom, materials: mat } = texturedWall(geom, p, baseUrl, mat));
      const m = new THREE.Mesh(geom, mat);
      m.name = `${p.id}:${p.kind}`;
      m.userData = { id: p.id, kind: p.kind };
      m.castShadow = !['glass', 'railing', 'floor'].includes(p.kind);
      m.receiveShadow = p.kind !== 'glass';
      // a door's leaf gets a thin outline, amber when it is open and grey when closed (issue #29): the leaf stays see-through
      if (p.kind === 'leaf') m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: p.open ? 0xffb454 : 0xc9ced8, transparent: true, opacity: 0.85, depthWrite: false })));
      g.add(m);
      if (p.kind === 'object') objectMeshes.set(p.id, m);
    }
    if (assets) for (const o of level.objects || []) if (o.kind === 'asset') placeAsset(o, geo, g, objectMeshes.get(o.id), (level.fixtures || []).find(f => f.derived && f.id === o.id));


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
        // the light stops at the lamp's radius, as the plan's glow does (it used to reach 1.8 times as far, through walls)
        const light = new THREE.PointLight(0xffffff, 0, (fx.radius || 3000) * MM, 2);
        light.position.copy(at);
        light.name = `${fx.id}:light`;
        // whether it casts a shadow is decided by assignShadows(): lamps that are on, brightest first, up to the budget
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.002;
        light.shadow.camera.near = 0.05;
        g.add(bulb, light);
        const box = fx.derived ? objectMeshes.get(fx.id) : null;
        let halo = null;
        if (box) {
          // a lit object's lamp has no ball: the object is clicked (its box until its model has loaded, then the model)
          bulb.visible = false;
          box.userData = { ...box.userData, fixture: fx, label: fixtureLabel(fx) };
          pickables.push(box);
          // a small lamp is hard to hit from some sides: a faint ball round its light is clicked too (a little stronger while it is on)
          halo = new THREE.Mesh(new THREE.SphereGeometry(LIT_HALO_RADIUS, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd6aa, transparent: true, opacity: LIT_HALO_OFF, depthWrite: false }));
          halo.position.copy(at);
          halo.name = `${fx.id}:halo`;
          halo.userData = { fixture: fx, label: fixtureLabel(fx) };
          halo.castShadow = false;
          g.add(halo);
          pickables.push(halo);
        } else pickables.push(bulb);
        fixtures.set(fx.id, { kind: 'lamp', bulb, light, halo });
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
    // a vertical strip (fixes list 48): one bar from its bottom z up its length, on the wall face
    const vertical = fx.attach?.vertical === true && fx.attach?.wall !== undefined, H = vertical ? (fx.attach.length || 0) : 0;
    if (vertical) {
      const p = line[0];
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, H * MM, 0.02), new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0x000000 }));
      m.position.set(...toThree(p, z + H / 2));
      m.name = fx.id;
      m.userData = { fixture: fx, label: fixtureLabel(fx) };
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.07, H * MM, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      h.position.copy(m.position); h.raycast = () => {};
      g.add(m, h); pickables.push(m); meshes.push(m); halos.push(h);
    } else for (let i = 1; i < line.length; i++) {
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
      L.position.set(...toThree(pointAlong(line, polylineLength(line) * t), vertical ? z + H * t : z));
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
    // every light in every shader, or the old way for a house with very many lights
    const lights = [...fixtures.values()].reduce((n, f) => n + (f.kind === 'lamp' ? 1 : f.kind === 'strip' ? f.lights.length : 0), 0);
    steadyLights = lights <= STEADY_LIGHTS_MAX;
    renderer.shadowMap.needsUpdate = true;
    makeLampMasks();
    assignShadows();
    markShadowsDirty();
    resetView();
    }
  }

  // Each lamp whose light walls would let through gets a mask of where its light may go (lamp-mask.js), so it does not shine through them
  // whether or not it casts a shadow. Lamps with nothing in the way need none. `settings.render3d.lampMask: false` turns it off.
  function makeLampMasks() {
    if (!maskUniforms) return;
    const on = settings?.render3d?.lampMask !== false;
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3(), picked = [];
    for (const m of maskInput) {
      const f = fixtures.get(m.id);
      if (!f || f.kind !== 'lamp') continue;
      f.light.decay = 2;
      const disc = Math.PI * m.reach.radius * m.reach.radius;
      if (!on || m.reach.leak < disc * 0.03 || picked.length >= MAX_MASKS) continue;     // nothing much in the way: no mask
      f.light.getWorldPosition(v);
      const floorY = m.group.position.y;
      picked.push({ id: m.id, polygon: m.reach.polygon, centre: m.reach.centre, radius: m.reach.radius, world: [v.x, v.z], yMin: floorY - 0.03, yMax: floorY + (m.level.ceilingHeight ?? 2400) * MM + 0.06 });
    }
    const packed = packMasks(picked);
    picked.forEach((p, i) => { fixtures.get(p.id).light.decay = decayFor(i); });
    setLampMasks(THREE, maskUniforms, packed);
  }

  /** How many lamps may cast shadows (shadows.js); the lit ones get them, brightest first. */
  function setShadows(count) { shadowBudget = count; assignShadows(); requestRender(); }
  function assignShadows() {
    // steady: the lamps that cast shadows are the ones with the most to hide behind walls, whatever is on (the count never changes);
    // otherwise only the lamps that are on count
    const lamps = [...fixtures].filter(([, f]) => f.kind === 'lamp').map(([id, f]) => ({ id, f, on: steadyLights || !!f.state?.on, brightness: steadyLights ? 1 : (f.state?.brightness ?? 1), leak: leakOf.get(id) ?? 1 }));
    // every shadow map and the two lamp masks take a texture unit of the shader (a GPU has sixteen, and the materials need some)
    const chosen = pickShadowLamps(lamps, Math.min(shadowBudget, Math.max(0, renderer.capabilities.maxTextures - 6)));
    for (const l of lamps) {
      const cast = chosen.has(l.id);
      if (l.f.light.castShadow !== cast) { l.f.light.castShadow = cast; if (cast) shadowDirty.add(l.id); }   // changes only: each one rebuilds shaders
      l.f.light.shadow.autoUpdate = !steadyLights;
    }
  }

  /** a = appearance(state): { available, on, brightness 0..1, rgb } */
  function setFixture(id, a) {
    const f = fixtures.get(id);
    if (!f) return;
    const prev = f.state;
    f.state = a;
    const col = new THREE.Color(`rgb(${a.rgb.join(',')})`);
    if (f.kind === 'strip') {
      for (const L of f.lights) { L.visible = steadyLights || a.on; L.color.copy(col); L.intensity = a.on || !steadyLights ? (settings.render3d?.lampIntensity ?? 80) * a.brightness * 0.5 : 0; }
      for (const m of f.meshes) {
        m.material.color.set(a.available ? (a.on ? col : 0x555555) : 0x7a2a2a);
        m.material.emissive.copy(a.on ? col : new THREE.Color(0));
        m.material.emissiveIntensity = a.on ? 2 : 0;
      }
      for (const h of f.halos) { h.material.color.copy(col); h.material.opacity = a.on ? 0.25 * a.brightness : 0; }
    } else if (f.kind === 'lamp') {
      if (a.on && !prev?.on) shadowDirty.add(id);                        // its shadow map is made when it goes on
      f.light.visible = steadyLights || a.on;
      f.light.color.copy(col);
      f.light.intensity = a.on || !steadyLights ? (settings.render3d?.lampIntensity ?? 80) * a.brightness : 0;
      if (f.halo) { f.halo.material.color.copy(a.on ? col : new THREE.Color(0xffd6aa)); f.halo.material.opacity = a.on ? LIT_HALO_ON : LIT_HALO_OFF; }
      f.bulb.material.color.set(a.available ? (a.on ? col : 0x555555) : 0x7a2a2a);
      f.bulb.material.emissive.copy(a.on ? col : new THREE.Color(0));
      f.bulb.material.emissiveIntensity = a.on ? 2 : 0;
      assignShadows();
    } else {
      f.box.material.color.set(!a.available ? 0x7a2a2a : a.on ? col : 0x666666);
      f.box.material.emissive.copy(a.on ? col : new THREE.Color(0));
      f.box.material.emissiveIntensity = a.on ? 0.6 : 0;
    }
    requestRender();
  }

  /** The light the house has at night (daylight off), 0 to 1 (night.js): the slider in the viewer. */
  function setNightLight(v) {
    nightLight = v;
    if (!daylight) hemi.intensity = v;
    requestRender();
  }

  function setDaylight(on) {
    daylight = on;
    hemi.intensity = on ? 1.1 : nightLight;
    sun.intensity = on ? 2.2 : 0;
    scene.background = transparent ? null : new THREE.Color(on ? 0xb9cde0 : 0x14161a);
    requestRender();
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
  return { build, setFixture, setShadows, setNightLight, setDaylight, setBackground, setProjection, resetView, getCamera, setCamera, render, root, isDaylight: () => daylight };
}
