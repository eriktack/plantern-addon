// The nudge pad of the Editor on a touch screen (docs/plans/mobile-ux.md, S4): four arrows that move the selected thing 10 mm
// per tap, as the arrow keys do, and keep moving while a finger stays on one. The repeat is pure with the timer injected (tested).

export const NUDGE_STEP = 10;            // mm per tap, as the arrow key without a modifier
export const NUDGE_DIRS = { left: [-1, 0], up: [0, 1], down: [0, -1], right: [1, 0] };   // plan axes: x east, y north

/**
 * start() fires once now, then after `first` ms every `every` ms until stop(). One call to start() while one is running first
 * stops it. fire() gets no arguments; the pad passes the direction by making one repeater per arrow.
 */
export function createRepeater({ fire, first = 400, every = 120, setTimer = (f, ms) => setTimeout(f, ms), clearTimer = id => clearTimeout(id) }) {
  let timer = null, running = false;
  const stop = () => { running = false; if (timer !== null) { clearTimer(timer); timer = null; } };
  const tick = () => { if (!running) return; fire(); timer = setTimer(tick, every); };
  return {
    start() { stop(); running = true; fire(); timer = setTimer(tick, first); },
    stop,
    get running() { return running; },
  };
}

/** The kinds of selection the pad can move (what the arrow keys move). A wall only when drawn by hand (it follows its rooms otherwise). */
export function canNudge(kind, wall) {
  if (kind === 'wall') return !!wall && !wall.from?.length;
  return ['object', 'fixture', 'opening'].includes(kind);
}
