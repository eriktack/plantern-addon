// Where a lit object's light is in the plan (plan openings-and-lit-objects LA2). The model's light point is in its own axes,
// centred on x = y = 0 with the front at −y (AGENT_INSTRUCTIONS §2 and §3.3). The object's footprint in the plan (geometry/level.js
// objectFootprint: a free object by its corner and rotation, an attached one by its wall) gives the place and the heading: the model's origin is
// the middle of the footprint, its x axis runs along the first edge (corner 0 to corner 1) and its +y is to the left of that. Pure.

/**
 * The plan point of a lit object's light. footprint: the four corners of the object's footprint in plan mm, in the order
 * objectFootprint() gives them ([0,0], [w,0], [w,d], [0,d] in its own axes); size: [w, d, h] of the object in mm; light:
 * [x, y, z] of its lightPoint() in mm. Returns { pos: [x, y], z } (pos in plan mm, z above the floor), or null without a footprint.
 */
export function lightInPlan(footprint, size, light, turned = false) {
  if (!Array.isArray(footprint) || footprint.length < 4 || !Array.isArray(size) || !Array.isArray(light)) return null;
  const [w, d] = size, [lx, ly, lz] = light;
  if (!(w > 0 && d > 0) || ![lx, ly, lz].every(Number.isFinite)) return null;
  // The model's +y is to the left of its width axis (how the 3D view turns the model by the heading p0 → p1). Not read from corner 3: an
  // object on the right side of a wall has a clockwise footprint, where corner 3 lies on the model's −y side. `turned`: a model on the
  // left side of a wall is turned half a turn (turnedToWall in model/assets.js), as the 3D view turns it.
  const p0 = footprint[0], p1 = footprint[1], s = turned ? -1 : 1;
  const ex = [s * (p1[0] - p0[0]) / w, s * (p1[1] - p0[1]) / w], ey = [-ex[1], ex[0]];
  // from the middle of the footprint, which is the model's own origin (x = y = 0)
  const c = [(footprint[0][0] + footprint[2][0]) / 2, (footprint[0][1] + footprint[2][1]) / 2];
  return { pos: [c[0] + ex[0] * lx + ey[0] * ly, c[1] + ex[1] * lx + ey[1] * ly], z: lz };
}
