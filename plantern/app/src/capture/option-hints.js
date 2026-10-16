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
