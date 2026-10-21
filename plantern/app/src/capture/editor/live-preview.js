// A live preview of the form being edited (docs/plans/live-3d-preview.md's 2D half): while a value of a wall, opening, lamp, object or stairs
// is typed, stepped (↑ / ↓), dragged on its label or moved with a slider, the plan shows the thing where Apply would put it, with what
// follows it (what stands in an opening, the strips on an object, the walls round an opening). Nothing is stored: no undo step, no status line,
// no changed model. It is the real Apply run as a dry run (Ed.dry makes commit() keep the model it is given instead of storing it), so the
// preview is exactly what Apply would give, reconcile() included; the plan is then drawn from that model for one frame and the real model,
// geometry and snap points are put back. A form that does not give a model (nothing changed, a number not typed yet) shows the plan as stored.
// Revert, Apply, leaving the edit and every other refresh draw the plan from the real model again.

import { Ed } from './state.js';
import { $ } from './core.js';
import { isFresh } from './session.js';
import { draw } from './plan-draw.js';
import { refreshSnaps } from './refresh.js';
import { applyOpening } from './panel-opening.js';
import { applyFixture } from './panel-fixture.js';
import { applyObjectForm } from './panel-object.js';
import { applyWall } from './panel-wall.js';
import { applyStairsForm } from './panel-stairs.js';

/** The pause before a preview is made: a few frames, so a fast drag or a long number is not drawn at every step. */
const PREVIEW_MS = 30;
/** The edit views a preview is made for, with their Apply. */
const APPLY = { opening: applyOpening, fixture: applyFixture, object: applyObjectForm, wall: applyWall, stairs: applyStairsForm };
/** The message lines of those panels: an Apply that is run to see what it gives must not leave its complaints behind. */
const MESSAGES = ['wErr', 'oErr', 'xErr', 'stErr', 'obErr', 'wallsOut'];

/**
 * The model Apply would give for the form as it stands, or null (nothing changed, a value that is not valid yet, a new thing that is not
 * created yet, a view without a preview). The form, the messages and the real model are left as they were.
 */
export async function draftModel() {
  const k = Ed.editing?.kind, run = APPLY[k];
  if (!run || isFresh()) return null;
  const kept = MESSAGES.map(id => [id, $(id)?.textContent, $(id)?.innerHTML]);
  Ed.dry = {};
  let model = null;
  try { await run(); } catch { /* a form in the middle of being typed */ }
  finally {
    model = Ed.dry?.model ?? null;
    Ed.dry = null;
    for (const [id, text, html] of kept) if ($(id)) { $(id).textContent = text; if ($(id).innerHTML !== html) $(id).innerHTML = html; }
  }
  return model && model !== Ed.model ? model : null;
}

/** Draws the plan from `model` for one frame and puts the real model, geometry and snap points back. */
export function showDraft(model) {
  const keep = { model: Ed.model, curGeo: Ed.curGeo, snaps: Ed.snaps, snapsAround: Ed.snapsAround, underlay: Ed.underlay, snapsDataKey: Ed.snapsDataKey };
  try {
    Ed.model = model;
    Ed.snapsDataKey = null;                                          // rebuilt for the draft
    refreshSnaps();
    draw();
  } finally { Object.assign(Ed, keep); }
  Ed.livePreview = true;
}

/** Asks for a preview of the form as it is now: at most one every 30 ms, and only the newest answer is shown. */
export function scheduleLivePreview() {
  if (Ed.liveQueued || !APPLY[Ed.editing?.kind] || Ed.dragging) return;
  Ed.liveQueued = true;
  setTimeout(async () => {
    Ed.liveQueued = false;
    const mine = ++Ed.liveSeq, model = await draftModel();
    if (mine !== Ed.liveSeq) return;
    if (model) showDraft(model);
    else if (Ed.livePreview) { Ed.livePreview = false; draw(); }     // back to the plan as stored
  }, PREVIEW_MS);
}

/** Wires the edit panels: any value changed in them asks for a preview. */
export function wireLivePreview() {
  for (const id of ['wallPanel', 'openingPanel', 'fixturePanel', 'objectPanel', 'stairsPanel']) {
    const el = $(id);
    el?.addEventListener('input', scheduleLivePreview);
    el?.addEventListener('change', scheduleLivePreview);
  }
}
