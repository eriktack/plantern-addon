// Rooms → walls generator (PLANTERN.md §4). Pure.
//
// Every room edge becomes a wall on the measured face with the thickness extending away from the
// room (justify "left", walls run clockwise). Where two rooms' edges face each other across a gap
// that is a plausible wall thickness, ONE shared wall is produced; its thickness is the measured
// distance between the two faces. Partial overlaps are split so the shared part is exact. Two rooms
// touching with no gap (an alcove, an open-plan part of one room) share a `virtual` wall: open, no body.
//
// generateWalls(rooms, options) → { walls, shared, report }
//   options.defaultThickness   mm for edges with no neighbour (default 200)
//   options.maxThickness       largest face distance still treated as one shared wall (default 600)
//   options.minOverlap         shortest overlap along the edges worth sharing, mm (default 100)
//   options.edges              per-edge overrides, key "<roomId>#e<i>" → { thickness, kind, height, base, style }
//   options.exteriorKind       wall kind for edges of `exterior` rooms with no override (default "virtual")
//   options.angleTol           parallel tolerance, degrees (default 0.5)
//   options.usedIds            ids already taken (existing walls); generated ids avoid them
//   options.skip               Set of edge keys that already have a wall: nothing is generated for them
//   options.gaps               Map edge key → [[t0, t1]] mm along the edge that still need a wall; solo walls are clipped to them
//   options.solids             the level's solids: stretches of an edge along a solid's face beyond it get no wall,
//                              and two rooms with a chimney between them share no wall there (PLANTERN.md §4)
// walls[].rooms lists the rooms a wall bounds and walls[].from the room edges it was made from (the
// wall is bound to them, PLANTERN.md §4); walls carry no colours (add them by hand). Two edges up to
// angleTol off parallel still share a wall: it follows the first room's face, its thickness is the
// gap at the middle of the overlap, and the difference between the gaps at the overlap's ends is
// reported as `tilt` in `shared`.

import { sub, dot, cross, len } from '../geometry/vec.js';
import { solidCover, subtractIntervals } from '../geometry/solids.js';

const edgeKey = (room, i) => `${room.id}#e${i}`;
const base = id => id.replace(/^r_/, '');

/** Parameter interval [t0, t1] (mm along edge, 0..L) of an edge that is covered by shared segments. */
function mergeIntervals(iv) {
  iv.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [lo, hi] of iv) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + 1e-6) last[1] = Math.max(last[1], hi); else out.push([lo, hi]);
  }
  return out;
}

export function generateWalls(rooms, options = {}) {
  const o = { defaultThickness: 200, maxThickness: 600, minOverlap: 100, exteriorKind: 'virtual', angleTol: 0.5, edges: {}, ...options };
  const sinTol = Math.sin(o.angleTol * Math.PI / 180);
  const report = { warnings: [], solo: [] };

  // all edges, with their frame
  const edges = [];
  for (const room of rooms) {
    room.polygon.forEach((p, i) => {
      const q = room.polygon[(i + 1) % room.polygon.length], d = sub(q, p), L = len(d);
      if (L > 1e-6 && !o.skip?.has(edgeKey(room, i))) edges.push({ room, i, key: edgeKey(room, i), p, q, L, u: [d[0] / L, d[1] / L], shared: [], solid: solidCover(p, q, o.solids) });
    });
  }

  // pair antiparallel edges that lie on the wall side (left) of each other within maxThickness
  const pairs = [];
  for (let x = 0; x < edges.length; x++) for (let y = x + 1; y < edges.length; y++) {
    const A = edges[x], B = edges[y];
    if (A.room === B.room) continue;
    if (Math.abs(cross(A.u, B.u)) > sinTol || dot(A.u, B.u) > 0) continue;       // not antiparallel
    // overlap along A's direction
    const tb0 = dot(sub(B.q, A.p), A.u), tb1 = dot(sub(B.p, A.p), A.u);          // B runs opposite to A
    const lo = Math.max(0, Math.min(tb0, tb1)), hi = Math.min(A.L, Math.max(tb0, tb1));
    if (hi - lo < o.minOverlap) continue;
    // gap (>0: B on A's left) where B's line passes A-parameter t; equal along the edge when exactly parallel
    const gapAt = t => cross(A.u, sub([B.p[0] + B.u[0] * (t - tb1) / dot(B.u, A.u), B.p[1] + B.u[1] * (t - tb1) / dot(B.u, A.u)], A.p));
    const gap = gapAt((lo + hi) / 2);
    if (gap < -0.5 || gap > o.maxThickness) continue;                              // overlapping, or too far apart
    // not where either edge runs along a solid (a chimney between two rooms is not a wall)
    const toA = s => dot(sub([B.p[0] + B.u[0] * s, B.p[1] + B.u[1] * s], A.p), A.u);
    const blocked = [...A.solid, ...B.solid.map(([s0, s1]) => [toA(s1), toA(s0)])].sort((m, n) => m[0] - n[0]);
    for (const [l2, h2] of subtractIntervals(lo, hi, blocked)) if (h2 - l2 >= o.minOverlap) pairs.push({ A, B, gap, lo: l2, hi: h2, tilt: Math.abs(gapAt(h2) - gapAt(l2)) });
  }

  // an edge may pair with several neighbours (e.g. two rooms against one long wall): first claim wins per span
  const claimed = new Map(edges.map(e => [e, []]));
  const shared = [];
  for (const pr of pairs.sort((m, n) => m.gap - n.gap)) {
    const { A, B } = pr;
    const free = (E, lo, hi) => !claimed.get(E).some(([l, h]) => Math.min(h, hi) - Math.max(l, lo) > 1);
    const tB = [dot(sub(B.q, A.p), A.u), dot(sub(B.p, A.p), A.u)];                // B's span in A's coordinates
    const spanB = [Math.min(...tB), Math.max(...tB)];
    if (!free(A, pr.lo, pr.hi)) continue;
    const bLo = B.L - (pr.hi - spanB[0]), bHi = B.L - (pr.lo - spanB[0]);          // same span in B's own direction
    if (!free(B, bLo, bHi)) continue;
    claimed.get(A).push([pr.lo, pr.hi]);
    claimed.get(B).push([bLo, bHi]);
    shared.push({ ...pr, bLo, bHi });
  }

  const walls = [], used = new Set(o.usedIds || []);
  const uid = id => { let n = id, k = 2; while (used.has(n)) n = `${id}_${k++}`; used.add(n); return n; };
  const sharedOut = [];
  const spec = (E, over = {}) => {
    const ov = o.edges[E.key] || {};
    const kind = ov.kind ?? (E.room.exterior ? o.exteriorKind : 'wall');
    const w = { kind };
    if (kind === 'railing') w.style = ov.style ?? 'balusters';
    return { kind, extra: { ...(ov.height !== undefined ? { height: ov.height } : {}), ...(ov.base !== undefined ? { base: ov.base } : {}), ...(w.style ? { style: w.style } : {}) }, thickness: ov.thickness, ...over };
  };
  const point = (E, t) => [Math.round((E.p[0] + E.u[0] * t) * 10) / 10, Math.round((E.p[1] + E.u[1] * t) * 10) / 10];

  const emit = (E, t0, t1, id, thickness, rooms, kind, extra, from) => {
    const w = { id: uid(id), kind, a: point(E, t0), b: point(E, t1) };
    if (kind === 'virtual') { w.thickness = 0; w.justify = 'center'; }
    else { w.thickness = thickness; w.justify = 'left'; }
    Object.assign(w, extra);
    w.rooms = rooms;
    w.from = from;
    walls.push(w);
    return w;
  };

  for (const E of edges) {
    const ivs = mergeIntervals(claimed.get(E).map(x => [...x]));
    // split the edge into shared and solo segments, in order along the edge
    const segs = []; let at = 0;
    for (const [lo, hi] of ivs) { if (lo > at + 1e-6) segs.push({ lo: at, hi: lo, shared: false }); segs.push({ lo, hi, shared: true }); at = hi; }
    if (at < E.L - 1e-6) segs.push({ lo: at, hi: E.L, shared: false });
    for (const sg of segs) if (sg.shared) sg.pr = shared.find(p => (p.A === E && Math.abs(p.lo - sg.lo) < 1e-6) || (p.B === E && Math.abs(p.bLo - sg.lo) < 1e-6));
    // a leftover at the end of the edge no longer than the shared wall next to it is thick is that
    // wall's corner (where a neighbour's side wall meets it): the shared wall takes it
    // ...or no longer than the shared wall on the room's neighbouring edge at that corner is thick: the
    // neighbour's outer corner (a closet's corner, its two walls of different thickness), mitred there
    const cornerGap = atEnd => {
      const n = E.room.polygon.length, N = edges.find(x => x.room === E.room && x.i === (atEnd ? (E.i + 1) % n : (E.i + n - 1) % n));
      if (!N) return 0;
      // its shared wall reaches the corner, or will once it takes its own corner leftover (up to its thickness)
      const near = (t, p) => t < p.gap + 6;
      const touches = p => p.A === N ? (atEnd ? near(p.lo, p) : near(N.L - p.hi, p)) : p.B === N ? (atEnd ? near(p.bLo, p) : near(N.L - p.bHi, p)) : false;
      return Math.max(0, ...shared.filter(touches).map(p => p.gap));
    };
    for (const [k, nb] of [[0, 1], [segs.length - 1, segs.length - 2]]) {
      const sg = segs[k], adj = segs[nb];
      if (!sg || !adj || sg.shared || sg.absorbed || !adj.shared || adj.pr?.A !== E || sg.hi - sg.lo > Math.max(adj.pr.gap, cornerGap(k > 0)) + 5) continue;
      if (E.solid.some(([a, b]) => Math.min(b, sg.hi) - Math.max(a, sg.lo) > 1)) continue;          // a solid's face, not a corner
      if (k === 0) adj.lo = sg.lo; else adj.hi = sg.hi;
      sg.absorbed = true;
    }
    // the same between two shared walls: a leftover no longer than their thickness is where a thin
    // partition between the two neighbours butts into this wall; the shared wall before it runs on
    for (let k = 1; k < segs.length - 1; k++) {
      const sg = segs[k];
      if (sg.shared || sg.absorbed || E.solid.some(([a, b]) => Math.min(b, sg.hi) - Math.max(a, sg.lo) > 1)) continue;
      const adj = [segs[k - 1], segs[k + 1]].find(x => x?.shared && !x.absorbed && x.pr?.A === E && sg.hi - sg.lo <= x.pr.gap + 5);
      if (!adj) continue;
      if (adj === segs[k - 1]) adj.hi = sg.hi; else adj.lo = sg.lo;
      sg.absorbed = true;
    }
    const kept = segs.filter(sg => !sg.absorbed);
    segs.length = 0; segs.push(...kept);
    const split = segs.length > 1;
    segs.forEach((sg, k) => {
      const tag = `w_${base(E.room.id)}_e${E.i}${split ? String.fromCharCode(97 + k) : ''}`;
      if (!sg.shared) {
        const s = spec(E);
        // only the stretches that no existing wall covers
        const need = o.gaps?.get(E.key);
        const parts = (need ? need.map(([g0, g1]) => [Math.max(g0, sg.lo), Math.min(g1, sg.hi)]).filter(([a, b]) => b - a > 1) : [[sg.lo, sg.hi]])
          .flatMap(([a, b]) => subtractIntervals(a, b, E.solid));                                     // none along a solid
        parts.forEach(([a, b], j) => emit(E, a, b, parts.length > 1 ? `${tag}_${j + 1}` : tag, s.thickness ?? o.defaultThickness, [E.room.id], s.kind, s.extra, [E.key]));
        return;
      }
      // shared: the wall belongs to the lower-ordered room's edge; the other room's edge only records it
      const pr = sg.pr;
      if (!pr || pr.B === E) return;                                                   // emitted from the A side
      const s = spec(E);
      // only the stretches that still need a wall (when filling in), like solo walls
      const need = o.gaps?.get(E.key);
      const parts = need ? need.map(([g0, g1]) => [Math.max(g0, sg.lo), Math.min(g1, sg.hi)]).filter(([a, b]) => b - a > 1) : [[sg.lo, sg.hi]];
      parts.forEach(([a, b], j) => {
        // touching (no gap): open between the two rooms, a virtual wall; otherwise a wall as thick as the gap
      const kind = pr.gap <= 0.5 ? 'virtual' : s.kind === 'virtual' ? 'wall' : s.kind;
      const w = emit(E, a, b, parts.length > 1 ? `${tag}_${j + 1}` : tag, Math.round(pr.gap * 10) / 10, [E.room.id, pr.B.room.id], kind, kind === 'virtual' ? {} : s.extra, [E.key, pr.B.key]);
        sharedOut.push({ wall: w.id, rooms: w.rooms, thickness: w.thickness, edges: [E.key, pr.B.key], tilt: Math.round(pr.tilt * 10) / 10 });
      });
      if (s.thickness !== undefined && Math.abs(s.thickness - pr.gap) > 1) report.warnings.push(`${E.key}: thickness override ${s.thickness} ignored, measured face distance to ${pr.B.key} is ${pr.gap.toFixed(1)} mm`);
    });
  }

  // edges with no neighbour: ordinary outer walls, listed so a UI can ask for their thickness
  for (const E of edges) {
    if (!claimed.get(E).length && !E.room.exterior && subtractIntervals(0, E.L, E.solid).length) report.solo.push(E.key);
  }
  return { walls, shared: sharedOut, report };
}
