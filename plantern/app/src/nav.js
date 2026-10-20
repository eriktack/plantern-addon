// The page menu at the top of every sidebar. The list of pages is here and nowhere else: add a page with one entry.
// A page puts <nav class="nav" data-page="<id>" data-base="<path to the repo root>"></nav> in its sidebar and loads this module.
// The menu itself is src/menu.js (also the Editor's Add menus); the icons are in src/icons.js.

import { createMenu } from './menu.js';

// href is relative to the repo root; `group` orders the sections of the menu
export const PAGES = [
  { id: 'plan', label: 'Plan', icon: 'plan', href: 'index.html', group: 'View', hint: 'The plan with lights (2D / 3D)' },
  { id: 'editor', label: 'Editor', icon: 'editor', href: 'room-editor.html', group: 'Edit', hint: 'Edit rooms, walls, openings and lamps (desktop)' },
  { id: 'wizard', label: 'Room wizard', icon: 'wizard', href: 'wizard.html', group: 'Capture (phone)', hint: 'Measure a room, wall by wall' },
  { id: 'openings', label: 'Doors & lights', icon: 'openings', href: 'openings.html', group: 'Capture (phone)', hint: 'Doors, windows, switches and lamps' },
  { id: 'storage', label: 'Settings', icon: 'storage', href: 'storage.html', group: 'Manage', hint: 'Where your houses are kept, and the Home Assistant connection' },
  { id: 'objects', label: 'Objects', icon: 'objects', href: 'object-designs/index.html', group: 'Manage', hint: 'Parametric objects: set sizes and materials, download a model' },
];

export function wireNav(nav) {
  const base = nav.dataset.base ?? '';
  const cur = PAGES.find(p => p.id === nav.dataset.page) ?? PAGES[0];
  createMenu(nav, {
    label: cur.label, icon: cur.icon, align: 'full',
    entries: () => PAGES.map(p => ({ id: p.id, label: p.label, hint: p.hint, icon: p.icon, group: p.group, href: base + p.href, current: p.id === cur.id })),
  });
}

for (const nav of document.querySelectorAll('nav.nav[data-page]')) wireNav(nav);
