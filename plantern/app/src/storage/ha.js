// The Settings page's Home Assistant section (roadmap 11, docs/archive/ha-11-12.md S5): connections kept by
// Plantern's server (tools/ha/api.js; the token stays there) and, per house, which connection it uses
// (location.json → integrations.ha.connection). This file only wires the DOM.

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status });
  return j;
};
const say = (text, kind = '') => { $('haMsg').innerHTML = text ? `<div class="msg ${kind}">${text}</div>` : ''; };
const STATUS = { connected: ['connected', 'ok'], connecting: ['connecting', 'warn'], disconnected: ['not reachable', 'bad'], auth_invalid: ['token refused', 'bad'], error: ['problem', 'bad'], idle: ['not used yet', ''] };

let conns = [], info = {};

export async function initHa() {
  $('haAdd').onclick = () => openForm(null);
  // which Plantern these settings belong to: the add-on in Home Assistant, or a computer (GET /api/info)
  try {
    info = await api('api/info');
    $('whose').textContent = info.addon ? 'These settings belong to Plantern in the Home Assistant add-on.' : `These settings belong to Plantern on this computer${info.host ? ` (${info.host})` : ''}.`;
  } catch { /* a plain static server: no info */ }
  await load();
  try { const es = new EventSource('api/events'); es.addEventListener('ha-status', () => load()); } catch { /* no live updates */ }
}

async function load() {
  try { conns = (await api('api/ha/connections')).connections; }
  catch { $('haAdd').disabled = true; return; }
  $('haList').innerHTML = conns.map(c => {
    const [label, cls] = STATUS[c.status] || [c.status, ''];
    if (c.shadowed) return `<div class="card" data-ha="${esc(c.name)}" data-shadowed="1"><div class="top"><div><span class="title">${esc(c.name)}</span><span class="badge warn">not used</span>
      <div class="where">${esc(c.url)} · the add-on's own connection has this name and is used instead of this stored one</div></div>
      <div class="btns"><button data-act="remove" class="quiet">Remove</button></div></div></div>`;
    return `<div class="card" data-ha="${esc(c.name)}"><div class="top"><div><span class="title">${esc(c.name)}</span><span class="badge ${cls}">${esc(label)}</span>${c.version ? `<span class="badge">HA ${esc(c.version)}</span>` : ''}
      <div class="where">${c.builtin ? 'this Home Assistant (built in; its name is set on the add-on\'s configuration page)' : esc(c.url) + (c.tokenSet ? '' : ' · no token yet')}</div></div>
      <div class="btns">${c.builtin ? '' : '<button data-act="test">Test</button><button data-act="edit">Change</button><button data-act="rename" class="quiet">Rename…</button><button data-act="remove" class="quiet">Remove</button>'}</div></div></div>`;
  }).join('') || '<div class="card"><div class="help">No connection yet. Add one with the address of your Home Assistant and a long-lived access token.</div></div>';
  $('haList').querySelectorAll('[data-act]').forEach(b => (b.onclick = () => act(b.closest('[data-ha]').dataset.ha, b.dataset.act)));
  await houses();
}

async function act(name, what) {
  if (what === 'edit') return openForm(conns.find(c => c.name === name && !c.shadowed));
  if (what === 'rename') return openRename(conns.find(c => c.name === name && !c.shadowed));
  if (what === 'remove') {
    if (!confirm(`Remove the connection "${name}"? Its token is deleted; houses that use it fall back to no lights.`)) return;
    await api(`api/ha/connections/${encodeURIComponent(name)}`, null, 'DELETE');
    say(`Removed ${esc(name)}.`, 'ok'); return load();
  }
  say('Testing…');
  const r = await api(`api/ha/connections/${encodeURIComponent(name)}/test`, {});
  say(r.ok ? `${esc(name)}: connected to Home Assistant ${esc(r.version)}, ${r.entities} entities.` : `${esc(name)}: ${esc(r.error)}`, r.ok ? 'ok' : 'err');
}

/** Houses on this server whose location.json names connection `name`: [{ id, name }] (the ones that can be changed). */
async function housesNaming(name) {
  let list = [];
  try { list = (await api('api/houses')).houses || []; } catch { return []; }
  const out = [];
  for (const h of list.filter(h => !h.readOnly)) {
    try { const d = await api(`api/houses/${encodeURIComponent(h.id)}`); if (JSON.parse(d.location.text).integrations?.ha?.connection === name) out.push(h); } catch { /* skip */ }
  }
  return out;
}

async function openRename(c) {
  const f = $('haForm'), used = await housesNaming(c.name);
  f.hidden = false;
  f.innerHTML = `<div class="title">Rename ${esc(c.name)}</div>
    <label class="f">New name <small>lowercase letters, digits and _</small><input id="haNew" value="${esc(c.name)}" autocomplete="off"></label>
    ${used.length ? `<label class="f inl"><input type="checkbox" id="haHousesToo" checked> Also change these houses: ${used.map(h => esc(h.name)).join(', ')}</label>` : '<div class="help">No house on this server uses it.</div>'}
    <div class="help">A house opened by another Plantern (your PC or the add-on) then needs that name there too; in the add-on its own connection is used when the name is missing.</div>
    <div class="btns" style="margin-top:8px"><button id="haDo" class="go">Rename</button><button id="haCancel" class="quiet">Cancel</button></div>`;
  $('haCancel').onclick = () => { f.hidden = true; };
  $('haDo').onclick = async () => {
    try {
      const to = $('haNew').value.trim();
      const r = await api(`api/ha/connections/${encodeURIComponent(c.name)}/rename`, { to, houses: !!$('haHousesToo')?.checked });
      f.hidden = true;
      say(`Renamed ${esc(c.name)} to ${esc(r.name)}.${r.houses.length ? ` Houses changed: ${r.houses.map(esc).join(', ')}.` : ''}${r.failed.length ? ` Could not change: ${r.failed.map(x => `${esc(x.id)} (${esc(x.error)})`).join(', ')}.` : ''}`, r.failed.length ? 'err' : 'ok');
      load();
    } catch (e) { say(esc(e.message), 'err'); }
  };
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openForm(c) {
  const f = $('haForm');
  f.hidden = false;
  f.innerHTML = `<div class="title">${c ? `Change ${esc(c.name)}` : 'New Home Assistant connection'}</div>
    <label class="f">Name <small>lowercase, e.g. ha_home; houses refer to it</small><input id="haName" value="${esc(c?.name || '')}"${c ? ' readonly' : ''} autocomplete="off"></label>
    <label class="f">Address <small>as you open Home Assistant from this computer</small><input id="haUrl" value="${esc(c?.url || '')}" placeholder="http://homeassistant.local:8123" autocomplete="off"></label>
    <label class="f">Long-lived access token <small>${c?.tokenSet ? 'leave empty to keep the one stored' : 'in Home Assistant: your profile → Security → Long-lived access tokens → Create token'}</small><input id="haToken" type="password" autocomplete="off"></label>
    <div class="btns" style="margin-top:8px"><button id="haTest">Test</button><button id="haSave" class="go">Save</button><button id="haCancel" class="quiet">Cancel</button></div>`;
  const form = () => ({ url: $('haUrl').value.trim(), ...($('haToken').value.trim() ? { token: $('haToken').value.trim() } : {}) });
  const name = () => $('haName').value.trim();
  $('haCancel').onclick = () => { f.hidden = true; };
  $('haTest').onclick = async () => {
    say('Testing…');
    try { const r = await api(`api/ha/connections/${encodeURIComponent(name() || 'new')}/test`, form()); say(r.ok ? `Connected to Home Assistant ${esc(r.version)}, ${r.entities} entities.` : esc(r.error), r.ok ? 'ok' : 'err'); }
    catch (e) { say(esc(e.message), 'err'); }
  };
  $('haSave').onclick = async () => {
    try { await api(`api/ha/connections/${encodeURIComponent(name())}`, form(), 'PUT'); f.hidden = true; say(`Saved ${esc(name())}.`, 'ok'); load(); }
    catch (e) { say(esc(e.message), 'err'); }
  };
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Per house: which connection its lamps use (location.json → integrations.ha.connection). */
async function houses() {
  let list = [];
  try { list = (await api('api/houses')).houses || []; } catch { return; }
  const rows = await Promise.all(list.filter(h => !h.readOnly).map(async h => {
    try { const d = await api(`api/houses/${encodeURIComponent(h.id)}`); return { h, d, loc: JSON.parse(d.location.text) }; } catch { return null; }
  }));
  // the built-in connection first, marked; a name this Plantern lacks says what happens (in the add-on: its own connection is used)
  const usable = conns.filter(c => !c.shadowed).sort((a, b) => (b.builtin ? 1 : 0) - (a.builtin ? 1 : 0));
  const hasBuiltin = usable.some(c => c.builtin);
  const opts = cur => `<option value="">none (lamps not live)</option>${usable.map(c => `<option value="${esc(c.name)}"${c.name === cur ? ' selected' : ''}>${esc(c.name)}${c.builtin ? ' (this Home Assistant, built in)' : ''}</option>`).join('')}${cur && !usable.some(c => c.name === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)} (${hasBuiltin ? 'not set up here; the add-on\'s own is used' : 'not set up here'})</option>` : ''}`;
  const ok = rows.filter(Boolean);
  $('haHouses').innerHTML = ok.length && conns.length ? `<div class="card"><div class="title">Which Home Assistant each house uses</div><div class="help">Saved in the house, so every Plantern that opens it uses this name. In the add-on, a name it does not have uses its own connection.</div><ul class="houses">${ok.map(({ h, loc }) => `<li><span class="nm" title="${esc(h.id)}">${esc(h.name)}</span><span class="acts"><select data-house="${esc(h.id)}" aria-label="Connection for ${esc(h.name)}">${opts(loc.integrations?.ha?.connection)}</select></span></li>`).join('')}</ul></div>` : '';
  $('haHouses').querySelectorAll('[data-house]').forEach(sel => (sel.onchange = async () => {
    const row = ok.find(r => r.h.id === sel.dataset.house), loc = structuredClone(row.loc);
    if (sel.value) loc.integrations = { ...(loc.integrations || {}), ha: { ...(loc.integrations?.ha || {}), connection: sel.value } };
    else if (loc.integrations?.ha) { delete loc.integrations.ha.connection; if (!Object.keys(loc.integrations.ha).length) delete loc.integrations.ha; }
    try {
      const r = await api(`api/houses/${encodeURIComponent(row.h.id)}/save`, { file: 'location', value: loc, base: row.d.location.text });
      if (r.conflict) throw new Error('it was changed elsewhere meanwhile; reload the page');
      say(`${esc(row.h.name)} now uses ${sel.value ? esc(sel.value) : 'no Home Assistant'}.`, 'ok'); load();
    } catch (e) { say(esc(e.message), 'err'); }
  }));
}
