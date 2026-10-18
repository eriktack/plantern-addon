// Editor page: core. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { addSlider, addDial } from '../../number-input.js';
import { createPerf } from '../perf.js';
import { readPrefs } from '../../model/prefs.js';
import { resolveSettings } from '../../model/settings.js';
import { buildModelGeometry } from '../../geometry/level.js';
import { refresh } from './refresh.js';
import { afterCommit } from './session.js';
import { Ed } from './state.js';

// sliders for bounded looks and settings, dials for angles (UX19, decision 257 point 2); measured lengths never get one
export function addSlidersAndDials() {
  addSlider($('xLookBri'), { min: 1, max: 100, step: 1 });
  addSlider($('xLookK'), { min: 1800, max: 6500, step: 50, track: 'linear-gradient(90deg, #ff9a3c, #ffd2a1, #fff4e8, #d6e4ff, #a9c4ff)' });
  addSlider($('xRadius'), { min: 500, max: 8000, step: 100 });
  addSlider($('obLightRadius'), { min: 500, max: 8000, step: 100 });
  addSlider($('obLookBri'), { min: 1, max: 100, step: 1 });
  addSlider($('obLookK'), { min: 1800, max: 6500, step: 50, track: 'linear-gradient(90deg, #ff9a3c, #ffd2a1, #fff4e8, #d6e4ff, #a9c4ff)' });
  addSlider($('hs_lampIntensity'), { min: 0, max: 300, step: 5 });
  addSlider($('hs_nightLight'), { min: 0, max: 1, step: 0.05 });
  addSlider($('stRailD'), { min: 20, max: 100, step: 5 });
  for (const id of ['obRot', 'stHead', 'heading']) addDial($(id));
}

export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const params = new URLSearchParams(location.search);
// ?perf=1: one line per action in the console with where its time went (ui-consistency plan, UX1)
const perf = createPerf(params.has('perf'));
const PERF_RANK = { refresh: 0, commit: 1, select: 2, open: 3, drag: 4 };
/** Time `fn` under `name`; the line is logged once the current action (a commit, a click, a frame) has finished. */
export function P(name, fn) {
  if (!perf.enabled) return fn();
  if (!Ed.perfLabel) { Ed.perfLabel = Ed.nextLabel || 'refresh'; Ed.nextLabel = null; setTimeout(() => { perf.flush(Ed.perfLabel); Ed.perfLabel = null; }, 0); }
  return perf.time(name, fn);
}
/** What the next (or current) line is about; the most specific wins (a drag that commits is a drag). */
export const perfAs = label => {
  if (!perf.enabled) return;
  const cur = Ed.perfLabel ?? Ed.nextLabel;
  if (cur && PERF_RANK[cur] > PERF_RANK[label]) return;
  if (Ed.perfLabel) Ed.perfLabel = label; else Ed.nextLabel = label;
};
export const FIELDS = ['mode', 'lengths', 'turns', 'corners', 'diagonals', 'originRef', 'ox', 'oy', 'heading', 'closure', 'derived', 'exact', 'checks', 'locks'];
export const expanded = new Set();   // open nodes of the sidebar tree (by key)
export const locOf = new WeakMap();   // the location each model of the undo history goes with
export const isModelDirty = () => Ed.model !== Ed.savedModel || Ed.loc !== Ed.savedLoc;   // the model as last loaded or saved (dirty = anything else)
export const touches = new Map();
export const measureFrom = new Map();  // opening or wall-fixture id → the key of the corner its position is measured from (this session; measureCorners())           // two fingers on the plan: pinch to zoom

export const level = () => Ed.model.levels.find(l => l.id === Ed.levelId);
export const room = () => level()?.[Ed.shape === 'solid' ? 'solids' : 'rooms']?.find(r => r.id === Ed.roomId);   // the room or solid being measured
export const wall = () => level()?.walls?.find(w => w.id === Ed.wallId);
export const opening = () => level()?.openings?.find(o => o.id === Ed.openingId);
export const fixture = () => level()?.fixtures?.find(x => x.id === Ed.fixtureId);
export const stairs = () => level()?.stairs?.find(s => s.id === Ed.stairsId);
export const object = () => level()?.objects?.find(o => o.id === Ed.objectId);
export const opts = () => ({ settings: resolveSettings(Ed.loc, level()), ...(Ed.blueprints ? { blueprints: Ed.blueprints } : {}) });
// derived geometry of every level, kept per model object (a model is never changed once made: UX4)
const geosMemo = new WeakMap();
export const geosFor = m => { let g = geosMemo.get(m); if (!g) geosMemo.set(m, (g = buildModelGeometry(m))); return g; };
export const innerThickness = () => resolveSettings(Ed.loc, level()).wallThickness?.inner ?? 200;   // between rooms, until modelled

/** Every model change ends here: one undo step (same key = same step), then redraw. */
export function commit(next, key = null) {
  perfAs('commit');
  locOf.set(next, Ed.loc);
  Ed.model = Ed.history.push(next, key);
  Ed.dirty = isModelDirty();
  refresh();
  queueMicrotask(afterCommit);              // after the caller has finished (it may reopen a form)
}

// The design library's materials (object-designs/materials/library.json): the names a wall side may use besides the house's own.
export async function loadDesignLibrary() {
  try {
    const res = await fetch('object-designs/materials/library.json', { cache: 'no-store' });
    return res.ok ? await res.json() : {};
  } catch { return {}; }
}

export const NEW_LEVEL = '+new';
export const LEVEL_COLOR = { below: '#7aa2d6', above: '#d6a56b' };   // the level below and above, faintly under the plan
export const DOT_HIT = 0.95;                                            // a start dot reacts this far out (× the label size)
