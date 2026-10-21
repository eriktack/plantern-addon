// The draft of the form being edited, published once for everyone who draws it (docs/archive/2026-10-21-live-3d-preview.md PV1): the plan's live preview
// and the 3D preview pane. live-preview.js runs Apply as a dry run and publishes what it gave; refresh() publishes null (the stored model is
// what is shown again: Revert, Apply, leaving the edit, any selection). A subscriber therefore never repeats the dry run.

import { Ed } from './state.js';

/** Calls `fn(draft)` for every published draft: `{ model, kind, id }`, or null when the stored model is the one to show. Returns the unsubscribe. */
export function onDraft(fn) {
  Ed.draftSubs.add(fn);
  return () => Ed.draftSubs.delete(fn);
}

/** Makes `draft` the current one and tells the subscribers. A subscriber that throws does not stop the others. */
export function publishDraft(draft) {
  Ed.draft3d = draft;
  for (const fn of [...Ed.draftSubs]) { try { fn(draft); } catch (e) { console.error(e); } }
}
