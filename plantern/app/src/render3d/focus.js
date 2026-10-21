// The reduced level of the Editor's 3D preview (docs/archive/2026-10-21-live-3d-preview.md PV3): the thing being edited and what lies within a few
// metres of it, as a level of its own that the viewer's createView3d() can draw cheaply. Pure: a model in, a level and its geometry out;
// the model is not changed and the geometry comes from buildLevelGeometry() like everywhere else.

import { buildLevelGeometry, buildModelGeometry } from '../geometry/level.js';
import { distToSegment, distToOutline, pointInPolygon, polygonBounds } from '../geometry/polygon.js';

/** How far round the selection the preview reaches (mm). */
export const FOCUS_RADIUS = 3500;

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const along = (w, s) => { const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1; return [w.a[0] + (w.b[0] - w.a[0]) * s / L, w.a[1] + (w.b[1] - w.a[1]) * s / L]; };
const centroid = poly => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
const nearPoly = (c, poly) => (pointInPolygon(c, poly) ? 0 : distToOutline(c, poly));

/** The wall an object, lamp, switch or strip of the level hangs on or stands in (its opening's wall), or null. */
function wallOfAttach(level, at) {
  if (!at) return null;
  if (at.wall !== undefined) return at.wall;
  if (at.opening !== undefined) return (level.openings || []).find(o => o.id === at.opening)?.wall ?? null;
  if (at.object !== undefined) return wallOfAttach(level, (level.objects || []).find(o => o.id === at.object)?.attach);
  return null;
}

/** What the selection is: where its middle is (plan mm, and a height), how far it reaches, and its own wall. */
function anchorOf(level, geo, sel) {
  const wallById = new Map((level.walls || []).map(w => [w.id, w]));
  const find = (list, id) => (list || []).find(x => x.id === id);
  const ceiling = level.ceilingHeight ?? 2400;
  if (sel?.kind === 'wall') {
    const w = wallById.get(sel.id);
    if (w) return { centre: mid(w.a, w.b), z: ceiling / 2, radius: Math.min(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) / 2, 3000) + 300, wall: w.id };
  }
  if (sel?.kind === 'opening') {
    const o = find(level.openings, sel.id), w = o && wallById.get(o.wall);
    if (w) return { centre: along(w, o.offset + o.width / 2), z: ((o.sill ?? 0) + (o.head ?? 2100)) / 2, radius: Math.max(o.width, (o.head ?? 2100) - (o.sill ?? 0)) / 2 + 1000, wall: w.id };
  }
  if (sel?.kind === 'object') {
    const o = find(level.objects, sel.id), fp = o && geo.objectFootprint(o);
    if (fp) return { centre: centroid(fp), z: geo.objectZ(o) + (o.size?.[2] ?? 0) / 2, radius: Math.max(...(o.size || [600])) / 2 + 500, wall: wallOfAttach(level, o.attach) };
  }
  if (sel?.kind === 'fixture') {
    const f = find(level.fixtures, sel.id), p = f && geo.fixturePos(f);
    if (p) return { centre: p, z: f.z ?? ceiling - 100, radius: 1200, wall: wallOfAttach(level, f.attach) };
  }
  if (sel?.kind === 'solid') {
    const s = find(level.solids, sel.id);
    if (s?.polygon?.length >= 3) { const b = polygonBounds(s.polygon); return { centre: centroid(s.polygon), z: ceiling / 2, radius: Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 500, wall: null }; }
  }
  if (sel?.kind === 'stairs') {
    const s = (geo.stairs || []).find(x => x.id === sel.id), poly = s?.layout?.outline;
    if (poly?.length >= 3) { const b = polygonBounds(poly); return { centre: centroid(poly), z: ceiling / 2, radius: Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 500, wall: null }; }
  }
  if (sel?.kind === 'room') {
    const r = find(level.rooms, sel.id);
    if (r?.polygon?.length >= 3) return { centre: centroid(r.polygon), z: ceiling / 2, radius: 3000, wall: null };
  }
  if (sel?.kind === 'material') {                                     // a look: the first wall that wears it
    const w = (level.walls || []).find(x => [x.sides?.left, x.sides?.right, ...Object.values(x.roomSides || {})].some(s => s?.material === sel.id)) ?? (level.walls || [])[0];
    if (w) return { centre: mid(w.a, w.b), z: ceiling / 2, radius: 3000, wall: null };
  }
  // nothing selected, or what was selected is not here: the middle of the level
  const pts = [...(level.rooms || []).flatMap(r => r.polygon || []), ...(level.walls || []).flatMap(w => [w.a, w.b])];
  if (!pts.length) return { centre: [0, 0], z: ceiling / 2, radius: 3000, wall: null };
  const b = polygonBounds(pts);
  return { centre: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], z: ceiling / 2, radius: 3000, wall: null };
}

/** True when a wall's own body (its thickness) is touched by a solid that walls give way to (cutsWalls): such a solid changes the wall's pieces. */
function solidCuts(wall, s) {
  if (!s.cutsWalls || !(s.polygon?.length >= 3)) return false;
  const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]), reach = (wall.thickness ?? 0) + 20;
  for (let d = 0; d <= L; d += 100) { const p = along(wall, Math.min(d, L)); if (nearPoly(p, s.polygon) <= reach) return true; }
  return nearPoly(wall.b, s.polygon) <= reach;
}

/**
 * The plan direction from the thing to the camera, so the view looks at it from the middle of its room (the room its wall faces, for a thing on a wall: then along
 * the wall's normal, on the room's side) instead of from behind a wall. null when the thing is at the room's middle or there is no room.
 */
function viewAzimuth(level, c, a, normal) {
  const wall = !!a.wall, reach = wall ? 400 : 0;
  const rooms = (level.rooms || []).filter(r => r.polygon?.length >= 3 && nearPoly(c, r.polygon) <= reach);
  const room = rooms.find(r => !r.exterior) ?? rooms[0];
  if (!room) return null;
  const m = centroid(room.polygon), v = [m[0] - c[0], m[1] - c[1]];
  if (normal) { const d = normal[0] * v[0] + normal[1] * v[1]; return Math.abs(d) < 1 ? null : d > 0 ? normal : [-normal[0], -normal[1]]; }
  return Math.hypot(v[0], v[1]) < 300 ? null : v;
}

/**
 * The reduced level: the selected thing plus what lies within `radius` (mm) of its middle, and everything a kept member refers to (the wall of an
 * opening, the opening an object or lamp stands in, the object a strip runs along, the wall a wall thing hangs on, the solids that cut a kept wall).
 * `selection` = { kind, id } as the Editor names them (wall, opening, fixture, object, stairs, solid, room, material), or null.
 * `geos` (Map levelId → geometry, buildModelGeometry()) is used when the page has it, else it is worked out here.
 * Returns { level, geo, focus: { centre, z, radius, own, normal, dim } }: `own` is the selection's wall (or null), `normal` its left normal in the plan, `azimuth` the direction to look from (from its room's middle), and `dim` the ids of the other walls (and of the
 * openings in them), which the preview draws dimmed so a window is seen from either side and a chair is not hidden behind a wall.
 */
export function focusLevel(model, levelId, selection, radius = FOCUS_RADIUS, geos = null) {
  const level = model.levels.find(l => l.id === levelId);
  if (!level) return null;
  const full = (geos ?? buildModelGeometry(model)).get(levelId) ?? buildLevelGeometry(level);
  const a = anchorOf(level, full, selection), c = a.centre;
  const within = d => d <= radius;

  const kept = { walls: new Set(), openings: new Set(), objects: new Set(), fixtures: new Set(), solids: new Set(), rooms: new Set(), stairs: new Set() };
  const wallById = new Map((level.walls || []).map(w => [w.id, w]));
  const openingById = new Map((level.openings || []).map(o => [o.id, o]));
  const objectById = new Map((level.objects || []).map(o => [o.id, o]));

  for (const w of level.walls || []) if (within(distToSegment(c, w.a, w.b))) kept.walls.add(w.id);
  for (const r of level.rooms || []) if (r.polygon?.length >= 3 && within(nearPoly(c, r.polygon))) kept.rooms.add(r.id);
  for (const s of level.solids || []) if (s.polygon?.length >= 3 && within(nearPoly(c, s.polygon))) kept.solids.add(s.id);
  for (const o of level.objects || []) { const fp = full.objectFootprint(o); if (fp?.length && within(Math.min(nearPoly(c, fp), Math.hypot(...centroid(fp).map((v, i) => v - c[i]))))) kept.objects.add(o.id); }
  for (const f of level.fixtures || []) { const p = full.fixturePos(f); if (p && within(Math.hypot(p[0] - c[0], p[1] - c[1]))) kept.fixtures.add(f.id); }
  for (const o of level.openings || []) { const w = wallById.get(o.wall); if (w && within(Math.hypot(...along(w, o.offset + o.width / 2).map((v, i) => v - c[i])))) kept.openings.add(o.id); }

  // the selection itself, whatever its distance
  const sel = selection && { wall: 'walls', opening: 'openings', object: 'objects', fixture: 'fixtures', solid: 'solids', room: 'rooms', stairs: 'stairs' }[selection.kind];
  if (sel) kept[sel].add(selection.id);

  // everything a kept member refers to, until nothing is added
  for (let changed = true; changed;) {
    changed = false;
    const add = (set, id) => { if (id !== undefined && id !== null && !set.has(id)) { set.add(id); changed = true; } };
    for (const id of [...kept.openings]) { const o = openingById.get(id); if (o) add(kept.walls, o.wall); }
    for (const id of [...kept.walls]) for (const o of level.openings || []) if (o.wall === id) add(kept.openings, o.id);          // a wall keeps its holes
    for (const id of [...kept.objects]) { const at = objectById.get(id)?.attach; if (at?.opening !== undefined) add(kept.openings, at.opening); if (at?.wall !== undefined) add(kept.walls, at.wall); }
    for (const id of [...kept.fixtures]) {
      const f = (level.fixtures || []).find(x => x.id === id), at = f?.attach;
      if (!at) continue;
      if (at.opening !== undefined) add(kept.openings, at.opening);
      if (at.wall !== undefined) add(kept.walls, at.wall);
      if (at.object !== undefined) add(kept.objects, at.object);
    }
    for (const s of level.solids || []) if (!kept.solids.has(s.id) && [...kept.walls].some(id => solidCuts(wallById.get(id), s))) add(kept.solids, s.id);
  }

  const pick = (list, set) => (list || []).filter(x => set.has(x.id));
  const stairs = pick(level.stairs, kept.stairs);                       // only the stairs being edited; the others are left out
  const reduced = {
    ...level,
    rooms: pick(level.rooms, kept.rooms), walls: pick(level.walls, kept.walls), openings: pick(level.openings, kept.openings),
    solids: pick(level.solids, kept.solids), objects: pick(level.objects, kept.objects), fixtures: pick(level.fixtures, kept.fixtures), stairs,
  };
  const geo = buildLevelGeometry(reduced);
  geo.stairs = (full.stairs || []).filter(s => kept.stairs.has(s.id));
  geo.holes = (full.holes || []).filter(h => h.poly?.length && within(nearPoly(c, h.poly)));   // the floor keeps the openings stairs from below make

  const dim = a.wall ? [...kept.walls].filter(id => id !== a.wall) : [...kept.walls];
  const dimIds = new Set([...dim, ...reduced.openings.filter(o => dim.includes(o.wall)).map(o => o.id)]);
  return { level: reduced, geo, focus: { centre: c, z: a.z, radius: a.radius, own: a.wall, normal: (a.wall && full.frames.get(a.wall)?.n) || null, azimuth: viewAzimuth(level, c, a, (a.wall && full.frames.get(a.wall)?.n) || null), dim: [...dimIds] } };
}
