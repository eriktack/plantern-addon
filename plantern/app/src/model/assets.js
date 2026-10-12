// Asset objects (docs/proposals/2026-10-10-asset-objects.md, decision 145). An object of kind "asset" places a
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
export function assetPlacement(o, footprint) {
  const cx = footprint.reduce((s, p) => s + p[0], 0) / footprint.length;
  const cy = footprint.reduce((s, p) => s + p[1], 0) / footprint.length;
  const [p0, p1] = footprint;
  return { centre: [cx, cy], z: o.z ?? 0, heading: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) };
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
      if (o.kind !== 'asset' || !ASSET_NAME.test(o.asset ?? '')) continue;
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
