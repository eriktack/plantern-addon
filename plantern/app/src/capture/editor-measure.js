// The Editor's measuring tool (PLANTERN.md §8): point – point (with the right triangle's legs),
// point – plane and plane – plane on the Editor's plan. Points come from collectSnapPoints() and
// planes (wall faces, room edges, faces of solids) from collectSnapLines(); the numbers from
// tools/measure-core.js. This module only handles the pointer and draws on top of the plan.

import { toSvg, fromSvg } from '../render2d/coords.js';
import { sub, add, mul } from '../geometry/vec.js';
import { pointToPoint, pointToLine, lineToLine, otherLeg, nearestPoint, nearestLine } from '../tools/measure-core.js';

const NS = 'http://www.w3.org/2000/svg';
const MODES = { pp: 'Point – point', pl: 'Point – plane', ll: 'Plane – plane' };
const mm = v => `${Math.round(v)} mm`;

/**
 * ctx: { svg, dom: { btn, modes, read }, snaps() → snap points, lines() → snap lines, name(ref) → text,
 *        onChange(on) } — the page redraws the plan itself and calls draw() after it.
 */
export function createEditorMeasure(ctx) {
  const { svg, dom } = ctx;
  let on = false, mode = 'pp', picks = [], hover = null;
  const needs = () => (mode === 'pp' ? 'point' : mode === 'pl' ? (picks.length % 2 === 0 ? 'point' : 'line') : 'line');
  const scale = () => { const m = svg.getScreenCTM(); return m ? 1 / Math.abs(m.a) : 1; };       // mm per screen pixel
  function planPt(e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return fromSvg([q.x, q.y]);
  }
  /** What is under the pointer for the next pick: a snap point (or a free point with Alt), or a plane. */
  function find(e) {
    const p = planPt(e), k = scale();
    if (needs() === 'point') {
      const s = e.altKey ? null : nearestPoint(p, ctx.snaps(), 14 * k);
      return s ? { type: 'point', ref: s.ref, pos: s.pos, kind: s.kind } : { type: 'point', pos: p, kind: 'free point' };
    }
    const l = nearestLine(p, ctx.lines(), 12 * k);
    return l ? { type: 'line', ...l } : null;
  }

  function setOn(v) {
    on = v; picks = []; hover = null;
    dom.btn.classList.toggle('on', on);
    dom.modes.hidden = !on;
    svg.classList.toggle('measuring', on);
    ctx.onChange?.(on);
    draw(); readout();
  }
  function setMode(m) {
    mode = m; picks = []; hover = null;
    dom.modes.querySelectorAll('[data-mm]').forEach(b => b.classList.toggle('on', b.dataset.mm === m));
    draw(); readout();
  }
  dom.btn.onclick = () => setOn(!on);
  dom.modes.querySelectorAll('[data-mm]').forEach(b => (b.onclick = () => setMode(b.dataset.mm)));

  function result() {
    if (picks.length < 2) return null;
    const [x, y] = picks.slice(-2);
    return mode === 'pp' ? pointToPoint(x.pos, y.pos) : mode === 'pl' ? pointToLine(x.pos, y) : lineToLine(x, y);
  }

  // ---- drawing (on top of the plan, plan mm; sizes in screen pixels × k) ----
  function draw() {
    svg.querySelector('#mOverlay')?.remove();
    if (!on) return;
    const k = scale(), g = document.createElementNS(NS, 'g');
    g.id = 'mOverlay'; g.setAttribute('pointer-events', 'none');
    const add_ = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v); if (text !== undefined) e.textContent = text; g.appendChild(e); return e; };
    const line = (a, b, color, w = 2, dash = null) => { const [p, q] = [toSvg(a), toSvg(b)]; add_('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: color, 'stroke-width': w * k, ...(dash ? { 'stroke-dasharray': `${dash[0] * k} ${dash[1] * k}` } : {}), 'stroke-linecap': 'round' }); };
    const dot = (p, color, r = 5) => { const s = toSvg(p); add_('circle', { cx: s[0], cy: s[1], r: r * k, fill: 'none', stroke: color, 'stroke-width': 2 * k }); };
    const label = (p, text, color = '#ffb454', dy = -8) => { const s = toSvg(p); add_('text', { x: s[0], y: s[1] + dy * k, 'text-anchor': 'middle', 'font-size': 13 * k, fill: color, 'paint-order': 'stroke', stroke: '#14161a', 'stroke-width': 4 * k, 'font-weight': 600 }, text); };
    const mid = (a, b) => add(a, mul(sub(b, a), 0.5));
    const show = (it, color) => it.type === 'point' ? dot(it.pos, color) : line(it.a, it.b, color, 5);

    const done = picks.length >= 2;
    for (const it of done ? picks.slice(-2) : picks) show(it, '#4cc38a');
    if (hover && !done) show(hover, '#ffb454');
    const r = result();
    if (!r) {
      // the first pick and the pointer: a live preview for point – point
      if (mode === 'pp' && picks.length === 1 && hover) { line(picks[0].pos, hover.pos, '#ffb454', 2, [6, 4]); label(mid(picks[0].pos, hover.pos), mm(pointToPoint(picks[0].pos, hover.pos).dist)); }
    } else if (r.kind === 'pp') {
      // the diagonal and the triangle's legs along x and y
      line(r.a, r.b, '#ffb454', 2.5);
      if (r.dx > 1 && r.dy > 1) {
        line(r.a, r.corner, '#6cb6ff', 1.5, [5, 4]); line(r.corner, r.b, '#6cb6ff', 1.5, [5, 4]);
        label(mid(r.a, r.corner), `Δx ${mm(r.dx)}`, '#6cb6ff', r.b[1] > r.a[1] ? 16 : -8);
        label(mid(r.corner, r.b), `Δy ${mm(r.dy)}`, '#6cb6ff', 4);
      }
      label(mid(r.a, r.b), mm(r.dist));
    } else if (r.kind === 'pl') {
      if (!r.onSegment) line(r.along < 0 ? r.line.a : r.line.b, r.foot, '#4cc38a', 1.5, [3, 4]);   // the plane extended
      line(r.p, r.foot, '#ffb454', 2.5); dot(r.foot, '#ffb454', 3);
      label(mid(r.p, r.foot), mm(r.dist));
    } else if (r.parallel) {
      line(r.at[0], r.at[1], '#ffb454', 2.5);
      label(mid(r.at[0], r.at[1]), mm(r.dist));
    } else {
      label(mid(r.l2.a, r.l2.b), `${r.angle.toFixed(1)}° off parallel`);
    }
    svg.appendChild(g);
  }

  // ---- the numbers, in the box on the plan ----
  function readout() {
    dom.read.hidden = !on;
    if (!on) return;
    const name = it => it.ref ? ctx.name(it.ref) : `free point (${Math.round(it.pos[0])}, ${Math.round(it.pos[1])})`;
    const r = result();
    const ask = { point: 'a point (corner, wall end, opening edge…; Alt = anywhere)', line: 'a plane (a wall face, a room edge or a side of a solid)' }[needs()];
    if (!r) { dom.read.innerHTML = `<b>${MODES[mode]}</b><br>Click ${picks.length ? 'the second' : 'the first'}: ${ask}. Esc stops.`; return; }
    const clearHint = '<br><small>Click anywhere to clear it, Esc to stop measuring.</small>';
    const [x, y] = picks.slice(-2);
    let t = `<b>${MODES[mode]}</b> · ${name(x)} → ${name(y)}<br>`;
    if (r.kind === 'pp') {
      t += `<span class="big">${mm(r.dist)}</span>`;
      if (r.dx > 1 && r.dy > 1) {
        t += ` &nbsp; right triangle: Δx ${mm(r.dx)} · Δy ${mm(r.dy)}`;
        t += `<div class="calc">Diagonal measured for real <input id="mDiag" inputmode="numeric" placeholder="mm" autocomplete="off"> <span id="mLegs"></span></div>`;
      } else t += ` &nbsp; (straight along ${r.dx > 1 ? 'x' : 'y'})`;
    } else if (r.kind === 'pl') {
      t += `<span class="big">${mm(r.dist)}</span> square to the plane; the foot is ${mm(r.along)} along it from its start${r.onSegment ? '' : ' (beyond its end: the plane extended)'}`;
    } else if (r.parallel) {
      t += `<span class="big">${mm(r.dist)}</span> between the planes${r.overlap > 1 ? `, facing each other over ${mm(r.overlap)}` : ' (they do not face each other: measured across the extension)'}${r.angle > 0.05 ? `; ${r.angle.toFixed(2)}° from exactly parallel` : ''}`;
    } else {
      t += `Not parallel: <span class="big">${r.angle.toFixed(1)}°</span> apart; the second plane's ends are ${mm(r.ends[0])} and ${mm(r.ends[1])} from the first`;
    }
    // two snap points: keep the distance measured for real as a check (model.checks), saved with the house
    if (r.kind === 'pp' && x.ref && y.ref && ctx.onPin) t += `<div class="calc">Measured for real <input id="mPin" inputmode="numeric" placeholder="mm" autocomplete="off"> <button id="mPinBtn">Keep as check</button></div>`;
    dom.read.innerHTML = t + clearHint;
    const pin = dom.read.querySelector('#mPinBtn');
    if (pin) pin.onclick = ev => { ev.stopPropagation(); const v = Number(dom.read.querySelector('#mPin').value); if (v > 0) ctx.onPin(x.ref, y.ref, v); };
    const diag = dom.read.querySelector('#mDiag');
    if (diag) diag.oninput = () => {
      const D = Number(diag.value);
      if (!(D > 0)) { dom.read.querySelector('#mLegs').textContent = ''; return; }
      const a = otherLeg(D, r.dx), b = otherLeg(D, r.dy);
      dom.read.querySelector('#mLegs').innerHTML = `→ if Δx is right, Δy is <b>${a === null ? '–' : mm(a)}</b>; if Δy is right, Δx is <b>${b === null ? '–' : mm(b)}</b> <small>(model ${mm(r.dist)}, ${D - r.dist > 0 ? '+' : ''}${Math.round(D - r.dist)} mm)</small>`;
    };
  }

  return {
    isOn: () => on,
    setOn,
    toggle: () => setOn(!on),
    /** Esc: clear the picks, or stop measuring when there are none. */
    escape() { if (picks.length) { picks = []; hover = null; draw(); readout(); } else setOn(false); },
    /** A click on the plan; true when the tool used it (then nothing gets selected). */
    click(e) {
      if (!on) return false;
      // a finished measurement: the next click only clears it (then click again to start a new one)
      if (picks.length >= 2) { picks = []; hover = find(e); draw(); readout(); return true; }
      const it = find(e);
      if (!it) return true;
      picks.push(it); hover = null;
      draw(); readout();
      return true;
    },
    hover(e) { if (!on) return; hover = find(e); draw(); },
    /** Show a measurement between two snap points (a check picked in the list). */
    show(a, b) { if (!on) setOn(true); if (mode !== 'pp') setMode('pp'); picks = [{ type: 'point', ...a }, { type: 'point', ...b }]; hover = null; draw(); readout(); },
    draw,
  };
}
