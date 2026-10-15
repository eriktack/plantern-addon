// What the Editor's Add menus offer (docs/plans/editor-objects-ux.md, tasks 6 to 8): the entries for the house view, a selected
// room, a wall and an opening, each with a reason when it cannot be used now. Pure: the page says what is selected and what the
// house has, and does the adding (src/capture/ui.js); the menu itself is src/menu.js.

/**
 * ctx = {
 *   where:       'house' | 'room' | 'wall' | 'opening'    the panel the menu is in
 *   roomSelected: a room is selected (the lamp and the stairs go there)
 *   hasRooms:    the level has a room (objects are placed in one)
 *   levelAbove:  there is a level above (stairs go up to it)
 *   blueprints:  [{ id, name, source: 'built-in' | 'house', description }] from the server, or null when there is none
 *   models:      names of the model files of the house and the shared assets/ (an empty list offers none)
 * }
 * Returns entries for createMenu(): { id, label, hint, icon, group, disabled? }. Ids: room, wall, stairs, solid, box, ceilingLamp,
 * blueprint:<id>, model:<name>, door, window, passage, switch, wallLamp, strip, openingLamp, openingStrip.
 */
export function addEntries(ctx) {
  const { where, roomSelected = false, hasRooms = false, levelAbove = false, blueprints = null, models = [] } = ctx;
  const out = [];
  const add = (id, label, icon, group, hint, disabled) => out.push({ id, label, icon, group, hint, ...(disabled ? { disabled } : {}) });
  const noRoom = hasRooms ? false : 'Add a room first';
  const needRoom = roomSelected ? false : 'Select a room first';

  if (where === 'opening') {
    add('openingLamp', 'Lamp in it', 'lamp', 'Lights', 'A window star, or a lamp on the sill');
    add('openingStrip', 'LED strip', 'strip', 'Lights', 'Along its sill or its top; it follows it');
    return out;
  }

  if (where === 'house') {
    add('room', 'Room', 'room', 'Structure', 'Measure a new room');
    add('wall', 'Wall', 'wall', 'Structure', 'Draw a divider, a half wall or a lintel by hand');
    add('stairs', 'Stairs', 'stairs', 'Structure', 'Up to the next level', !levelAbove ? 'There is no level above' : noRoom);
    add('solid', 'Solid', 'solid', 'Structure', 'A chimney, a pillar or a boxed-in pipe');
  } else if (where === 'room') {
    add('stairs', 'Stairs', 'stairs', 'Structure', 'Up to the next level, from this room', !levelAbove ? 'There is no level above' : false);
  }

  if (where === 'wall') {
    add('door', 'Door', 'door', 'Openings', 'In this wall; defaults until measured');
    add('window', 'Window', 'window', 'Openings', 'In this wall; defaults until measured');
    add('passage', 'Passage', 'passage', 'Openings', 'An opening without a door');
    add('switch', 'Switch', 'switch', 'Lights', 'On this wall');
    add('wallLamp', 'Wall lamp', 'lamp', 'Lights', 'On this wall');
    add('strip', 'LED strip', 'strip', 'Lights', 'Along this wall: under a cabinet, behind a TV');
  } else {
    add('ceilingLamp', 'Ceiling lamp', 'lamp', 'Lights', 'In the middle of the room', where === 'room' ? false : needRoom);
  }

  const here = where === 'wall' ? 'on this wall' : where === 'room' ? 'in this room' : 'in the middle of the room';
  const group = where === 'wall' ? 'Objects on this wall' : 'Objects';
  const objectsOff = where === 'wall' ? false : noRoom;
  add('box', 'Box', 'box', group, `A plain box ${here}: furniture, a cabinet`, objectsOff);
  if (blueprints === null) {
    add('blueprints-off', 'From the library', 'blueprint', group, '', "Needs Plantern's server");
  } else {
    for (const b of blueprints) {
      add(`blueprint:${b.id}`, b.name || b.id, 'blueprint', group, `${b.source === 'house' ? 'This house' : 'Library'}${(b.summary || b.description) ? ` · ${b.summary || b.description}` : ''}`, objectsOff);
    }
  }
  if (where !== 'wall') for (const name of models) add(`model:${name}`, name, 'model', 'Model files', 'A model from assets/', objectsOff);
  return out;
}
