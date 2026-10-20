// The level strip of the Editor's plan as a dropdown on a phone (docs/archive/2026-10-20-mobile-ux.md, follow-up of H1/H3): the row of buttons
// (Upper floor · Ground floor ✎ · Basement) becomes two rows of 44 px buttons on a narrow screen and covers the plan, so there it is
// one button naming the level shown, with the levels in a menu. Pure: the entries and the button's label.

/**
 * levels: the levels of the building, highest first. `edited` is the id of the level being edited, `shown` the id of the one on the
 * plan (the edited one, or the one looked at), `near` the ids of the levels just below and above the edited one.
 * Entries for createMenu(): { id, label, hint, icon, current }; the level on the plan is the checked one.
 */
export function levelMenuEntries(levels, { edited, shown, near = [] }) {
  const elevation = new Map(levels.map(l => [l.id, l.elevation ?? 0]));
  return levels.map(l => ({
    id: l.id,
    label: l.name || l.id,
    icon: 'level',
    current: l.id === shown,
    hint: l.id === edited ? 'The level you are editing'
      : near.includes(l.id) ? (elevation.get(l.id) < elevation.get(edited) ? 'Look at it: the level below' : 'Look at it: the level above')
        : 'Look at it (nothing there is changed)',
  }));
}

/** The menu button's text: the level being edited with its mark, or the level being looked at. */
export function levelMenuLabel(levels, { edited, shown }) {
  const name = id => { const l = levels.find(x => x.id === id); return l?.name || id; };
  return shown === edited ? `${name(edited)} ✎` : `Looking at ${name(shown)}`;
}
