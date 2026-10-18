// Editor page: walldraw. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { startDots } from '../start.js';
import { nearestPoint, nearestLine, pointToLine } from '../../tools/measure-core.js';
import { collectSnapLines } from '../../tools/snap.js';
import { pointInPolygon } from '../../geometry/polygon.js';
import { typedLength } from '../clearance.js';
import { addWall } from '../../edit/ops.js';
import { toSvg } from '../../render2d/coords.js';
import { wallFrame } from '../../geometry/walls.js';
import { wallInfo, offsetFrom, offsetTo, cornerAt } from '../../edit/inspect.js';
import { dimensionSvg, pointOn, cornerSvg } from '../plan-marks.js';
import { $, commit, esc, level, opts, room, wall } from './core.js';
import { fromOf, syncOriginPick } from './panel-opening.js';
import { draw } from './plan-draw.js';
import { isRound, recompute } from './panel-room.js';
import { enterEdit, mayLeave, setStatus, showEditBar, startFresh } from './session.js';
import { showUnderlay } from './levels.js';
import { selectNone } from './selection.js';
import { Ed } from './state.js';


/**
 * Pick the point corner 0 is placed at. A room that already has a shape stays where it is: the
 * offset becomes the distance from the new point to corner 0. A new room starts on the point.
 */
export function pickStart(ref) {
  const c0 = Ed.solved?.ok && (Ed.roomId || Ed.draft) ? Ed.solved.polygon[0] : room()?.polygon?.[0];
  const p = ref ? Ed.snapsAround.find(s => s.ref === ref)?.pos : [0, 0];
  $('originRef').value = ref;
  if (c0 && p && Ed.roomId) { $('ox').value = Math.round((c0[0] - p[0]) * 10) / 10; $('oy').value = Math.round((c0[1] - p[1]) * 10) / 10; }
  Ed.startPick = false; syncOriginPick(); draw();                  // a point was chosen: the dots go, the list shows it
  recompute(); showEditBar();
  if (c0 && p && Ed.roomId) setStatus(`corner 0 stays where it is: ${ref || 'the plan origin'} + (${$('ox').value}, ${$('oy').value}) mm`);
}

/**
 * A click just beside a start dot (while a room or solid is edited) still picks it: the point within
 * 22 px of the click, as { dataset: { ref } } like the dot's element, or null. A near-miss must not
 * fall through to the room underneath, which would leave the editor.
 */
export function nearStartDot(e) {
  if (!Ed.startPick) return null;                                 // the dots show only while Select from point is on
  if (!(Ed.editing?.kind === 'room' || Ed.editing?.kind === 'solid') || isRound()) return null;
  const svg = $('preview'), m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(m.inverse()), p = [q.x, -q.y], reach = 22 / Math.abs(m.a);
  let best = null;
  for (const o of startDots(Ed.snapsAround, { excludeRoom: Ed.roomId || $('rid').value })) {
    const d = Math.hypot(o.pos[0] - p[0], o.pos[1] - p[1]);
    if (d <= reach && (!best || d < best.d)) best = { d, ref: o.ref };
  }
  return best ? { dataset: { ref: best.ref } } : null;
}

// ---- + Wall: draw a hand-drawn wall with two clicks ----
/** The plan point under the pointer: a snap point, else a point on a wall face or room edge, else free (Alt: always free). */
export function wallPoint(e) {
  const svg = $('preview'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const q = pt.matrixTransform(m.inverse()), p = [q.x, -q.y], k = 1 / Math.abs(m.a);
  if (e.altKey) return { pos: p };
  const s = nearestPoint(p, showUnderlay() ? Ed.snapsAround : Ed.snaps, 14 * k);   // a corner of the level below or above too
  if (s) return { pos: s.pos, ref: s.ref };
  const l = nearestLine(p, collectSnapLines(Ed.model, level(), Ed.curGeo), 10 * k);
  if (l) { const f = pointToLine(p, l); return { pos: f.foot.map(v => Math.round(v * 10) / 10), on: l.ref }; }
  return { pos: p.map(v => Math.round(v)) };
}
/** The end point, kept straight along x or y when close to an axis (Shift: always). */
function straighten(a, b, force) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 90;
  if (!force && Math.min(ang, 90 - ang) > 2) return b;
  return Math.abs(dx) >= Math.abs(dy) ? [b[0], a[1]] : [a[0], b[1]];
}
export const ROOM_CORNER = /^r_[^#]+#p\d+$/;
/** What a wall end at `pos` hangs on: the room corner it was snapped to, else the nearest corner of the room the wall stands in (or of any room). */
function anchorFor(pos, ref, mid) {
  if (ref && ROOM_CORNER.test(ref) && Ed.snaps.some(s => s.ref === ref)) return { ref, offset: [0, 0] };   // a corner of this level
  const inRoom = (level().rooms || []).find(r => r.polygon?.length >= 3 && pointInPolygon(mid, r.polygon));
  const corners = Ed.snaps.filter(s => ROOM_CORNER.test(s.ref) && (!inRoom || s.ref.startsWith(`${inRoom.id}#`)));
  const best = corners.reduce((x, s) => (!x || Math.hypot(s.pos[0] - pos[0], s.pos[1] - pos[1]) < Math.hypot(x.pos[0] - pos[0], x.pos[1] - pos[1]) ? s : x), null);
  return best ? { ref: best.ref, offset: [Math.round((pos[0] - best.pos[0]) * 10) / 10, Math.round((pos[1] - best.pos[1]) * 10) / 10] } : null;
}
// A hand-drawn wall in the panel, as it is measured: its start x/y from the corner it follows (or from the
// plan origin), then how far it runs (length x east, length y north). The stored wall keeps its two ends.
export const snapPos = ref => Ed.snaps.find(s => s.ref === ref)?.pos;
const r1 = v => Math.round(v * 10) / 10;
/** The two ends the position fields describe, or null while a field is not a number. */
export function wallEnds() {
  const o = snapPos($('wAnchA').value) || [0, 0], v = ['wSx', 'wSy', 'wLx', 'wLy'].map(id => Number($(id).value.trim() === '' ? NaN : $(id).value));
  if (v.some(x => !Number.isFinite(x))) return null;
  const a = [r1(o[0] + v[0]), r1(o[1] + v[1])];
  return { a, b: [r1(a[0] + v[2]), r1(a[1] + v[3])] };
}
/** Fill the position fields from a wall's ends (start relative to the corner its start follows). */
export function fillWallPos(a, b) {
  const ref = $('wAnchA').value, o = snapPos(ref) || [0, 0];
  $('wSx').value = r1(a[0] - o[0]); $('wSy').value = r1(a[1] - o[1]); $('wLx').value = r1(b[0] - a[0]); $('wLy').value = r1(b[1] - a[1]);
  const where = ref ? $('wAnchA').selectedOptions[0]?.textContent : 'the plan origin';
  $('wSxNote').textContent = `east of ${where}`; $('wSyNote').textContent = `north of ${where}`;
  $('wAnchA').dataset.was = ref;
  showWallPos();
}
export function showWallPos() {
  const e = wallEnds();
  $('wPosOut').textContent = e ? `${Math.round(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]))} mm long, from (${e.a.join(', ')}) to (${e.b.join(', ')})` : 'start and lengths: numbers of mm';
}
/** The anchors the wall form describes (room corner per end, offsets so the ends stay where the fields say). */
export function anchorForm() {
  const out = {}, e = wallEnds();
  if (!e) return wall()?.anchor ?? null;
  for (const [end, sel] of [['a', 'wAnchA'], ['b', 'wAnchB']]) {
    const ref = $(sel).value, p = snapPos(ref);
    if (ref && p) out[end] = { ref, offset: [r1(e[end][0] - p[0]), r1(e[end][1] - p[1])] };
  }
  return Object.keys(out).length ? out : null;
}

export async function startDrawing() {
  if (!(await mayLeave())) return;
  if (Ed.measure?.isOn()) Ed.measure.setOn(false);
  selectNone();
  Ed.drawing = { a: null, hover: null };
  $('preview').classList.add('measuring');
  setStatus('+ Wall: click where it starts (corners snap, or a point on a wall face; Alt = anywhere). Esc cancels.');
}
export function stopDrawing() { Ed.drawing = null; $('preview').classList.remove('measuring'); $('preview').querySelector('#dOverlay')?.remove(); setStatus(''); }
export function drawingClick(e) {
  const p = wallPoint(e);
  if (!Ed.drawing.a) { Ed.drawing.a = p; setStatus('+ Wall: click where it ends, or type its length and press Enter (it keeps straight near x or y; Shift = always). Esc cancels.'); drawWallOverlay(); return; }
  finishDrawnWall(straighten(Ed.drawing.a.pos, p.pos, e.shiftKey), p);
}
/** A length typed while drawing (UX12): the end goes that far from the start, the way the pointer points. */
export function typedWallEnd() {
  const len = typedLength(Ed.drawing?.typed), h = Ed.drawing?.hover;
  if (!len || !Ed.drawing.a || !h) return false;
  const end = straighten(Ed.drawing.a.pos, h.pos, Ed.drawing.shift), dx = end[0] - Ed.drawing.a.pos[0], dy = end[1] - Ed.drawing.a.pos[1], L = Math.hypot(dx, dy);
  if (L < 1) { setStatus('Point the way the wall goes, then press Enter'); return true; }
  finishDrawnWall([Math.round((Ed.drawing.a.pos[0] + dx / L * len) * 10) / 10, Math.round((Ed.drawing.a.pos[1] + dy / L * len) * 10) / 10], { pos: null, ref: null });
  return true;
}
function finishDrawnWall(b, p) {
  // each end hangs on a room corner (the one clicked, else the nearest of the room it stands in), so it follows the room
  const mid = [(Ed.drawing.a.pos[0] + b[0]) / 2, (Ed.drawing.a.pos[1] + b[1]) / 2];
  const anchor = { a: anchorFor(Ed.drawing.a.pos, Ed.drawing.a.ref, mid), b: anchorFor(b, p.pos && b === p.pos ? p.ref : null, mid) };
  for (const k of ['a', 'b']) if (!anchor[k]) delete anchor[k];
  const r = addWall(Ed.model, Ed.levelId, { a: Ed.drawing.a.pos, b, anchor }, opts());
  if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
  stopDrawing();
  const base = Ed.model;
  commit(r.model);
  enterEdit('wall', r.wall.id, { ask: false }); startFresh('wall', r.wall.id, base, 'wall');
  setStatus(`${r.wall.id} drawn: set its thickness, height or base (a lintel: its underside), name it and Apply to create it`);
}
export function drawWallOverlay() {
  const svg = $('preview');
  svg.querySelector('#dOverlay')?.remove();
  if (!Ed.drawing) return;
  const k = 1 / Math.abs(svg.getScreenCTM()?.a || 1), NS = 'http://www.w3.org/2000/svg', g = document.createElementNS(NS, 'g');
  g.id = 'dOverlay'; g.setAttribute('pointer-events', 'none');
  const add = (tag, at) => { const el = document.createElementNS(NS, tag); for (const [x, v] of Object.entries(at)) el.setAttribute(x, v); g.appendChild(el); return el; };
  const dot = (p, c) => { const [x, y] = toSvg(p); add('circle', { cx: x, cy: y, r: 6 * k, fill: 'none', stroke: c, 'stroke-width': 2 * k }); };
  if (Ed.drawing.a) dot(Ed.drawing.a.pos, '#4cc38a');
  if (Ed.drawing.hover) {
    const end = Ed.drawing.a ? straighten(Ed.drawing.a.pos, Ed.drawing.hover.pos, Ed.drawing.shift) : Ed.drawing.hover.pos;
    dot(end, '#ffb454');
    if (Ed.drawing.a) {
      const [x1, y1] = toSvg(Ed.drawing.a.pos), [x2, y2] = toSvg(end);
      add('line', { x1, y1, x2, y2, stroke: '#ffb454', 'stroke-width': 3 * k, 'stroke-dasharray': `${8 * k} ${5 * k}` });
      const t = add('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 8 * k, 'text-anchor': 'middle', 'font-size': 13 * k, fill: '#ffb454', 'paint-order': 'stroke', stroke: '#14161a', 'stroke-width': 4 * k });
      t.textContent = Ed.drawing.typed ? `${Ed.drawing.typed}▏ Enter sets the length` : `${Math.round(Math.hypot(end[0] - Ed.drawing.a.pos[0], end[1] - Ed.drawing.a.pos[1]))} mm · or type a length`;
    }
  }
  svg.appendChild(g);
}

/**
 * What a panel's numbers count from, drawn on the plan: the corner named in "mm from corner 3 of Salong"
 * and the distance from it to the opening's near edge (and its width), or to a wall lamp or switch; for a
 * wall, the corners at its ends and its left and right side. Values being typed are shown as typed.
 */
export function selectionMarks(lv, fs) {
  return pickedPoints(fs) + panelMarks(lv, fs);
}

/**
 * The points chosen in the pickers of the open panel, ringed and named on the plan: where stairs start,
 * the corners a drawn wall's ends follow, the two points of a new anchor.
 */
function pickedPoints(fs) {
  const at = ref => (Ed.snapsAround.find(s => s.ref === ref) || Ed.snaps.find(s => s.ref === ref))?.pos;
  const ringAt = (P, text, color = '#4cc38a') => {
    if (!P) return '';
    const [x, y] = toSvg(P);
    return `<g pointer-events="none"><circle cx="${x}" cy="${y}" r="${fs * 0.8}" fill="none" stroke="${color}" stroke-width="${fs / 5}"/>`
      + `<text x="${x + fs}" y="${y - fs}" fill="${color}" font-size="${fs * 0.8}" font-weight="600" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.3}">${esc(text)}</text></g>`;
  };
  const ring = (ref, text, color = '#4cc38a') => ringAt(ref && at(ref), text, color);
  if (Ed.editing?.kind === 'stairs') {
    // the anchor (green) is the point the stair's offset counts from; the starting point (blue) is where the stair itself starts: the front-left corner of its first step
    const st = Ed.curGeo?.stairs?.find(x => x.id === Ed.stairsId);
    return ring($('stRef').value, 'anchor point') + ringAt(st?.layout?.flights?.[0]?.o, 'starting point', '#7aa2d6');
  }
  if (Ed.editing?.kind === 'wall' && !$('wPosBox').hidden) return ring($('wAnchA').value, 'start follows') + ring($('wAnchB').value, 'end follows', '#ffb454');
  if (!Ed.editing && $('anchorCount').closest('details').open) return ring($('anA').value, 'anchor point 1') + ring($('anB').value, 'anchor point 2', '#ffb454');
  return '';
}

function panelMarks(lv, fs) {
  const typed = (id, v) => { const t = $(id).value.trim(), n = Number(t); return t !== '' && Number.isFinite(n) ? n : v; };
  // the thing at t0 … t1 along the wall (from its start), measured from corner `c` (measureCorners())
  const mark = (w, t0, t1, c) => {
    // dimensions on the side of the wall a room is on (the right side for a wall made from a room edge)
    const f = wallFrame(w), info = wallInfo(lv, w.id), right = !!info?.sides.right.length || !info?.sides.left.length;
    const d = right ? f.offR + fs * 2.6 : -(f.offL + fs * 2.6), near = c.dir > 0 ? t0 : t1;
    let out = Math.abs(near - c.s) >= 1 ? dimensionSvg(pointOn(w.a, w.b, c.s, d), pointOn(w.a, w.b, near, d), { fs, text: Math.round(Math.abs(near - c.s)) }) : '';
    if (t1 - t0 >= 1) out += dimensionSvg(pointOn(w.a, w.b, t0, d), pointOn(w.a, w.b, t1, d), { fs, color: '#d9dde4', text: Math.round((t1 - t0) * 10) / 10 });
    out += cornerSvg(c.pos, /#p(\d+)$/.exec(c.key)?.[1] ?? c.key, { fs, active: true, tag: 'from here', toward: pointOn(w.a, w.b, c.s + c.dir * Math.min(f.L / 2, fs * 3), d) });
    return out;
  };
  const o = Ed.openingId && lv.openings?.find(x => x.id === Ed.openingId), ow = o && lv.walls?.find(x => x.id === o.wall);
  if (ow) {
    const c = fromOf(o.id, ow), editingIt = Ed.editing?.kind === 'opening', wd = editingIt ? typed('oWidth', o.width) : o.width;
    const dist = editingIt ? typed('oOffset', offsetFrom(o, c)) : offsetFrom(o, c), t0 = offsetTo(dist, c, wd);
    return mark(ow, t0, t0 + wd, c);
  }
  const x = Ed.fixtureId && lv.fixtures?.find(v => v.id === Ed.fixtureId), xw = x?.attach && lv.walls?.find(v => v.id === x.attach.wall);
  if (xw) {
    const c = fromOf(x.id, xw), shown = offsetFrom({ offset: x.attach.offset, width: 0 }, c);
    const t = offsetTo(Ed.editing?.kind === 'fixture' ? typed('xOffset', shown) : shown, c);
    return mark(xw, t, t, c);
  }
  const w = Ed.wallId && wall();
  if (w) {
    // the corners named in the panel ("Split at … from corner 2"), and which side is left and right
    const f = wallFrame(w), ca = cornerAt(lv, w.a), cb = cornerAt(lv, w.b);
    let out = cornerSvg(w.a, ca ? ca.index : 'a', { fs, active: true, tag: ca ? 'start' : '' }) + (cb ? cornerSvg(w.b, cb.index, { fs, hot: true }) : '');
    const apart = Math.abs(f.n[0]) * fs * 2.4;                      // a wall running up the screen: the labels are side by side, so further out (UX30)
    for (const [side, k] of [['left', f.offL + fs * 1.4 + apart], ['right', -(f.offR + fs * 1.4 + apart)]]) {
      const P = pointOn(w.a, w.b, f.L / 2, -k), [tx, ty] = toSvg(P);
      out += `<text x="${tx}" y="${ty}" fill="#d9dde4" font-size="${fs * 0.8}" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.3}" pointer-events="none">${side} side</text>`;
    }
    const at = Number($('wSplitAt').value);
    if (at > 0 && at < f.L) out += dimensionSvg(pointOn(w.a, w.b, 0, f.offR + fs * 2.6), pointOn(w.a, w.b, at, f.offR + fs * 2.6), { fs, color: '#e5534b' });
    return out;
  }
  return '';
}
