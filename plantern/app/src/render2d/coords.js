// The ONE place the plan → SVG y-flip happens (plan y = north, SVG y = down).
export const toSvg = p => [p[0], -p[1]];
export const fromSvg = p => [p[0], -p[1]];
export const svgPoints = poly => poly.map(p => toSvg(p).join(',')).join(' ');
