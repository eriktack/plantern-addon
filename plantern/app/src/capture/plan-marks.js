// Marks drawn on the plans of the capture pages and the Editor, so a number in a form can be found on
// the plan: numbered corners (the one a distance is measured from stands out), dimension lines with
// their value, and walls named by letter. Pure: plan mm in, SVG strings out (y flipped here, the same
// flip as render2d/coords.js). Sizes are in SVG units; pass fs = a comfortable text size on screen.

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const S = p => [p[0], -p[1]];
const r1 = v => Math.round(v * 10) / 10;

/** Unit vector p → q and the length. */
export function edgeFrame(p, q) {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
  return { u, L, right: [u[1], -u[0]] };          // right of travel: inside a clockwise room
}

/** Distance of P along p → q (mm from p; negative before p). */
export function along(p, q, P) {
  const { u } = edgeFrame(p, q);
  return (P[0] - p[0]) * u[0] + (P[1] - p[1]) * u[1];
}

/** The point t mm along p → q, moved d mm to its right (into a clockwise room). */
export function pointOn(p, q, t, d = 0) {
  const { u, right } = edgeFrame(p, q);
  return [p[0] + u[0] * t + right[0] * d, p[1] + u[1] * t + right[1] * d];
}

/**
 * A dimension line A → B (plan mm) with end ticks and its value written along it, upright, on a halo.
 * text defaults to the length in mm.
 */
export function dimensionSvg(A, B, { fs, color = '#ffb454', text, halo = '#14161a' } = {}) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 1e-6) return '';
  const [a, b] = [S(A), S(B)], u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1] * fs * 0.45, u[0] * fs * 0.45];
  let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], sw = fs / 9;
  const tick = P => `<line x1="${P[0] - n[0]}" y1="${P[1] - n[1]}" x2="${P[0] + n[0]}" y2="${P[1] + n[1]}" stroke="${color}" stroke-width="${sw * 1.4}"/>`;
  return `<g pointer-events="none"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${sw}"/>${tick(a)}${tick(b)}`
    + `<text x="${m[0]}" y="${m[1]}" transform="rotate(${ang.toFixed(2)} ${m[0]} ${m[1]})" fill="${color}" font-size="${fs * 0.85}" font-weight="600" text-anchor="middle" dominant-baseline="central" paint-order="stroke" stroke="${halo}" stroke-width="${fs * 0.32}" stroke-linejoin="round">${esc(text ?? Math.round(L))}</text></g>`;
}

/**
 * A numbered corner. active: the corner something is measured from (filled, larger, with `tag` written
 * beside it, e.g. "from here"); hot: part of the chosen wall; otherwise a plain ring.
 */
export function cornerSvg(P, label, { fs, active = false, hot = false, tag = '', toward = null, color = '#ffb454', dark = '#14161a' } = {}) {
  const [x, y] = S(P), r = active ? fs * 0.85 : fs * 0.62;
  const fill = active ? color : hot ? '#3a2e1c' : dark;
  let out = `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${active ? '#fff' : color}" stroke-width="${active ? fs / 7 : fs / 9}" pointer-events="none"/>`
    + `<text x="${x}" y="${y}" fill="${active ? dark : color}" font-size="${active ? fs * 0.95 : fs * 0.8}" font-weight="${active ? 700 : 500}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${esc(label)}</text>`;
  // the tag goes toward `toward` (plan mm, e.g. the room's middle) so it stays on the map; else above
  let tx = x, ty = y - r - fs * 0.45, anchor = 'middle';
  if (toward) {
    const [cx, cy] = S(toward), L = Math.hypot(cx - x, cy - y) || 1, k = r + fs * 0.5;
    tx = x + (cx - x) / L * k; ty = y + (cy - y) / L * k + fs * 0.3;
    anchor = cx > x + 1 ? 'start' : cx < x - 1 ? 'end' : 'middle';
  }
  if (tag) out += `<text x="${tx}" y="${ty}" fill="${color}" font-size="${fs * 0.8}" font-weight="600" text-anchor="${anchor}" paint-order="stroke" stroke="${dark}" stroke-width="${fs * 0.3}" stroke-linejoin="round" pointer-events="none">${esc(tag)}</text>`;
  return out;
}

/**
 * A wall (plan segment) picked out in a colour, with its name in a badge at its middle, moved d mm into
 * the room; line: false draws only the badge (when the wall is highlighted some other way).
 */
export function wallMarkSvg(p, q, name, { fs, color, d = 0, line = true } = {}) {
  const A = pointOn(p, q, 0, d), B = pointOn(p, q, edgeFrame(p, q).L, d), [a, b] = [S(A), S(B)], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return `<g pointer-events="none">${line ? `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${fs * 0.32}" stroke-linecap="round" stroke-opacity=".9"/>` : ''}`
    + `<circle cx="${m[0]}" cy="${m[1]}" r="${fs * 0.8}" fill="${color}"/><text x="${m[0]}" y="${m[1]}" fill="#14161a" font-size="${fs * 0.95}" font-weight="700" text-anchor="middle" dominant-baseline="central">${esc(name)}</text></g>`;
}

/**
 * Dimensions for something on a room wall p → q measured from one of its corners: from that corner to
 * the near edge, and the width (when the thing has one). t0 ≤ t1 are its edges in mm along p → q;
 * fromEnd: measured from q instead of p. d: how far into the room the dimension line runs.
 */
export function wallDimsSvg(p, q, t0, t1, { fromEnd = false, d, fs, color = '#ffb454', widthColor = '#d9dde4' } = {}) {
  const L = edgeFrame(p, q).L, c = fromEnd ? L : 0, near = fromEnd ? t1 : t0;
  let out = Math.abs(near - c) >= 1 ? dimensionSvg(pointOn(p, q, c, d), pointOn(p, q, near, d), { fs, color, text: Math.round(Math.abs(near - c)) }) : '';
  if (t1 - t0 >= 1) out += dimensionSvg(pointOn(p, q, t0, d), pointOn(p, q, t1, d), { fs, color: widthColor, text: r1(t1 - t0) });
  return out;
}
