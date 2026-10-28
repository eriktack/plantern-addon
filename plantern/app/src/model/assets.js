// Asset objects (docs/archive/2026-10-10-asset-objects.md, decision 145). An object of kind "asset" places a
// model made by object-designs/ (assets/<name>/model.glb + meta.json) at its box's position and rotation. The model
// stores only the name and the size; the file is looked up at run time: the house's own assets/ first, then the
// shared assets/ of the repo. Pure: paths and rules here, fetching is in src/render3d/assets.js.

export const ASSET_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Paths of an asset's files, relative to a folder that holds an assets/ folder. */
export function assetPaths(name) {
  return { glb: `assets/${name}/model.glb`, meta: `assets/${name}/meta.json`, index: 'assets/index.json' };
}

/**
 * Where an asset's model can come from, in order: the house's own copy (houseBase: the house folder's URL, with a
 * trailing slash), then the shared copy (sharedBase: the folder with the repo's assets/, or null when the page has none).
 */
export function assetSources(name, { houseBase = null, sharedBase = null } = {}) {
  const rel = assetPaths(name).glb;
  return [houseBase != null && `${houseBase}${rel}`, sharedBase != null && `${sharedBase}${rel}`].filter(Boolean);
}

/**
 * Where an asset object stands: its centre (plan mm, in the plane of its footprint), its bottom z and its heading
 * (radians, counter-clockwise from east). The footprint is the one of objectFootprint(): the first edge runs along the
 * object's width, which is the model's own x axis, so the model turns with the object.
 */
export function assetPlacement(o, footprint, z = o.z ?? 0) {
  const cx = footprint.reduce((s, p) => s + p[0], 0) / footprint.length;
  const cy = footprint.reduce((s, p) => s + p[1], 0) / footprint.length;
  const [p0, p1] = footprint;
  return { centre: [cx, cy], z, heading: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + (turnedToWall(o, footprint) ? Math.PI : 0) };
}

// ---- a host's frame and holes (on-object.js, decision 285): here, so the plans and the card need nothing from the library ----
/** The host's frame: its middle, heading (radians, counter-clockwise from east) and unit axes u (its width, model +x) and b (toward its back, model +y). */
export function hostFrame(host, footprint) {
  const { centre, heading } = assetPlacement(host, footprint);
  const u = [Math.cos(heading), Math.sin(heading)], b = [-u[1], u[0]];
  return { centre, heading, u, b, z: host.z ?? 0 };
}

/** The outlines of a host's holes (its `params.cutouts`) in plan mm, for the plans: one rectangle of 4 corners per hole. */
export function holeOutlines(host, footprint) {
  const holes = host?.params?.cutouts;
  if (!Array.isArray(holes) || !holes.length || !footprint) return [];
  const { centre: c, u, b } = hostFrame(host, footprint);
  const at = (x, y) => [c[0] + u[0] * x + b[0] * y, c[1] + u[1] * x + b[1] * y];
  return holes.map(h => [at(h.x - h.width / 2, h.y - h.depth / 2), at(h.x + h.width / 2, h.y - h.depth / 2), at(h.x + h.width / 2, h.y + h.depth / 2), at(h.x - h.width / 2, h.y + h.depth / 2)]);
}

/**
 * True when a model standing on a wall face must be turned half a turn from the heading of its footprint's first edge. The model's +y (its back)
 * is to the left of its width axis. On the right side of a wall the footprint runs clockwise, so the depth (into the room) is on the model's -y
 * side and the back is on the wall. On the left side the footprint runs counter-clockwise, so the same heading would put the back into the room
 * (a towel rail with its rack on the wall): turn it. A free object has no wall, and keeps its heading.
 */
export function turnedToWall(o, footprint) {
  if (!o?.attach || !Array.isArray(footprint) || footprint.length < 4) return false;
  const [p0, p1, , p3] = footprint;
  return (p1[0] - p0[0]) * (p3[1] - p0[1]) - (p1[1] - p0[1]) * (p3[0] - p0[0]) > 0;
}

/**
 * Warnings about asset objects, given what the viewer found: metas is a Map of asset name to its parsed meta.json
 * (a name that is not there is missing from the map). A missing model is a warning; a size that differs from the
 * model's own size (meta.size, mm) by more than 0.5 mm is a warning too. Returns [{ id, msg }].
 */
export function assetWarnings(model, metas) {
  const out = [];
  for (const level of model.levels || []) {
    for (const o of level.objects || []) {
      if (o.kind !== 'asset' || o.blueprint !== undefined || !ASSET_NAME.test(o.asset ?? '')) continue;   // a blueprint's size is checked against its build (decision 187)
      const meta = metas.get(o.asset);
      if (!meta) {
        out.push({ id: o.id, msg: `${o.id}: model "${o.asset}" is not in this house's assets/ or the shared assets/ (shown as a marker)` });
        continue;
      }
      if (Array.isArray(meta.size) && Array.isArray(o.size) && meta.size.some((v, k) => Math.abs(v - o.size[k]) > 0.5)) {
        out.push({ id: o.id, msg: `${o.id}: size ${o.size.join(' × ')} mm differs from model "${o.asset}" (${meta.size.join(' × ')} mm)` });
      }
    }
  }
  return out;
}

// ---- objects made from a blueprint (docs/archive/2026-10-14-object-templates.md, T7) ----

/** A size that differs from the build's by more than this (mm) is reported (decision 189). */
export const SIZE_TOLERANCE = 0.5;

const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);

/**
 * What an object keeps of the server's build besides its size (decisions 249, 284, 285): its light point, the holes it needs in what it
 * is set into and the height it rests by, and the niches it has for appliances; null removes a field (setObject), so an object
 * whose model has none of them stores nothing.
 */
export const builtFields = a => ({ light: a?.light ?? null, cutout: a?.cutout ?? null, rest: a?.rest ?? null, niches: a?.niches ?? null });

/** What the server needs to build a blueprint object: { blueprint, params, partMaterials }. */
export const blueprintRequest = o => ({ blueprint: o.blueprint, params: o.params ?? {}, partMaterials: o.partMaterials ?? {} });

/**
 * What a page keys an asset object's model by: the model's name, or for a blueprint object the blueprint with its values
 * (two objects with the same settings share one model; changing an option asks for a new one).
 */
export const assetKey = o => o.blueprint ? `blueprint:${o.blueprint}:${canonical({ p: o.params ?? {}, m: o.partMaterials ?? {} })}` : o.asset;

/** The warning when a blueprint object's stored size is not the size its build has, else null. `built` is [x, y, z] in mm. */
export function builtSizeWarning(o, built) {
  if (!Array.isArray(o.size) || !Array.isArray(built)) return null;
  if (!built.some((v, k) => Math.abs(v - o.size[k]) > SIZE_TOLERANCE)) return null;
  return `size ${o.size.join(' × ')} mm differs from what blueprint "${o.blueprint}" builds with these options (${built.join(' × ')} mm)`;
}

/**
 * The size of a blueprint object against a fresh build with its options (`built`, [x, y, z] mm, from the server): null when
 * there is no build to compare with, { matches: true } when the stored size is the build's, else { matches: false, reason }.
 * The reason does not claim more than the data says: the object does not record how its size was set, so a size that
 * differs may be one set by hand, or a build that changed since the object was made (the blueprint or the library).
 */
export function builtSizeStatus(o, built) {
  if (!Array.isArray(built)) return null;
  if (!builtSizeWarning(o, built)) return { matches: true, built };
  return { matches: false, built, reason: 'The size differs from the build with these options: it was set by hand, or the blueprint or the library changed since the object was made.' };
}

/**
 * The main colour of a model, for its footprint in the plan: the colour of the part that shows most from above (its area seen from
 * above, `weight`), so a table is the colour of its top and not of its legs, whose box is as large. `parts` is [{ weight, colour }]
 * with colour '#rrggbb'; a part with no colour is skipped; none at all gives null. Ties go to the first.
 */
export function mainColourOf(parts) {
  let best = null;
  for (const p of parts) if (p.colour && (!best || p.weight > best.weight)) best = p;
  return best ? best.colour : null;
}

/** The entries of the model menu (ND8): the names the house has, filtered by what is typed (case-insensitive, sorted). */
export function assetEntries(names, query = '') {
  const q = String(query ?? '').trim().toLowerCase();
  return [...names].sort().filter(n => !q || n.toLowerCase().includes(q)).map(n => ({ id: n, label: n, icon: 'model' }));
}
