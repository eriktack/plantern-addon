// The yard (docs/plans/yard.md, decision 294): the ground around the buildings. Pure.
//   yard: { boundary?: [[x, y], …], elevation?: mm, areas: [{ id: "ya_…", name?, surface, polygon, color? }],
//           lines: [{ id: "yl_…", name?, kind, points, height?, thickness?, high?: "left" | "right", drop? }] }
// In the main building's plan coordinates. Areas are drawn in order, a later one over an earlier one (a path on the lawn needs
// no hole). A retaining wall's `high` is the side of the line's direction where the ground is higher, `drop` the difference.

import { isClockwise } from '../geometry/polygon.js';

export const YARD_SURFACES = ['grass', 'gravel', 'asphalt', 'paving', 'deck', 'bed', 'rock', 'forest', 'water', 'other'];
export const YARD_LINE_KINDS = ['fence', 'hedge', 'stonewall', 'retaining', 'edging'];
export const SURFACE_LABEL = { grass: 'Grass', gravel: 'Gravel', asphalt: 'Asphalt', paving: 'Paving', deck: 'Deck', bed: 'Bed', rock: 'Rock', forest: 'Trees', water: 'Water', other: 'Other' };
export const LINE_LABEL = { fence: 'Fence', hedge: 'Hedge', stonewall: 'Stone wall', retaining: 'Retaining wall', edging: 'Edging' };

const isPt = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isPts = (a, n) => Array.isArray(a) && a.length >= n && a.every(isPt);

/** Structural problems of one area: messages. */
export function areaErrors(a) {
  const e = [];
  if (!a || typeof a !== 'object') return ['an area must be an object'];
  if (typeof a.id !== 'string' || !/^ya_[a-z0-9_]+$/.test(a.id)) e.push('an area id looks like ya_lawn');
  if (!YARD_SURFACES.includes(a.surface)) e.push(`surface must be one of ${YARD_SURFACES.join(', ')}`);
  if (!isPts(a.polygon, 3)) e.push('polygon must be three or more points [x, y] in mm');
  if (a.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(a.color))) e.push('color must be #rrggbb');
  return e;
}

/** Structural problems of one line: messages. */
export function lineErrors(l) {
  const e = [];
  if (!l || typeof l !== 'object') return ['a line must be an object'];
  if (typeof l.id !== 'string' || !/^yl_[a-z0-9_]+$/.test(l.id)) e.push('a line id looks like yl_fence');
  if (!YARD_LINE_KINDS.includes(l.kind)) e.push(`kind must be one of ${YARD_LINE_KINDS.join(', ')}`);
  if (!isPts(l.points, 2)) e.push('points must be two or more points [x, y] in mm');
  for (const k of ['height', 'thickness']) if (l[k] !== undefined && !(Number.isFinite(l[k]) && l[k] > 0)) e.push(`${k} is in mm, more than 0`);
  if (l.kind === 'retaining') {
    if (!['left', 'right'].includes(l.high)) e.push('a retaining wall needs high: "left" or "right" (the side, along the line, where the ground is higher)');
    if (!(Number.isFinite(l.drop) && l.drop > 0)) e.push('a retaining wall needs drop: how much higher that side is, in mm');
  }
  return e;
}

/** Validator issues for model.yard. */
export function checkYard(model) {
  const y = model.yard, out = [];
  if (y === undefined) return out;
  if (!y || typeof y !== 'object' || Array.isArray(y)) return [{ severity: 'error', id: 'yard', msg: 'yard must be an object' }];
  if (y.boundary !== undefined && !isPts(y.boundary, 3)) out.push({ severity: 'error', id: 'yard', msg: 'boundary must be three or more points [x, y] in mm' });
  if (y.elevation !== undefined && !Number.isFinite(y.elevation)) out.push({ severity: 'error', id: 'yard', msg: 'elevation is mm relative to the ground floor, a number' });
  for (const [key, check] of [['areas', areaErrors], ['lines', lineErrors]]) {
    if (y[key] === undefined) continue;
    if (!Array.isArray(y[key])) { out.push({ severity: 'error', id: 'yard', msg: `${key} must be a list` }); continue; }
    for (const x of y[key]) for (const m of check(x)) out.push({ severity: 'error', id: x?.id || 'yard', msg: m });
  }
  for (const a of y.areas || []) if (isPts(a?.polygon, 3) && !isClockwise(a.polygon)) out.push({ severity: 'warn', id: a.id, msg: 'area polygon is counter-clockwise (should be clockwise, like rooms)' });
  return out;
}

/** The ids the yard uses (for unique ids across the model file). */
export const yardIds = model => [...(model.yard?.areas || []), ...(model.yard?.lines || [])].map(x => x?.id).filter(Boolean);

/** A new id from a name: "Front lawn" → ya_front_lawn (prefix ya_ or yl_), unique among `used`. */
export function newYardId(prefix, name, used) {
  const slug = String(name || (prefix === 'ya_' ? 'area' : 'line')).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
  let id = `${prefix}${slug}`, k = 2;
  while (used.has(id)) id = `${prefix}${slug}_${k++}`;
  return id;
}

/** The ground floor the yard lies around: the main building's level at elevation 0, else the lowest at or above 0. */
export function yardLevelId(model) {
  const main = (model.levels || []).filter(l => !l.building);
  return (main.find(l => l.elevation === 0) || [...main].filter(l => l.elevation >= 0).sort((a, b) => a.elevation - b.elevation)[0] || main[0])?.id ?? null;
}
