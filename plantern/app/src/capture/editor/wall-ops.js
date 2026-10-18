// Editor page: wall-ops. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { joinWalls, deleteWall, linkWalls, fillWalls } from '../../edit/ops.js';
import { askConfirm } from '../dialog.js';
import { describeReconcile } from '../../edit/reconcile.js';
import { wallInfo } from '../../edit/inspect.js';
import { pruneBindings } from '../../ha/suggest.js';
import { $, commit, esc, level, opts, wall } from './core.js';
import { freePoint } from './drag.js';
import { mayRefill, setStatus } from './session.js';
import { Ed } from './state.js';

/** mm from the selected wall's start under the pointer: whole centimetres unless Alt, kept off the very ends. */
export function splitAtPointer(e) {
  const w = wall();
  if (!w) return null;
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), q = freePoint(e), s0 = ((q[0] - w.a[0]) * (w.b[0] - w.a[0]) + (q[1] - w.a[1]) * (w.b[1] - w.a[1])) / L;
  const s = e.altKey ? Math.round(s0) : Math.round(s0 / 10) * 10;
  return Math.min(Math.max(s, 1), L - 1);
}
export function startSplitPick() {
  if (!wall()) return;
  Ed.splitPick = true; $('preview').classList.add('placing');
  setStatus('Point at where the wall splits and click (whole centimetres; Alt: exact) · Esc: cancel');
}
export function stopSplitPick(msg = '') { Ed.splitPick = false; $('preview').classList.remove('placing'); if (msg) setStatus(msg); }

/** Join the other part of a split wall into this one (its own properties are kept). */
export async function doJoin(otherId) {
  if (!(await mayRefill())) return;
  const r = joinWalls(Ed.model, Ed.levelId, Ed.wallId, otherId, opts());
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  const lost = r.report.dropped.length ? `

${otherId}'s own ${r.report.dropped.join(', ')} ${r.report.dropped.length > 1 ? 'are' : 'is'} dropped: the joined wall keeps ${Ed.wallId}'s.` : '';
  if (!(await askConfirm(`Join ${otherId} into ${Ed.wallId}, making one wall again?${lost}`, { ok: 'Join' }))) return;
  $('wallsOut').innerHTML = [`Joined ${otherId} into ${Ed.wallId}.`, ...describeReconcile(r.report)].map(esc).join('<br>');
  Ed.wallFormFor = null;
  commit(r.model);
  setStatus(`${otherId} joined into ${Ed.wallId} (not saved yet)`);
}

export async function removeWall() {
  const info = wallInfo(level(), Ed.wallId, Ed.issuesNow);
  const lines = [`Delete wall ${Ed.wallId}?`];
  if (info.openings.length) lines.push(`Its openings go too: ${info.openings.map(o => o.id).join(', ')}.`);
  if (!(await askConfirm(lines.join('\n\n'), { ok: 'Delete' }))) return;
  const id = Ed.wallId, r = deleteWall(Ed.model, Ed.levelId, id, opts());
  if (r.report.errors.length) { $('wErr').textContent = r.report.errors.join('; '); return; }
  Ed.wallId = null;
  Ed.loc = pruneBindings(Ed.loc, r.model);                              // the sensors of the doors in it go too
  commit(r.model);
  setStatus(`deleted ${id} (not saved yet)`);
}

export function doLinkWalls() {
  const r = linkWalls(Ed.model, Ed.levelId, opts());
  $('wallsOut').innerHTML = [
    r.report.bound.length ? `Linked to their rooms: ${r.report.bound.map(b => esc(b.id)).join(', ')}.` : 'No walls to link.',
    ...r.report.skipped.map(x => `${esc(x.id)} stays hand-drawn: ${esc(x.reason)}.`),
  ].join('<br>');
  if (r.report.bound.length) commit(r.model);
}

export async function doFillWalls() {
  const r = fillWalls(Ed.model, Ed.levelId, opts());
  const lines = describeReconcile(r.report);
  if (r.report.preview.length && !(await askConfirm(['This changes the plan:', ...lines, 'Apply?'].join('\n\n'), { ok: 'Apply' }))) return;
  $('wallsOut').innerHTML = lines.length ? lines.map(esc).join('<br>') : 'Every room edge already has a wall.';
  if (r.report.added.length || r.report.moved.length || r.report.merged.length) commit(r.model);
}
