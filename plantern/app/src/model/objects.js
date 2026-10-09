// Objects (PLANTERN.md §6.1, §6.3): physical things with a size, a box for now (a wall cabinet, a sofa, a table).
//   { id: "ob_cabinet_1", kind: "box", name?, size: [w, d, h], z, color?, assumed?,
//     attach: { wall, side: "left" | "right", offset, gap? }            a box on a wall face: w along the wall from
//                                                                       `offset`, d out from the face (+ gap)
//   | pos: [x, y], rotationDeg? }                                       a box standing in the plan: corner at pos,
//                                                                       w along the direction rotationDeg (0 = east)
// `z` is the bottom above the floor (a wall cabinet at 1400, furniture on the floor at 0). The plan draws objects
// whose bottom is above the cut plane dashed. Pure.

import { pointInPolygon } from '../geometry/polygon.js';

export const OBJECT_KINDS = ['box'];
export const OBJECT_DEFAULTS = Object.freeze({
  free: { size: [800, 800, 800], z: 0 },
  wall: { size: [900, 350, 700], z: 1400 },
});
const HEX = /^#[0-9a-f]{6}$/i;

/** Problems with an object: { errors, warnings }. `level` is the level it stands on. */
export function checkObject(o, level) {
  const errors = [], warnings = [];
  if (!OBJECT_KINDS.includes(o.kind)) errors.push(`kind must be ${OBJECT_KINDS.join(' or ')}`);
  if (!Array.isArray(o.size) || o.size.length !== 3 || !o.size.every(v => Number.isFinite(v) && v > 0)) errors.push('size must be [width, depth, height] in mm, all more than 0');
  if (!Number.isFinite(o.z) || o.z < 0) errors.push('z (the bottom above the floor) must be 0 or more');
  if (o.color !== undefined && !HEX.test(o.color)) errors.push('color must look like #rrggbb');
  if (!o.attach && !o.pos) errors.push('needs a position (pos) or a wall it is on (attach)');
  if (o.attach && o.pos) errors.push('either attach or pos, not both');
  if (o.attach) {
    const w = (level.walls || []).find(x => x.id === o.attach.wall);
    if (!w) errors.push(`attached to missing wall "${o.attach.wall}"`);
    else {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), width = o.size?.[0] ?? 0;
      if (!['left', 'right'].includes(o.attach.side)) errors.push('attach.side must be "left" or "right"');
      if (!(o.attach.offset >= 0)) errors.push('attach.offset must be 0 or more');
      else if (o.attach.offset + width > L + 1) warnings.push(`reaches past the end of ${w.id} (${Math.round(L)} mm long)`);
      if (o.attach.gap !== undefined && !(o.attach.gap >= 0)) errors.push('attach.gap must be 0 or more');
    }
  } else if (o.pos) {
    if (!(Array.isArray(o.pos) && o.pos.length === 2 && o.pos.every(Number.isFinite))) errors.push('pos must be [x, y]');
    else if (!(level.rooms || []).some(r => r.polygon?.length >= 3 && pointInPolygon(o.pos, r.polygon))) warnings.push('is not inside any room');
    if (o.rotationDeg !== undefined && !Number.isFinite(o.rotationDeg)) errors.push('rotationDeg must be a number');
  }
  if (Number.isFinite(o.z) && Array.isArray(o.size) && Number.isFinite(o.size[2]) && o.z + o.size[2] > (level.ceilingHeight ?? 2400) + 1) warnings.push(`reaches ${Math.round(o.z + o.size[2])} mm, above the ceiling (${level.ceilingHeight ?? 2400} mm)`);
  return { errors, warnings };
}
