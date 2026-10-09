// Phone wizard logic (pure): one wall at a time. You stand in corner 0, face along the first wall
// with the room on your RIGHT, type the length, then say whether the wall continues to the right (R,
// normal corner) or to the left (L, inside corner). An odd corner gets a custom INTERIOR angle in
// degrees instead (135 = bevel, 60 = sharp; room side). All R/L → rectilinear `capture`, any custom
// angle → `traverse` capture.

import { originToRaw } from './start.js';

export const HEADINGS = { N: 90, E: 0, S: 270, W: 180 };

/** "4025" → 4025 mm; "4.025" or "4,025" → 4025 mm (a decimal below 100 is metres, as laser meters show). */
export function parseLength(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: 'enter a number, e.g. 4025 (mm) or 4.025 (m)' };
  let v = Number(t);
  if (!t.includes('.') && v < 100) return { error: `${t} mm is under 10 cm; for metres type a decimal point, e.g. ${t}.0` };
  if (t.includes('.') && v < 100) v *= 1000;
  v = Math.round(v * 10) / 10;
  if (v <= 0) return { error: 'length must be above 0' };
  if (v > 100000) return { error: 'that is over 100 m; check the number' };
  return { value: v };
}

export const newWizard = (opts = {}) => ({
  name: opts.name ?? '', exterior: !!opts.exterior, level: opts.level ?? null,
  start: opts.start ?? [0, 0], origin: opts.origin ?? { ref: '', offset: [0, 0] },   // start = origin ref + offset (resolved by the page)
  heading: opts.heading ?? HEADINGS.N,
  edges: [],                                   // [{ length, turn }]  turn at the NEXT corner: 'R' | 'L' | interior angle in degrees
});

/** R = 90°, L = 270°, a number = that interior angle. */
export const interiorAngle = t => t === 'R' ? 90 : t === 'L' ? 270 : t;

/** Validate a custom interior angle typed by the user. */
export function parseAngle(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: 'enter the angle in degrees, e.g. 135' };
  const v = Number(t);
  if (v <= 0 || v >= 360) return { error: 'the angle must be between 0 and 360 degrees' };
  return { value: v };
}

/** `sharedWith` = { room, roomName, edge, thickness, endPoint } when the corner was snapped onto a neighbour's wall (see share.js). */
export const addEdge = (w, length, turn, derived = false, sharedWith = null) => ({ ...w, edges: [...w.edges, { length, turn, ...(derived ? { derived: true } : {}), ...(sharedWith ? { sharedWith } : {}) }] });
export const undo = w => ({ ...w, edges: w.edges.slice(0, -1) });

/** Plan heading (degrees, counter-clockwise from east) of the wall currently being measured. */
export function currentHeading(w) {
  let h = w.heading;
  for (const e of w.edges) h -= (180 - interiorAngle(e.turn)) ;
  return ((h % 360) + 360) % 360;
}

/**
 * Corner picture for an interior angle `a` at a corner reached on heading `h`: the way the next wall
 * leaves, the sweep of the room-side arc (clockwise from the next wall by `a`), and the turn in words.
 */
export function cornerPreview(h, a) {
  const next = h - (180 - a), turn = 180 - a;
  return { next: ((next % 360) + 360) % 360, arcFrom: next, arcTo: next - a,
    text: Math.abs(turn) < 0.005 ? 'straight on (no corner)' : turn > 0 ? `the next wall turns ${+turn.toFixed(2)}° to the right` : `the next wall turns ${+(-turn).toFixed(2)}° to the left` };
}

/** Which coordinate a wall heading `h` (degrees) mostly advances in: the natural one to reach. */
export const suggestAxis = h => Math.abs(Math.cos(h * Math.PI / 180)) >= Math.abs(Math.sin(h * Math.PI / 180)) ? 'x' : 'y';

/**
 * Length of the wall being measured if it runs (in its current direction, from the last corner)
 * until its x or y equals `value` (plan mm). Used when you know where the wall ends, not how long it is.
 */
export function lengthToReach(w, axis, value) {
  if (!Number.isFinite(value)) return { error: `enter the ${axis} value the wall should reach (mm)` };
  const pts = pathPoints(w), P = pts[pts.length - 1], h = currentHeading(w) * Math.PI / 180;
  const c = axis === 'x' ? Math.cos(h) : Math.sin(h), from = axis === 'x' ? P[0] : P[1];
  if (Math.abs(c) < 0.02) return { error: `this wall runs along ${axis === 'x' ? 'y' : 'x'}, so it never reaches a different ${axis}; use the other coordinate` };
  const len = (value - from) / c;
  if (!(len > 0.5)) return { error: `${axis} = ${value} is behind this wall (the wall would have to run backwards from ${axis} = ${Math.round(from * 10) / 10})` };
  if (len > 100000) return { error: 'that is over 100 m away; check the number' };
  return { value: Math.round(len * 10) / 10 };
}

/** Corner points walked so far (plan mm). `pending` = length of the wall being typed, drawn straight on. */
export function pathPoints(w, pending) {
  const pts = [[...w.start]];
  let h = w.heading * Math.PI / 180;
  const legs = [...w.edges];
  if (pending > 0) legs.push({ length: pending });
  legs.forEach((e, i) => {
    const [x, y] = pts[i];
    pts.push([Math.round((x + e.length * Math.cos(h)) * 10) / 10, Math.round((y + e.length * Math.sin(h)) * 10) / 10]);
    if (e.turn) h -= (180 - interiorAngle(e.turn)) * Math.PI / 180;
  });
  return pts;
}

/**
 * Close the room: the last wall runs back to corner 0. `lastLength` is what was measured for it, or
 * null/undefined when nothing was typed (then its length is simply the distance back). The turn at
 * corner 0 is implied (a clockwise room needs 4 more R than L). Returns { capture, errors, typed }.
 */
export function finish(w, lastLength) {
  const typed = Number.isFinite(lastLength) && lastLength > 0;
  const p = pathPoints(w), q = p[p.length - 1];
  const back = Math.max(Math.round(Math.hypot(q[0] - p[0][0], q[1] - p[0][1]) * 10) / 10, 0.1);   // the way back to corner 0
  const r = finishWith(w, typed ? lastLength : back, !typed, back);
  return { ...r, typed };
}

function finishWith(w, lastLength, lastDerived, back) {
  const edges = [...w.edges, { length: lastLength }];
  const n = edges.length;
  // lengths that were worked out (reach a coordinate, the way back) rather than measured
  const derivedIdx = [...w.edges.flatMap((e, i) => e.derived ? [i] : []), ...(lastDerived ? [n - 1] : [])];
  const dr = derivedIdx.length ? { derived: derivedIdx } : {};
  if (n < 4) return { errors: ['a room needs at least 4 walls'] };
  const turnsAfter = edges.slice(0, -1).map(e => e.turn);                  // corners 1..n-1
  const origin = originToRaw(w.origin);
  const extra = origin ? { origin } : {};
  if (turnsAfter.some(t => t !== 'R' && t !== 'L')) {
    // traverse: corner 0 is whatever makes the interior angles add up to (n-2)·180
    const others = turnsAfter.map(interiorAngle), c0 = Math.round(((n - 2) * 180 - others.reduce((s, a) => s + a, 0)) * 100) / 100;
    if (!(c0 > 0 && c0 < 360)) return { errors: [`the angles cannot close a ${n}-sided room: corner 0 would have to be ${c0}°. Check the angles entered or use Undo.`] };
    return { capture: { mode: 'traverse', raw: { start: [...w.start], heading: w.heading, lengths: edges.map(e => e.length), corners: [c0, ...others], closure: 'line', ...dr, ...extra } }, errors: [] };
  }
  const net = turnsAfter.reduce((s, t) => s + (t === 'R' ? 1 : -1), 0);
  const need = 4 - net;                                                      // net the last corner must supply
  if (Math.abs(need) !== 1) return { errors: [`the turns do not close a room: ${turnsAfter.filter(t => t === 'R').length} right and ${turnsAfter.filter(t => t === 'L').length} left so far; a closed room walked clockwise needs 4 more rights than lefts in total. Check the last turns or use Undo.`] };
  const turns = (need === 1 ? 'R' : 'L') + turnsAfter.join('');
  // only square and inside corners: keep them exactly square; the last wall is the worked-out way back
  // to corner 0 (a length typed for it is kept as a check), so it takes the gap along its own axis and
  // the walls you measured along that axis stay as measured
  const lengths = edges.map(e => e.length), checks = [];
  if (!lastDerived) { checks.push({ edge: n - 1, measured: lastLength }); lengths[n - 1] = back; }
  const der = [...new Set([...derivedIdx, n - 1])].sort((a, b) => a - b);
  const raw = { start: [...w.start], heading: w.heading, lengths, turns, closure: 'square', derived: der, ...(checks.length ? { checks } : {}), ...extra };
  return { capture: { mode: 'rectilinear', raw }, errors: [] };
}

/** What the phone hands to the PC page. */
export const exportResult = (w, capture, location) => ({ plantern: 'capture', version: 1, location, level: w.level, room: { name: w.name, exterior: w.exterior }, capture });

/** Validate pasted wizard output. Returns { value, error }. */
export function importResult(text) {
  let j;
  try { j = JSON.parse(text); } catch { return { error: 'not valid JSON' }; }
  if (j?.plantern !== 'capture' || !j.capture?.raw) return { error: 'this is not a Plantern capture export' };
  return { value: j };
}
