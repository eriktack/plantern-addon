// Timing marks for the Editor (ui-consistency plan, UX1). With ?perf=1 the page times the parts of a
// commit, a selection and a drag frame and logs one line per action:
//   "select 142 ms: issues 38, tree 3, panel 61, draw 12"
// Off (the default) every call is a plain function call: no clock is read, nothing is kept.

/** A timer: time(name, fn) runs fn and adds its time to `name`; flush(label) logs and clears. */
export function createPerf(enabled, log = (...a) => console.log(...a)) {
  let parts = new Map(), start = null;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    enabled,
    time(name, fn) {
      if (!enabled) return fn();
      if (start === null) start = now();
      const a = now();
      try { return fn(); } finally { parts.set(name, (parts.get(name) || 0) + now() - a); }
    },
    /** The line for what was timed since the last flush (or null), and a fresh start. */
    flush(label) {
      if (!enabled || start === null) return null;
      const total = now() - start, line = `${label} ${Math.round(total)} ms: ${[...parts].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`;
      parts = new Map(); start = null;
      log(line);
      return line;
    },
  };
}
