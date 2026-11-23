// Door state (PLANTERN.md §6.1, §8): a hinged door follows its Home Assistant sensor; without one (or while the sensor's state is
// unknown) it is drawn as its `defaultState` says: open (the default) or "closed" (decision 319). Pure.
// `states` is a Map(openingId → 'open' | 'closed' | 'unknown') from ha/door.js; a door without a binding is not in it.
// Sliding and pocket doors have no leaf that swings, so their state changes nothing.

/** A door whose leaf swings on a hinge (not sliding, not pocket). */
export const isHingedDoor = o => o.type === 'door' && o.opens !== 'sliding' && o.opens !== 'pocket';

export const DOOR_DEFAULT_STATES = ['open', 'closed'];

/** Is a hinged door open? Its sensor's state when it says open or closed, else the door's `defaultState` (open unless "closed"). */
export function doorOpen(o, states) {
  const s = states?.get(o.id);
  if (s === 'closed') return false;
  if (s === 'open') return true;
  return o?.defaultState !== 'closed';
}
