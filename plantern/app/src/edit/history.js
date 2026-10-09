// Undo/redo as a stack of model snapshots (PLANTERN.md §7 Editing). Pure; models are never mutated,
// so a snapshot is just a reference. push(model, key): a push with the same key as the previous one
// replaces it (typing into one field is one undo step, not one per keystroke).

export function createHistory(model, limit = 200) {
  let stack = [model], at = 0, lastKey = null;
  return {
    get current() { return stack[at]; },
    get canUndo() { return at > 0; },
    get canRedo() { return at < stack.length - 1; },
    push(next, key = null) {
      if (next === stack[at]) return next;
      stack = stack.slice(0, at + 1);
      if (key !== null && key === lastKey && at > 0) stack[at] = next;
      else { stack.push(next); at++; }
      if (stack.length > limit) { stack.shift(); at--; }
      lastKey = key;
      return next;
    },
    undo() { if (at > 0) at--; lastKey = null; return stack[at]; },
    redo() { if (at < stack.length - 1) at++; lastKey = null; return stack[at]; },
  };
}
