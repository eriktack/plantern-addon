import { toSvg, fromSvg, svgPoints } from './coords.js';
import { DARK_PALETTE } from './palette.js';
import { occluders, labelObstacles } from '../geometry/level.js';
import { visibility } from '../geometry/visibility.js';
import { roomNameLayout } from '../geometry/polygon.js';
import { openingSymbol, arcPathSvg } from '../geometry/openings.js';
import { sideStrips, wallCut } from '../geometry/walls.js';
import { resolveSide } from '../model/materials.js';
import { doorOpen } from '../model/doors.js';
import { lockOf, padlockLook } from '../ha/door.js';
import { drawPadlock } from './padlock.js';
import { solidStretches, paintStrip } from '../geometry/solids.js';
import { solidCircle } from '../geometry/circle.js';
import { wallLookPieces } from '../geometry/paint.js';
import { stairsPlan } from '../geometry/stairs.js';
import { stripSamples } from '../geometry/strip.js';
import { assetKey } from '../model/assets.js';

const NS = 'http://www.w3.org/2000/svg';
export const el = (t, a = {}, parent) => {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, a[k]);
  if (parent) parent.appendChild(e);
  return e;
};

/** The lamp symbol in the plan: a light bulb about 220 mm tall, centred on the lamp (globe, neck, two lines for the base). */
const BULB_PATH = 'M -46 52 C -118 12 -102 -104 0 -104 C 102 -104 118 12 46 52 Z M -40 74 H 40 M -28 96 H 28';

/** A strip's many overlapping glows are each dimmer than a lamp's, so they add up to about one lamp's light. */
const STRIP_GLOW = 0.55;
const PADLOCK_MM = 260;                 // width of a door's padlock in the plan
/**
 * SVG plan renderer + pan/zoom. Reads only derived geometry (buildLevelGeometry), never computes its own.
 * hooks: { onFixtureClick(fx, ev), onTap(ev), onHover(ev), onView(), interactive, palette (render2d/palette.js; default dark) }
 * interactive: false = no pan/zoom (and the page keeps its scroll), for a plan inside a dashboard card.
 */
export function createPlanView(svg, hooks = {}) {
  const palette = hooks.palette || DARK_PALETTE;     // the colours of the plan (render2d/palette.js)
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

  function render({ level, geo, settings, fixtureLabel = fx => fx.id, materials = {}, assetStatus = () => 'unknown', assetColour = () => null, doorStates = null }) {
    svg.replaceChildren();
    fixEls = {}; lightEls = {};
    const defs = el('defs', {}, svg), layer = id => el('g', { id }, svg);
    const gFloor = layer('floor'), gLight = layer('light'), gObj = layer('objects'), gWall = layer('walls'), gFix = layer('fixtures');
    overlay = layer('overlay');
    const all = [];
    if (!level) {
      el('text', { x: 2000, y: -2000, 'text-anchor': 'middle', 'font-size': 260, fill: palette.label }, gFloor).textContent = 'No levels in this model yet';
      bounds = null; fit(); return;
    }

    for (const r of level.rooms || []) {
      // no floor (open to the level below): darker, outline dashed
      el('polygon', { points: svgPoints(r.polygon), fill: r.floor === 'none' ? palette.floorNone : r.exterior ? palette.floorExterior : palette.floor, ...(r.floor === 'none' ? { stroke: palette.floorNoneOutline, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 4' } : {}) }, gFloor);
      all.push(...r.polygon);
      // the name where the room is widest, sized to fit (two lines when that is bigger)
      const lay = roomNameLayout(r.polygon, r.name || r.id, { avoid: labelObstacles(level, geo) }), c = toSvg(lay.pos);
      const t = el('text', { x: c[0], y: c[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': lay.size, fill: palette.label, class: 'lbl' }, gFloor);
      lay.lines.forEach((line, k) => { el('tspan', { x: c[0], dy: k ? '1.25em' : `${-(lay.lines.length - 1) * 0.625}em` }, t).textContent = line; });
      el('title', {}, t).textContent = [r.floor === 'none' ? 'open to the level below' : '', r.floorOffset ? `floor ${r.floorOffset > 0 ? '+' : ''}${r.floorOffset} mm` : '', r.ceilingHeight ? `ceiling ${r.ceilingHeight} mm` : ''].filter(Boolean).join(' · ') || (r.name || r.id);
    }
    // stairs going up from here (steps above the cut plane only outlined, dashed) and, dimmed in the opening in the floor, the ones arriving from below
    const sp = stairsPlan(geo, settings.cutPlane);
    for (const h of sp.down) {
      const cid = `clip_${h.id}_${gFloor.childNodes.length}`;
      el('polygon', { points: svgPoints(h.poly), fill: palette.downBg, stroke: palette.downOutline, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 4' }, gFloor);
      const cp = el('clipPath', { id: cid }, defs);
      el('polygon', { points: svgPoints(h.poly) }, cp);
      const g = el('g', { 'clip-path': `url(#${cid})`, opacity: 0.4 }, gFloor);
      for (const p of h.steps) el('polygon', { points: svgPoints(p), fill: palette.downStep, stroke: palette.downStepStroke, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, g);
      if (h.arrow.length > 1) el('polyline', { points: svgPoints(h.arrow), fill: 'none', stroke: palette.downArrow, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, g);
      if (h.head) el('polygon', { points: svgPoints(h.head), fill: palette.downArrow }, g);
    }
    for (const s of sp.up) {
      const g = el('g', { class: 'stairs', 'data-id': s.id }, gFloor);
      for (const st of s.steps) { all.push(...st.poly); el('polygon', st.above ? { points: svgPoints(st.poly), fill: 'none', stroke: palette.upAboveOutline, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 4' } : { points: svgPoints(st.poly), fill: palette.upStep, stroke: palette.upStepStroke, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, g); }
      if (s.arrow.length > 1) el('polyline', { points: svgPoints(s.arrow), fill: 'none', stroke: palette.upArrow, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }, g);
      if (s.head) el('polygon', { points: svgPoints(s.head), fill: palette.upArrow }, g);
    }
    for (const w of level.walls || []) {
      for (const poly of geo.pieces.get(w.id) || []) {
        all.push(...poly);
        const fill = w.kind === 'railing' ? palette.wallRailing : palette.wall;
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
        el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: palette.wallVirtual, 'stroke-width': 1, 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke' }, gWall);
      }
    }
    // openings: door leaf and swing, window frame (and leaf when it is side-hung), passage faces dashed
    for (const o of level.openings || []) {
      const w = geo.wallById.get(o.wall);
      if (!w) continue;
      const sym = openingSymbol(w, geo.frames.get(w.id), o, { open: doorOpen(o, doorStates) }), color = palette.opening[o.type] || palette.opening.passage;
      const line = ([p, q], dash) => { const [a, b] = [toSvg(p), toSvg(q)]; el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', ...(dash ? { 'stroke-dasharray': '4 3' } : {}) }, gWall); };
      sym.lines.forEach(l => line(l, false));
      sym.dashed.forEach(l => line(l, true));
      for (const arc of sym.arcs) el('path', { d: arcPathSvg(toSvg(arc.c), arc.r, toSvg(arc.from), toSvg(arc.to)), fill: 'none', stroke: color, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': arc.dashed ? '4 3' : '3 2' }, gWall);
    }
    // a door's lock from Home Assistant: a padlock on the door, on top of everything
    for (const o of level.openings || []) {
      const state = lockOf(doorStates, o), line = state !== undefined && geo.openingLine(o);
      if (!line) continue;
      drawPadlock(el, gFix, toSvg([(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2]), PADLOCK_MM, padlockLook(state), o.id);
    }
    for (const s of level.solids || []) {
      // above the plan's cut height (a beam, a lintel): dashed, like a wall cabinet
      const above = (s.base ?? 0) >= settings.cutPlane;
      const style = { fill: s.color || palette.solid, 'fill-opacity': above ? 0.35 : 1, stroke: palette.solidStroke, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', ...(above ? { 'stroke-dasharray': '6 4' } : {}) }, circle = solidCircle(s);
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
      const above = geo.objectZ(o) >= settings.cutPlane;
      // an asset whose model is missing is drawn in red, dashed, so it is seen and fixed (decision 146)
      const missing = o.kind === 'asset' && ['missing', 'broken'].includes(assetStatus(assetKey(o)));
      // a model's footprint takes the colour of its main part (the largest), grey until it has loaded
      const colour = missing ? palette.missing : o.color || (o.kind === 'asset' && assetColour(assetKey(o))) || palette.objectDefault;
      const shape = el('polygon', { points: svgPoints(fp), fill: colour, 'fill-opacity': missing ? 0.2 : 0.25, stroke: colour, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': above || missing ? '6 4' : '' }, gObj);
      if (o.kind === 'asset') {
        const what = o.blueprint ? `blueprint "${o.blueprint}"` : `model "${o.asset}"`;
        el('title', {}, shape).textContent = missing ? `${o.name || o.id}: ${what} is missing` : `${o.name || o.id}: ${what}`;
      }
    }

    const occ = occluders(geo, { cutPlane: settings.cutPlane, doorStates });
    for (const fx of level.fixtures || []) {
      const c = geo.fixturePos(fx);
      if (!c) continue;
      if (fx.kind === 'strip') { drawStrip(fx, geo.fixtureLine(fx), fixtureLabel, defs, gFix, gLight, occ); continue; }
      const s = toSvg(c), g = el('g', { class: 'fix', transform: `translate(${s[0]} ${s[1]})` }, gFix);
      el('title', {}, g).textContent = fixtureLabel(fx);
      fixEls[fx.id] = fx.kind === 'lamp' ? el('path', { d: BULB_PATH }, g) : el('rect', { x: -90, y: -90, width: 180, height: 180, rx: 30 }, g);
      g.addEventListener('click', ev => hooks.onFixtureClick?.(fx, ev));
      if (fx.kind === 'lamp' && fx.radius) {
        const gr = el('radialGradient', { id: 'g_' + fx.id, gradientUnits: 'userSpaceOnUse', cx: s[0], cy: s[1], r: fx.radius }, defs);
        lightEls[fx.id] = {
          stops: [0, 0.45, 1].map(o => el('stop', { offset: o }, gr)),
          path: el('polygon', { points: svgPoints(visibility(c, fx.radius, occ)), fill: `url(#g_${fx.id})`, style: `mix-blend-mode:${palette.glowBlend}` }, gLight),
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
        el('polygon', { points: svgPoints(visibility(c, fx.radius, occ)), fill: `url(#g_${fx.id}_${i})`, style: `mix-blend-mode:${palette.glowBlend}` }, group);
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
      sh.setAttribute('stroke', !a.available ? palette.fixtureUnavailable : a.on ? col : palette.fixtureOff);
      sh.setAttribute('stroke-width', 60);
      sh.setAttribute('stroke-dasharray', a.available ? '' : '120 90');
    } else {
      sh.setAttribute('fill', !a.available ? 'none' : a.on ? col : palette.fixtureOff);
      sh.setAttribute('stroke', !a.available ? palette.fixtureUnavailable : a.on ? palette.fixtureOn : palette.fixtureOffStroke);
      sh.setAttribute('stroke-width', 24);
      sh.setAttribute('stroke-dasharray', a.available ? '' : '40 30');
    }
    const le = lightEls[id];
    if (le) {
      le.path.style.display = a.on ? '' : 'none';
      le.stops.forEach((s, i) => { s.setAttribute('stop-color', col); s.setAttribute('stop-opacity', [0.9, 0.5, 0][i % 3] * a.brightness * (le.k ?? 1)); });
    }
  }

  // pan / zoom / tap. One pointer drags (or taps); two pointers pinch: the view zooms about the point between them
  // and follows their midpoint, so a pinch can also pan (touch-action: none on the svg leaves the gesture to us).
  if (hooks.interactive !== false) {
    let drag = null, pinch = null;
    const down = new Map();                                  // pointer id → { x, y } of every pointer on the plan now
    const svgAt = (x, y) => { const pt = svg.createSVGPoint(); pt.x = x; pt.y = y; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; };
    const mid = () => { const [a, b] = [...down.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
    svg.addEventListener('pointerdown', e => {
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size === 2) {
        drag = null;
        const m = mid();
        pinch = { d: m.d, w: vb.w, at: svgAt(m.x, m.y) };
      } else if (down.size === 1) drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false, id: e.pointerId };
    });
    svg.addEventListener('pointermove', e => {
      if (down.has(e.pointerId)) down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && down.size === 2) {
        const m = mid(), w = Math.min(Math.max(pinch.w * pinch.d / m.d, 1), 1e9), k = w / vb.w;
        vb.x = pinch.at[0] - (pinch.at[0] - vb.x) * k; vb.y = pinch.at[1] - (pinch.at[1] - vb.y) * k; vb.w = w;
        setVB();                                             // the new view first: the midpoint is read through it
        const now = svgAt(m.x, m.y);                         // keep the start midpoint under the fingers' midpoint
        vb.x += pinch.at[0] - now[0]; vb.y += pinch.at[1] - now[1];
        setVB();
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; svg.setPointerCapture(drag.id); }
        if (drag.moved) { vb.x = drag.vx - dx * pxScale(); vb.y = drag.vy - dy * pxScale(); setVB(); return; }
      }
      hooks.onHover?.(e);
    });
    const up = e => {
      down.delete(e.pointerId);
      if (down.size < 2) pinch = null;
      const was = drag; drag = null;
      if (was && !was.moved && down.size === 0) hooks.onTap?.(e);
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
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
