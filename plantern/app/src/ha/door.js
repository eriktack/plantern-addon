// A door's state from Home Assistant (PLANTERN.md §6.1, §9): a door is bound in location.json → bindings like a lamp,
// to a binary_sensor (on = open) or any entity that says open / closed (`entity`), and/or to a `lock` entity (`lock`:
// locked or unlocked). Pure: shared by the viewer and the card.

/** 'open' | 'closed' | 'unknown' from one HA state object (or undefined when the entity is missing). */
export function doorStateOf(state) {
  const s = state?.state;
  if (s === 'on' || s === 'open') return 'open';
  if (s === 'off' || s === 'closed') return 'closed';
  return 'unknown';           // unavailable, unknown, a value we do not read as open or closed, or no entity
}

/**
 * 'locked' | 'unlocked' | 'jammed' | 'unknown' from the state of a Home Assistant `lock` entity. A lock that is busy (locking, unlocking, open,
 * opening) is not locked yet; unavailable, unknown and a missing entity are 'unknown' (drawn greyed out, never as a guess).
 */
export function lockStateOf(state) {
  switch (state?.state) {
    case 'locked': return 'locked';
    case 'unlocked': case 'unlocking': case 'locking': case 'open': case 'opening': return 'unlocked';
    case 'jammed': return 'jammed';
    default: return 'unknown';
  }
}

/** The key under which a door's lock state sits in the map `doorStates()` returns (next to its open / closed state under the opening's id). */
export const lockKey = id => `lock:${id}`;
/** A door's lock state from that map: 'locked' | 'unlocked' | 'jammed' | 'unknown', or undefined when the door has no lock link. */
export const lockOf = (states, o) => states?.get?.(lockKey(o.id));

/** The Home Assistant entities that are door sensors or door locks: Set of entity ids bound to a door opening of the model (bindings: location.json → bindings). */
export function doorEntities(model, bindings) {
  const out = new Set();
  for (const lv of model.levels || []) for (const o of lv.openings || []) {
    if (o.type !== 'door') continue;
    for (const e of [bindings?.[o.id]?.entity, bindings?.[o.id]?.lock]) if (e) out.add(e);
  }
  return out;
}

/**
 * Map(openingId → state) for every door opening that has a binding with an entity: 'open' | 'closed' | 'unknown'. A door with a lock link also has
 * `lock:<openingId>` → 'locked' | 'unlocked' | 'jammed' | 'unknown' (lockOf). bindings: location.json → bindings;
 * getState(entityId) gives an HA state or undefined. Doors without a binding are not in the map.
 */
export function doorStates(model, bindings, getState) {
  const out = new Map();
  for (const lv of model.levels) for (const o of lv.openings || []) {
    if (o.type !== 'door') continue;
    const e = bindings?.[o.id]?.entity, l = bindings?.[o.id]?.lock;
    if (e) out.set(o.id, doorStateOf(getState(e)));
    if (l) out.set(lockKey(o.id), lockStateOf(getState(l)));
  }
  return out;
}

/**
 * How a door's lock is drawn, from `lockOf()`: { colour, open, label }. Locked is a closed padlock in green, unlocked an open one in red, a jammed
 * lock an open one in amber; an unknown state (unavailable, missing entity) is a closed, grey padlock, never a guess.
 */
export function padlockLook(state) {
  switch (state) {
    case 'locked': return { colour: '#2ea043', open: false, label: 'locked' };
    case 'unlocked': return { colour: '#e5534b', open: true, label: 'unlocked' };
    case 'jammed': return { colour: '#d29922', open: true, label: 'jammed' };
    default: return { colour: '#8b949e', open: false, label: 'lock state unknown' };
  }
}
