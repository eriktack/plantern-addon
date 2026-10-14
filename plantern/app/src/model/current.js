// Which house (location) and level a page opens: the URL (?loc=, ?level=) first, then the last one
// picked in this browser, then the index default. Remembering is a per-browser convenience in
// localStorage; every access is guarded, so the pages work the same without it (private mode).

const KEY = 'plantern.current';

/** What this browser remembers: { loc, levels: { <locId>: <levelId> } } (empty when unavailable). */
export function remembered() {
  try { const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** Remember the house, and its level when given. */
export function remember(locId, levelId) {
  try {
    const r = remembered();
    r.loc = locId;
    if (levelId) r.levels = { ...(r.levels || {}), [locId]: levelId };
    globalThis.localStorage?.setItem(KEY, JSON.stringify(r));
  } catch { /* storage blocked: nothing is remembered */ }
}

/** The house to open: URL, else remembered, else the index default, else the first; only ids in the index count. */
export function chooseLocation(index, urlLoc, mem = remembered()) {
  const ids = new Set((index.locations || []).map(l => l.id));
  if (urlLoc) return urlLoc;                               // an explicit URL wins, even a wrong one (the page reports it)
  return [mem.loc, index.default, index.locations?.[0]?.id].find(id => id && ids.has(id)) ?? null;
}

/** The level to open in `model` for house `locId`: URL, else remembered for that house, else the first. */
export function chooseLevel(model, locId, urlLevel, mem = remembered()) {
  const has = id => id && model.levels.some(l => l.id === id);
  return [urlLevel, mem.levels?.[locId]].find(has) ?? model.levels[0]?.id ?? null;
}

/** Point the links to the other pages at the current house and level. */
export function linkPages(locId, levelId) {
  const q = new URLSearchParams({ loc: locId, ...(levelId ? { level: levelId } : {}) });
  // $= so the links of a page in a subfolder ('../index.html') and the Objects page itself ('object-designs/index.html') count too
  for (const a of document.querySelectorAll('a[href$="index.html"], a[href$="room-editor.html"], a[href$="wizard.html"], a[href$="openings.html"], a[href$="storage.html"]')) {
    a.href = `${a.getAttribute('href').split('?')[0]}?${q}`;
  }
}
