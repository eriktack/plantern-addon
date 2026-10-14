// The stairs panel's sketch (proposal 2026-10-13): the stair seen from above, its steps filled, the walking line, and a
// dimension line for each flight's outer length (what the person measured). Pure: layout in, SVG text out.

/**
 * `layout` from stairLayout(), `outer` the outer length of each flight in mm (what the panel shows).
 * Returns an SVG string, or '' when there is nothing to draw.
 */
export function stairSketch(layout, outer = [], { width = 300, pad = 22 } = {}) {
  if (!layout || layout.error || !layout.steps?.length) return '';
  const off = 220;                                                          // dimension lines sit this far beside the flights
  const dims = layout.flights.map((f, k) => {
    const L = Number.isFinite(outer[k]) ? outer[k] : f.run;
    const left = [-f.r[0], -f.r[1]], base = [f.o[0] + left[0] * (f.w / 2 + off), f.o[1] + left[1] * (f.w / 2 + off)];
    const a = base, b = [base[0] + f.u[0] * L, base[1] + f.u[1] * L];
    return { a, b, L, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], k };
  });
  const pts = [...layout.steps.flatMap(s => s.poly), ...dims.flatMap(d => [d.a, d.b])];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((width - 2 * pad) / Math.max(maxX - minX, 1), 1);
  const h = Math.max(maxY - minY, 1) * s + 2 * pad;
  const X = x => pad + (x - minX) * s, Y = y => pad + (maxY - y) * s;
  const r = n => Math.round(n);
  let svg = `<svg viewBox="0 0 ${width} ${h}" width="100%" role="img" aria-label="sketch of the stairs">`;
  for (const st of layout.steps) {
    svg += `<polygon points="${st.poly.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" fill="${st.kind === 'tread' ? '#3a3f4b' : '#4a5160'}" stroke="#14161a" stroke-width="0.6"/>`;
  }
  if (layout.arrow?.length > 1) svg += `<polyline points="${layout.arrow.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="#ffb454" stroke-width="1" stroke-dasharray="4 3"/>`;
  for (const d of dims) {
    const [ax, ay] = [X(d.a[0]), Y(d.a[1])], [bx, by] = [X(d.b[0]), Y(d.b[1])];
    svg += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#ffb454" stroke-width="1.2"/>`;
    svg += `<text x="${X(d.mid[0]).toFixed(1)}" y="${(Y(d.mid[1]) - 4).toFixed(1)}" fill="#ffb454" font-size="11" text-anchor="middle">flight ${d.k + 1}: ${r(d.L)} mm</text>`;
  }
  return svg + '</svg>';
}
