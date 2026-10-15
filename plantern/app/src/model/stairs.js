// Stairs (PLANTERN.md §6.4), the rules for what may be stored. What a stair looks like and where its
// opening is comes from geometry/stairs.js; whether it fits the house is reported by validate.js.
//   { id: "st_main", to: "upper", start: { ref, offset: [dx, dy] } | { pos: [x, y] }, heading, width,
//     flights: [{ risers, length?, treads?: [mm, …], width?: mm }, …] (1 straight, 2 an L, 3 a U), turn?: "L" | "R", landing?: "square" | "winders",
//     winders?: n, underside?: "closed" | "open" | "sloped", waist?: mm, sides?: "stepped" | "sloped", handrail?: "none" | "left" | "right" | "both" (walking up), handrailHeight?: mm, handrailMount?: "wall" | "poles" (a round rail), handrailDiameter?: mm, handrailStart?: mm, handrailEnd?: mm, opening?: [[x, y], …], ignoreDepthWarning?: true, assumed?: [...] }
// Pure.

export const STAIR_UNDERSIDES = ['closed', 'open', 'sloped'];
export const STAIR_SIDES = ['stepped', 'sloped'];
export const STAIR_HANDRAILS = ['none', 'left', 'right', 'both'];
export const STAIR_RAIL_MOUNTS = ['wall', 'poles'];
export const STAIR_DEFAULTS = Object.freeze({ width: 900, riser: 180, tread: 250, underside: 'closed' });

/** Problems with the fields of a stair: { errors: [msg] }. */
export function checkStairs(st, model, level) {
  const errors = [];
  if (!/^st_[a-z0-9_]+$/.test(st?.id || '')) errors.push('a stair needs an id like st_main');
  const to = (model.levels || []).find(l => l.id === st?.to);
  if (!to) errors.push(`it goes to level "${st?.to}", which does not exist`);
  else if (to.id === level.id) errors.push('it cannot go to the level it starts on');
  else if (to.elevation <= level.elevation) errors.push(`${to.id} is not above ${level.id}: stairs are stored on the lower level and go up`);
  else if ((to.building ?? null) !== (level.building ?? null)) errors.push(`${to.id} is in another building`);
  const s = st?.start;
  if (!s || (!s.ref && !(Array.isArray(s.pos) && s.pos.length === 2 && s.pos.every(Number.isFinite)))) errors.push('start needs a point (ref + offset, or pos)');
  else if (s.ref && s.offset !== undefined && !(Array.isArray(s.offset) && s.offset.length === 2 && s.offset.every(Number.isFinite))) errors.push('start offset must be [dx, dy]');
  if (!Number.isFinite(st?.heading)) errors.push('heading must be a number of degrees');
  if (!(st?.width > 0)) errors.push('width must be more than 0');
  const fl = st?.flights;
  if (!Array.isArray(fl) || fl.length < 1 || fl.length > 3) errors.push('one, two (an L) or three flights (a U)');
  else {
    fl.forEach((f, i) => {
      if (!Number.isInteger(f?.risers) || f.risers < 1) errors.push(`flight ${i + 1}: risers must be a whole number, 1 or more`);
      if (f?.width !== undefined && !(f.width > 0)) errors.push(`flight ${i + 1}: width must be more than 0 (or left out to use the stair's width)`);
      if (f?.treads !== undefined) {
        // measured one by one: a depth per tread (risers − 1), in walking order
        if (!Array.isArray(f.treads) || f.treads.length !== f.risers - 1 || f.treads.some(d => !(d > 0))) errors.push(`flight ${i + 1}: treads must be ${Math.max((f?.risers ?? 1) - 1, 0)} depths in mm (one per tread)`);
        if (f.length !== undefined && !(f.length >= 0)) errors.push(`flight ${i + 1}: length must be a number of mm`);
      } else if (!(f?.length >= 0) || (f?.risers > 1 && !(f.length > 0))) errors.push(`flight ${i + 1}: length (the plan run) must be more than 0`);
    });
    if (fl.length > 1) {
      if (st.turn !== 'L' && st.turn !== 'R') errors.push(`${fl.length} flights need turn "L" or "R"`);
      if (st.landing !== undefined && st.landing !== 'square' && st.landing !== 'winders') errors.push('landing must be "square" or "winders"');
      if (st.landing === 'winders' && !(Number.isInteger(st.winders) && st.winders >= 2)) errors.push('winders: a whole number, 2 or more');
    }
  }
  if (st?.underside !== undefined && !STAIR_UNDERSIDES.includes(st.underside)) errors.push(`underside must be ${STAIR_UNDERSIDES.join(' or ')}`);
  if (st?.sides !== undefined && !STAIR_SIDES.includes(st.sides)) errors.push(`sides must be ${STAIR_SIDES.join(' or ')}`);
  if (st?.handrail !== undefined && !STAIR_HANDRAILS.includes(st.handrail)) errors.push(`handrail must be ${STAIR_HANDRAILS.join(', ')} (walking up)`);
  if (st?.handrailMount !== undefined && !STAIR_RAIL_MOUNTS.includes(st.handrailMount)) errors.push(`handrailMount must be ${STAIR_RAIL_MOUNTS.join(' or ')} (a round rail; left out: the square rail)`);
  if (st?.handrailDiameter !== undefined && !(st.handrailDiameter >= 20 && st.handrailDiameter <= 100)) errors.push('handrailDiameter must be 20 to 100 mm');
  for (const k of ['handrailStart', 'handrailEnd']) if (st?.[k] !== undefined && !(Number.isFinite(st[k]) && st[k] >= -1000 && st[k] <= 20000)) errors.push(`${k} must be a number of mm, -1000 to 20000 (along the flight; negative runs past its end)`);
  if (st?.handrailHeight !== undefined && !(st.handrailHeight >= 300 && st.handrailHeight <= 1500)) errors.push('handrailHeight (above the nose line) must be 300 to 1500 mm');
  if (st?.waist !== undefined && !(st.waist > 0)) errors.push('waist (thickness under a sloped underside) must be more than 0');
  if (st?.opening !== undefined && !(Array.isArray(st.opening) && st.opening.length >= 3 && st.opening.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) errors.push('opening must be a polygon of 3 or more points');
  const pt2 = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  if (st?.openingRect !== undefined && !(pt2(st.openingRect?.from) && pt2(st.openingRect?.to))) errors.push('openingRect must be { from: [x, y], to: [x, y] } in mm from the start point (two opposite corners)');
  return { errors };
}
