// Placing a blueprint into a house (docs/plans/object-templates.md, T6): what the Objects page offers for a level and
// what it hands to addObject() / setObject(). Pure.

import { labelPoint } from '../geometry/polygon.js';
import { displayName } from '../model/names.js';

/** Map of blueprint id to meta, for checkObject() and validateModel() (decision 24), from the list the server answers. */
export function blueprintMap(list) {
  return new Map((list?.blueprints ?? []).map(b => [b.id, b.meta]));
}

/** Where an object can go on `level`: its rooms (with their middle) and its walls (with their length and rooms). */
export function placeOptions(level) {
  const rooms = (level.rooms || []).filter(r => r.polygon?.length >= 3).map(r => ({ id: r.id, name: displayName(r), centre: labelPoint(r.polygon).pos }));
  const roomName = new Map((level.rooms || []).map(r => [r.id, displayName(r)]));
  const walls = (level.walls || []).filter(w => w.kind !== 'virtual').map(w => {
    const length = Math.round(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]));
    const where = (w.rooms || []).map(id => roomName.get(id) ?? id).join(' / ');
    return { id: w.id, length, label: `${displayName(w)}${where ? ` · ${where}` : ''} · ${length} mm` };
  });
  return { rooms, walls };
}

const num = v => (typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : v);

/**
 * The spec for addObject() from the Place form. `place` is { kind: 'room', x, y, rotationDeg } (standing in the plan) or
 * { kind: 'wall', wall, side, offset, gap } (on a wall face); `z` is the bottom above the floor, `size` the built size
 * [w, d, h] the server answered. Returns { spec } or { error } with a message for the form.
 */
export function placeSpec({ blueprint, params, partMaterials, size, z, name, place }) {
  if (!blueprint) return { error: 'Pick a blueprint first.' };
  if (!Array.isArray(size) || size.length !== 3 || !size.every(v => Number.isFinite(v) && v > 0)) return { error: 'The size of the object is not known yet.' };
  const bottom = num(z ?? 0);
  if (!Number.isFinite(bottom) || bottom < 0) return { error: 'The bottom (mm above the floor) must be 0 or more.' };
  // the size is the build's bounding box (decision 25); it stays listed as assumed until the person has checked it
  const spec = { blueprint, params: { ...params }, partMaterials: { ...partMaterials }, size, z: bottom, assumed: ['size'] };
  if (name && String(name).trim()) spec.name = String(name).trim();
  if (place?.kind === 'wall') {
    const blank = v => v === undefined || (typeof v === 'string' && v.trim() === '');   // an empty box means 0
    const offset = blank(place.offset) ? 0 : num(place.offset), gap = blank(place.gap) ? 0 : num(place.gap);
    if (!place.wall) return { error: 'Pick the wall.' };
    if (!(offset >= 0)) return { error: 'The distance along the wall must be 0 or more.' };
    if (!(gap >= 0)) return { error: 'The gap to the wall must be 0 or more.' };
    spec.attach = { wall: place.wall, side: place.side === 'left' ? 'left' : 'right', offset, ...(gap > 0 ? { gap } : {}) };
    return { spec };
  }
  const x = num(place?.x), y = num(place?.y), rotationDeg = num(place?.rotationDeg ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Enter where it stands: x and y in mm, or pick a room.' };
  if (!Number.isFinite(rotationDeg)) return { error: 'The turn must be a number of degrees.' };
  spec.pos = [Math.round(x), Math.round(y)];
  spec.rotationDeg = rotationDeg;
  return { spec };
}

/**
 * The changes for setObject() when the options of a placed object are applied: the blueprint's values, and the size the
 * server built (so the box in the plan is the object's real size). `assumed` is cleared of "size" by setObject itself.
 */
export function optionProps({ params, partMaterials, size }) {
  return {
    params: { ...params },
    partMaterials: partMaterials && Object.keys(partMaterials).length ? { ...partMaterials } : null,
    ...(Array.isArray(size) ? { size } : {}),
  };
}

/** Finds a placed object by id: { level, object } or null. */
export function findObject(model, id) {
  for (const level of model.levels || []) {
    const object = (level.objects || []).find(o => o.id === id);
    if (object) return { level, object };
  }
  return null;
}
