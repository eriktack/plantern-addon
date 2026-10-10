// Plan symbols for openings, in plan mm (renderers only convert and draw them). Pure.
//   door:    the leaf, open at 90° into the side it swings to, from the hinge, and its swing arc; a sliding
//            door (opens "sliding") its leaf in front of the face it runs on, closed, and dashed where it
//            parks (slide: "near" / "far"); a pocket door (opens "pocket") the same inside the wall
//   window:  the frame across the wall (both faces and the centre line); a side-hung or tilt-turn
//            window also gets its leaf and arc, dashed
//   passage: the two faces, dashed (nothing closes it)
// hinge: "near" = the edge at `offset`, "far" = at offset + width; `leaves: 2` = a double door or
// window, hinged on both sides, the leaves meeting in the middle. swing: the side of the wall
// (relative to a → b) the leaves open into; default "right" (the room a wall made from a room edge
// bounds). `thickness`: the window or door itself; a window's frame is drawn at that depth, centred
// in the wall (without it, across the whole wall).

import { facePoint, centrePoint } from './walls.js';
import { unitSpan } from './fittings.js';

/** { lines: [[p, q]], dashed: [[p, q]], arcs: [{ c, r, from, to, dashed }] } for opening o on wall w (frame f). */
export function openingSymbol(w, f, o) {
  const s0 = o.offset, s1 = o.offset + o.width, out = { lines: [], dashed: [], arcs: [] };
  const face = side => [facePoint(w, f, side, s0), facePoint(w, f, side, s1)];
  const side = o.swing === 'left' ? 'left' : 'right', into = side === 'left' ? f.n : [-f.n[0], -f.n[1]];
  const oneLeaf = (sh, so, dashed) => {                       // hinged at sh, closing towards so
    const r = Math.abs(so - sh), H = facePoint(w, f, side, sh), tip = [H[0] + into[0] * r, H[1] + into[1] * r];
    (dashed ? out.dashed : out.lines).push([H, tip]);
    out.arcs.push({ c: H, r, from: tip, to: facePoint(w, f, side, so), dashed });
  };
  const leaf = dashed => {
    if (o.leaves === 2) { const m = (s0 + s1) / 2; oneLeaf(s0, m, dashed); oneLeaf(s1, m, dashed); }
    else if (o.hinge === 'far') oneLeaf(s1, s0, dashed);
    else oneLeaf(s0, s1, dashed);
  };
  // a sliding door: the leaf just in front of one face, closed (solid) and parked beside the opening (dashed);
  // a pocket door: the leaf in the middle of the wall, parked inside it
  const slider = ways => {
    const pocket = o.opens === 'pocket', gap = 25, at = s => (pocket ? centrePoint(w, f, s) : (p => [p[0] + into[0] * gap, p[1] + into[1] * gap])(facePoint(w, f, side, s)));
    for (const [a, b, way] of ways) {
      out.lines.push([at(a), at(b)]);
      const d = b - a, p0 = way === 'near' ? a - d * (pocket ? 1 : 0.9) : b - d * (pocket ? 0 : 0.1);
      out.dashed.push([at(p0), at(p0 + d)]);
    }
  };
  if (o.type === 'door' && (o.opens === 'sliding' || o.opens === 'pocket')) {
    if (o.leaves === 2) { const m = (s0 + s1) / 2; slider([[s0, m, 'near'], [m, s1, 'far']]); }
    else slider([[s0, s1, o.slide === 'far' ? 'far' : 'near']]);
  } else if (o.type === 'door') leaf(false);
  else if (o.type === 'window') {
    const c0 = centrePoint(w, f, s0), c1 = centrePoint(w, f, s1);
    if (o.thickness || o.placement) {
      // the frame at its own depth, where it sits across the wall (centred unless `placement` says flush with a face): both sides and the ends
      const u = unitSpan(w, f, o), tc = (f.offL - f.offR) / 2, at = (p, t) => [p[0] + f.n[0] * (t - tc), p[1] + f.n[1] * (t - tc)], mid = (u.t0 + u.t1) / 2;
      out.lines.push([at(c0, u.t1), at(c1, u.t1)], [at(c0, u.t0), at(c1, u.t0)], [at(c0, u.t1), at(c0, u.t0)], [at(c1, u.t1), at(c1, u.t0)], [at(c0, mid), at(c1, mid)]);
    } else {
      const [l0, l1] = face('left'), [r0, r1] = face('right');
      out.lines.push([l0, l1], [r0, r1], [c0, c1]);
    }
    if (o.opens === 'side-hung' || o.opens === 'tilt-turn') leaf(true);
    if (o.opens === 'sliding') {
      // two sashes overlapping in the middle, one on each side of the centre line
      const m = (s0 + s1) / 2, k = Math.max((o.thickness || w.thickness || 60) / 6, 8), at = (s, t) => { const p = centrePoint(w, f, s); return [p[0] + f.n[0] * t, p[1] + f.n[1] * t]; };
      out.lines.push([at(s0, k), at(m + o.width * 0.05, k)], [at(m - o.width * 0.05, -k), at(s1, -k)]);
    }
  } else out.dashed.push(face('left'), face('right'));
  return out;
}

/** SVG path for an arc from `from` to `to` around `c` (points already in SVG coordinates), the short way. */
export function arcPathSvg(c, r, from, to) {
  const cross = (from[0] - c[0]) * (to[1] - c[1]) - (from[1] - c[1]) * (to[0] - c[0]);
  return `M${from[0]},${from[1]} A${r},${r} 0 0 ${cross > 0 ? 1 : 0} ${to[0]},${to[1]}`;
}
