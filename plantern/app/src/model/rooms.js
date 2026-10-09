// Room options beyond the outline (PLANTERN.md §6.1), pure:
//   floor: "slab" (default) | "none"   no slab: the room is open to the level below (double height, a gallery)
//   floorOffset: mm                   its floor above (+) or below (−) the level's finished floor (a step)
//   ceilingHeight: mm                 its own ceiling instead of the level's (a lowered bathroom ceiling)

export const ROOM_FLOORS = ['slab', 'none'];

/** The ceiling height of a room: its own, else the level's. */
export const roomCeiling = (level, room) => room?.ceilingHeight ?? level.ceilingHeight ?? 2400;

/** The room of the level that a plan point is in (first match), or undefined. */
export function roomAt(level, p, inside) {
  return (level.rooms || []).find(r => r.polygon?.length >= 3 && inside(p, r.polygon));
}

/** Problems with the options of a room: { errors, warnings } (level = its level, `below` = whether a level lies below it). */
export function checkRoomOptions(r, level, below) {
  const errors = [], warnings = [];
  if (r.floor !== undefined && !ROOM_FLOORS.includes(r.floor)) errors.push(`floor must be ${ROOM_FLOORS.map(f => `"${f}"`).join(' or ')}`);
  if (r.floorOffset !== undefined && !Number.isFinite(r.floorOffset)) errors.push('floorOffset must be a number of mm');
  if (r.ceilingHeight !== undefined && !(r.ceilingHeight > 0)) errors.push('ceilingHeight must be more than 0');
  if (r.floor === 'none' && !below) warnings.push('has no floor and nothing below it: there is nothing to look down onto');
  if (r.floor === 'none' && r.floorOffset) warnings.push('floorOffset has no effect without a floor');
  if (Number.isFinite(r.ceilingHeight) && r.ceilingHeight > (level.ceilingHeight ?? Infinity) + 1) warnings.push(`ceiling ${r.ceilingHeight} mm is higher than the level's ${level.ceilingHeight} mm: only a room open to the level above can be that high`);
  return { errors, warnings };
}
