// Fitting an image (a drone photo taken straight down, a construction drawing) to the plan (docs/plans/underlay.md, decision 293).
// Pure. Image pixels are [u, v] with v downwards; plan points are [x, y] mm with y north.
//
// The fit is a similarity: scale, rotation and translation, no shear and no mirror. A photo taken straight down and a drawing
// have no shear, so an affine fit would only hide a bad point. Written with complex numbers: the image point as w = u − i·v
// (v turned upwards, so the image is not mirrored), the plan point as z = x + i·y, and z = A·w + B. Two points fix A and B;
// more are fitted by least squares, and the distance of each point from where the fit puts it is its residual.

const MIN_SPREAD = 1;            // px: points closer together than this give no direction

/**
 * Fit image → plan from pairs [{ image: [u, v], plan: [x, y] }].
 * Returns { ok: true, matrix, scale (mm per px), rotationDeg, residuals (mm per pair), rms, mirrored? }
 * or { ok: false, error }. `matrix` = { a, b, c, d, e, f }: x = a·u + c·v + e, y = b·u + d·v + f.
 * `mirrored` (three or more points): a mirrored image fits the points clearly better, so the points are probably given
 * in the wrong order or on the wrong image; the fit is still returned.
 */
export function fitSimilarity(pairs) {
  const ok = Array.isArray(pairs) ? pairs.filter(p => isPt(p?.image) && isPt(p?.plan)) : [];
  if (!Array.isArray(pairs) || ok.length !== pairs.length) return { ok: false, error: 'every point needs an image pixel [u, v] and a plan point [x, y]' };
  if (ok.length < 2) return { ok: false, error: 'at least two points are needed' };
  const fit = solve(ok, false);
  if (!fit) return { ok: false, error: 'the image points are all in one place' };
  const out = describe(fit, ok);
  if (ok.length >= 3) {
    const flipped = solve(ok, true);
    if (flipped) {
      const rms = describe(flipped, ok, true).rms;
      if (out.rms > 2 * rms && out.rms > 50) out.mirrored = true;    // 50 mm: below that the plain fit is good anyway
    }
  }
  return out;
}

const isPt = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

// w from an image pixel: v turned upwards, or (mirror) left as it is
const wOf = ([u, v], mirror) => [u, mirror ? v : -v];

function solve(pairs, mirror) {
  const n = pairs.length;
  let wu = 0, wv = 0, zx = 0, zy = 0;
  for (const p of pairs) { const w = wOf(p.image, mirror); wu += w[0]; wv += w[1]; zx += p.plan[0]; zy += p.plan[1]; }
  wu /= n; wv /= n; zx /= n; zy /= n;
  // A = Σ (z − z̄)·conj(w − w̄) / Σ |w − w̄|²
  let re = 0, im = 0, den = 0;
  for (const p of pairs) {
    const w = wOf(p.image, mirror), a = w[0] - wu, b = w[1] - wv, x = p.plan[0] - zx, y = p.plan[1] - zy;
    re += x * a + y * b; im += y * a - x * b; den += a * a + b * b;
  }
  if (den < MIN_SPREAD * MIN_SPREAD) return null;
  const p = re / den, q = im / den;
  // B = z̄ − A·w̄
  return { p, q, bx: zx - (p * wu - q * wv), by: zy - (q * wu + p * wv), mirror };
}

function describe(fit, pairs, quiet = false) {
  const { p, q, bx, by, mirror } = fit;
  // z = A·w + B with w = u − i·v (or u + i·v mirrored): x = p·u ± q·v + bx, y = q·u ∓ p·v + by
  const s = mirror ? -1 : 1;
  const matrix = { a: p, b: q, c: s * q, d: -s * p, e: bx, f: by };
  const residuals = pairs.map(pr => { const [x, y] = apply(matrix, pr.image); return Math.hypot(x - pr.plan[0], y - pr.plan[1]); });
  const rms = Math.sqrt(residuals.reduce((t, r) => t + r * r, 0) / residuals.length);
  if (quiet) return { rms };
  return { ok: true, matrix, scale: Math.hypot(p, q), rotationDeg: Math.atan2(q, p) * 180 / Math.PI, residuals, rms };
}

/** An image pixel [u, v] → plan [x, y] mm, through a fit's matrix. */
export const apply = (m, [u, v]) => [m.a * u + m.c * v + m.e, m.b * u + m.d * v + m.f];

/** The image's four corners in the plan (top left, top right, bottom right, bottom left), for its size [width, height] px. */
export const imageCorners = (m, [w, h]) => [[0, 0], [w, 0], [w, h], [0, h]].map(p => apply(m, p));

// ---- placing by hand (docs/plans/underlay.md UL10): the image's middle at a plan point, a scale and a turn ----

/**
 * The matrix of a hand placement: place = { at: [x, y] mm, the plan point under the image's middle; scale: mm per pixel;
 * rotation: degrees anticlockwise, the image's up turned from plan north (as fitSimilarity's rotationDeg) }, size [w, h] px.
 */
export function placeMatrix(place, [w, h]) {
  const t = (place.rotation ?? 0) * Math.PI / 180, p = place.scale * Math.cos(t), q = place.scale * Math.sin(t);
  // x = p·u + q·v + e, y = q·u − p·v + f, with the middle (w/2, h/2) landing on `at`
  return { a: p, b: q, c: q, d: -p, e: place.at[0] - p * w / 2 - q * h / 2, f: place.at[1] - q * w / 2 + p * h / 2 };
}

/** The hand placement a matrix amounts to (a fit by points, to start moving it by hand from where it is). */
export function placeOf(m, [w, h]) {
  const at = apply(m, [w / 2, h / 2]);
  return { at: at.map(v => Math.round(v)), scale: Math.round(Math.hypot(m.a, m.b) * 10000) / 10000, rotation: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI * 100) / 100 };
}

/** A plan point [x, y] mm → the image pixel [u, v] under it (the inverse of apply; null for a degenerate matrix). */
export function pixelAt(m, [x, y]) {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  const dx = x - m.e, dy = y - m.f;
  return [(m.d * dx - m.c * dy) / det, (m.a * dy - m.b * dx) / det];
}

/** Hand moves, each from the placement when the drag started (`from`) and two plan points (where the drag started, where it is). */
export const movePlace = (from, start, now) => ({ ...from, at: [Math.round(from.at[0] + now[0] - start[0]), Math.round(from.at[1] + now[1] - start[1])] });
export function turnPlace(from, start, now) {
  const a0 = Math.atan2(start[1] - from.at[1], start[0] - from.at[0]), a1 = Math.atan2(now[1] - from.at[1], now[0] - from.at[0]);
  let r = (from.rotation ?? 0) + (a1 - a0) * 180 / Math.PI;
  r = ((r + 180) % 360 + 360) % 360 - 180;
  return { ...from, rotation: Math.round(r * 100) / 100 };
}
export function scalePlace(from, start, now) {
  const d0 = Math.hypot(start[0] - from.at[0], start[1] - from.at[1]), d1 = Math.hypot(now[0] - from.at[0], now[1] - from.at[1]);
  if (d0 < 1 || d1 < 1) return from;
  return { ...from, scale: Math.round(from.scale * d1 / d0 * 10000) / 10000 };
}
