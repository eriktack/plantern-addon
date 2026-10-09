// What a fixture looks like and what clicking it does, from its binding and the HA states. Pure: shared by
// the viewer (src/app.js) and the Lovelace card (src/card/), so both behave the same.

import { appearance } from './appearance.js';

const STATIC_LOOK = { available: true, on: false, brightness: 0, rgb: [255, 214, 170] };

/**
 * { available, on, brightness, rgb } of a fixture. bindings: location.json → bindings; getState(entityId)
 * gives an HA state or undefined. A switch that only controls lamps shows what they do; a fixture with no
 * binding is static.
 */
export function fixtureAppearance(bindings, getState, fx) {
  const b = bindings?.[fx.id];
  if (b?.entity) return appearance(getState(b.entity), b.look);
  if (b?.controls?.length) {
    const as = b.controls.map(id => appearance(bindings[id]?.entity && getState(bindings[id].entity), bindings[id]?.look));
    const on = as.find(a => a.on);
    return { available: as.some(a => a.available), on: !!on, brightness: on ? 1 : 0, rgb: (on || as[0]).rgb };
  }
  return STATIC_LOOK;
}

/**
 * The service calls a click on a fixture makes: { calls: [{ domain, service, target: { entity_id } }] } or
 * { error } with a message for the person. A bound entity is toggled; a switch with `controls` turns all the
 * controlled entities off when any is on, else on (one call per domain).
 */
export function toggleCalls(bindings, getState, fx) {
  const b = bindings?.[fx.id];
  if (b?.entity) {
    const s = getState(b.entity);
    if (!s || s.state === 'unavailable') return { error: `${b.entity} is ${s ? 'unavailable' : 'missing in HA'}` };
    return { calls: [{ domain: b.entity.split('.')[0], service: 'toggle', target: { entity_id: b.entity } }] };
  }
  if (b?.controls?.length) {
    const ents = b.controls.map(id => bindings[id]?.entity).filter(e => e && getState(e));
    if (!ents.length) return { error: `${fx.id}: none of the controlled fixtures has an available entity` };
    const anyOn = ents.some(e => getState(e).state === 'on');
    const byDomain = new Map();
    for (const e of ents) { const d = e.split('.')[0]; byDomain.set(d, [...(byDomain.get(d) || []), e]); }
    return { calls: [...byDomain].map(([domain, ids]) => ({ domain, service: anyOn ? 'turn_off' : 'turn_on', target: { entity_id: ids } })) };
  }
  return { error: `${fx.id} is not bound to anything` };
}
