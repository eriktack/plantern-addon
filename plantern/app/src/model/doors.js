// Door state (PLANTERN.md §6.1, §8): a hinged door is open unless its Home Assistant sensor says closed. Pure.
// `states` is a Map(openingId → 'open' | 'closed' | 'unknown') from ha/door.js; a door without a binding is not in it.
// Sliding and pocket doors have no leaf that swings, so their state changes nothing.

/** A door whose leaf swings on a hinge (not sliding, not pocket). */
export const isHingedDoor = o => o.type === 'door' && o.opens !== 'sliding' && o.opens !== 'pocket';

/** Is a hinged door open? Unknown and unbound doors count as open (the default). */
export const doorOpen = (o, states) => states?.get(o.id) !== 'closed';
