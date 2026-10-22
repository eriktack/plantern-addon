// Dragging a room (or solid) on the plan (PLANTERN.md §7, roadmap 8; pure, no DOM). Two gestures, both
// on the capture (the measurements), never on the polygon, so the room is solved again from them:
//
//  - moveCapture: the room moves as a whole. Only where corner 0 is changes (raw.start, and the offset
//    from the point it hangs on); every measurement stays as it was.
//  - dragCorner: one corner goes to a new place and the room reshapes around it. Every wall keeps its
//    direction (every corner its angle): the two walls meeting at the corner slide sideways, and the
//    walls beside them stretch to meet them. The walls whose length changed are marked worked out
//    (raw.derived); a length that was measured is kept as a check (raw.checks), never lost.

const r1 = v => Math.round(v * 10) / 10;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

/** The capture moved by d = [dx, dy] mm: corner 0 (and the offset from the point it hangs on) shifts. */
export function moveCapture(capture, d) {
  const raw = capture.raw || {}, st = raw.start || [0, 0];
  const out = { ...raw, start: [r1(st[0] + d[0]), r1(st[1] + d[1])] };
  if (raw.origin) out.origin = { ...raw.origin, offset: [r1((raw.origin.offset?.[0] ?? 0) + d[0]), r1((raw.origin.offset?.[1] ?? 0) + d[1])] };
  return { ...capture, raw: out };
}

/** a, b with a·u + b·v = w (null when u and v are parallel). */
function split(w, u, v) {
  const den = cross(u, v);
  if (Math.abs(den) < 1e-9) return null;
  return [cross(w, v) / den, cross(u, w) / den];
}

/**
 * New lengths for the four walls around corner i so that, walking the measured lengths along the
 * walls' directions from a corner that does not move (anchor A), corner i lands on `target` and the
 * room closes. Two small 2×2 systems: the walls i−2, i−1 bring the walk from corner i−2 to the target,
 * the walls i, i+1 bring it on to corner i+2. Returns { lengths, polygon } or { error }.
 */
function reshape(polygon, dirs, lengths, i, target, A) {
  const n = polygon.length, idx = k => ((k % n) + n) % n;
  let p = [...polygon[A]];
  for (let e = A; e !== idx(i - 2); e = idx(e + 1)) p = [p[0] + lengths[e] * dirs[e][0], p[1] + lengths[e] * dirs[e][1]];
  let q = [...polygon[A]];
  for (let e = idx(A - 1); idx(e + 1) !== idx(i + 2); e = idx(e - 1)) q = [q[0] - lengths[e] * dirs[e][0], q[1] - lengths[e] * dirs[e][1]];
  const ab = split(sub(target, p), dirs[idx(i - 2)], dirs[idx(i - 1)]), cd = split(sub(q, target), dirs[idx(i)], dirs[idx(i + 1)]);
  if (!ab || !cd) return { error: 'a wall at this corner runs straight on: there is no corner to move' };
  const out = [...lengths];
  [[i - 2, ab[0]], [i - 1, ab[1]], [i, cd[0]], [i + 1, cd[1]]].forEach(([k, v]) => { out[idx(k)] = v; });
  for (const k of [i - 2, i - 1, i, i + 1]) if (!(out[idx(k)] >= 1)) return { error: `wall ${idx(k)} would vanish or turn round: the corner went past it` };
  const poly = new Array(n);
  poly[A] = [...polygon[A]];
  for (let k = 1; k < n; k++) { const e = idx(A + k - 1), c = poly[e]; poly[idx(A + k)] = [c[0] + out[e] * dirs[e][0], c[1] + out[e] * dirs[e][1]]; }
  return { lengths: out, polygon: poly };
}

/**
 * Corner `i` of the room (polygon = the room as solved from `capture` now) moved to `target`.
 * `solve` = solveCapture (passed in, so this module stays small): the result is solved again and
 * corrected until the corner is within half a millimetre of the target (the solver spreads a closing
 * gap, and locks may turn the room).
 * Returns { capture, polygon, changed: [edge numbers], checks: [edges whose measured length became a check] }
 * or { error }. Rooms measured by lengths and diagonals (Method B) carry no directions, so they are
 * refused; so is a wall marked exact (error 'exact', with `exact`) and a three-cornered room.
 */
export function dragCorner(capture, polygon, i, target, solve) {
  const raw = capture?.raw || {}, n = polygon?.length || 0;
  if (n < 3 || !(i >= 0 && i < n)) return { error: 'no such corner' };
  if (capture.mode === 'lengths') return { error: 'this one is measured by lengths and diagonals: change the lengths (or measure it wall by wall) to reshape it' };
  if (n === 3) return { error: 'a three-cornered room changes shape only through its lengths and angles' };
  if (!Array.isArray(raw.lengths) || raw.lengths.length !== n) return { error: 'the measurements and the shape do not match' };
  const idx = k => ((k % n) + n) % n;
  const dirs = polygon.map((p, k) => { const q = polygon[idx(k + 1)], L = Math.hypot(q[0] - p[0], q[1] - p[1]); return L ? [(q[0] - p[0]) / L, (q[1] - p[1]) / L] : null; });
  if (dirs.some(d => !d)) return { error: 'a wall of this room has no length' };
  const moving = [i - 1, i, i + 1].map(idx), A = moving.includes(0) ? idx(i + 2) : 0;
  const edges = [i - 2, i - 1, i, i + 1].map(idx);
  const build = aim => {
    const r = reshape(polygon, dirs, raw.lengths, i, aim, A);
    if (r.error) return r;
    const lengths = raw.lengths.map((v, k) => (edges.includes(k) ? r1(r.lengths[k]) : v));
    const changed = edges.filter(k => Math.abs(lengths[k] - raw.lengths[k]) >= 0.1).sort((a, b) => a - b);
    let out = { ...raw, lengths };
    const derived = [...new Set([...(raw.derived || []), ...changed])].sort((a, b) => a - b);
    if (derived.length) out.derived = derived;
    let cap = { ...capture, raw: out };
    // corner 0 moved: the start moves with it (the heading stays: wall A keeps its direction)
    if (moving.includes(0)) { const d0 = sub(r.polygon[0], polygon[0]); cap = moveCapture(cap, d0); }
    return { capture: cap, polygon: r.polygon, changed };
  };
  let aim = [...target], res = build(aim);
  for (let k = 0; !res.error && solve && k < 4; k++) {
    const s = solve(res.capture);
    if (!s.ok) break;
    const miss = sub(target, s.polygon[i]);
    if (Math.hypot(miss[0], miss[1]) <= 0.5) break;
    aim = [aim[0] + miss[0], aim[1] + miss[1]];
    const next = build(aim);
    if (next.error) break;
    res = next;
  }
  if (res.error) return res;
  const exact = (raw.exact || []).filter(k => res.changed.includes(k));
  if (exact.length) return { error: 'exact', exact };
  const checks = [...(raw.checks || [])], kept = [];
  for (const k of res.changed) {
    if ((raw.derived || []).includes(k) || checks.some(c => c.edge === k)) continue;
    checks.push({ edge: k, measured: raw.lengths[k], note: 'measured; the corner was moved on the plan' });
    kept.push(k);
  }
  if (checks.length) res.capture.raw.checks = checks.sort((a, b) => a.edge - b.edge);
  return { ...res, checks: kept };
}

/**
 * The move that puts a dragged room's nearest corner on a point within `reach` mm: [dx, dy] to add to
 * `delta`, or null. polygon = the room before the drag, delta = how far it has been dragged,
 * points = [{ pos }] it may land on (the room's own points left out by the caller).
 */
export function snapMove(polygon, delta, points, reach) {
  let best = null;
  for (const p of polygon) {
    const q = [p[0] + delta[0], p[1] + delta[1]];
    for (const s of points) {
      const d = Math.hypot(s.pos[0] - q[0], s.pos[1] - q[1]);
      if (d <= reach && (!best || d < best.d)) best = { d, fix: [s.pos[0] - q[0], s.pos[1] - q[1]], ref: s.ref };
    }
  }
  return best && { fix: best.fix, ref: best.ref };
}


/** The axis a line from a to b runs closest to: 'x' or 'y'. */
export const nearAxis = (a, b) => (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'x' : 'y');

/**
 * A hand-drawn wall's end dragged to `target`: the new { a, b }. With `lock` ('axis', walls[].lock)
 * the wall stays exactly along the axis it runs along now; otherwise it is kept straight when within
 * 2° of x or y (`force`: always, Shift). The other end stays.
 */
export function dragWallEnd(wall, end, target, { lock = null, force = false } = {}) {
  const other = end === 'a' ? wall.b : wall.a;
  let p = [...target];
  const axis = lock === 'axis' ? nearAxis(wall.a, wall.b) : (() => {
    const dx = p[0] - other[0], dy = p[1] - other[1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 90;
    return force || Math.min(ang, 90 - ang) <= 2 ? nearAxis(other, p) : null;
  })();
  if (axis === 'x') p = [p[0], other[1]];
  if (axis === 'y') p = [other[0], p[1]];
  p = p.map(r1);
  return end === 'a' ? { a: p, b: [...wall.b] } : { a: [...wall.a], b: p };
}

/** A hand-drawn wall moved as a whole by d. */
export const moveWall = (wall, d) => ({ a: [r1(wall.a[0] + d[0]), r1(wall.a[1] + d[1])], b: [r1(wall.b[0] + d[0]), r1(wall.b[1] + d[1])] });

/** Is a wall along x or y (within tol mm across its length)? */
export const onAxis = (a, b, tol = 0.5) => Math.abs(a[0] - b[0]) <= tol || Math.abs(a[1] - b[1]) <= tol;

/**
 * A free object (box measured from corner `pos`, turned `rotationDeg`) turned about its middle so that
 * its front (local +y) points at `toward`. Steps of 15° snap when within 4° (`free`: whole degrees only).
 * Returns { pos, rotationDeg }.
 */
export function rotateObject(o, toward, { free = false } = {}) {
  const half = [o.size[0] / 2, o.size[1] / 2], rot = deg => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [half[0] * c - half[1] * s, half[0] * s + half[1] * c]; };
  const h0 = rot(o.rotationDeg || 0), mid = [o.pos[0] + h0[0], o.pos[1] + h0[1]];
  let deg = Math.atan2(toward[1] - mid[1], toward[0] - mid[0]) * 180 / Math.PI - 90;
  deg = ((Math.round(deg) % 360) + 360) % 360;
  const step = Math.round(deg / 15) * 15;
  if (!free && Math.abs(step - deg) <= 4) deg = step % 360;
  const h1 = rot(deg);
  return { pos: [Math.round(mid[0] - h1[0]), Math.round(mid[1] - h1[1])], rotationDeg: deg };
}

// ---- things dragged on the plan (ui-consistency plan, UX2): the new place worked out per pointer frame ----
// These are pure, so a drag can preview every frame and store once, when the pointer is let go.

/**
 * The attach of a thing `width` mm wide whose middle is dragged to `p`: on the nearest wall face with a body
 * within `reach` mm (its side by which face p is on), centred on p and kept on the wall. walls = the level's
 * walls, frames = Map(id → wallFrame) of its geometry. No wall near: `cur` unchanged.
 */
export function attachNear(p, cur, width, walls, frames, { reach = 900, hasBody = w => w.kind !== 'virtual' && (w.thickness || 0) > 0 } = {}) {
  let best = null;
  for (const w of walls || []) {
    if (!hasBody(w)) continue;
    const f = frames.get(w.id);
    if (!f) continue;
    const s = (p[0] - w.a[0]) * f.u[0] + (p[1] - w.a[1]) * f.u[1], t = (p[0] - w.a[0]) * f.n[0] + (p[1] - w.a[1]) * f.n[1];
    const along = Math.min(Math.max(s, 0), f.L), dist = Math.hypot(s - along, t);
    if (dist < reach && (!best || dist < best.dist)) best = { w, f, s, t, dist };
  }
  if (!best) return cur;
  const { w, f, s, t } = best;
  return { ...cur, wall: w.id, side: t >= 0 ? 'left' : 'right', offset: r1(Math.min(Math.max(s - width / 2, 0), Math.max(f.L - width, 0))) };
}

/** A free box (measured from corner `pos`, turned `rotationDeg`) with its middle at `mid`: its new pos. */
export function boxPosForMiddle(o, mid) {
  const a = (o.rotationDeg || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = o.size[0] / 2, hd = o.size[1] / 2;
  return [Math.round(mid[0] - (hw * c - hd * s)), Math.round(mid[1] - (hw * s + hd * c))];
}

/**
 * One end of an LED strip on a wall dragged to `s` mm along the wall (wall length L): the new { offset, length }.
 * Whole centimetres unless `exact` (Alt); the strip keeps at least `min` mm and stays on the wall.
 */
export function stripEndDrag(attach, end, s0, L, { exact = false, min = 50 } = {}) {
  const s = exact ? s0 : Math.round(s0 / 10) * 10;
  const start = attach.offset, stop = attach.offset + attach.length;
  const offset = end === 'a' ? Math.min(Math.max(s, 0), stop - min) : start;
  const length = end === 'a' ? stop - offset : Math.min(Math.max(s - start, min), L - start);
  return { offset: r1(offset), length: r1(length) };
}

/**
 * An opening dragged along its wall (ui-consistency plan, UX11). `what`: 'body' (it slides; `s` is where the grabbed point
 * is now and `grab` how far that point was from the near edge), 'a' (the near edge goes to s) or 'b' (the far edge goes to s).
 * It stays on the wall (length L) and between the openings beside it (`others`: [{ offset, width }] on the same wall), at
 * least `min` mm wide, in whole centimetres unless `exact`. Returns { offset, width }.
 */
export function openingDrag(o, what, s, L, others = [], { grab = 0, exact = false, min = 100 } = {}) {
  const snap = v => (exact ? r1(v) : Math.round(v / 10) * 10);
  const end = o.offset + o.width;
  // the free stretch the opening is in: up to the nearest neighbour on each side (as it stood when the drag began)
  const lo = Math.max(0, ...others.filter(x => x.offset + x.width <= o.offset + 0.5).map(x => x.offset + x.width));
  const hi = Math.min(L, ...others.filter(x => x.offset >= end - 0.5).map(x => x.offset));
  if (what === 'body') {
    const offset = Math.min(Math.max(snap(s - grab), lo), Math.max(lo, hi - o.width));
    return { offset: r1(offset), width: o.width };
  }
  if (what === 'a') {
    const offset = Math.min(Math.max(snap(s), lo), end - min);
    return { offset: r1(offset), width: r1(end - offset) };
  }
  const width = Math.min(Math.max(snap(s) - o.offset, min), hi - o.offset);
  return { offset: o.offset, width: r1(width) };
}

/**
 * The handles of a box-like object for resizing (ui-consistency plan, UX13): where each side's handle is, by side name
 * ('x0', 'x1' its width's two ends, 'y0', 'y1' its depth's back and front). A free object has all four; one on a wall has
 * its two ends and its front (the back stays on the wall). `wall` = { a, frame } for one on a wall (frame from wallFrame()).
 */
export function resizeHandles(o, wall = null) {
  const [w, d] = o.size, at = (p, u, s) => [p[0] + u[0] * s, p[1] + u[1] * s];
  let base, u, v;
  if (o.attach?.wall && wall) {
    const f = wall.frame, sign = o.attach.side === 'left' ? 1 : -1, face = o.attach.side === 'left' ? f.offL : f.offR;
    u = f.u; v = [f.n[0] * sign, f.n[1] * sign];
    base = at(at(wall.a, u, o.attach.offset), v, face + (o.attach.gap || 0));
  } else if (o.pos) {
    const r = (o.rotationDeg || 0) * Math.PI / 180;
    u = [Math.cos(r), Math.sin(r)]; v = [-Math.sin(r), Math.cos(r)]; base = o.pos;
  } else return {};
  const out = { x0: at(base, v, d / 2), x1: at(at(base, u, w), v, d / 2), y1: at(at(base, u, w / 2), v, d) };
  if (!o.attach) out.y0 = at(base, u, w / 2);
  return out;
}

/**
 * The cursor for dragging an object's side along the plan direction `dir` (a unit vector in plan axes). The plan flips y on the screen,
 * so a box turned 90° has its width running up and down: the arrow must follow the screen direction, not the side's name.
 */
export function resizeCursor(dir) {
  const a = ((Math.atan2(-dir[1], dir[0]) % Math.PI) + Math.PI) % Math.PI;   // a line through the handle: 0 to π
  if (a < Math.PI / 8 || a >= 7 * Math.PI / 8) return 'ew-resize';
  if (a < 3 * Math.PI / 8) return 'nwse-resize';
  if (a < 5 * Math.PI / 8) return 'ns-resize';
  return 'nesw-resize';
}

/**
 * An object's side `side` dragged to plan point p (UX13): its new { size, pos } (free) or { size, attach } (on a wall). The
 * opposite side stays where it is; whole centimetres unless `exact`; at least `min` mm. `wall` as for resizeHandles().
 */
export function resizeObject(o, side, p, wall = null, { exact = false, min = 50 } = {}) {
  const snap = v => (exact ? r1(v) : Math.round(v / 10) * 10);
  const [w, d, h] = o.size;
  if (o.attach?.wall && wall) {
    const f = wall.frame, sign = o.attach.side === 'left' ? 1 : -1, face = o.attach.side === 'left' ? f.offL : f.offR;
    const s = (p[0] - wall.a[0]) * f.u[0] + (p[1] - wall.a[1]) * f.u[1], t = ((p[0] - wall.a[0]) * f.n[0] + (p[1] - wall.a[1]) * f.n[1]) * sign;
    const end = o.attach.offset + w;
    if (side === 'x0') { const off = Math.min(Math.max(snap(s), 0), end - min); return { size: [r1(end - off), d, h], attach: { ...o.attach, offset: r1(off) } }; }
    if (side === 'x1') return { size: [r1(Math.min(Math.max(snap(s) - o.attach.offset, min), f.L - o.attach.offset)), d, h], attach: { ...o.attach } };
    return { size: [w, r1(Math.max(snap(t - face - (o.attach.gap || 0)), min)), h], attach: { ...o.attach } };
  }
  const r = (o.rotationDeg || 0) * Math.PI / 180, u = [Math.cos(r), Math.sin(r)], v = [-Math.sin(r), Math.cos(r)];
  const q = [p[0] - o.pos[0], p[1] - o.pos[1]], x = q[0] * u[0] + q[1] * u[1], y = q[0] * v[0] + q[1] * v[1];
  let x0 = 0, x1 = w, y0 = 0, y1 = d;
  if (side === 'x0') x0 = Math.min(snap(x), w - min);
  if (side === 'x1') x1 = Math.max(snap(x), min);
  if (side === 'y0') y0 = Math.min(snap(y), d - min);
  if (side === 'y1') y1 = Math.max(snap(y), min);
  return { size: [r1(x1 - x0), r1(y1 - y0), h], pos: [r1(o.pos[0] + u[0] * x0 + v[0] * y0), r1(o.pos[1] + u[1] * x0 + v[1] * y0)] };
}

/**
 * A free object dragged near a wall (ui-consistency plan, UX15): when its back would come within `reach` mm of a wall face
 * (or into it), the attach that hangs it flush on that face, centred on its middle `mid`; else null. depth = the object's
 * depth (its back is depth/2 from its middle), width = its width along the wall.
 */
export function wallSnap(mid, width, depth, walls, frames, { reach = 150, hasBody = w => w.kind !== 'virtual' && (w.thickness || 0) > 0 } = {}) {
  let best = null;
  for (const w of walls || []) {
    if (!hasBody(w)) continue;
    const f = frames.get(w.id);
    if (!f) continue;
    const s = (mid[0] - w.a[0]) * f.u[0] + (mid[1] - w.a[1]) * f.u[1], t = (mid[0] - w.a[0]) * f.n[0] + (mid[1] - w.a[1]) * f.n[1];
    if (s < 0 || s > f.L) continue;
    const side = t >= 0 ? 'left' : 'right', face = side === 'left' ? f.offL : f.offR, gap = Math.abs(t) - face - depth / 2;
    if (gap > reach || gap < -depth / 2) continue;
    if (!best || gap < best.gap) best = { gap, attach: { wall: w.id, side, offset: r1(Math.min(Math.max(s - width / 2, 0), Math.max(f.L - width, 0))) } };
  }
  return best?.attach ?? null;
}

/**
 * An object on a wall pulled away from it (UX15): when its middle `mid` is more than `away` mm beyond where it hangs, the free
 * placement that keeps it facing the same way ({ pos, rotationDeg }); else null. faceNormal = the wall face's outward
 * direction at the object (resolveAttach().dir), facePoint = a point on that face.
 */
export function pullOff(o, mid, facePoint, faceNormal, { away = 300 } = {}) {
  const dist = (mid[0] - facePoint[0]) * faceNormal[0] + (mid[1] - facePoint[1]) * faceNormal[1];
  if (dist - o.size[1] / 2 - (o.attach?.gap || 0) <= away) return null;
  // its front (local +y) keeps pointing away from the wall: -sin r = n.x, cos r = n.y
  const rotationDeg = ((Math.round(Math.atan2(-faceNormal[0], faceNormal[1]) * 180 / Math.PI) % 360) + 360) % 360;
  return { pos: boxPosForMiddle({ size: o.size, rotationDeg }, mid), rotationDeg };
}

/**
 * Stairs dragged on the plan (ui-consistency plan, UX17): their start moved by d = [dx, dy]. A start that hangs on a point keeps
 * hanging on it with its offset changed; a start at a plan position moves. `snap` = { ref } of a point the start was dropped
 * on: it hangs on that point from now on, with no offset. Returns the new `start`.
 */
export function moveStairsStart(start, d, snap = null) {
  if (snap) return { ref: snap.ref, offset: [0, 0] };
  if (start?.ref) return { ...start, offset: [r1((start.offset?.[0] ?? 0) + d[0]), r1((start.offset?.[1] ?? 0) + d[1])] };
  const p = start?.pos ?? [0, 0];
  return { ...start, pos: [r1(p[0] + d[0]), r1(p[1] + d[1])] };
}

/** The walking direction for stairs turned on the plan: the way from their start point to the pointer, in 90° steps. */
export function turnStairs(startPoint, pointer) {
  const a = Math.atan2(pointer[1] - startPoint[1], pointer[0] - startPoint[0]) * 180 / Math.PI;
  return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
}
