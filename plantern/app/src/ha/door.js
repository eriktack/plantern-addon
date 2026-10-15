// A door's state from Home Assistant (PLANTERN.md §6.1, §9): a door is bound in location.json → bindings like a lamp,
// to a binary_sensor (on = open) or any entity that says open / closed. Pure: shared by the viewer and the card.

/** 'open' | 'closed' | 'unknown' from one HA state object (or undefined when the entity is missing). */
export function doorStateOf(state) {
  const s = state?.state;
  if (s === 'on' || s === 'open') return 'open';
  if (s === 'off' || s === 'closed') return 'closed';
  return 'unknown';           // unavailable, unknown, a value we do not read as open or closed, or no entity
}

/** The Home Assistant entities that are door sensors: Set of entity ids bound to a door opening of the model (bindings: location.json → bindings). */
export function doorEntities(model, bindings) {
  const out = new Set();
  for (const lv of model.levels || []) for (const o of lv.openings || []) {
    const e = o.type === 'door' && bindings?.[o.id]?.entity;
    if (e) out.add(e);
  }
  return out;
}

/**
 * Map(openingId → state) for every door opening that has a binding with an entity. bindings: location.json → bindings;
 * getState(entityId) gives an HA state or undefined. Doors without a binding are not in the map.
 */
export function doorStates(model, bindings, getState) {
  const out = new Map();
  for (const lv of model.levels) for (const o of lv.openings || []) {
    const e = o.type === 'door' && bindings?.[o.id]?.entity;
    if (e) out.set(o.id, doorStateOf(getState(e)));
  }
  return out;
}
