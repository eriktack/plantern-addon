// Editor page: plan-draw. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { toSvg } from '../../render2d/coords.js';
import { holeOutlines } from '../../model/assets.js';
import { wallCut, sideStrips } from '../../geometry/walls.js';
import { wallLookPieces } from '../../geometry/paint.js';
import { resolveSide, materialTable } from '../../model/materials.js';
import { openingSymbol, arcPathSvg } from '../../geometry/openings.js';
import { openingAssumed } from '../../model/openings.js';
import { resolveSettings } from '../../model/settings.js';
import { assetKey } from '../../model/assets.js';
import { resizeHandles, resizeCursor } from '../drag.js';
import { isHosted } from '../../model/hosted.js';
import { sizeFields } from '../../blueprints/size.js';
import { stripForm } from '../../model/fixtures.js';
import { labelPoint, roomNameLayout, pointInPolygon } from '../../geometry/polygon.js';
import { labelObstacles } from '../../geometry/level.js';
import { stairsPlan } from '../../geometry/stairs.js';
import { SOLID_COLOR } from '../../model/solids.js';
import { solidCircle, roomEdge } from '../../geometry/circle.js';
import { solidStretches, paintStrip } from '../../geometry/solids.js';
import { dimensionSvg, cornerSvg } from '../plan-marks.js';
import { wallLabelsSvg, wallName } from '../labels.js';
import { measureCorners } from '../../edit/inspect.js';
import { startDots } from '../start.js';
import { $, DOT_HIT, LEVEL_COLOR, P, esc, fixture, level, opening, opts, room, wall } from './core.js';
import { nameOpts, refName, tip } from './selection.js';
import { assetCache } from './panel-object.js';
import { drawPeek, showUnderlay } from './levels.js';
import { drawWallOverlay, selectionMarks, wallEnds } from './walldraw.js';
import { isRound } from './panel-room.js';
import { setStatus } from './session.js';
import { Ed } from './state.js';
import { pickVerb, pointerIsCoarse } from '../../touch.js';


/** A wall on the plan as one clickable group: its body as built (joins, openings), hatched while its thickness is assumed. */
export function wallSvg(w, lv, geo, fs, orphans = new Set()) {
  const poly = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;
  let out = '';
  const pieces = geo?.pieces.get(w.id), sel = w.id === Ed.wallId, bad = orphans.has(w.id);
  const fill = w.assumed?.includes('thickness') ? 'url(#hatch)' : w.kind === 'railing' ? '#4a525e' : '#6b7482';
  const cut = wallCut(w, lv, opts().settings?.cutPlane ?? 1200), overhead = cut === 'above';    // a lintel: dashed, see-through
  const low = cut === 'low' && w.kind === 'wall';                     // a half-height wall: seen from above, lighter
  const stroke = sel ? `stroke="#ffb454" stroke-width="${fs / 4}"` : bad ? `stroke="#e5534b" stroke-width="${fs / 4}"` : 'stroke="none"';
  out += `<g data-kind="wall" data-id="${esc(w.id)}" style="cursor:pointer"><title>${esc(tip(w))}</title>`;
  if (pieces?.length) for (const pc of pieces) {
    out += poly(pc, `fill="${fill}"${overhead ? ` fill-opacity="0.3" stroke-dasharray="${fs / 2} ${fs / 3}"` : low ? ' fill-opacity="0.4"' : ''} ${(overhead || low) && !sel && !bad ? `stroke="${fill === 'url(#hatch)' ? '#6b7482' : fill}" stroke-width="${fs / 10}"` : stroke}`);
    for (const lp of wallLookPieces(w, geo.frames.get(w.id), [pc], lv.rooms)) {
      const strips = sideStrips(lp.poly, w.thickness, 40, w, geo.frames.get(w.id));
      for (const side of ['left', 'right']) { const look = resolveSide(lp[side], materialTable(Ed.model)); if (look?.color) out += poly(strips[side], `fill="${look.color}" pointer-events="none"`); }
    }
  }
  else {
    const [ax, ay] = toSvg(w.a), [bx, by] = toSvg(w.b);
    out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${sel ? '#ffb454' : bad ? '#e5534b' : '#6b7482'}" stroke-width="${fs / 6}" stroke-dasharray="${fs / 2}"/>`;
    out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="transparent" stroke-width="${fs}"/>`;   // easier to hit
  }
  out += '</g>';
  return out;
}
/** An opening on the plan as one clickable group: door leaf and swing, window frame, passage faces; the selected one highlighted. */
export function openingSvg(o, lv, geo, fs) {
  let out = '';
  const ow = lv.walls?.find(x => x.id === o.wall), f = ow && geo?.frames.get(ow.id);
  if (!f) return '';
  const sym = openingSymbol(ow, f, o), sel = o.id === Ed.openingId;
  const color = sel ? '#ffb454' : o.type === 'window' ? '#6cb6ff' : o.type === 'door' ? '#e0a060' : '#8b93a1', sw = fs / (sel ? 5 : 8);
  const seg = ([p, q], dash) => { const [a, b] = [toSvg(p), toSvg(q)]; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${fs / 3} ${fs / 4}"` : ''}/>`; };
  const s0 = geo.openingLine(o), [h0, h1] = s0.map(toSvg);
  out += `<g data-kind="opening" data-id="${esc(o.id)}" style="cursor:pointer"><title>${esc(tip(o, o.type))}</title>`;
  out += `<line x1="${h0[0]}" y1="${h0[1]}" x2="${h1[0]}" y2="${h1[1]}" stroke="${openingAssumed(o).length ? '#ffb45455' : 'transparent'}" stroke-width="${fs * 1.2}"/>`;   // hit area (tinted while still default)
  out += sym.lines.map(l => seg(l, false)).join('') + sym.dashed.map(l => seg(l, true)).join('');
  for (const a of sym.arcs) out += `<path d="${arcPathSvg(toSvg(a.c), a.r, toSvg(a.from), toSvg(a.to))}" fill="none" stroke="${color}" stroke-width="${sw * 0.7}" stroke-dasharray="${fs / 3} ${fs / 4}"/>`;
  out += '</g>';
  return out;
}
/** The selected opening's handles (UX11): one at each edge to resize it; its body drags it along the wall. */
export function openingHandlesSvg(lv, geo, fs) {
  const o = Ed.openingId && lv.openings?.find(x => x.id === Ed.openingId);
  if (!o || (Ed.editing && !(Ed.editing.kind === 'opening' && Ed.editing.id === o.id))) return '';
  const l = geo?.openingLine(o);
  if (!l) return '';
  return `<g data-handles="${esc(o.id)}">` + [['a', l[0]], ['b', l[1]]].map(([edge, q]) => { const [x, y] = toSvg(q); return `<rect x="${x - fs * 0.35}" y="${y - fs * 0.35}" width="${fs * 0.7}" height="${fs * 0.7}" fill="#fff" fill-opacity=".85" stroke="#ffb454" stroke-width="${fs / 8}" pointer-events="none"/><circle data-oedge="${edge}" data-id="${esc(o.id)}" cx="${x}" cy="${y}" r="${fs * 0.75}" fill="transparent" style="cursor:ew-resize"><title>Drag to move this edge (the other stays; whole centimetres, Alt: exact)</title></circle>`; }).join('') + '</g>';
}
/** Stairs going up from this level (stairsPlan()): one clickable group, steps above the cut plane dashed. */
export function stairsSvg(s, lv, fs) {
  const poly = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;
  const sel = s.id === Ed.stairsId, edge = sel ? '#ffb454' : '#9aa3b2', movable = sel && !(Ed.editing && !(Ed.editing.kind === 'stairs' && Ed.editing.id === s.id));
  let out = `<g data-kind="stairs" data-id="${esc(s.id)}" style="cursor:${movable ? 'move' : 'pointer'}"><title>${esc(tip(lv.stairs?.find(x => x.id === s.id) || s))}</title>`;
  for (const st of s.steps) out += poly(st.poly, st.above ? `fill="transparent" stroke="${edge}" stroke-opacity="0.7" stroke-width="${fs / 12}" stroke-dasharray="${fs / 2} ${fs / 3}"` : `fill="#3a404b" stroke="${edge}" stroke-width="${fs / 12}"`);
  if (s.arrow.length > 1) out += `<polyline points="${s.arrow.map(q => toSvg(q).join(',')).join(' ')}" fill="none" stroke="${sel ? '#ffb454' : '#e6ebf3'}" stroke-width="${fs / 8}" pointer-events="none"/>`;
  if (s.head) out += poly(s.head, `fill="${sel ? '#ffb454' : '#e6ebf3'}" pointer-events="none"`);
  return out + '</g>';
}
/** The selected stairs' turning handle (UX17): at the end of their arrow; dragged round, they turn about their start in 90° steps. */
export function stairsHandlesSvg(lv, geo, fs) {
  const g = Ed.stairsId && geo?.stairs?.find(x => x.id === Ed.stairsId);
  if (!g?.layout || (Ed.editing && !(Ed.editing.kind === 'stairs' && Ed.editing.id === Ed.stairsId))) return '';
  const a = g.layout.arrow, end = a[a.length - 1], o = g.layout.flights?.[0]?.o;
  if (!end || !o) return '';
  const [x, y] = toSvg(end), [ox, oy] = toSvg(o);
  return `<g data-handles="${esc(Ed.stairsId)}"><circle cx="${ox}" cy="${oy}" r="${fs * 0.35}" fill="#4cc38a" stroke="#14161a" stroke-width="${fs / 10}" pointer-events="none"/><circle cx="${x}" cy="${y}" r="${fs * 0.4}" fill="#14161a" stroke="#ffb454" stroke-width="${fs / 7}" pointer-events="none"/><circle data-sturn="${esc(Ed.stairsId)}" cx="${x}" cy="${y}" r="${fs * 0.8}" fill="transparent" style="cursor:grab"><title>Drag round to turn the stairs about their start (green) in 90° steps</title></circle></g>`;
}
/**
 * Where the winders fan from, on the selected stairs, when the pivot is not the inside corner (decision 259, issue #33): a ringed cross with
 * "pivot" beside it. When the pivot makes the stairs impossible (inside the landing) there is no stair to draw, so the cross is red and says so.
 */
export function stairsPivotSvg(lv, geo, fs) {
  const g = Ed.stairsId && geo?.stairs?.find(x => x.id === Ed.stairsId);
  const wp = g?.stairs?.winderPivot;
  if (!g || !Array.isArray(wp) || (wp[0] === 0 && wp[1] === 0)) return '';
  const spots = g.layout ? (g.layout.turns || []).filter(t => t.fan).map(t => t.fan.pivot) : g.pivot ? [g.pivot] : [];
  const bad = !g.layout, colour = bad ? '#ff5a5a' : '#ffb454', r = fs * 0.45;
  return spots.map(p => {
    const [x, y] = toSvg(p);
    return `<g data-pivot="${esc(g.id)}" pointer-events="none"><circle cx="${x}" cy="${y}" r="${r}" fill="#14161a" fill-opacity="0.8" stroke="${colour}" stroke-width="${fs / 10}"/>` +
      `<path d="M${x - r * 0.7} ${y}H${x + r * 0.7}M${x} ${y - r * 0.7}V${y + r * 0.7}" stroke="${colour}" stroke-width="${fs / 10}"/>` +
      `<text x="${x + r * 1.4}" y="${y - r * 0.6}" font-size="${fs * 0.9}" fill="${colour}" stroke="#14161a" stroke-width="${fs / 8}" paint-order="stroke">${bad ? 'pivot: inside the landing' : 'pivot'}</text></g>`;
  }).join('');
}
/** An object on the plan: its group (clickable, draggable) and, when selected and free, its turning handle (own group). */
export function objectSvg(o, lv, geo, fs) {
  const poly = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;
  const fp = geo?.objectFootprint(o);
  if (!fp) return { body: '', handles: '' };
  let body = '', handles = '';
  // a draft shown while the form is typed in does not ask the server for options it has not built: the options form asks once per pause (draftObjectBuild)
  if (o.kind === 'asset' && !(Ed.livePreview && assetCache().status(assetKey(o)) === 'unknown')) assetCache().loadFor(o);
  const sel = o.id === Ed.objectId, above = (o.z ?? 0) >= resolveSettings(Ed.loc, lv).cutPlane;
  // an asset whose model is missing is red and dashed, so it is seen and fixed (decision 146)
  const missing = o.kind === 'asset' && ['missing', 'broken'].includes(assetCache().status(assetKey(o)));
  const col = sel ? '#ffb454' : missing ? '#b00020' : o.assumed?.length ? '#e5a93a' : (o.color || (o.kind === 'asset' && assetCache().mainColour(assetKey(o))) || '#888');
  const made = o.blueprint ? `blueprint "${o.blueprint}"` : `model "${o.asset}"`;
  const what = o.kind === 'asset' ? (missing ? ` · ${made} is missing` : ` · ${made}`) : '';
  body += `<g data-kind="object" data-id="${esc(o.id)}" style="cursor:grab"><title>${esc(o.name || o.id)} (${esc(o.id)})${esc(what)}</title>${poly(fp, `fill="${col}" fill-opacity="0.25" stroke="${col}" stroke-width="${fs / (sel ? 5 : 9)}"${above || missing ? ` stroke-dasharray="${fs / 2} ${fs / 3}"` : ''}`)}${holeOutlines(o, fp).map(h => poly(h, `fill="none" stroke="${col}" stroke-width="${fs / 12}" stroke-dasharray="${fs / 4} ${fs / 4}" pointer-events="none"`)).join('')}</g>`;
  // a free object has a turning handle; one set into another (a sink in a worktop) turns with its host, so it has none
  if (sel && !o.attach && o.pos && !o.on) {
    // a handle in front of it: drag it round to turn the object about its middle (15° steps snap; Alt: free)
    const a = (o.rotationDeg || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), hw = o.size[0] / 2, hd = o.size[1] / 2;
    const mid = [o.pos[0] + hw * c - hd * sn, o.pos[1] + hw * sn + hd * c], f = [-sn, c], front = [mid[0] + f[0] * hd, mid[1] + f[1] * hd], h = [front[0] + f[0] * fs * 2, front[1] + f[1] * fs * 2];
    const [x1, y1] = toSvg(front), [x2, y2] = toSvg(h);
    handles += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffb454" stroke-width="${fs / 8}" pointer-events="none"/><circle cx="${x2}" cy="${y2}" r="${fs * 0.4}" fill="#14161a" stroke="#ffb454" stroke-width="${fs / 7}" pointer-events="none"/><circle data-orot="${esc(o.id)}" cx="${x2}" cy="${y2}" r="${fs * 0.8}" fill="transparent" style="cursor:grab"><title>Drag round to turn it (${o.rotationDeg || 0}°; 15° steps snap, Alt: free)</title></circle>`;
  }
  // the sides it can be resized by (UX13): a box any of them, a blueprint object those its options set
  if (sel && !(Ed.editing && !(Ed.editing.kind === 'object' && Ed.editing.id === o.id))) {
    const axes = resizableAxes(o), w = o.attach?.wall && lv.walls?.find(x => x.id === o.attach.wall), f = w && geo.frames.get(w.id);
    const H = axes.length ? resizeHandles(o, f ? { a: w.a, frame: f } : null) : {};
    // the arrow follows the side's own direction in the plan (the width of a turned box is not a horizontal line)
    const sideDir = side => {
      if (f) { const sg = o.attach.side === 'left' ? 1 : -1; return side[0] === 'x' ? f.u : [f.n[0] * sg, f.n[1] * sg]; }
      const r = (o.rotationDeg || 0) * Math.PI / 180;
      return side[0] === 'x' ? [Math.cos(r), Math.sin(r)] : [-Math.sin(r), Math.cos(r)];
    };
    for (const [side, q] of Object.entries(H)) {
      if (!axes.includes(side[0])) continue;
      const [x, y] = toSvg(q);
      handles += `<rect x="${x - fs * 0.3}" y="${y - fs * 0.3}" width="${fs * 0.6}" height="${fs * 0.6}" fill="#fff" fill-opacity=".85" stroke="#ffb454" stroke-width="${fs / 8}" pointer-events="none"/><circle data-oside="${side}" data-id="${esc(o.id)}" cx="${x}" cy="${y}" r="${fs * 0.7}" fill="transparent" style="cursor:${resizeCursor(sideDir(side))}"><title>Drag to change its ${side[0] === 'x' ? 'width' : 'depth'} (the other side stays; whole centimetres, Alt: exact)</title></circle>`;
    }
  }
  return { body, handles: handles && `<g data-handles="${esc(o.id)}">${handles}</g>` };
}
/** Which of an object's plan axes can be resized on the plan: 'x' (width) and 'y' (depth) for a box, those a blueprint's options set. */
function resizableAxes(o) {
  if (isHosted(o)) return [];
  if (o.kind !== 'asset') return ['x', 'y'];
  const meta = o.blueprint && Ed.blueprints?.get(o.blueprint);
  if (!meta) return [];
  return sizeFields(meta, o.params).slice(0, 2).filter(f => f.param).map(f => f.axis);
}
/** A lamp (circle), switch (square) or LED strip (line) on the plan, as one clickable group. */
export function fixtureSvg(x, geo, fs) {
  const P = geo?.fixturePos(x);
  if (!P) return '';
  const [cx, cy] = toSvg(P), sel = x.id === Ed.fixtureId, c = sel ? '#ffb454' : x.assumed?.length ? '#e5a93a' : '#f5d76e', r = fs * 0.4;
  const line = geo.fixtureLine?.(x), lc = line ? line.map(q => toSvg(q).join(',')).join(' ') : '';
  return `<g data-kind="fixture" data-id="${esc(x.id)}" style="cursor:pointer"><title>${esc(tip(x))}</title>` + (line ? `<polyline points="${lc}" fill="none" stroke="transparent" stroke-width="${fs * 1.6}" stroke-linecap="round"/><polyline points="${lc}" fill="none" stroke="${c}" stroke-width="${fs / 3}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>` : '') + `<circle cx="${cx}" cy="${cy}" r="${fs}" fill="transparent"/>` + (x.kind === 'strip' ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.7}" fill="${c}" stroke="${sel ? '#fff' : '#14161a'}" stroke-width="${fs / 10}"/>` : x.kind === 'switch'
    ? `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${r / 3}" fill="#14161a" stroke="${c}" stroke-width="${fs / (sel ? 5 : 8)}"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" stroke="${sel ? '#fff' : '#14161a'}" stroke-width="${fs / 10}"/>`) + '</g>';
}
/** The ends of the selected LED strip on a wall: handles to drag (a vertical strip is sized by its height, not dragged: fixes list 48). */
export function stripHandlesSvg(x, geo, fs) {
  if (x.id !== Ed.fixtureId || stripForm(x) !== 'wall' || x.attach?.vertical === true) return '';   // a vertical strip is sized by its height, not dragged (fixes list 48)
  const line = geo.fixtureLine?.(x);
  let out = '';
  if (line) [['a', line[0]], ['b', line[1]]].forEach(([end, q]) => { const [hx, hy] = toSvg(q); out += `<circle data-send="${end}" data-id="${esc(x.id)}" cx="${hx}" cy="${hy}" r="${fs * 0.55}" fill="#fff" fill-opacity=".85" stroke="#ffb454" stroke-width="${fs / 8}" style="cursor:ew-resize"><title>Drag to change where the strip ${end === 'a' ? 'starts' : 'ends'}</title></circle>`; });
  return out && `<g data-handles="${esc(x.id)}">${out}</g>`;
}
/** The plan, drawn again from the model (timed as 'draw'; inside 'recompute' when that called it). */
export function draw() { return P('draw', drawPlan); }

/** PF5: the plan's view box alone, while panning: nothing else in the plan depends on where the view is. */
export function moveViewBox() {
  const vb = Ed.view; if (!vb) return;
  $('preview').setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}
const polyAt = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;

/** The room (or chimney) being edited as the form solves it: its body, the wall letters, the corners and the arrow on wall A. */
function curRoomSvg(cur, fs) {
  let out = Ed.roomId ? `<g data-kind="${Ed.shape}" data-id="${esc(Ed.roomId)}" data-cur="1" style="cursor:move">${polyAt(cur, `fill="#ffb45422" stroke="#ffb454" stroke-width="${fs / 5}"`)}</g>` : `<g data-cur="1" style="cursor:move">${polyAt(cur, `fill="#ffb45422" stroke="#ffb454" stroke-width="${fs / 5}"`)}</g>`;
  out += wallLabelsSvg(cur, { fs });                                  // "A · 4000" inside the room, along each wall
  cur.forEach((p, i) => { out += cornerSvg(p, i, { fs, hot: i === 0, active: Ed.dragging?.kind === 'corner' && Ed.dragging.i === i && Ed.dragging.moved }); });
  // arrow on edge 0 shows the walking direction
  const [a, b] = [toSvg(cur[0]), toSvg(cur[1])], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d, ax = a[0] + ux * d * 0.5, ay = a[1] + uy * d * 0.5, k = fs;
  return out + `<path d="M${ax - ux * k - uy * k * 0.5},${ay - uy * k + ux * k * 0.5} L${ax + ux * k},${ay + uy * k} L${ax - ux * k + uy * k * 0.5},${ay - uy * k - ux * k * 0.5}" fill="none" stroke="#ffb454" stroke-width="${fs / 5}"/>`;
}

/** The invisible discs on the corners of the room being edited, to drag them (drawn last, over the start dots). */
function curHandlesSvg(cur, fs) {
  if (!(cur && !$('nextTo').open && !['lengths', 'circle'].includes(Ed.solved.capture?.mode) && cur.length > 3)) return '';
  return cur.map((p, i) => { const [x, y] = toSvg(p); return `<circle data-corner="${i}" cx="${x}" cy="${y}" r="${fs * 0.75}" fill="transparent" style="cursor:crosshair"><title>Drag corner ${i} to reshape (the walls keep their directions; Shift: along one wall, Alt: no snapping)</title></circle>`; }).join('');
}

/**
 * A drag of the room, or of one of its corners, only changes the room being edited: draw its group and its handles again and leave the rest of the
 * plan as it is (the plan is drawn in full once, when the drag ends). Returns false when something else needs the full draw (no plan yet, a round
 * pillar, the next-to-room lists open, which draw this room's wall too), and the caller draws the plan.
 */
export function drawCurRoomOnly() {
  const cur = Ed.solved?.ok && (Ed.roomId || Ed.draft) ? Ed.solved.polygon : null, g = $('preview').querySelector('#curRoom'), h = $('preview').querySelector('#curHandles');
  if (!cur || !g || !h || !Ed.planFs || isRound() || $('nextTo').open || Ed.peekId || Ed.startPick) return false;
  g.innerHTML = curRoomSvg(cur, Ed.planFs);
  h.innerHTML = curHandlesSvg(cur, Ed.planFs);
  return true;
}

function drawPlan() {
  const svg = $('preview'), lv = level(), cur = Ed.solved?.ok && (Ed.roomId || Ed.draft) ? Ed.solved.polygon : null;
  const others = (lv.rooms || []).filter(r => Ed.shape === 'solid' || r.id !== Ed.roomId);
  const solidsShown = (lv.solids || []).filter(s => s.polygon?.length >= 3);   // the selected one too, under the outline being measured
  const pts = [...others.flatMap(r => r.polygon), ...solidsShown.flatMap(s => s.polygon), ...(cur || room()?.polygon || [])].map(toSvg);
  if (!pts.length) { if (Ed.peekId) { Ed.lastFit = null; drawPeek(); } else svg.innerHTML = ''; return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 1000), pad = span * 0.12;
  Ed.lastFit = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  if (Ed.peekId) { drawPeek(); return; }                                // another level, read-only, while editing this one
  const vb = Ed.view || Ed.lastFit;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  // labels and marks sized in screen pixels, so they read the same on a phone, a big screen and zoomed in
  const fs = Math.max(vb.w / (svg.clientWidth || 800), vb.h / (svg.clientHeight || 600)) * 16;
  Ed.planFs = fs;
  $('zFit').hidden = !Ed.view;
  const poly = (p, style) => `<polygon points="${p.map(q => toSvg(q).join(',')).join(' ')}" ${style}/>`;
  // rooms and walls are clickable; assumed thicknesses hatched, orphans red, the selection highlighted
  let out = `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="${fs * 0.7}" height="${fs * 0.7}" patternTransform="rotate(45)"><rect width="${fs * 0.7}" height="${fs * 0.7}" fill="#6b7482"/><line x1="0" y1="0" x2="0" y2="${fs * 0.7}" stroke="#ffb454" stroke-width="${fs / 6}"/></pattern></defs>`;
  // while placing something (or always, Levels: always): the walls and rooms of the level below (blue) and
  // above (amber), faintly, with their room names; their corners are start points too
  const underNames = [];
  if (showUnderlay()) for (const u of Ed.underlay) {
    const c = LEVEL_COLOR[u.relation];
    for (const p of u.rooms) out += poly(p, `fill="none" stroke="${c}" stroke-opacity="0.35" stroke-width="${fs / 10}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"`);
    for (const p of u.walls) out += poly(p, `fill="${c}" fill-opacity="0.08" stroke="${c}" stroke-opacity="0.45" stroke-width="${fs / 14}" pointer-events="none"`);
    for (const r of u.named || []) {
      // above the room names of this level, moved down a little so the two can both be read
      const lay = labelPoint(r.polygon), [cx, cy] = toSvg(lay.pos);
      underNames.push({ pos: lay.pos, at: [cx, cy + fs * 1.3], html: `<text x="${cx}" y="${cy + fs * 1.3}" fill="${c}" fill-opacity="0.75" font-size="${fs * 0.7}" font-style="italic" text-anchor="middle" dominant-baseline="central" pointer-events="none">${esc(r.name)} · ${esc(u.name)}</text>` });
    }
  }
  const obstacles = labelObstacles(lv, Ed.curGeo);         // room names keep clear of lamps, furniture, chimneys and stairs
  const roomNames = [];                                  // drawn after the stairs, so an opening in the floor does not hide them
  const roomLabelAt = [];                                // where this level's room names are (the neighbours' names keep off them)
  for (const r of others) {
    out += `<g data-kind="room" data-id="${esc(r.id)}" style="cursor:pointer">${poly(r.polygon, r.floor === 'none' ? `fill="#1a1d22" stroke="#46505f" stroke-width="${fs / 8}" stroke-dasharray="${fs / 2} ${fs / 3}"` : `fill="${r.exterior ? '#243026' : '#252a33'}" stroke="#46505f" stroke-width="${fs / 8}"`)}</g>`;
    const lay = roomNameLayout(r.polygon, r.name || r.id, { maxSize: fs * 1.2, minSize: fs * 0.6, avoid: obstacles }), [cx, cy] = toSvg(lay.pos);
    roomLabelAt.push([cx, cy]);
    roomNames.push(`<text x="${cx}" y="${cy}" fill="#8b93a1" font-size="${lay.size}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${lay.lines.map((l, k) => `<tspan x="${cx}" dy="${k ? '1.25em' : `${-(lay.lines.length - 1) * 0.625}em`}">${esc(l)}</tspan>`).join('')}</text>`);
  }
  // stairs going up from here (clickable; steps above the cut plane dashed) and the openings of those arriving from below
  if (Ed.curGeo?.stairs) {
    const sp = stairsPlan(Ed.curGeo, resolveSettings(Ed.loc, lv).cutPlane);
    for (const h of sp.down) out += poly(h.poly, `fill="#14161a" stroke="#6b7482" stroke-width="${fs / 10}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"`);
    for (const s of sp.up) out += stairsSvg(s, lv, fs);
  }
  out += roomNames.join('');
  // wall bodies as they are built (joins and openings included), so a wall reaching into a room shows
  const orphans = new Set(Ed.issuesNow.filter(i => i.severity === 'error' && /orphan/.test(i.msg)).map(i => i.id));
  for (const w of lv.walls || []) out += wallSvg(w, lv, Ed.curGeo, fs, orphans);
  for (const s of solidsShown) {
    const sel = Ed.shape === 'solid' && s.id === Ed.roomId;
    const above = (s.base ?? 0) >= (opts().settings?.cutPlane ?? 1200);   // a beam overhead: dashed, see-through
    const look = `fill="${esc(s.color || SOLID_COLOR)}" fill-opacity="${above ? 0.35 : 1}" stroke="${sel ? '#ffb454' : '#999'}" stroke-width="${fs / (sel ? 4 : 10)}"${above ? ` stroke-dasharray="${fs / 2} ${fs / 3}"` : ''}`, circ = solidCircle(s);
    const body = circ ? (([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${circ.diameter / 2}" ${look}/>`)(toSvg(circ.center)) : poly(s.polygon, look);   // a round pillar: the true circle
    out += `<g data-kind="solid" data-id="${esc(s.id)}" style="cursor:pointer"><title>${esc(s.name || s.kind || s.id)} (${esc(s.id)})</title>${body}`;
    if (s.sides) for (const st of solidStretches(s, lv.rooms)) { const look = resolveSide(s.sides[st.room], materialTable(Ed.model)); if (look?.color) out += poly(paintStrip(st), `fill="${look.color}" pointer-events="none"`); }
    out += '</g>';
  }
  const curCircle = cur && Ed.solved.capture?.mode === 'circle' ? Ed.solved.capture.raw : null;
  if (curCircle) {
    // a round pillar as the form puts it: the circle, its middle, and the two distances it was measured with
    const [cx, cy] = toSvg(curCircle.start), attrs = `fill="#ffb45422" stroke="#ffb454" stroke-width="${fs / 5}"`;
    out += Ed.roomId ? `<g data-kind="solid" data-id="${esc(Ed.roomId)}" data-cur="1" style="cursor:move"><circle cx="${cx}" cy="${cy}" r="${curCircle.diameter / 2}" ${attrs}/></g>` : `<g data-cur="1" style="cursor:move"><circle cx="${cx}" cy="${cy}" r="${curCircle.diameter / 2}" ${attrs}/></g>`;
    out += `<circle cx="${cx}" cy="${cy}" r="${fs / 5}" fill="#ffb454" pointer-events="none"/>`;
    for (const f of curCircle.from || []) {
      const e = roomEdge(lv, f.ref);
      if (!e) continue;
      const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), u = [(e.b[0] - e.a[0]) / L, (e.b[1] - e.a[1]) / L], inward = [u[1], -u[0]], c = curCircle.start;
      const s0 = (c[0] - e.a[0]) * u[0] + (c[1] - e.a[1]) * u[1], foot = [e.a[0] + u[0] * s0, e.a[1] + u[1] * s0], surf = [foot[0] + inward[0] * f.distance, foot[1] + inward[1] * f.distance];
      out += dimensionSvg(foot, surf, { fs, text: `${f.distance}` });
    }
  } else if (cur) {
    // the selected room (or chimney) as solved from its form; clickable like the rest (double-click edits it); dragged inside, it moves as a
    // whole; dragged by a corner, it reshapes (roadmap 8). In its own group, so a drag can draw this group and the handles alone (PF7).
    out += `<g id="curRoom">${curRoomSvg(cur, fs)}</g>`;
  }
  // openings: door leaf and swing, window frame, passage faces; clickable, the selected one highlighted
  for (const o of lv.openings || []) out += openingSvg(o, lv, Ed.curGeo, fs);
  let onTop = openingHandlesSvg(lv, Ed.curGeo, fs) + stairsHandlesSvg(lv, Ed.curGeo, fs) + stairsPivotSvg(lv, Ed.curGeo, fs);                       // handles drawn last, over lamps and start dots
  // objects: boxes (dashed above the cut plane, like a wall cabinet), clickable and draggable
  for (const o of lv.objects || []) { const g = objectSvg(o, lv, Ed.curGeo, fs); out += g.body; onTop += g.handles; }
  // lamps (circles) and switches (squares), clickable; tinted while a value is still a default
  for (const x of lv.fixtures || []) out += fixtureSvg(x, Ed.curGeo, fs);
  for (const x of lv.fixtures || []) out += stripHandlesSvg(x, Ed.curGeo, fs);   // the ends of the selected LED strip on a wall
  // the neighbouring levels' room names only where they cover neither a room name of this level nor furniture, a chimney or stairs (UX30)
  const covered = n => roomLabelAt.some(([x, y]) => Math.abs(x - n.at[0]) < fs * 4 && Math.abs(y - n.at[1]) < fs * 1.6)
    || obstacles.some(o => (Array.isArray(o[0]) ? o.length >= 3 && pointInPolygon(n.pos, o) : Math.hypot(o[0] - n.pos[0], o[1] - n.pos[1]) < fs * 1.5));
  out += underNames.filter(n => !covered(n)).map(n => n.html).join('');
  out += `<g id="selMarks">${selectionMarks(lv, fs)}</g>`;
  // the split point being typed for the selected wall
  const sw = Ed.wallId && wall(), at = sw && Number($('wSplitAt').value);
  if (sw && at > 0) {
    const L = Math.hypot(sw.b[0] - sw.a[0], sw.b[1] - sw.a[1]), u = [(sw.b[0] - sw.a[0]) / L, (sw.b[1] - sw.a[1]) / L], n = [-u[1], u[0]];
    if (at < L) {
      const P = [sw.a[0] + u[0] * at, sw.a[1] + u[1] * at], k = fs * 1.2, [x1, y1] = toSvg([P[0] + n[0] * k, P[1] + n[1] * k]), [x2, y2] = toSvg([P[0] - n[0] * k, P[1] - n[1] * k]);
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e5534b" stroke-width="${fs / 5}" pointer-events="none"/>`;
    }
  }
  // a corner to measure from (fixes list 16): every corner along the wall marked and named, the chosen one green
  if (Ed.fromPick && Ed.editing) {
    const chosenKey = $(Ed.fromPick.sel).value;
    for (const c of measureCorners(level(), Ed.fromPick.wallId)) {
      const [x, y] = toSvg(c.pos), on = c.key === chosenKey;
      out += `<g data-fromkey="${esc(c.key)}" style="cursor:pointer"><title>${esc(c.label)}</title><circle cx="${x}" cy="${y}" r="${fs * DOT_HIT}" fill="transparent"/>`
        + `<circle cx="${x}" cy="${y}" r="${fs * 0.5}" fill="${on ? '#4cc38a' : '#ffb454'}" stroke="#14161a" stroke-width="${fs / 10}"/>`
        + `<text x="${x}" y="${y - fs * 0.9}" fill="${on ? '#4cc38a' : '#ffb454'}" font-size="${fs * 0.7}" text-anchor="middle" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.25}" pointer-events="none">${esc(c.label)}</text></g>`;
    }
  }
  // where corner 0 is placed: every start point as a dot (click to pick), the chosen one ringed and named
  if (Ed.editing && (Ed.roomId || Ed.draft) && !isRound()) {
    const ex = Ed.roomId || $('rid').value, chosen = $('originRef').value;
    // each dot sits on a larger invisible disc: a click anywhere on it picks the point (a hollow ring of
    // another level included), never the room under it
    for (const o of Ed.startPick ? startDots(Ed.snapsAround, { excludeRoom: ex, ...nameOpts() }) : []) {
      const [x, y] = toSvg(o.pos), on = o.ref === chosen, ring = o.adjacent ? LEVEL_COLOR[o.relation] : null;
      out += `<g data-ref="${esc(o.ref)}" style="cursor:pointer"><title>${esc(o.label)}</title><circle cx="${x}" cy="${y}" r="${fs * DOT_HIT}" fill="transparent"/>`
        + `<circle cx="${x}" cy="${y}" r="${on ? fs * 0.55 : fs * 0.4}" fill="${on ? '#4cc38a' : ring ? '#14161a' : '#8b93a1'}" fill-opacity="${on ? 1 : ring ? 0.6 : 0.55}" stroke="${ring && !on ? ring : '#14161a'}" stroke-width="${ring ? fs / 7 : fs / 12}" pointer-events="none"/></g>`;
    }
    const sel = Ed.snapsAround.find(s => s.ref === chosen), c0 = cur?.[0];
    const [sx, sy] = toSvg(sel ? sel.pos : [0, 0]);
    out += `<circle cx="${sx}" cy="${sy}" r="${fs * 0.9}" fill="none" stroke="#4cc38a" stroke-width="${fs / 6}" pointer-events="none"/>`;
    out += `<text x="${sx}" y="${sy - fs * 1.3}" fill="#4cc38a" font-size="${fs * 0.75}" text-anchor="middle" paint-order="stroke" stroke="#14161a" stroke-width="${fs * 0.3}" pointer-events="none">${esc(sel ? refName(sel.ref) : 'origin (0, 0)')}</text>`;
    if (c0 && Math.hypot(c0[0] - (sel ? sel.pos[0] : 0), c0[1] - (sel ? sel.pos[1] : 0)) > 1) {
      const [cx, cy] = toSvg(c0);
      out += `<line x1="${sx}" y1="${sy}" x2="${cx}" y2="${cy}" stroke="#4cc38a" stroke-width="${fs / 8}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"/>`;
    }
  }
  // "Place next to another room" open: the other rooms' walls with their letters, clickable; the chosen
  // one highlighted with the end "Start" counts from, and this room's wall that goes against it
  if (Ed.editing && (Ed.roomId || Ed.draft) && $('nextTo').open) {
    const [nid, ni] = ($('ntEdge').value || '').split('|');
    for (const r of (lv.rooms || []).filter(r => r.id !== Ed.roomId && r.polygon?.length >= 3)) {
      out += wallLabelsSvg(r.polygon, { fs: fs * 1.2, lengths: false, fill: '#aeb6c2' });
      r.polygon.forEach((p, i) => {
        const q = r.polygon[(i + 1) % r.polygon.length], [x1, y1] = toSvg(p), [x2, y2] = toSvg(q), on = r.id === nid && String(i) === ni;
        out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? '#ffb454' : '#8b93a1'}" stroke-width="${on ? fs / 2.5 : fs / 8}" stroke-linecap="round" pointer-events="none"/>`;
        out += `<line data-ntedge="${esc(r.id)}|${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${fs * 1.6}" style="cursor:pointer"><title>${esc(r.name || r.id)} · wall ${wallName(i)}</title></line>`;
        if (on) { const [qx, qy] = toSvg(q); out += `<rect x="${qx - fs * 0.45}" y="${qy - fs * 0.45}" width="${fs * 0.9}" height="${fs * 0.9}" fill="#4cc38a" stroke="#14161a" stroke-width="${fs / 10}" pointer-events="none"/>`; }
      });
    }
    const k = Number($('ntOwn').value);
    if (cur && Number.isInteger(k) && cur[k]) { const [x1, y1] = toSvg(cur[k]), [x2, y2] = toSvg(cur[(k + 1) % cur.length]); out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4cc38a" stroke-width="${fs / 3}" stroke-dasharray="${fs / 2} ${fs / 3}" pointer-events="none"/>`; }
  }
  // a hand-drawn wall selected or edited: where the form puts it (dashed while it differs from what is stored), its ends draggable
  const hw = Ed.wallId && wall();
  const wEditing = Ed.editing?.kind === 'wall' && Ed.editing.id === hw?.id;
  if (hw && !hw.from?.length && (wEditing || !Ed.editing)) {
    const e = (wEditing && wallEnds()) || { a: hw.a, b: hw.b }, L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (L > 1) {
      const n = [-(e.b[1] - e.a[1]) / L, (e.b[0] - e.a[0]) / L], t = (wEditing && Number($('wThick').value)) || hw.thickness || 0, j = (wEditing && $('wJustify').value) || hw.justify || 'center';
      const [o0, o1] = j === 'left' ? [0, t] : j === 'right' ? [-t, 0] : [-t / 2, t / 2], at = (p, o) => [p[0] + n[0] * o, p[1] + n[1] * o];
      const moved = Math.hypot(e.a[0] - hw.a[0], e.a[1] - hw.a[1]) > 0.5 || Math.hypot(e.b[0] - hw.b[0], e.b[1] - hw.b[1]) > 0.5;
      if (moved) out += `<g data-wbody="1" style="cursor:move">${poly([at(e.a, o0), at(e.b, o0), at(e.b, o1), at(e.a, o1)], `fill="#ffb45433" stroke="#ffb454" stroke-width="${fs / 6}" stroke-dasharray="${fs / 2} ${fs / 3}"`)}</g>`;
      for (const [end, p] of [['a', e.a], ['b', e.b]]) { const [x, y] = toSvg(p); out += `<rect x="${x - fs * 0.35}" y="${y - fs * 0.35}" width="${fs * 0.7}" height="${fs * 0.7}" fill="${end === 'a' ? '#4cc38a' : '#ffb454'}" stroke="#14161a" stroke-width="${fs / 10}" pointer-events="none"/><circle data-wend="${end}" cx="${x}" cy="${y}" r="${fs * 0.75}" fill="transparent" style="cursor:crosshair"><title>Drag the ${end === 'a' ? 'start' : 'end'} (snaps to corners; Shift: straight, Alt: free)</title></circle>`; }
    }
  }
  // the corners of the room being edited can be dragged (on top of the start dots: a click without a drag still picks the dot under it)
  out += onTop;
  out += `<g id="curHandles">${curHandlesSvg(cur, fs)}</g>`;
  svg.innerHTML = out;
  Ed.measure?.draw();
  drawWallOverlay();                                                   // the measurement on top
  setStatus(cur ? `${Ed.roomId || 'new room'} · walking direction shown on wall A` : Ed.wallId ? `wall ${tip(wall())}` : Ed.openingId ? tip(opening(), opening()?.type) : Ed.fixtureId ? tip(fixture()) : `${pickVerb(pointerIsCoarse())} a room, a wall, an opening or a lamp`);
}
