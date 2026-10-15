// What fills an opening in 3D (decision 124): a window's frame, sash bars, glass and sill board; a door's casing and closed
// leaf (or two). Pure, in plan mm: prisms for levelPrisms(), and the unit's place across the wall for the plan symbol.
//
// Optional fields of an opening (all additive, PLANTERN.md §6.1):
//   color       the frame, sash and leaf colour "#rrggbb" (default: white for a window, wood for a door)
//   placement   where the unit sits across the wall: "left" (flush with the left face), "middle" (default), "right"
//               (left and right are relative to the wall's direction a → b, like sides.left / sides.right)
//   sillDepth   (windows) how far the sill board reaches out beyond the wall face on the side the window opens into
//   sillColor   its colour (default a light stone grey)
// `thickness` is the depth of the unit itself (default 70 for a window, 40 for a door; never more than the wall).

import { add, mul } from './vec.js';
import { isHingedDoor } from '../model/doors.js';

export const FITTING_DEFAULTS = Object.freeze({ window: { color: '#f2f0ea', depth: 70 }, door: { color: '#a9855f', depth: 40 }, sill: { color: '#d8d4cc' } });
export const PLACEMENTS = ['left', 'middle', 'right'];
const FRAME = 55;       // mm: width of a window frame's bars
const MULLION = 45;     // mm: the bar between two sashes
const CASING = 40;      // mm: a door's frame (jambs and head)
const SILL_BOARD = 30;  // mm: thickness of the sill board
const SILL_OVER = 20;   // mm: how far it reaches past each side of the opening
// a door's leaf is drawn see-through for now (not a closed wall in 3D, so the room behind it stays visible): its frame shows that it is a door
const LEAF = { opacity: 0.22 };
const GAP = 25;         // mm: a sliding door's leaf in front of the face

/** { t0, t1, depth }: the unit's extent across the wall (offsets along the wall's left normal from its reference line). */
export function unitSpan(w, f, o) {
  const depth = Math.min(o.thickness ?? FITTING_DEFAULTS[o.type]?.depth ?? 60, w.thickness || 1e9);
  const left = f.offL, right = -f.offR, mid = (left + right) / 2;
  const [t0, t1] = o.placement === 'left' ? [left - depth, left] : o.placement === 'right' ? [right, right + depth] : [mid - depth / 2, mid + depth / 2];
  return { t0, t1, depth };
}

/**
 * Prisms of an opening's fittings: [{ id, kind: 'frame' | 'leaf' | 'glass' | 'sill', poly, z0, z1, color, opacity? }].
 * `open` (a hinged door only): the leaf swung open at 90° instead of closed. Default closed.
 */
export function openingFittings(w, f, o, { open = false } = {}) {
  if (o.type === 'passage' || !(o.head > o.sill)) return [];
  const out = [], at = (s, t) => add(add(w.a, mul(f.u, s)), mul(f.n, t));
  const quad = (s0, s1, t0, t1) => [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)];
  const bar = (kind, s0, s1, t0, t1, z0, z1, color, extra = {}) => { if (s1 > s0 && z1 > z0 && t1 > t0) out.push({ id: o.id, kind, poly: quad(s0, s1, t0, t1), z0, z1, color, ...extra }); };
  const s0 = o.offset, s1 = o.offset + o.width, sill = o.sill, head = o.head, u = unitSpan(w, f, o);
  const color = o.color || FITTING_DEFAULTS[o.type].color;

  if (o.type === 'window') {
    bar('frame', s0, s1, u.t0, u.t1, sill, sill + FRAME, color);                         // bottom
    bar('frame', s0, s1, u.t0, u.t1, head - FRAME, head, color);                         // top
    bar('frame', s0, s0 + FRAME, u.t0, u.t1, sill + FRAME, head - FRAME, color);         // sides
    bar('frame', s1 - FRAME, s1, u.t0, u.t1, sill + FRAME, head - FRAME, color);
    const inner = [s0 + FRAME, s1 - FRAME], two = o.leaves === 2 || o.opens === 'sliding', tc = (u.t0 + u.t1) / 2;
    if (two) bar('frame', (s0 + s1) / 2 - MULLION / 2, (s0 + s1) / 2 + MULLION / 2, u.t0, u.t1, sill + FRAME, head - FRAME, color);   // where the two sashes meet
    // a sash: a slimmer ring just inside the frame, for a window that opens
    if (o.opens && o.opens !== 'fixed' && o.width > 4 * FRAME && head - sill > 4 * FRAME) {
      const k = 35, st0 = tc - u.depth * 0.3, st1 = tc + u.depth * 0.3, a = inner[0], b = inner[1], z0 = sill + FRAME, z1 = head - FRAME;
      bar('frame', a, b, st0, st1, z0, z0 + k, color); bar('frame', a, b, st0, st1, z1 - k, z1, color);
      bar('frame', a, a + k, st0, st1, z0 + k, z1 - k, color); bar('frame', b - k, b, st0, st1, z0 + k, z1 - k, color);
    }
    bar('glass', inner[0], inner[1], tc - 4, tc + 4, sill + FRAME, head - FRAME, '#9fd3ff', { opacity: 0.25 });
    if (o.sillDepth > 0) {                                                               // the sill board, on the side the window opens into
      const faceT = o.swing === 'left' ? f.offL : -f.offR, inside = o.swing === 'left';
      bar('sill', s0 - SILL_OVER, s1 + SILL_OVER, inside ? u.t0 : Math.min(faceT - o.sillDepth, u.t0), inside ? Math.max(faceT + o.sillDepth, u.t1) : u.t1, sill - 5, sill - 5 + SILL_BOARD, o.sillColor || FITTING_DEFAULTS.sill.color);
    }
    return out;
  }

  // a door: its casing, and the leaf (two, meeting in the middle) closed; a sliding one runs just in front of the face it slides on
  bar('frame', s0, s0 + CASING, u.t0, u.t1, sill, head, color);
  bar('frame', s1 - CASING, s1, u.t0, u.t1, sill, head, color);
  bar('frame', s0 + CASING, s1 - CASING, u.t0, u.t1, head - CASING, head, color);
  const a = s0 + CASING, b = s1 - CASING, top = head - CASING;
  if (open && isHingedDoor(o)) {
    // an open hinged door: each leaf swung out at 90° from its hinge, into the side it swings to (doorOpen() in model/doors.js)
    const toLeft = o.swing === 'left', face = toLeft ? f.offL : -f.offR, dir = toLeft ? 1 : -1;
    const swung = (hinge, near, width) => {
      const s = near ? [hinge, hinge + u.depth] : [hinge - u.depth, hinge], t = [face, face + dir * width].sort((p, q) => p - q);
      bar('leaf', s[0], s[1], t[0], t[1], sill, top, color, LEAF);
    };
    if (o.leaves === 2) { const half = (b - a) / 2 - 2; swung(a, true, half); swung(b, false, half); }
    else if (o.hinge === 'far') swung(b, false, b - a);
    else swung(a, true, b - a);
    return out;
  }
  let l0 = u.t0, l1 = u.t1;
  if (o.opens === 'sliding') {
    const toLeft = o.swing === 'left', face = toLeft ? f.offL : -f.offR;
    [l0, l1] = toLeft ? [face + GAP, face + GAP + u.depth] : [face - GAP - u.depth, face - GAP];
  }
  if (o.leaves === 2) { const m = (a + b) / 2; bar('leaf', a, m - 2, l0, l1, sill, top, color, LEAF); bar('leaf', m + 2, b, l0, l1, sill, top, color, LEAF); }
  else bar('leaf', a, b, l0, l1, sill, top, color, LEAF);
  return out;
}
