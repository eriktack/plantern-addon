// Furnishing a room from photos (issue #22, the furnish-room skill in .claude/skills/furnish-room/): the room as an agent
// needs it, a top-down ASCII plan that fits a narrow window, and the agent's proposal turned into addObject() specs.
// Pure: the model in, data and text out; tools/furnish.js does the I/O (Plantern's server) and the saving.
//
// A proposal speaks in the room's own terms, the way the room was measured: walls by letter (A runs from corner 0 to
// corner 1, clockwise, the room on the right; src/capture/labels.js), distances in mm from a corner or from wall faces.
//
//   { "name": "Sofa", "blueprint": "sofa", "params": { "variant": "three_seat", "width": 2100 },
//     "place": { "wall": "B", "from": "start", "offset": 400 } }            against wall B, 400 mm from its start corner
//   { "name": "Dining table", "blueprint": "dining-table", "params": { … },
//     "place": { "middle": [{ "wall": "A", "distance": 1200 }, { "wall": "B", "distance": 900 }], "facing": "A" } }
//   { "name": "Lamp", "blueprint": "table-lamp", "place": { "opening": "o_k_win", "at": "sill" } }   on a window sill
//   { "name": "Boiler", "box": true, "size": [600, 600, 1800], "color": "#e8e8e8", "place": { … } }  no library model
//
// `from` is "start" (the wall's first corner, walking clockwise) or "end"; `offset` reaches the object's nearest side.
// `middle` puts the object's middle `distance` mm out from the faces of two walls that are not parallel. `facing`
// (a wall letter) turns the object's front toward that wall; without it the front faces away from the first wall.
// `gap` (mm) leaves room between a wall and the object's back; `z` (mm) lifts it (a wall cabinet).

import { wallName, wallIndex } from '../capture/labels.js';
import { buildLevelGeometry } from '../geometry/level.js';
import { pointInPolygon } from '../geometry/polygon.js';
import { wallInfo } from '../edit/inspect.js';
import { bearingFromHeading } from '../model/orientation.js';
import { displayName, fallbackName } from '../model/names.js';

const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const r0 = v => Math.round(v);
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compass = bearing => COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

function levelAndRoom(model, levelId, roomId) {
  const level = model.levels.find(l => l.id === levelId);
  if (!level) throw new Error(`no level "${levelId}"`);
  const room = (level.rooms || []).find(r => r.id === roomId);
  if (!room) throw new Error(`no room "${roomId}" on ${levelId} (rooms: ${(level.rooms || []).map(r => r.id).join(', ')})`);
  return { level, room };
}

/** Edge i of a room: its corners, length, direction, and the inward normal (rooms are clockwise: inside is on the right). */
function edge(room, i) {
  const P = room.polygon, p = P[i], q = P[(i + 1) % P.length], L = d2(p, q) || 1, u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
  return { i, p, q, L, u, n: [u[1], -u[0]] };
}

/** The walls along edge i of the room, each with the side that looks into the room, and the stretch of the edge it covers. */
function wallsAlong(level, room, i) {
  const ref = `${room.id}#e${i}`, e = edge(room, i);
  return (level.walls || []).filter(w => w.from?.includes(ref) && w.kind !== 'virtual').map(w => {
    const info = wallInfo(level, w.id);
    const side = info?.sides.right.includes(room.id) ? 'right' : 'left';
    const s = [dot([w.a[0] - e.p[0], w.a[1] - e.p[1]], e.u), dot([w.b[0] - e.p[0], w.b[1] - e.p[1]], e.u)].sort((x, y) => x - y);
    return { wall: w, side, s0: Math.max(0, s[0]), s1: Math.min(e.L, s[1]) };
  });
}

/** Where a point along a wall's reference line (t mm from its a end) lies along edge i (s mm from the edge's start corner). */
const alongEdge = (e, w, t) => {
  const L = d2(w.a, w.b) || 1, u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
  return dot([w.a[0] + u[0] * t - e.p[0], w.a[1] + u[1] * t - e.p[1]], e.u);
};

/**
 * The room as an agent needs it: its walls by letter with length, compass direction (where the wall is, seen from the
 * middle of the room), thickness and the doors and windows in them (from the wall's start corner), its ceiling, and
 * what already stands in it.
 */
export function roomContext(model, levelId, roomId) {
  const { level, room } = levelAndRoom(model, levelId, roomId);
  const geo = buildLevelGeometry(level), north = model.site?.northAngleDeg ?? 0;
  const walls = room.polygon.map((_, i) => {
    const e = edge(room, i);
    // the wall lies outside the room, the opposite way to the inward normal
    const out = Math.atan2(-e.n[1], -e.n[0]) * 180 / Math.PI;
    const along = wallsAlong(level, room, i);
    const openings = along.flatMap(({ wall: w }) => (level.openings || []).filter(o => o.wall === w.id).map(o => {
      const s = [alongEdge(e, w, o.offset), alongEdge(e, w, o.offset + o.width)].sort((x, y) => x - y);
      return { id: o.id, type: o.type, ...(o.name ? { name: o.name } : {}), fromStart: r0(s[0]), width: o.width, sill: o.sill ?? 0, head: o.head };
    })).filter(o => o.fromStart > -1 && o.fromStart < e.L).sort((a, b) => a.fromStart - b.fromStart);
    return {
      letter: wallName(i), length: r0(e.L), side: compass(bearingFromHeading(out, north)),
      walls: along.map(a => ({ id: a.wall.id, thickness: a.wall.thickness, kind: a.wall.kind ?? 'wall' })),
      openings,
    };
  });
  const objects = (level.objects || []).filter(o => {
    const fp = geo.objectFootprint(o);
    if (!fp) return false;
    const c = [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length];
    return pointInPolygon(c, room.polygon);
  }).map(o => ({ id: o.id, name: fallbackName(o, 'object'), ...(o.blueprint ? { blueprint: o.blueprint } : {}), size: o.size }));
  const xs = room.polygon.map(p => p[0]), ys = room.polygon.map(p => p[1]);
  let area = 0;
  room.polygon.forEach((p, i) => { const q = room.polygon[(i + 1) % room.polygon.length]; area += p[0] * q[1] - q[0] * p[1]; });
  return {
    level: level.id, room: { id: room.id, name: displayName(room), ceiling: room.ceilingHeight ?? level.ceilingHeight ?? 2400, area: Math.round(Math.abs(area) / 1e4) / 100, extent: [r0(Math.max(...xs) - Math.min(...xs)), r0(Math.max(...ys) - Math.min(...ys))] },
    walls, objects,
  };
}

/** Front toward a direction d (unit): an object's front faces the right of its width axis (src/model/assets.js). */
const headingFacing = d => Math.atan2(d[0], -d[1]) * 180 / Math.PI;

/**
 * One proposal item to an addObject() spec. `size` is the object's built size [w, d, h] (the server's build of its
 * blueprint, or the item's own size for a box). Returns { spec } or { error }.
 */
export function itemToSpec(model, levelId, roomId, item, size) {
  const { level, room } = levelAndRoom(model, levelId, roomId);
  if (!item?.place) return { error: `${item?.name ?? 'item'}: no place` };
  if (!Array.isArray(size) || size.length !== 3) return { error: `${item.name}: no size` };
  const base = {
    ...(item.name ? { name: item.name } : {}),
    ...(item.box ? { color: item.color } : { blueprint: item.blueprint, params: item.params ?? {}, ...(item.partMaterials ? { partMaterials: item.partMaterials } : {}) }),
    size,
    ...(item.z !== undefined ? { z: item.z } : {}),
    // from photos: the size, and the height when it was set, are estimates until measured
    assumed: ['size', ...(item.z !== undefined ? ['z'] : [])],
  };
  const pl = item.place, edgeOf = letter => {
    const i = wallIndex(String(letter));
    if (i === null || i < 0 || i >= room.polygon.length) throw new Error(`${item.name}: room ${room.id} has no wall "${letter}" (A to ${wallName(room.polygon.length - 1)})`);
    return edge(room, i);
  };
  try {
    if (pl.opening) { const { z, ...rest } = base; return { spec: { ...rest, assumed: ['size'], attach: { opening: pl.opening, at: pl.at ?? 'sill' } } }; }
    if (pl.wall !== undefined) {
      const e = edgeOf(pl.wall), w = size[0], off = Number(pl.offset ?? 0);
      const s0 = pl.from === 'end' ? e.L - off - w : off, s1 = s0 + w;
      if (s0 < -1 || s1 > e.L + 1) return { error: `${item.name}: ${r0(w)} mm wide at ${off} mm from the ${pl.from === 'end' ? 'end' : 'start'} does not fit on wall ${pl.wall} (${r0(e.L)} mm)` };
      const host = wallsAlong(level, room, e.i).find(a => a.s0 <= s0 + 1 && a.s1 >= s1 - 1);
      if (!host) return { error: `${item.name}: no single wall covers ${r0(s0)}–${r0(s1)} mm of wall ${pl.wall}` };
      const L = d2(host.wall.a, host.wall.b), u = [(host.wall.b[0] - host.wall.a[0]) / L, (host.wall.b[1] - host.wall.a[1]) / L];
      const t = s => dot([e.p[0] + e.u[0] * s - host.wall.a[0], e.p[1] + e.u[1] * s - host.wall.a[1]], u);
      const offset = r0(Math.min(t(s0), t(s1)));
      return { spec: { ...base, attach: { wall: host.wall.id, side: host.side, offset, ...(pl.gap ? { gap: Number(pl.gap) } : {}) } } };
    }
    if (Array.isArray(pl.middle) && pl.middle.length === 2) {
      const [A, B] = pl.middle.map(m => ({ e: edgeOf(m.wall), d: Number(m.distance) }));
      // the point `d` in from each wall face: the two lines p + n·d along u, intersected
      const pa = [A.e.p[0] + A.e.n[0] * A.d, A.e.p[1] + A.e.n[1] * A.d], pb = [B.e.p[0] + B.e.n[0] * B.d, B.e.p[1] + B.e.n[1] * B.d];
      const den = A.e.u[0] * B.e.u[1] - A.e.u[1] * B.e.u[0];
      if (Math.abs(den) < 1e-6) return { error: `${item.name}: walls ${pl.middle[0].wall} and ${pl.middle[1].wall} are parallel; give two walls at an angle` };
      const k = ((pb[0] - pa[0]) * B.e.u[1] - (pb[1] - pa[1]) * B.e.u[0]) / den;
      const mid = [pa[0] + A.e.u[0] * k, pa[1] + A.e.u[1] * k];
      if (!pointInPolygon(mid, room.polygon)) return { error: `${item.name}: that middle is outside the room` };
      const faceWall = pl.facing !== undefined ? edgeOf(pl.facing) : null;
      // facing a wall: the front looks toward it (against its inward normal); otherwise away from the first wall
      const dir = faceWall ? [-faceWall.n[0], -faceWall.n[1]] : A.e.n;
      const deg = pl.rotationDeg !== undefined ? Number(pl.rotationDeg) : headingFacing(dir);
      const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), [w, d] = size;
      const pos = [r0(mid[0] - (w / 2 * c - d / 2 * s)), r0(mid[1] - (w / 2 * s + d / 2 * c))];
      return { spec: { ...base, pos, rotationDeg: Math.round(((deg % 360) + 360) % 360 * 10) / 10 } };
    }
    return { error: `${item.name}: place needs wall + offset, middle (two walls), or opening` };
  } catch (err) { return { error: err.message }; }
}

/**
 * A top-down plan of the room in text, at most `width` columns (default 72) so it is not wrapped in a narrow window.
 * Walls are '#', windows '=', doors '/', passages '.', wall letters outside their wall; objects are filled with their
 * key (1–9, then a–z) and listed under the plan. Plan north is up. Returns the text.
 */
export function asciiPlan(model, levelId, roomId, { width = 72, objects = null } = {}) {
  const { level, room } = levelAndRoom(model, levelId, roomId);
  const geo = buildLevelGeometry(level), ctx = roomContext(model, levelId, roomId);
  const xs = room.polygon.map(p => p[0]), ys = room.polygon.map(p => p[1]);
  const pad = 2, cols = Math.max(20, Math.min(width, 200)) - 2 * pad - 1;
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = Math.max((maxX - minX) / cols, 1), sy = sx * 2;      // a character is about twice as tall as it is wide
  const W = Math.ceil((maxX - minX) / sx) + 2 * pad + 1, H = Math.ceil((maxY - minY) / sy) + 2 * pad + 1;
  const grid = Array.from({ length: H }, () => Array(W).fill(' '));
  const cell = ([x, y]) => [Math.round((x - minX) / sx) + pad, Math.round((maxY - y) / sy) + pad];
  const put = (p, ch, overwrite = true) => { const [c, r] = cell(p); if (grid[r]?.[c] !== undefined && (overwrite || grid[r][c] === ' ')) grid[r][c] = ch; };
  const line = (a, b, ch) => { const n = Math.max(1, Math.ceil(d2(a, b) / Math.min(sx, sy) * 1.5)); for (let k = 0; k <= n; k++) put([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], ch); };
  // objects first (their key fills the footprint), then the walls over them
  const zOf = o => geo.objectZ(o) ?? 0;
  const inRoom = fp => { if (!fp?.length) return false; const c = [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length]; return pointInPolygon(c, room.polygon); };
  const list = (objects ?? (level.objects || []).map(o => ({ o, footprint: geo.objectFootprint(o) }))).filter(x => inRoom(x.footprint));
  const keys = '123456789abcdefghijklmnopqrstuvwxyz';
  list.forEach((x, k) => { x.key = keys[k] ?? '*'; });
  const legend = list.map(({ o, label, key }) => `${key}  ${label ?? fallbackName(o, 'object')} · ${o.size.map(r0).join(' × ')} mm${o.attach?.wall ? ' · on a wall' : o.attach?.opening ? ' · in an opening' : ''}${zOf(o) > 0 ? ` · ${r0(zOf(o))} mm up` : ''}`);
  // the highest first, so what stands on the floor is drawn over what hangs above it (a wall cabinet over a counter)
  [...list].sort((a, b) => zOf(b.o) - zOf(a.o)).forEach(({ footprint, key }) => {
    const fxs = footprint.map(p => p[0]), fys = footprint.map(p => p[1]);
    const c = [fxs.reduce((s, v) => s + v, 0) / fxs.length, fys.reduce((s, v) => s + v, 0) / fys.length];
    let drawn = false;
    for (let y = Math.min(...fys); y <= Math.max(...fys); y += sy / 2) for (let x = Math.min(...fxs); x <= Math.max(...fxs); x += sx / 2) {
      if (pointInPolygon([x, y], footprint)) { put([x, y], key); drawn = true; }
    }
    if (!drawn) put(c, key);
  });
  room.polygon.forEach((p, i) => {
    const e = edge(room, i);
    line(e.p, e.q, '#');
    for (const op of ctx.walls[i].openings) {
      const ch = op.type === 'window' ? '=' : op.type === 'door' ? '/' : '.';
      const a = Math.max(0, op.fromStart), b = Math.min(e.L, op.fromStart + op.width);
      line([e.p[0] + e.u[0] * a, e.p[1] + e.u[1] * a], [e.p[0] + e.u[0] * b, e.p[1] + e.u[1] * b], ch);
    }
    // the wall's letter just outside the middle of the wall
    const m = [(e.p[0] + e.q[0]) / 2 - e.n[0] * sy * 1.2, (e.p[1] + e.q[1]) / 2 - e.n[1] * sy * 1.2];
    put(m, wallName(i));
  });
  const scale = Math.round(sx / 10) * 10 || r0(sx);
  const head = `${ctx.room.name} (${room.id}) · ${ctx.room.extent.join(' × ')} mm · ceiling ${ctx.room.ceiling} · plan north up · one character ≈ ${scale} mm across, ${scale * 2} mm down`;
  const walls = ctx.walls.map(w => `${w.letter} ${w.length} mm (${w.side})${w.openings.length ? ': ' + w.openings.map(o => `${o.type} ${o.width} at ${o.fromStart}`).join(', ') : ''}`);
  return [head, '', ...grid.map(r => r.join('').replace(/\s+$/, '')), '', 'Walls (clockwise from corner 0):', ...walls.map(s => '  ' + s), ...(legend.length ? ['', 'Objects:', ...legend.map(s => '  ' + s)] : [])].join('\n');
}
