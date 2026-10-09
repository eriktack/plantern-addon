// Solids (PLANTERN.md §6.1, §6.3): free-standing prisms such as a chimney, a pillar or a boxed-in
// pipe. Footprint `polygon` (clockwise, like a room: measured walking round it with the solid on your
// right), `base` (mm above the floor, default 0; negative down to the ceiling of the level below, -floorThickness, for a chimney that carries on through the slab), `height` (default: up to the ceiling), `color`.
// Measured like a room: `capture` { mode, raw } with `polygon` the solved result. Its faces bound the
// rooms around it (geometry/solids.js). `sides` paints it per room: { <roomId>: { color } | { material } }
// applies to every stretch of its faces along that room; faces in no room and the top keep `color`.
// `cutsWalls: true`: walls give way to it, their bodies are cut where it stands (geometry/solids.js
// cutWallPieces), so a room can be measured as the rectangle it would be without it.
// A raised solid (`base` above the floor: boxing under the ceiling) does not bound rooms or cut walls;
// without a height it reaches up to the ceiling. A lintel or a wall inside a room is a hand-drawn wall. Pure.

import { isClockwise } from '../geometry/polygon.js';
import { solidStretches } from '../geometry/solids.js';

export const SOLID_KINDS = ['chimney', 'pillar', 'box'];
export const SOLID_COLOR = '#6b4f3a';
const HEX = /^#[0-9a-f]{6}$/i;

/** Problems with a solid: { errors: [msg], warnings: [msg] }. */
export function checkSolid(s, level) {
  const errors = [], warnings = [];
  // painted per room: only rooms it borders (the rooms must exist; looks are checked with the materials)
  if (s.sides !== undefined && (typeof s.sides !== 'object' || Array.isArray(s.sides))) errors.push('sides must be { roomId: { color } or { material } }');
  else if (s.sides && s.polygon?.length >= 3) {
    const rooms = level.rooms || [], bordering = new Set(solidStretches(s, rooms).map(x => x.room));
    for (const id of Object.keys(s.sides)) {
      if (!rooms.some(r => r.id === id)) warnings.push(`painted for room ${id}, which does not exist`);
      else if (!bordering.has(id)) warnings.push(`painted for room ${id}, which it does not border`);
    }
  }
  if (!(s.polygon?.length >= 3) || s.polygon.some(p => !Number.isFinite(p?.[0]) || !Number.isFinite(p?.[1]))) errors.push('footprint (polygon) needs 3 or more corners [x, y]');
  else if (!isClockwise(s.polygon)) warnings.push('footprint is counter-clockwise (should be clockwise, like rooms)');
  if (!SOLID_KINDS.includes(s.kind)) warnings.push(`kind "${s.kind}" is not one of ${SOLID_KINDS.join(', ')}`);
  // a chimney may start below the floor, down to the ceiling of the level below (the underside of this floor's slab)
  const lowest = -(level.floorThickness ?? 0);
  if (s.base !== undefined && !(Number.isFinite(s.base) && s.base >= lowest)) errors.push(lowest < 0 ? `base must be ${lowest} (the ceiling of the level below) or more mm above the floor` : 'base must be 0 or more mm above the floor');
  if (s.height !== undefined && !(Number.isFinite(s.height) && s.height > 0)) errors.push('height must be more than 0 mm');
  if (s.color !== undefined && !HEX.test(s.color)) errors.push(`colour "${s.color}" must look like #rrggbb`);
  if (s.cutsWalls !== undefined && typeof s.cutsWalls !== 'boolean') errors.push('cutsWalls must be true or false');
  const top = s.height !== undefined ? (s.base ?? 0) + s.height : level.ceilingHeight ?? 2400;
  if (s.height !== undefined && top > (level.ceilingHeight ?? 2400) + 1) warnings.push(`rises to ${top} mm, above the ceiling (${level.ceilingHeight ?? 2400} mm)`);
  return { errors, warnings };
}
