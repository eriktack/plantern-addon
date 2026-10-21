// The room's measurements as a table, one row per wall (ui-consistency plan UX24, decision 257 point 4). The form's text fields
// (lengths, turns, corners, worked out, exact, exact corners, locked, replaced, diagonals: captureToForm / buildCapture in edit.js) stay what the
// solver reads and what is stored; the table is another way to see and type the same thing. Pure, no DOM:
//   tableFromForm(form) → { rows, diagonals, errors }   formFromTable(rows, diagonals) → the text fields
// A round trip through the table gives back the same text (tested on every demo room).

import { parseNumbers, parseDiagonals, parseLocks, parseChecks, parseCorners, checksToText, locksToText, cornersToText } from './edit.js';
import { parseWalls, wallsToText } from './labels.js';

/**
 * rows: [{ length, turn, corner, derived, exact, exactCorner, lock, replaced, note }] with length / corner / replaced as typed text, turn 'R' / 'L'
 * or '' (not given), corner and turn are the corner the wall starts from (corner i) and exactCorner says that angle is
 * exact, lock 'x' / 'y' / ''; diagonals: [{ a, b, length }]. errors: what the text fields hold that the table
 * cannot show (the text then stays the place to fix it).
 */
export function tableFromForm(form) {
  const errors = [];
  const L = parseNumbers(form.lengths), C = parseNumbers(form.corners), lk = parseLocks(form.locks), dv = parseWalls(form.derived), ex = parseWalls(form.exact), ec = parseCorners(form.exactCorners), ck = parseChecks(form.checks), dg = parseDiagonals(form.diagonals);
  for (const r of [L, C]) errors.push(...r.errors);
  for (const r of [lk, dv, ex, ec, ck, dg]) errors.push(...r.errors);
  const turns = String(form.turns ?? '').toUpperCase().replace(/[\s,]+/g, '');
  const n = Math.max(L.values.length, turns.length, C.values.length);
  const rows = Array.from({ length: n }, (_, i) => {
    const check = ck.checks.find(c => c.edge === i);
    return {
      length: L.values[i] === undefined ? '' : String(L.values[i]),
      turn: turns[i] ?? '',
      corner: C.values[i] === undefined ? '' : String(C.values[i]),
      derived: dv.walls.includes(i),
      exact: ex.walls.includes(i),
      exactCorner: ec.corners.includes(i),
      lock: lk.locks.find(k => k.edge === i)?.axis ?? '',
      replaced: check ? String(check.measured) : '',
      note: check?.note ?? '',
    };
  });
  return { rows, diagonals: dg.diagonals.map(d => ({ a: d.a, b: d.b, length: d.length })), errors };
}

/** The text fields for a table (as captureToForm writes them). An empty length is written as "?" so the solver says it is missing. */
export function formFromTable(rows, diagonals = []) {
  let last = rows.length;
  while (last > 0 && rows[last - 1].length.trim() === '' && !rows[last - 1].turn && rows[last - 1].corner.trim() === '') last--;   // empty rows at the end are not walls yet
  const use = rows.slice(0, last);
  const idx = pred => use.map((r, i) => (pred(r) ? i : -1)).filter(i => i >= 0);
  return {
    lengths: use.map(r => r.length.trim() || '?').join(', '),
    turns: use.some(r => r.turn) ? use.map(r => r.turn || 'R').join('') : '',
    corners: use.some(r => r.corner.trim()) ? use.map(r => r.corner.trim() || '90').join(', ') : '',
    derived: wallsToText(idx(r => r.derived)),
    exact: wallsToText(idx(r => r.exact)),
    exactCorners: cornersToText(idx(r => r.exactCorner)),
    locks: locksToText(use.map((r, i) => (r.lock ? { edge: i, axis: r.lock } : null)).filter(Boolean)),
    checks: checksToText(use.map((r, i) => (r.replaced.trim() ? { edge: i, measured: Number(r.replaced), ...(r.note ? { note: r.note } : {}) } : null)).filter(Boolean)),
    diagonals: diagonals.filter(d => Number.isInteger(d.a) && Number.isInteger(d.b) && d.length !== '' && d.length !== undefined).map(d => `${d.a}-${d.b}: ${d.length}`).join('\n'),
  };
}

/** An empty row (a new wall at the end). */
export const emptyRow = () => ({ length: '', turn: '', corner: '', derived: false, exact: false, exactCorner: false, lock: '', replaced: '', note: '' });
