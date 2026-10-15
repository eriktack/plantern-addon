// Round stair handrails, on poles or on the wall (docs/archive/2026-10-15-stair-handrails.md; HR0 answered by Erik, 2026-10-13). Pure.
// Called by stairRails() in stairs.js when a stair has `handrailMount` "poles" or "wall"; a stair without it keeps the square rail.

import { add, mul } from './vec.js';

const r1 = v => Math.round(v * 100) / 100;
const pt = p => [r1(p[0]), r1(p[1])];

/**
 * mm: the round rail's default diameter, the pole's and the bracket's diameters, how far a bracket's wall is from the rail's centre line, how far in
 * from the end of a flight's rail the first bracket stands, how far the start and end offsets may reach past a flight's ends.
 */
export const STAIR_ROUND_RAIL = Object.freeze({ diameter: 60, pole: 40, bracket: 20, wallGap: 70, bracketIn: 100, reach: 1000 });

const square = (p, r) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => pt([p[0] + x * r, p[1] + y * r]));

// a thin rectangle round the segment a → b: the prism's plan outline (the renderer draws the `bar`)
const hull = (a, b, w) => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [-(b[1] - a[1]) / L * w / 2, (b[0] - a[0]) / L * w / 2];
  return [[a[0] - n[0], a[1] - n[1]], [b[0] - n[0], b[1] - n[1]], [b[0] + n[0], b[1] + n[1]], [a[0] + n[0], a[1] + n[1]]].map(pt);
};

/**
 * The round handrail of a stair as prisms like stairRails(): a rail of `handrailDiameter` (default 60 mm) that starts `handrailStart` mm in from
 * the front edge of the first flight and stops `handrailEnd` mm short of the arrival edge of the last (negative: past them, along the same
 * slope), and then
 *   poles: a round pole in the middle of every other tread (the 1st, 3rd, …), and one at the corner of a landing;
 *   wall:  a bracket to the wall a little in from each end of every flight's rail, and one at the corner of a landing.
 * On the inside of a turn there is no pole and no bracket at the turn: the flights just end. The rail's top is `handrailHeight` (default
 * `defaultHeight`) above the nose line, like the square rail. Rail members are `bar`s (a cylinder between two 3D points), joints are `ball`s and
 * poles are upright `circle`s; every prism has a `poly` (its outline in plan) and `z0`, `z1` (its lowest and highest point).
 * Heights are above the floor of the level the stair starts on, plus `dz`.
 */
export function roundRails(layout, st, { dz = 0, defaultHeight = 900 } = {}) {
  const mode = st.handrail, mount = st.handrailMount, C = STAIR_ROUND_RAIL;
  const H = Number(st.handrailHeight) > 0 ? Number(st.handrailHeight) : defaultHeight, riser = layout.riser;
  const D = Number(st.handrailDiameter) > 0 ? Number(st.handrailDiameter) : C.diameter, R = D / 2;
  const inset = mount === 'wall' ? C.wallGap : R;
  const startOff = Number.isFinite(Number(st.handrailStart)) ? Math.max(Number(st.handrailStart), -C.reach) : 0;
  const endOff = Number.isFinite(Number(st.handrailEnd)) ? Math.max(Number(st.handrailEnd), -C.reach) : 0;
  const out = [];
  const nose = (f, s) => f.h0 + riser + (riser / f.d) * s + dz;
  const bar = (a, b, d, rail) => out.push({ ...(rail ? { rail: true } : { post: true }), bar: { a: a.map(r1), b: b.map(r1), diameter: d }, poly: hull(a, b, d), z0: r1(Math.min(a[2], b[2]) - d / 2), z1: r1(Math.max(a[2], b[2]) + d / 2) });
  const ball = p => out.push({ rail: true, ball: { center: p.map(r1), diameter: D }, poly: square(p, R), z0: r1(p[2] - R), z1: r1(p[2] + R) });
  const pole = (xy, z0, z1) => out.push({ post: true, circle: { center: pt(xy), diameter: C.pole }, poly: square(xy, C.pole / 2), z0: r1(z0), z1: r1(z1) });
  const last = layout.flights.length - 1;

  for (const side of mode === 'both' ? ['left', 'right'] : [mode]) {
    const outer = side === (st.turn === 'L' ? 'right' : 'left');                 // the side a landing's free edges are on; the inside of the turn is the other
    layout.flights.forEach((f, k) => {
      if (!(f.run > 0) || !(f.d > 0)) return;                                    // a flight of one riser has no treads to follow
      const w0 = side === 'left' ? inset : f.w - inset;                          // the rail's centre line, in from the stair's edge
      const at = (s, z) => { const p = add(f.o, add(mul(f.u, s), mul(f.r, w0))); return [p[0], p[1], z]; };
      const s0 = k === 0 ? startOff : 0, s1 = f.run - (k === last ? endOff : 0);
      if (!(s1 - s0 > 1)) return;
      const zc = s => nose(f, s) + H - R;                                        // the rail's centre
      bar(at(s0, zc(s0)), at(s1, zc(s1)), D, true);
      // round ends: the rail's own ends, and the ends of the rail on the inside of a turn (where the flights just stop)
      if (k === 0 || (!outer && k > 0)) ball(at(s0, zc(s0)));
      if (k === last || (!outer && k < last)) ball(at(s1, zc(s1)));
      if (mount === 'poles') {
        layout.steps.filter(t => t.kind === 'tread' && t.flight === k).forEach((t, j) => {
          const s = (t.s0 + t.s1) / 2;
          if (j % 2 !== 0 || s < s0 || s > s1) return;
          const p = at(s, 0);
          pole([p[0], p[1]], t.top + dz, zc(s));
        });
      } else {
        // wall brackets a little in from the rail's ends; none at a turn on the inside of it
        for (const [s, atTurn] of [[s0 + C.bracketIn, k > 0], [s1 - C.bracketIn, k < last]]) {
          if (!outer && atTurn) continue;
          if (s < s0 || s > s1) continue;
          const p = at(s, zc(s)), e = add(f.o, add(mul(f.u, s), mul(f.r, side === 'left' ? 0 : f.w)));
          bar(p, [e[0], e[1], p[2]], C.bracket, false);
        }
      }
      const tn = layout.turns?.[k];
      if (tn && outer) {
        // the rail carries on round the landing's free edges (level on a square landing, rising through winders), in by the same amount
        const P = tn.poly, chain = st.turn === 'L' ? [P[3], P[2], P[1]] : [P[0], P[1], P[2]];
        const cx = P.reduce((q, p) => q + p[0], 0) / P.length, cy = P.reduce((q, p) => q + p[1], 0) / P.length;
        const inward = (a, b) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          return n[0] * (cx - m[0]) + n[1] * (cy - m[1]) >= 0 ? n : [-n[0], -n[1]];
        };
        const normals = [inward(chain[0], chain[1]), inward(chain[1], chain[2])];
        const pts = chain.map((p, i) => {
          const ns = i === 0 ? [normals[0]] : i === 2 ? [normals[1]] : normals;
          return [p[0] + ns.reduce((q, n) => q + n[0], 0) * inset, p[1] + ns.reduce((q, n) => q + n[1], 0) * inset];
        });
        const next = layout.flights[k + 1], zB = nose(f, f.run) + H, z2 = next && next.d > 0 ? nose(next, 0) + H : zB, rising = layout.winders > 0;
        const lens = chain.slice(1).map((p, i) => Math.hypot(p[0] - chain[i][0], p[1] - chain[i][1])), total = lens.reduce((x, y) => x + y, 0) || 1;
        let cum = 0;
        // on a square landing the rail is level and its last stretch rises to the next flight's rail; through winders it rises all the way
        const zs = chain.map((_, i) => { const z = rising ? zB + (z2 - zB) * cum / total : i === chain.length - 1 ? z2 : zB; cum += lens[i] ?? 0; return z; });
        pts.forEach((p, i) => ball([p[0], p[1], zs[i] - R]));
        pts.slice(1).forEach((p, i) => bar([pts[i][0], pts[i][1], zs[i] - R], [p[0], p[1], zs[i + 1] - R], D, true));
        const corner = pts[1], zCorner = zs[1] - R;                              // the corner of the landing: a pole, or a bracket to the wall
        if (mount === 'poles') pole(corner, zs[1] - H - (rising ? riser : 0), zCorner);
        else {
          const away = normals[0].map((v, i) => -(v + normals[1][i]));          // out of the landing, towards the wall
          bar([corner[0], corner[1], zCorner], [corner[0] + away[0] * inset, corner[1] + away[1] * inset, zCorner], C.bracket, false);
        }
      }
    });
  }
  return out;
}
