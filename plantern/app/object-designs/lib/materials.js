// lib/materials.js
// Resolves material references (a name in materials/library.json, or a literal #rrggbb) to
// concrete materials for gltf-lib. Pure: the library and the list of texture files are passed in,
// never read here (tools/node-io.js and catalog.js load them).
//
// A library entry is either a colour { color, roughness?, metallic? }, or a texture
// { texture: "textures/<file>", uvScale: <mm per repeat>, color? (a tint, default white), roughness?, metallic? }.

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const TEXTURE = /^textures\/[a-z0-9][a-z0-9._-]*\.(png|jpe?g)$/;
const ALLOWED = new Set(['color', 'roughness', 'metallic', 'texture', 'uvScale', 'alphaMode', 'opacity']);
const ALPHA_MODES = new Set(['opaque', 'blend']);

// glTF base colours are linear, while hex colours are sRGB: convert, or every colour renders too light.
const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255), 1];
}

/**
 * Lists problems with a library object. An empty list means every entry is usable.
 * files: optional Set of the texture paths that exist (checked when given).
 */
export function checkLibrary(library, { files } = {}) {
  const problems = [];
  if (!library || typeof library !== 'object' || Array.isArray(library)) return ['library must be an object'];
  for (const [name, entry] of Object.entries(library)) {
    if (!NAME.test(name)) problems.push(`"${name}": name must be kebab-case`);
    if (!entry || typeof entry !== 'object') { problems.push(`"${name}": entry must be an object`); continue; }
    for (const k of Object.keys(entry)) {
      if (!ALLOWED.has(k)) problems.push(`"${name}": unknown field "${k}"`);
    }
    if (entry.color !== undefined && (typeof entry.color !== 'string' || !HEX.test(entry.color))) {
      problems.push(`"${name}": color must be #rrggbb`);
    }
    if (entry.texture === undefined) {
      if (entry.color === undefined) problems.push(`"${name}": a colour entry needs a color`);
      if (entry.uvScale !== undefined) problems.push(`"${name}": uvScale is only used with a texture`);
    } else {
      if (typeof entry.texture !== 'string' || !TEXTURE.test(entry.texture)) {
        problems.push(`"${name}": texture must be a file in textures/ (png or jpg, lower-case name)`);
      } else if (files && !files.has(entry.texture)) {
        problems.push(`"${name}": texture file not found: ${entry.texture}`);
      }
      if (!(Number.isFinite(entry.uvScale) && entry.uvScale > 0)) problems.push(`"${name}": a texture needs uvScale (mm per repeat, above 0)`);
    }
    if (entry.alphaMode !== undefined && !ALPHA_MODES.has(entry.alphaMode)) problems.push(`"${name}": alphaMode must be opaque or blend`);
    if (entry.opacity !== undefined) {
      if (entry.alphaMode !== 'blend') problems.push(`"${name}": opacity is only used with alphaMode blend`);
      if (!(Number.isFinite(entry.opacity) && entry.opacity >= 0 && entry.opacity <= 1)) problems.push(`"${name}": opacity must be between 0 and 1`);
    }
    for (const f of ['roughness', 'metallic']) {
      if (entry[f] !== undefined && !(Number.isFinite(entry[f]) && entry[f] >= 0 && entry[f] <= 1)) {
        problems.push(`"${name}": ${f} must be between 0 and 1`);
      }
    }
  }
  return problems;
}

/**
 * Resolves one reference. `where` names the place it is used (for the error message).
 * Returns { name, color: [r,g,b,a], roughness?, metallic?, texture?: { path, uvScale } }.
 */
export function resolveMaterial(ref, library, where = 'material') {
  if (HEX.test(ref)) return { name: ref, color: hexToRgba(ref) };
  const entry = library?.[ref];
  if (!entry) {
    throw new Error(`Unknown material "${ref}" (${where}). Use a name from materials/library.json or a #rrggbb colour.`);
  }
  const colour = entry.color ?? '#ffffff';
  if (!HEX.test(colour)) throw new Error(`Material "${ref}" has no valid color.`);
  const blend = entry.alphaMode === 'blend';
  const [r, g, b] = hexToRgba(colour);
  return {
    name: ref,
    color: [r, g, b, blend ? (entry.opacity ?? 1) : 1],
    ...(blend && { alphaMode: 'blend' }),
    ...(entry.roughness !== undefined && { roughness: entry.roughness }),
    ...(entry.metallic !== undefined && { metallic: entry.metallic }),
    ...(entry.texture !== undefined && { texture: { path: entry.texture, uvScale: entry.uvScale } }),
  };
}

/**
 * The material of every part of a model, from resolved params: partMaterials[key] when set, otherwise the part's own
 * default (`defaultMaterial` in meta.parts, for a part that should not follow the whole object, such as glass),
 * otherwise the whole-object material. Returns { [partKey]: material }.
 */
export function resolvePartMaterials(meta, params, library) {
  const materialParam = meta.params.find(d => d.type === 'material');
  const whole = params[materialParam.key];
  const out = {};
  for (const part of meta.parts) {
    const ref = params.partMaterials?.[part.key] ?? part.defaultMaterial ?? whole;
    out[part.key] = resolveMaterial(ref, library, `part "${part.label}"`);
  }
  return out;
}
