// The page menu at the top of every sidebar. The list of pages is here and nowhere else: add a page with one entry.
// A page puts <nav class="nav" data-page="<id>" data-base="<path to the repo root>"></nav> in its sidebar and loads this module.
const svg = body => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  plan: svg('<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/>'),
  editor: svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  wizard: svg('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/><path d="M9.5 7h5M9.5 10h5M9.5 13h3"/>'),
  openings: svg('<path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="12" cy="12.5" r=".8" fill="currentColor"/>'),
  storage: svg('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  objects: svg('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m12 12 8-4.5M12 12 4 7.5M12 12v9"/>'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
};

// href is relative to the repo root; `group` orders the sections of the menu
export const PAGES = [
  { id: 'plan', label: 'Plan', icon: 'plan', href: 'index.html', group: 'View', hint: 'The plan with lights (2D / 3D)' },
  { id: 'editor', label: 'Editor', icon: 'editor', href: 'room-editor.html', group: 'Edit', hint: 'Edit rooms, walls, openings and lamps (desktop)' },
  { id: 'wizard', label: 'Room wizard', icon: 'wizard', href: 'wizard.html', group: 'Capture (phone)', hint: 'Measure a room, wall by wall' },
  { id: 'openings', label: 'Doors & lights', icon: 'openings', href: 'openings.html', group: 'Capture (phone)', hint: 'Doors, windows, switches and lamps' },
  { id: 'storage', label: 'Storage', icon: 'storage', href: 'storage.html', group: 'Manage', hint: 'Where your houses are kept: folders, network shares, git' },
  { id: 'objects', label: 'Objects', icon: 'objects', href: 'object-designs/index.html', group: 'Manage', hint: 'Parametric objects: set sizes and materials, download a model' },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function navHtml(current, base = '') {
  const cur = PAGES.find(p => p.id === current) ?? PAGES[0];
  const groups = [...new Set(PAGES.map(p => p.group))];
  const items = groups.map(g => `<div class="navgroup" role="presentation">${esc(g)}</div>` + PAGES.filter(p => p.group === g).map(p =>
    `<a role="menuitem" href="${esc(base + p.href)}"${p.id === cur.id ? ' class="on" aria-current="page"' : ''}>${ICONS[p.icon]}<span class="nt"><b>${esc(p.label)}</b><small>${esc(p.hint)}</small></span>${p.id === cur.id ? ICONS.check : ''}</a>`).join('')).join('');
  return `<button type="button" class="navbtn" aria-haspopup="menu" aria-expanded="false">${ICONS[cur.icon]}<span>${esc(cur.label)}</span>${ICONS.chevron}</button><div class="navmenu" role="menu" hidden>${items}</div>`;
}

export function wireNav(nav) {
  nav.innerHTML = navHtml(nav.dataset.page, nav.dataset.base ?? '');
  const btn = nav.querySelector('.navbtn'), menu = nav.querySelector('.navmenu');
  const set = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) (menu.querySelector('a.on') ?? menu.querySelector('a')).focus(); };
  btn.onclick = () => set(menu.hidden);
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !nav.contains(e.target)) set(false); });
  nav.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (menu.hidden) { set(true); return; }
    const links = [...menu.querySelectorAll('a')], i = links.indexOf(document.activeElement);
    links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
  });
}

for (const nav of document.querySelectorAll('nav.nav[data-page]')) wireNav(nav);
