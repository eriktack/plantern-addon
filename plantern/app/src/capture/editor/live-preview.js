// A live preview of the form being edited (decision 267; the 3D preview pane, preview3d.js, draws the same draft): while a value of a wall, opening, lamp,
// object, stairs, solid or material is typed, stepped (↑ / ↓), dragged on its label or moved with a slider, the plan shows the thing where Apply would put it, with what
// follows it (what stands in an opening, the strips on an object, the walls round an opening). Nothing is stored: no undo step, no status line,
// no changed model. It is the real Apply run as a dry run (Ed.dry makes commit() keep the model it is given instead of storing it), so the
// preview is exactly what Apply would give, reconcile() included; the plan is then drawn from that model for one frame and the real model,
// geometry and snap points are put back. A form that does not give a model (nothing changed, a number not typed yet) shows the plan as stored.
// The draft is published once (draft-bus.js) for everyone who draws it: the plan here and the 3D pane; refresh() publishes null, and the stored model
// is drawn again (Revert, Apply, leaving the edit and every other refresh).

import { Ed } from './state.js';
import { $ } from './core.js';
import { draw } from './plan-draw.js';
import { refreshSnaps } from './refresh.js';
import { onDraft, publishDraft } from './draft-bus.js';
import { applyOpening } from './panel-opening.js';
import { applyFixture } from './panel-fixture.js';
import { applyObjectForm } from './panel-object.js';
import { applyWall } from './panel-wall.js';
import { applyStairsForm } from './panel-stairs.js';
import { apply as applySolid } from './room-apply.js';
import { applyMaterial } from './panel-wall.js';

/** The pause before a preview is made: a few frames, so a fast drag or a long number is not drawn at every step. */
const PREVIEW_MS = 30;
/** The edit views a preview is made for, with their Apply. */
const APPLY = { opening: applyOpening, fixture: applyFixture, object: applyObjectForm, wall: applyWall, stairs: applyStairsForm, solid: applySolid, material: applyMaterial };
/** The message lines of those panels: an Apply that is run to see what it gives must not leave its complaints behind. */
const MESSAGES = ['wErr', 'oErr', 'xErr', 'stErr', 'obErr', 'mErr', 'wallsOut'];

/** How many dry runs have been made (a counter for the tests: one per change, whoever draws the draft). */
export const dryRuns = { count: 0 };

/**
 * What Apply would give for the form as it stands: `{ model, loc }` (loc: the house's link as the form would leave it, the same object when the
 * form does not change it), or null (nothing changed, a value that is not valid yet, a new thing that is not created yet, a view without a
 * preview, a solid not applied yet). The form, the messages and the real model are left as they were.
 */
export async function runDraft() {
  const k = Ed.editing?.kind, run = APPLY[k];
  // A new thing that is not created yet is already in the model with its temporary id (decision 120), so its form previews like any other; only a solid that is
  // not measured and applied yet has no draft (its form is the room's, which the plan draws itself)
  if (!run || (k === 'solid' && !Ed.roomId)) return null;
  const kept = MESSAGES.map(id => [id, $(id)?.textContent, $(id)?.innerHTML]);
  Ed.dry = {};
  dryRuns.count++;
  let model = null, loc = Ed.loc;
  try { await run(); } catch { /* a form in the middle of being typed */ }
  finally {
    model = Ed.dry?.model ?? null;
    loc = Ed.dry?.loc ?? Ed.loc;
    Ed.dry = null;
    for (const [id, text, html] of kept) if ($(id)) { $(id).textContent = text; if ($(id).innerHTML !== html) $(id).innerHTML = html; }
  }
  return model && model !== Ed.model ? { model, loc } : null;
}

/** The model Apply would give for the form as it stands, or null (see runDraft). */
export async function draftModel() { return (await runDraft())?.model ?? null; }

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
    const mine = ++Ed.liveSeq, draft = await runDraft();
    if (mine !== Ed.liveSeq) return;
    publishDraft(draft ? { ...draft, kind: Ed.editing?.kind, id: Ed.editing?.id } : null);   // the plan and the 3D pane draw it
  }, PREVIEW_MS);
}

/** Wires the edit panels: any value changed in them asks for a preview. */
export function wireLivePreview() {
  // the plan draws the draft like any other subscriber; a null that follows a draft it showed puts the stored plan back (refresh() draws it itself)
  onDraft(d => { if (d) showDraft(d.model); else if (Ed.livePreview) { Ed.livePreview = false; draw(); } });
  for (const id of ['wallPanel', 'openingPanel', 'fixturePanel', 'objectPanel', 'stairsPanel', 'editor', 'matForm']) {
    const el = $(id);
    el?.addEventListener('input', scheduleLivePreview);
    el?.addEventListener('change', scheduleLivePreview);
  }
}
