// Floor areas (PLANTERN.md §7 Editor, §12 roadmap 8). Pure: level (and its derived geometry) in, numbers out, in mm².
//
// A room's floor: its outline (minus `holes`) is the gross area; what is not floor is taken off:
//   - solids standing on the floor inside the room (a chimney, a pillar, a boxed-in pipe: dead space; a raised
//     box under the ceiling is not),
//   - the opening that stairs from below make in its floor (geo.holes).
// A room without a floor (`floor: "none"`, open to the level below) has no floor area at all. Exterior rooms
// (balcony, terrace) are counted apart from the interior ones.
// Solids and openings are cut against the room with a convex clip: a non-convex solid is taken as a whole when it
// lies inside the room and ignored (reported in `approx`) when it only overlaps.

import { signedArea, pointInPolygon } from './polygon.js';

export const M2 = 1e6;   // mm² per m²

const area = p => Math.abs(signedArea(p));

/** Intersection of `subject` (any simple polygon) with a convex `clip` (Sutherland–Hodgman); [] when they do not meet. */
export function clipToConvex(subject, clip) {
  const sgn = signedArea(clip) < 0 ? -1 : 1;                       // inside is left of each edge for counter-clockwise clips
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const side = p => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const next = [];
    out.forEach((p, k) => {
      const q = out[(k + 1) % out.length], sp = side(p), sq = side(q);
      if (sp >= 0) next.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
    out = next;
  }
  return out;
}

const isConvex = poly => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-6) continue;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
};

/** The area of `piece` that lies in `room` (polygon): exact for a convex piece, whole/none for others. */
function areaInRoom(piece, room) {
  if (isConvex(piece)) return area(clipToConvex(room, piece));
  return piece.every(p => pointInPolygon(p, room)) ? area(piece) : null;
}

/**
 * Floor areas of a level: { rooms: [{ id, name, exterior, open, gross, solids: [{ id, area }], stairwell, net, approx }],
 * interior, exterior } with `interior` / `exterior` the sums of `net`. `geo` = buildModelGeometry(model).get(level.id)
 * (geo.holes = openings of stairs arriving from below; omitted = none).
 */
export function levelAreas(level, geo = {}) {
  const rooms = (level.rooms || []).filter(r => r.polygon?.length >= 3).map(r => {
    const gross = area(r.polygon) - (r.holes || []).reduce((s, h) => s + area(h), 0), approx = [];
    if (r.floor === 'none') return { id: r.id, name: r.name || r.id, exterior: !!r.exterior, open: true, gross, solids: [], stairwell: 0, net: 0, approx };
    const solids = [];
    for (const s of level.solids || []) {
      if ((s.base ?? 0) > 0 || !(s.polygon?.length >= 3)) continue;
      const a = areaInRoom(s.polygon, r.polygon);
      if (a === null) { approx.push(s.id); continue; }
      if (a > 1) solids.push({ id: s.id, area: a });
    }
    let stairwell = 0;
    // the opening of each stairs is the union of its steps (convex pieces that tile), so they are cut one by one
    const seen = new Set();
    for (const h of geo.holes || []) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      for (const piece of h.steps?.length ? h.steps : [h.poly]) {
        const a = areaInRoom(piece, r.polygon);
        if (a === null) approx.push(h.id); else stairwell += a;
      }
    }
    const net = Math.max(0, gross - solids.reduce((s, x) => s + x.area, 0) - stairwell);
    return { id: r.id, name: r.name || r.id, exterior: !!r.exterior, open: false, gross, solids, stairwell, net, approx };
  });
  const sum = ex => rooms.filter(r => r.exterior === ex).reduce((s, r) => s + r.net, 0);
  return { rooms, interior: sum(false), exterior: sum(true) };
}

/** Areas of every level of a model: Map(levelId → levelAreas), from buildModelGeometry(). */
export const modelAreas = (model, geos) => new Map(model.levels.map(l => [l.id, levelAreas(l, geos.get(l.id))]));

/** "12.3 m²" */
export const fmtArea = a => `${(a / M2).toFixed(a / M2 >= 100 ? 0 : 1)} m²`;
