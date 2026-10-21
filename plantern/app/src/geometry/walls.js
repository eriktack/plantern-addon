import { add, sub, mul, dot, cross, len, dist, TOL } from './vec.js';
import { clipConvex, quadOrder } from './solids.js';

/**
 * Wall frame: unit direction u (a→b), left normal n, length L, and how far the
 * body extends to the left (offL) / right (offR) of the reference line.
 */
export function wallFrame(w) {
  const d = sub(w.b, w.a), L = len(d), u = L ? mul(d, 1 / L) : [1, 0], n = [-u[1], u[0]];
  const t = w.thickness || 0, j = w.justify || 'center';
  return { u, n, L, offL: j === 'left' ? t : j === 'center' ? t / 2 : 0, offR: j === 'right' ? t : j === 'center' ? t / 2 : 0 };
}

/** Signed offset of a face along n. */
export const faceOffset = (f, side) => (side === 'left' ? f.offL : -f.offR);

/** Point on a wall face at distance s along the reference line (s may be < 0 or > L at joins). */
export const facePoint = (w, f, side, s) => add(add(w.a, mul(f.u, s)), mul(f.n, faceOffset(f, side)));

/**
 * The ONLY place wall heights are read. A wall is flat (`base`, `height`; default the level's
 * ceiling) or sloped: `bottom` / `top` = { a, b }, its heights above the level's floor at its a and
 * b ends (a stairwell wall, a knee wall, a railing along a stair); what one of them leaves out comes
 * from base / height. Returns { base, top, sloped, ends: { bottom: { a, b }, top: { a, b } }, at(s) }:
 * base and top are the lowest bottom and the highest top (the envelope), at(s) = { base, top } at s mm
 * from the a end (straight between the ends, continued past them for mitred corners).
 */
export function wallProfile(w, level) {
  // without a height a wall reaches the ceiling, wherever its base is (a wall coming down from the ceiling)
  const base = w.base ?? 0, flatTop = w.height !== undefined ? base + w.height : level.ceilingHeight ?? 2400;
  if (!w.top && !w.bottom) return { base, top: flatTop, sloped: false, ends: { bottom: { a: base, b: base }, top: { a: flatTop, b: flatTop } }, at: () => ({ base, top: flatTop }), breaks: [] };
  // each edge (top, bottom) is level for flatA mm from the start and flatB mm before the end, sloping between
  const L = Math.hypot((w.b?.[0] ?? 0) - (w.a?.[0] ?? 0), (w.b?.[1] ?? 0) - (w.a?.[1] ?? 0)) || 1;
  const edge = (e, d) => {
    const x = { a: e?.a ?? d, b: e?.b ?? d, flatA: Math.max(0, e?.flatA ?? 0), flatB: Math.max(0, e?.flatB ?? 0) };
    x.s0 = Math.min(x.flatA, L); x.s1 = Math.max(x.s0, L - x.flatB);
    return x;
  };
  const bottom = edge(w.bottom, base), top = edge(w.top, flatTop);
  const height = (e, s) => (s <= e.s0 ? e.a : s >= e.s1 ? e.b : e.a + (e.b - e.a) * (s - e.s0) / (e.s1 - e.s0));
  // the straight piece of an edge that s lies on: { s0, s1, h0, h1 } (a level piece has h0 = h1)
  const segment = (which, s) => {
    const e = which === 'top' ? top : bottom;
    return s <= e.s0 ? { s0: -1e6, s1: e.s0, h0: e.a, h1: e.a } : s >= e.s1 ? { s0: e.s1, s1: L + 1e6, h0: e.b, h1: e.b } : { s0: e.s0, s1: e.s1, h0: e.a, h1: e.b };
  };
  const breaks = [...new Set([top.s0, top.s1, bottom.s0, bottom.s1])].filter(s => s > 0.5 && s < L - 0.5).sort((x, y) => x - y);
  const pub = e => ({ a: e.a, b: e.b, flatA: e.flatA, flatB: e.flatB });
  return { base: Math.min(bottom.a, bottom.b), top: Math.max(top.a, top.b), sloped: true, ends: { bottom: pub(bottom), top: pub(top) }, at: s => ({ base: height(bottom, s), top: height(top, s) }), segment, breaks };
}

export const hasBody = w => w.kind !== 'virtual' && (w.thickness || 0) > 0;

/**
 * How the plan's cut plane (mm above the floor) meets a wall: 'above' (it starts above it: a lintel, drawn
 * dashed), 'low' (it ends below it everywhere: a half-height wall, seen from above, drawn lighter) or 'cut'.
 */
export function wallCut(w, level, cutPlane) {
  const p = wallProfile(w, level);
  return p.base >= cutPlane ? 'above' : p.top < cutPlane ? 'low' : 'cut';
}

/** Degrees: walls this close to parallel are one line for the joins, as two rooms' edges this close share one wall. */
export const PAIR_ANGLE = 2;
const SIN_PAIR = Math.sin(PAIR_ANGLE * Math.PI / 180);
/** mm: how far a carried-on wall's face may be off this wall's face where they meet (a near-parallel shared wall drifts). */
const FACE_TOL = 5;
/** A wall crossing at more than 10° cuts back a face end that runs into its body. */
const SIN_CLIP = Math.sin(10 * Math.PI / 180);

/** Point p lies inside the convex polygon, more than tol from its outline. */
function insideBy(p, poly, tol) {
  let sgn = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], d = sub(poly[(i + 1) % poly.length], a), l = len(d);
    if (l < 1e-9) continue;
    const c = cross(d, sub(p, a)) / l;
    if (Math.abs(c) <= tol || (sgn && Math.sign(c) !== sgn)) return false;
    sgn = Math.sign(c);
  }
  return sgn !== 0;
}

/** s along wall w where its face `side` meets face `oside` of wall o; null if parallel. */
function intersectS(w, f, side, o, g, oside) {
  const den = cross(f.u, g.u);
  if (Math.abs(den) < 1e-9) return null;
  const p1 = add(w.a, mul(f.n, faceOffset(f, side)));
  const p2 = add(o.a, mul(g.n, faceOffset(g, oside)));
  return cross(sub(p2, p1), g.u) / den;
}

/**
 * Wall join rule (docs/PLANTERN.md §6.2, "Wall joins"). For each end of each wall with a body:
 *  1. Exactly one non-parallel wall has a reference end at the same point → MITER:
 *     each face is extended/trimmed to the matching face of the other wall
 *     (left↔left when the walls chain a→b, b→a; left↔right when both start or both end there).
 *  2. More than one such wall → square end + validation warning (unresolved junction).
 *  3. Otherwise, the end lies on another wall's body → BUTT: both faces are cut at that
 *     wall's near face. The host wall is unchanged.
 *  4. Otherwise → free square end at the reference point.
 * Collinear continuations (a split wall) get square ends, also when another wall ends at that point;
 * that wall then butts against the straight one. "Collinear" and "parallel" are within PAIR_ANGLE.
 * Last, a face end that runs into the body of a third wall crossing it is cut off along that wall's face.
 * Result: caps[id] = { a:{left,right}, b:{left,right} } as s values, and clips[id] = the cuts, for clipWallPieces().
 */
export function wallJoins(walls, level = {}) {
  const solid = walls.filter(hasBody);
  const frames = new Map(solid.map(w => [w.id, wallFrame(w)]));
  // heights matter, where the walls meet: only walls of the same height there mitre into an L, and a wall
  // only butts against one that covers its whole height there (a lintel overhead must not cut or angle the
  // wall below it; two sloped walls meeting at one height still mitre)
  const prof = new Map(solid.map(w => [w.id, wallProfile(w, level)]));
  const hAt = (w, s) => { const h = prof.get(w.id).at(s); return [h.base, h.top]; };
  const sAt = (w, p) => dot(sub(p, w.a), frames.get(w.id).u);
  /** A wall's body with square ends (before any join). */
  const rectOf = w => { const g = frames.get(w.id); return [facePoint(w, g, 'left', 0), facePoint(w, g, 'left', g.L), facePoint(w, g, 'right', g.L), facePoint(w, g, 'right', 0)]; };
  const caps = new Map(), issues = [];
  // A parallel wall whose body carries on from this end: a face of it on a face of this one where they meet,
  // its body starting where this one's ends, and of the same height there. Its reference line may be this
  // wall's other face (a shared wall that carries on past one room's corner along the other room only), and it
  // may be a little off parallel and of another thickness (that room's own wall, tilted as rooms that share a
  // wall within PAIR_ANGLE are; issue #28). Returns that wall, or undefined.
  const bodyContinues = (w, end) => {
    const f = frames.get(w.id), p = w[end], mine = hAt(w, end === 'a' ? 0 : f.L), faces = [f.offL, -f.offR].sort((x, y) => x - y);
    return solid.find(o => {
      if (o === w) return false;
      const g = frames.get(o.id);
      if (Math.abs(cross(f.u, g.u)) > SIN_PAIR) return false;
      // o's faces as offsets from this wall's reference line, where o passes this end
      const q = add(o.a, mul(g.u, dot(sub(p, o.a), g.u)));
      const sg = dot(g.n, f.n) > 0 ? 1 : -1, m0 = dot(sub(q, p), f.n);
      const of = [m0 + sg * g.offL, m0 - sg * g.offR].sort((x, y) => x - y);
      if (of[1] < faces[0] + TOL || of[0] > faces[1] - TOL) return false;                       // beside it, not carrying on
      if (Math.abs(of[0] - faces[0]) > FACE_TOL && Math.abs(of[1] - faces[1]) > FACE_TOL) return false;
      const t = [dot(sub(o.a, w.a), f.u), dot(sub(o.b, w.a), f.u)];
      const starts = end === 'a' ? t.some(x => Math.abs(x) <= FACE_TOL) && Math.min(...t) < -FACE_TOL : t.some(x => Math.abs(x - f.L) <= FACE_TOL) && Math.max(...t) > f.L + FACE_TOL;
      if (!starts) return false;
      const h = hAt(o, sAt(o, p));
      return Math.abs(h[0] - mine[0]) <= 1 && Math.abs(h[1] - mine[1]) <= 1;
    });
  };
  const carried = new Set();                                          // "id:end" where a wall carries straight on
  for (const w of solid) {
    const f = frames.get(w.id);
    const cap = { a: { left: 0, right: 0 }, b: { left: f.L, right: f.L } };
    for (const end of ['a', 'b']) {
      const p = w[end], uIn = end === 'a' ? f.u : mul(f.u, -1);
      const mine = hAt(w, end === 'a' ? 0 : f.L);
      const crossing = solid.filter(o => o !== w && Math.abs(cross(f.u, frames.get(o.id).u)) > SIN_PAIR);
      const others = crossing.filter(o => { const h = hAt(o, sAt(o, p)); return Math.abs(h[0] - mine[0]) <= 1 && Math.abs(h[1] - mine[1]) <= 1; });
      const coincident = others.filter(o => dist(o.a, p) <= TOL || dist(o.b, p) <= TOL);
      // a wall split in two (or any straight continuation): the end is just a cut, square at the
      // point, even when a third wall happens to end there too (a closet side wall under a split facade)
      // (only a continuation of the same height there: a lintel carrying on the line overhead is not one)
      const sameThere = o => { const h = hAt(o, sAt(o, p)); return Math.abs(h[0] - mine[0]) <= 1 && Math.abs(h[1] - mine[1]) <= 1; };
      const continues = solid.some(o => o !== w && Math.abs(cross(f.u, frames.get(o.id).u)) <= SIN_PAIR &&(dist(o.a, p) <= TOL || dist(o.b, p) <= TOL) && sameThere(o));
      if (continues || bodyContinues(w, end)) { carried.add(`${w.id}:${end}`); continue; }
      // the one wall ending here carries straight on (by its body): this end butts against it, below
      const carriedOn = o => bodyContinues(o, dist(o.a, p) <= TOL ? 'a' : 'b');
      if (coincident.length === 1 && !carriedOn(coincident[0])) {
        const o = coincident[0], g = frames.get(o.id), oStartsHere = dist(o.a, p) <= TOL;
        const chained = (end === 'b') === oStartsHere;
        const mitre = { ...cap[end] };
        for (const side of ['left', 'right']) {
          const oside = chained ? side : side === 'left' ? 'right' : 'left';
          const s = intersectS(w, f, side, o, g, oside);
          if (s !== null) mitre[side] = s;
        }
        // the mitre's tip would stand inside a third wall running alongside this one (another room's wall carrying on past this
        // corner, issue #28): no cut can take it off, so this end butts instead (below) and the other wall is clipped by that one
        const tip = ['left', 'right'].map(side => facePoint(w, f, side, mitre[side]));
        const buried = solid.some(x => x !== w && x !== o && Math.abs(cross(f.u, frames.get(x.id).u)) <= SIN_CLIP && sameThere(x) && tip.some(q => insideBy(q, rectOf(x), TOL)));
        if (!buried) { cap[end] = mitre; continue; }
      }
      // several walls end here: fine when they are one straight wall split at this point (this wall
      // then butts against it, below); anything else is an unresolved junction
      const straight = coincident.length > 1 && coincident.every(o => Math.abs(cross(frames.get(o.id).u, frames.get(coincident[0].id).u)) <= 1e-6);
      if (coincident.length > 1 && !straight) {
        issues.push({ severity: 'warn', id: w.id, msg: `${coincident.length + 1} walls meet at end ${end} (${coincident.map(o => o.id).join(', ')}); join not resolved, square end used` });
        continue;
      }
      // a wall at less than 10° is no host: cutting at its face would be far along this wall (or past its other end)
      const hosts = crossing.filter(o => Math.abs(cross(f.u, frames.get(o.id).u)) > SIN_CLIP).filter(o => { const h = hAt(o, sAt(o, p)); return h[0] <= mine[0] + 1 && h[1] >= mine[1] - 1; }).filter(o => {
        const g = frames.get(o.id), q = sub(p, o.a), t = dot(q, g.u), m = dot(q, g.n);
        return t >= -TOL && t <= g.L + TOL && m >= -g.offR - TOL && m <= g.offL + TOL;
      }).map(o => {
        // the end is at the host's end, where the host carries on as another wall (a shared wall that carries on as one
        // room's own, a little thinner or tilted), and this wall's body lies along that one: it stops at that one's face
        const g = frames.get(o.id), t = dot(sub(p, o.a), g.u), oEnd = t <= FACE_TOL ? 'a' : t >= g.L - FACE_TOL ? 'b' : null;
        const c = oEnd && bodyContinues(o, oEnd), body = mul(f.n, f.offL >= f.offR ? 1 : -1);
        return c && dot(body, oEnd === 'a' ? mul(g.u, -1) : g.u) > 0 ? c : o;
      });
      // the end may lie on two bodies (a shared wall and its thicker continuation): it stops at the one that
      // reaches furthest into it, so it overlaps neither, whatever order the walls come in
      hosts.forEach((host, k) => {
        const g = frames.get(host.id), hside = dot(uIn, g.n) > 0 ? 'left' : 'right';
        for (const side of ['left', 'right']) {
          const s = intersectS(w, f, side, host, g, hside);
          if (s !== null && (k === 0 || (end === 'a' ? s > cap[end][side] : s < cap[end][side]))) cap[end][side] = s;
        }
      });
    }
    caps.set(w.id, cap);
  }
  // A face end that runs into the body of a third wall crossing it is cut off along that wall's near face: a mitre's
  // tip, or the corner of a square end, where three rooms with corners other than 90° meet near one point instead of
  // at it (issue #28). The cut is a half-plane the wall's pieces are clipped by (buildLevelGeometry), so a mitre stays
  // a mitre up to that face and leaves no gap. Never where the wall carries straight on (a split is not an end), and the
  // bodies are the joined ones before any cut, so the order of the walls does not matter.
  const bodies = new Map(solid.map(w => {
    const f = frames.get(w.id), c = caps.get(w.id);
    return [w.id, [facePoint(w, f, 'left', c.a.left), facePoint(w, f, 'left', c.b.left), facePoint(w, f, 'right', c.b.right), facePoint(w, f, 'right', c.a.right)]];
  }));
  const clips = new Map();
  for (const w of solid) {
    const f = frames.get(w.id), cap = caps.get(w.id), planes = [];
    for (const end of ['a', 'b']) {
      if (carried.has(`${w.id}:${end}`)) continue;
      const uIn = end === 'a' ? f.u : mul(f.u, -1), mine = hAt(w, end === 'a' ? 0 : f.L), far = w[end === 'a' ? 'b' : 'a'];
      const pts = ['left', 'right'].map(side => facePoint(w, f, side, cap[end][side]));
      for (const o of solid) {
        const g = frames.get(o.id);
        if (o === w || Math.abs(cross(f.u, g.u)) <= SIN_CLIP) continue;
        if (!pts.some(p => { const h = hAt(o, sAt(o, p)); return h[0] <= mine[0] + 1 && h[1] >= mine[1] - 1 && insideBy(p, bodies.get(o.id), TOL); })) continue;
        // that wall's face toward this wall's body: a point on it and the normal pointing away from that wall
        const k = dot(uIn, g.n) > 0 ? 1 : -1, out = mul(g.n, k), at = add(o.a, mul(g.n, k > 0 ? g.offL : -g.offR));
        if (dot(sub(far, at), out) > 0) planes.push({ at, out });        // the rest of the wall lies on this side
      }
    }
    if (planes.length) clips.set(w.id, planes);
  }
  return { caps, clips, frames, issues };
}

/** A wall's pieces clipped by its join cuts (wallJoins().clips): each keeps the part where dot(p − at, out) ≥ 0. */
export function clipWallPieces(w, f, pieces, planes = []) {
  if (!planes.length) return pieces;
  const loc = p => { const d = sub(p, w.a); return [dot(d, f.u), dot(d, f.n)]; };
  const world = ([s, t]) => add(add(w.a, mul(f.u, s)), mul(f.n, t));
  return pieces.map(pc => {
    let P = pc;
    for (const { at, out } of planes) P = clipConvex(P, p => dot(sub(p, at), out));
    return P.length === 4 ? quadOrder(P.map(loc)).map(world) : P;
  }).filter(P => P.length >= 3 && Math.abs(polyArea(P)) > 1);
}
const polyArea = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/**
 * Solid pieces of a wall between openings, as convex quads
 * [left s0, left s1, right s1, right s0]. Wall ends use the join caps; opening edges are square.
 */
export function wallPieces(w, f, cap, openings) {
  const ops = openings.filter(o => o.wall === w.id).sort((a, b) => a.offset - b.offset);
  const spans = [];
  let start = cap.a;
  for (const o of ops) {
    if (o.offset > Math.min(start.left, start.right) + TOL) spans.push([start, { left: o.offset, right: o.offset }]);
    const e = o.offset + o.width;
    start = { left: e, right: e };
  }
  if (Math.max(cap.b.left, cap.b.right) > Math.max(start.left, start.right) + TOL) spans.push([start, cap.b]);
  return spans.map(([s0, s1]) => [
    facePoint(w, f, 'left', s0.left), facePoint(w, f, 'left', s1.left),
    facePoint(w, f, 'right', s1.right), facePoint(w, f, 'right', s0.right),
  ]);
}

/** Point on the wall centre plane at distance s (used for opening symbols). */
export function centrePoint(w, f, s) {
  return add(add(w.a, mul(f.u, s)), mul(f.n, (f.offL - f.offR) / 2));
}

/**
 * The strip along each face of a wall piece (quad [left s0, left s1, right s1, right s0]) where the
 * plan shows that side's colour: `depth` mm into the wall, at most a third of its thickness.
 * Returns { left, right } polygons. A piece with three or five corners (a mitred end cut by a solid or by a third
 * wall) gets its strips by clipping it to `depth` mm from each face, given the wall `w` and its frame `f`.
 */
export function sideStrips(piece, thickness, depth = 40, w, f) {
  if (piece.length !== 4) {
    if (!w || !f) return { left: [], right: [] };
    const d = Math.min(depth, (thickness || depth) / 3), t = p => dot(sub(p, w.a), f.n);
    return { left: clipConvex(piece, p => t(p) - (f.offL - d)), right: clipConvex(piece, p => (-f.offR + d) - t(p)) };
  }
  const k = Math.min(1 / 3, depth / (thickness || depth)), mix = (p, q) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  const [l0, l1, r1, r0] = piece;
  return { left: [l0, l1, mix(l1, r1), mix(l0, r0)], right: [r0, r1, mix(r1, l1), mix(r0, l0)] };
}
