// Runs an async task one at a time. A call that arrives while it is running does not start a second copy at once
// (two saves in flight, each with the same base): it asks for one more run after the current one, however many
// calls came meanwhile. The task reads the form when it runs, so that run sees the latest values. Pure.
export function serialRunner(task) {
  let running = null, again = false;
  return function trigger() {
    if (running) { again = true; return running; }
    running = (async () => {
      try { await task(); } finally { running = null; }
      if (again) { again = false; return trigger(); }
    })();
    return running;
  };
}
