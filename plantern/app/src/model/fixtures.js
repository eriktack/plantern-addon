// Fixtures (lamps, switches; PLANTERN.md §6.1): the rules a fixture must meet. Pure.
// A fixture is either free (`pos` [x, y], e.g. a ceiling lamp) or on a wall face (`attach` { wall,
// side, offset, gap? }, e.g. a switch or a wall lamp); `z` is its height above the floor in mm.
// An LED strip (`kind: "strip"`) is a run of light attached to a wall face, an object or a window (see stripForm()), so it follows it.
// A lamp that stands in a window is `attach.opening` (the opening's id) beside wall/side/offset.
// Lamps carry `radius` (how far their light reaches in the plan). HA bindings live in location.json.

import { wallProfile } from '../geometry/walls.js';
import { pointInPolygon } from '../geometry/polygon.js';
import { roomAt, roomCeiling } from './rooms.js';

export const FIXTURE_KINDS = ['lamp', 'switch', 'strip'];
/** Defaults for a new fixture; `z` is listed in `assumed` until measured (a ceiling lamp's z is the ceiling). */
export const FIXTURE_DEFAULTS = { lamp: { radius: 3000 }, switch: { z: 1100 }, wallLamp: { z: 1800 }, strip: { radius: 1200, length: 1200, wallZ: 1400 } };

/**
 * What an LED strip is attached to (decision 122): 'wall' ({ wall, side, offset, length }), 'object' ({ object, edge 0-3, at 'bottom' | 'top' }:
 * along one side of the object's footprint) or 'opening' ({ opening, side, at 'sill' | 'head' }: along the window or door); null for anything else.
 */
export const stripForm = fx => (fx.kind !== 'strip' || !fx.attach ? null : fx.attach.object !== undefined ? 'object' : fx.attach.opening !== undefined && fx.attach.wall === undefined ? 'opening' : 'wall');

/**
 * Height above the floor of a fixture: its own `z`; for a strip on an object or an opening the height of what it follows (the object's
 * bottom or top, the opening's sill or head), so it moves with it. null when that object or opening is missing.
 */
export function fixtureHeight(fx, level) {
  const form = stripForm(fx);
  if (form === 'object') {
    const o = (level.objects || []).find(x => x.id === fx.attach.object);
    return o ? (fx.attach.at === 'top' ? (o.z ?? 0) + (o.size?.[2] ?? 0) : (o.z ?? 0)) : null;
  }
  if (form === 'opening') {
    const o = (level.openings || []).find(x => x.id === fx.attach.opening);
    return o ? (fx.attach.at === 'head' ? o.head : o.sill) : null;
  }
  return fx.z;
}

/** Problems with a fixture: { errors: [msg], warnings: [msg] }. */
export function checkFixture(fx, level) {
  const errors = [], warnings = [];
  if (!FIXTURE_KINDS.includes(fx.kind)) errors.push(`kind must be ${FIXTURE_KINDS.join(' or ')}`);
  const strip = fx.kind === 'strip', form = stripForm(fx);
  // a vertical strip (fixes list 48) runs up the wall from its z by its length: it must fit under the ceiling
  if (strip && form === 'wall' && fx.attach?.vertical !== undefined && typeof fx.attach.vertical !== 'boolean') errors.push('attach.vertical is true or left out');
  if (strip && form === 'wall' && fx.attach?.vertical === true && fx.z !== undefined && fx.attach.length > 0 && level.ceilingHeight && fx.z + fx.attach.length > level.ceilingHeight) warnings.push('the vertical strip runs above the ceiling');
  if (strip) {
    if (fx.pos || fx.points) errors.push('a strip is attached to a wall, an object or a window (attach); it is not free');
    else if (!fx.attach) errors.push('a strip must be attached to a wall, an object or a window (attach)');
    else if (form === 'wall' && !(fx.attach.length > 0)) errors.push('a strip on a wall needs a length in mm (attach.length)');
    else if (form === 'object') {
      if (!(level.objects || []).some(x => x.id === fx.attach.object)) errors.push(`attached to missing object "${fx.attach.object}"`);
      if (!Number.isInteger(fx.attach.edge) || fx.attach.edge < 0 || fx.attach.edge > 3) errors.push('attach.edge is the side of the object, 0 to 3');
      if (fx.attach.at !== undefined && !['bottom', 'top'].includes(fx.attach.at)) errors.push('attach.at must be "bottom" or "top"');
      // optionally only part of the side (offset, length), and set back from its edge (inset): sizes of a box are width (sides 0, 2) and depth (1, 3)
      const ob = (level.objects || []).find(x => x.id === fx.attach.object), a = fx.attach;
      if (ob?.size && Number.isInteger(a.edge) && a.edge >= 0 && a.edge <= 3) {
        const side = a.edge % 2 === 0 ? ob.size[0] : ob.size[1], depth = a.edge % 2 === 0 ? ob.size[1] : ob.size[0];
        if (a.offset !== undefined && !(a.offset >= 0 && a.offset < side)) errors.push(`attach.offset is mm along the side from its first corner: 0 to ${Math.round(side)}`);
        else if (a.length !== undefined && !(a.length > 0 && (a.offset ?? 0) + a.length <= side + 1)) errors.push(`runs past the end of the side (${Math.round(side)} mm long): ${Math.round(a.offset ?? 0)} + ${Math.round(a.length)} mm`);
        if (a.inset !== undefined && !(a.inset >= 0 && a.inset < depth)) errors.push(`attach.inset is mm in from the edge, less than the object is deep (${Math.round(depth)} mm)`);
      }
    } else if (form === 'opening') {
      if (!(level.openings || []).some(x => x.id === fx.attach.opening)) errors.push(`attached to missing opening "${fx.attach.opening}"`);
      if (!['left', 'right'].includes(fx.attach.side)) errors.push('attach.side must be "left" or "right"');
      if (fx.attach.at !== undefined && !['sill', 'head'].includes(fx.attach.at)) errors.push('attach.at must be "sill" or "head"');
    }
  } else {
    if (!fx.attach && !fx.pos) errors.push('needs a position (pos) or a wall it is on (attach)');
  }
  const own = !strip || form === 'wall';                           // a strip on an object or a window takes its height from it
  if (fx.kind === 'switch' && !fx.attach) errors.push('a switch sits on a wall (attach)');
  if (own && !Number.isFinite(fx.z)) errors.push('z (height above the floor) must be a number of mm');
  let top = level.ceilingHeight ?? 2400;
  if (fx.pos) { const r = roomAt(level, fx.pos, pointInPolygon); if (r) top = roomCeiling(level, r); }   // a lowered ceiling in that room
  if (fx.attach && own) {
    const w = (level.walls || []).find(x => x.id === fx.attach.wall);
    if (!w) errors.push(`attached to missing wall "${fx.attach.wall}"`);
    else {
      top = wallProfile(w, level).at(fx.attach.offset ?? 0).top;           // the wall's height where it is
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      if (!(fx.attach.offset >= 0 && fx.attach.offset <= L + 1)) errors.push(`not on ${w.id} (${Math.round(L)} mm long): offset ${fx.attach.offset}`);
      else if (strip && fx.attach.length > 0 && fx.attach.offset + fx.attach.length > L + 1) errors.push(`runs past the end of ${w.id} (${Math.round(L)} mm long): ${Math.round(fx.attach.offset)} + ${Math.round(fx.attach.length)} mm`);
      if (!['left', 'right'].includes(fx.attach.side)) errors.push('attach.side must be "left" or "right"');
      const here = (level.openings || []).filter(o => o.wall === w.id);
      if (fx.attach.opening !== undefined) {
        // a light that stands in a window (or other opening) on purpose: a lamp in the glass, a window star
        const o = here.find(x => x.id === fx.attach.opening);
        if (fx.kind !== 'lamp') errors.push('only a lamp can stand in an opening');
        else if (!o) errors.push(`stands in the opening "${fx.attach.opening}", which is not in ${w.id}`);
        else {
          if (!(fx.attach.offset >= o.offset - 1 && fx.attach.offset <= o.offset + o.width + 1)) warnings.push(`is not within the opening ${o.id} along the wall (${Math.round(o.offset)}–${Math.round(o.offset + o.width)} mm)`);
          if (Number.isFinite(fx.z) && !(fx.z >= o.sill - 1 && fx.z <= o.head + 1)) warnings.push(`is not within the height of the opening ${o.id} (${Math.round(o.sill)}–${Math.round(o.head)} mm)`);
        }
      } else if (!strip) {
        const hole = here.find(o => fx.attach.offset > o.offset + 1 && fx.attach.offset < o.offset + o.width - 1 && fx.z > o.sill && fx.z < o.head);
        if (hole) warnings.push(`sits in the opening ${hole.id} (if that is meant, say so in its panel: Stands in)`);
      }
    }
  } else if (fx.pos && !(level.rooms || []).some(r => r.polygon?.length >= 3 && pointInPolygon(fx.pos, r.polygon))) warnings.push('is not inside any room');
  const z = fixtureHeight(fx, level);
  if (Number.isFinite(z) && (z < 0 || z > top + 1)) errors.push(`height ${z} mm is outside 0–${Math.round(top)} mm (floor to ${fx.attach ? 'the top of the wall there' : 'ceiling'})`);
  if (fx.radius !== undefined && !(fx.radius > 0)) errors.push('radius must be more than 0');
  return { errors, warnings };
}
