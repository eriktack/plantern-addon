// Objects (PLANTERN.md §6.1, §6.3): physical things with a size (a wall cabinet, a sofa, a table).
//   { id: "ob_cabinet_1", kind: "box", name?, size: [w, d, h], z, color?, assumed?,
//     attach: { wall, side: "left" | "right", offset, gap? }            a box on a wall face: w along the wall from
//                                                                       `offset`, d out from the face (+ gap)
//   | pos: [x, y], rotationDeg? }                                       a box standing in the plan: corner at pos,
//                                                                       w along the direction rotationDeg (0 = east)
// kind "asset" (decision 145) is the same placement with a model: asset: "table" names assets/table/model.glb, which
// is drawn in place of the box (a marker when it is missing). Its size is the model's size (see src/model/assets.js).
// An asset may instead be made from a blueprint (decisions 187, 188, 193): blueprint: "dining-table" with params (the
// values chosen) and partMaterials (a material per part); `asset` is then optional. The blueprint's rules are checked
// only when the caller passes the blueprints (a Map of id to meta, from src/blueprints/load.js).
// `z` is the bottom above the floor (a wall cabinet at 1400, furniture on the floor at 0). The plan draws objects
// whose bottom is above the cut plane dashed. Pure.

import { pointInPolygon } from '../geometry/polygon.js';
import { isHosted, hostedPlacement } from './hosted.js';
import { ASSET_NAME } from './assets.js';
import { resolveParams, appliesTo } from '../../object-designs/lib/params.js';
import { materialOptions, materialAllowed } from '../blueprints/options.js';

export const OBJECT_KINDS = ['box', 'asset'];
export const OBJECT_DEFAULTS = Object.freeze({
  free: { size: [800, 800, 800], z: 0 },
  wall: { size: [900, 350, 700], z: 1400 },
});
const HEX = /^#[0-9a-f]{6}$/i;

const isPlainObject = v => v && typeof v === 'object' && !Array.isArray(v);

// The shape of the blueprint keys, checked without the blueprints.
function blueprintShapeProblems(o) {
  const out = [];
  if (o.blueprint !== undefined) {
    if (o.kind !== 'asset') out.push('only an asset object has a blueprint');
    if (typeof o.blueprint !== 'string' || !ASSET_NAME.test(o.blueprint)) out.push('blueprint must be the id of a blueprint (lower-case letters, digits and -)');
  } else {
    if (o.params !== undefined) out.push('params needs a blueprint');
    if (o.partMaterials !== undefined) out.push('partMaterials needs a blueprint');
  }
  if (o.params !== undefined && !isPlainObject(o.params)) out.push('params must be an object of parameter values');
  if (o.partMaterials !== undefined) {
    if (!isPlainObject(o.partMaterials)) out.push('partMaterials must be an object of part key to material');
    else for (const [k, v] of Object.entries(o.partMaterials)) {
      if (typeof v !== 'string' || !v.trim()) out.push(`partMaterials.${k} must be a material name or #rrggbb`);
    }
  }
  return out;
}

// The values of a blueprint object against its blueprint: the parameters with the library's own rules (type, range,
// option, unknown key), the whole-object material and each part's material against its options.
function blueprintValueProblems(meta, o) {
  let values;
  try { values = resolveParams(meta, o.params ?? {}); }
  catch (e) { return [`blueprint ${o.blueprint}: ${e.message}`]; }
  const out = [];
  for (const d of meta.params.filter(d => d.type === 'material')) {
    const v = values[d.key].trim();
    if (!materialAllowed(v, Array.isArray(d.options) ? d.options : null)) {
      out.push(`${d.label} "${v}" is not one of ${d.options.filter(x => x !== 'custom').join(', ')}${d.options.includes('custom') ? ' or #rrggbb' : ''}`);
    }
  }
  const parts = new Map(meta.parts.map(p => [p.key, p]));
  for (const [k, v] of Object.entries(o.partMaterials ?? {})) {
    const part = parts.get(k);
    if (!part) { out.push(`partMaterials: the blueprint has no part "${k}"`); continue; }
    if (typeof v !== 'string') continue;   // reported by blueprintShapeProblems()
    const options = materialOptions(meta, part.key);
    if (!materialAllowed(v.trim(), options)) {
      out.push(`${part.label} material "${v}" is not one of ${options.filter(x => x !== 'custom').join(', ')}${options.includes('custom') ? ' or #rrggbb' : ''}`);
    }
  }
  return out;
}

// Values stored for an option or a part that does not apply to the object's variant (appliesTo): the library ignores them,
// so they are only reported, as the forms keep the value of a hidden option and a person may want to clear it.
function ignoredValueWarnings(meta, o) {
  const variantParam = meta.params.find(d => d.key === 'variant');
  const active = o.params?.variant ?? variantParam?.default;
  if (active === undefined) return [];
  const out = [];
  for (const d of meta.params) {
    if (o.params && d.key in o.params && !appliesTo(d, active)) out.push(`${d.label} is set but does not apply to the ${active} variant (ignored)`);
  }
  for (const part of meta.parts) {
    if (o.partMaterials && part.key in o.partMaterials && !appliesTo(part, active)) out.push(`${part.label} material is set but the ${active} variant has no such part (ignored)`);
  }
  return out;
}

/**
 * Problems with an object: { errors, warnings }. `level` is the level it stands on. `blueprints` is optional: a Map of
 * blueprint id to its meta. Without it the blueprint's own rules are not checked (only the shape of its keys).
 */
export function checkObject(o, level, blueprints) {
  const errors = [], warnings = [];
  if (!OBJECT_KINDS.includes(o.kind)) errors.push(`kind must be ${OBJECT_KINDS.join(' or ')}`);
  if (o.kind === 'asset' && o.blueprint === undefined && !ASSET_NAME.test(o.asset ?? '')) errors.push('an asset object needs asset (the name of its model folder in assets/, lower-case letters, digits and -) or blueprint (a blueprint id)');
  if (o.kind !== 'asset' && o.asset !== undefined) errors.push('only an asset object has an asset (kind "asset")');
  errors.push(...blueprintShapeProblems(o));
  if (blueprints && typeof o.blueprint === 'string' && ASSET_NAME.test(o.blueprint)) {
    const meta = blueprints.get(o.blueprint);
    if (!meta) warnings.push(`blueprint "${o.blueprint}" is not in this house or the built-in library (shown as a marker)`);
    else if (isPlainObject(o.params ?? {}) && (o.partMaterials === undefined || isPlainObject(o.partMaterials))) {
      errors.push(...blueprintValueProblems(meta, o));
      warnings.push(...ignoredValueWarnings(meta, o));
    }
  }
  if (!Array.isArray(o.size) || o.size.length !== 3 || !o.size.every(v => Number.isFinite(v) && v > 0)) errors.push('size must be [width, depth, height] in mm, all more than 0');
  if (!isHosted(o) && (!Number.isFinite(o.z) || o.z < 0)) errors.push('z (the bottom above the floor) must be 0 or more');   // a hosted object's z is worked out from its opening
  if (o.color !== undefined && !HEX.test(o.color)) errors.push('color must look like #rrggbb');
  // a lit object's light (openings-and-lit-objects): the built light point and the reach of its glow
  if (o.light !== undefined && !(Array.isArray(o.light) && o.light.length === 3 && o.light.every(Number.isFinite))) errors.push('light must be [x, y, z] in mm (the built light point)');
  if (o.lightRadius !== undefined && !(Number.isFinite(o.lightRadius) && o.lightRadius > 0)) errors.push('lightRadius must be more than 0 mm');
  if (!o.attach && !o.pos) errors.push('needs a position (pos) or a wall it is on (attach)');
  if (o.attach && o.pos) errors.push('either attach or pos, not both');
  if (isHosted(o)) {
    // hosted by an opening (hosted.js): on its sill or at its head, along it; a warning when it does not fit
    const op = (level.openings || []).find(x => x.id === o.attach.opening);
    if (!op) errors.push(`hosted by a missing opening "${o.attach.opening}"`);
    else {
      if (!(['sill', 'frame', 'head'].includes(o.attach.at))) errors.push('attach.at must be "sill", "frame" or "head"');
      const wall = (level.walls || []).find(w => w.id === op.wall);
      if (o.attach.at === 'frame' && wall && (o.size?.[1] ?? 0) > (wall.thickness ?? 0) + 1) warnings.push('deeper than the wall: it would reach past the far face');
      if (o.attach.offset !== undefined && !(o.attach.offset >= 0)) errors.push('attach.offset must be 0 or more');
      if (o.attach.shift !== undefined && !Number.isFinite(o.attach.shift)) errors.push('attach.shift must be a number of mm (+ into the room, − into the opening)');
      const width = o.size?.[0] ?? 0;
      if (width > (op.width ?? 0) + 1) warnings.push(`wider than its opening (${op.width} mm)`);
      else if (o.attach.offset !== undefined && o.attach.offset + width > (op.width ?? 0) + 1) warnings.push('reaches past the end of its opening');
      const p = hostedPlacement(o, op, level.ceilingHeight);
      if (p && o.attach.at !== 'head' && p.z + (o.size?.[2] ?? 0) > (op.head ?? level.ceilingHeight ?? 2400) + 1) warnings.push('taller than its opening: its top is above the head');
      if (p && o.attach.at === 'head' && p.z < (op.sill ?? 0) - 1) warnings.push('longer than its opening: its bottom is below the sill');
    }
  } else if (o.attach) {
    const w = (level.walls || []).find(x => x.id === o.attach.wall);
    if (!w) errors.push(`attached to missing wall "${o.attach.wall}"`);
    else {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), width = o.size?.[0] ?? 0;
      if (!['left', 'right'].includes(o.attach.side)) errors.push('attach.side must be "left" or "right"');
      if (!(o.attach.offset >= 0)) errors.push('attach.offset must be 0 or more');
      else if (o.attach.offset + width > L + 1) warnings.push(`reaches past the end of ${w.id} (${Math.round(L)} mm long)`);
      if (o.attach.gap !== undefined && !(o.attach.gap >= 0)) errors.push('attach.gap must be 0 or more');
    }
  } else if (o.pos) {
    if (!(Array.isArray(o.pos) && o.pos.length === 2 && o.pos.every(Number.isFinite))) errors.push('pos must be [x, y]');
    else if (!(level.rooms || []).some(r => r.polygon?.length >= 3 && pointInPolygon(o.pos, r.polygon))) warnings.push('is not inside any room');
    if (o.rotationDeg !== undefined && !Number.isFinite(o.rotationDeg)) errors.push('rotationDeg must be a number');
  }
  if (Number.isFinite(o.z) && Array.isArray(o.size) && Number.isFinite(o.size[2]) && o.z + o.size[2] > (level.ceilingHeight ?? 2400) + 1) warnings.push(`reaches ${Math.round(o.z + o.size[2])} mm, above the ceiling (${level.ceilingHeight ?? 2400} mm)`);
  return { errors, warnings };
}
