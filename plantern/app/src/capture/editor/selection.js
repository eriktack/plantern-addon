// Editor page: selection. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { toSvg } from '../../render2d/coords.js';
import { displayName, fallbackName } from '../../model/names.js';
import { pointInPolygon } from '../../geometry/polygon.js';
import { refNamer } from '../ref-names.js';
import { collectSnapLines, adjacentLevels } from '../../tools/snap.js';
import { captureToForm, newRoomId } from '../edit.js';
import { newSolidId } from '../../edit/ops.js';
import { SOLID_COLOR } from '../../model/solids.js';
import { $, FIELDS, esc, expanded, geosFor, level, room } from './core.js';
import { draw } from './plan-draw.js';
import { refresh, refreshSnaps } from './refresh.js';
import { loadRound, syncRound } from './panel-room.js';
import { renderSolidSides } from './room-apply.js';
import { fillShapeCopy } from './copy.js';
import { Ed } from './state.js';


/** Zoom by factor f (< 1 = in) around the pointer of event e, or around the middle. */
export function zoomAt(f, e) {
  const svg = $('preview'), vb = Ed.view || Ed.lastFit, m = svg.getScreenCTM();
  if (!vb || !m) return;
  let c = [vb.x + vb.w / 2, vb.y + vb.h / 2];
  if (e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(m.inverse()); c = [q.x, q.y]; }
  const w = Math.min(Math.max(vb.w * f, 300), Ed.lastFit.w * 4), k = w / vb.w;     // from 30 cm across to 4 × the level
  Ed.view = { x: c[0] - (c[0] - vb.x) * k, y: c[1] - (c[1] - vb.y) * k, w: vb.w * k, h: vb.h * k };
  Ed.autoZoomed = false;
  draw();
}
/** Opening something small (a bump, a closet) zooms in on it; leaving the editor zooms back out. */
export function zoomToIfSmall(poly, redraw = true) {
  if (!poly?.length || !Ed.lastFit || Ed.view) return;
  const pts = poly.map(toSvg), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), size = Math.max(w, h);
  if (size > 0.2 * Math.max(Ed.lastFit.w, Ed.lastFit.h)) return;
  const span = Math.max(size * 5, 1500), k = span / Math.max(Ed.lastFit.w, Ed.lastFit.h);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  Ed.view = { x: cx - Ed.lastFit.w * k / 2, y: cy - Ed.lastFit.h * k / 2, w: Ed.lastFit.w * k, h: Ed.lastFit.h * k };
  Ed.autoZoomed = true;
  if (redraw) draw();
}

/** A panel title: the friendly name with the id beside it, smaller; just the id without a name. */
export const titleHtml = e => esc(e?.name ?? '');                       // the id is shown once, in the edit header (UX26, R7)
/** A tooltip or status: "Bathroom window (o_window_7)", or the id; `what` adds the kind after the id. */
export const tip = (e, what = '') => (e?.name ? `${e.name} (${e.id}${what ? `, ${what}` : ''})` : `${e?.id ?? ''}${what ? ` (${what})` : ''}`);
/** The friendly name of anything in the model by id (for messages that carry ids), or the id. */
export function nameOf(id) {
  for (const lv of Ed.model.levels) for (const k of ['rooms', 'walls', 'openings', 'solids', 'objects', 'fixtures', 'stairs']) { const e = lv[k]?.find(x => x.id === id); if (e) return readableName(e, k, lv); }
  return id;
}
/** What a person reads for a thing: its name, else what it is (UX29: "Dining table", "Kitchen ceiling lamp", "Window 1200 mm"). */
export function readableName(e, coll, lv = level()) {
  const kind = { objects: 'object', fixtures: 'fixture', openings: 'opening', stairs: 'stairs' }[coll];
  if (!kind || (typeof e.name === 'string' && e.name.trim())) return displayName(e);
  let roomName = '';
  if (kind === 'fixture') { const p = Ed.curGeo?.fixturePos?.(e); roomName = (p && (lv.rooms || []).find(r => r.polygon?.length >= 3 && pointInPolygon(p, r.polygon))?.name) || ''; }
  return fallbackName(e, kind, { roomName, blueprintName: id => Ed.blueprints?.get(id)?.name });
}

/** A snap ref as a person reads it: "Salong wall D", "Salong wall D, room face", "Murstock side 2" (ref-names.js). */
export const refName = ref => refNamer(Ed.model)(ref);
export const nameOpts = () => ({ name: refNamer(Ed.model), levelName: id => Ed.model.levels.find(l => l.id === id)?.name || id });

/** Planes the measure tool can use: wall faces, room edges and solid sides of this level and the ones just below and above. */
export function linesAround() {
  const geos = geosFor(Ed.model);
  return [...collectSnapLines(Ed.model, level(), Ed.curGeo), ...adjacentLevels(Ed.model, level()).flatMap(l => collectSnapLines(Ed.model, l, geos.get(l.id)))];
}

/** Nothing selected: the plan alone. A new room being typed is kept (a stray click must not lose it). */
export function selectNone() {
  if (Ed.editing) return;
  Ed.roomId = null; Ed.wallId = null; Ed.openingId = null; Ed.fixtureId = null; Ed.stairsId = null; Ed.objectId = null;
  collapseTree();
  refresh();
}
/** Fold the sidebar tree up again (nothing selected, or just saved): only the top level shows. */
export function collapseTree() { expanded.clear(); Ed.treeShownFor = null; }

export function selectObject(id) { Ed.objectId = id; Ed.stairsId = null; Ed.fixtureId = null; Ed.openingId = null; Ed.wallId = null; Ed.roomId = null; Ed.draft = null; Ed.objectFormFor = null; refresh(); }
export function selectStairs(id) { Ed.stairsId = id; Ed.objectId = null; Ed.fixtureId = null; Ed.openingId = null; Ed.wallId = null; Ed.roomId = null; Ed.draft = null; Ed.stairsFormFor = null; refresh(); }
export function selectWall(id) { Ed.wallId = id; Ed.openingId = null; Ed.fixtureId = null; Ed.stairsId = null; Ed.objectId = null; Ed.roomId = null; Ed.draft = null; refresh(); }
export function selectOpening(id) { Ed.openingId = id; Ed.wallId = null; Ed.fixtureId = null; Ed.stairsId = null; Ed.objectId = null; Ed.roomId = null; Ed.draft = null; Ed.openingFormFor = null; refresh(); }
export function selectFixture(id) { Ed.fixtureId = id; Ed.openingId = null; Ed.wallId = null; Ed.stairsId = null; Ed.objectId = null; Ed.roomId = null; Ed.draft = null; Ed.fixtureFormFor = null; refresh(); }

export function loadForm(capture) {
  const round = capture?.mode === 'circle';
  if (Ed.shape === 'solid') { $('sShape').value = round ? 'round' : 'outline'; loadRound(round ? capture : null); } else syncRound();
  const f = captureToForm(round ? null : capture);
  refreshSnaps();
  if (f.originRef && ![...$('originRef').options].some(o => o.value === f.originRef)) {
    // the referenced point is not offered (gone or excluded): keep it visible so the error is explicit
    $('originRef').insertAdjacentHTML('beforeend', `<option value="${esc(f.originRef)}">${esc(f.originRef)} (missing)</option>`);
  }
  FIELDS.forEach(k => { $(k).value = f[k]; });
}

export function loadFormForSelection() {
  if (Ed.draft) Ed.shape = Ed.draft.solid ? 'solid' : 'room';
  const r = room(), solid = Ed.shape === 'solid';
  $('name').value = r ? r.name ?? '' : Ed.draft?.name ?? '';
  $('rid').value = r ? r.id : solid ? newSolidId(Ed.model, Ed.draft?.name || $('sKind').value) : newRoomId(Ed.model, Ed.draft?.name);
  $('exterior').checked = r ? !!r.exterior : !!Ed.draft?.exterior;
  $('rFloor').value = r?.floor ?? 'slab'; $('rFloorOff').value = r?.floorOffset ?? ''; $('rCeil').value = r?.ceilingHeight ?? '';
  $('rCeilNote').textContent = `(${level().ceilingHeight ?? 2400})`;
  $('roomOptions').hidden = solid;
  // a solid is measured like a room (walking round it, the solid on your right) and has a kind, colour and height
  $('exteriorRow').hidden = solid; $('solidFields').hidden = !solid; $('addRoom').hidden = solid || !Ed.roomId;
  $('edTitle').textContent = solid ? 'Solid' : 'Room';
  $('walkHelp').innerHTML = solid
    ? 'Walk round it <b>clockwise</b>, keeping it on your <b>right</b>; a face hidden in a wall is measured or estimated from the rooms. Corner 0 is where you start; side A runs from corner 0 to 1, and so on. Its faces bound the rooms around it: they need no wall there. All lengths in mm.'
    : 'Walk <b>clockwise</b>, room on your <b>right</b>. Corner 0 is where you start; wall A runs from corner 0 to 1, B from 1 to 2, and so on (the letters are on the plan). Lengths are listed in that order. All lengths in mm.';
  $('delRoom').textContent = solid ? 'Delete' : 'Delete room';
  if (solid) { $('sKind').value = r?.kind || 'chimney'; $('sColor').value = r?.color || SOLID_COLOR; $('sBase').value = r?.base ?? ''; $('sHeight').value = r?.height ?? ''; $('sCuts').checked = r ? !!r.cutsWalls : true; }
  $('sCutsRow').hidden = !solid;
  $('sSidesBox').hidden = !solid;
  if (solid) renderSolidSides();
  $('name').readOnly = false;
  loadForm(r?.capture ?? null);
  fillShapeCopy();
}

export function selectSolid(id) { Ed.shape = 'solid'; Ed.roomId = id; Ed.wallId = null; Ed.openingId = null; Ed.fixtureId = null; Ed.stairsId = null; Ed.objectId = null; Ed.draft = null; loadFormForSelection(); refresh(); }
export function selectRoom(id) { Ed.shape = 'room'; Ed.roomId = id; Ed.wallId = null; Ed.openingId = null; Ed.fixtureId = null; Ed.stairsId = null; Ed.draft = null; loadFormForSelection(); refresh(); }
