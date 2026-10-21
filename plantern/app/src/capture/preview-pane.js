// The rules of the Editor's 3D preview pane that need no page (docs/archive/2026-10-21-live-3d-preview.md): when it is open at first, what a light looks like in it, and
// when it shows the room by night. Pure, so they are tested (tests/preview-pane.test.js); the pane itself is src/capture/editor/preview3d.js.

import { fixtureAppearance, canPreview, previewLook } from '../ha/fixture.js';

/** Whether the pane is open with nothing remembered: on a desktop with room for it beside the plan and the sidebar, not on a phone or a small window. */
export const DEFAULT_OPEN_PX = 1200;
export const openByDefault = (width = globalThis.innerWidth ?? 1400) => width >= DEFAULT_OPEN_PX;


/**
 * What a fixture looks like in the pane: a lamp or strip with nothing to switch (or whose entity has no state here) shows the preview the person
 * made (on / off, in the look set on it: the form's while it is open); a switch shows what the lamps it controls do; whatever Home Assistant
 * reports wins for a light that has a state.
 */
export function paneAppearance(fx, bindings, lights, getState, fixtureById) {
  const b = bindings?.[fx.id];
  if (fx.kind === 'switch') {
    if (b?.entity || !b?.controls?.length) return fixtureAppearance(bindings, getState, fx);
    const as = b.controls.map(id => { const f = fixtureById(id); return f ? paneAppearance(f, bindings, lights, getState, fixtureById) : fixtureAppearance(bindings, getState, { id }); });
    const on = as.find(a => a.on);
    return { available: as.some(a => a.available), on: !!on, brightness: on ? on.brightness : 0, rgb: (on || as[0] || { rgb: [255, 214, 170] }).rgb };
  }
  if (canPreview(bindings, getState, fx)) return previewLook(!!lights.get(fx.id), b?.look);
  return fixtureAppearance(bindings, getState, fx);
}

/** Whether the pane shows the room by night: the person's choice, else when lights are being tried or a light is what is edited. */
export function showsNight(choice, lightsUsed, sel, level, bindings, lightOf = o => o.light) {
  if (choice !== null && choice !== undefined) return choice === 'night';
  if (lightsUsed) return true;
  if (!sel) return false;
  if (sel.kind === 'fixture') { const f = (level?.fixtures || []).find(x => x.id === sel.id); return f ? f.kind === 'lamp' || f.kind === 'strip' : false; }
  if (sel.kind === 'object') { const o = (level?.objects || []).find(x => x.id === sel.id); return !!(o && (lightOf(o) || bindings?.[o.id]?.entity || o.lightRadius)); }
  return false;
}
