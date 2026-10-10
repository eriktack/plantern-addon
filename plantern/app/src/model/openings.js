// Openings (doors, windows, passages; PLANTERN.md §6.1): the rules an opening must meet. Pure.

import { wallProfile } from '../geometry/walls.js';
import { PLACEMENTS } from '../geometry/fittings.js';

export const OPENING_TYPES = ['door', 'window', 'passage'];
export const WINDOW_OPENS = ['fixed', 'side-hung', 'top-hung', 'bottom-hung', 'tilt-turn', 'sliding'];
/** How a door opens besides on hinges (no `opens`): sliding along one face of the wall, or into a pocket in it. */
export const DOOR_OPENS = ['sliding', 'pocket'];
/** A door that slides: `slide` is the edge it slides past when opened ("near" or "far"; two leaves part both ways). */
export const isSliding = o => o.type === 'door' && DOOR_OPENS.includes(o.opens);
/** Defaults for a new opening (listed in `assumed` until measured). Heights are mm above the floor. */
export const OPENING_DEFAULTS = { door: { width: 900, sill: 0, head: 2100 }, window: { width: 1200, sill: 900, head: 2100 }, passage: { width: 1200, sill: 0, head: 2100 } };
const MEASURES = ['offset', 'width', 'sill', 'head'];

/**
 * The values of an opening that are still defaults. A door or passage standing on the floor (sill
 * 0) is not a guess: that is what it is unless a threshold is measured, so its sill is never listed.
 */
export function openingAssumed(o) {
  return (o.assumed || []).filter(k => !(k === 'sill' && o.sill === 0 && (o.type === 'door' || o.type === 'passage')));
}

/** Problems with an opening on its wall: [message]. `others` = the wall's other openings. */
export function checkOpening(o, wall, level, others = []) {
  // the wall's height where the opening is (a sloped wall is lower at one end)
  const err = [], L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]), prof = wallProfile(wall, level);
  const top = Math.min(prof.at(o.offset ?? 0).top, prof.at((o.offset ?? 0) + (o.width ?? 0)).top), bottom = Math.max(prof.at(o.offset ?? 0).base, prof.at((o.offset ?? 0) + (o.width ?? 0)).base);
  if (!OPENING_TYPES.includes(o.type)) err.push(`type must be ${OPENING_TYPES.join(', ')}`);
  for (const k of MEASURES) if (!Number.isFinite(o[k])) err.push(`${k} must be a number of mm`);
  if (err.length) return err;
  if (!(o.width > 0)) err.push('width must be more than 0');
  if (o.offset < 0 || o.offset + o.width > L + 1) err.push(`does not fit on ${wall.id} (${Math.round(L)} mm long): ${o.offset} + ${o.width} mm`);
  if (o.sill < 0) err.push('the bottom (sill) cannot be below the floor');
  if (!(o.head > o.sill)) err.push('the top must be above the bottom');
  if (o.head > top + 1) err.push(`the top (${o.head} mm) is above the wall (${Math.round(top)} mm${prof.sloped ? ' where the opening is' : ''})`);
  if (prof.sloped && o.sill < bottom - 1) err.push(`the bottom (${o.sill} mm) is below the wall (${Math.round(bottom)} mm there)`);
  const hit = others.find(x => x.id !== o.id && Math.min(x.offset + x.width, o.offset + o.width) - Math.max(x.offset, o.offset) > 1);
  if (hit) err.push(`overlaps ${hit.id} on the same wall`);
  if (o.hinge !== undefined && !['near', 'far'].includes(o.hinge)) err.push('hinge must be "near" or "far"');
  if (o.swing !== undefined && !['left', 'right'].includes(o.swing)) err.push('swing must be "left" or "right"');
  if (o.opens !== undefined && !(o.type === 'window' ? WINDOW_OPENS : o.type === 'door' ? DOOR_OPENS : []).includes(o.opens)) err.push(o.type === 'door' ? `a door opens on hinges (no opens), or ${DOOR_OPENS.join(' or ')}` : `opens is for windows (${WINDOW_OPENS.join(', ')}) and doors (${DOOR_OPENS.join(', ')})`);
  if (o.slide !== undefined && (!isSliding(o) || !['near', 'far'].includes(o.slide))) err.push('slide ("near" or "far") is for sliding and pocket doors');
  if (o.type === 'door' && o.opens === 'pocket' && Number.isFinite(o.offset) && o.width > 0) {
    // the pocket: the leaf slides into the wall beside the opening, so the wall must be there, without openings
    const ways = o.leaves === 2 ? ['near', 'far'] : [o.slide ?? 'near'], leaf = o.leaves === 2 ? o.width / 2 : o.width;
    for (const way of ways) {
      const p0 = way === 'near' ? o.offset - leaf : o.offset + o.width, p1 = p0 + leaf;
      if (p0 < -1 || p1 > L + 1) err.push(`its pocket (${Math.round(leaf)} mm ${way === 'near' ? 'before' : 'after'} it) runs past the end of ${wall.id}`);
      const inPocket = others.find(x => x.id !== o.id && Math.min(x.offset + x.width, p1) - Math.max(x.offset, p0) > 1);
      if (inPocket) err.push(`its pocket runs into ${inPocket.id}`);
    }
  }
  // a double window or door: two leaves hinged on both sides, meeting in the middle
  if (o.leaves !== undefined && (!(o.leaves === 1 || o.leaves === 2) || (o.type !== 'door' && o.type !== 'window'))) err.push('leaves (1 or 2) is for doors and windows');
  // the window or door itself (frame, leaf), not the hole: a passage is always as deep as the wall
  if (o.thickness !== undefined) {
    if (o.type === 'passage') err.push('a passage has no thickness of its own (it is as deep as the wall)');
    else if (!(o.thickness > 0)) err.push('thickness must be more than 0');
    else if (wall.thickness && o.thickness > wall.thickness + 1) err.push(`the ${o.type} (${o.thickness} mm) is thicker than the wall (${wall.thickness} mm)`);
  }
  // how the unit looks (3D, and where it sits across the wall in the plan): colour, placement, a window's sill board
  const hex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (o.color !== undefined && (o.type === 'passage' || !hex(o.color))) err.push(o.type === 'passage' ? 'a passage has no colour (nothing is in it)' : 'color must look like #rrggbb');
  if (o.placement !== undefined && (o.type === 'passage' || !PLACEMENTS.includes(o.placement))) err.push(o.type === 'passage' ? 'a passage has no placement (it is as deep as the wall)' : `placement must be ${PLACEMENTS.map(p => `"${p}"`).join(', ')}`);
  if (o.sillDepth !== undefined && (o.type !== 'window' || !(o.sillDepth >= 0))) err.push(o.type !== 'window' ? 'sillDepth is for windows' : 'sillDepth must be 0 or more (mm)');
  if (o.sillColor !== undefined && (o.type !== 'window' || !hex(o.sillColor))) err.push(o.type !== 'window' ? 'sillColor is for windows' : 'sillColor must look like #rrggbb');
  return err;
}

