// Text on its way into markup (innerHTML, SVG strings). Names, notes, ids and colours come from the house files, and a
// house may come from a storage someone else writes to, so nothing from them goes into markup as it is. Pure (tested).

/** Text made safe for element content and for a quoted attribute. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
