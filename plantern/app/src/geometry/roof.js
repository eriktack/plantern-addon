// Roofs over rooms (docs/plans/yard.md Y9): the roof of an outdoor room in the yard (a pergola, a spa deck, a carport) or of a
// small building standing alone (a sauna, a greenhouse). Pure.
//   room.roof = { shape: "flat" | "single" | "gable", eaves?: mm above the room's floor (default 2200), slope?: degrees
//                 (default 15 single, 25 gable), ridge?: "long" | "short" (gable: along the room's longer or shorter side),
//                 fall?: edge index (single: the roof falls towards that edge of the room), overhang?: mm (default 300), color?,
//                 outline?: [[x, y], …] the roof's own outline in plan mm (an L roof over a room of another shape; replaces the
//                 rectangle and the overhang; a gable takes the outline's rectangle), cover?: "solid" | "translucent" | "glass" }
// The roof is the room's outline turned to the roof's axes, as a rectangle, grown by the overhang. Heights are mm above the
// level's floor (the room's floorOffset counted). A slab ROOF_T thick, sloped with the prisms' `slope` (prisms.js).

export const ROOF_SHAPES = ['flat', 'single', 'gable'];
export const ROOF_COVERS = ['solid', 'translucent', 'glass'];
export const ROOF_DEFAULTS = { eaves: 2200, slope: { single: 15, gable: 25, flat: 0 }, overhang: 300 };
export const ROOF_T = 100;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = v => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };
const signedArea = poly => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/** The longest edge's direction of a polygon (a unit vector). */
function longAxis(poly) {
  let best = null, bl = -1;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bl) { bl = l; best = sub(q, p); } });
  return unit(best);
}
/** Extents of the polygon along u and v, as [min, max] pairs. */
const extents = (poly, u, v) => [poly.map(p => dot(p, u)), poly.map(p => dot(p, v))].map(a => [Math.min(...a), Math.max(...a)]);
const at = (u, v, s, t) => [u[0] * s + v[0] * t, u[1] * s + v[1] * t];
const rect = (u, v, [s0, s1], [t0, t1]) => [at(u, v, s0, t0), at(u, v, s1, t0), at(u, v, s1, t1), at(u, v, s0, t1)];

/** Problems with a room's roof: messages. */
export function roofErrors(roof, room) {
  const e = [];
  if (!roof || typeof roof !== 'object') return ['roof must be an object'];
  if (!ROOF_SHAPES.includes(roof.shape)) e.push(`roof.shape is ${ROOF_SHAPES.join(', ')}`);
  for (const k of ['eaves', 'overhang']) if (roof[k] !== undefined && !(Number.isFinite(roof[k]) && roof[k] >= 0)) e.push(`roof.${k} is mm, 0 or more`);
  if (roof.slope !== undefined && !(Number.isFinite(roof.slope) && roof.slope >= 0 && roof.slope < 80)) e.push('roof.slope is degrees, 0 to 80');
  if (roof.ridge !== undefined && !['long', 'short'].includes(roof.ridge)) e.push('roof.ridge is "long" or "short"');
  if (roof.fall !== undefined && !(Number.isInteger(roof.fall) && roof.fall >= 0 && roof.fall < (room?.polygon?.length ?? Infinity))) e.push('roof.fall is the index of an edge of the room');
  if (roof.outline !== undefined && !(Array.isArray(roof.outline) && roof.outline.length >= 3 && roof.outline.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) e.push('roof.outline is 3 or more plan points [x, y]');
  if (roof.cover !== undefined && !ROOF_COVERS.includes(roof.cover)) e.push(`roof.cover is ${ROOF_COVERS.join(', ')}`);
  if (roof.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(roof.color))) e.push('roof.color is #rrggbb');
  return e;
}

/**
 * The roof's pieces: [{ poly, z0, z1, slope?, low: [a, b] | null, ridge: [a, b] | null, fallTo: [x, y] | null }], plan mm, heights
 * above the level's floor. `slope` is the prisms' { top, bottom } form; `ridge` (gable) and the fall arrow from `poly`'s middle
 * to `fallTo` (single) are for the plan.
 */
export function roofPieces(room) {
  const r = room?.roof, poly = room?.polygon;
  if (!r || !Array.isArray(poly) || poly.length < 3 || roofErrors(r, room).length) return [];
  const base = (room.floorOffset ?? 0) + (r.eaves ?? ROOF_DEFAULTS.eaves), over = r.outline ? 0 : r.overhang ?? ROOF_DEFAULTS.overhang;
  const src = r.outline ?? poly;                                   // what the roof covers: its own outline, else the room grown by the overhang
  const tan = Math.tan(((r.slope ?? ROOF_DEFAULTS.slope[r.shape]) * Math.PI) / 180);
  if (r.shape === 'flat') {
    const u = longAxis(src), v = [-u[1], u[0]], [su, sv] = extents(src, u, v);
    if (r.outline) return [{ poly: r.outline, z0: base, z1: base + ROOF_T, ridge: null, fallTo: null }];
    return [{ poly: rect(u, v, [su[0] - over, su[1] + over], [sv[0] - over, sv[1] + over]), z0: base, z1: base + ROOF_T, ridge: null, fallTo: null }];
  }
  if (r.shape === 'single') {
    const i = r.fall ?? 0, p = poly[i], q = poly[(i + 1) % poly.length], e = unit(sub(q, p));
    const cw = signedArea(poly) < 0, n = cw ? [-e[1], e[0]] : [e[1], -e[0]];            // outward normal of the edge it falls to
    const [se, sn] = extents(src, e, n), s0 = sn[0] - over, s1 = sn[1] + over, L = s1 - s0, high = base + L * tan;
    const poly4 = r.outline ?? rect(e, n, [se[0] - over, se[1] + over], [s0, s1]), origin = at(e, n, se[0] - over, s0);
    const mid = at(e, n, (se[0] + se[1]) / 2, (s0 + s1) / 2);
    return [{ poly: poly4, z0: base, z1: high + ROOF_T, slope: { bottom: { origin, u: n, L, a: high, b: base }, top: { origin, u: n, L, a: high + ROOF_T, b: base + ROOF_T } }, ridge: null, fallTo: [mid[0] + n[0] * L * 0.35, mid[1] + n[1] * L * 0.35] }];
  }
  // gable: the ridge along the room's long (or short) side, in the middle; two slopes down to the eaves on either side
  const l = longAxis(src), u = r.ridge === 'short' ? [-l[1], l[0]] : l, v = [-u[1], u[0]], [su, sv] = extents(src, u, v);
  const s = [su[0] - over, su[1] + over], t0 = sv[0] - over, t1 = sv[1] + over, tm = (t0 + t1) / 2, half = (t1 - t0) / 2, top = base + half * tan;
  const side = (from, to, dir) => ({ poly: rect(u, v, s, from < to ? [from, to] : [to, from]), z0: base, z1: top + ROOF_T, slope: { bottom: { origin: at(u, v, s[0], from), u: dir, L: half, a: base, b: top }, top: { origin: at(u, v, s[0], from), u: dir, L: half, a: base + ROOF_T, b: top + ROOF_T } }, ridge: [at(u, v, s[0], tm), at(u, v, s[1], tm)], fallTo: null });
  return [side(t0, tm, v), side(t1, tm, [-v[0], -v[1]])];
}

/** The ridge height of a room's roof above the level's floor (the highest point), or null without a roof. */
export const roofTop = room => { const ps = roofPieces(room); return ps.length ? Math.max(...ps.map(p => p.z1)) : null; };
