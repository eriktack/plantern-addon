// Wall surfaces (PLANTERN.md §6.2): a wall side is { color } or { material: "m_…" }, and materials live
// in the model's top-level `materials` table: { m_oak: { name, color, texture?, uvScale? } }.
// `texture` is an image path inside the location's folder (e.g. "assets/oak.jpg"); `uvScale` is how
// many mm one repeat of the image covers (default 1000). Pure.

const HEX = /^#[0-9a-f]{6}$/i;
export const DEFAULT_UV_SCALE = 1000;

/**
 * What a wall side looks like: { color, texture?, uvScale?, material? }, or null when the side has
 * nothing set (the renderer's default applies). A material without a colour falls back to `fallback`.
 */
export function resolveSide(side, materials = {}, fallback = null) {
  if (!side) return null;
  if (side.material) {
    const m = materials[side.material];
    if (!m) return side.color ? { color: side.color } : null;
    return { color: m.color || side.color || fallback, material: side.material, ...(m.texture ? { texture: m.texture, uvScale: m.uvScale > 0 ? m.uvScale : DEFAULT_UV_SCALE } : {}) };
  }
  return side.color ? { color: side.color } : null;
}

/** Problems with the materials and the wall sides that use them: [{ severity, id, msg }]. */
export function checkMaterials(model) {
  const out = [], mats = model.materials || {};
  for (const [id, m] of Object.entries(mats)) {
    if (!/^m_[a-z0-9_]+$/.test(id)) out.push({ severity: 'error', id, msg: 'material ids are lowercase, start with m_ (letters, digits, _)' });
    if (m.color !== undefined && !HEX.test(m.color)) out.push({ severity: 'error', id, msg: `colour "${m.color}" must look like #rrggbb` });
    if (m.uvScale !== undefined && !(m.uvScale > 0)) out.push({ severity: 'error', id, msg: 'uvScale (mm per repeat) must be more than 0' });
    if (m.texture !== undefined && (typeof m.texture !== 'string' || /^([a-z]+:|\/)/i.test(m.texture) || m.texture.includes('..'))) out.push({ severity: 'error', id, msg: 'texture must be a path inside the location folder, e.g. assets/oak.jpg' });
    if (!m.color && !m.texture) out.push({ severity: 'warn', id, msg: 'has neither a colour nor a texture' });
  }
  for (const lv of model.levels || []) for (const w of lv.walls || []) for (const side of ['left', 'right', 'top', 'ends']) {
    const s = w.sides?.[side];
    if (!s) continue;
    if (s.material && !mats[s.material]) out.push({ severity: 'error', id: w.id, msg: `${side} side uses material "${s.material}", which does not exist`, level: lv.id });
    if (s.color !== undefined && !HEX.test(s.color)) out.push({ severity: 'error', id: w.id, msg: `${side} side colour "${s.color}" must look like #rrggbb`, level: lv.id });
  }
  // a solid or a wall painted per room: solids[].sides[roomId], walls[].roomSides[roomId] = { color } | { material }
  for (const lv of model.levels || []) for (const so of [...(lv.solids || []).map(x => ({ id: x.id, sides: x.sides })), ...(lv.walls || []).map(x => ({ id: x.id, sides: x.roomSides }))]) for (const [room, s] of Object.entries(so.sides || {})) {
    if (s?.material && !mats[s.material]) out.push({ severity: 'error', id: so.id, msg: `the side facing ${room} uses material "${s.material}", which does not exist`, level: lv.id });
    if (s?.color !== undefined && !HEX.test(s.color)) out.push({ severity: 'error', id: so.id, msg: `the side facing ${room}: colour "${s.color}" must look like #rrggbb`, level: lv.id });
  }
  return out;
}

/** Where each material is used: Map material id → [wall and solid ids]. */
export function materialUse(model) {
  const use = new Map(Object.keys(model.materials || {}).map(id => [id, []]));
  for (const lv of model.levels || []) for (const w of [...(lv.walls || []), ...(lv.solids || [])]) for (const s of [...Object.values(w.sides || {}), ...Object.values(w.roomSides || {})]) {
    if (s?.material && use.has(s.material) && !use.get(s.material).includes(w.id)) use.get(s.material).push(w.id);
  }
  return use;
}

/**
 * Colours to pick from quickly: the named ones (`model.palette`: [{ color, name }]) and every colour
 * already used on a wall side or by a material, most used first. [{ color, name?, count }].
 * A palette colour is a preset: walls keep the colour itself, so renaming changes no wall.
 */
export function usedColors(model) {
  const seen = new Map();
  const add = (c, n = 1) => { if (!c || !HEX.test(c)) return; const k = c.toLowerCase(); seen.set(k, (seen.get(k) || 0) + n); };
  for (const lv of model.levels || []) for (const w of [...(lv.walls || []), ...(lv.solids || [])]) for (const s of [...Object.values(w.sides || {}), ...Object.values(w.roomSides || {})]) add(s?.color);
  for (const m of Object.values(model.materials || {})) add(m.color);
  for (const p of model.palette || []) if (!seen.has(p.color?.toLowerCase())) add(p.color, 0);
  const names = new Map((model.palette || []).map(p => [p.color?.toLowerCase(), p.name]));
  return [...seen].map(([color, count]) => ({ color, count, ...(names.get(color) ? { name: names.get(color) } : {}) }))
    .sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0) || b.count - a.count || a.color.localeCompare(b.color));
}

/** Problems with the palette: [{ severity, id, msg }]. */
export function checkPalette(model) {
  return (model.palette || []).flatMap((p, i) => !HEX.test(p?.color || '') ? [{ severity: 'error', id: `palette[${i}]`, msg: 'colour must look like #rrggbb' }]
    : !String(p.name || '').trim() ? [{ severity: 'warn', id: `palette[${i}]`, msg: 'a palette colour without a name' }] : []);
}
