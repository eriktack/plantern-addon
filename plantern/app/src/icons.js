// The small line icons of the menus (16 px, drawn with the text colour). Add one by name and use it in a menu entry.
const svg = body => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // the page menu
  plan: svg('<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/>'),
  editor: svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  wizard: svg('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/><path d="M9.5 7h5M9.5 10h5M9.5 13h3"/>'),
  openings: svg('<path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="12" cy="12.5" r=".8" fill="currentColor"/>'),
  storage: svg('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  objects: svg('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m12 12 8-4.5M12 12 4 7.5M12 12v9"/>'),
  // menu chrome
  chevron: svg('<path d="m6 9 6 6 6-6"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  // the Add menus
  room: svg('<path d="M4 5h16v14H4z"/><path d="M4 11h6v8"/>'),
  wall: svg('<path d="M3 8h18v8H3z"/><path d="M9 8v8M15 8v8"/>'),
  stairs: svg('<path d="M4 20h4v-4h4v-4h4V8h4"/>'),
  solid: svg('<rect x="8" y="3" width="8" height="18"/><path d="M8 9h8M8 15h8"/>'),
  box: svg('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'),
  blueprint: svg('<path d="M5 4h4v16H5zM11 4h4v16h-4z"/><path d="m17 5.5 3 .8-3.6 13.4-3-.8z"/>'),
  model: svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>'),
  lamp: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  switch: svg('<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M12 8v4"/>'),
  strip: svg('<path d="M3 13h18"/><path d="M6 9V6M10 9V6M14 9V6M18 9V6"/>'),
  door: svg('<path d="M6 21V4h8l4 2v15"/><path d="M3 21h18"/><circle cx="12" cy="13" r=".8" fill="currentColor"/>'),
  window: svg('<rect x="5" y="4" width="14" height="16"/><path d="M12 4v16M5 12h14"/>'),
  passage: svg('<path d="M5 21V10a7 7 0 0 1 14 0v11"/><path d="M3 21h18"/>'),
};
