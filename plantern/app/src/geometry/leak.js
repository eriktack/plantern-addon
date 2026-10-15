// Where a lamp's light is wrongly let through walls in the 3D view (PLANTERN.md §8). A 3D point light stops at walls only
// when it casts a shadow, and shadows are budgeted (decision 113). The plan's visibility already says where a lamp's
// light is blocked, so the blocked part of its reach is the part a shadowless lamp would light through a wall. Pure.
import { occluders } from './level.js';
import { visibility } from './visibility.js';
import { signedArea } from './polygon.js';

/**
 * Map(lampId → mm²): the part of each lamp's reach (a disc of its radius, 3000 mm by default) that walls hide in the plan,
 * for the lamps of one level. geo from buildLevelGeometry(); `cutPlane` as in the plan; `doorStates` as in the plan
 * (an open door lets light past its gap). 0 for a lamp with nothing in the way.
 */
export function lampLeaks(geo, lamps, options = {}) {
  return new Map([...lampReach(geo, lamps, options)].map(([id, r]) => [id, r.leak]));
}

/**
 * Map(lampId → { centre, radius, polygon, leak }): where each lamp's light goes in the plan. `polygon` is its visibility polygon (plan mm), `leak` the
 * part of its reach it does not cover (mm², as lampLeaks). The 3D view makes a mask of the polygon (render3d/lamp-mask.js).
 */
export function lampReach(geo, lamps, { cutPlane = 1200, doorStates = null } = {}) {
  const out = new Map(), occ = occluders(geo, { cutPlane, doorStates });
  for (const fx of lamps) {
    const c = geo.fixturePos(fx);
    if (!c) continue;
    const R = fx.radius || 3000, polygon = visibility(c, R, occ);
    out.set(fx.id, { centre: c, radius: R, polygon, leak: Math.max(0, Math.PI * R * R - Math.abs(signedArea(polygon))) });
  }
  return out;
}
