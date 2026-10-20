// A door's lock from Home Assistant in 3D (PLANTERN.md §6.1, §8): a padlock on each face of the wall at the door's middle, a body and shackle in the colour of
// its state (green when locked, red when not; ha/door.js padlockLook). Closed, the shackle is an arch with both legs in the body;
// open, it is lifted and swung out on its left leg, so the right leg stands free beside the body and ends just above it, like a real padlock that has
// been opened. Pure: prisms for levelPrisms(), `bar` and `ball` ones for the shackle, which the renderer draws as round cylinders and balls.

import { add, mul } from './vec.js';
import { padlockLook } from '../ha/door.js';

const W = 130, BODY_H = 100, BODY_D = 45, HEIGHT = 1050;   // mm: body width, height and depth (out from the wall); HEIGHT = the body's middle above the floor
const ROD = 14;                                            // the shackle's diameter
const ARCH_STEPS = 8;                                      // segments of the half circle

/** Prisms of the padlock of door `o` for its lock state ('locked' | 'unlocked' | 'jammed' | 'unknown'): both faces of its wall. */
export function padlockPrisms(w, f, o, state) {
  const look = padlockLook(state), out = [], s = o.offset + o.width / 2;
  const z = Math.min(HEIGHT, Math.max((o.sill ?? 0) + 200, (o.head ?? 2100) - 300));
  const z0 = z - BODY_H / 2, z1 = z + BODY_H / 2;
  for (const [face, sign] of [['left', 1], ['right', -1]]) {
    const t0 = face === 'left' ? f.offL : -f.offR, tc = t0 + sign * BODY_D / 2;            // the face, and the middle of the body in front of it
    const at = (ds, t) => add(add(w.a, mul(f.u, s + ds)), mul(f.n, t));
    out.push({ id: o.id, kind: 'padlock', poly: [at(-W / 2, t0), at(W / 2, t0), at(W / 2, t0 + sign * BODY_D), at(-W / 2, t0 + sign * BODY_D)], z0, z1, color: look.colour, lock: look.label });
    const pt = (ds, zz) => { const a = at(ds, tc); return [a[0], a[1], zz]; };
    const rod = (a, b) => out.push({ id: o.id, kind: 'padlock', bar: { a, b, diameter: ROD }, poly: squareAround(a, ROD), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]), color: look.colour, lock: look.label });
    const knob = p => out.push({ id: o.id, kind: 'padlock', ball: { center: p, diameter: ROD }, poly: squareAround(p, ROD), z0: p[2] - ROD / 2, z1: p[2] + ROD / 2, color: look.colour, lock: look.label });
    // the shackle: a half circle on two legs. Closed: both legs go down into the body. Open: its left leg still goes into the body and it is as tall as the closed one, with its right leg
    // ending just above the body and standing beside it.
    const r = look.open ? 0.36 * W : 0.31 * W, leftX = look.open ? 0.36 * W : -r;            // the left leg's place along the wall from the body's middle
    const top = z1 + 0.62 * W, centre = leftX + r, rightX = leftX + 2 * r;
    const archZ = top - r, rightEnd = look.open ? z1 + 0.1 * W : z1;                       // the arch's centre height, and where the right leg ends
    const arch = [];
    for (let i = 0; i <= ARCH_STEPS; i++) { const a = Math.PI - (Math.PI * i) / ARCH_STEPS; arch.push(pt(centre + r * Math.cos(a), archZ + r * Math.sin(a))); }
    rod(pt(leftX, z1), arch[0]);
    for (let i = 0; i < ARCH_STEPS; i++) rod(arch[i], arch[i + 1]);
    rod(arch[ARCH_STEPS], pt(rightX, rightEnd));
    for (const p of arch) knob(p);
  }
  return out;
}

const squareAround = (c, d) => [[c[0] - d / 2, c[1] - d / 2], [c[0] + d / 2, c[1] - d / 2], [c[0] + d / 2, c[1] + d / 2], [c[0] - d / 2, c[1] + d / 2]];
