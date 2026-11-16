// Timing of the 3D view (the viewer with ?perf=1), the way src/capture/perf.js times the Editor. The view reports each build
// (why it ran, how long the page's thread was held, how many shader programs there were before and after) and each frame it draws; this
// module logs them, and lists the browser's long tasks (a task that held the page for more than 50 ms) beside them. Off (the default) the
// view is given no hook and reads no clock.

/** The line logged for one event of the view. Pure. */
export function perfLine(e) {
  const programs = e.programs ? `, programs ${e.programs[0]} → ${e.programs[1]}` : '';
  if (e.type === 'build') return `[3d] build ${e.n} (${e.cause || 'unknown'}) ${Math.round(e.ms)} ms${programs}`;
  if (e.type === 'compile') return `[3d] compile for build ${e.n} ${Math.round(e.ms)} ms${e.parallel ? '' : ' (no parallel compile: the first frame holds the page)'}${programs}`;
  if (e.type === 'render') return `[3d] frame ${e.nth} after build ${e.n} ${Math.round(e.ms)} ms${programs}`;
  return `[3d] ${e.type}`;
}

/**
 * A hook for createView3d(container, { perf }): perf(event) keeps and logs it. perf.events and perf.long (the long tasks: { at, ms })
 * can be read from the console; perf.summary() gives the counts and the totals. Frames under `quietMs` are kept but not logged.
 */
export function createPerf3d({ log = (...a) => console.log(...a), now = () => performance.now(), quietMs = 30, observe = true } = {}) {
  const events = [], long = [];
  if (observe && typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver(list => { for (const t of list.getEntries()) long.push({ at: Math.round(t.startTime), ms: Math.round(t.duration) }); }).observe({ type: 'longtask', buffered: true });
    } catch { /* a browser without long tasks: the builds and frames are still timed */ }
  }
  const perf = e => {
    events.push({ at: Math.round(now()), ...e });
    if (e.type !== 'render' || e.ms >= quietMs) log(perfLine(e));
  };
  perf.events = events;
  perf.long = long;
  perf.summary = () => {
    const of = type => events.filter(e => e.type === type), sum = list => Math.round(list.reduce((n, e) => n + e.ms, 0));
    return {
      builds: of('build').length, causes: of('build').map(e => e.cause || 'unknown'), buildMs: sum(of('build')), compileMs: sum(of('compile')),
      frames: of('render').length, frameMs: sum(of('render')), slowestFrame: Math.round(Math.max(0, ...of('render').map(e => e.ms))),
      longTasks: long.length, longMs: sum(long), longest: Math.max(0, ...long.map(t => t.ms)),
    };
  };
  return perf;
}
