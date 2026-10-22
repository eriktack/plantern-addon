// A slider with two handles for a range (a low and a high value, 0 to 100 by default): two range inputs one over the other,
// the part between the handles coloured. Used by the viewer's light range and the Lovelace card's editor (decision 283).
// Its style is added to the page once, so it works in the card (which has no stylesheet of the viewer's).

const STYLE_ID = 'plantern-dual-slider';
const CSS = `
.plantern-dual { position: relative; height: 28px; margin: 6px 0; }
.plantern-dual .track { position: absolute; left: 9px; right: 9px; top: 12px; height: 4px; border-radius: 2px; background: rgba(128, 128, 128, .35); }
.plantern-dual .bar { position: absolute; top: 0; bottom: 0; border-radius: 2px; background: #e8a33d; }
.plantern-dual input[type=range] { position: absolute; left: 0; top: 0; width: 100%; height: 28px; margin: 0; padding: 0; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
.plantern-dual input[type=range]::-webkit-slider-runnable-track { background: none; height: 28px; }
.plantern-dual input[type=range]::-moz-range-track { background: none; height: 28px; }
.plantern-dual input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 18px; height: 18px; margin-top: 5px; border-radius: 50%; background: #fff; border: 2px solid #e8a33d; cursor: pointer; }
.plantern-dual input[type=range]::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid #e8a33d; cursor: pointer; }
`;

/**
 * Draws the two-handle slider into `host` and returns { set(low, high), get() → [low, high] }. `onInput(low, high)` runs as a
 * handle moves; the low handle never passes the high one, nor the other way round.
 */
export function createDualSlider(host, { min = 0, max = 100, low, high, label = 'Range', onInput } = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  host.classList.add('plantern-dual');
  host.innerHTML = `<div class="track"><div class="bar"></div></div>
    <input type="range" class="lo" min="${min}" max="${max}" step="1" aria-label="${label}: low end">
    <input type="range" class="hi" min="${min}" max="${max}" step="1" aria-label="${label}: high end">`;
  const lo = host.querySelector('.lo'), hi = host.querySelector('.hi'), bar = host.querySelector('.bar');
  const at = v => ((Number(v) - min) / (max - min)) * 100;
  // two handles on one value: the one the pointer can still move must be on top. At the top end that is the low one (the high
  // one can only go down to it), anywhere else the high one
  const paint = () => {
    const atTop = Number(lo.value) === Number(hi.value) && Number(lo.value) > (min + max) / 2;
    lo.style.zIndex = atTop ? 2 : 1; hi.style.zIndex = atTop ? 1 : 2;
    bar.style.left = `${at(lo.value)}%`;
    bar.style.right = `${100 - at(hi.value)}%`;
  };
  const moved = () => { paint(); onInput?.(Number(lo.value), Number(hi.value)); };
  lo.oninput = () => { if (Number(lo.value) > Number(hi.value)) lo.value = hi.value; moved(); };
  hi.oninput = () => { if (Number(hi.value) < Number(lo.value)) hi.value = lo.value; moved(); };
  const set = (a, b) => { lo.value = a; hi.value = b; paint(); };
  set(low ?? min, high ?? max);
  return { set, get: () => [Number(lo.value), Number(hi.value)] };
}
