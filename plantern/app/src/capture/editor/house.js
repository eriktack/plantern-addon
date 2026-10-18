// Editor page: house. Split from ui.js (ui-consistency plan, UX34): no behaviour change, only where the code lives.

import { readPlaceForm, placeFields, placeSummary, northAngleFromWall } from '../place.js';
import { compassSvg } from '../../render2d/compass.js';
import { northAngleOf } from '../../model/orientation.js';
import { wallHint } from '../option-hints.js';
import { setSite } from '../../edit/ops.js';
import { DEFAULT_SETTINGS } from '../../model/settings.js';
import { setHouseSettings } from '../../edit/house-settings.js';
import { showLevelEditForm, showLevelForm } from '../level-form.js';
import { remember, linkPages } from '../../model/current.js';
import { $, commit, isModelDirty, level } from './core.js';
import { editDraft, mayLeave, setStatus } from './session.js';
import { refresh } from './refresh.js';
import { fillLevels } from './levels.js';
import { loadFormForSelection } from './selection.js';
import { Ed } from './state.js';


// ---- Place the house (PLANTERN.md §14.4-§14.5, logic in place.js) ----
const placeFieldsNow = () => ({ position: $('placePos').value, north: $('north').value, height: $('placeHeight').value });

/** Show what the form says, in words, and turn the dial; nothing is stored until Apply. */
export function previewPlace() {
  const r = readPlaceForm(placeFieldsNow(), Ed.model.site);
  $('placeSays').textContent = [...(r.says ? [r.says] : []), ...r.notes.map(n => `⚠ ${n}`), ...r.errors.map(e => `✗ ${e}`)].join('\n');
  $('placeSays').style.whiteSpace = 'pre-wrap';
  $('placeSays').style.color = r.errors.length ? 'var(--bad)' : '';
  const t = $('north').value.trim().replace(',', '.'), v = t === '' ? 0 : Number(t);
  $('placeDial').innerHTML = compassSvg(Number.isFinite(v) ? v : northAngleOf(Ed.model));
  $('placeMsg').textContent = '';
}

/** Fill the section from the model (also after undo and redo, and for Revert). */
export function fillPlace() {
  const f = placeFields(Ed.model.site);
  $('placePos').value = f.position; $('north').value = f.north; $('placeHeight').value = f.height;
  $('placeSum').textContent = placeSummary(Ed.model.site);
  $('placeBadge').textContent = Ed.model.site?.georef?.origin ? '· placed' : '· not placed';
  previewPlace();
}

export function fillPlaceWalls() {
  const sel = $('placeWall'), keep = sel.value, walls = level()?.walls || [];
  sel.replaceChildren(...walls.map(w => new Option(`${w.name || w.id}: (${Math.round(w.a[0])}, ${Math.round(w.a[1])}) → (${Math.round(w.b[0])}, ${Math.round(w.b[1])})`, w.id)));
  [...sel.options].forEach((o, i) => { o.dataset.hint = wallHint(walls[i]); });
  if (keep && walls.some(w => w.id === keep)) sel.value = keep;
}

/** A wall and the compass bearing of its direction give the north angle. */
export function useWallBearing() {
  fillPlaceWalls();
  const w = (level()?.walls || []).find(x => x.id === $('placeWall').value), b = Number($('placeBearing').value.trim().replace(',', '.'));
  if (!w) { $('placeMsg').textContent = 'Pick a wall first.'; return; }
  if (!Number.isFinite(b) || $('placeBearing').value.trim() === '') { $('placeMsg').textContent = 'Type the compass bearing in degrees (0 = north, 90 = east).'; return; }
  $('north').value = String(northAngleFromWall(w, b));
  previewPlace();
  $('placeMsg').textContent = 'Worked out; press Apply to keep it.';
}

export function applyPlace() {
  const r = readPlaceForm(placeFieldsNow(), Ed.model.site);
  if (!r.ok) { previewPlace(); $('placeMsg').textContent = `Not applied: ${r.errors.join(' ')}`; return; }
  const s = setSite(Ed.model, r.props);
  if (s.report.errors.length) { $('placeMsg').textContent = `Not applied: ${s.report.errors.join(' ')}`; return; }
  if (!s.report.changed.length) { $('placeMsg').textContent = 'Nothing changed.'; return; }
  commit(s.model);
  fillPlace();
  const warn = (s.report.issues || []).filter(i => i.id === 'site');
  $('placeMsg').textContent = warn.length ? `Applied, but: ${warn.map(i => i.msg).join(' ')}` : 'Applied.';
  setStatus('house place changed');
}
// ---- the House view (✎ House): where the house is (Place the house) and its settings (location.json) ----
export const HS_FIELDS = [   // [input id, the dotted key in settings]
  ['hs_cutPlane', 'cutPlane'], ['hs_stairHeadroom', 'stairHeadroom'], ['hs_wallOuter', 'wallThickness.outer'], ['hs_wallInner', 'wallThickness.inner'],
  ['hs_tolOk', 'checkTolerance.ok'], ['hs_tolWarn', 'checkTolerance.warn'], ['hs_lampIntensity', 'render3d.lampIntensity'], ['hs_nightLight', 'render3d.nightLight'],
  ['hs_shadowsDesktop', 'render3d.shadows.desktop'], ['hs_shadowsMobile', 'render3d.shadows.mobile'],
];
const atPath = (obj, path) => path.split('.').reduce((a, k) => a?.[k], obj);

/** Show the house's own settings in the form; a blank box is the default, shown as the placeholder. */
export function fillHouse() {
  for (const [id, key] of HS_FIELDS) {
    const v = atPath(Ed.loc?.settings, key);
    $(id).value = v ?? '';
    $(id).placeholder = String(atPath(DEFAULT_SETTINGS, key) ?? '');
  }
  $('hsMsg').textContent = '';
}

/** Apply the boxes that changed to location.json (one undo step, saved with Save like the rest). */
export function applyHouse() {
  const changes = {};
  for (const [id, key] of HS_FIELDS) {
    const typed = $(id).value.trim(), stored = atPath(Ed.loc?.settings, key);
    if (typed === String(stored ?? '')) continue;          // unchanged: not written
    changes[key] = typed === '' ? null : typed;
  }
  if (!Object.keys(changes).length) { $('hsMsg').textContent = 'Nothing changed.'; return; }
  const r = setHouseSettings(Ed.loc, changes);
  if (r.errors.length) { $('hsMsg').textContent = `Not applied: ${r.errors.join('; ')}`; return; }
  Ed.loc = r.loc;
  commit({ ...Ed.model });                                    // the same model with the new settings: one undo step
  fillHouse();
  refresh();
  $('hsMsg').textContent = 'Applied.';
  setStatus(`house settings changed (${r.changed.length}, not saved yet)`);
}

export async function showHouseView() {
  if (!(await mayLeave())) return;
  $('levelBox').hidden = true;
  $('houseBox').hidden = false;
  syncSideView();
  fillHouse();
  fillPlace();
  setStatus('the house: where it is, which way is north, its ground height and its settings');
}
export function hideHouseView() { $('houseBox').hidden = true; syncSideView(); }
export function syncSideView() {
  if (Ed.editing) { $('houseBox').hidden = true; $('levelBox').hidden = true; }
  const form = !Ed.editing && (!$('houseBox').hidden || !$('levelBox').hidden);
  $('top').hidden = $('browse').hidden = !!Ed.editing || form;
  $('edit').hidden = $('edBar').hidden = !Ed.editing;
  if (form && !Ed.sideFormShown) $('cap').scrollTop = 0;     // a form starts at its top, not where the list was scrolled to
  Ed.sideFormShown = form;
}

/** ✎ beside the level menu: edit the level itself (name, heights, measurements), or delete it while it is empty. */
export async function editLevel() {
  if (!(await mayLeave())) return;
  hideHouseView();
  const cls = { label: '', input: '', button: '', go: 'primary' };
  showLevelEditForm($('levelBox'), Ed.model, Ed.levelId, {
    cls,
    onClose: () => syncSideView(),
    onApply: r => {
      Ed.model = Ed.history.push(r.model); Ed.dirty = isModelDirty();
      fillLevels(); refresh();
      editLevel();                                         // the form again, from what is stored
      const nm = id => Ed.model.levels.find(l => l.id === id)?.name || id;
      setStatus(`level ${nm(Ed.levelId)} changed${r.report.moved?.length ? `; moved: ${r.report.moved.map(m => `${nm(m.level)} to ${m.to} mm`).join(', ')}` : ''} (not saved yet)`);
    },
    onDelete: r => {
      Ed.model = Ed.history.push(r.model); Ed.dirty = isModelDirty();
      Ed.levelId = Ed.model.levels[0].id; Ed.roomId = null; Ed.wallId = null; Ed.draft = null;
      fillLevels(); loadFormForSelection(); refresh();
      remember(Ed.entry.id, Ed.levelId); linkPages(Ed.entry.id, Ed.levelId);
      setStatus('level deleted (not saved yet)');
    },
  });
  syncSideView();                                          // the form is open now: it takes the browse list's place
}
export function newLevel() {
  hideHouseView();
  showLevelForm($('levelBox'), Ed.model, {
    onCancel: () => syncSideView(),
    onCreate: r => {
      Ed.levelId = r.level.id; Ed.roomId = null; Ed.wallId = null; Ed.draft = null;
      Ed.model = Ed.history.push(r.model); Ed.dirty = isModelDirty();
      fillLevels(); loadFormForSelection(); refresh();
      editDraft({ name: '', exterior: false });
      remember(Ed.entry.id, Ed.levelId); linkPages(Ed.entry.id, Ed.levelId);
      setStatus(`level ${r.level.id} created (not saved yet)`);
    },
  });
  syncSideView();
}
