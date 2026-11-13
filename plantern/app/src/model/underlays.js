// Underlays (docs/plans/underlay.md, decision 293): an image under the plan of one level, a drone photo taken straight down or
// a construction drawing, fitted to the plan by two or more points.
//   { id: "u_drone", name?, file: "assets/underlays/drone.webp", level: "ground", size: [w, h],
//     points: [{ image: [u, v], plan: "r_hall#p0" | [x, y] }, …], place?: { at: [x, y], scale, rotation }, opacity?: 0–1, date?, note? }
// Two or more points that resolve fit it (fitSimilarity); with fewer, `place` (placed by hand: the image's middle at `at`, mm per
// pixel, degrees anticlockwise) puts it where it is, so a photo can be dragged roughly into place first and fitted by points after.
// `file` is a path inside the house folder, under assets/underlays/ so the house's own address serves it (with Plantern's
// server and on a plain static server alike). A plan point is a snap ref of the underlay's level (it follows the model when the
// model is corrected) or a position in mm. Pure.

import { collectSnapPoints } from '../tools/snap.js';
import { fitSimilarity, placeMatrix } from '../geometry/underlay.js';

export const UNDERLAY_DIR = 'assets/underlays/';
export const UNDERLAY_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export const UNDERLAY_DEFAULT_OPACITY = 0.6;
export const UNDERLAY_RESIDUAL_WARN = 150;          // mm: a point further than this from the fit is probably a wrong click
const FILE_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

/** Is this a path an underlay file may have: assets/underlays/<name>.<png|jpg|jpeg|webp>, nothing above or beside it. */
export function underlayFileOk(file) {
  if (typeof file !== 'string' || !file.startsWith(UNDERLAY_DIR)) return false;
  const name = file.slice(UNDERLAY_DIR.length), dot = name.lastIndexOf('.');
  return FILE_NAME.test(name) && !name.includes('..') && dot > 0 && Object.hasOwn(UNDERLAY_TYPES, name.slice(dot).toLowerCase());
}

/** The structural problems of one underlay (no model needed): a list of messages. */
export function underlayShapeErrors(u) {
  const e = [];
  if (!u || typeof u !== 'object') return ['an underlay must be an object'];
  if (typeof u.id !== 'string' || !/^u_[a-z0-9_]+$/.test(u.id)) e.push('an underlay id looks like u_drone');
  if (!underlayFileOk(u.file)) e.push(`file must be ${UNDERLAY_DIR}<name>.png, .jpg or .webp`);
  if (typeof u.level !== 'string' || !u.level) e.push('level must be a level id');
  if (!Array.isArray(u.size) || u.size.length !== 2 || !u.size.every(n => Number.isInteger(n) && n > 0)) e.push('size must be [width, height] in pixels');
  if (!Array.isArray(u.points)) e.push('points must be a list of { image: [u, v], plan: ref or [x, y] }');
  else u.points.forEach((p, i) => {
    if (!p || !Array.isArray(p.image) || p.image.length !== 2 || !p.image.every(Number.isFinite)) e.push(`point ${i + 1}: image must be [u, v] in pixels`);
    else if (Array.isArray(u.size) && (p.image[0] < 0 || p.image[1] < 0 || p.image[0] > u.size[0] || p.image[1] > u.size[1])) e.push(`point ${i + 1}: the pixel [${p.image}] is outside the image`);
    const pl = p?.plan;
    if (!(typeof pl === 'string' && pl.includes('#')) && !(Array.isArray(pl) && pl.length === 2 && pl.every(Number.isFinite))) e.push(`point ${i + 1}: plan must be a snap ref or [x, y] in mm`);
  });
  if (u.opacity !== undefined && !(Number.isFinite(u.opacity) && u.opacity >= 0 && u.opacity <= 1)) e.push('opacity must be between 0 and 1');
  if (u.place !== undefined && !placeOk(u.place)) e.push('place must be { at: [x, y] mm, scale: mm per pixel (more than 0), rotation: degrees }');
  return e;
}

const placeOk = pl => !!pl && typeof pl === 'object' && Array.isArray(pl.at) && pl.at.length === 2 && pl.at.every(Number.isFinite)
  && Number.isFinite(pl.scale) && pl.scale > 0 && (pl.rotation === undefined || Number.isFinite(pl.rotation));

/**
 * Where an underlay's points are in the plan and how it fits: { pairs, missing: [refs], fit } (fit from fitSimilarity, or null
 * while fewer than two points resolve). `snaps` = the level's snap points as a Map ref → pos (optional; worked out when absent).
 */
export function resolveUnderlay(model, u, geo, snaps) {
  const level = (model.levels || []).find(l => l.id === u.level);
  if (!level || !Array.isArray(u.points)) return { pairs: [], missing: [], fit: null };
  snaps ??= level && geo ? new Map(collectSnapPoints(model, level, geo).map(s => [s.ref, s.pos])) : new Map();
  const pairs = [], missing = [];
  for (const p of u.points) {
    const pos = Array.isArray(p.plan) ? p.plan : snaps.get(p.plan);
    if (pos) pairs.push({ image: p.image, plan: [pos[0], pos[1]], ...(typeof p.plan === 'string' ? { ref: p.plan } : {}) });
    else missing.push(p.plan);
  }
  const fit = pairs.length >= 2 ? fitSimilarity(pairs) : null;
  if (fit?.ok) return { pairs, missing, fit, by: 'points', error: null };
  // fewer than two points (or points that cannot fit): placed by hand, when it has been
  if (placeOk(u.place) && Array.isArray(u.size)) return { pairs, missing, fit: { ok: true, matrix: placeMatrix(u.place, u.size), scale: u.place.scale, rotationDeg: u.place.rotation ?? 0, residuals: [], rms: 0 }, by: 'place', error: fit && !fit.ok ? fit.error : null };
  return { pairs, missing, fit: null, by: null, error: fit && !fit.ok ? fit.error : null };
}

/** Validator issues for the model's underlays. `geos` = buildModelGeometry(model). */
export function checkUnderlays(model, geos) {
  const out = [];
  if (model.underlays === undefined) return out;
  if (!Array.isArray(model.underlays)) return [{ severity: 'error', id: 'underlays', msg: 'underlays must be a list' }];
  for (const u of model.underlays) {
    const id = u?.id || 'underlays';
    const shape = underlayShapeErrors(u);
    for (const m of shape) out.push({ severity: 'error', id, msg: m });
    if (shape.length) continue;
    if (!(model.levels || []).some(l => l.id === u.level)) { out.push({ severity: 'error', id, msg: `level "${u.level}" does not exist` }); continue; }
    const r = resolveUnderlay(model, u, geos.get(u.level));
    if (u.points.length < 2 && !r.fit) { out.push({ severity: 'warn', id, msg: 'not placed yet: drag it into place by hand, or give it two points (an image pixel and the plan point it shows)' }); continue; }
    for (const ref of r.missing) out.push({ severity: 'warn', id, msg: `its point ${ref} does not exist on level ${u.level}` });
    if (r.error) out.push({ severity: 'warn', id, msg: `cannot be fitted: ${r.error}` });
    if (!r.fit || r.by !== 'points') continue;
    if (r.fit.mirrored) out.push({ severity: 'warn', id, msg: 'the points fit a mirrored image better: are they in the right order, on the right image?' });
    r.fit.residuals.forEach((d, i) => { if (d > UNDERLAY_RESIDUAL_WARN) out.push({ severity: 'warn', id, msg: `point ${i + 1} (${r.pairs[i].ref || r.pairs[i].plan.map(Math.round).join(', ')}) is ${Math.round(d)} mm from where the fit puts it: a wrong click, or a point that is not on the ground?` }); });
  }
  return out;
}

/**
 * The underlays of a level as the plan draws them: [{ id, name?, file, size, opacity, matrix }] (only the fitted ones).
 * `geo` = the level's geometry.
 */
export function placedUnderlays(model, levelId, geo) {
  const out = [];
  for (const u of model.underlays || []) {
    if (u?.level !== levelId || underlayShapeErrors(u).length) continue;
    const r = resolveUnderlay(model, u, geo);
    if (!r.fit) continue;
    out.push({ id: u.id, ...(u.name ? { name: u.name } : {}), file: u.file, size: u.size, opacity: u.opacity ?? UNDERLAY_DEFAULT_OPACITY, matrix: r.fit.matrix });
  }
  return out;
}

/** Id for a new underlay from a name: "Drone photo" → u_drone_photo, unique among `used`. */
export function newUnderlayId(name, used) {
  const slug = String(name || 'underlay').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'underlay';
  let id = `u_${slug}`, k = 2;
  while (used.has(id)) id = `u_${slug}_${k++}`;
  return id;
}
