// A press that stays put opens the menu (docs/archive/2026-10-20-mobile-ux.md, S3): Android Chrome sends `contextmenu` on a long press, iOS
// Safari does not, so the Editor times the press itself. The rule is pure, with the timer injected, and is tested:
//   down(x, y)   a finger lands: the timer starts
//   move(x, y)   the finger moved: further than `slop` px from where it landed, before the time is up, makes it a drag (no menu)
//   cancel()     the finger lifted, a second finger landed, or the gesture was dropped
// After `delay` ms without moving more than `slop`, onLong(x, y) is called once, at the point where the finger landed.

export function createLongPress({ delay = 500, slop = 8, onLong, setTimer = (f, ms) => setTimeout(f, ms), clearTimer = id => clearTimeout(id) }) {
  let timer = null, start = null, state = 'idle';     // idle | pressing | dragging | fired
  const stop = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
  return {
    down(x, y) {
      stop();
      start = { x, y };
      state = 'pressing';
      timer = setTimer(() => { timer = null; state = 'fired'; onLong(start.x, start.y); }, delay);
    },
    /** What the press is now: 'pressing' (still a candidate), 'dragging' (moved too far: a drag as always), 'fired' (the menu opened). */
    move(x, y) {
      if (state === 'pressing' && Math.hypot(x - start.x, y - start.y) > slop) { stop(); state = 'dragging'; }
      return state;
    },
    cancel() { stop(); state = 'idle'; },
    get state() { return state; },
  };
}
