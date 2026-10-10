// Timestamps for the server's log lines (the add-on's log in Home Assistant has none of its own).
// "[2026-10-10 12:34:56] message", in the server's local time; a multi-line message is stamped on its first line.

const pad = n => String(n).padStart(2, '0');

export function stamp(date = new Date()) {
  return `[${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}]`;
}

/** Make console.log / info / warn / error start with a timestamp. Returns a function that puts them back. */
export function stampConsole(target = console, now = () => new Date()) {
  const original = {};
  for (const level of ['log', 'info', 'warn', 'error']) {
    original[level] = target[level];
    target[level] = (...args) => original[level].call(target, stamp(now()), ...args);
  }
  return () => { for (const level of Object.keys(original)) target[level] = original[level]; };
}

/** The add-on runs with SUPERVISOR_TOKEN; PLANTERN_LOG_TIMESTAMPS=1 turns it on anywhere, =0 off. */
export function wantsTimestamps(env = process.env) {
  if (env.PLANTERN_LOG_TIMESTAMPS === '0') return false;
  return env.PLANTERN_LOG_TIMESTAMPS === '1' || !!env.SUPERVISOR_TOKEN;
}
