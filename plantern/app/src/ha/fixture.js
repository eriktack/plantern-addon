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

/** A lamp or LED strip with nothing to switch: no entity and no controlled fixtures. The viewer lets a click turn it on and off as a preview. */
export function isUnboundLight(bindings, fx) {
  const b = bindings?.[fx.id];
  return (fx.kind === 'lamp' || fx.kind === 'strip') && !b?.entity && !b?.controls?.length;
}

/**
 * Whether a click previews the light instead of switching it: a lamp or strip with nothing to switch (isUnboundLight), or one whose entity Home Assistant
 * does not have or reports unavailable (not connected, or the device is off the network). Whatever HA reports wins again as soon as it can.
 */
export function canPreview(bindings, getState, fx) {
  if (isUnboundLight(bindings, fx)) return 'unbound';
  const e = (fx.kind === 'lamp' || fx.kind === 'strip') && bindings?.[fx.id]?.entity;
  if (!e) return null;
  const s = getState(e);
  return !s || s.state === 'unavailable' || s.state === 'unknown' ? 'unavailable' : null;
}

/**
 * What a previewed light looks like, on or off: the look set on the light (`look` of its binding: colour, temperature, brightness), else the default
 * warm white. Never sent anywhere, gone when the page is reloaded.
 */
export const previewLook = (on, look) => appearance({ state: on ? 'on' : 'off', attributes: {} }, look);

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
