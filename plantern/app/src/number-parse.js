// Reading a typed number (ui-consistency plan UX18, decision 257 point 3): a measured value stays a text box, and what is typed
// may carry a unit and simple sums: "2400", "2,4 m", "240 cm", "1200+35", "3000-2*45", "(4000-90)/2". Pure, no DOM, no eval.
//
//   parseMeasure(text, unit) → { empty: true } | { value } | { error }
//     unit: the field's unit, 'mm' (lengths: m, cm and mm are understood), 'm' (the same, read as metres), or anything else
//     ('°', '%', 'K', ''): then only plain numbers and sums, no length units.

const LENGTH = { mm: 1, cm: 10, dm: 100, m: 1000 };

/** Tokens of an expression: numbers (with a decimal comma or point, an optional length unit), + - * / ( ). Null when unreadable. */
function tokens(text) {
  const out = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?|[.,]\d+)\s*(mm|cm|dm|m)?(?![a-z])|([-+*/()×]))/iy;
  let i = 0;
  const s = text.trim();
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m || m[0].length === 0) return null;
    if (m[1] !== undefined) out.push({ n: Number(m[1].replace(',', '.')), unit: m[2]?.toLowerCase() ?? null });
    else out.push({ op: m[3] === '×' ? '*' : m[3] });
    i = re.lastIndex;
    while (s[i] === ' ') i++;
  }
  return out;
}

export function parseMeasure(text, unit = 'mm') {
  const t = String(text ?? '').trim();
  if (t === '') return { empty: true };
  const toks = tokens(t);
  if (!toks) return { error: `"${t}" is not a number${unit === 'mm' || unit === 'm' ? ' (mm, or with cm or m)' : ''}` };
  const lengthField = unit === 'mm' || unit === 'm';
  const scale = unit === 'm' ? 1 / 1000 : 1;
  let pos = 0, bad = null;
  // a number: with a length unit it is converted to mm first (then to the field's unit); without one it is in the field's unit
  const number = tok => {
    if (tok.unit && !lengthField) { bad = `a ${tok.unit} value does not fit this field`; return NaN; }
    return tok.unit ? tok.n * LENGTH[tok.unit] * scale : tok.n;
  };
  const peek = () => toks[pos], take = () => toks[pos++];
  function primary() {
    const tok = take();
    if (!tok) { bad = 'it ends too early'; return NaN; }
    if (tok.op === '(') { const v = sum(); if (take()?.op !== ')') bad = 'a bracket is not closed'; return v; }
    if (tok.op === '-') return -primary();
    if (tok.op === '+') return primary();
    if (tok.n !== undefined) return number(tok);
    bad = `"${tok.op}" is in the wrong place`;
    return NaN;
  }
  function product() {
    let v = primary();
    while (peek()?.op === '*' || peek()?.op === '/') {
      const op = take().op, w = primary();
      v = op === '*' ? v * w : v / w;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (peek()?.op === '+' || peek()?.op === '-') {
      const op = take().op, w = product();
      v = op === '+' ? v + w : v - w;
    }
    return v;
  }
  const v = sum();
  if (!bad && pos < toks.length) bad = 'there is something after the number';
  if (bad || !Number.isFinite(v)) return { error: `"${t}": ${bad || 'not a number'}` };
  return { value: Math.round(v * 1000) / 1000 };
}

/** Is the text more than a plain number (a unit or a sum), so the field should show the result instead? */
export const needsWorkingOut = text => /[a-z+*/()×]|\d\s*-|^\s*-.*-/i.test(String(text ?? '').trim()) || /,/.test(String(text ?? ''));

/** The steps of the arrow keys and of scrubbing, by unit: [normal, with Shift, with Alt]. */
export function stepsFor(unit) {
  if (unit === 'mm') return [10, 100, 1];
  if (unit === '°') return [1, 15, 0.1];
  if (unit === 'm') return [0.01, 0.1, 0.001];
  return [1, 10, 0.1];
}

/** The value after a step of `delta` from text (empty: from `start`), kept to the precision of the step. */
export function stepValue(text, unit, delta, start = 0) {
  const r = parseMeasure(text, unit);
  const base = r.value ?? (Number.isFinite(Number(start)) ? Number(start) : 0);
  const decimals = Math.max(0, -Math.floor(Math.log10(Math.abs(delta) || 1)));
  return Number((base + delta).toFixed(Math.min(decimals + 1, 4)));
}
