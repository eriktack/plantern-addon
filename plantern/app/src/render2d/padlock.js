// A padlock in the plan (a door's lock from Home Assistant, PLANTERN.md §6.1, §8): a body and a shackle, 2D SVG in plan mm,
// y down. Closed: the shackle is a full arch; open: it is lifted and swung to one side. `look` is padlockLook() (src/ha/door.js).

/** The SVG shapes of a padlock of width `w` centred on (cx, cy): [{ tag, attrs }]. Pure. */
export function padlockShapes(cx, cy, w, look) {
  const bodyW = w, bodyH = w * 0.78, r = w * 0.3, top = cy - bodyH / 2, shackleStroke = w * 0.14;
  const sx = cx - r, ex = cx + r;                               // the shackle's feet, on the body's top edge
  const lift = look.open ? w * 0.24 : 0;
  const arch = look.open
    // lifted, and swung up on its left foot: the right foot is free in the air
    ? `M ${sx} ${top} L ${sx} ${top - r - lift} A ${r} ${r} 0 0 1 ${ex} ${top - r - lift} L ${ex} ${top - lift * 0.9}`
    : `M ${sx} ${top} L ${sx} ${top - r} A ${r} ${r} 0 0 1 ${ex} ${top - r} L ${ex} ${top}`;
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
