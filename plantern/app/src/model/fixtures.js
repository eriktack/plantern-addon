// Fixtures (lamps, switches; PLANTERN.md §6.1): the rules a fixture must meet. Pure.
// A fixture is either free (`pos` [x, y], e.g. a ceiling lamp) or on a wall face (`attach` { wall,
// side, offset, gap? }, e.g. a switch or a wall lamp); `z` is its height above the floor in mm.
// Lamps carry `radius` (how far their light reaches in the plan). HA bindings live in location.json.

import { wallProfile } from '../geometry/walls.js';
import { pointInPolygon } from '../geometry/polygon.js';
import { roomAt, roomCeiling } from './rooms.js';

export const FIXTURE_KINDS = ['lamp', 'switch'];
/** Defaults for a new fixture; `z` is listed in `assumed` until measured (a ceiling lamp's z is the ceiling). */
export const FIXTURE_DEFAULTS = { lamp: { radius: 3000 }, switch: { z: 1100 }, wallLamp: { z: 1800 } };

/** Problems with a fixture: { errors: [msg], warnings: [msg] }. */
export function checkFixture(fx, level) {
  const errors = [], warnings = [];
  if (!FIXTURE_KINDS.includes(fx.kind)) errors.push(`kind must be ${FIXTURE_KINDS.join(' or ')}`);
  if (!fx.attach && !fx.pos) errors.push('needs a position (pos) or a wall it is on (attach)');
  if (fx.kind === 'switch' && !fx.attach) errors.push('a switch sits on a wall (attach)');
  if (!Number.isFinite(fx.z)) errors.push('z (height above the floor) must be a number of mm');
  let top = level.ceilingHeight ?? 2400;
  if (fx.pos) { const r = roomAt(level, fx.pos, pointInPolygon); if (r) top = roomCeiling(level, r); }   // a lowered ceiling in that room
  if (fx.attach) {
    const w = (level.walls || []).find(x => x.id === fx.attach.wall);
    if (!w) errors.push(`attached to missing wall "${fx.attach.wall}"`);
    else {
      top = wallProfile(w, level).at(fx.attach.offset ?? 0).top;           // the wall's height where it is
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      if (!(fx.attach.offset >= 0 && fx.attach.offset <= L + 1)) errors.push(`not on ${w.id} (${Math.round(L)} mm long): offset ${fx.attach.offset}`);
      if (!['left', 'right'].includes(fx.attach.side)) errors.push('attach.side must be "left" or "right"');
      const hole = (level.openings || []).find(o => o.wall === w.id && fx.attach.offset > o.offset + 1 && fx.attach.offset < o.offset + o.width - 1 && fx.z > o.sill && fx.z < o.head);
      if (hole) warnings.push(`sits in the opening ${hole.id}`);
    }
  } else if (fx.pos && !(level.rooms || []).some(r => r.polygon?.length >= 3 && pointInPolygon(fx.pos, r.polygon))) warnings.push('is not inside any room');
  if (Number.isFinite(fx.z) && (fx.z < 0 || fx.z > top + 1)) errors.push(`height ${fx.z} mm is outside 0–${Math.round(top)} mm (floor to ${fx.attach ? 'the top of the wall there' : 'ceiling'})`);
  if (fx.radius !== undefined && !(fx.radius > 0)) errors.push('radius must be more than 0');
  return { errors, warnings };
}
