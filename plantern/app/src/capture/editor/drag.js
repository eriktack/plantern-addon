// Editor page: drag. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { attachNear as attachOnNearestWall, snapMove, moveCapture, dragCorner, moveWall, dragWallEnd, stripEndDrag, turnStairs, moveStairsStart, resizeObject, openingDrag, rotateObject, pullOff, wallSnap, boxPosForMiddle } from '../drag.js';
import { hasBody, wallCut } from '../../geometry/walls.js';
import { stripForm, lampOnObject } from '../../model/fixtures.js';
import { isHosted } from '../../model/hosted.js';
import { roundMovedTo } from '../round.js';
import { nearestPoint } from '../../tools/measure-core.js';
import { solveCapture } from '../solve.js';
import { wallName } from '../labels.js';
import { captureToForm } from '../edit.js';
import { resolveSettings } from '../../model/settings.js';
import { buildLevelGeometry, buildModelGeometry } from '../../geometry/level.js';
import { alongWallGaps, edgesOf, clearances } from '../clearance.js';
import { dimensionSvg, pointOn } from '../plan-marks.js';
import { stairsPlan } from '../../geometry/stairs.js';
import { applyStairs, setObject, setOpening, setFixture } from '../../edit/ops.js';
import { sizeEdit } from '../../blueprints/size.js';
import { $, P, commit, level, opening, opts, perfAs, wall } from './core.js';
import { ROOM_CORNER, fillWallPos, selectionMarks, wallEnds, wallPoint } from './walldraw.js';
import { enterEdit, isDirty, setStatus, showEditBar } from './session.js';
import { showUnderlay } from './levels.js';
import { recompute, roundForm } from './panel-room.js';
import { draw, fixtureSvg, objectSvg, openingHandlesSvg, openingSvg, stairsHandlesSvg, stairsSvg, stripHandlesSvg, wallSvg } from './plan-draw.js';
import { refName, selectFixture, selectObject } from './selection.js';
import { assetCache } from './panel-object.js';
import { Ed } from './state.js';


// ---- dragging a lamp, switch or object on the plan ----
export const r1d = v => Math.round(v * 10) / 10;
/** Where a thing on a wall goes when its middle is dragged to p: the nearest wall within reach, the side p is on, the offset along it. */
/** The attach of a thing `width` wide whose middle is at p: on the nearest wall face of this level (drag.js). */
const attachNear = (p, cur, width) => attachOnNearestWall(p, cur, width, level().walls, Ed.curGeo.frames, { hasBody });
export const freePoint = e => wallPoint({ clientX: e.clientX, clientY: e.clientY, altKey: true }).pos;
export function dragStart(e) {
  if (e.button !== 0 || Ed.drawing || Ed.measure?.isOn() || Ed.peekId) return;
  if (roomDragStart(e)) return;
  if (wallDragStart(e)) return;
  const endEl = e.target.closest('[data-send]');                  // an end of the selected LED strip: drag it to change where it starts or how long it is
  const endFx = endEl && level().fixtures?.find(f => f.id === endEl.dataset.id);
  if (endEl && endFx?.attach?.vertical !== true && !(Ed.editing && !(Ed.editing.kind === 'fixture' && Ed.editing.id === endEl.dataset.id))) { Ed.pan = null; Ed.dragging = { kind: 'send', id: endEl.dataset.id, end: endEl.dataset.send, x: e.clientX, y: e.clientY, moved: false, frame: 0, key: `send:${endEl.dataset.id}:${Math.round(performance.now())}` }; return; }
  // the selected opening: an edge handle resizes it, its body slides it along the wall (UX11)
  const oEdge = e.target.closest('[data-oedge]'), oBody = !oEdge && Ed.openingId && e.target.closest(`[data-kind="opening"][data-id="${CSS.escape(Ed.openingId)}"]`);
  if (oEdge || oBody) {
    const o = opening(), w = o && level().walls.find(v => v.id === o.wall);
    if (o && w && !(Ed.editing && !(Ed.editing.kind === 'opening' && Ed.editing.id === o.id))) {
      if (Ed.editing && isDirty()) { setStatus('Apply or revert your changes first, then drag it'); return; }
      const f = Ed.curGeo.frames.get(w.id), q = freePoint(e), s0 = (q[0] - w.a[0]) * f.u[0] + (q[1] - w.a[1]) * f.u[1];
      Ed.pan = null;
      Ed.dragging = { kind: oEdge ? 'oedge' : 'obody', id: o.id, edge: oEdge?.dataset.oedge, x: e.clientX, y: e.clientY, moved: false, frame: 0, grab: s0 - o.offset, o0: { offset: o.offset, width: o.width }, key: `odrag:${o.id}:${Math.round(performance.now())}` };
      return;
    }
  }
  const stTurn = e.target.closest('[data-sturn]'), stBody = !stTurn && Ed.stairsId && e.target.closest(`[data-kind="stairs"][data-id="${CSS.escape(Ed.stairsId)}"]`);
  if ((stTurn || stBody) && !(Ed.editing && !(Ed.editing.kind === 'stairs' && Ed.editing.id === Ed.stairsId))) {   // the selected stairs (UX17)
    if (Ed.editing && isDirty()) { setStatus('Apply or revert your changes first, then drag them'); return; }
    const g = Ed.curGeo.stairs?.find(x => x.id === Ed.stairsId), o = g?.layout?.flights?.[0]?.o;
    if (o) {
      Ed.pan = null;
      Ed.dragging = { kind: stTurn ? 'sturn' : 'sbody', id: Ed.stairsId, x: e.clientX, y: e.clientY, moved: false, frame: 0, p0: freePoint(e), o0: [...o],
        pts: (showUnderlay() ? Ed.snapsAround : Ed.snaps).filter(sp => !sp.ref.startsWith(`${Ed.stairsId}#`)), key: `stairs:${Ed.stairsId}:${Math.round(performance.now())}` };
      return;
    }
  }
  const sideEl = e.target.closest('[data-oside]');               // a side of the selected object: resize it (UX13)
  if (sideEl) {
    if (Ed.editing && isDirty()) { setStatus('Apply or revert your changes first, then drag it'); return; }
    Ed.pan = null; Ed.dragging = { kind: 'oside', id: sideEl.dataset.id, side: sideEl.dataset.oside, x: e.clientX, y: e.clientY, moved: false, frame: 0, key: `oside:${sideEl.dataset.id}:${Math.round(performance.now())}` };
    return;
  }
  const rotEl = e.target.closest('[data-orot]');
  if (rotEl) { Ed.pan = null; Ed.dragging = { kind: 'orot', id: rotEl.dataset.orot, x: e.clientX, y: e.clientY, moved: false, frame: 0, key: `rot:${rotEl.dataset.orot}:${Math.round(performance.now())}` }; return; }
  const el = e.target.closest('[data-kind="fixture"], [data-kind="object"]');
  if (!el) return;
  const kind = el.dataset.kind, id = el.dataset.id;
  if (Ed.editing && !(Ed.editing.kind === kind && Ed.editing.id === id)) return;
  { const sx = kind === 'fixture' && level().fixtures?.find(f => f.id === id); if ((sx?.kind === 'strip' && stripForm(sx) !== 'wall') || (sx && lampOnObject(sx))) return; }   // on an object or a window it follows that: move that
  { const ho = kind === 'object' && level().objects?.find(o => o.id === id); if (ho && isHosted(ho)) { setStatus(`${id} stands in its opening and follows it: drag the opening, or change Placed in its panel`); return; } }
  Ed.pan = null;                                                    // this pointer moves the thing, not the plan
  // where the thing's middle is against the pointer, kept while dragging (the thing does not jump under the pointer)
  const lv = level(), thing = kind === 'fixture' ? lv.fixtures?.find(f => f.id === id) : lv.objects?.find(o => o.id === id);
  const mid = !thing ? null : kind === 'fixture' ? Ed.curGeo.fixturePos(thing) : (fp => fp && [fp.reduce((s, q) => s + q[0], 0) / fp.length, fp.reduce((s, q) => s + q[1], 0) / fp.length])(Ed.curGeo.objectFootprint(thing));
  const p0 = freePoint(e);
  Ed.dragging = { kind, id, x: e.clientX, y: e.clientY, moved: false, key: `drag:${id}:${Math.round(performance.now())}`, frame: 0, grab: mid ? [mid[0] - p0[0], mid[1] - p0[1]] : [0, 0] };
}
// ---- dragging the room (or solid) being edited: inside it moves it, a corner reshapes it ----
/** The plan point under the pointer for a room drag, and the start points it may snap to (not its own). */
function roomDragSnaps() {
  const own = new Set((level().walls || []).filter(w => (w.from || []).some(f => f.startsWith(`${Ed.roomId}#`))).map(w => w.id));
  return (showUnderlay() ? Ed.snapsAround : Ed.snaps).filter(s => !(Ed.roomId && s.ref.startsWith(`${Ed.roomId}#`)) && !own.has(s.ref.split('#')[0]));
}
function roomDragStart(e) {
  if (!Ed.solved?.ok || !(Ed.roomId || Ed.draft) || !Ed.solved.capture) return false;
  const corner = e.target.closest('[data-corner]'), body = !corner && e.target.closest('[data-cur]');
  if (!corner && !body) return false;
  if (Ed.editing && !(Ed.editing.kind === Ed.shape && (Ed.editing.id ?? null) === (Ed.roomId ?? null))) return false;
  Ed.pan = null;
  Ed.dragging = { kind: corner ? 'corner' : 'room', i: corner ? +corner.dataset.corner : null, x: e.clientX, y: e.clientY, moved: false, frame: 0,
    p0: freePoint(e), cap0: Ed.solved.capture, poly0: Ed.solved.polygon.map(p => [...p]), pts: roomDragSnaps() };
  return true;
}
function roomDragMove(e, d) {
  if (!d.moved) {
    d.moved = true;
    if (!Ed.editing && Ed.roomId && !enterEdit(Ed.shape, Ed.roomId)) { Ed.dragging = null; return; }     // the house view: open it first
  }
  cancelAnimationFrame(d.frame);
  d.frame = requestAnimationFrame(() => {
    if (Ed.dragging !== d) return;
    const svg = $('preview'), k = 1 / Math.abs(svg.getScreenCTM()?.a || 1), q = freePoint(e);
    let cap, msg;
    if (d.kind === 'room') {
      let delta = [q[0] - d.p0[0], q[1] - d.p0[1]], on = null;
      const sm = e.altKey ? null : snapMove(d.poly0, delta, d.pts, 14 * k);    // a corner lands on a point near it
      if (sm) { delta = [delta[0] + sm.fix[0], delta[1] + sm.fix[1]]; on = sm.ref; }
      delta = delta.map(v => Math.round(v));
      if (d.cap0.mode === 'circle') {
        // a round pillar: the distances from its two walls (or its middle) follow
        const c0 = d.cap0.raw.start, f = roundMovedTo(roundForm(), level(), [c0[0] + delta[0], c0[1] + delta[1]], d.cap0.raw.diameter);
        $('rDA').value = f.distA ?? ''; $('rDB').value = f.distB ?? ''; $('rX').value = f.x ?? ''; $('rY').value = f.y ?? '';
        recompute(); showEditBar();
        d.msg = `Moved ${delta[0]} mm east, ${delta[1]} mm north${on ? ` (on ${on})` : ''}. Apply to keep it.`;
        setStatus(d.msg);
        return;
      }
      cap = moveCapture(d.cap0, delta);
      msg = `Moved ${delta[0]} mm east, ${delta[1]} mm north${on ? ` (a corner on ${on})` : ''}: only where corner 0 is changes. Apply to keep it.`;
    } else {
      let t = q;
      const sp = e.altKey ? null : nearestPoint(q, d.pts, 14 * k);
      if (sp) t = sp.pos;
      if (e.shiftKey) {
        // along one of the two walls at the corner only: the other wall keeps its place
        const P = d.poly0[d.i], n = d.poly0.length, dirOf = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
        const u = dirOf(d.poly0[(d.i + n - 1) % n], P), v = dirOf(P, d.poly0[(d.i + 1) % n]), w = [t[0] - P[0], t[1] - P[1]];
        const along = dir => { const s = w[0] * dir[0] + w[1] * dir[1]; return [P[0] + dir[0] * s, P[1] + dir[1] * s]; };
        const a = along(u), b = along(v);
        t = Math.hypot(a[0] - t[0], a[1] - t[1]) <= Math.hypot(b[0] - t[0], b[1] - t[1]) ? a : b;
      }
      // a corner dropped freely lands on an even centimetre (fixes list 51); a point it snaps to, Alt, and Shift (along a wall) keep it exact
      t = sp || e.altKey || e.shiftKey ?t.map(v => Math.round(v * 10) / 10) : t.map(v => Math.round(v / 10) * 10);
      const r = dragCorner(d.cap0, d.poly0, d.i, t, solveCapture);
      if (r.error) { setStatus(r.error === 'exact' ? `Wall ${r.exact.map(wallName).join(', ')} is marked exact: take it out of Exact lengths to move this corner.` : r.error); return; }
      cap = r.capture;
      msg = r.changed.length ? `Corner ${d.i}: wall ${r.changed.map(wallName).join(', ')} worked out${r.checks.length ? `; the measured ${r.checks.map(wallName).join(', ')} kept as checks` : ''}${sp ? ` (on ${sp.ref})` : ''}. Apply to keep it.` : '';
    }
    const f = captureToForm(cap);
    for (const key of ['ox', 'oy', 'lengths', 'derived', 'checks']) $(key).value = f[key];
    recompute(); showEditBar();
    d.msg = msg;
    if (msg) setStatus(msg);
  });
}
// ---- dragging a hand-drawn wall: as a whole, or by one end (the form's position fields follow; Apply keeps it) ----
function wallDragStart(e) {
  const w = Ed.wallId && wall();
  if (!w || w.from?.length) return false;
  const end = e.target.closest('[data-wend]'), body = !end && (e.target.closest('[data-wbody]') || e.target.closest(`[data-kind="wall"][data-id="${CSS.escape(w.id)}"]`));
  if (!end && !body) return false;
  if (Ed.editing && !(Ed.editing.kind === 'wall' && Ed.editing.id === w.id)) return false;
  Ed.pan = null;
  Ed.dragging = { kind: end ? 'wallend' : 'wall', end: end?.dataset.wend, x: e.clientX, y: e.clientY, moved: false, frame: 0, p0: freePoint(e), clean: !Ed.editing || !isDirty(),
    ends0: (Ed.editing && wallEnds()) || { a: [...w.a], b: [...w.b] }, pts: (showUnderlay() ? Ed.snapsAround : Ed.snaps).filter(s => !s.ref.startsWith(`${w.id}#`)) };
  return true;
}
function wallDragMove(e, d) {
  if (!d.moved) {
    d.moved = true;
    if (!Ed.editing && !enterEdit('wall', Ed.wallId)) { Ed.dragging = null; return; }
  }
  cancelAnimationFrame(d.frame);
  d.frame = requestAnimationFrame(() => {
    if (Ed.dragging !== d) return;
    const k = 1 / Math.abs($('preview').getScreenCTM()?.a || 1), q = freePoint(e);
    let ends, on = null;
    if (d.kind === 'wall') {
      let delta = [q[0] - d.p0[0], q[1] - d.p0[1]];
      const sm = e.altKey ? null : snapMove([d.ends0.a, d.ends0.b], delta, d.pts, 14 * k);
      if (sm) { delta = [delta[0] + sm.fix[0], delta[1] + sm.fix[1]]; on = sm.ref; }
      // a wall moved freely goes in even centimetres (fixes list 51); a snap, Alt and Shift keep it exact
      ends = moveWall(d.ends0, delta.map(v => (on || e.altKey || e.shiftKey ? Math.round(v) : Math.round(v / 10) * 10)));
    } else {
      const sp = e.altKey ? null : nearestPoint(q, d.pts, 14 * k);
      // a dropped end lands on an even centimetre unless it snaps to a point, or Alt or Shift keep it exact (fixes list 51)
      const free = e.altKey || e.shiftKey ? q.map(v => Math.round(v)) : q.map(v => Math.round(v / 10) * 10);
      ends = dragWallEnd(d.ends0, d.end, sp ? sp.pos : free, { lock: $('wLock').checked ? 'axis' : null, force: e.shiftKey });
      // dropped on a room corner: that end hangs on it from now on
      const p = ends[d.end], sel = d.end === 'a' ? 'wAnchA' : 'wAnchB';
      if (sp && Math.hypot(p[0] - sp.pos[0], p[1] - sp.pos[1]) < 0.5) { on = sp.ref; if (ROOM_CORNER.test(sp.ref) && [...$(sel).options].some(o => o.value === sp.ref)) $(sel).value = sp.ref; }
    }
    fillWallPos(ends.a, ends.b);
    draw(); showEditBar();
    d.msg = `${d.kind === 'wall' ? 'Wall moved' : `${d.end === 'a' ? 'Start' : 'End'} moved`}${on ? ` (on ${on})` : ''}: ${$('wPosOut').textContent}. Apply to keep it.`;
    setStatus(d.msg);
  });
}
export function dragMove(e) {
  const d = Ed.dragging;
  if (!d || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6)) return;
  perfAs('drag');
  if (d.kind === 'room' || d.kind === 'corner') { roomDragMove(e, d); return; }
  if (d.kind === 'wall' || d.kind === 'wallend') { wallDragMove(e, d); return; }
  if (d.kind === 'send') {
    d.moved = true;
    cancelAnimationFrame(d.frame);
    d.frame = requestAnimationFrame(() => {
      const x = Ed.dragging === d && level().fixtures?.find(f => f.id === d.id), w = x && stripForm(x) === 'wall' && level().walls.find(v => v.id === x.attach.wall);
      if (!w) return;
      const f = Ed.curGeo.frames.get(w.id), q = freePoint(e), s0 = (q[0] - w.a[0]) * f.u[0] + (q[1] - w.a[1]) * f.u[1];
      const { offset, length } = stripEndDrag(x.attach, d.end, s0, f.L, { exact: e.altKey });   // whole centimetres unless Alt (fixes list 49, 51)
      previewDrag(d, 'fixture', { attach: { ...x.attach, offset, length } });
      setStatus(`${d.id}: ${Math.round(length)} mm long, from ${Math.round(offset)} mm (stored when you let go)`);
    });
    return;
  }
  if (d.kind === 'sbody' || d.kind === 'sturn') {
    d.moved = true;
    cancelAnimationFrame(d.frame);
    d.frame = requestAnimationFrame(() => {
      const st = Ed.dragging === d && level().stairs?.find(x => x.id === d.id);
      if (!st) return;
      const q = freePoint(e), k = 1 / Math.abs($('preview').getScreenCTM()?.a || 1);
      let props, msg;
      if (d.kind === 'sturn') { props = { heading: turnStairs(d.o0, q) }; msg = `${d.id} goes up toward ${props.heading}°`; }
      else {
        let delta = [q[0] - d.p0[0], q[1] - d.p0[1]];
        const sm = e.altKey ? null : snapMove([d.o0], delta, d.pts, 14 * k);
        delta = delta.map(v => (sm || e.altKey ? Math.round(v) : Math.round(v / 10) * 10));   // whole centimetres unless snapped or Alt
        props = { start: moveStairsStart(st.start, delta, sm ? { ref: sm.ref } : null) };
        msg = sm ? `${d.id} starts at ${refName(sm.ref)}` : `${d.id} moved ${delta[0]} mm east, ${delta[1]} mm north`;
      }
      previewStairs(d, { ...st, ...props }, props);
      setStatus(`${msg} (stored when you let go; Esc puts them back)`);
    });
    return;
  }
  if (d.kind === 'oside') {
    d.moved = true;
    cancelAnimationFrame(d.frame);
    d.frame = requestAnimationFrame(() => {
      const lv = level(), o = Ed.dragging === d && lv.objects?.find(x => x.id === d.id);
      if (!o) return;
      const w = o.attach?.wall && lv.walls.find(x => x.id === o.attach.wall), f = w && Ed.curGeo.frames.get(w.id);
      const props = resizeObject(o, d.side, freePoint(e), f ? { a: w.a, frame: f } : null, { exact: e.altKey });
      previewDrag(d, 'object', props);
      setStatus(`${d.id}: ${Math.round(props.size[0])} × ${Math.round(props.size[1])} mm (stored when you let go${o.blueprint ? ', then built again' : ''}; Esc puts it back)`);
    });
    return;
  }
  if (d.kind === 'oedge' || d.kind === 'obody') {
    d.moved = true;
    cancelAnimationFrame(d.frame);
    d.frame = requestAnimationFrame(() => {
      const lv = level(), o = Ed.dragging === d && lv.openings?.find(x => x.id === d.id), w = o && lv.walls.find(v => v.id === o.wall);
      if (!w) return;
      const f = Ed.curGeo.frames.get(w.id), q = freePoint(e), s0 = (q[0] - w.a[0]) * f.u[0] + (q[1] - w.a[1]) * f.u[1];
      const others = lv.openings.filter(x => x.wall === o.wall && x.id !== o.id);
      const props = openingDrag(d.o0, d.kind === 'obody' ? 'body' : d.edge, s0, f.L, others, { grab: d.grab, exact: e.altKey });
      previewDrag(d, 'opening', props);
      setStatus(`${d.id}: ${Math.round(props.width)} mm wide, ${Math.round(props.offset)} mm from the wall's start (stored when you let go; Esc puts it back)`);
    });
    return;
  }
  if (d.kind === 'orot') {
    d.moved = true;
    cancelAnimationFrame(d.frame);
    d.frame = requestAnimationFrame(() => {
      const o = Ed.dragging === d && level().objects?.find(x => x.id === d.id);
      if (!o) return;
      const props = rotateObject(o, freePoint(e), { free: e.altKey });
      previewDrag(d, 'object', props);
      setStatus(`${d.id} turned to ${props.rotationDeg}° (stored when you let go)`);
    });
    return;
  }
  if (!d.moved) { d.moved = true; if (!Ed.editing) (d.kind === 'fixture' ? selectFixture : selectObject)(d.id); }
  cancelAnimationFrame(d.frame);
  d.frame = requestAnimationFrame(() => {
    if (Ed.dragging !== d) return;
    const q = freePoint(e), p = [q[0] + d.grab[0], q[1] + d.grab[1]], lv = level();      // p = where the middle of the thing goes
    if (d.kind === 'fixture') {
      const x = lv.fixtures.find(f => f.id === d.id);
      if (!x) return;
      previewDrag(d, 'fixture', x.attach ? { attach: attachNear(p, x.attach, x.kind === 'strip' ? x.attach.length : 0) } : { pos: [Math.round(p[0]), Math.round(p[1])] });
    } else {
      const o0 = lv.objects.find(f => f.id === d.id);
      if (!o0) return;
      // once this drag has hung it on a wall it stays there until pulled well off (no flicker as it nears or crosses a wall)
      const o = !e.altKey && d.patch?.kind === 'object' && d.patch.props.attach?.wall && !o0.attach?.wall ? { ...o0, ...d.patch.props } : o0;
      let props, note = '';
      if (o.attach?.wall) {
        // pulled well away from its wall it stands free, facing the same way (UX15); else it slides along the nearest wall
        const face = Ed.curGeo.resolveAttach({ ...o.attach, offset: o.attach.offset + o.size[0] / 2 });
        const free = face && pullOff(o, p, face.p, face.dir, { away: e.altKey ? -Infinity : 300 });   // Alt: off the wall at once, no snapping back to it
        if (free && !isHosted(o)) { props = { attach: null, ...free, z: o.z ?? 0 }; note = e.altKey ? ': off the wall, standing free (Alt)' : ': off the wall, standing free'; }
        else { props = { attach: attachNear(p, o.attach, o.size[0]) }; if (o !== o0) { props = { ...props, pos: null, rotationDeg: null }; note = `: on ${props.attach.wall} (Alt keeps it free)`; } }
      } else {
        // a free box: pos is the corner it is measured from, so its middle goes on the pointer; near a wall face it hangs on it (UX15)
        const cutPlane = resolveSettings(Ed.loc, lv).cutPlane, standing = w => hasBody(w) && wallCut(w, lv, cutPlane) !== 'above';   // not a lintel overhead
        const snap = !e.altKey && !isHosted(o) && wallSnap(p, o.size[0], o.size[1], lv.walls, Ed.curGeo.frames, { hasBody: standing });
        if (snap) { props = { attach: snap, pos: null, rotationDeg: null }; note = `: on ${snap.wall} (Alt keeps it free)`; }
        else props = { pos: boxPosForMiddle(o, p) };
      }
      previewDrag(d, 'object', props);
      setStatus(`${d.id} moved${note} (stored when you let go; Esc puts it back)`);
      return;
    }
    setStatus(`${d.id} moved (stored when you let go; Esc puts it back)`);
  });
}

/**
 * A drag frame (ui-consistency plan, UX2): the thing with `props` is drawn where it would be, without an edit
 * operation, a commit or a full redraw. Only its own group, its handles and the LED strips that follow it are
 * replaced on the plan. The props are kept on the drag and stored once, when the pointer is let go (endDrag).
 */
function previewDrag(d, kind, props) {
  d.patch = { kind, props };
  const lv = level(), coll = kind === 'object' ? 'objects' : kind === 'opening' ? 'openings' : 'fixtures';
  const thing = { ...lv[coll].find(t => t.id === d.id), ...props };
  const pv = { ...lv, [coll]: lv[coll].map(t => (t.id === d.id ? thing : t)) };
  // strips on this object follow it, and what stands in an opening follows the opening: their place comes from the level, so
  // they need the moved one; an opening also moves the gap in its wall
  const riders = kind === 'object' ? (lv.fixtures || []).filter(x => x.attach?.object === d.id) : kind === 'opening' ? (lv.fixtures || []).filter(x => x.attach?.opening === d.id) : [];
  const riderObjects = kind === 'opening' ? (lv.objects || []).filter(o => o.attach?.opening === d.id) : [];
  const geo = riders.length || kind === 'opening' ? P('geometry', () => buildLevelGeometry(pv)) : Ed.curGeo;
  const svg = $('preview'), fs = Ed.planFs;
  const swap = (sel, html) => {
    const old = svg.querySelector(sel);
    if (!old) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = html;
    old.replaceWith(...g.childNodes);
  };
  P('preview', () => {
    const key = CSS.escape(d.id);
    if (kind === 'object') { const g = objectSvg(thing, pv, geo, fs); swap(`[data-kind="object"][data-id="${key}"]`, g.body); swap(`[data-handles="${key}"]`, g.handles); }
    else if (kind === 'opening') {
      const w = pv.walls.find(x => x.id === thing.wall);
      if (w) swap(`[data-kind="wall"][data-id="${CSS.escape(w.id)}"]`, wallSvg(w, pv, geo, fs));
      swap(`[data-kind="opening"][data-id="${key}"]`, openingSvg(thing, pv, geo, fs));
      swap(`[data-handles="${key}"]`, openingHandlesSvg(pv, geo, fs));
      // the distances from the corner it is measured from follow (panelMarks reads the level it is given and the model)
      const real = Ed.model; Ed.model = { ...Ed.model, levels: Ed.model.levels.map(l => (l.id === lv.id ? pv : l)) };
      try { swap('#selMarks', `<g id="selMarks">${selectionMarks(pv, fs)}</g>`); } finally { Ed.model = real; }
    }
    else { swap(`[data-kind="fixture"][data-id="${key}"]`, fixtureSvg(thing, geo, fs)); swap(`[data-handles="${key}"]`, stripHandlesSvg(thing, geo, fs)); }
    for (const x of riders) swap(`[data-kind="fixture"][data-id="${CSS.escape(x.id)}"]`, fixtureSvg(x, geo, fs));
    for (const o of riderObjects) swap(`[data-kind="object"][data-id="${CSS.escape(o.id)}"]`, objectSvg(o, pv, geo, fs).body);
    if (kind !== 'opening') showDragDims(d, thing, pv, geo, fs);
  });
}

/**
 * Distances while a lamp, switch or object is dragged (UX12, PLANTERN §8 "Use while editing"): a free one to the nearest
 * wall face on each side, one on a wall to both ends of that wall. Drawn in their own group over the plan.
 */
function showDragDims(d, thing, lv, geo, fs) {
  const svg = $('preview');
  svg.querySelector('#dragDims')?.remove();
  let html = '';
  const a = thing.attach;
  if (a?.wall && !a.opening) {
    const w = lv.walls.find(x => x.id === a.wall), f = w && geo.frames.get(w.id);
    if (f) {
      const width = d.kind === 'send' || thing.kind === 'strip' ? a.length ?? 0 : thing.size?.[0] ?? 0, off = a.side === 'right' ? f.offR + fs * 2.6 : -(f.offL + fs * 2.6);
      for (const g of alongWallGaps(a.offset, a.offset + width, f.L)) html += dimensionSvg(pointOn(w.a, w.b, g.s0, off), pointOn(w.a, w.b, g.s1, off), { fs, text: g.distance });
    }
  } else if (!a) {
    d.segs ??= edgesOf([...Ed.curGeo.pieces.values()].flat());                // the wall bodies of the level, once per drag
    const shape = d.patch.kind === 'object' ? geo.objectFootprint(thing) : geo.fixturePos(thing);
    if (shape) for (const c of clearances(shape, d.segs)) html += dimensionSvg(c.from, c.to, { fs, text: c.distance });
  }
  if (!html) return;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'dragDims'; g.setAttribute('pointer-events', 'none');
  g.innerHTML = html;
  svg.appendChild(g);
}

/** A stairs drag frame: the stairs (and their handle) drawn where they would be, from the model with them moved. */
function previewStairs(d, st, props) {
  d.patch = { kind: 'stairs', props };
  const pm = { ...Ed.model, levels: Ed.model.levels.map(l => (l.id === Ed.levelId ? { ...l, stairs: l.stairs.map(x => (x.id === st.id ? st : x)) } : l)) };
  const geo = P('geometry', () => buildModelGeometry(pm).get(Ed.levelId)), lv = pm.levels.find(l => l.id === Ed.levelId);
  const s = stairsPlan(geo, resolveSettings(Ed.loc, lv).cutPlane).up.find(x => x.id === st.id);
  const svg = $('preview'), key = CSS.escape(st.id);
  const swap = (sel, html) => { const old = svg.querySelector(sel); if (!old) return; const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.innerHTML = html; old.replaceWith(...g.childNodes); };
  P('preview', () => { if (s) swap(`[data-kind="stairs"][data-id="${key}"]`, stairsSvg(s, lv, Ed.planFs)); swap(`[data-handles="${key}"]`, stairsHandlesSvg(lv, geo, Ed.planFs)); });
}

/** The pointer was let go: a previewed drag is stored as one edit, one undo step (Q1). */
export function endDrag(d) {
  if (!d?.patch) return;
  const { kind, props } = d.patch;
  if (kind === 'stairs') {
    const st = level().stairs.find(x => x.id === d.id), r = st && applyStairs(Ed.model, Ed.levelId, { ...st, ...props }, opts());
    if (!r || r.report.errors.length) { draw(); setStatus(`Not moved: ${r?.report.errors.join('; ') || 'the stairs are gone'}`); return; }
    commit(r.model, d.key); setStatus(`${d.id} ${d.kind === 'sturn' ? 'turned' : 'moved'} (not saved yet)`); return;
  }
  const bo = kind === 'object' && d.kind === 'oside' && level().objects.find(x => x.id === d.id);
  if (bo?.blueprint) { endBlueprintResize(d, bo, props); return; }
  const r = kind === 'object' ? setObject(Ed.model, Ed.levelId, d.id, props, opts()) : kind === 'opening' ? setOpening(Ed.model, Ed.levelId, d.id, props, opts()) : setFixture(Ed.model, Ed.levelId, d.id, props, opts());
  if (r.report.errors.length) { draw(); setStatus(`Not moved: ${r.report.errors.join('; ')}`); return; }
  commit(r.model, d.key);
  setStatus(`${d.id} ${d.kind === 'orot' ? 'turned' : d.kind === 'oedge' || d.kind === 'oside' ? 'resized' : 'moved'} (not saved yet)`);
}
/**
 * A blueprint object resized on the plan (UX13): the size is turned into the options that set it (src/blueprints/size.js), the
 * server builds it again, and the object takes the size of that build, as typing the size in its panel does.
 */
async function endBlueprintResize(d, o, props) {
  const meta = Ed.blueprints?.get(o.blueprint);
  const edit = meta && sizeEdit(meta, o, props.size);
  if (!edit?.ok) { draw(); setStatus(edit?.error || `The blueprint "${o.blueprint}" is not known here`); return; }
  setStatus(`Building ${o.id} at its new size…`);
  let built;
  try { built = await assetCache().rebuild({ ...o, params: edit.params }); }
  catch (err) { draw(); setStatus(`The build with the new size failed: ${err.message}`); return; }
  const r = setObject(Ed.model, Ed.levelId, o.id, { ...props, params: edit.params, size: built.size, light: built.light ?? null }, opts());
  if (r.report.errors.length) { draw(); setStatus(`Not resized: ${r.report.errors.join('; ')}`); return; }
  commit(r.model, d.key);
  setStatus(`${o.id}: ${edit.changed.map(c => `${c.label} ${c.to}`).join(', ')} (built again; not saved yet)`);
}
/** Esc during a drag: nothing is stored and the plan shows the thing where it was. */
export function cancelDrag() {
  const d = Ed.dragging;
  if (!d) return false;
  cancelAnimationFrame(d.frame);
  Ed.dragging = null; Ed.suppressClick = !!d.moved;
  if (d.kind === 'room' || d.kind === 'corner' || d.kind === 'wall' || d.kind === 'wallend') return false;   // those fill the form: Revert puts them back
  draw();
  setStatus('Drag cancelled: nothing changed');
  return true;
}
