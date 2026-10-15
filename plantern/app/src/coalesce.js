// Many small changes, one redraw. `coalesce(fn)` returns a function that, when called, runs `fn` once after a quiet moment: `quiet` ms with
// no further call, but never later than `max` ms after the first call of the batch, so a long run of changes (fifty models loading one
// after another) still shows its progress now and then. A call while nothing is waiting starts a new batch. Pure: the clock and the
// timers can be given (tests); in the browser they are the page's.

export function coalesce(fn, { quiet = 120, max = 800, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null, first = 0;
  const run = () => { timer = null; first = 0; fn(); };
  const call = () => {
    const t = now();
    if (timer === null) first = t;
    else clearTimer(timer);
    timer = setTimer(run, Math.max(0, Math.min(quiet, first + max - t)));
  };
  /** Runs the waiting change now (if there is one). */
  call.flush = () => { if (timer !== null) { clearTimer(timer); run(); } };
  call.cancel = () => { if (timer !== null) { clearTimer(timer); timer = null; first = 0; } };
  return call;
}
