import { toSvg, fromSvg, svgPoints } from './coords.js';
import { occluders, labelObstacles } from '../geometry/level.js';
import { visibility } from '../geometry/visibility.js';
import { roomNameLayout } from '../geometry/polygon.js';
import { openingSymbol, arcPathSvg } from '../geometry/openings.js';
import { sideStrips, wallCut } from '../geometry/walls.js';
import { resolveSide } from '../model/materials.js';
import { solidStretches, paintStrip } from '../geometry/solids.js';
import { solidCircle } from '../geometry/circle.js';
import { wallLookPieces } from '../geometry/paint.js';
import { stairsPlan } from '../geometry/stairs.js';
import { stripSamples } from '../geometry/strip.js';

const NS = 'http://www.w3.org/2000/svg';
export const el = (t, a = {}, parent) => {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, a[k]);
  if (parent) parent.appendChild(e);
  return e;
};

/** A strip's many overlapping glows are each dimmer than a lamp's, so they add up to about one lamp's light. */
const STRIP_GLOW = 0.55;
const OPENING_STYLE = { window: { stroke: '#6cb6ff' }, door: { stroke: '#e0a060' }, passage: { stroke: '#8b93a1' } };

/**
 * SVG plan renderer + pan/zoom. Reads only derived geometry (buildLevelGeometry), never computes its own.
 * hooks: { onFixtureClick(fx, ev), onTap(ev), onHover(ev), onView(), interactive }
 * interactive: false = no pan/zoom (and the page keeps its scroll), for a plan inside a dashboard card.
 */
export function createPlanView(svg, hooks = {}) {
  const vb = { x: 0, y: 0, w: 1, h: 1 };
  let fixEls = {}, lightEls = {}, overlay = null, bounds = null;

  const pxScale = () => vb.w / (svg.clientWidth || 1);
  function setVB() {
    vb.h = vb.w * (svg.clientHeight || 1) / (svg.clientWidth || 1);
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    hooks.onView?.();
  }
  function fit() {
    const b = bounds || { minx: -1000, maxx: 5000, miny: -1000, maxy: 5000 }, m = 900;
    const minx = b.minx - m, maxx = b.maxx + m, miny = b.miny - m, maxy = b.maxy + m;
    const ar = (svg.clientWidth || 1) / (svg.clientHeight || 1);
    vb.w = Math.max(maxx - minx, (maxy - miny) * ar);
    vb.h = vb.w / ar;
    vb.x = (minx + maxx) / 2 - vb.w / 2;
    vb.y = -(miny + maxy) / 2 - vb.h / 2;
    setVB();
  }
  /** Event → plan coordinates (mm). */
  function planPt(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return fromSvg([q.x, q.y]);
  }

  function render({ level, geo, settings, fixtureLabel = fx => fx.id, materials = {}, assetStatus = () => 'unknown' }) {
    svg.replaceChildren();
    fixEls = {}; lightEls = {};
    const defs = el('defs', {}, svg), layer = id => el('g', { id }, svg);
    const gFloor = layer('floor'), gLight = layer('light'), gObj = layer('objects'), gWall = layer('walls'), gFix = layer('fixtures');
    overlay = layer('overlay');
    const all = [];
    if (!level) {
      el('text', { x: 2000, y: -2000, 'text-anchor': 'middle', 'font-size': 260, fill: '#5d6573' }, gFloor).textContent = 'No levels in this model yet';
      bounds = null; fit(); return;
    }

    for (const r of level.rooms || []) {
      // no floor (open to the level below): darker, outline dashed
      el('polygon', { points: svgPoints(r.polygon), fill: r.floor === 'none' ? '#1a1d22' : r.exterior ? '#20252b' : '#262a31', ...(r.floor === 'none' ? { stroke: '#5d6573', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 4' } : {}) }, gFloor);
      all.push(...r.polygon);
      // the name where the room is widest, sized to fit (two lines when that is bigger)
      const lay = roomNameLayout(r.polygon, r.name || r.id, { avoid: labelObstacles(level, geo) }), c = toSvg(lay.pos);
      const t = el('text', { x: c[0], y: c[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': lay.size, fill: '#5d6573', class: 'lbl' }, gFloor);
      lay.lines.forEach((line, k) => { el('tspan', { x: c[0], dy: k ? '1.25em' : `${-(lay.lines.length - 1) * 0.625}em` }, t).textContent = line; });
      el('title', {}, t).textContent = [r.floor === 'none' ? 'open to the level below' : '', r.floorOffset ? `floor ${r.floorOffset > 0 ? '+' : ''}${r.floorOffset} mm` : '', r.ceilingHeight ? `ceiling ${r.ceilingHeight} mm` : ''].filter(Boolean).join(' · ') || (r.name || r.id);
    }
    // stairs going up from here (steps above the cut plane only outlined, dashed) and, dimmed in the opening in the floor, the ones arriving from below
    const sp = stairsPlan(geo, settings.cutPlane);
    for (const h of sp.down) {
      const cid = `clip_${h.id}_${gFloor.childNodes.length}`;
      el('polygon', { points: svgPoints(h.poly), fill: '#14161a', stroke: '#6b7482', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 4' }, gFloor);
      const cp = el('clipPath', { id: cid }, defs);
      el('polygon', { points: svgPoints(h.poly) }, cp);
      const g = el('g', { 'clip-path': `url(#${cid})`, opacity: 0.4 }, gFloor);
      for (const p of h.steps) el('polygon', { points: svgPoints(p), fill: '#2b303a', stroke: '#8b93a1', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, g);
      if (h.arrow.length > 1) el('polyline', { points: svgPoints(h.arrow), fill: 'none', stroke: '#c9d1de', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, g);
      if (h.head) el('polygon', { points: svgPoints(h.head), fill: '#c9d1de' }, g);
    }
    for (const s of sp.up) {
      const g = el('g', { class: 'stairs', 'data-id': s.id }, gFloor);
      for (const st of s.steps) { all.push(...st.poly); el('polygon', st.above ? { points: svgPoints(st.poly), fill: 'none', stroke: '#7d8594', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 4' } : { points: svgPoints(st.poly), fill: '#3a404b', stroke: '#9aa3b2', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, g); }
      if (s.arrow.length > 1) el('polyline', { points: svgPoints(s.arrow), fill: 'none', stroke: '#e6ebf3', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, g);
      if (s.head) el('polygon', { points: svgPoints(s.head), fill: '#e6ebf3' }, g);
    }
    for (const w of level.walls || []) {
      for (const poly of geo.pieces.get(w.id) || []) {
        all.push(...poly);
        const fill = w.kind === 'railing' ? '#6d7480' : '#aab0bb';
        // above the plan's cut height (a lintel): dashed and see-through, like a wall cabinet
        const cut = wallCut(w, level, settings.cutPlane);
        if (cut === 'above') { el('polygon', { points: svgPoints(poly), fill, 'fill-opacity': 0.3, stroke: fill, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 4' }, gWall); continue; }
        // Stroke in the fill colour hides anti-aliasing seams between joined pieces. A half-height wall (its top
        // below the cut plane) is seen from above, not cut: lighter, with its outline
        if (cut === 'low' && w.kind === 'wall') el('polygon', { points: svgPoints(poly), fill, 'fill-opacity': 0.4, stroke: fill, 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, gWall);
        else el('polygon', { points: svgPoints(poly), fill, stroke: fill, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, gWall);
        // each side's own colour (or its material's, or a room's: roomSides) as a strip along that face
        for (const lp of wallLookPieces(w, geo.frames.get(w.id), [poly], level.rooms)) {
          const strips = sideStrips(lp.poly, w.thickness);
          for (const side of ['left', 'right']) {
            const look = resolveSide(lp[side], materials);
            if (look?.color) el('polygon', { points: svgPoints(strips[side]), fill: look.color }, gWall);
          }
        }
      }
      if (w.kind === 'virtual') {
        const a = toSvg(w.a), b = toSvg(w.b);
        el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#3a404b', 'stroke-width': 1, 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke' }, gWall);
      }
    }
    // openings: door leaf and swing, window frame (and leaf when it is side-hung), passage faces dashed
    for (const o of level.openings || []) {
      const w = geo.wallById.get(o.wall);
      if (!w) continue;
      const sym = openingSymbol(w, geo.frames.get(w.id), o), color = OPENING_STYLE[o.type]?.stroke || '#8b93a1';
      const line = ([p, q], dash) => { const [a, b] = [toSvg(p), toSvg(q)]; el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', ...(dash ? { 'stroke-dasharray': '4 3' } : {}) }, gWall); };
      sym.lines.forEach(l => line(l, false));
      sym.dashed.forEach(l => line(l, true));
      for (const arc of sym.arcs) el('path', { d: arcPathSvg(toSvg(arc.c), arc.r, toSvg(arc.from), toSvg(arc.to)), fill: 'none', stroke: color, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': arc.dashed ? '4 3' : '3 2' }, gWall);
    }
    for (const s of level.solids || []) {
      // above the plan's cut height (a beam, a lintel): dashed, like a wall cabinet
      const above = (s.base ?? 0) >= settings.cutPlane;
      const style = { fill: s.color || '#6b4f3a', 'fill-opacity': above ? 0.35 : 1, stroke: '#999', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', ...(above ? { 'stroke-dasharray': '6 4' } : {}) }, circle = solidCircle(s);
      if (circle) { const [cx, cy] = toSvg(circle.center); el('circle', { cx, cy, r: circle.diameter / 2, ...style }, gObj); }   // a round pillar: the true circle
      else el('polygon', { points: svgPoints(s.polygon), ...style }, gObj);
      // painted per room: a strip along each stretch of face that room sees
      if (s.sides) for (const st of solidStretches(s, level.rooms)) {
        const look = resolveSide(s.sides[st.room], materials);
        if (look?.color) el('polygon', { points: svgPoints(paintStrip(st)), fill: look.color, 'pointer-events': 'none' }, gObj);
      }
    }
    for (const o of level.objects || []) {
      const fp = geo.objectFootprint(o);
      if (!fp) continue;
      const above = (o.z ?? 0) >= settings.cutPlane;
      // an asset whose model is missing is drawn in red, dashed, so it is seen and fixed (decision 146)
      const missing = o.kind === 'asset' && ['missing', 'broken'].includes(assetStatus(o.asset));
      const colour = missing ? '#b00020' : o.color || '#888';
      const shape = el('polygon', { points: svgPoints(fp), fill: colour, 'fill-opacity': missing ? 0.2 : 0.25, stroke: colour, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': above || missing ? '6 4' : '' }, gObj);
      if (o.kind === 'asset') el('title', {}, shape).textContent = missing ? `${o.name || o.id}: model "${o.asset}" is missing` : `${o.name || o.id}: model "${o.asset}"`;
    }

    const occ = occluders(geo, { cutPlane: settings.cutPlane });
    for (const fx of level.fixtures || []) {
      const c = geo.fixturePos(fx);
      if (!c) continue;
      if (fx.kind === 'strip') { drawStrip(fx, geo.fixtureLine(fx), fixtureLabel, defs, gFix, gLight, occ); continue; }
      const s = toSvg(c), g = el('g', { class: 'fix', transform: `translate(${s[0]} ${s[1]})` }, gFix);
      el('title', {}, g).textContent = fixtureLabel(fx);
      fixEls[fx.id] = fx.kind === 'lamp' ? el('circle', { r: 120 }, g) : el('rect', { x: -90, y: -90, width: 180, height: 180, rx: 30 }, g);
      g.addEventListener('click', ev => hooks.onFixtureClick?.(fx, ev));
      if (fx.kind === 'lamp' && fx.radius) {
        const gr = el('radialGradient', { id: 'g_' + fx.id, gradientUnits: 'userSpaceOnUse', cx: s[0], cy: s[1], r: fx.radius }, defs);
        lightEls[fx.id] = {
          stops: [0, 0.45, 1].map(o => el('stop', { offset: o }, gr)),
          path: el('polygon', { points: svgPoints(visibility(c, fx.radius, occ)), fill: `url(#g_${fx.id})`, style: 'mix-blend-mode:screen' }, gLight),
        };
      }
      setFixture(fx.id, { available: false, on: false, brightness: 0, rgb: [255, 214, 170] });
    }
    bounds = all.length ? {
      minx: Math.min(...all.map(p => p[0])), maxx: Math.max(...all.map(p => p[0])),
      miny: Math.min(...all.map(p => p[1])), maxy: Math.max(...all.map(p => p[1])),
    } : null;
    fit();
  }

  /** Update one fixture from its appearance ({ available, on, brightness, rgb }). Touches only that fixture. */
  /**
   * An LED strip (decision 121): a line along its polyline, and a glow that is the union of the light of sample points along it
   * (each one a lamp-like visibility polygon with the strip's radius), so the light stops at walls and spreads along the line.
   */
  function drawStrip(fx, line, fixtureLabel, defs, gFix, gLight, occ) {
    if (!line) return;
    const pts = svgPoints(line), g = el('g', { class: 'fix' }, gFix);
    el('title', {}, g).textContent = fixtureLabel(fx);
    el('polyline', { points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': 300, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);   // the part to click
    fixEls[fx.id] = el('polyline', { points: pts, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' }, g);
    if (fx.radius) {
      const group = el('g', {}, gLight), stops = [];
      stripSamples(line).forEach((c, i) => {
        const s = toSvg(c), gr = el('radialGradient', { id: `g_${fx.id}_${i}`, gradientUnits: 'userSpaceOnUse', cx: s[0], cy: s[1], r: fx.radius }, defs);
        for (const o of [0, 0.45, 1]) stops.push(el('stop', { offset: o }, gr));
        el('polygon', { points: svgPoints(visibility(c, fx.radius, occ)), fill: `url(#g_${fx.id}_${i})`, style: 'mix-blend-mode:screen' }, group);
      });
      lightEls[fx.id] = { stops, path: group, k: STRIP_GLOW };
    }
    setFixture(fx.id, { available: false, on: false, brightness: 0, rgb: [255, 214, 170] });
  }

  function setFixture(id, a) {
    const sh = fixEls[id];
    if (!sh) return;
    const col = `rgb(${a.rgb.join(',')})`;
    if (sh.tagName === 'polyline') {                                  // an LED strip: a line
      sh.setAttribute('stroke', !a.available ? '#e5534b' : a.on ? col : '#4a505a');
      sh.setAttribute('stroke-width', 60);
      sh.setAttribute('stroke-dasharray', a.available ? '' : '120 90');
    } else {
      sh.setAttribute('fill', !a.available ? 'none' : a.on ? col : '#4a505a');
      sh.setAttribute('stroke', !a.available ? '#e5534b' : a.on ? '#fff' : '#8b93a1');
      sh.setAttribute('stroke-width', 24);
      sh.setAttribute('stroke-dasharray', a.available ? '' : '40 30');
    }
    const le = lightEls[id];
    if (le) {
      le.path.style.display = a.on ? '' : 'none';
      le.stops.forEach((s, i) => { s.setAttribute('stop-color', col); s.setAttribute('stop-opacity', [0.9, 0.5, 0][i % 3] * a.brightness * (le.k ?? 1)); });
    }
  }

  // pan / zoom / tap
  if (hooks.interactive !== false) {
    let drag = null;
    svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false, id: e.pointerId }; });
    svg.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; svg.setPointerCapture(drag.id); }
        if (drag.moved) { vb.x = drag.vx - dx * pxScale(); vb.y = drag.vy - dy * pxScale(); setVB(); return; }
      }
      hooks.onHover?.(e);
    });
    svg.addEventListener('pointerup', e => { const was = drag; drag = null; if (was && !was.moved) hooks.onTap?.(e); });
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const p = toSvg(planPt(e)), f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      vb.x = p[0] - (p[0] - vb.x) * f; vb.y = p[1] - (p[1] - vb.y) * f; vb.w *= f;
      setVB();
    }, { passive: false });
  }
  addEventListener('resize', setVB);

  return { render, setFixture, planPt, pxScale, overlay: () => overlay, fit };
}
