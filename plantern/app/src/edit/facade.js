// Facade merging (PLANTERN.md §4: "a facade is one continuous wall that inner walls butt against").
// Pure. Takes the walls generateWalls() asks for and joins outer pieces that lie on one line into one
// wall; reconcile() then matches stored walls against the merged set.
//
// A piece is an outer piece when it is a solid wall (kind "wall") with a room on one side only, or
// with only exterior rooms (terrace, balcony) on its far side. Pieces join when they run the same
// way (within angleTol), lie on the same line (within offsetTol: rooms measured separately are a few
// mm apart), leave at most maxGap between them (an inner wall's end, or a short unmeasured stretch),
// and agree on thickness (when measured), height and base. The merged wall runs on the first piece's
// line; `from` lists every piece's edge along it (in order), then the facing edges.

import { edgeOfRef } from '../geometry/bound.js';

const r1 = v => Math.round(v * 10) / 10;

/**
 * A shared wall whose reference line lies on an exterior room's edge is re-expressed from the
 * interior room's side (same body), so facade pieces always run on the interior faces.
 */
function interiorSide(w, rooms) {
  if (w.from?.length !== 2) return w;
  const [own, far] = w.from.map(ref => edgeOfRef(ref, rooms));
  if (!own || !far || !own.room.exterior || far.room.exterior) return w;
  const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(...d) || 1, n = [-d[1] / L, d[0] / L], t = w.thickness;
  const shift = p => [r1(p[0] + n[0] * t), r1(p[1] + n[1] * t)];
  return { ...w, a: shift(w.b), b: shift(w.a), from: [w.from[1], w.from[0]], rooms: [far.room.id, own.room.id] };
}

/** mergeFacades(walls, roomsById, options) → { walls, merged: [{ id, pieces: [ids], offset }] } */
export function mergeFacades(walls, roomsById, options = {}) {
  const o = { maxGap: 600, offsetTol: 10, angleTol: 2, ...options };
  const sinTol = Math.sin(o.angleTol * Math.PI / 180);
  const norm = walls.map(w => interiorSide(w, roomsById));
  const outer = w => w.kind === 'wall' && w.from?.length && w.from.slice(1).every(ref => edgeOfRef(ref, roomsById)?.room.exterior);
  const frame = w => { const d = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(...d) || 1; return { u: [d[0] / L, d[1] / L], L }; };
  const measured = w => (w.from.length > 1 ? w.thickness : null);      // a gap to a facing room is a measurement
  const used = new Set(), out = [], merged = [];
  norm.forEach((w, i) => {
    if (used.has(i)) return;
    if (!outer(w)) { out.push(w); return; }
    const { u } = frame(w), along = p => (p[0] - w.a[0]) * u[0] + (p[1] - w.a[1]) * u[1], across = p => (p[1] - w.a[1]) * u[0] - (p[0] - w.a[0]) * u[1];
    // every outer piece on this line, same way round, ordered along it
    const group = norm.map((x, j) => ({ x, j })).filter(({ x, j }) => {
      if (used.has(j) || !outer(x)) return false;
      const v = frame(x).u;
      return u[0] * v[0] + u[1] * v[1] > 0 && Math.abs(u[0] * v[1] - u[1] * v[0]) <= sinTol && Math.abs(across(x.a)) <= o.offsetTol && Math.abs(across(x.b)) <= o.offsetTol;
    }).sort((p, q) => along(p.x.a) - along(q.x.a));
    // chains of pieces that may join; this wall's chain becomes one wall
    let chain = [];
    const flush = () => {
      if (!chain.length) return;
      if (chain.some(c => c.j === i) || chain.every(c => !used.has(c.j))) {
        chain.forEach(c => used.add(c.j));
        if (chain.length === 1) out.push(chain[0].x);
        else {
          const first = chain[0].x, last = chain[chain.length - 1].x, t = along(last.b) - along(first.a);   // length from the first piece's start
          const thick = chain.map(c => measured(c.x)).find(v => v !== null) ?? first.thickness;
          out.push({ ...first, b: [r1(first.a[0] + u[0] * t), r1(first.a[1] + u[1] * t)], thickness: thick,
            from: [...chain.map(c => c.x.from[0]), ...chain.flatMap(c => c.x.from.slice(1))],
            rooms: [...new Set(chain.flatMap(c => c.x.rooms))] });
          merged.push({ id: first.id, pieces: chain.map(c => c.x.id), offset: r1(Math.max(...chain.map(c => Math.abs(across(c.x.a))))) });
        }
      }
      chain = [];
    };
    for (const c of group) {
      const prev = chain[chain.length - 1]?.x;
      const fits = prev && along(c.x.a) - along(prev.b) <= o.maxGap && along(c.x.a) - along(prev.b) >= -1
        && (prev.height ?? null) === (c.x.height ?? null) && (prev.base ?? null) === (c.x.base ?? null)
        && !(measured(prev) !== null && measured(c.x) !== null && Math.abs(measured(prev) - measured(c.x)) > 5);
      if (prev && !fits) flush();
      chain.push(c);
    }
    flush();
    if (!used.has(i)) { used.add(i); out.push(w); }
  });
  return { walls: out, merged };
}
