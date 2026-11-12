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
