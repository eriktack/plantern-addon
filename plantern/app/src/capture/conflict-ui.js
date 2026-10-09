// The dialog for a real conflict (decision 105): the house was changed elsewhere, also in the same
// place as here. Conflicts are grouped by the thing they are about (a room, a wall, a lamp …), and
// each thing gets one pick: mine or theirs. Everything that did not conflict is already combined.

import { describeConflict, applyChoices } from '../model/merge.js';
import { displayName } from '../model/names.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND = { levels: 'level', rooms: 'room', walls: 'wall', openings: 'opening', solids: 'solid', objects: 'object', fixtures: 'lamp or switch', stairs: 'stairs', anchors: 'anchor', checks: 'check' };

function findEntity(model, collection, id) {
  if (!model) return null;
  if (collection === 'levels') return model.levels?.find(l => l.id === id);
  if (Array.isArray(model[collection])) return model[collection].find(e => e?.id === id);
  for (const lv of model.levels || []) { const e = lv[collection]?.find?.(x => x?.id === id); if (e) return e; }
  return null;
}

/**
 * Ask which side wins where both changed the same thing. details = the save's conflict
 * { theirs (text), merged, conflicts }. Resolves to { action: 'save', value } (the merged house with
 * the picks applied), { action: 'theirs' } (drop my changes, load what is stored) or { action: 'cancel' }.
 */
export function askConflict(details, { what = 'this house' } = {}) {
  const theirs = JSON.parse(details.theirs), merged = details.merged;
  const groups = new Map();
  details.conflicts.forEach((c, i) => {
    const d = describeConflict(c), key = d.entity ? `${d.entity.collection}:${d.entity.id}` : (c.path[0] ?? 'the file');
    if (!groups.has(key)) {
      const e = d.entity && (findEntity(merged, d.entity.collection, d.entity.id) || findEntity(theirs, d.entity.collection, d.entity.id));
      groups.set(key, { label: d.entity ? `${KIND[d.entity.collection] || d.entity.collection} ${displayName(e, d.entity.id)}` : String(key), fields: [], idx: [], deleted: null });
    }
    const g = groups.get(key);
    g.idx.push(i);
    if (d.field) g.fields.push(d.field);
    if (d.deleted && !d.field) g.deleted = d.deleted;
  });
  if (!document.getElementById('conflictCss')) {
    const st = document.createElement('style');
    st.id = 'conflictCss';
    st.textContent = `.cf-back{position:fixed;inset:0;background:#000a;z-index:50;display:grid;place-items:center;padding:16px}
      .cf{background:var(--panel);border:1px solid var(--line);border-radius:12px;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:16px}
      .cf h3{margin:0 0 6px;font-size:17px}.cf .row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line);flex-wrap:wrap}
      .cf .row .what small{display:block;color:var(--mut)}.cf .pick{display:flex;gap:4px}.cf .pick button.on{background:var(--acc);color:#14161a;border-color:var(--acc)}
      .cf .bar{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.cf .bar .go{background:var(--acc);color:#14161a;border-color:var(--acc);font-weight:600}`;
    document.head.appendChild(st);
  }
  const picks = new Map([...groups.keys()].map(k => [k, 'mine']));
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'cf-back';
    const draw = () => {
      back.innerHTML = `<div class="cf" role="dialog" aria-modal="true"><h3>Changed elsewhere too</h3>
        <div class="help">Someone changed ${esc(what)} while you were working on it (another page, another device, or the file itself). Everything else is combined; for these, pick whose version to keep:</div>
        ${[...groups].map(([k, g]) => `<div class="row"><div class="what"><b>${esc(g.label)}</b><small>${g.deleted === 'mine' ? 'you deleted it; it was changed there' : g.deleted === 'theirs' ? 'it was deleted there; you changed it' : esc([...new Set(g.fields)].join(', ') || 'changed on both sides')}</small></div>
          <div class="pick"><button data-k="${esc(k)}" data-p="mine" class="${picks.get(k) === 'mine' ? 'on' : ''}">Mine</button><button data-k="${esc(k)}" data-p="theirs" class="${picks.get(k) === 'theirs' ? 'on' : ''}">Theirs</button></div></div>`).join('')}
        <div class="bar"><button class="go" data-a="save">Save with these</button><button data-a="all-mine">All mine</button><button data-a="all-theirs">All theirs</button><button data-a="theirs">Drop my changes, load theirs</button><button data-a="cancel">Not now</button></div></div>`;
      back.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => { picks.set(b.dataset.k, b.dataset.p); draw(); }));
      back.querySelectorAll('[data-a]').forEach(b => (b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'all-mine' || a === 'all-theirs') { for (const k of picks.keys()) picks.set(k, a === 'all-mine' ? 'mine' : 'theirs'); draw(); return; }
        back.remove();
        if (a === 'save') {
          const choices = {};
          for (const [k, g] of groups) if (picks.get(k) === 'theirs') for (const i of g.idx) choices[i] = 'theirs';
          resolve({ action: 'save', value: applyChoices(merged, details.conflicts, choices) });
        } else resolve({ action: a });
      }));
    };
    draw();
    document.body.appendChild(back);
  });
}
