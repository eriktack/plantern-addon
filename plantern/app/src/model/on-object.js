// An object set into or onto another object (docs/archive/2026-10-28-kitchen.md K4, decisions 284 and 285): a sink or a hob in a worktop. Pure.
//
//   on: { object: "ob_worktop_1", offset: [x, y], up? }        set into its top (a sink, a hob)
//   on: { object: "ob_appliance_housing_1", niche: 0 }          in one of its niches (an oven): the host's stored `niches`, from its build
//
// In a niche the guest stands on the niche's floor, in the middle across it, with its front flush with the niche's opening (the
// face of the housing's doors); its offset is worked out from the niche, so it cannot be slid out (lift it out first).
//
// The guest stands on the host's top surface, `offset` mm from the middle of the host in the host's own axes (x along its width,
// y toward its back), turned the way the host is. It is stored as a free object (`pos`, `rotationDeg`, `z`), so everything that
// draws, snaps or measures a free object handles it; seatObjectsOnObjects() works those out again from the host after every edit,
// as seatCeilingObjects() does for a pendant, so moving the host moves it. `up` is the height of the host's top surface above
// the host's bottom: the host's `meta.surface` option when the blueprints are known, kept so a page without them still knows it.
//
// A guest set into a hole hangs through it: its stored `rest` (from its model's rest()) is the height of it, above its bottom,
// that rests on the host's surface (an inset sink's rim), so its bottom is that far below the surface.
//
// A guest that needs a hole (its stored `cutout`, from its model's cutout() through the server's build) gives the host that hole:
// a host whose blueprint takes holes (`meta.cutouts`) gets them all in `params.cutouts`, in its own axes, so its build (and the
// cache key, and what the add-on publishes) follows the guests.

import { hostFrame } from './assets.js';
export { hostFrame, holeOutlines } from './assets.js';
import { resolveParams } from '../../object-designs/lib/params.js';
import { buildLevelGeometry } from '../geometry/level.js';

export const isOnObject = o => o?.on?.object !== undefined;
const r1 = v => Math.round(v * 10) / 10;

/** Where a guest stands for its host's frame: { pos, rotationDeg } (a free object's corner and turn). */
export function guestPlacement(o, frame) {
  const [dx, dy] = o.on.offset ?? [0, 0], [w, d] = o.size;
  const { centre: c, u, b } = frame;
  const mid = [c[0] + u[0] * dx + b[0] * dy, c[1] + u[1] * dx + b[1] * dy];
  // a free object's footprint starts at its front left corner: half its width back along u, half its depth back along b
  const pos = [r1(mid[0] - u[0] * w / 2 - b[0] * d / 2), r1(mid[1] - u[1] * w / 2 - b[1] * d / 2)];
  let deg = (frame.heading * 180) / Math.PI;
  deg = Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  return { pos, rotationDeg: deg === 360 ? 0 : deg };
}

/** The offset a guest has when its corner is moved to `pos` (a drag, typed x/y): its middle in the host's axes. */
export function offsetFor(o, pos, frame) {
  const [w, d] = o.size, { centre: c, u, b } = frame;
  const mid = [pos[0] + u[0] * w / 2 + b[0] * d / 2, pos[1] + u[1] * w / 2 + b[1] * d / 2];
  const rel = [mid[0] - c[0], mid[1] - c[1]];
  return [r1(rel[0] * u[0] + rel[1] * u[1]), r1(rel[0] * b[0] + rel[1] * b[1])];
}

/** The holes of every guest on a host, in the host's axes (the guests turn with the host, so only their offset moves them). */
export function hostCutouts(hostId, objects) {
  const out = [];
  for (const g of objects) {
    if (g.on?.object !== hostId || !Array.isArray(g.cutout)) continue;
    const [dx, dy] = g.on.offset ?? [0, 0];
    for (const h of g.cutout) out.push({ x: r1(dx + h.x), y: r1(dy + h.y), width: h.width, depth: h.depth, radius: h.radius ?? 0 });
  }
  return out;
}

/** The height of a host's top surface above its bottom, from its blueprint's `meta.surface`; null when it cannot be known. */
export function surfaceOf(host, blueprints) {
  const meta = host?.blueprint && blueprints?.get?.(host.blueprint);
  if (!meta?.surface) return null;
  try { return resolveParams(meta, host.params ?? {})[meta.surface]; } catch { return null; }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Brings every guest up to date with its host (its pos, turn, z and `up`) and every host that takes holes up to date with its
 * guests (`params.cutouts`). A guest whose host is gone loses `on` and stays where it is. Returns the same model when nothing
 * changed. `blueprints` (a Map of id → meta) is optional: without it the surface comes from the stored `up` and holes are left as stored.
 */
export function seatObjectsOnObjects(model, blueprints = null) {
  let changed = false;
  const levels = (model.levels || []).map(lv => {
    const objects = lv.objects || [];
    const guests = objects.filter(isOnObject);
    const holeHosts = blueprints ? objects.filter(o => blueprints.get?.(o.blueprint)?.cutouts) : [];
    if (!guests.length && !holeHosts.some(h => h.params?.cutouts)) return lv;
    const byId = new Map(objects.map(o => [o.id, o]));
    let geo = null;
    const next = objects.map(o => {
      if (!isOnObject(o)) return o;
      const host = byId.get(o.on.object);
      if (!host || isOnObject(host) || !Array.isArray(host.size) || !Array.isArray(o.size)) {
        if (host && !isOnObject(host)) return o;            // a host with no size yet: wait
        const { on, ...rest } = o;                         // the host is gone: it stays where it stands, as a free object
        changed = true;
        return rest;
      }
      geo ??= buildLevelGeometry(lv);
      const fp = geo.objectFootprint(host);
      if (!fp) return o;
      const frame = hostFrame(host, fp);
      let on, z;
      if (o.on.niche !== undefined) {
        const n = host.niches?.[o.on.niche];
        if (!n) return o;                                  // the housing's niches are not known yet (its build): it stays as it is
        on = { object: o.on.object, niche: o.on.niche, offset: [r1(n.x), r1(n.front + o.size[1] / 2)] };
        z = r1(frame.z + n.z);
      } else {
        const up = surfaceOf(host, blueprints) ?? o.on.up ?? host.size[2];
        on = { ...o.on, up };
        z = r1(frame.z + up - (Number.isFinite(o.rest) ? o.rest : 0));
      }
      const { pos, rotationDeg } = guestPlacement({ ...o, on }, frame);
      if (same(o.pos, pos) && o.rotationDeg === rotationDeg && o.z === z && same(o.on, on)) return o;
      changed = true;
      const { attach, hangs, ...rest } = o;
      return { ...rest, pos, rotationDeg, z, on };
    });
    const withHoles = next.map(o => {
      if (!holeHosts.some(h => h.id === o.id)) return o;
      const cutouts = hostCutouts(o.id, next);
      const had = o.params?.cutouts ?? [];
      if (same(had, cutouts)) return o;
      changed = true;
      const { cutouts: _, ...params } = o.params ?? {};
      return { ...o, params: cutouts.length ? { ...params, cutouts } : params };
    });
    return { ...lv, objects: withHoles };
  });
  return changed ? { ...model, levels } : model;
}

/** Problems with an object's `on` and `cutout`: { errors, warnings }. */
export function checkOnObject(o, level) {
  const errors = [], warnings = [];
  if (o.cutout !== undefined) {
    if (!Array.isArray(o.cutout) || o.cutout.some(h => !['x', 'y', 'width', 'depth'].every(k => Number.isFinite(h?.[k])) || !(h.width > 0 && h.depth > 0))) {
      errors.push('cutout must be a list of holes { x, y, width, depth, radius } in mm (from its build)');
    }
  }
  if (o.niches !== undefined && !(Array.isArray(o.niches) && o.niches.every(n => ['x', 'y', 'z', 'width', 'depth', 'height', 'front'].every(k => Number.isFinite(n?.[k]))))) {
    errors.push('niches must be a list of { kind, x, y, z, width, depth, height, front } in mm (from its build)');
  }
  if (o.rest !== undefined && !(Number.isFinite(o.rest) && o.rest >= 0)) errors.push('rest must be 0 or more mm (the height of it that rests on what it is set into, from its build)');
  if (o.on === undefined) return { errors, warnings };
  if (!o.on || typeof o.on.object !== 'string') { errors.push('on.object must be the id of the object it stands on'); return { errors, warnings }; }
  if (o.on.niche !== undefined && o.on.up !== undefined) errors.push('in a niche an object has no on.up');
  if (o.on.offset !== undefined && !(Array.isArray(o.on.offset) && o.on.offset.length === 2 && o.on.offset.every(Number.isFinite))) errors.push('on.offset must be [x, y] in mm');
  if (o.attach) errors.push('an object on another object stands free (pos), not on a wall or in an opening');
  const host = (level.objects || []).find(x => x.id === o.on.object);
  if (!host) { errors.push(`stands on a missing object "${o.on.object}"`); return { errors, warnings }; }
  if (host.id === o.id) errors.push('cannot stand on itself');
  else if (isOnObject(host)) errors.push(`${host.id} stands on another object itself, so nothing can stand on it`);
  else if (o.on.niche !== undefined) {
    const i = o.on.niche, n = host.niches?.[i];
    if (!Number.isInteger(i) || i < 0) errors.push('on.niche must be the number of a niche (0 is the lowest)');
    else if (!n) warnings.push(`${host.id} has no niche ${i + 1} that is known (its build gives its niches: Check the build on it)`);
    else if (Array.isArray(o.size) && (o.size[0] > n.width + 1 || o.size[1] > n.depth + 1 || o.size[2] > n.height + 1)) {
      warnings.push(`does not fit niche ${i + 1} of ${host.id} (${n.width} × ${n.depth} × ${n.height} mm)`);
    }
  }
  else if (Array.isArray(host.size) && Array.isArray(o.size)) {
    const [dx, dy] = o.on.offset ?? [0, 0];
    if (Math.abs(dx) + o.size[0] / 2 > host.size[0] / 2 + 1 || Math.abs(dy) + o.size[1] / 2 > host.size[1] / 2 + 1) warnings.push(`reaches past the edge of ${host.id}`);
    const clash = overlappingCutouts(host.id, level.objects || []).filter(p => p.includes(o.id)).map(p => (p[0] === o.id ? p[1] : p[0]));
    if (clash.length) warnings.push(`its hole in ${host.id} runs into the hole of ${[...new Set(clash)].join(', ')}`);
  }
  return { errors, warnings };
}

/** Holes on one host that overlap each other: [[idA, idB]] for the guests whose holes run into one another. */
export function overlappingCutouts(hostId, objects) {
  const holes = [];
  for (const g of objects) {
    if (g.on?.object !== hostId || !Array.isArray(g.cutout)) continue;
    const [dx, dy] = g.on.offset ?? [0, 0];
    for (const h of g.cutout) holes.push({ id: g.id, x0: dx + h.x - h.width / 2, x1: dx + h.x + h.width / 2, y0: dy + h.y - h.depth / 2, y1: dy + h.y + h.depth / 2 });
  }
  const out = [];
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
    const a = holes[i], b = holes[j];
    if (a.id !== b.id && a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5) out.push([a.id, b.id]);
  }
  return out;
}

/**
 * Guests whose part below the surface (an inset sink's bowl) runs into the top of a kitchen cabinet under them: its own worktop,
 * or its 18 mm top panel when it has none (a sink cabinet has the panel off: `topPanel: false`). [{ id, msg }] for the validator.
 * `overlap(a, b)` says whether two footprints overlap (the validator's polygonsOverlap); blueprints give the cabinets' options.
 */
export function bowlClashes(level, geo, blueprints, overlap) {
  const meta = blueprints?.get?.('kitchen-cabinet');
  if (!meta || !geo) return [];
  const objects = level.objects || [], out = [];
  const tops = [];
  for (const c of objects) {
    if (c.blueprint !== 'kitchen-cabinet' || isOnObject(c)) continue;
    let q; try { q = resolveParams(meta, c.params ?? {}); } catch { continue; }
    if (!['base', 'base_drawer'].includes(q.variant)) continue;
    const z = (c.z ?? 0) + q.height;
    const band = q.worktop ? [z, z + q.worktopThickness, 'worktop'] : q.topPanel ? [z - 18, z, 'top panel'] : null;
    const fp = band && geo.objectFootprint(c);
    if (fp) tops.push({ c, band, fp });
  }
  for (const g of objects) {
    if (!isOnObject(g) || !(g.rest > 0)) continue;
    const fp = geo.objectFootprint(g);
    if (!fp) continue;
    const z0 = g.z ?? 0, z1 = z0 + g.rest;
    for (const { c, band, fp: cf } of tops) {
      if (Math.min(z1, band[1]) - Math.max(z0, band[0]) <= 1 || !overlap(fp, cf)) continue;
      out.push({ id: g.id, msg: `runs into the ${band[2]} of ${c.id}: turn off that cabinet's ${band[2] === 'top panel' ? 'Top panel (it becomes a sink cabinet)' : 'Worktop'}` });
    }
  }
  return out;
}

