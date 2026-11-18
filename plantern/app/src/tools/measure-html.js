// The markup of the viewer's measure readout and checks list (src/tools/measure.js). Refs, check ids and notes come from
// the house file, so every one of them is escaped here. Pure (tested).

import { esc } from '../html.js';

/** The readout of a finished measurement: `text` is the numbers (made by the tool), a and b the picked points. */
export const readoutHtml = (text, a, b) => `${text}<br><small>${esc(a.ref || 'free')} → ${esc(b.ref || 'free')}</small>`;

/** A check whose reference no longer exists. */
export const brokenCheckHtml = r => `<span class="dot bad"></span><span>${esc(r.check.id)}: broken reference<br><small>${esc(r.missing)}</small></span><span></span>`;

/** A check row: its two refs, its note, the levels when they differ, and model / measured with the difference. `a`, `b`: the snap points. */
export function checkRowHtml(r, a, b) {
  const c = r.check, d = r.delta, cls = esc(r.cls);
  const levels = a.level !== b.level ? ` · ${esc(a.level)}/${esc(b.level)}` : '';
  return `<span class="dot ${cls}"></span><span>${esc(c.a)} ↔ ${esc(c.b)}<br><small>${esc(c.note || '')}${levels}${c.solve ? ' · in the room\'s solve' : ''}</small></span><span>${r.model.toFixed(0)} / ${esc(c.measured)} <b class="${cls}">${d > 0 ? '+' : ''}${d.toFixed(0)}</b></span>`;
}
