// Editor page: turning a camera or access point by dragging its round handle on the plan (docs/plans/devices.md DV9). The
// bearing follows the pointer (snapping to whole degrees, Shift: to 15°) and is stored on release as one undo step, like the
// Editor's other drags.

import { toSvg } from '../../render2d/coords.js';
import { bearingFromHeading, headingFromBearing, northAngleOf } from '../../model/orientation.js';
import { isDevice } from '../../model/devices.js';
import { setFixture } from '../../edit/ops.js';
import { $, commit, level, opts } from './core.js';
import { setStatus } from './session.js';
import { Ed } from './state.js';

/** The direction line of a camera (all of them) and, for the selected device with a bearing, the handle to turn it. */
export function bearingSvg(x, P, fs, selected) {
  if (!isDevice(x) || !Number.isFinite(x.bearing)) return '';
  const h = headingFromBearing(x.bearing, northAngleOf(Ed.model)) * Math.PI / 180, at = r => toSvg([P[0] + Math.cos(h) * r, P[1] + Math.sin(h) * r]);
  const [cx, cy] = toSvg(P), [lx, ly] = at(fs * 2.2), [hx, hy] = at(fs * 4);
  let out = `<line x1="${cx}" y1="${cy}" x2="${lx}" y2="${ly}" stroke="${selected ? '#ffb454' : '#ff8a5b'}" stroke-width="${fs / 6}" stroke-linecap="round" pointer-events="none"/>`;
  if (selected) out += `<line x1="${lx}" y1="${ly}" x2="${hx}" y2="${hy}" stroke="#ffb454" stroke-width="${fs / 12}" stroke-dasharray="${fs / 3} ${fs / 4}" pointer-events="none"/><circle data-bearing="${x.id}" cx="${hx}" cy="${hy}" r="${fs * 0.6}" fill="#ffb454" stroke="#14161a" stroke-width="${fs / 8}" style="cursor:grab"><title>Drag to turn it (Shift: 15° steps)</title></circle>`;
  return out;
}

const planPointOf = e => { const svg = $('preview'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, -q.y]; };

/** Pointer down on a bearing handle (listened to before the plan's own drag and pan). True when it is ours. */
export function bearingDown(e) {
  const h = e.button === 0 && e.target.closest?.('[data-bearing]');
  if (!h) return false;
  const fx = (level().fixtures || []).find(f => f.id === h.dataset.bearing), P = fx && Ed.curGeo?.fixturePos(fx);
  if (!P) return false;
  e.preventDefault(); e.stopPropagation();
  let bearing = fx.bearing, frame = 0;
  const move = ev => {
    const q = planPointOf(ev), step = ev.shiftKey ? 15 : 1;
    const b = bearingFromHeading(Math.atan2(q[1] - P[1], q[0] - P[0]) * 180 / Math.PI, northAngleOf(Ed.model));
    bearing = (Math.round(b / step) * step) % 360;
    $('xBearing').value = String(bearing);
    setStatus(`Looks towards ${bearing}° (release to keep it)`);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { const [hx, hy] = toSvg([P[0] + Math.cos(headingFromBearing(bearing, northAngleOf(Ed.model)) * Math.PI / 180) * Ed.planFs * 4, P[1] + Math.sin(headingFromBearing(bearing, northAngleOf(Ed.model)) * Math.PI / 180) * Ed.planFs * 4]); h.setAttribute('cx', hx); h.setAttribute('cy', hy); });
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    Ed.suppressClick = true; setTimeout(() => { Ed.suppressClick = false; }, 350);
    if (bearing === fx.bearing) return;
    const r = setFixture(Ed.model, Ed.levelId, fx.id, { bearing }, opts());
    if (r.report.errors.length) { setStatus(r.report.errors.join('; ')); return; }
    commit(r.model);
    setStatus(`${fx.name || fx.id} looks towards ${bearing}° (not saved yet)`);
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  return true;
}
