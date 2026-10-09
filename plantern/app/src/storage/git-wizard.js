// The git part of the Add storage wizard (storage.html): a repository already on this computer, or one
// to clone from GitHub / GitLab / anywhere. Reading and pushing are both checked before connecting; if
// either fails, sign in with a token or a new SSH key (shown with a link to where it goes).

export function renderGitStep(el, w, { api, browser, esc, done, back }) {
  const g = (w.git ??= { mode: null });
  const err = t => { const e = el.querySelector('#gErr'); if (e) e.innerHTML = t ? `<div class="msg err">${t}</div>` : ''; };
  const draw = () => renderGitStep(el, w, { api, browser, esc, done, back });

  if (!g.mode) {
    el.innerHTML = `<div class="title" style="margin-bottom:10px">A git repository</div><div class="choice">
      <button data-m="clone">⬇ <b>Clone one</b><small>Paste its address (GitHub, GitLab, …) and pick where on this computer to keep it.</small></button>
      <button data-m="existing">📁 <b>One already on this computer</b><small>A folder where you cloned it yourself.</small></button></div>
      <div class="btns" style="margin-top:10px"><button class="quiet" data-back>Back</button></div>`;
    el.querySelectorAll('[data-m]').forEach(b => (b.onclick = () => { g.mode = b.dataset.m; draw(); }));
    el.querySelector('[data-back]').onclick = back;
    return;
  }

  if (!g.check) {
    el.innerHTML = g.mode === 'clone'
      ? `<div class="title">Clone a repository</div>
        <label class="f">Address of the repository <small>e.g. https://github.com/you/houses.git</small><input class="t" id="gUrl" value="${esc(g.url || '')}" spellcheck="false" autocomplete="off"></label>
        <label class="f">Keep it in this folder on this computer <small>(empty or new: cloned right there; otherwise into a folder named after the repository inside it; nothing picked: Plantern's own folder)</small></label>
        <div id="gBrowser"></div><div id="gErr"></div>
        <div class="btns" style="margin-top:10px"><button class="go big" id="gCheck">Check</button><button class="quiet" data-back>Back</button></div>`
      : `<div class="title">Pick the repository's folder</div><div id="gBrowser"></div><div id="gErr"></div>
        <div class="btns" style="margin-top:10px"><button class="go big" id="gCheck">Use this folder</button><button class="quiet" data-back>Back</button></div>`;
    browser(el.querySelector('#gBrowser'), { start: g.dir, onChange: p => { g.dir = p; } });
    el.querySelector('[data-back]').onclick = () => { g.mode = null; draw(); };
    el.querySelector('#gCheck').onclick = async () => {
      if (g.mode === 'clone') g.url = el.querySelector('#gUrl').value.trim();
      if (g.mode === 'clone' ? !g.url : !g.dir) { err(g.mode === 'clone' ? 'Paste the address of the repository.' : 'Pick the folder first.'); return; }
      await check();
    };
    return;
  }

  const c = g.check, ok = c.ok && (!c.url || (c.canRead && c.canPush));
  const mark = b => (b ? '<b class="ok">✓</b>' : '<b class="bad">✗</b>');
  const links = c.links || {};
  el.innerHTML = `<div class="title">${g.mode === 'clone' ? 'Clone and connect' : 'Connect this repository'}</div>
    ${c.ok ? `<div class="where">${esc(c.url || '(no remote)')}${c.branch ? ` · ${esc(c.branch)}` : ''}${c.dir ? `<br>${esc(c.dir)}` : ''}</div>
      ${c.url ? `<div style="margin:8px 0">${mark(c.canRead)} can read &nbsp; ${mark(c.canPush)} can push</div>` : ''}
      ${c.note ? `<div class="msg">${esc(c.note)}</div>` : ''}
      ${c.empty ? '<div class="msg">The repository is empty: your first house goes in it.</div>' : ''}
      ${c.houses?.length ? `<div class="msg ok">Found ${c.houses.length} house${c.houses.length > 1 ? 's' : ''}: ${c.houses.map(h => `<b>${esc(h.name)}</b>`).join(', ')}</div>` : ''}
      ${c.dirty ? `<div class="msg">${c.dirty} file${c.dirty > 1 ? 's are' : ' is'} changed in this folder and not committed; Plantern commits house files it finds changed.</div>` : ''}`
    : `<div class="msg err">${esc(c.error)}${c.download ? ` <a href="${esc(c.download)}" target="_blank" rel="noopener">Download git</a>, install it, then Check again.` : ''}</div>`}
    ${c.needs === 'auth' || c.needs === 'network' ? `<div class="card" style="margin:10px 0">
      ${c.needs === 'network' ? '<div class="help">The repository could not be reached: is this computer online, and is the address right?</div>' : `<div><b>Sign in</b> <span class="help">${c.canRead ? 'Plantern can read but not push.' : 'Plantern could not open the repository with this computer\'s sign-in.'} Use one of these:</span></div>
      <label class="f">A token <small>${links.token ? `(<a href="${esc(links.token)}" target="_blank" rel="noopener">create one on ${esc(links.host)}</a>: access to this repository, contents read and write)` : '(a personal access token with read and write access)'}</small><input class="t" id="gToken" type="password" autocomplete="off" placeholder="paste the token" value="${esc(g.token || '')}"></label>
      <div style="margin-top:10px"><b>or</b> an SSH key just for Plantern: ${g.publicKey ? `add this key${links.deployKey ? ` as a <a href="${esc(links.deployKey)}" target="_blank" rel="noopener">deploy key</a>` : ' to the repository'} and tick <i>Allow write access</i>:
        <textarea class="t" rows="3" readonly id="gPub" style="margin-top:4px">${esc(g.publicKey)}</textarea><button id="gCopy">Copy the key</button>`
        : '<button id="gKey">Make an SSH key</button>'}</div>`}</div>` : ''}
    <div id="gErr"></div>
    <label class="f">Name of the storage<input class="t" id="gName" value="${esc(g.name ?? ((c.url || c.dir || '').replace(/\.git$/, '').split(/[/:\\]/).filter(Boolean).pop() || ''))}" style="font-family:inherit"></label>
    <div class="btns" style="margin-top:10px"><button class="go big" id="gConnect"${ok ? '' : ' disabled'}>${g.mode === 'clone' ? 'Clone and connect' : 'Connect'}</button><button id="gAgain">Check again</button><button class="quiet" data-back>Back</button></div>`;
  el.querySelector('[data-back]').onclick = () => { g.check = null; draw(); };
  el.querySelector('#gAgain').onclick = () => { g.token = el.querySelector('#gToken')?.value.trim() || g.token; check(); };
  el.querySelector('#gToken')?.addEventListener('change', e => { g.token = e.target.value.trim(); });
  el.querySelector('#gCopy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(g.publicKey); el.querySelector('#gCopy').textContent = 'Copied ✓'; } catch { el.querySelector('#gPub').select(); } });
  el.querySelector('#gKey')?.addEventListener('click', async () => {
    const k = await api('api/stores/sshkey', { name: (c.url || 'plantern').split(/[/:]/).pop().replace(/\.git$/, '') }).catch(e => ({ error: e.message }));
    if (k.error) { err(esc(k.error)); return; }
    g.sshKey = k.sshKey; g.publicKey = k.publicKey; g.token = '';
    draw();
  });
  el.querySelector('#gName').oninput = e => { g.name = e.target.value; };
  el.querySelector('#gConnect').onclick = async () => {
    el.querySelector('#gConnect').disabled = true;
    el.querySelector('#gConnect').textContent = g.mode === 'clone' ? 'Cloning…' : 'Connecting…';
    try {
      const secrets = { ...(g.token ? { token: g.token } : {}), ...(g.sshKey ? { sshKey: g.sshKey } : {}) };
      const r = await api('api/stores', { type: 'git', mode: g.mode, url: g.mode === 'clone' ? g.url : undefined, dir: g.mode === 'clone' ? (g.dir || undefined) : c.dir, name: g.name || undefined, ...(Object.keys(secrets).length ? { secrets } : {}) });
      done(r.store, r.store.houses.length ? '' : 'empty');
    } catch (e) { err(esc(e.message)); el.querySelector('#gConnect').disabled = false; el.querySelector('#gConnect').textContent = 'Try again'; }
  };

  async function check() {
    err('');
    el.querySelector('#gCheck, #gAgain') && (el.querySelector('#gCheck, #gAgain').textContent = 'Checking…');
    try {
      g.check = await api('api/stores/check', { type: 'git', mode: g.mode, url: g.url, dir: g.dir, ...(g.token ? { token: g.token } : {}), ...(g.sshKey ? { sshKey: g.sshKey } : {}) });
    } catch (e) { g.check = { ok: false, error: e.message }; }
    draw();
  }
}
