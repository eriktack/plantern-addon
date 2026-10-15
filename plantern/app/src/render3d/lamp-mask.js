// Lamps that do not shine through walls (PLANTERN.md §8). A three.js point light lights everything within its reach, walls or not, unless it
// casts a shadow, and shadows are few: every shadow map is a texture the shader samples, and a GPU has about sixteen of them.
// The plan already knows where each lamp's light goes: its visibility polygon (geometry/visibility.js, stopped by walls, let through by
// open doors). Here that polygon becomes a small mask per lamp, all in one texture, and the lighting shader multiplies each lamp's light by
// its mask where the fragment is. The lamp is told apart in the shader by a tiny offset of its light's `decay` (2.0001 for the first mask,
// 2.0002 for the second, …: the falloff changes by less than a percent), so the order three.js keeps its lights in does not matter.
//
// The pure parts (rasterising a mask, packing them, the shader text) are here and tested in Node; installLampMask() patches
// three's shader chunks and gives every material the shared uniforms, and is browser only.

export const MASK_SIZE = 128;            // texels along one side of a lamp's mask
export const MASK_COLS = 8;              // masks per row of the atlas
export const MAX_MASKS = 64;             // lamps with a mask (8 rows of 8)
export const DECAY_STEP = 1e-4;          // a lamp's mask number is in its light's decay: 2 + (number + 1) * DECAY_STEP

/**
 * The mask of one lamp: size × size texels, 255 where the lamp's light may go, 0 where a wall hides it. `polygon` is the lamp's visibility
 * polygon in plan mm, `centre` the lamp's place (plan mm) and `radius` its reach: the mask covers the square of side 2 × radius round the centre,
 * row 0 at the south (plan y − radius), column 0 at the west. Even-odd scanline fill, sampled at the middle of each texel.
 */
export function rasterizeMask(polygon, centre, radius, size = MASK_SIZE) {
  const out = new Uint8Array(size * size);
  const n = polygon.length;
  if (n < 3 || !(radius > 0)) return out;
  const toTexel = ([x, y]) => [((x - centre[0]) / (2 * radius) + 0.5) * size, ((y - centre[1]) / (2 * radius) + 0.5) * size];
  const pts = polygon.map(toTexel);
  for (let row = 0; row < size; row++) {
    const y = row + 0.5, xs = [];
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + (y - y0) / (y1 - y0) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(size - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      for (let col = from; col <= to; col++) out[row * size + col] = 255;
    }
  }
  return out;
}

/**
 * The masks of a house's lamps as the textures need them. lamps = [{ id, polygon, centre, radius, world: [x, z] (metres, three.js), yMin, yMax (metres) }].
 * Returns { count, index: Map(id → mask number), atlas: Uint8Array, atlasWidth, atlasHeight, rows, info: Float32Array, infoWidth }.
 * The atlas holds the masks MASK_COLS to a row; `info` has two rows of RGBA texels per lamp column: (x, z, radius, yMin) and (yMax, 0, 0, 0).
 */
export function packMasks(lamps, size = MASK_SIZE) {
  const list = lamps.slice(0, MAX_MASKS), count = list.length, rows = Math.max(1, Math.ceil(count / MASK_COLS));
  const atlasWidth = MASK_COLS * size, atlasHeight = rows * size, atlas = new Uint8Array(atlasWidth * atlasHeight);
  const infoWidth = MAX_MASKS, info = new Float32Array(infoWidth * 2 * 4), index = new Map();
  list.forEach((l, i) => {
    index.set(l.id, i);
    const mask = rasterizeMask(l.polygon, l.centre, l.radius, size), col = i % MASK_COLS, row = Math.floor(i / MASK_COLS);
    for (let y = 0; y < size; y++) atlas.set(mask.subarray(y * size, (y + 1) * size), (row * size + y) * atlasWidth + col * size);
    info.set([l.world[0], l.world[1], l.radius * 0.001, l.yMin], i * 4);
    info.set([l.yMax, 0, 0, 0], (infoWidth + i) * 4);
  });
  return { count, index, atlas, atlasWidth, atlasHeight, rows, info, infoWidth };
}

/** The decay a lamp's light gets for mask number `i` (see the top). */
export const decayFor = i => 2 + (i + 1) * DECAY_STEP;

// ---- the shader ----

const DECLARATIONS = `
uniform highp sampler2D uLampInfo;
uniform sampler2D uLampAtlas;
uniform int uLampCount;
uniform float uLampRows;
// How much of a lamp's light reaches world position \`world\` (three.js axes): 1 inside the lamp's visibility polygon, 0 behind a wall, 0 above
// or below the floor the lamp is on. A light with no mask (decay 2.0) is not changed.
float lampMaskAt( const in float decay, const in vec3 world ) {
	int idx = int( floor( ( decay - 2.0 ) * ${(1 / DECAY_STEP).toFixed(1)} + 0.5 ) ) - 1;
	if ( idx < 0 || idx >= uLampCount ) return 1.0;
	vec4 a = texelFetch( uLampInfo, ivec2( idx, 0 ), 0 );
	vec4 b = texelFetch( uLampInfo, ivec2( idx, 1 ), 0 );
	if ( world.y < a.w || world.y > b.x ) return 0.0;
	vec2 t = vec2( world.x - a.x, - ( world.z - a.y ) ) / a.z * 0.5 + 0.5;
	if ( t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0 ) return 0.0;
	float margin = 0.5 / ${MASK_SIZE}.0;
	t = clamp( t, vec2( margin ), vec2( 1.0 - margin ) );
	vec2 cell = vec2( float( idx % ${MASK_COLS} ), float( idx / ${MASK_COLS} ) );
	return texture2D( uLampAtlas, ( cell + t ) / vec2( ${MASK_COLS}.0, uLampRows ) ).r;
}
`;

const LOOP_FROM = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
const LOOP_TO = `getPointLightInfo( pointLight, geometryPosition, directLight );
		if ( directLight.visible && uLampCount > 0 ) {
			directLight.color *= lampMaskAt( pointLight.decay, transpose( mat3( viewMatrix ) ) * geometryPosition + cameraPosition );
			directLight.visible = ( directLight.color != vec3( 0.0 ) );
		}`;

/**
 * three's shader chunks with the lamp masks in them: { lights_pars_begin, lights_fragment_begin } in, the same two out, or null when
 * the chunks are not the ones this was written for (another three.js: the lights are then left as they are).
 */
export function patchLightChunks(chunks) {
  const pars = chunks?.lights_pars_begin, begin = chunks?.lights_fragment_begin;
  if (typeof pars !== 'string' || typeof begin !== 'string' || pars.includes('lampMaskAt') || !begin.includes(LOOP_FROM)) return null;
  if (!pars.includes('getPointLightInfo')) return null;
  return { lights_pars_begin: pars + DECLARATIONS, lights_fragment_begin: begin.replace(LOOP_FROM, LOOP_TO) };
}

let installed = null;

/**
 * Patches three's lighting chunks (once per page) and makes every material take the shared mask uniforms when its shader is made.
 * Returns the shared uniforms { uLampInfo, uLampAtlas, uLampCount, uLampRows } (each { value }), or null when it could not be patched.
 */
export function installLampMask(THREE) {
  if (installed !== null) return installed || null;
  const patched = patchLightChunks(THREE.ShaderChunk);
  if (!patched) { installed = false; return null; }
  Object.assign(THREE.ShaderChunk, patched);
  const info = new THREE.DataTexture(new Float32Array(MAX_MASKS * 2 * 4), MAX_MASKS, 2, THREE.RGBAFormat, THREE.FloatType);
  info.minFilter = info.magFilter = THREE.NearestFilter; info.needsUpdate = true;
  const atlas = new THREE.DataTexture(new Uint8Array(MASK_COLS * MASK_SIZE * MASK_SIZE), MASK_COLS * MASK_SIZE, MASK_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
  atlas.minFilter = atlas.magFilter = THREE.LinearFilter; atlas.generateMipmaps = false; atlas.needsUpdate = true;
  const uniforms = { uLampInfo: { value: info }, uLampAtlas: { value: atlas }, uLampCount: { value: 0 }, uLampRows: { value: 1 } };
  THREE.Material.prototype.onBeforeCompile = function (shader) { Object.assign(shader.uniforms, uniforms); };
  installed = uniforms;
  return uniforms;
}

/** Puts a house's masks (packMasks) into the shared textures. */
export function setLampMasks(THREE, uniforms, packed) {
  const atlas = new THREE.DataTexture(packed.atlas, packed.atlasWidth, packed.atlasHeight, THREE.RedFormat, THREE.UnsignedByteType);
  atlas.minFilter = atlas.magFilter = THREE.LinearFilter; atlas.generateMipmaps = false; atlas.needsUpdate = true;
  const info = new THREE.DataTexture(packed.info, packed.infoWidth, 2, THREE.RGBAFormat, THREE.FloatType);
  info.minFilter = info.magFilter = THREE.NearestFilter; info.needsUpdate = true;
  uniforms.uLampAtlas.value.dispose(); uniforms.uLampInfo.value.dispose();
  uniforms.uLampAtlas.value = atlas; uniforms.uLampInfo.value = info;
  uniforms.uLampCount.value = packed.count; uniforms.uLampRows.value = packed.rows;
}
