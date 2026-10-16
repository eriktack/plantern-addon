// An object hosted by an opening (openings-and-lit-objects OB1): on a window's sill, on its inner sill in the frame, or hanging
// from its head, placed along the opening. Its position and height are worked out from the opening, so moving or resizing the
// opening moves the object, and nothing about its place is stored (no `z`, no wall coordinates). Pure.
//
//   attach: { opening: "o_win", at: "sill" | "frame" | "head", offset?: mm from the opening's near edge (centred when absent),
//             depth?: mm out from the wall face (a sill object: the sill board's sillDepth when absent), side?: "left" | "right",
//             shift?: mm, signed, across the wall from the opening's room face: + into the room, − deeper into the opening }
//
// The zero across the wall is the opening's face on the object's side (the room face of the hole), never the window unit's:
// a "frame" object stands on the inner sill at that face and reaches into the hole by its own depth (decision 251).

/** Whether an object is hosted by an opening (rather than by a wall, or standing free). */
export const isHosted = o => o?.attach?.opening !== undefined;

/** The places an object hosted by an opening may take, and what each one is called (the panels, the Add menu, messages). */
export const HOSTED_AT = Object.freeze({ sill: 'on the sill', frame: 'on the inner sill, in the frame', head: 'at the head' });

/** Where a hosted object's `at` is, in words. */
export const hostedWhere = at => HOSTED_AT[at] ?? HOSTED_AT.sill;

/**
 * Where a hosted object is: { attach: { wall, side, offset, gap? }, z } where attach is the wall attach it stands at (the
 * same shape a wall object has, so geometry reads it through resolveAttach()) and z its bottom above the floor. Null when
 * the opening is not given. ceilingHeight is the level's, for a head with no head of its own.
 */
export function hostedPlacement(o, opening, ceilingHeight = 2400) {
  if (!opening || !Array.isArray(o.size)) return null;
  const at = o.attach?.at === 'head' ? 'head' : o.attach?.at === 'frame' ? 'frame' : 'sill';
  const side = o.attach?.side === 'left' ? 'left' : 'right';
  const along = o.attach?.offset ?? Math.max(0, ((opening.width ?? 0) - o.size[0]) / 2);
  const z = at === 'head' ? (opening.head ?? ceilingHeight) - o.size[2] : (opening.sill ?? 0);
  const shift = o.attach?.shift ?? 0;
  // the zero is the room face of the opening: a frame object reaches back into the hole by its depth (negative gap), a sill one stands out by its depth
  const base = at === 'frame' ? -o.size[1] : at === 'head' ? 0 : (o.attach?.depth ?? opening.sillDepth ?? 0);
  const gap = base + shift;
  return { attach: { wall: opening.wall, side, offset: (opening.offset ?? 0) + along, ...(gap !== 0 ? { gap } : {}) }, z };
}

/**
 * The wall attach a hosted object takes when its opening is removed: it stays where it is on the wall, facing the room.
 * A frame object, whose gap reaches into the wall, comes back to the room's face (no gap).
 */
export function freedPlacement(o, opening, ceilingHeight) {
  const p = hostedPlacement(o, opening, ceilingHeight);
  if (!p) return null;
  if (o.attach?.at !== 'frame') return p;
  const { gap, ...attach } = p.attach;   // the frame's gap reaches into the wall; once the opening is gone it stands on the face
  return { ...p, attach };
}
