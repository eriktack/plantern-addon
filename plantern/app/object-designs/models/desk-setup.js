import { primitives, booleans, geometries } from '../lib/jscad.js';

// A computer on a desk: a monitor on its stand, a keyboard and a mouse in front of it, and (optionally) a speaker on each side.
// ASSUMED: The monitor is 16:9; its width and height follow from the diagonal (27 in: 598 x 336 mm, panel only).
// ASSUMED: The panel is 25 mm deep with an 8 mm bezel at the sides and top and 15 mm at the bottom; the screen is sunk 2 mm behind the bezel.
// ASSUMED: The stand lifts the panel 90 mm above the desk: a 240 x 200 x 15 mm foot and a 60 mm wide, 20 mm deep neck.
// ASSUMED: The keyboard is a full-size 440 x 135 mm board, 18 mm high, with a 6 mm raised block of keys; it lies 80 mm in front of the foot.
// ASSUMED: The mouse is 62 x 115 x 35 mm, 70 mm to the right of the keyboard, in line with it.
// ASSUMED: The speakers are 100 x 110 x 200 mm boxes, 40 mm beside the panel, their fronts 20 mm behind the panel's front line.
// ASSUMED: Cables, ports, the speakers' cones and the keys' individual caps are omitted (the keys are one block).
// ASSUMED: The whole group is centred on x and y by its outer bounds, so the speakers and the mouse move the centre; the group stands on the desk (placement z 740 mm).
// UNSURE: A different desk height means moving the object (its z), not a parameter of the model.

const ASPECT = 16 / 9;
const IN = 25.4;
const OVERLAP = 5;
const BEZEL = { side: 8, top: 8, bottom: 15 };
const PANEL_DEPTH = 25;
const RECESS = 2;                                 // the screen is this far behind the bezel front
const LIFT = 90;                                  // the panel's bottom above the desk
const FOOT = { w: 240, d: 200, t: 15 };
const NECK = { w: 60, d: 20 };
const KEYBOARD = { w: 440, d: 135, h: 18, keys: 6, gap: 80 };
const MOUSE = { w: 62, d: 115, h: 35, gap: 70 };
const SPEAKER = { w: 100, d: 110, h: 200, gap: 40, back: 20 };

export const meta = {
  id: 'desk-setup',
  name: 'Computer desk equipment',
  summary: 'A monitor on a stand with a keyboard, a mouse and optional speakers.',
  description:
    'A computer workplace for a desk: a 16:9 monitor on a stand, a keyboard and a mouse in front of it, and a speaker on each side. The screen size is the diagonal in inches (default 27). Assumed: panel 25 mm deep with an 8 mm bezel (15 mm at the bottom) and the screen sunk 2 mm; stand lifts the panel 90 mm (foot 240 x 200 mm, neck 60 mm); keyboard 440 x 135 x 18 mm with a 6 mm block of keys, 80 mm in front of the foot; mouse 62 x 115 x 35 mm, 70 mm right of the keyboard; speakers 100 x 110 x 200 mm, 40 mm beside the panel; cables, ports and speaker cones omitted; the group is centred on its outer bounds and stands on the desk (placement z 740 mm).',
  params: [
    {
      key: 'diagonal',
      label: 'Monitor size (diagonal)',
      type: 'enum_number',
      unit: 'in',
      options: [22, 24, 27, 32, 34],
      default: 27,
    },
    { key: 'speakers', label: 'Speakers', type: 'boolean', default: true },
    { key: 'material', label: 'Material (whole object)', type: 'material', default: 'charcoal' },
  ],
  parts: [
    { key: 'monitor', label: 'Monitor housing' },
    { key: 'screen', label: 'Screen', defaultMaterial: '#0d1017' },
    { key: 'stand', label: 'Monitor stand', defaultMaterial: 'black-metal' },
    { key: 'keyboard', label: 'Keyboard' },
    { key: 'keys', label: 'Keys', defaultMaterial: '#2a2e37' },
    { key: 'mouse', label: 'Mouse' },
    { key: 'speakers', label: 'Speakers', needs: 'speakers' },
  ],
  placement: { mount: 'floor', z: 740 },
};

/** The boxes of the setup in a frame with the monitor foot's middle at x = 0 and y = 0: { x0, x1, y0, y1 } each. */
function layout(p) {
  const w = Math.round(p.diagonal * IN * (ASPECT / Math.hypot(ASPECT, 1)));
  const h = Math.round(w / ASPECT);
  const kbBack = -FOOT.d / 2 - KEYBOARD.gap;
  const kb = { x0: -KEYBOARD.w / 2, x1: KEYBOARD.w / 2, y0: kbBack - KEYBOARD.d, y1: kbBack };
  const mouseX = KEYBOARD.w / 2 + MOUSE.gap;
  const mouse = { x0: mouseX - MOUSE.w / 2, x1: mouseX + MOUSE.w / 2, y0: kbBack - KEYBOARD.d / 2 - MOUSE.d / 2, y1: kbBack - KEYBOARD.d / 2 + MOUSE.d / 2 };
  const panel = { x0: -w / 2, x1: w / 2, y0: -PANEL_DEPTH / 2, y1: PANEL_DEPTH / 2 };
  const foot = { x0: -FOOT.w / 2, x1: FOOT.w / 2, y0: -FOOT.d / 2, y1: FOOT.d / 2 };
  const front = panel.y0 + SPEAKER.back;                                        // the speakers' fronts
  const spk = side => {
    const x0 = side < 0 ? -w / 2 - SPEAKER.gap - SPEAKER.w : w / 2 + SPEAKER.gap;
    return { x0, x1: x0 + SPEAKER.w, y0: front, y1: front + SPEAKER.d };
  };
  const boxes = [panel, foot, kb, mouse];
  const speakers = p.speakers ? [spk(-1), spk(1)] : [];
  boxes.push(...speakers);
  const bounds = {
    x0: Math.min(...boxes.map(b => b.x0)), x1: Math.max(...boxes.map(b => b.x1)),
    y0: Math.min(...boxes.map(b => b.y0)), y1: Math.max(...boxes.map(b => b.y1)),
  };
  const height = Math.max(LIFT + h, KEYBOARD.h + KEYBOARD.keys, p.speakers ? SPEAKER.h : 0);
  return { w, h, panel, foot, kb, mouse, speakers, bounds, height, dx: -(bounds.x0 + bounds.x1) / 2, dy: -(bounds.y0 + bounds.y1) / 2 };
}

export function build(p) {
  const L = layout(p);
  const at = (b, z0, z1) => primitives.cuboid({
    size: [b.x1 - b.x0, b.y1 - b.y0, z1 - z0],
    center: [(b.x0 + b.x1) / 2 + L.dx, (b.y0 + b.y1) / 2 + L.dy, (z0 + z1) / 2],
  });

  // the housing: the panel with a shallow recess in front; the screen sits in the recess, 2 mm behind the bezel front
  const bottom = LIFT, top = LIFT + L.h;
  const housing = booleans.subtract(
    at(L.panel, bottom, top),
    primitives.cuboid({
      size: [L.w - 2 * BEZEL.side, 6, L.h - BEZEL.top - BEZEL.bottom],                    // y: 1 mm before the front to 5 mm into the panel
      center: [L.dx, L.panel.y0 + L.dy + 2, bottom + BEZEL.bottom + (L.h - BEZEL.top - BEZEL.bottom) / 2],
    }),
  );
  const screen = primitives.cuboid({
    size: [L.w - 2 * BEZEL.side, 7, L.h - BEZEL.top - BEZEL.bottom],                      // y: 2 mm behind the front to 9 mm (4 mm into the housing)
    center: [L.dx, L.panel.y0 + L.dy + RECESS + 3.5, bottom + BEZEL.bottom + (L.h - BEZEL.top - BEZEL.bottom) / 2],
  });

  const neckBottom = FOOT.t - OVERLAP, neckTop = bottom + OVERLAP;
  const stand = booleans.union(
    at(L.foot, 0, FOOT.t),
    primitives.cuboid({ size: [NECK.w, NECK.d, neckTop - neckBottom], center: [L.dx, L.dy, (neckBottom + neckTop) / 2] }),
  );

  const keyboard = at(L.kb, 0, KEYBOARD.h);
  const keys = at({ x0: L.kb.x0 + 12, x1: L.kb.x1 - 12, y0: L.kb.y0 + 12, y1: L.kb.y1 - 12 }, KEYBOARD.h - OVERLAP, KEYBOARD.h + KEYBOARD.keys);
  const mouse = primitives.roundedCuboid({
    size: [MOUSE.w, MOUSE.d, MOUSE.h],
    center: [(L.mouse.x0 + L.mouse.x1) / 2 + L.dx, (L.mouse.y0 + L.mouse.y1) / 2 + L.dy, MOUSE.h / 2],
    roundRadius: 14,
    segments: 12,
  });
  const speakers = L.speakers.length ? booleans.union(...L.speakers.map(b => at(b, 0, SPEAKER.h))) : geometries.geom3.create();

  return { monitor: housing, screen, stand, keyboard, keys, mouse, speakers };
}

/** Overall size [x, y, z] in mm, checked against the built bounds. */
export function size(p) {
  const L = layout(p);
  return [L.bounds.x1 - L.bounds.x0, L.bounds.y1 - L.bounds.y0, L.height];
}
