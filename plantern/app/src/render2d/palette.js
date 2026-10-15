// The plan's colours (CD1, CD2 in docs/archive/2026-10-15-card-followups.md). Every colour the 2D plan draws comes from one palette
// object, so a light background can use another set without touching the drawing code. DARK is the viewer's and the
// card's plan as it has always looked. LIGHT is for a light dashboard (the card's `card` or `transparent` background
// on a light theme, CD3). Pure: no DOM, so the rules here can be tested in Node.

/** The dark plan: light walls and labels on a dark floor; lamp glow is added on top with `screen`. */
export const DARK_PALETTE = Object.freeze({
  label: '#5d6573',                                   // room names, the "no levels" text
  floor: '#262a31', floorExterior: '#20252b', floorNone: '#1a1d22', floorNoneOutline: '#5d6573',
  opening: { window: '#6cb6ff', door: '#e0a060', passage: '#8b93a1' },
  downBg: '#14161a', downOutline: '#6b7482', downStep: '#2b303a', downStepStroke: '#8b93a1', downArrow: '#c9d1de',
  upAboveOutline: '#7d8594', upStep: '#3a404b', upStepStroke: '#9aa3b2', upArrow: '#e6ebf3',
  wall: '#aab0bb', wallRailing: '#6d7480', wallVirtual: '#3a404b',
  solid: '#6b4f3a', solidStroke: '#999999',
  objectDefault: '#888888', missing: '#b00020',
  fixtureOff: '#4a505a', fixtureOffStroke: '#8b93a1', fixtureOn: '#ffffff', fixtureUnavailable: '#e5534b',
  glowBlend: 'screen',                                // a lamp's light is added to what is under it
});

/** The light plan: dark walls and labels on pale floors; lamp glow is laid on with `multiply`, which shows on white. */
export const LIGHT_PALETTE = Object.freeze({
  label: '#4b5361',
  floor: '#e6e2d8', floorExterior: '#eeebe4', floorNone: '#cfcac0', floorNoneOutline: '#6b7280',
  opening: { window: '#1f6fb5', door: '#a85a16', passage: '#6b7280' },
  downBg: '#d6d1c6', downOutline: '#7d8594', downStep: '#bfb9ac', downStepStroke: '#6b7280', downArrow: '#3a404b',
  upAboveOutline: '#8b93a1', upStep: '#b4bac4', upStepStroke: '#4b5361', upArrow: '#262a31',
  wall: '#4a4f5c', wallRailing: '#6b7280', wallVirtual: '#9aa0aa',
  solid: '#8a6a4f', solidStroke: '#555555',
  objectDefault: '#777777', missing: '#b00020',
  fixtureOff: '#c4c9d2', fixtureOffStroke: '#6b7280', fixtureOn: '#222222', fixtureUnavailable: '#d14a42',
  glowBlend: 'multiply',
});

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i;

/** [r, g, b] (0–255) of a colour written as #rgb, #rrggbb or rgb(r, g, b); null for anything else (a CSS variable, a name). */
export function parseColour(s) {
  const t = String(s ?? '').trim();
  const h = HEX.exec(t);
  if (h) {
    const x = h[1].length === 3 ? [...h[1]].map(c => c + c).join('') : h[1];
    return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16));
  }
  const r = RGB.exec(t);
  return r ? [r[1], r[2], r[3]].map(Number) : null;
}

/** WCAG relative luminance (0 black … 1 white) of a parsed colour. */
export function relativeLuminance([r, g, b]) {
  const lin = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1 … 21) between two colours given as strings; null when one of them cannot be read. */
export function contrastRatio(a, b) {
  const pa = parseColour(a), pb = parseColour(b);
  if (!pa || !pb) return null;
  const [hi, lo] = [relativeLuminance(pa), relativeLuminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The colour the plan sits on, for a card `background`: `card` is the card's own colour (--card-background-color), `transparent` the dashboard
 * behind it (--lovelace-background when that is a plain colour, else --primary-background-color), falling back to the card's colour.
 * `read(name)` gives the value of a CSS variable ('' when it is not set). A name or a gradient cannot be read as a colour and is passed over.
 */
export function backgroundColour(background, read) {
  const usable = v => (parseColour(v) ? v : null);
  if (background === 'transparent') return usable(read('--lovelace-background')) ?? usable(read('--primary-background-color')) ?? read('--card-background-color');
  return read('--card-background-color');
}

/**
 * Which plan palette a card uses (CD3). `dark` is always the dark plan. `card` and `transparent` follow the dashboard:
 * a card colour that is light (black text reads better on it than white, the WCAG 0.179 point) gets the light plan.
 * An unreadable colour (a CSS variable not set, an empty string) keeps the dark plan.
 */
export function paletteFor(background, cardColour) {
  if (background === 'card' || background === 'transparent') {
    const rgb = parseColour(cardColour);
    if (rgb && relativeLuminance(rgb) > 0.179) return LIGHT_PALETTE;
  }
  return DARK_PALETTE;
}
