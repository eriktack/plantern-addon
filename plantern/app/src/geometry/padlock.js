// A door's lock from Home Assistant in 3D (PLANTERN.md §6.1, §8): a padlock on each face of the wall at the door's middle, a body and a
// shackle, in the colour of its state (closed and green when locked, open and red when not; ha/door.js padlockLook). Pure: prisms for
// levelPrisms(), `bar` ones for the shackle, which the renderer draws as round cylinders.

import { add, mul } from './vec.js';
import { padlockLook } from '../ha/door.js';

const BODY_W = 130, BODY_H = 100, BODY_D = 45, SHACKLE_H = 65, SHACKLE_D = 14, LIFT = 28, HEIGHT = 1050;   // mm; HEIGHT = the body's middle above the floor

/** Prisms of the padlock of door `o` for its lock state ('locked' | 'unlocked' | 'jammed' | 'unknown'): both faces of its wall. */
export function padlockPrisms(w, f, o, state) {
  const look = padlockLook(state), out = [], s = o.offset + o.width / 2;
  const z = Math.min(HEIGHT, Math.max((o.sill ?? 0) + 200, (o.head ?? 2100) - 300));
  for (const [face, sign] of [['left', 1], ['right', -1]]) {
    const t0 = face === 'left' ? f.offL : -f.offR, tc = t0 + sign * BODY_D / 2;            // the face, and the middle of the body in front of it
    const at = (ds, t) => add(add(w.a, mul(f.u, s + ds)), mul(f.n, t));
    const z0 = z - BODY_H / 2, z1 = z + BODY_H / 2;
    out.push({ id: o.id, kind: 'padlock', poly: [at(-BODY_W / 2, t0), at(BODY_W / 2, t0), at(BODY_W / 2, t0 + sign * BODY_D), at(-BODY_W / 2, t0 + sign * BODY_D)], z0, z1, color: look.colour, lock: look.label });
    // the shackle: two legs and the arch over them (an open padlock: lifted, its right leg out of the body)
    const lift = look.open ? LIFT : 0, top = z1 + SHACKLE_H + lift, leg = BODY_W * 0.3;
    const p = (ds, zz) => { const a = at(ds, tc); return [a[0], a[1], zz]; };
    const bar = (a, b) => out.push({ id: o.id, kind: 'padlock', bar: { a, b, diameter: SHACKLE_D }, poly: squareAround(a, SHACKLE_D), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]), color: look.colour, lock: look.label });
    bar(p(-leg, z1), p(-leg, top));
    bar(p(-leg, top), p(leg, top));
    bar(p(leg, top), p(leg, look.open ? z1 + lift * 0.9 : z1));
  }
  return out;
}

const squareAround = (c, d) => [[c[0] - d / 2, c[1] - d / 2], [c[0] + d / 2, c[1] - d / 2], [c[0] + d / 2, c[1] + d / 2], [c[0] - d / 2, c[1] + d / 2]];
