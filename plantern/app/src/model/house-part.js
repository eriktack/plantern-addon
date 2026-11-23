// The house itself on the yard's level (decision 314): the ground floor of a house with a yard also holds the yard's outdoor
// rooms and outbuildings (pergola, carport, greenhouse, sauna) and the yard's trees and stumps. The level's own view shows only
// the house: its connected indoor rooms, the outdoor rooms attached to them (a porch, a balcony), and what stands within the
// house's reach. The Yard view shows the rest. Pure.

const TOUCH = 60;          // mm: rooms this close are joined (a shared wall's two faces are a wall's thickness apart, recorded on the wall)
const REACH = 900;         // mm beyond the house's rooms in which fixtures, solids and objects count as the house's (outer walls, eaves)
const OWN = 300;           // mm: a thing this near another room (not the house's) is that room's: a pergola's corner post (decision 318)

const area = P => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const box = P => [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
const near = (a, b, d) => a[0] - d <= b[2] && b[0] - d <= a[2] && a[1] - d <= b[3] && b[1] - d <= a[3];
const inside = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
/** Distance from a point to a polygon's area: 0 inside. */
const polyDist = (p, P) => (inside(p, P) ? 0 : Math.min(...P.map((a, i) => segDist(p, a, P[(i + 1) % P.length]))));

/**
 * The house's rooms on a level: { rooms: Set of ids, box: [x0, y0, x1, y1] (mm, grown by REACH) } or null when the level has no
 * indoor rooms. Rooms are joined when a wall names both, or when their outlines' boxes come within TOUCH of each other (indoor
 * rooms) ; the house is the joined group of indoor rooms with the largest floor area, plus the outdoor rooms a wall joins to it.
 */
export function houseRooms(level) {
  const rooms = (level?.rooms || []).filter(r => r.polygon?.length >= 3), indoor = rooms.filter(r => !r.exterior);
  if (!indoor.length) return null;
  const boxes = new Map(rooms.map(r => [r.id, box(r.polygon)]));
  const links = new Map(rooms.map(r => [r.id, new Set()]));
  const link = (a, b) => { if (a !== b && links.has(a) && links.has(b)) { links.get(a).add(b); links.get(b).add(a); } };
  for (const w of level.walls || []) { const rs = w.rooms || []; for (const a of rs) for (const b of rs) link(a, b); }
  // indoor rooms on either side of a wall (its thickness apart) are joined by that wall; near boxes join rooms measured apart
  for (const a of indoor) for (const b of indoor) if (a !== b && near(boxes.get(a.id), boxes.get(b.id), TOUCH)) link(a.id, b.id);
  const isIndoor = new Set(indoor.map(r => r.id)), seen = new Set(), groups = [];
  for (const r of indoor) {
    if (seen.has(r.id)) continue;
    const g = [], stack = [r.id];
    while (stack.length) { const id = stack.pop(); if (seen.has(id) || !isIndoor.has(id)) continue; seen.add(id); g.push(id); stack.push(...links.get(id)); }
    groups.push(g);
  }
  const byId = new Map(rooms.map(r => [r.id, r])), size = g => g.reduce((s, id) => s + area(byId.get(id).polygon), 0);
  const main = groups.sort((a, b) => size(b) - size(a))[0], keep = new Set(main);
  for (const id of main) for (const o of links.get(id)) if (!isIndoor.has(o)) keep.add(o);       // a porch or balcony walled to the house
  const pts = [...keep].flatMap(id => byId.get(id).polygon), b = box(pts);
  return { rooms: keep, box: [b[0] - REACH, b[1] - REACH, b[2] + REACH, b[3] + REACH] };
}

/**
 * The level as its own view shows it: only the house (houseRooms) and what stands in its reach. `geo` = the level's geometry
 * (for where fixtures and objects are). The same level back when it has no indoor rooms.
 */
export function houseOnly(level, geo) {
  const h = houseRooms(level);
  if (!h) return level;
  // in the house's reach, and not in or right by a room of the yard's (a pergola's post can stand within the reach)
  const others = (level.rooms || []).filter(r => !h.rooms.has(r.id) && r.polygon?.length >= 3).map(r => r.polygon);
  const inBox = p => Array.isArray(p) && p[0] >= h.box[0] && p[0] <= h.box[2] && p[1] >= h.box[1] && p[1] <= h.box[3]
    && !others.some(P => polyDist(p, P) <= OWN);
  const mid = P => (P?.length ? P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]) : null);
  const walls = (level.walls || []).filter(w => (w.rooms?.length ? w.rooms.some(id => h.rooms.has(id)) : inBox(mid([w.a, w.b]))));
  const wallIds = new Set(walls.map(w => w.id));
  return {
    ...level,
    rooms: (level.rooms || []).filter(r => h.rooms.has(r.id)),
    walls,
    openings: (level.openings || []).filter(o => wallIds.has(o.wall)),
    solids: (level.solids || []).filter(s => inBox(mid(s.polygon))),
    objects: (level.objects || []).filter(o => inBox(mid(geo?.objectFootprint?.(o)) ?? o.pos)),
    fixtures: (level.fixtures || []).filter(f => { const p = geo?.fixturePos?.(f); return p ? inBox(p) : true; }),
  };
}
