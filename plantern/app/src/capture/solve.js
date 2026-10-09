// Room capture solvers (PLANTERN.md §7). Pure: raw measurements in, polygon + honest residuals out.
//
// capture = { mode, raw }, raw = {
//   start?: [x, y]      plan position of corner p0 (mm, default [0, 0])
//   heading?: deg       direction of edge 0 (p0→p1): 0 = east, 90 = north (default 0)
//   lengths: [mm]       edge i runs from corner i to corner i+1 (wrapping); walked clockwise
//   turns?: "RRRLRR"    how the walk turns at corner i when it arrives from edge i-1, walking
//                       clockwise (room on your RIGHT): R = normal corner (90°), L = inside corner
//                       (270°). Default all R. A string or an array. For `rectilinear`; also a
//                       shape hint for `lengths`.
//   corners?: [deg]     INTERIOR angle at corner i (between edge i-1 and edge i), for `traverse`
//                       (any angle) and as a shape hint for `lengths`. Default 90.
//   closure?: "spread" | "line" | "square"   `rectilinear`/`traverse` only. "spread" (default)
//                       distributes the closing gap over all walls (compass rule). "line" leaves every
//                       wall exactly as measured except the last one, which just runs back to corner 0:
//                       its measured length and angle become a check (the gap is reported, not hidden).
//                       "square" (`rectilinear` only) keeps every corner at exactly 90°: the gap along
//                       the room's first-wall direction is taken up only by walls running that way, the
//                       other gap only by the walls across; worked-out lengths (`derived`) first,
//                       otherwise in proportion to length. With a heading that is a multiple of 90°
//                       every wall lies exactly on x or y.
//   locks?: [{ edge, axis: "x" | "y" }]   edges forced to lie exactly along a plan axis (rectilinear,
//                       traverse). With "square" a lock just turns the heading onto the axis; otherwise
//                       the room is solved by least squares (lengths ±5 mm, corners ±0.5°, worked-out
//                       lengths free) with the locks and the closing of the room as hard constraints,
//                       and the adjustment shows in the residuals (corners in degrees).
//   derived?: [i, …]     indices of lengths that were worked out (a wall run until it reaches a
//                       coordinate, the way back to corner 0), not measured. The solvers use them like
//                       any length; the pages show them as "not measured".
//   exact?: [i, …]       lengths known to be right (checked twice, laser): they take none of the closing
//                       gap ("square", "spread"), are held in least squares, and the other walls adjust.
//                       Not together with `derived` for the same wall
//   diagonals?: [{ a, b, length }]   corner indices + measured distance
//   checks?: [{ edge, measured, note? }]   a length that was measured but replaced by a worked-out one
//                       (not used by the solver; reported as a `check` residual so it is never lost)
// }
// modes: "rectilinear" (Method C: only 90°/270° corners), "traverse" (Method A: any angles),
//        "lengths" (Method B: lengths + diagonals, least squares).
//
// Result: { ok, polygon, residuals, rms, maxAbs, worst, closure?, redundancy?, warnings, errors }
// residual = { kind: 'edge' | 'diagonal', a, b, measured, model, residual }  (model − measured, mm)
//          | { kind: 'corner', a, b: a, measured, model, residual }  (interior angle, degrees; locks only)
//          | { kind: 'check', a, b, measured, model, residual }   (raw.checks: shown, not solved for)
// rms / maxAbs / worst cover the edge and diagonal residuals only.

import { circlePolygon } from '../geometry/circle.js';
import { wallName } from './labels.js';

const RAD = Math.PI / 180;
const names = list => list.map(wallName).join(', ');
const round1 = v => Math.round(v * 10) / 10;
const fail = (...errors) => ({ ok: false, polygon: null, residuals: [], rms: null, maxAbs: null, worst: null, warnings: [], errors });

/** Structural checks on raw data. Returns a list of error strings (empty = usable). */
export function validateRaw(mode, raw) {
  const err = [];
  if (!['rectilinear', 'traverse', 'lengths', 'circle'].includes(mode)) err.push(`unknown capture mode "${mode}"`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [...err, 'capture.raw must be an object'];
  if (mode === 'circle') {
    // a round solid: its diameter and its middle (start), typed or worked out from two walls (from)
    if (!(raw.diameter > 0)) err.push('raw.diameter must be more than 0 mm');
    if (raw.from !== undefined && (!Array.isArray(raw.from) || raw.from.length !== 2 || raw.from.some(f => typeof f?.ref !== 'string' || !(f.distance >= 0)))) err.push('raw.from must be two { ref: "r_room#e0", distance: mm } (from a wall face to the surface)');
    return err;
  }
  const { lengths, corners, diagonals, turns, closure, derived, locks } = raw;
  if (closure !== undefined && !['spread', 'line', 'square'].includes(closure)) err.push('raw.closure must be "spread", "line" or "square"');
  if (closure === 'square' && mode !== 'rectilinear') err.push('raw.closure "square" needs mode "rectilinear" (only square and inside corners)');
  if (!Array.isArray(lengths) || lengths.length < 3) return [...err, 'raw.lengths needs at least 3 edge lengths'];
  const n = lengths.length;
  lengths.forEach((l, i) => { if (!(l > 0) || !Number.isFinite(l)) err.push(`edge ${i}: length must be a positive number`); });
  if (corners !== undefined) {
    if (!Array.isArray(corners) || corners.length !== n) err.push(`raw.corners must have ${n} entries (one per corner)`);
    else corners.forEach((c, i) => { if (!(c > 0 && c < 360)) err.push(`corner ${i}: interior angle must be between 0° and 360°`); });
  }
  if (turns !== undefined) {
    const t = turnList(turns);
    if (!t || t.length !== n || t.some(x => x !== 'R' && x !== 'L')) err.push(`raw.turns must be ${n} letters, each R (normal corner) or L (inside corner)`);
    else if (corners !== undefined) err.push('give either raw.turns or raw.corners, not both');
  }
  if (raw.exact !== undefined && (!Array.isArray(raw.exact) || raw.exact.some(i => !Number.isInteger(i) || i < 0 || i >= n))) err.push(`raw.exact must list wall numbers 0..${n - 1}`);
  else if (raw.exact?.some(i => (derived || []).includes(i))) err.push('a wall cannot be both exact and worked out (raw.exact and raw.derived)');
  if (raw.checks !== undefined && (!Array.isArray(raw.checks) || raw.checks.some(c => !Number.isInteger(c?.edge) || c.edge < 0 || c.edge >= n || !(c.measured > 0)))) err.push(`raw.checks must be [{ edge: 0..${n - 1}, measured: mm }]`);
  if (derived !== undefined && (!Array.isArray(derived) || derived.some(i => !Number.isInteger(i) || i < 0 || i >= n))) err.push(`raw.derived must list wall numbers 0..${n - 1}`);
  (diagonals || []).forEach((d, i) => {
    if (!Number.isInteger(d.a) || !Number.isInteger(d.b) || d.a < 0 || d.b < 0 || d.a >= n || d.b >= n || d.a === d.b) err.push(`diagonal ${i}: a and b must be different corner indices 0..${n - 1}`);
    else if ((d.a + 1) % n === d.b || (d.b + 1) % n === d.a) err.push(`diagonal ${i}: corners ${d.a} and ${d.b} are neighbours; that is an edge, not a diagonal`);
    if (!(d.length > 0)) err.push(`diagonal ${i}: length must be a positive number`);
  });
  if (locks !== undefined) {
    if (mode === 'lengths') err.push('raw.locks work with modes "rectilinear" and "traverse" (in "lengths" mode, set the heading)');
    else if (!Array.isArray(locks) || locks.some(k => !Number.isInteger(k?.edge) || k.edge < 0 || k.edge >= n || (k.axis !== 'x' && k.axis !== 'y'))) err.push(`raw.locks must be [{ edge: 0..${n - 1}, axis: "x" or "y" }]`);
    else if (new Set(locks.map(k => k.edge)).size !== locks.length) err.push('raw.locks lists an edge twice');
  }
  if (mode === 'rectilinear' && corners !== undefined) err.push('rectilinear mode uses raw.turns (R/L), not raw.corners; use mode "traverse" for other angles');
  return err;
}

/** "RRLR" or ["R","R","L","R"] (any case, spaces and commas ignored) → ['R','R','L','R'], or null. */
function turnList(turns) {
  if (typeof turns === 'string') return [...turns.toUpperCase().replace(/[\s,]+/g, '')];
  return Array.isArray(turns) ? turns.map(x => String(x).toUpperCase()) : null;
}

/** Interior angles from turns (R = 90, L = 270) or corners; undefined when neither is given. */
function cornersOf(raw) {
  if (raw.turns !== undefined) return turnList(raw.turns).map(t => t === 'L' ? 270 : 90);
  return raw.corners;
}

/** Walk the lengths with the given interior angles. Returns n+1 points (last should equal first). */
function walk(lengths, corners, heading) {
  const pts = [[0, 0]];
  let h = heading * RAD;
  for (let i = 0; i < lengths.length; i++) {
    const [x, y] = pts[i];
    pts.push([x + lengths[i] * Math.cos(h), y + lengths[i] * Math.sin(h)]);
    // clockwise polygon: at the next corner turn right by (180 − interior)
    h -= (180 - corners[(i + 1) % lengths.length]) * RAD;
  }
  return pts;
}

const place = (pts, start) => pts.map(p => [round1(p[0] + start[0]), round1(p[1] + start[1])]);

function summarize(all) {
  const used = r => r.kind === 'edge' || r.kind === 'diagonal';   // corners are degrees, checks are not solved for
  const res = all.filter(used);
  const abs = all.map(r => (used(r) ? Math.abs(r.residual) : -1));
  const maxAbs = res.length ? Math.max(...res.map(r => Math.abs(r.residual))) : 0;
  return {
    rms: res.length ? Math.sqrt(res.reduce((s, r) => s + r.residual ** 2, 0) / res.length) : 0,
    maxAbs,
    worst: res.length ? abs.indexOf(maxAbs) : null,   // index into `residuals`
  };
}

const edgeRes = (poly, lengths) => lengths.map((m, i) => {
  const p = poly[i], q = poly[(i + 1) % poly.length], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
  return { kind: 'edge', a: i, b: (i + 1) % poly.length, measured: m, model: d, residual: d - m };
});
const diagRes = (poly, diagonals) => (diagonals || []).map(d => {
  const m = Math.hypot(poly[d.a][0] - poly[d.b][0], poly[d.a][1] - poly[d.b][1]);
  return { kind: 'diagonal', a: d.a, b: d.b, measured: d.length, model: m, residual: m - d.length, ...(d.check ? { check: d.check } : {}) };
});

/** Methods A and C: walk the traverse, then spread the closure error by the compass (Bowditch) rule. */
function solveTraverse(raw) {
  const n = raw.lengths.length, warnings = [];
  const corners = cornersOf(raw) || raw.lengths.map(() => 90);
  const sum = corners.reduce((s, c) => s + c, 0), want = (n - 2) * 180;
  if (Math.abs(sum - want) > 0.01) {
    return fail(`interior angles add up to ${sum}°, a ${n}-sided room needs ${want}° (check for a missing inside corner)`);
  }
  if (raw.closure === 'square') return solveSquare(raw, corners);
  if (raw.locks?.length) return solveLocked(raw, corners);
  const pts = walk(raw.lengths, corners, raw.heading ?? 0);
  const e = pts[n];                              // gap between where the walk ends and p0
  const total = raw.lengths.reduce((s, l) => s + l, 0);
  const line = raw.closure === 'line';
  // spread: each corner moves by the share of the walls before it; exact walls take no share
  const exact = new Set(raw.exact || []), share = raw.lengths.map((l, i) => (exact.has(i) ? 0 : l));
  const shareTotal = share.reduce((s, l) => s + l, 0);
  if (!line && !shareTotal && Math.hypot(e[0], e[1]) > 0.5) return fail('every wall is marked exact, but the room does not close: one of them is wrong');
  let run = 0;
  // line: corners 0..n-1 are exactly where the walk put them; the last edge is the straight way home
  const adj = line ? pts.slice(0, n) : pts.slice(0, n).map((p, k) => {
    const f = shareTotal ? run / shareTotal : 0; run += share[k];
    return [p[0] - e[0] * f, p[1] - e[1] * f];
  });
  if (line && exact.has(n - 1)) warnings.push(`the last wall is marked exact, but with "keep walls as measured" it just runs back to corner 0`);
  const closureMm = Math.hypot(e[0], e[1]);
  const polygon = place(adj, raw.start || [0, 0]);
  const residuals = [...edgeRes(adj, raw.lengths), ...diagRes(adj, raw.diagonals)];
  if (closureMm > 0.5) {
    const ratio = `1:${Math.round(total / closureMm)}`;
    const lastRes = line ? residuals[n - 1] : null;
    warnings.push(line && Math.abs(lastRes.model - lastRes.measured) < 0.05
      ? `the walls and corner angles entered do not close the room: leaving the last corner at its angle misses corner 0 by ${closureMm.toFixed(1)} mm (${ratio}). The last wall was drawn straight back to corner 0 (${lastRes.model.toFixed(1)} mm); all other walls are as measured. Check the angles and lengths`
      : line
      ? `the last wall as measured misses corner 0 by ${closureMm.toFixed(1)} mm (${ratio}); it was drawn straight back to corner 0 instead (${residuals[n - 1].model.toFixed(1)} mm, measured ${raw.lengths[n - 1]} mm). All other walls are as measured`
      : `closure error ${closureMm.toFixed(1)} mm (${ratio}) distributed over the edges`);
  }
  return {
    ok: true, polygon, residuals, ...summarize(residuals),
    closure: { error: [round1(e[0]), round1(e[1])], distance: round1(closureMm), perimeter: total },
    warnings, errors: [],
  };
}

/** Closure facts of a plain walk (what the measurements alone give), shared by every method. */
function walkGap(raw, corners, heading) {
  const pts = walk(raw.lengths, corners, heading), e = pts[raw.lengths.length], total = raw.lengths.reduce((s, l) => s + l, 0);
  return { pts, e, total, distance: Math.hypot(e[0], e[1]) };
}
const closureOf = g => ({ error: [round1(g.e[0]), round1(g.e[1])], distance: round1(g.distance), perimeter: g.total });

/**
 * The heading a lock asks for: edge `k` must run along `axis`. Returns the heading of edge 0 closest to
 * `heading` that puts edge k on the axis (the room turns, its shape does not).
 */
function lockedHeading(corners, heading, lock) {
  let dir = heading;                                     // direction of edge k for this heading
  for (let i = 1; i <= lock.edge; i++) dir -= 180 - corners[i];
  const want = lock.axis === 'x' ? 0 : 90;               // 0/180 for x, 90/270 for y
  const turn = ((((want - dir) % 180) + 270) % 180) - 90; // smallest turn onto the axis, −90..90
  return heading + turn;
}

/** closure "square": every corner exactly 90°; each gap is taken up only by the walls running its way. */
function solveSquare(raw, corners) {
  const n = raw.lengths.length, warnings = [];
  let heading = raw.heading ?? 0;
  if (raw.locks?.length) {
    const hs = raw.locks.map(k => lockedHeading(corners, heading, k));
    if (hs.some(h => Math.abs(h - hs[0]) > 1e-6)) return fail('the locks contradict each other: in a square room they must agree on how the room is turned (two neighbouring walls cannot both lie along the same axis)');
    if (Math.abs(hs[0] - heading) > 1e-6) warnings.push(`turned ${round1(hs[0] - heading)}° so the locked wall${raw.locks.length > 1 ? 's lie' : ' lies'} exactly on the axis (heading ${round1(heading)}° → ${round1(hs[0])}°)`);
    heading = hs[0];
  }
  // walk in the room's own frame (edge 0 along +x), so walls run along x or y there
  const g = walkGap(raw, corners, 0);
  const derived = new Set(raw.derived || []);
  const L = [...raw.lengths], took = [];
  for (const axis of [0, 1]) {
    const along = raw.lengths.map((_, i) => i).filter(i => {
      const d = [g.pts[i + 1][0] - g.pts[i][0], g.pts[i + 1][1] - g.pts[i][1]];
      return Math.abs(d[axis]) > Math.abs(d[1 - axis]);
    });
    const exact = new Set(raw.exact || []);
    const take = along.some(i => derived.has(i)) ? along.filter(i => derived.has(i)) : along.filter(i => !exact.has(i));
    if (!take.length && Math.abs(g.e[axis]) > 0.05) return fail(`all walls ${axis ? 'across the first wall' : 'along the first wall'} (${names(along)}) are marked exact, but they miss corner 0 by ${round1(Math.abs(g.e[axis]))} mm that way: one of them is wrong, or not exact`);
    const total = take.reduce((s, i) => s + raw.lengths[i], 0);
    if (Math.abs(g.e[axis]) > 0.05) took.push(`${round1(Math.abs(g.e[axis]))} mm ${axis ? 'across the first wall' : 'along the first wall'} went into wall${take.length > 1 ? 's' : ''} ${names(take)}${take.some(i => derived.has(i)) ? ' (worked out)' : ''}`);
    for (const i of take) {
      const sign = Math.sign(g.pts[i + 1][axis] - g.pts[i][axis]);
      L[i] = raw.lengths[i] - sign * g.e[axis] * raw.lengths[i] / total;
    }
  }
  const bad = L.findIndex(l => !(l > 0.5));
  if (bad >= 0) return fail(`the room does not close with square corners: wall ${wallName(bad)} would have to be ${round1(L[bad])} mm long. Check the turns (R/L) and the lengths`);
  const pts = walk(L, corners, heading).slice(0, n);
  const polygon = place(pts, raw.start || [0, 0]);
  const residuals = [...edgeRes(pts, raw.lengths), ...diagRes(pts, raw.diagonals)];
  if (g.distance > 0.5) warnings.push(`the walls as measured miss corner 0 by ${round1(g.distance)} mm (1:${Math.round(g.total / g.distance)}): ${took.join('; ')}. All corners stay square`);
  return { ok: true, polygon, residuals, ...summarize(residuals), closure: closureOf(g), warnings, errors: [] };
}

const SIGMA_LENGTH = 5, SIGMA_DERIVED = 1000, SIGMA_EXACT = 0.05, SIGMA_CORNER = 0.5 * RAD;   // mm, mm, mm, rad
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Locks without "square": least squares over the edge headings and lengths. Measured lengths ±5 mm,
 * corner angles ±0.5°, worked-out lengths nearly free; hard constraints: the room closes and each
 * locked edge lies exactly on its axis (Gauss–Newton on the KKT system). The locks fix the rotation.
 */
function solveLocked(raw, corners) {
  const n = raw.lengths.length, warnings = [];
  const heading = raw.heading ?? 0, derived = new Set(raw.derived || []), exactSet = new Set(raw.exact || []);
  const g = walkGap(raw, corners, heading);
  // start values: the plain walk; locked edges snapped onto their axis direction nearest the walk
  const h = g.pts.slice(0, n).map((p, i) => Math.atan2(g.pts[i + 1][1] - p[1], g.pts[i + 1][0] - p[0]));
  const l = [...raw.lengths];
  const fixed = new Map();
  for (const k of raw.locks) {
    const base = k.axis === 'x' ? 0 : Math.PI / 2, a = h[k.edge];
    const target = [base, base + Math.PI, base - Math.PI].reduce((best, t) => (Math.abs(wrapPi(a - t)) < Math.abs(wrapPi(a - best)) ? t : best));
    const off = Math.abs(wrapPi(a - target)) / RAD;
    if (off > 5) warnings.push(`wall ${wallName(k.edge)} runs ${round1(off)}° off the ${k.axis} axis as measured; locking it turns the room`);
    fixed.set(k.edge, wrapPi(target));
    h[k.edge] = wrapPi(target);
  }
  const free = h.map((_, i) => i).filter(i => !fixed.has(i));
  const nh = free.length, m = nh + n;                       // unknowns: free headings, then all lengths
  const hi = i => free.indexOf(i);                          // column of heading i, −1 when locked
  const turnObs = i => -(180 - corners[i]) * RAD;           // h_i − h_(i−1) for a clockwise walk
  let ok = false;
  for (let it = 0; it < 50; it++) {
    const rows = [];                                        // { cols: [[col, d]], r, w }
    for (let i = 0; i < n; i++) rows.push({ cols: [[nh + i, 1]], r: l[i] - raw.lengths[i], w: 1 / (derived.has(i) ? SIGMA_DERIVED : exactSet.has(i) ? SIGMA_EXACT : SIGMA_LENGTH) ** 2 });
    for (let i = 0; i < n; i++) {
      const prev = (i + n - 1) % n, cols = [];
      if (hi(i) >= 0) cols.push([hi(i), 1]);
      if (hi(prev) >= 0) cols.push([hi(prev), -1]);
      rows.push({ cols, r: wrapPi(h[i] - h[prev] - turnObs(i)), w: 1 / SIGMA_CORNER ** 2 });
    }
    // constraints: sum l cos h = 0, sum l sin h = 0
    const C = [new Array(m).fill(0), new Array(m).fill(0)];
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      cx += l[i] * Math.cos(h[i]); cy += l[i] * Math.sin(h[i]);
      C[0][nh + i] = Math.cos(h[i]); C[1][nh + i] = Math.sin(h[i]);
      if (hi(i) >= 0) { C[0][hi(i)] = -l[i] * Math.sin(h[i]); C[1][hi(i)] = l[i] * Math.cos(h[i]); }
    }
    const K = Array.from({ length: m + 2 }, () => new Array(m + 2).fill(0)), rhs = new Array(m + 2).fill(0);
    for (const row of rows) for (const [a, da] of row.cols) {
      rhs[a] -= row.w * da * row.r;
      for (const [b, db] of row.cols) K[a][b] += row.w * da * db;
    }
    for (let c = 0; c < 2; c++) for (let j = 0; j < m; j++) { K[m + c][j] = C[c][j]; K[j][m + c] = C[c][j]; }
    rhs[m] = -cx; rhs[m + 1] = -cy;
    const step = gauss(K, rhs);
    if (!step) return fail('the locks and measurements cannot be solved together (check that the locked walls can really lie on those axes)');
    free.forEach((i, j) => { h[i] = wrapPi(h[i] + step[j]); });
    for (let i = 0; i < n; i++) l[i] += step[nh + i];
    const size = Math.max(...step.slice(0, m).map((x, j) => Math.abs(x) * (j < nh ? 1000 : 1)));
    if (size < 1e-6) { ok = true; break; }
  }
  if (!ok) warnings.push('solver did not fully converge; treat the result with care');
  if (l.some(x => !(x > 0.5))) return fail('the locks and measurements do not give a sensible room (a wall would get no length); check the locks');
  const pts = [[0, 0]];
  for (let i = 0; i < n - 1; i++) pts.push([pts[i][0] + l[i] * Math.cos(h[i]), pts[i][1] + l[i] * Math.sin(h[i])]);
  const polygon = place(pts, raw.start || [0, 0]);
  const cornerRes = corners.map((c, i) => {
    const prev = (i + n - 1) % n, model = 180 + wrapPi(h[i] - h[prev]) / RAD;
    return { kind: 'corner', a: i, b: i, measured: c, model: Math.round(model * 100) / 100, residual: Math.round((model - c) * 100) / 100 };
  }).filter(r => Math.abs(r.residual) >= 0.01);
  const residuals = [...edgeRes(pts, raw.lengths), ...cornerRes, ...diagRes(pts, raw.diagonals)];
  if (g.distance > 0.5) warnings.push(`the walls as measured miss corner 0 by ${round1(g.distance)} mm (1:${Math.round(g.total / g.distance)}); spread by least squares with the locked walls kept exactly on their axes`);
  return { ok: true, polygon, residuals, ...summarize(residuals), closure: closureOf(g), warnings, errors: [] };
}

// ---- Method B: least squares ------------------------------------------------------------------

/** Solve A x = b by Gaussian elimination with partial pivoting. Returns null when singular. */
function gauss(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  const scale = Math.max(1e-30, ...A.map((r, i) => Math.abs(r[i])));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-10 * scale) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Start layout for the solver: from corner hints when given, else the lengths on a circle. */
function initialLayout(raw) {
  const n = raw.lengths.length;
  if (cornersOf(raw)) return walk(raw.lengths, cornersOf(raw), 0).slice(0, n);
  const L = raw.lengths, longest = Math.max(...L);
  const span = R => L.reduce((s, l) => s + 2 * Math.asin(Math.min(1, l / (2 * R))), 0);
  let lo = longest / 2, hi = longest * n, ang;
  if (span(lo) <= 2 * Math.PI) {
    // one edge dominates; no circle fits, so scale the angles to a full turn
    ang = L.map(l => 2 * Math.asin(Math.min(1, l / longest)) * (2 * Math.PI / span(lo)));
  } else {
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (span(mid) > 2 * Math.PI) lo = mid; else hi = mid; }
    ang = L.map(l => 2 * Math.asin(Math.min(1, l / (2 * lo))));
  }
  const pts = []; let a = 0;
  for (let i = 0; i < n; i++) { pts.push([lo * Math.cos(-a), lo * Math.sin(-a)]); a += ang[i]; }   // clockwise
  return pts;
}

/**
 * Method B. Unknowns are all corner coordinates except the gauge: p0 = (0,0) and p1 on the x axis,
 * which removes translation and rotation (2n − 3 unknowns). Levenberg–Marquardt on the distance
 * residuals; if the measurements do not fix the shape the normal equations are singular and we say so.
 */
function solveLengths(raw) {
  const n = raw.lengths.length, warnings = [];
  const cons = [
    ...raw.lengths.map((m, i) => ({ a: i, b: (i + 1) % n, m, w: (raw.exact || []).includes(i) ? 100 : 1 })),
    ...(raw.diagonals || []).map(d => ({ a: d.a, b: d.b, m: d.length })),
  ];
  const unknowns = 2 * n - 3;
  if (cons.length < unknowns) {
    return fail(`not enough measurements to fix the shape: ${cons.length} given, ${unknowns} needed (${n} edges + at least ${n - 3} diagonals)`);
  }

  // local frame: rotate/translate the start layout so p0 = origin and p1 on +x
  const init = initialLayout(raw);
  const th = Math.atan2(init[1][1] - init[0][1], init[1][0] - init[0][0]), c = Math.cos(-th), s = Math.sin(-th);
  const P = init.map(p => { const x = p[0] - init[0][0], y = p[1] - init[0][1]; return [x * c - y * s, x * s + y * c]; });
  // variable layout: [p1.x, p2.x, p2.y, …, p(n-1).x, p(n-1).y]
  const pack = () => [P[1][0], ...P.slice(2).flatMap(p => p)];
  const unpack = v => { P[1] = [v[0], 0]; for (let i = 2; i < n; i++) P[i] = [v[1 + 2 * (i - 2)], v[2 + 2 * (i - 2)]]; };
  const col = (pt, axis) => pt === 0 ? -1 : pt === 1 ? (axis === 0 ? 0 : -1) : 1 + 2 * (pt - 2) + axis;

  const evaluate = () => {
    const r = [], J = [];
    for (const k of cons) {
      const A = P[k.a], B = P[k.b], dx = A[0] - B[0], dy = A[1] - B[1], d = Math.hypot(dx, dy) || 1e-9;
      const wk = k.w ?? 1;
      r.push((d - k.m) * wk);
      const row = new Array(unknowns).fill(0);
      for (const [pt, sign] of [[k.a, 1], [k.b, -1]]) for (const axis of [0, 1]) {
        const ci = col(pt, axis);
        if (ci >= 0) row[ci] += wk * sign * (axis === 0 ? dx : dy) / d;
      }
      J.push(row);
    }
    return { r, J };
  };
  const cost = r => r.reduce((sum, x) => sum + x * x, 0);
  const normal = J => J[0].map((_, i) => J[0].map((_, j) => J.reduce((sum, row) => sum + row[i] * row[j], 0)));

  let v = pack(), lambda = 1e-3, converged = false;
  for (let it = 0; it < 200 && !converged; it++) {
    unpack(v);
    const { r, J } = evaluate(), H = normal(J);
    const g = H.map((_, i) => J.reduce((sum, row, k) => sum + row[i] * r[k], 0));
    let stepped = false;
    for (let tries = 0; tries < 30 && !stepped; tries++) {
      const D = H.map((row, i) => row.map((x, j) => i === j ? x + lambda * Math.max(x, 1e-6) : x));
      const dv = gauss(D, g.map(x => -x));
      if (!dv) { lambda *= 10; continue; }
      const trial = v.map((x, i) => x + dv[i]);
      unpack(trial);
      if (cost(evaluate().r) < cost(r)) {
        v = trial; lambda = Math.max(lambda / 5, 1e-9); stepped = true;
        if (Math.hypot(...dv) < 1e-7) converged = true;
      } else { unpack(v); lambda *= 5; }
    }
    if (!stepped) converged = cost(r) < 1e-6;   // no improving step: fine if already (numerically) exact
    if (!stepped) break;
  }
  unpack(v);

  const { J } = evaluate();
  if (!gauss(normal(J), new Array(unknowns).fill(0))) {
    return fail('the measurements do not fix the shape (corner positions are not uniquely determined); add a diagonal that crosses the room differently, or give raw.turns as a hint');
  }

  // clockwise orientation (distances cannot tell a shape from its mirror image)
  const area = P.reduce((sum, p, i) => { const q = P[(i + 1) % n]; return sum + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;
  let pts = P.map(p => [p[0], area > 0 ? -p[1] : p[1]]);
  // rotate so edge 0 has the requested heading, then translate to `start`
  const h = (raw.heading ?? 0) * RAD, ch = Math.cos(h), sh = Math.sin(h);
  pts = pts.map(p => [p[0] * ch - p[1] * sh, p[0] * sh + p[1] * ch]);
  const polygon = place(pts, raw.start || [0, 0]);

  const residuals = [...edgeRes(pts, raw.lengths), ...diagRes(pts, raw.diagonals)];
  const redundancy = cons.length - unknowns;
  if (!converged) warnings.push('solver did not fully converge; treat the result with care');
  if (redundancy === 0) warnings.push('no redundant measurements: residuals are zero by construction and cannot expose a bad measurement; add a diagonal');
  if (cornersOf(raw) === undefined && n > 3) warnings.push('solved without corner hints; if the room has an inside (reflex) corner, give raw.turns to select the right shape');
  return { ok: true, polygon, residuals, ...summarize(residuals), redundancy, warnings, errors: [] };
}

/**
 * Solve one room's capture. Never throws on bad data; returns { ok: false, errors }.
 * extra.diagonals: control measurements between two of its corners (model.checks with solve: true,
 * model/checks.js) that join the solve like measured diagonals (Method B; other methods show them).
 */
export function solveCapture(capture, extra = {}) {
  if (!capture) return fail('room has no capture data');
  if (extra.diagonals?.length && capture.mode !== 'circle') capture = { ...capture, raw: { ...capture.raw, diagonals: [...(capture.raw?.diagonals || []), ...extra.diagonals] } };
  const errors = validateRaw(capture.mode, capture.raw);
  if (errors.length) return fail(...errors);
  if (capture.mode === 'circle') return { ok: true, polygon: circlePolygon(capture.raw.start ?? [0, 0], capture.raw.diameter), residuals: [], rms: 0, maxAbs: 0, worst: null, warnings: [], errors: [] };
  const r = capture.mode === 'lengths' ? solveLengths(capture.raw) : solveTraverse(capture.raw);
  if (!r.ok || !capture.raw.checks?.length) return r;
  const n = r.polygon.length;
  const checks = capture.raw.checks.map(c => {
    const p = r.polygon[c.edge], q = r.polygon[(c.edge + 1) % n], model = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return { kind: 'check', a: c.edge, b: (c.edge + 1) % n, measured: c.measured, model, residual: model - c.measured };
  });
  return { ...r, residuals: [...r.residuals, ...checks] };
}
