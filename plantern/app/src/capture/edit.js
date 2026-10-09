// Pure helpers behind the capture page: parsing what is typed, and changing the model without
// ever deleting hand-made data. No DOM.

import { signedArea } from '../geometry/polygon.js';
import { resolveStart, originToRaw } from './start.js';
import { generateWalls } from './walls.js';
import { buildLevelGeometry } from '../geometry/level.js';
import { edgeGaps } from '../model/validate.js';
import { wallName, wallIndex, parseWalls, wallsToText } from './labels.js';

/** "4000, 5000 4000;5000" → [4000, 5000, 4000, 5000]. Separators: comma, space, semicolon. Decimal point only. */
export function parseNumbers(text) {
  const parts = String(text ?? '').split(/[\s;,]+/).filter(Boolean);
  const values = [], errors = [];
  for (const p of parts) {
    const v = Number(p);
    if (Number.isFinite(v)) values.push(v); else errors.push(`"${p}" is not a number`);
  }
  return { values, errors };
}

/** One diagonal per line: "0-2: 6403", "0 2 6403" or "0,2,6403" (corner indices, then length). */
export function parseDiagonals(text) {
  const diagonals = [], errors = [];
  for (const line of String(text ?? '').split(/\n/).map(s => s.trim()).filter(Boolean)) {
    const m = line.match(/^(\d+)\s*[-–>,\s]+\s*(\d+)\s*[:=,\s]+\s*([\d.]+)$/);
    if (!m) { errors.push(`diagonal "${line}": expected "a-b: length", e.g. "0-2: 6403"`); continue; }
    diagonals.push({ a: +m[1], b: +m[2], length: +m[3] });
  }
  return { diagonals, errors };
}

/** Form values → capture object (only the fields that were filled in). Returns { capture, errors }. */
export function buildCapture(form, snapPos = () => undefined) {
  const errors = [];
  const num = (name, text) => { const r = parseNumbers(text); errors.push(...r.errors.map(e => `${name}: ${e}`)); return r.values; };
  const raw = {};
  const offset = [form.ox, form.oy].map((t, i) => {
    const s = String(t ?? '').trim();
    if (!s) return 0;
    const v = Number(s);
    if (!Number.isFinite(v)) { errors.push(`start offset ${i ? 'y' : 'x'}: "${s}" is not a number`); return 0; }
    return v;
  });
  const origin = { ref: form.originRef || '', offset };
  const st = resolveStart(snapPos, origin);
  if (st.error) errors.push(st.error);
  else {
    if (st.pos[0] !== 0 || st.pos[1] !== 0) raw.start = st.pos;
    const o = originToRaw(origin);
    if (o) raw.origin = o;
  }
  if (String(form.heading ?? '').trim() !== '') { const h = num('heading', form.heading); if (h.length === 1) raw.heading = h[0]; else errors.push('heading must be one number (degrees)'); }
  raw.lengths = num('lengths', form.lengths);
  const turns = String(form.turns ?? '').toUpperCase().replace(/[\s,]+/g, '');
  if (turns) raw.turns = turns;
  if (form.mode !== 'rectilinear') { const corners = num('corners', form.corners); if (corners.length) raw.corners = corners; }
  if (form.mode !== 'lengths' && form.closure && form.closure !== 'spread') raw.closure = form.closure;
  const lk = parseLocks(form.locks);
  errors.push(...lk.errors);
  if (lk.locks.length) raw.locks = lk.locks;
  const dv = parseWalls(form.derived);
  errors.push(...dv.errors.map(e => `walls not measured: ${e}`));
  if (dv.walls.length) raw.derived = dv.walls;
  const ex = parseWalls(form.exact);
  errors.push(...ex.errors.map(e => `exact lengths: ${e}`));
  if (ex.walls.length) raw.exact = ex.walls;
  const ck = parseChecks(form.checks);
  errors.push(...ck.errors);
  if (ck.checks.length) raw.checks = ck.checks;
  const d = parseDiagonals(form.diagonals);
  errors.push(...d.errors);
  if (d.diagonals.length) raw.diagonals = d.diagonals;
  return { capture: { mode: form.mode, raw }, errors };
}

/** Capture → the strings shown in the form. */
export function captureToForm(capture) {
  const raw = capture?.raw || {};
  return {
    mode: capture?.mode || 'rectilinear',
    originRef: raw.origin?.ref ?? '',
    ox: raw.origin ? raw.origin.offset[0] : raw.start?.[0] ?? '',
    oy: raw.origin ? raw.origin.offset[1] : raw.start?.[1] ?? '',
    heading: raw.heading ?? '',
    lengths: (raw.lengths || []).join(', '),
    closure: raw.closure ?? (capture ? 'spread' : 'square'),          // new rooms: square corners
    locks: locksToText(raw.locks),
    derived: wallsToText(raw.derived),
    exact: wallsToText(raw.exact),
    checks: checksToText(raw.checks),
    turns: typeof raw.turns === 'string' ? raw.turns : (raw.turns || []).join(''),
    corners: (raw.corners || []).join(', '),
    diagonals: (raw.diagonals || []).map(d => `${d.a}-${d.b}: ${d.length}`).join('\n'),
  };
}

/**
 * Starting point for a room that has a polygon but no raw data: its edge lengths and interior
 * angles as they are now. These are NOT measurements; the UI says so and the user replaces them.
 */
export function captureFromPolygon(polygon) {
  const n = polygon.length, r1 = v => Math.round(v * 10) / 10;
  const lengths = polygon.map((p, i) => { const q = polygon[(i + 1) % n]; return r1(Math.hypot(q[0] - p[0], q[1] - p[1])); });
  const corners = polygon.map((p, i) => {
    const a = polygon[(i + n - 1) % n], b = polygon[(i + 1) % n];
    const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let turn = (t2 - t1) * 180 / Math.PI;                       // left turn positive
    turn = ((turn + 540) % 360) - 180;
    return Math.round((180 + turn) * 100) / 100;                // clockwise polygon: right turn = −turn, interior = 180 + turn
  });
  const first = polygon[0], second = polygon[1];
  const heading = Math.round(Math.atan2(second[1] - first[1], second[0] - first[0]) * 18000 / Math.PI) / 100;
  const rect = corners.every(c => Math.abs(c - 90) < 0.01 || Math.abs(c - 270) < 0.01);
  return { mode: rect ? 'rectilinear' : 'traverse', raw: rect
    ? { start: [...first], heading, lengths, turns: corners.map(c => Math.round(c) === 270 ? 'L' : 'R').join('') }
    : { start: [...first], heading, lengths, corners } };
}

/**
 * Put a solved room into the model: replaces `polygon` and `capture` of the room with that id on the
 * level, or appends a new room. Returns a new model; everything else is shared untouched.
 */
export function upsertRoom(model, levelId, room) {
  const levels = model.levels.map(l => {
    if (l.id !== levelId) return l;
    const rooms = l.rooms || [], at = rooms.findIndex(r => r.id === room.id);
    const next = at < 0 ? [...rooms, room] : rooms.map((r, i) => i === at ? { ...r, ...room } : r);
    return { ...l, rooms: next };
  });
  return { ...model, levels };
}

/**
 * Remove a room from a level. Walls that bound only this room go with it, and so do their openings;
 * a shared wall stays and just stops listing the room. A wall that an object or fixture is attached
 * to is kept (listed in `heldWalls`), so nothing is left pointing at a missing wall. Walls without a
 * `rooms` list (hand-made) are never touched. Returns { model, removedWalls, removedOpenings,
 * keptWalls, heldWalls, dependents } where `dependents` are rooms whose corner 0 was placed at a
 * point of this room (they keep their position but lose the reference).
 */
export function removeRoom(model, levelId, roomId) {
  const removedWalls = [], removedOpenings = [], keptWalls = [], heldWalls = [], dependents = [];
  const levels = model.levels.map(l => {
    if (l.id !== levelId) return l;
    const held = new Set([...(l.objects || []), ...(l.fixtures || [])].map(x => x.attach?.wall).filter(Boolean));
    const walls = [];
    for (const w of l.walls || []) {
      if (!(w.rooms || []).includes(roomId)) walls.push(w);
      else if (w.rooms.length === 1 && !held.has(w.id)) removedWalls.push(w.id);
      else { (w.rooms.length === 1 ? heldWalls : keptWalls).push(w.id); walls.push({ ...w, rooms: w.rooms.filter(r => r !== roomId) }); }
    }
    const openings = (l.openings || []).filter(o => !removedWalls.includes(o.wall));
    removedOpenings.push(...(l.openings || []).filter(o => removedWalls.includes(o.wall)).map(o => o.id));
    for (const r of l.rooms || []) if (r.capture?.raw?.origin?.ref?.startsWith(`${roomId}#`)) dependents.push(r.id);
    return { ...l, rooms: (l.rooms || []).filter(r => r.id !== roomId), walls, ...(l.openings ? { openings } : {}) };
  });
  return { model: { ...model, levels }, removedWalls, removedOpenings, keptWalls, heldWalls, dependents };
}

/**
 * Fill in the walls a level is missing, without ever touching existing walls. For every room edge,
 * stretches that an existing wall face (or virtual wall) already covers get nothing; uncovered
 * stretches get a wall: shared between two rooms that both still need one on that line (thickness =
 * measured face distance), otherwise a wall of its own with the default thickness. So a new room
 * next to an already-walled room gets its own wall on that side. Returns { level, added, shared, report }.
 */
export function generateMissingWalls(level, options = {}) {
  const rooms = (level.rooms || []).filter(r => r.polygon?.length >= 3), existing = level.walls || [];
  const geo = buildLevelGeometry(level);
  const skip = new Set(), gaps = new Map(), todo = [];
  for (const r of rooms) {
    let missing = false;
    r.polygon.forEach((p, i) => {
      const key = `${r.id}#e${i}`, g = edgeGaps(p, r.polygon[(i + 1) % r.polygon.length], geo, key);
      if (!g.length) skip.add(key); else { gaps.set(key, g); missing = true; }
    });
    if (missing) todo.push(r);
  }
  const gen = generateWalls(todo, { ...options, solids: level.solids, skip, gaps, usedIds: existing.map(w => w.id) });
  return { level: { ...level, walls: [...existing, ...gen.walls] }, added: gen.walls.map(w => w.id), shared: gen.shared, report: { ...gen.report, covered: [...skip] } };
}

/** Unique room id from a name: "Hall way" → r_hall_way (r_hall_way_2 if taken). */
export function newRoomId(model, name) {
  const used = new Set(model.levels.flatMap(l => (l.rooms || []).map(r => r.id)));
  const slug = String(name || 'room').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'room';
  let id = `r_${slug}`, k = 2;
  while (used.has(id)) id = `r_${slug}_${k++}`;
  return id;
}

export const isClockwisePolygon = poly => poly.length >= 3 && signedArea(poly) < 0;

/** "A x, D y" (also "Ax", "A:x", or wall numbers "0 x") → { locks: [{ edge, axis }], errors }. */
export function parseLocks(text) {
  const locks = [], errors = [];
  for (const part of String(text ?? '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+|[a-z]+?)\s*[:=\s]?\s*([xy])$/i);
    if (m) locks.push({ edge: wallIndex(m[1]), axis: m[2].toLowerCase() }); else errors.push(`locked wall "${part}": expected e.g. "A x" (wall letter, then x or y)`);
  }
  return { locks, errors };
}
/**
 * Lengths measured but replaced by worked-out ones (raw.checks), one per line: "D 3125" or
 * "D 3125 laser, before the corner was moved" (wall letter, measured mm, an optional note).
 */
export function parseChecks(text) {
  const checks = [], errors = [];
  for (const line of String(text ?? '').split(/\n/).map(s => s.trim()).filter(Boolean)) {
    const m = line.match(/^(\d+|[a-z]+)\s*[:=\s]\s*([\d.]+)(?:\s+(.*))?$/i), edge = m && wallIndex(m[1]);
    if (!m || edge === null || !(+m[2] > 0)) { errors.push(`check "${line}": expected e.g. "D 3125" (wall letter, then the measured mm)`); continue; }
    checks.push({ edge, measured: +m[2], ...(m[3] ? { note: m[3] } : {}) });
  }
  return { checks, errors };
}
export const checksToText = checks => (checks || []).map(c => `${wallName(c.edge)} ${c.measured}${c.note ? ` ${c.note}` : ''}`).join('\n');

export const locksToText = locks => (locks || []).map(k => `${wallName(k.edge)} ${k.axis}`).join(', ');

/**
 * Lock offers (PLANTERN.md §7 Editing): walls of a solved room that run within `maxDeg` of a plan axis
 * without lying on it. [{ edge, axis, off }] (off in degrees). A square room turns as a whole, so it
 * gets one offer (its first wall); a "lengths" room cannot take locks.
 */
export function lockOffers(capture, polygon, maxDeg = 1) {
  if (!capture?.raw || !polygon || capture.mode === 'lengths') return [];
  const locked = new Set((capture.raw.locks || []).map(k => k.edge)), out = [];
  polygon.forEach((p, i) => {
    if (locked.has(i)) return;
    const q = polygon[(i + 1) % polygon.length], a = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
    const offAxis = d => Math.abs((((d % 180) + 270) % 180) - 90);   // degrees from the nearest multiple of 180°
    const offX = offAxis(a), offY = offAxis(a - 90);
    const [axis, off] = offX <= offY ? ['x', offX] : ['y', offY];
    if (off > 0.01 && off <= maxDeg) out.push({ edge: i, axis, off: Math.round(off * 100) / 100 });
  });
  return capture.raw.closure === 'square' && capture.mode === 'rectilinear' ? out.slice(0, 1) : out;
}

/**
 * One residual as table cells: { label, measured, model, delta, unit }. Corners are degrees; a
 * `check` is a typed length that a worked-out one replaced; worked-out lengths are not measurements.
 */
export function residualCells(r, derived = [], exact = []) {
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1), sign = v => (v >= 0 ? '+' : '') + v;
  if (r.kind === 'corner') return { label: `corner ${r.a}`, measured: `${r.measured}°`, model: `${r.model}°`, delta: sign(r.residual.toFixed(2)) + '°', unit: 'deg', residual: r.residual };
  const wall = `wall ${wallName(r.a)} (${r.a}→${r.b})`;
  const label = r.kind === 'diagonal' ? (r.check ? `check ${r.a}–${r.b} (${r.check})` : `diag ${r.a}–${r.b}`) : r.kind === 'check' ? `${wall}, check` : wall;
  const measured = r.kind === 'edge' && derived.includes(r.a) ? 'worked out' : `${Math.round(r.measured * 10) / 10}${r.kind === 'edge' && exact.includes(r.a) ? ' (exact)' : ''}`;
  return { label, measured, model: f1(r.model), delta: sign(f1(r.residual)), unit: 'mm', residual: r.residual };
}

/** Lock offer as a sentence. */
export const describeLockOffer = o => `Wall ${wallName(o.edge)} runs ${o.off}° off the ${o.axis} axis: lock it to ${o.axis}`;

/** The capture with one more lock. */
export const withLock = (capture, lock) => ({ ...capture, raw: { ...capture.raw, locks: [...(capture.raw.locks || []).filter(k => k.edge !== lock.edge), { edge: lock.edge, axis: lock.axis }] } });
