// A lit object is a light (plan openings-and-lit-objects LA3): its light is a lamp in the level's fixtures, worked out from
// the object's place and its light point. The lamp is derived, never stored: it carries `derived: true` and the object's
// id, so the house's binding for the object (location.json → bindings[<object id>]) is the binding of the lamp. Pages add
// the derived lamps to what they show (addLitLamps) and the save takes them out again (stripLitLamps). Pure.

import { lightInPlan } from '../blueprints/light.js';
import { unitSpan } from '../geometry/fittings.js';
import { fallbackName } from './names.js';

/** Plan radius of a lit object’s light (mm) when it has none of its own. */
export const LIT_RADIUS = 3000;
/** The default radius per kind of lit model (openings-and-lit-objects LA5; proposed values, to check on the house). */
export const LIT_RADIUS_BY_KIND = { 'table-lamp': 2000, 'floor-lamp': 2500, 'wall-sconce': 2000, 'ceiling-light': 3500 };
/** The radius of an object’s light: its own (lightRadius), else the default of its kind, else LIT_RADIUS. */
export const litRadius = o => o.lightRadius ?? LIT_RADIUS_BY_KIND[o.blueprint] ?? LIT_RADIUS;

// The level's `fixtures` as it was before the derived lamps were added (undefined when it had none). A symbol key: JSON
// never writes it, so a level without fixtures is saved without them, as before.
const BEFORE = Symbol('fixtures before the lit lamps were added');

/**
 * A lamp that stands in a window or door opening (hosted by it) may be deep enough that its light lies beyond the window unit, on the outside of the
 * frame and sash: the 3D view then throws their shadows into the room. The light is kept on the room's side of the unit (10 mm in front of its room
 * face); the lamp itself is drawn where it is. Other lamps are returned as they are.
 */
function roomSideOfUnit(o, level, geo, pos) {
  const op = o.attach?.opening !== undefined ? (level.openings || []).find(x => x.id === o.attach.opening) : null;
  if (!op || op.type === 'passage') return pos;
  const w = geo.wallById?.get(op.wall), f = w && geo.frames?.get(w.id);
  if (!f?.n) return pos;
  const { t0, t1 } = unitSpan(w, f, op), t = (pos[0] - w.a[0]) * f.n[0] + (pos[1] - w.a[1]) * f.n[1];
  const left = o.attach?.side === 'left';                    // the room is on the wall's left (+ along its normal) or on its right
  const want = left ? Math.max(t, t1 + 10) : Math.min(t, t0 - 10);
  return want === t ? pos : [pos[0] + f.n[0] * (want - t), pos[1] + f.n[1] * (want - t)];
}

/**
 * The derived lamps of one level: one per object whose light is known (`lightOf(object)` gives [x, y, z] in the model's own
 * axes or null). geo: buildLevelGeometry() of the level, for the object's footprint. Returns [] when nothing is lit.
 */
export function litLamps(level, geo, lightOf) {
  const out = [];
  for (const o of level.objects || []) {
    const light = lightOf(o);
    if (!light || !geo) continue;
    const at = lightInPlan(geo.objectFootprint(o), o.size, light);
    if (!at) continue;
    out.push({ id: o.id, name: fallbackName(o, 'object'), kind: 'lamp', pos: roomSideOfUnit(o, level, geo, at.pos), z: geo.objectZ(o) + at.z, radius: litRadius(o), derived: true });
  }
  return out;
}

/** Adds each level's derived lamps to its fixtures, in place (earlier derived lamps are replaced). For showing only. */
export function addLitLamps(model, geos, lightOf) {
  for (const lv of model.levels || []) {
    const derived = litLamps(lv, geos.get(lv.id), lightOf);
    if (!derived.length && !(lv.fixtures || []).some(f => f.derived)) continue;   // nothing lit here, nothing added before
    if (!(BEFORE in lv)) lv[BEFORE] = lv.fixtures;
    lv.fixtures = [...(lv.fixtures || []).filter(f => !f.derived), ...derived];
  }
  return model;
}

/** The model as it is saved: the same model without the derived lamps. The input is not changed. */
export function stripLitLamps(model) {
  if (!model?.levels?.some(lv => (lv.fixtures || []).some(f => f.derived))) return model;
  return {
    ...model,
    levels: model.levels.map(lv => {
      if (!(lv.fixtures || []).some(f => f.derived)) return lv;
      // the keys keep their order (the file is written in its own order); fixtures stays only when it was there or is not empty
      const kept = lv.fixtures.filter(f => !f.derived), before = BEFORE in lv ? lv[BEFORE] : undefined;
      const out = {};
      for (const k of Object.keys(lv)) {
        if (k !== 'fixtures') out[k] = lv[k];
        else if (before !== undefined || kept.length) out.fixtures = kept;
      }
      return out;
    }),
  };
}
