// Plan axes and a compass, as a small fixed overlay (it does not zoom with the plan). Pure: returns
// SVG markup. The plan is always drawn with plan north up, so x points right and y up on screen;
// true north is site.northAngleDeg counter-clockwise from plan north (that angle is how far plan
// north is from true north, clockwise; PLANTERN.md §3).

export function compassSvg(northAngleDeg = 0) {
  const n = Number(northAngleDeg) || 0;
  const arrow = (x1, y1, x2, y2, color) => {
    const a = Math.atan2(y2 - y1, x2 - x1), h = 6, s = 0.45;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"/>` +
      `<path d="M${x2},${y2} L${x2 - h * Math.cos(a - s)},${y2 - h * Math.sin(a - s)} L${x2 - h * Math.cos(a + s)},${y2 - h * Math.sin(a + s)} Z" fill="${color}"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="124" height="64" viewBox="0 0 124 64" role="img" aria-label="Plan axes and north">
  <title>Plan axes: x east, y north (plan). Compass: true north${n ? `, ${n}° from plan north` : ' = plan north'}.</title>
  <g font-family="system-ui,sans-serif" font-size="11">
    ${arrow(10, 54, 46, 54, '#e5534b')}<text x="49" y="58" fill="#e5534b">x</text>
    ${arrow(10, 54, 10, 18, '#4cc38a')}<text x="6" y="13" fill="#4cc38a">y</text>
    <circle cx="94" cy="34" r="24" fill="#14161acc" stroke="#3a404b"/>
    <g transform="rotate(${-n} 94 34)">
      <path d="M94,13 L99,34 L94,31 L89,34 Z" fill="#ffb454"/><path d="M94,55 L99,34 L94,37 L89,34 Z" fill="#5d6573"/>
      <text x="94" y="9" fill="#ffb454" text-anchor="middle" font-weight="600" transform="rotate(${n} 94 6)">N</text>
    </g>
  </g>
</svg>`;
}
