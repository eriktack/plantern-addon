// A padlock in the plan (a door's lock from Home Assistant, PLANTERN.md §6.1, §8): a body and a shackle, 2D SVG in plan mm,
// y down. Closed: the shackle is a full arch; open: it is lifted and swung to one side. `look` is padlockLook() (src/ha/door.js).

/**
 * The SVG shapes of a padlock of width `w` centred on (cx, cy): [{ tag, attrs }]. Pure. The shackle has the same proportions as the 3D one
 * (src/geometry/padlock.js): closed, an arch with both legs in the body; open, as tall and swung out on its left leg, so the right leg stands free
 * beside the body (to the right, y down) and ends just above it.
 */
export function padlockShapes(cx, cy, w, look) {
  const bodyW = w, bodyH = w * 0.77, top = cy - bodyH / 2, shackleStroke = w * 0.11;
  const r = look.open ? 0.36 * w : 0.31 * w, leftX = look.open ? cx + 0.36 * w : cx - r, rightX = leftX + 2 * r;
  const archY = top - 0.62 * w + r;                                                       // the arch's centre: the shackle is as tall as the closed one, as in 3D
  const endY = look.open ? top - 0.1 * w : top;                                          // where the right leg ends
  const arch = `M ${leftX} ${top} L ${leftX} ${archY} A ${r} ${r} 0 0 1 ${rightX} ${archY} L ${rightX} ${endY}`;
  return [
    { tag: 'path', attrs: { d: arch, fill: 'none', stroke: look.colour, 'stroke-width': shackleStroke, 'stroke-linecap': 'round' } },
    { tag: 'rect', attrs: { x: cx - bodyW / 2, y: top, width: bodyW, height: bodyH, rx: w * 0.12, fill: look.colour, stroke: '#0d1117', 'stroke-width': w * 0.04 } },
    { tag: 'circle', attrs: { cx, cy: cy - bodyH * 0.06, r: w * 0.09, fill: '#0d1117' } },
    { tag: 'rect', attrs: { x: cx - w * 0.04, y: cy - bodyH * 0.06, width: w * 0.08, height: bodyH * 0.28, fill: '#0d1117' } },
  ];
}

/** Draws it into `parent` with the plan's `el(tag, attrs, parent)`; the group carries `data-lock` (the state) and a title. */
export function drawPadlock(el, parent, [cx, cy], w, look, id) {
  const g = el('g', { class: 'padlock', 'data-door': id, 'data-lock': look.label, 'pointer-events': 'none' }, parent);
  for (const s of padlockShapes(cx, cy, w, look)) el(s.tag, s.attrs, g);
  el('title', {}, g).textContent = `${id}: ${look.label}`;
  return g;
}
