/**
 * Stable, diff-friendly JSON for model and location files (used for saving).
 * - arrays of primitives / points stay on one line: [[0,0],[0,4000]], ["r_kitchen"]
 * - small flat objects stay on one line when they fit in `width`
 * - everything else is expanded with 2-space indentation
 * Output ends with a newline.
 */
export function formatJson(value, width = 140) {
  const isPrim = v => v === null || typeof v !== 'object';
  const isNumArr = v => Array.isArray(v) && v.every(x => isPrim(x) || (Array.isArray(x) && x.every(y => typeof y === 'number')));
  const inline = v => JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']').replace(/\{ /g, '{ ').replace(/ \}/g, ' }');
  const tight = v => JSON.stringify(v);

  function fmt(v, ind) {
    if (isPrim(v)) return JSON.stringify(v);
    if (isNumArr(v)) return tight(v);
    const pad = '  '.repeat(ind + 1), end = '  '.repeat(ind);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      return '[\n' + v.map(x => pad + fmt(x, ind + 1)).join(',\n') + '\n' + end + ']';
    }
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    const flat = keys.every(k => isPrim(v[k]) || isNumArr(v[k]) || (typeof v[k] === 'object' && !Array.isArray(v[k]) && Object.values(v[k]).every(x => isPrim(x) || isNumArr(x))));
    if (flat) {
      const one = '{ ' + keys.map(k => `${JSON.stringify(k)}: ${isNumArr(v[k]) ? tight(v[k]) : isPrim(v[k]) ? JSON.stringify(v[k]) : inline(v[k])}`).join(', ') + ' }';
      if (one.length + ind * 2 <= width) return one;
    }
    return '{\n' + keys.map(k => `${pad}${JSON.stringify(k)}: ${fmt(v[k], ind + 1)}`).join(',\n') + '\n' + end + '}';
  }
  return fmt(value, 0) + '\n';
}
