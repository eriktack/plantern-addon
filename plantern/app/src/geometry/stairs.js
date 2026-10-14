// Stairs (PLANTERN.md §6.4): everything derived from a `stairs` entity, pure.
//
// A stair is stored on the level it starts from and goes up to level `to`. The rise is never typed: it
// is the difference of the two levels' elevations, split evenly over all risers.
//
// Plan frame: the stair walks along `heading` (degrees, plan axes); `start` is the LEFT corner of the front
// edge of the first step, looking up the stairs, and the width extends to the RIGHT of the walking direction.
//
// A flight of r risers has r − 1 treads (the r-th riser arrives at the landing or the floor above), each
// `length / (r − 1)` deep, so `length` is the run from the first riser to the arrival edge. Two flights and
// a `turn` make an L (three: a U, both turns the same way): between them a square landing (width × width) or `winders` wedge-shaped treads
// fanned around the inside corner of the turn. With winders the first wedge is at landing height and every
// further wedge is one riser higher, so n winders add n − 1 risers.

import { add, mul } from './vec.js';
import { pointInPolygon, distToSegment, signedArea } from './polygon.js';

const r1 = v => Math.round(v * 100) / 100;
const pt = p => [r1(p[0]), r1(p[1])];

export const STAIR_LIMITS = Object.freeze({ riser: [150, 220], tread: [220, 300] });   // plausible step height / depth, mm

const rad = d => d * Math.PI / 180;
/** Unit vectors for a heading: forward and right-of-travel. */
export function stairFrame(headingDeg) {
  const u = [Math.cos(rad(headingDeg)), Math.sin(rad(headingDeg))];
  return { u, r: [u[1], -u[0]] };
}

/** How many turns a stair has (one between each two flights). */
const turnsOf = st => Math.max((st.flights || []).length - 1, 0);

/** Total risers: all flights plus (winders − 1) for every turn made of winders. */
export function totalRisers(st) {
  const fl = st.flights || [];
  const winders = fl.length > 1 && st.landing === 'winders' ? Math.max(Number(st.winders) || 0, 0) : 0;
  return fl.reduce((s, f) => s + (Number(f.risers) || 0), 0) + Math.max(winders - 1, 0) * turnsOf(st);
}

/** A flight's run (plan mm, first riser to arrival edge): the sum of its measured treads, else `length`. */
export const flightRun = f => (Array.isArray(f.treads) && f.treads.length ? f.treads.reduce((a, b) => a + Number(b), 0) : Number(f.length) || 0);

/**
 * The geometry of one stair. `pos` = resolved start, `rise` = elevation(to) − elevation(from) in mm.
 * Returns { steps, outline, arrow, arrival, riser, depths (per flight, average), treadDepths (every tread), winders, turns } or { error }.
 *   steps: [{ poly, top, kind: 'tread' | 'landing' | 'winder', flight, n }] in walking order; `top` is the
 *     height of the step's surface above the starting level's floor; the arrival floor is not a step.
 *   outline: polygon around everything; arrow: [[x, y] …] walking line from first step to arrival;
 *   arrival: { pos, dir } the middle of the arrival edge and the walking direction there.
 * One flight is straight; two make an L, three a U (both turns the same way, `turn`), each turn a square
 * landing or `winders`. A flight's treads are `length / (risers − 1)` deep, or measured one by one (`treads`).
 */
export function stairLayout(st, pos, rise) {
  const fl = st.flights || [], W = Number(st.width);
  if (!pos || !pos.every(Number.isFinite)) return { error: 'its start point is not known' };
  if (!(W > 0)) return { error: 'width must be more than 0' };
  if (!fl.length || fl.length > 3) return { error: 'one, two (an L) or three flights (a U) are supported' };
  if (fl.some(f => !(Number(f.risers) >= 1) || !Number.isInteger(Number(f.risers)))) return { error: 'every flight needs a whole number of risers (1 or more)' };
  if (fl.some(f => f.treads !== undefined && (!Array.isArray(f.treads) || f.treads.length !== Number(f.risers) - 1 || f.treads.some(d => !(Number(d) > 0))))) return { error: 'measured treads: one depth (mm) per tread, risers − 1 of them' };
  if (fl.some(f => !(flightRun(f) >= 0) || (Number(f.risers) > 1 && !(flightRun(f) > 0)))) return { error: 'every flight with treads needs a length (its plan run)' };
  if (fl.length > 1 && st.turn !== 'L' && st.turn !== 'R') return { error: `${fl.length} flights need turn "L" or "R"` };
  const winders = fl.length > 1 && st.landing === 'winders' ? Math.floor(Number(st.winders) || 0) : 0;
  if (fl.length > 1 && st.landing === 'winders' && winders < 2) return { error: 'winders: at least 2' };
  const N = totalRisers(st);
  if (!(rise > 0)) return { error: 'the level it goes to is not above the level it starts on' };
  const riser = rise / N, steps = [], depths = [], treadDepths = [], flights = [], turns = [];
  const quad = (o, u, r, s0, s1, w0, w1) => [add(o, add(mul(u, s0), mul(r, w0))), add(o, add(mul(u, s1), mul(r, w0))), add(o, add(mul(u, s1), mul(r, w1))), add(o, add(mul(u, s0), mul(r, w1)))].map(pt);
  const { u, r } = stairFrame(st.heading ?? 0);
  // a flight may have its own width (fixes list 3); without one it is the stair's width
  const wOf = f => (Number(f.width) > 0 ? Number(f.width) : W);
  const arrow = [pt(add(pos, mul(r, wOf(fl[0]) / 2)))];

  // one flight: r − 1 treads from `o` (the left corner of its front edge) along u, width along r; h0 = height it starts at
  const flight = (o, fu, fr, f, h0, index) => {
    const n = Number(f.risers), run = n > 1 ? flightRun(f) : 0, d = n > 1 ? run / (n - 1) : 0, Wk = wOf(f);
    const ds = n > 1 ? (Array.isArray(f.treads) && f.treads.length ? f.treads.map(Number) : Array(n - 1).fill(d)) : [];
    if (n > 1) depths.push(d);
    treadDepths.push(...ds);
    flights.push({ o, u: fu, r: fr, run, d, n, h0, w: Wk });
    let s0 = 0;
    for (let j = 1; j < n; j++) {
      const s1 = s0 + ds[j - 1];
      steps.push({ poly: quad(o, fu, fr, s0, s1, 0, Wk), top: r1(h0 + j * riser), kind: 'tread', flight: index, fi: index, s0, s1, n: steps.length + 1 });
      s0 = s1;
    }
    return { run, topAt: h0 + n * riser, w: Wk };
  };

  let o = pos, fu = u, fr = r, h = 0, arrival;
  for (let k = 0; k < fl.length; k++) {
    const f = flight(o, fu, fr, fl[k], h, k);
    if (k === fl.length - 1) {
      const end = add(o, add(mul(fu, f.run), mul(fr, f.w / 2)));
      arrow.push(pt(end));
      arrival = { pos: pt(end), dir: fu };
      break;
    }
    // a turn after this flight: a landing, or winders, then the next flight. The landing is as wide across as this
    // flight (Wp) and as deep along the walk as the next one (Wn); winders are fanned on a square of the wider of the two
    const Wp = f.w, Wn = wOf(fl[k + 1]);
    const L = f.run, left = st.turn === 'L', H1 = f.topAt;
    const A = add(o, mul(fu, L));                                     // landing's near-left corner
    const u2 = left ? [-fu[1], fu[0]] : [fu[1], -fu[0]], r2 = [u2[1], -u2[0]];
    const o2 = left ? A : add(o, add(mul(fr, Wp), mul(fu, L + Wn)));  // left corner of the next flight's front edge
    const turn = { poly: quad(o, fu, fr, L, L + Wn, 0, Wp), top: r1(H1), entry: pt(add(o, add(mul(fu, L), mul(fr, Wp / 2)))), exit: pt(add(o2, mul(r2, Wn / 2))) };
    if (winders) {
      // wedges around the inside corner of the turn, from the arrival edge of this flight to the front edge of the next
      const piv = left ? A : add(A, mul(fr, Wp)), e1 = left ? fr : mul(fr, -1);
      // the fan covers the landing's rectangle exactly: Wp across (e1) by Wn along the walk (fu), so no wedge reaches past the
      // landing's outer edge when the flights differ in width (BBV28: 863 and 850 gave 13 mm over the outer length)
      const thc = Math.atan2(Wn, Wp);                                    // the landing's corner, as an angle from e1
      const bnd = th => { const c = Math.cos(th), s = Math.sin(th), t = Math.min(c > 1e-12 ? Wp / c : Infinity, s > 1e-12 ? Wn / s : Infinity); return [c * t, s * t]; };
      const at = ([a, b]) => add(piv, add(mul(e1, a), mul(fu, b)));
      for (let j = 0; j < winders; j++) {
        const t0 = (j * Math.PI / 2) / winders, t1 = ((j + 1) * Math.PI / 2) / winders, poly = [piv, at(j === 0 ? [Wp, 0] : bnd(t0))];
        if (t0 < thc - 1e-9 && t1 > thc + 1e-9) poly.push(at([Wp, Wn]));
        poly.push(at(j === winders - 1 ? [0, Wn] : bnd(t1)));
        steps.push({ poly: poly.map(pt), top: r1(H1 + j * riser), kind: 'winder', flight: k, n: steps.length + 1 });
      }
      turn.top = r1(H1 + (winders - 1) * riser);
    } else steps.push({ poly: quad(o, fu, fr, L, L + Wn, 0, Wp), top: r1(H1), kind: 'landing', flight: k, n: steps.length + 1 });
    turns.push(turn);
    arrow.push(pt(add(o, add(mul(fu, L + Wn / 2), mul(fr, Wp / 2)))));
    h = H1 + (winders ? (winders - 1) * riser : 0);
    o = o2; fu = u2; fr = r2;
  }
  return { steps, flights, turn: turns[0] || null, turns, width: W, outline: outlineOf(steps.map(s => s.poly)), arrow, arrival, riser: r1(riser), depths: depths.map(r1), treadDepths: treadDepths.map(r1), winders };
}

/**
 * The outline(s) of pieces that tile (share whole edges): edges used in both directions cancel, what is left
 * is chained into loops. Returns the outer loop of the biggest area (pieces touching only at a corner or
 * with a hole in between are not expected from stairs). Collinear points are dropped.
 */
export function outlineOf(polys) {
  const key = p => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`, edges = new Map();
  for (const poly of polys) poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    if (key(p) === key(q)) return;
    const back = `${key(q)}>${key(p)}`;
    if (edges.has(back)) edges.delete(back); else edges.set(`${key(p)}>${key(q)}`, [p, q]);
  });
  const next = new Map();
  for (const [p, q] of edges.values()) { const k = key(p); (next.get(k) || next.set(k, []).get(k)).push([p, q]); }
  const loops = [];
  while ([...next.values()].some(a => a.length)) {
    const start = [...next.values()].find(a => a.length)[0][0], loop = [start];
    let cur = start;
    for (let guard = 0; guard < 10000; guard++) {
      const out = next.get(key(cur))?.shift();
      if (!out) break;
      cur = out[1];
      if (key(cur) === key(start)) break;
      loop.push(cur);
    }
    loops.push(loop);
  }
  const area = l => Math.abs(l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const best = loops.sort((a, b) => area(b) - area(a))[0] || [];
  return dropStraight(best);
}

function dropStraight(poly) {
  return poly.filter((p, i) => {
    const a = poly[(i + poly.length - 1) % poly.length], b = poly[(i + 1) % poly.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1;
  });
}

/**
 * The part of a stair a person would hit their head on when it reaches the slab above: the steps whose
 * surface plus `headroom` is above the underside `under` (mm above the starting level's floor). Returns
 * { steps, pieces, hole } where `hole` is the outline of the touching pieces (the opening in the floor above).
 */
export function stairOpening(layout, under, headroom) {
  const steps = layout.steps.filter(s => s.top + headroom > under);
  const loops = steps.length ? outlineLoops(steps.map(s => s.poly)) : [];
  return { steps, hole: loops };
}

/**
 * The outline of the union of polygons that may touch at corners or only along part of an edge (the L stair's steps).
 * Every edge is split where the other polygons meet it; the parts inside another polygon, or on one, are dropped; what
 * is left is chained into closed loops. Returns the loops, largest first (one for a connected stair, fixes the L stair
 * coming out as several boxes).
 */
export function unionOutlines(polys) {
  const EPS = 0.5;
  const edges = polys.flatMap((poly, i) => poly.map((a, k) => [a, poly[(k + 1) % poly.length], i]));
  const verts = polys.flat();
  const tOf = (p, a, b) => ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
  const crossT = (a, b, c, d) => {                              // where segment ab crosses cd (strictly inside ab), or null
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const qp = [c[0] - a[0], c[1] - a[1]], t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
    return t > 1e-9 && t < 1 - 1e-9 && u > -1e-9 && u < 1 + 1e-9 ? t : null;
  };
  const onEdgeOf = (p, poly) => poly.some((a, k) => distToSegment(p, a, poly[(k + 1) % poly.length]) < EPS);
  const segs = [];
  for (const [a, b, i] of edges) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < EPS) continue;
    const ts = [0, 1];
    for (const v of verts) if (distToSegment(v, a, b) < EPS) ts.push(tOf(v, a, b));
    for (const [c, d] of edges) { const t = crossT(a, b, c, d); if (t !== null) ts.push(t); }
    ts.sort((x, y) => x - y);
    for (let j = 0; j + 1 < ts.length; j++) {
      const t0 = ts[j], t1 = ts[j + 1];
      if (t1 - t0 < 1e-6) continue;
      const mid = [a[0] + (b[0] - a[0]) * (t0 + t1) / 2, a[1] + (b[1] - a[1]) * (t0 + t1) / 2];
      if (polys.some((poly, pi) => pi !== i && (pointInPolygon(mid, poly) || onEdgeOf(mid, poly)))) continue;
      segs.push([[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]]);
    }
  }
  const key = p => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;     // tenths of a mm
  const adj = new Map();
  segs.forEach((s, idx) => { for (const p of s) { const k = key(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(idx); } });
  const used = segs.map(() => false), loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = true;
    const start = segs[s0][0], loop = [start, segs[s0][1]];
    let pt = segs[s0][1];
    for (;;) {
      // where several edges meet, take the one turning most to the left: the loop then goes round its own region, never
      // across it (taking any edge made a figure-eight, which triangulates as a wrong, curved shape in 3D)
      const din = [pt[0] - loop[loop.length - 2][0], pt[1] - loop[loop.length - 2][1]];
      let next = undefined, best = -Infinity;
      for (const i of adj.get(key(pt)) || []) {
        if (used[i]) continue;
        const o = key(segs[i][0]) === key(pt) ? segs[i][1] : segs[i][0];
        const dout = [o[0] - pt[0], o[1] - pt[1]];
        const turn = Math.atan2(din[0] * dout[1] - din[1] * dout[0], din[0] * dout[0] + din[1] * dout[1]);
        if (turn > best) { best = turn; next = i; }
      }
      if (next === undefined) break;
      used[next] = true;
      const other = key(segs[next][0]) === key(pt) ? segs[next][1] : segs[next][0];
      if (key(other) === key(start)) break;
      loop.push(other);
      pt = other;
    }
    const clean = dropStraight(loop);
    if (clean.length >= 3) loops.push(clean);
  }
  return loops.sort((x, y) => Math.abs(signedArea(y)) - Math.abs(signedArea(x)));
}

/** The outline(s) of the steps that reach the slab (the opening in the floor above): one per connected region. */
function outlineLoops(polys) {
  return unionOutlines(polys);
}

function shareEdge(a, b) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5;
  return a.some((p, i) => { const q = a[(i + 1) % a.length]; return b.some((s, j) => { const t = b[(j + 1) % b.length]; return near(p, t) && near(q, s); }); });
}

/**
 * The opening in the floor above given as a rectangle (fixes list 8): `rect.from` and `rect.to` are opposite corners
 * in plan mm, relative to the stair's start point `start`. Used instead of the steps' own hole, so the part of the
 * stairs that should not open (a small section under a wall, say) stays closed.
 */
export function openingRectPoly(rect, start) {
  const [x0, y0] = rect.from, [x1, y1] = rect.to;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [start[0] + x, start[1] + y]);
}

/** Start point of a stair: `start: { ref, offset }` against `snapPos(ref)`, or `start: { pos }` / `pos`. */
export function stairStart(st, snapPos) {
  const s = st.start ?? {};
  if (s.ref) {
    const p = snapPos(s.ref);
    if (!p) return { error: `its start point ${s.ref} does not exist` };
    const [dx, dy] = s.offset ?? [0, 0];
    return { pos: [p[0] + dx, p[1] + dy] };
  }
  const p = s.pos ?? st.pos;
  return Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) ? { pos: p } : { error: 'it has no start point' };
}


/** Triangle for the head of an arrow along its last segment (plan mm); size = length of the head. */
export function arrowHead(arrow, size = 250) {
  if (!arrow || arrow.length < 2) return null;
  const p = arrow[arrow.length - 1], q = arrow[arrow.length - 2], d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
  const u = [(p[0] - q[0]) / d, (p[1] - q[1]) / d], n = [-u[1], u[0]], b = [p[0] - u[0] * size, p[1] - u[1] * size];
  return [p, [b[0] + n[0] * size / 2, b[1] + n[1] * size / 2], [b[0] - n[0] * size / 2, b[1] - n[1] * size / 2]].map(pt);
}

/**
 * What a plan of a level shows of stairs (PLANTERN.md §6.4 Drawing), from geo.stairs / geo.holes
 * (buildModelGeometry): the stairs going up from here, broken off at the cut plane — steps whose surface is above
 * it are only dashed outlines — with an "up" arrow; and, in the opening in the floor, the stairs arriving from
 * below, dimmed, with a "down" arrow. Returns { up: [{ id, steps: [{ poly, above }], arrow, head }],
 * down: [{ id, poly, steps: [poly], arrow, head }] }.
 */
export function stairsPlan(geo, cutPlane = 1200) {
  const up = (geo.stairs || []).filter(s => s.layout).map(s => ({
    id: s.id, steps: s.layout.steps.map(st => ({ poly: st.poly, above: st.top > cutPlane, kind: st.kind })), arrow: s.layout.arrow, head: arrowHead(s.layout.arrow),
  }));
  const down = (geo.holes || []).map(h => ({ id: h.id, poly: h.poly, steps: h.steps || [], arrow: h.arrow || [], head: arrowHead(h.arrow) }));
  return { up, down };
}

export const STAIR_SOLID = Object.freeze({ waist: 150, tread: 60, side: 50 });   // mm: thickness under a sloped underside, of a thin tread, of a side panel

/**
 * The solid parts of a stair for 3D, as prisms in plan mm: [{ poly, z0, z1, slope?, side? }] (levelPrisms()
 * adds id, kind and colour). Heights are above the floor of the level the stair starts on, plus `dz`.
 *   underside "closed": a block from the floor up to each step; "open": thin treads only; "sloped": solid,
 *   but the underside is one straight sloping surface `waist` mm below the line through the steps' noses
 *   (default 150), so something can pass or stand underneath.
 *   sides "sloped": a thin panel on each side of every flight, up to the nose line, filling the notches of the
 *   steps (and on the outer sides of the landing).
 * `steps` limits it to some steps (the ones seen through the opening in the floor above), without side panels.
 */
export function stairSolids(layout, st, { steps = layout.steps, dz = 0, withSides = true } = {}) {
  const out = [], under = st.underside ?? 'closed', waist = st.waist ?? STAIR_SOLID.waist, riser = layout.riser, floor = dz;
  const quadAt = (f, s0, s1, w0, w1) => [[s0, w0], [s1, w0], [s1, w1], [s0, w1]].map(([s, w]) => pt(add(f.o, add(mul(f.u, s), mul(f.r, w)))));
  // soffit B(s) (under the steps) and nose line N(s) of a flight, from its front edge
  const slopeOf = f => riser / f.d;
  const B = (f, s) => f.h0 - waist + slopeOf(f) * s + dz;
  const N = (f, s) => f.h0 + riser + slopeOf(f) * s + dz;
  const line = (f, a, b) => ({ origin: f.o, u: f.u, L: f.run || 1, a: r1(a), b: r1(b) });
  // a slab of a flight between s0..s1 and w0..w1 whose underside is the soffit, cut where the soffit meets the floor
  const soffitPieces = (f, s0, s1, w0, w1, z1, extra = {}) => {
    const pieces = [], cross = Math.min(Math.max((floor - B(f, 0)) / slopeOf(f), s0), s1);   // where B = floor, clamped to the piece
    const top = extra.topLine ? { top: extra.topLine } : {}, side = extra.side ? { side: true } : {};
    const flat = (a, b) => a < b - 0.5 && pieces.push({ poly: quadAt(f, a, b, w0, w1), z0: floor, z1, ...(extra.topLine ? { slope: top } : {}), ...side });
    const sloped = (a, b) => a < b - 0.5 && pieces.push({ poly: quadAt(f, a, b, w0, w1), z0: Math.min(B(f, a), B(f, b)), z1, slope: { bottom: line(f, B(f, 0), B(f, f.run)), ...top }, ...side });
    if (B(f, s0) >= floor) sloped(s0, s1); else if (B(f, s1) <= floor) flat(s0, s1); else { flat(s0, cross); sloped(cross, s1); }
    return pieces;
  };
  for (const s of steps) {
    const top = s.top + dz;
    if (s.kind === 'tread') {
      const f = layout.flights[s.fi];
      if (under === 'sloped') out.push(...soffitPieces(f, s.s0, s.s1, 0, f.w, top));
      else out.push({ poly: s.poly, z0: under === 'open' ? Math.max(top - STAIR_SOLID.tread, floor) : floor, z1: top });
    } else {
      // a winder's underside reaches down a riser deeper than a tread's: the riser face below it is then solid, with no gap
      // between the winder and the step under it (a thinner winder left holes in the BBV28 stair)
      const low = under === 'closed' ? floor : Math.max(top - waist - (s.kind === 'winder' ? riser : 0), floor);
      out.push({ poly: s.poly, z0: under === 'open' ? Math.max(top - STAIR_SOLID.tread, floor) : low, z1: top });
    }
  }
  if (withSides && st.sides === 'sloped' && steps === layout.steps) {
    const T = STAIR_SOLID.side;
    layout.flights.forEach(f => {
      if (!(f.run > 0)) return;
      for (const [w0, w1] of [[0, T], [f.w - T, f.w]]) {
        const topLine = line(f, N(f, 0), N(f, f.run)), z1 = Math.max(N(f, 0), N(f, f.run));
        if (under === 'closed') out.push({ poly: quadAt(f, 0, f.run, w0, w1), z0: floor, z1, slope: { top: topLine }, side: true });
        else out.push(...soffitPieces(f, 0, f.run, w0, w1, z1, { topLine, side: true }));
      }
    });
    // the landing (or winders): panels on the sides no flight leaves from or arrives at
    for (const tn of layout.turns || (layout.turn ? [layout.turn] : [])) {
      const mids = [tn.entry, tn.exit], cen = [tn.poly.reduce((a, p) => a + p[0], 0) / 4, tn.poly.reduce((a, p) => a + p[1], 0) / 4];
      tn.poly.forEach((p, i) => {
        const q = tn.poly[(i + 1) % 4], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        if (mids.some(x => Math.hypot(x[0] - m[0], x[1] - m[1]) < 1)) return;
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]), u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
        let n = [-u[1], u[0]];
        if ((cen[0] - m[0]) * n[0] + (cen[1] - m[1]) * n[1] < 0) n = [-n[0], -n[1]];
        // a square landing: one flat top per panel
        if (!(layout.winders > 0)) {
          const top = tn.top + dz, a2 = add(p, mul(n, T)), b2 = add(q, mul(n, T));
          out.push({ poly: [p, q, b2, a2].map(pt), z0: under === 'closed' ? floor : Math.max(top - waist - riser, floor), z1: top, side: true });
          return;
        }
        // winders: each winder is a sector of the turn (an equal angle round the inside corner). Its side rises by one riser
        // from the step below to its own step, so the side reaches the first step of the next flight at the exit (the turn's
        // top plus one riser), not the last winder's top. The panel is cut at each sector and every piece slopes on its own
        const W = layout.winders, H1 = tn.top + dz - (W - 1) * riser, delta = Math.PI / (2 * W);
        const piv = layout.steps.find(st => st.kind === 'winder').poly[0];
        const e1 = layout.steps.find(st => st.kind === 'winder').poly[1], lastW = layout.steps.filter(st => st.kind === 'winder').pop().poly;
        const ue = [e1[0] - piv[0], e1[1] - piv[1]], uf = [lastW[lastW.length - 1][0] - piv[0], lastW[lastW.length - 1][1] - piv[1]];
        const angleOf = x => { const d = [x[0] - piv[0], x[1] - piv[1]]; return Math.atan2(d[0] * uf[0] + d[1] * uf[1], d[0] * ue[0] + d[1] * ue[1]); };
        const zOf = x => H1 + Math.min(Math.max(angleOf(x) / delta, 0), W) * riser;   // linear in the angle: one riser per sector
        const th0 = angleOf(p), th1 = angleOf(q), ts = [0, 1];
        for (let j = 1; j < W; j++) { const edgeAt = j * delta; if ((th0 - edgeAt) * (th1 - edgeAt) < 0) ts.push((edgeAt - th0) / (th1 - th0)); }
        ts.sort((x, y) => x - y);
        for (let k = 0; k + 1 < ts.length; k++) {
          const t0 = ts[k], t1 = ts[k + 1];
          if (t1 - t0 < 1e-6) continue;
          const s0 = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0], s1 = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1];
          const z0s = zOf(s0) + 0, z1s = zOf(s1), Ls = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) || 1, us = [(s1[0] - s0[0]) / Ls, (s1[1] - s0[1]) / Ls];
          const lineOf = (za, zb, shift) => ({ origin: s0, u: us, L: Ls, a: r1(za - shift), b: r1(zb - shift) });
          const slope = { top: lineOf(z0s, z1s, 0) };
          if (under !== 'closed') slope.bottom = lineOf(z0s, z1s, waist + riser);
          const a0 = add(s0, mul(n, T)), a1 = add(s1, mul(n, T));
          out.push({ poly: [s0, s1, a1, a0].map(pt), z0: under === 'closed' ? floor : Math.max(Math.min(z0s, z1s) - waist - riser, floor), z1: Math.max(z0s, z1s), side: true, slope });
        }
      });
    }
  }
  return out;
}

// ---- handrails (decision 125) ----

/** mm: handrail height above the nose line, the rail's section (width, depth), a post's side, the longest gap between posts. */
export const STAIR_RAIL = Object.freeze({ height: 900, rail: 45, depth: 40, post: 45, gap: 1000 });

/**
 * The handrail of a stair for 3D, as prisms in plan mm like stairSolids(): [{ poly, z0, z1, slope?, rail? | post? }]. `st.handrail` is
 * "left", "right" or "both" (walking up; absent or "none": no rail), `st.handrailHeight` the height above the nose line (default 900).
 * A rail runs along the chosen side of every flight, parallel to its nose line, with a post at each end and at most STAIR_RAIL.gap
 * apart; on the outer side of a turn it carries on round the free edges of the landing (level on a square landing, rising through
 * winders), on the inner side the two flights meet in one post. Heights are above the floor of the level the stair starts on, plus `dz`.
 */
export function stairRails(layout, st, { dz = 0 } = {}) {
  const mode = st.handrail;
  if (mode !== 'left' && mode !== 'right' && mode !== 'both') return [];
  const H = Number(st.handrailHeight) > 0 ? Number(st.handrailHeight) : STAIR_RAIL.height, riser = layout.riser, { rail: RW, depth: RD, post: PW } = STAIR_RAIL;
  const out = [], posts = new Map();
  const nose = (f, s) => f.h0 + riser + (riser / f.d) * s + dz;                      // the line through the noses of a flight, at s from its front edge
  const thin = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [-(b[1] - a[1]) / L * RW / 2, (b[0] - a[0]) / L * RW / 2]; return [[a[0] - n[0], a[1] - n[1]], [b[0] - n[0], b[1] - n[1]], [b[0] + n[0], b[1] + n[1]], [a[0] + n[0], a[1] + n[1]]].map(pt); };
  const post = (p, z0, z1) => {                                                      // posts that meet (a flight end and the landing corner) are one
    const key = `${Math.round(p[0])},${Math.round(p[1])}`, o = posts.get(key);
    posts.set(key, o ? { p: o.p, z0: Math.min(o.z0, z0), z1: Math.max(o.z1, z1) } : { p, z0, z1 });
  };
  // a rail member between two points whose rail tops are at za and zb
  const member = (a, b, za, zb) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(L > 0)) return;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], line = (x, y) => ({ origin: a, u, L, a: r1(x), b: r1(y) });
    out.push({ poly: thin(a, b), z0: Math.min(za, zb) - RD, z1: Math.max(za, zb), ...(Math.abs(za - zb) > 0.5 ? { slope: { bottom: line(za - RD, zb - RD), top: line(za, zb) } } : {}), rail: true });
  };
  for (const side of mode === 'both' ? ['left', 'right'] : [mode]) {
    const outer = side === (st.turn === 'L' ? 'right' : 'left');   // the side the landing's free edges are on
    layout.flights.forEach((f, k) => {
      if (!(f.run > 0) || !(f.d > 0)) return;                                       // a flight of one riser has no treads to follow
      const w = side === 'left' ? 0 : f.w;                                          // its own width (fixes list 3)
      const a = add(f.o, mul(f.r, w)), b = add(a, mul(f.u, f.run)), zA = nose(f, 0) + H, zB = nose(f, f.run) + H;
      member(a, b, zA, zB);
      const n = Math.max(1, Math.ceil(f.run / STAIR_RAIL.gap));
      for (let i = 0; i <= n; i++) { const s = f.run * i / n; post(add(a, mul(f.u, s)), nose(f, s) - riser, nose(f, s) + H); }
      const tn = layout.turns?.[k];
      if (tn && outer) {
        const P = tn.poly, chain = st.turn === 'L' ? [P[3], P[2], P[1]] : [P[0], P[1], P[2]];   // the landing's near-right → far-right → far-left (an L to the left), or the mirror
        const next = layout.flights[k + 1], z2 = next && next.d > 0 ? nose(next, 0) + H : zB, rising = layout.winders > 0;
        const lens = chain.slice(1).map((p, i) => Math.hypot(p[0] - chain[i][0], p[1] - chain[i][1])), total = lens.reduce((x, y) => x + y, 0) || 1;
        let cum = 0;
        const zs = chain.map((_, i) => { const z = rising ? zB + (z2 - zB) * cum / total : zB; cum += lens[i] ?? 0; return z; });
        chain.slice(1).forEach((p, i) => member(chain[i], p, zs[i], zs[i + 1]));
        chain.forEach((p, i) => post(p, zs[i] - H - (rising ? riser : 0), zs[i]));
      }
    });
  }
  for (const { p, z0, z1 } of posts.values()) out.push({ poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => pt([p[0] + x * PW / 2, p[1] + y * PW / 2])), z0, z1, post: true });
  return out;
}
