// The hints and icons of the options the code fills in (nicer dropdowns, ND9): a level shows its floor height (and that it
// follows another level), an opening its type and width, a wall its length and the rooms it is in. Pure; tested.

/** A level's hint: its floor height ("+2750", "±0", "−300") and, for a level that follows another, which one. */
export function levelHint(level, levels = []) {
  const e = Math.round(level?.elevation ?? 0), height = e === 0 ? '±0' : e > 0 ? `+${e}` : `−${-e}`;
  const follows = level?.elevationFrom ? levels.find(l => l.id === level.elevationFrom.level) : null;
  return follows ? `${height} · follows ${follows.name || follows.id}` : height;
}

/** An opening's hint: its type and width, and the wall it is in when given. */
export function openingHint(opening, wallName = '') {
  return [`${opening?.type ?? 'opening'} ${Math.round(opening?.width ?? 0)} mm`, wallName].filter(Boolean).join(' · ');
}

/** The icon of an opening's type (door, window, passage), or '' for anything else. */
export function openingIcon(type) {
  return ['door', 'window', 'passage'].includes(type) ? type : '';
}

/** A wall's hint: its length in mm and the names of the rooms it is in. */
export function wallHint(wall, roomNames = []) {
  const L = Math.round(Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]));
  return [`${L} mm`, ...roomNames].join(' · ');
}

/**
 * Items grouped by the room they belong to, for a list of corners: [{ label, items }], the rooms in `first` (where the thing is) before the others,
 * each group in the order its first item appears, items with no room in a last group `otherLabel`. roomOf(item) gives a room id or '' and
 * nameOf(id) its name. A list that falls into one group only is returned as one group: the caller then leaves out the heading.
 */
export function groupByRoom(items, roomOf, nameOf, first = new Set(), otherLabel = 'Other corners') {
  const order = [], groups = new Map();
  for (const it of items) {
    const id = roomOf(it) || '';
    if (!groups.has(id)) { groups.set(id, []); order.push(id); }
    groups.get(id).push(it);
  }
  const rank = id => (id === '' ? 2 : first.has(id) ? 0 : 1);
  return order.map((id, i) => ({ id, i })).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map(({ id }) => ({ label: id === '' ? otherLabel : nameOf(id) || id, items: groups.get(id) }));
}
