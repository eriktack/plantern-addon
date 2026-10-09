// The Storage page (storage.html): where houses are kept, and the *Add storage* wizard (decision 106:
// setup is clicks only). Talks to the local server's storage API (tools/store/manage.js); this file only
// wires the DOM.

import { remember } from '../model/current.js';
import { initHa } from './ha.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { body: j, status: r.status });
  return j;
};

let state = { stores: [], showDemo: true, platform: '', git: null };
let w = null;          // the wizard: { step, type, … } or null
let branchBox = null;  // the branch picker open on a git storage: { id, data?, busy?, error? }

const say = (text, kind = '') => { $('msg').innerHTML = text ? `<div class="msg ${kind}">${text}</div>` : ''; };
const TYPE = { folder: 'Folder', git: 'Git', builtin: 'Built-in' };
const statusBadge = s => {
  const st = s.status?.state || 'ok';
  const label = { ok: 'connected', offline: 'not reachable', error: 'problem', auth: 'sign-in failed', conflict: 'changes to merge', pending: 'not pushed yet', pushed: 'up to date' }[st] || st;
  return `<span class="badge ${st === 'ok' || st === 'pushed' ? 'ok' : st === 'pending' || st === 'conflict' ? 'warn' : 'bad'}" title="${esc(s.status?.error || '')}">${esc(label)}</span>`;
};

async function load() {
  try { state = await api('api/stores'); }
  catch (e) {
    say(e.status === 404 || e.status === undefined
      ? 'This page needs Plantern\'s own server: start Plantern with <b>run.cmd</b> (or the Home Assistant add-on) and open it from there.'
      : esc(e.message), 'err');
    $('addBtn').disabled = $('newHouseBtn').disabled = true;
    return;
  }
  render();
}

function render() {
  const own = state.stores.filter(s => !s.builtin), builtin = state.stores.filter(s => s.builtin);
  const writable = state.stores.filter(s => !s.readOnly && !s.builtin);       // copies go to the person's own storages
  let out = own.length ? '' : `<div class="card"><div class="title">No storage connected yet</div><div class="help" style="margin-top:4px">Your houses are in the app folder for now. Add a storage (a folder, a network share or a git repository) to keep them on their own; you can copy a house over afterwards.</div></div>`;
  for (const s of [...own, ...builtin]) {
    const where = s.builtin ? 'The app\'s own locations/ folder (examples and anything not moved yet)' : s.type === 'git' ? `${s.url || '(local repository)'}${s.branch ? ` · ${s.branch}` : ''}\n${s.dir || ''}` : s.path;
    const copyTo = writable.filter(t => t.id !== s.id);
    out += `<div class="card" data-store="${esc(s.id)}"><div class="top"><div><span class="title">${esc(s.name)}</span><span class="badge">${TYPE[s.builtin ? 'builtin' : s.type] || s.type}</span>${s.builtin ? '' : statusBadge(s)}
      <div class="where">${esc(where).replace(/\n/g, '<br>')}</div>${s.status?.error ? `<div class="help" style="color:var(--${s.status.state === 'conflict' ? 'warn' : 'bad'})">${esc(s.status.error)}</div>` : ''}
      ${s.status?.state === 'conflict' ? `<div class="btns" style="margin-top:6px"><button data-act="use-local">Keep the version on this computer</button><button data-act="use-remote">Take the repository's version</button></div>` : ''}
      ${branchBox?.id === s.id ? branchPicker(s) : ''}
      ${s.status?.state === 'auth' ? `<div class="btns" style="margin-top:6px"><button data-act="signin">Sign in again (token)</button></div>` : ''}</div>
      <div class="btns">${s.builtin ? '' : `<button data-act="refresh">${s.type === 'git' ? 'Sync now' : 'Look again'}</button>${s.type === 'git' ? `<button data-act="branch" title="Switch to another branch, or start a new one">Branch: ${esc(s.branch || '?')}</button>` : ''}<button data-act="rename">Rename</button><button data-act="remove" class="quiet">Disconnect</button>`}</div></div>
      ${s.builtin ? `<label class="switch" style="margin-top:8px"><input type="checkbox" id="showDemo"${state.showDemo ? ' checked' : ''}> Show the demo house</label>` : ''}
      <ul class="houses">${s.houses.length || s.builtin ? s.houses.map(h => `<li><span class="nm">${esc(h.name)} <small>${esc(h.id)}</small></span><span class="acts">
        <a href="index.html?loc=${encodeURIComponent(h.id)}" data-loc="${esc(h.id)}">Plan</a><a href="room-editor.html?loc=${encodeURIComponent(h.id)}" data-loc="${esc(h.id)}">Editor</a><a href="wizard.html?loc=${encodeURIComponent(h.id)}" data-loc="${esc(h.id)}">Rooms</a>
        ${copyTo.length ? `<select data-copy="${esc(h.id)}" aria-label="Copy to another storage"><option value="">Copy to…</option>${copyTo.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select>` : ''}</span></li>`).join('') : `<li><span class="help">No houses here yet.</span><span class="acts">${s.readOnly ? '' : `<button data-act="newhouse">+ New house here</button>`}</span></li>`}</ul></div>`;
  }
  $('list').innerHTML = out;
  $('list').querySelectorAll('[data-loc]').forEach(a => (a.onclick = () => remember(a.dataset.loc)));
  $('showDemo')?.addEventListener('change', async e => { await api('api/settings', { showDemo: e.target.checked }); say(e.target.checked ? 'The demo house is shown again.' : 'The demo house is hidden. (It is still in the app folder; turn this on to see it again.)', 'ok'); load(); });
  $('list').querySelectorAll('[data-copy]').forEach(sel => (sel.onchange = () => copyHouse(sel.dataset.copy, sel.value)));
  $('list').querySelectorAll('[data-act]').forEach(b => (b.onclick = () => storeAction(b.closest('[data-store]').dataset.store, b.dataset.act)));
}

/** The branch picker inside a git storage's card. */
function branchPicker(s) {
  const b = branchBox;
  if (!b.data) return `<div class="msg" style="margin-top:8px">${b.error ? esc(b.error) : 'Looking at the branches…'}</div>`;
  const d = b.data, opt = (n, note = '') => `<option value="${esc(n)}"${n === d.current ? ' selected' : ''}>${esc(n)}${n === d.current ? ' (this one)' : ''}${note}</option>`;
  return `<div class="msg" style="margin-top:8px"><div class="title" style="margin-bottom:6px">Branch</div>
    <div class="help">The houses in this storage are the ones on the branch you pick; saving commits to it. Switching changes the files in the folder.${d.dirty ? ' <b>There are uncommitted changes in the folder.</b>' : ''}</div>
    <div class="btns" style="margin-top:6px"><select id="branchSel" aria-label="Branch">${d.local.map(n => opt(n)).join('')}${d.remote.map(n => opt(n, ' (on the repository)')).join('')}</select>
    <button class="go" data-act="branch-switch">Switch</button></div>
    <div class="btns" style="margin-top:6px"><input class="t" id="branchNew" placeholder="a new branch, from ${esc(d.current)}" style="font-family:inherit"><button data-act="branch-new">Start branch</button><button class="quiet" data-act="branch-close">Close</button></div>
    ${b.error ? `<div class="msg err" style="margin-top:6px">${esc(b.error)}</div>` : ''}${b.busy ? '<div class="help">Working…</div>' : ''}</div>`;
}

async function storeAction(id, act) {
  const s = state.stores.find(x => x.id === id);
  try {
    if (act === 'branch') {
      if (branchBox?.id === id) { branchBox = null; render(); return; }
      branchBox = { id }; render();
      try { branchBox.data = await api(`api/stores/${encodeURIComponent(id)}/branches`); } catch (e) { branchBox.error = e.message; }
      render(); return;
    }
    if (act === 'branch-close') { branchBox = null; render(); return; }
    if (act === 'branch-switch' || act === 'branch-new') {
      const name = act === 'branch-new' ? $('branchNew').value.trim() : $('branchSel').value;
      if (!name) { branchBox.error = 'Type a name for the new branch.'; render(); return; }
      if (act === 'branch-switch' && name === branchBox.data.current) { branchBox = null; render(); return; }
      branchBox.busy = true; branchBox.error = ''; render();
      try {
        await api(`api/stores/${encodeURIComponent(id)}/branch`, { name, create: act === 'branch-new' });
        branchBox = null;
        say(`${esc(s.name)}: now on branch <b>${esc(name)}</b>${act === 'branch-new' ? ' (started from the one before)' : ''}. The houses are the ones on it.`, 'ok');
      } catch (e) { branchBox.busy = false; branchBox.error = e.message; render(); return; }
      load(); return;
    }
    if (act === 'refresh') { say('Looking…'); await api(`api/stores/${encodeURIComponent(id)}/refresh`, {}); say(`${esc(s.name)}: up to date.`, 'ok'); }
    if (act === 'rename') { const n = prompt('Name of this storage', s.name); if (!n?.trim()) return; await api(`api/stores/${encodeURIComponent(id)}`, { name: n.trim() }, 'PUT'); }
    if (act === 'remove') { if (!confirm(`Disconnect ${s.name}? Plantern forgets it; nothing is deleted from ${s.type === 'git' ? 'the repository or its folder' : 'the folder'}.`)) return; await api(`api/stores/${encodeURIComponent(id)}`, null, 'DELETE'); say(`${esc(s.name)} is disconnected. Its files are untouched.`, 'ok'); }
    if (act === 'newhouse') { openWizard({ step: 'newhouse', store: id }); return; }
    if (act === 'use-local' || act === 'use-remote') {
      if (act === 'use-remote' && !confirm('Take the repository\'s version? Changes on this computer that were not pushed are dropped.')) return;
      if (act === 'use-local' && !confirm('Keep the version on this computer? It is pushed, and the repository\'s other version stays only in its history.')) return;
      await api(`api/stores/${encodeURIComponent(id)}/resolve`, { use: act === 'use-local' ? 'local' : 'remote' });
      say(`${esc(s.name)}: ${act === 'use-local' ? 'kept the version on this computer' : 'took the repository\'s version'}.`, 'ok');
    }
    if (act === 'signin') {
      const t = prompt('Paste a token with read and write access to this repository');
      if (!t?.trim()) return;
      await api(`api/stores/${encodeURIComponent(id)}`, { secrets: { token: t.trim() } }, 'PUT');
      await api(`api/stores/${encodeURIComponent(id)}/refresh`, {});
    }
  } catch (e) { say(esc(e.message), 'err'); }
  load();
}

async function copyHouse(houseId, storeId) {
  if (!storeId) return;
  const to = state.stores.find(s => s.id === storeId);
  try {
    const r = await api(`api/houses/${encodeURIComponent(houseId)}/copy`, { store: storeId });
    say(`Copied to ${esc(to.name)}.${r.note ? ' ' + esc(r.note) : ' From now on the pages open that copy.'}`, 'ok');
  } catch (e) { say(esc(e.message), 'err'); }
  load();
}

// ---- the wizard ----

function openWizard(start) { w = { ...start }; renderWizard(); $('wizard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function closeWizard() { w = null; $('wizard').hidden = true; }

function renderWizard() {
  const el = $('wizard');
  el.hidden = !w;
  if (!w) return;
  if (w.step === 'type') {
    el.innerHTML = `<div class="title" style="margin-bottom:10px">Add storage</div><div class="choice">
      <button data-t="folder">📁 <b>A folder</b><small>On this computer, a USB disk or a network share (\\\\server\\share). Existing houses in it are found.</small></button>
      <button data-t="git">⎇ <b>A git repository</b><small>A repo you already have on this computer, or one on GitHub / GitLab to clone. Saves become commits; changes from others are pulled.</small></button></div>
      <div class="btns" style="margin-top:10px"><button class="quiet" data-cancel>Cancel</button></div>`;
    el.querySelectorAll('[data-t]').forEach(b => (b.onclick = () => { w = { step: b.dataset.t === 'git' ? 'git' : 'folder', type: b.dataset.t }; renderWizard(); }));
  } else if (w.step === 'folder') {
    el.innerHTML = `<div class="title">Pick the folder</div><div class="help">Browse to it, or type or paste a path${state.platform === 'win32' ? ', also a network path like \\\\nas\\plantern' : '. A network share added in Home Assistant (Settings → Storage → Network storage) is under /share'}.</div>
      <div id="browser"></div><div id="wErr"></div>
      <div class="btns" style="margin-top:10px"><button class="go big" id="usePath">Use this folder</button><button class="quiet" data-back>Back</button></div>`;
    browser($('browser'), { start: w.path, onChange: p => { w.path = p; } });
    $('usePath').onclick = () => checkFolder();
  } else if (w.step === 'confirm') {
    const c = w.check;
    const found = c.houses.length ? `<div class="msg ok">Found ${c.houses.length} house${c.houses.length > 1 ? 's' : ''}: ${c.houses.map(h => `<b>${esc(h.name)}</b>`).join(', ')}</div>`
      : c.empty ? `<div class="msg">The folder is empty. After connecting it you can start a new house in it, or copy one here.</div>`
      : `<div class="msg">No houses in this folder yet${c.others ? `; it holds ${c.others} other thing${c.others > 1 ? 's' : ''}, which Plantern leaves alone` : ''}.</div>`;
    el.innerHTML = `<div class="title">Connect this folder</div><div class="where">${esc(c.path)}</div>${found}
      ${c.git ? '<div class="msg">This folder is a git repository: connect it as <b>git</b> to get commits and pulls (Back → Back → A git repository).</div>' : ''}
      <label class="f">Name of the storage<input class="t" id="wName" value="${esc(w.name ?? c.path.split(/[\\/]/).filter(Boolean).pop() ?? '')}" style="font-family:inherit"></label>
      <div id="wErr"></div>
      <div class="btns" style="margin-top:10px"><button class="go big" id="connect">Connect</button><button class="quiet" data-back>Back</button></div>`;
    $('connect').onclick = connectFolder;
  } else if (w.step === 'password') {
    el.innerHTML = `<div class="title">Sign in to the share</div><div class="where">${esc(w.path)}</div>
      <div class="help">Windows would not open this share with your own sign-in. Give a user name and password that may use it; Plantern keeps them on this computer and signs in for you.</div>
      <label class="f">User name <small>e.g. NAS\\erik</small><input class="t" id="wUser" autocomplete="username" value="${esc(w.user || '')}"></label>
      <label class="f">Password<input class="t" id="wPass" type="password" autocomplete="current-password"></label>
      <div id="wErr"></div>
      <div class="btns" style="margin-top:10px"><button class="go big" id="signin">Sign in and check</button><button class="quiet" data-back>Back</button></div>`;
    $('signin').onclick = () => { w.user = $('wUser').value.trim(); w.password = $('wPass').value; checkFolder(); };
  } else if (w.step === 'newhouse') {
    // new houses go into the person's own storages, never into the app folder
    const stores = state.stores.filter(s => !s.readOnly && !s.builtin);
    if (!stores.length) {
      el.innerHTML = `<div class="title">New house</div><div class="msg">First add a storage, so the house has a place of its own (a folder, a network share or a git repository).</div><div class="btns" style="margin-top:10px"><button class="go big" id="toAdd">+ Add storage</button><button class="quiet" data-cancel>Cancel</button></div>`;
      $('toAdd').onclick = () => openWizard({ step: 'type' });
      el.querySelector('[data-cancel]').onclick = closeWizard;
      return;
    }
    el.innerHTML = `<div class="title">New house</div>
      <label class="f">Name<input class="t" id="hName" placeholder="e.g. Sommarstugan" style="font-family:inherit"></label>
      <label class="f">Kept in<select id="hStore" style="width:100%">${stores.map(s => `<option value="${esc(s.id)}"${s.id === w.store ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <div id="wErr"></div>
      <div class="btns" style="margin-top:10px"><button class="go big" id="create">Create</button><button class="quiet" data-cancel>Cancel</button></div>`;
    $('hName').focus();
    $('create').onclick = createHouse;
  } else if (w.step === 'git') {
    import('./git-wizard.js').then(m => m.renderGitStep(el, w, { api, browser, esc, done: connected, back: () => { w = { step: 'type' }; renderWizard(); } })).catch(() => {
      el.innerHTML = '<div class="msg">Git storage comes in a later step of this build.</div><div class="btns"><button class="quiet" data-cancel>Back</button></div>';
      el.querySelector('[data-cancel]').onclick = () => { w = { step: 'type' }; renderWizard(); };
    });
    return;
  }
  el.querySelectorAll('[data-cancel]').forEach(b => (b.onclick = closeWizard));
  el.querySelectorAll('[data-back]').forEach(b => (b.onclick = () => { w = { ...w, step: w.step === 'confirm' || w.step === 'password' ? 'folder' : 'type' }; renderWizard(); }));
}

const wErr = text => { const e = $('wErr'); if (e) e.innerHTML = text ? `<div class="msg err">${text}</div>` : ''; };

async function checkFolder() {
  if (!w.path) { wErr('Pick a folder first.'); return; }
  wErr('');
  try {
    const c = await api('api/stores/check', { type: 'folder', path: w.path, ...(w.user ? { user: w.user, password: w.password } : {}) });
    if (!c.ok) {
      if (c.needs === 'password') { w = { ...w, step: 'password' }; renderWizard(); if (w.user) wErr(esc(c.error)); return; }
      wErr(`${esc(c.error)}${state.platform !== 'win32' && /^\\\\/.test(w.path) ? '. On Home Assistant, add the share under Settings → Storage → Network storage first, then pick it under /share.' : ''}`);
      return;
    }
    w = { ...w, step: 'confirm', check: c };
    renderWizard();
  } catch (e) { wErr(esc(e.message)); }
}

async function connectFolder() {
  try {
    const r = await api('api/stores', { type: 'folder', path: w.check.path, name: $('wName').value.trim() || undefined, ...(w.user ? { secrets: { user: w.user, password: w.password } } : {}) });
    connected(r.store, w.check.houses.length ? '' : 'empty');
  } catch (e) { wErr(esc(e.message)); }
}

/** After a storage was connected: say so, show it, and offer a new house when it holds none. */
function connected(store, empty) {
  say(`Connected <b>${esc(store.name)}</b>${store.houses.length ? `: ${store.houses.map(h => esc(h.name)).join(', ')}` : ''}.`, 'ok');
  if (empty) openWizard({ step: 'newhouse', store: store.id }); else closeWizard();
  load();
}

async function createHouse() {
  const name = $('hName').value.trim();
  if (!name) { wErr('Give the house a name.'); $('hName').focus(); return; }
  try {
    const r = await api('api/houses', { store: $('hStore').value, name });
    remember(r.house.id);
    say(`<b>${esc(name)}</b> is created. <a href="room-editor.html?loc=${encodeURIComponent(r.house.id)}">Open it in the Editor</a> to add its first level, or <a href="wizard.html?loc=${encodeURIComponent(r.house.id)}">measure a room</a> on the phone.`, 'ok');
    closeWizard();
    load();
  } catch (e) { wErr(esc(e.message)); }
}

/**
 * A folder browser in `el`: a path field (type or paste, Enter goes there), Up, New folder, the places
 * to start from (home, drives, HA's folders) and the folders here, houses and git repos marked.
 * onChange(path) is called whenever the shown folder changes.
 */
export function browser(el, { start = '', onChange = () => {} } = {}) {
  let cur = start || '';
  const show = async p => {
    cur = p || ''; onChange(cur);
    const r = await api(`api/fs/list${cur ? `?path=${encodeURIComponent(cur)}` : ''}`).catch(e => ({ error: e.message, folders: [] }));
    if (r.path) { cur = r.path; onChange(cur); }
    const places = r.places || (await api('api/fs/list')).places || [];
    el.innerHTML = `<div class="browser"><div class="bar"><button data-up title="Up one folder"${r.parent ? '' : ' disabled'}>↑</button><input class="t" data-path value="${esc(cur)}" placeholder="a path, e.g. ${state.platform === 'win32' ? 'D:\\Plantern or \\\\nas\\plantern' : '/share/plantern'}" spellcheck="false"><button data-go>Go</button></div>
      <div class="places">${places.map(p => `<button data-place="${esc(p.path)}">${esc(p.name)}</button>`).join('')}${cur ? '<button data-mk>+ New folder</button>' : ''}</div>
      <div class="list">${r.error ? `<div class="empty" style="color:var(--bad)">${esc(r.error)}</div>` : !cur ? '<div class="empty">Start from one of the places above, or type a path.</div>' : r.folders.length ? r.folders.map(f => `<button class="row" data-dir="${esc(f.path)}">📁 ${esc(f.name)}${f.house ? '<span class="tag">🏠 a house</span>' : f.git ? '<span class="tag">⎇ git</span>' : ''}</button>`).join('') : '<div class="empty">No folders in here.</div>'}</div></div>
      ${r.house ? '<div class="help" style="margin-top:4px">🏠 This folder is a house itself.</div>' : ''}`;
    el.querySelector('[data-up]').onclick = () => show(r.parent);
    el.querySelector('[data-go]').onclick = () => show(el.querySelector('[data-path]').value.trim());
    el.querySelector('[data-path]').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); show(e.target.value.trim()); } };
    el.querySelector('[data-path]').oninput = e => onChange(e.target.value.trim());
    el.querySelectorAll('[data-place]').forEach(b => (b.onclick = () => show(b.dataset.place)));
    el.querySelectorAll('[data-dir]').forEach(b => (b.onclick = () => show(b.dataset.dir)));
    el.querySelector('[data-mk]')?.addEventListener('click', async () => {
      const name = prompt('Name of the new folder');
      if (!name?.trim()) return;
      try { const m = await api('api/fs/mkdir', { path: cur, name: name.trim() }); show(m.path); } catch (e) { alert(e.message); }
    });
  };
  show(cur);
}

$('addBtn').onclick = () => openWizard({ step: 'type' });
initHa();
$('newHouseBtn').onclick = () => openWizard({ step: 'newhouse' });
load();
// another tab (or another device) may connect a storage or add a house meanwhile
try { const es = new EventSource('api/events'); for (const ev of ['houses', 'sync']) es.addEventListener(ev, () => { if (!w) load(); }); } catch { /* no live updates */ }
