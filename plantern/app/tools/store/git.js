// A storage that is a git repository (decisions 103–106). The houses are files in a local clone, like a
// folder storage; every save becomes a commit that is pushed, and the remote is fetched now and then so
// changes pushed from elsewhere arrive. When both sides moved, the house files are merged by entity id
// (decision 105); if the same things changed on both sides, the person picks the local or the remote
// version on the Storage page. Never a force push.
//
// Uses the git command line (no dependencies). Credentials: a token is given to git through a one-off
// credential helper that reads it from this process's environment, so it never lands in the remote URL,
// .git/config or a log; an SSH key the wizard generated is used through GIT_SSH_COMMAND. Without either,
// git uses the computer's own setup (Git Credential Manager, ssh-agent), so an existing setup just works.

import path from 'node:path';
import os from 'node:os';
import { promises as fs, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { FolderStore, findHouses, versionOf } from './folder.js';
import { redact } from './settings.js';
import { merge3 } from '../../src/model/merge.js';
import { formatJson } from '../../src/model/format.js';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** The environment and -c options that give git this storage's credentials, never prompting. */
export function gitAuth(secrets = {}) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', LC_ALL: 'C' };
  const args = [];
  if (secrets.token) {
    env.PLANTERN_GIT_USER = secrets.username || 'x-access-token';
    env.PLANTERN_GIT_TOKEN = secrets.token;
    // clear the computer's helpers, then one that answers from the environment (git runs it with sh)
    args.push('-c', 'credential.helper=', '-c', 'credential.helper=!f() { test "$1" = get && echo "username=$PLANTERN_GIT_USER" && echo "password=$PLANTERN_GIT_TOKEN"; }; f');
  } else if (!secrets.sshKey) delete env.GCM_INTERACTIVE;          // let the computer's own sign-in (Git Credential Manager) work
  if (secrets.sshKey) env.GIT_SSH_COMMAND = `ssh -i "${secrets.sshKey.replace(/\\/g, '/')}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
  return { env, args };
}

/** Run git; resolves { code, out, err } (never rejects for a git error; a missing git rejects with code ENOENT). */
export function git(cwd, argv, { secrets, timeout = 120000 } = {}) {
  const { env, args } = gitAuth(secrets);
  return new Promise((resolve, reject) => {
    execFile('git', [...args, ...argv], { cwd, env, timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (e, out, err) => {
      // ENOENT is also what a missing working folder gives: only a missing git program is "not installed"
      if (e && e.code === 'ENOENT') return existsSync(cwd) ? reject(Object.assign(new Error('git is not installed on this computer'), { code: 'NOGIT' })) : resolve({ code: 1, out: '', err: `no such folder: ${cwd}` });
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: String(out), err: String(err) });
    });
  });
}

/** What kind of failure git output describes: 'auth' | 'offline' | 'notfound' | 'other'. */
export function failureKind(text) {
  const t = String(text);
  if (/Authentication failed|could not read (Username|Password)|Permission denied \(publickey|terminal prompts disabled|403|401|access denied|denied to|not authorized|Invalid username or password|Write access to repository not granted|permission to .* denied/i.test(t)) return 'auth';
  if (/Repository not found|does not appear to be a git repository|not found/i.test(t)) return 'notfound';
  if (/Could not resolve host|unable to access|Connection (timed out|refused)|Network is unreachable|Operation timed out|Could not connect/i.test(t)) return 'offline';
  return 'other';
}

export async function gitVersion() {
  try { const r = await git(os.tmpdir(), ['--version']); return r.code === 0 ? r.out.trim() : null; } catch { return null; }
}

/** An https URL as its SSH form (https://github.com/a/b.git → git@github.com:a/b.git), for an SSH key. */
export function sshUrl(url) {
  const m = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/.exec(String(url).trim());
  return m ? `git@${m[1]}:${m[2].replace(/\/$/, '')}${/\.git$/.test(m[2]) ? '' : '.git'}` : url;
}

/** Where to add a deploy key and create a token, for the hosts people use most. */
export function hostLinks(url) {
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(String(url)) || null;
  if (m) return { deployKey: `https://github.com/${m[1]}/${m[2]}/settings/keys/new`, token: 'https://github.com/settings/personal-access-tokens/new', host: 'GitHub' };
  const g = /gitlab\.com[/:](.+?)(?:\.git)?$/.exec(String(url));
  if (g) return { deployKey: `https://gitlab.com/${g[1]}/-/settings/repository#js-deploy-keys-settings`, token: 'https://gitlab.com/-/user_settings/personal_access_tokens', host: 'GitLab' };
  return {};
}

/**
 * Can we read and push `url` with these secrets? Reading: ls-remote (also gives the default branch).
 * Pushing: a dry-run push of a throw-away empty commit to a branch that is never created, which the
 * host only allows with write access, and which works for an empty repository too.
 */
export async function remoteAccess(url, secrets, scratch) {
  await fs.mkdir(scratch, { recursive: true });
  const ls = await git(scratch, ['ls-remote', '--symref', url, 'HEAD'], { secrets });
  if (ls.code !== 0) return { canRead: false, canPush: false, problem: failureKind(ls.err), detail: ls.err.trim() };
  const branch = /ref: refs\/heads\/(\S+)\s+HEAD/.exec(ls.out)?.[1] || null;
  await fs.mkdir(scratch, { recursive: true });
  if ((await git(scratch, ['rev-parse', '--git-dir'])).code !== 0) await git(scratch, ['init', '-q']);
  const env = ['-c', 'user.name=Plantern', '-c', 'user.email=plantern@localhost'];
  const c = await git(scratch, [...env, 'commit-tree', EMPTY_TREE, '-m', 'Plantern write check']);
  const push = await git(scratch, ['push', '--dry-run', url, `${c.out.trim()}:refs/heads/plantern-write-check`], { secrets });
  return { canRead: true, canPush: push.code === 0, branch, empty: !ls.out.trim(), problem: push.code === 0 ? null : failureKind(push.err), detail: push.code === 0 ? '' : push.err.trim() };
}

/** The wizard's check: { git, mode, url, dir, branch, canRead, canPush, empty, dirty, houses, needs?, links, error? }. */
export async function checkGit(b, registry) {
  const version = await gitVersion();
  if (!version) return { ok: false, needs: 'git', error: 'Git is not installed on this computer.', download: 'https://git-scm.com/downloads' };
  const secrets = { ...(b.token ? { token: b.token } : {}), ...(b.sshKey ? { sshKey: b.sshKey } : {}) };
  const scratch = path.join(registry.dataDir, 'tmp', 'gitcheck');
  if (b.mode === 'existing') {
    const dir = path.resolve(String(b.dir || ''));
    const top = await git(dir, ['rev-parse', '--show-toplevel']).catch(() => ({ code: 1 }));
    if (top.code !== 0) return { ok: false, error: 'This folder is not a git repository.' };
    const root = path.resolve(top.out.trim());
    const url = (await git(root, ['remote', 'get-url', 'origin'])).out.trim();
    const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim() || 'main';
    const dirty = (await git(root, ['status', '--porcelain'])).out.trim().split('\n').filter(Boolean).length;
    const houses = (await findHouses(root)).map(h => ({ id: h.id, name: h.name }));
    if (!url) return { ok: true, version, mode: 'existing', dir: root, branch, url: '', canRead: false, canPush: false, dirty, houses, note: 'This repository has no remote (origin): saves are committed here only.' };
    const a = await remoteAccess(url, { ...(registry.secrets[b.id] || {}), ...secrets }, scratch);
    return { ok: true, version, mode: 'existing', dir: root, url, branch, dirty, houses, ...a, links: hostLinks(url), needs: a.canRead && a.canPush ? undefined : 'auth' };
  }
  const url = String(b.url || '').trim();
  if (!url) return { ok: false, error: 'Paste the address of the repository.' };
  const useUrl = b.sshKey ? sshUrl(url) : url;
  const a = await remoteAccess(useUrl, secrets, scratch);
  const dir = b.dir ? await cloneTarget(path.resolve(b.dir), url) : null;
  return { ok: true, version, mode: 'clone', url: useUrl, dir, ...a, links: hostLinks(url), needs: a.canRead && a.canPush ? undefined : a.problem === 'notfound' && !secrets.token && !secrets.sshKey ? 'auth' : a.problem === 'offline' ? 'network' : 'auth' };
}

/** Clone into `dir` when it is empty or new, else into dir/<repository name>. */
async function cloneTarget(dir, url) {
  try { const e = (await fs.readdir(dir)).filter(n => !n.startsWith('.')); if (!e.length) return dir; }
  catch { return dir; }
  const name = String(url).replace(/\.git$/, '').split(/[/:]/).filter(Boolean).pop() || 'houses';
  return path.join(dir, name);
}

/**
 * Before a git storage is saved (POST /api/stores): clone it (or check the existing repository) and
 * verify reading and pushing. Returns { cfg } to store, or { error, needs }.
 */
export async function prepareGit(cfg, secrets, registry) {
  const check = await checkGit({ ...cfg, ...secrets }, registry);
  if (!check.ok) return { error: check.error, needs: check.needs };
  if (check.url && !(check.canRead && check.canPush)) return { error: check.canRead ? 'Plantern can read this repository but not push to it: sign in with an account (or key) that may write.' : 'Plantern cannot reach this repository with these credentials.', needs: check.needs || 'auth' };
  let dir = check.dir;
  if (cfg.mode !== 'existing') {
    if (!dir) dir = await cloneTarget(path.join(registry.dataDir, 'clones'), check.url);
    await fs.mkdir(path.dirname(dir), { recursive: true });
    const r = await git(path.dirname(dir), ['clone', '--quiet', check.url, dir], { secrets, timeout: 600000 });
    if (r.code !== 0) return { error: `Cloning failed: ${redact(r.err.trim(), { x: secrets })}`, needs: failureKind(r.err) === 'auth' ? 'auth' : undefined };
    // an empty repository: start the branch the remote will get
    if (check.empty) await git(dir, ['symbolic-ref', 'HEAD', `refs/heads/${check.branch || 'main'}`]);
  }
  const branch = (await git(dir, ['symbolic-ref', '--short', 'HEAD'])).out.trim() || check.branch || 'main';
  const name = cfg.name || (check.url || dir).replace(/\.git$/, '').split(/[/:\\]/).filter(Boolean).pop();
  return { cfg: { type: 'git', name, dir, url: check.url, branch, fetchSeconds: cfg.fetchSeconds ?? 60 } };
}

/** A new SSH key for the wizard (ed25519, no passphrase, kept in Plantern's settings folder). */
export async function makeSshKey(registry, { name = 'plantern' } = {}) {
  const dir = path.join(registry.dataDir, 'keys');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${String(name).replace(/[^a-z0-9_-]/gi, '_')}_${Date.now().toString(36)}`);
  const r = await new Promise(res => execFile('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', `plantern@${os.hostname()}`, '-f', file], { windowsHide: true }, (e, out, err) => res({ e, err })));
  if (r.e) return { error: r.e.code === 'ENOENT' ? 'ssh-keygen is not available on this computer: use a token instead.' : String(r.err || r.e.message) };
  try { await fs.chmod(file, 0o600); } catch { /* Windows */ }
  return { sshKey: file, publicKey: (await fs.readFile(`${file}.pub`, 'utf8')).trim() };
}

export class GitStore extends FolderStore {
  constructor(cfg, ctx) {
    super({ ...cfg, path: cfg.dir });
    this.type = 'git';
    this.ctx = ctx;
    this.branch = cfg.branch || 'main';
    this.fetchMs = 1000 * (cfg.fetchSeconds ?? 60);
    this.queue = Promise.resolve();
    this.status = { state: 'pushed' };
  }

  secrets() { return this.ctx.secret(this.id); }
  run(argv, opts = {}) { return git(this.root, argv, { secrets: this.secrets(), ...opts }); }
  /** One git job at a time per repository. */
  serial(job) { const p = this.queue.then(job, job); this.queue = p.catch(() => {}); return p; }
  setStatus(state, error) {
    const changed = this.status.state !== state || this.status.error !== error;
    this.status = { state, ...(error ? { error: redact(error, this.ctx.secrets()) } : {}), at: new Date().toISOString() };
    if (changed) this.ctx.emit('sync', { store: this.id, ...this.status });
  }

  async open() {
    const r = await this.run(['rev-parse', '--show-toplevel']).catch(e => ({ code: 1, err: e.message }));
    if (r.code !== 0) { this.status = { state: 'error', error: 'the folder is not a git repository (any more)' }; this.houses = []; return; }
    await this.refresh();
    if (this.cfg.url) this.serial(() => this.syncNow()).catch(() => {});
  }

  async refresh() {
    // FolderStore.refresh() leaves { state: 'ok' } in place while it looks for houses; the sync state is what stays. Refreshes
    // can overlap (a file watcher, a save, a fetch arriving), so the state to go back to is the one from before the first of
    // them: a refresh that starts while another one's "ok" is in place must not take that "ok" for the real state.
    if (!this._refreshing) this._syncState = this.status;
    this._refreshing = (this._refreshing || 0) + 1;
    try { await super.refresh(); }
    finally {
      this._refreshing--;
      if (!this._refreshing && this.status.state === 'ok') this.status = this._syncState;   // keep the sync state; the folder is there
    }
    return this.houses;
  }

  /** The identity for commits: the repository's own if it has one, else Plantern. */
  async who() {
    const n = (await this.run(['config', 'user.name'])).out.trim(), e = (await this.run(['config', 'user.email'])).out.trim();
    return n && e ? [] : ['-c', `user.name=${this.cfg.author || 'Plantern'}`, '-c', 'user.email=plantern@localhost'];
  }

  /** Commit the given paths (relative to the repository) with a message; true when something was committed. */
  async commit(paths, message) {
    await this.run(['add', '--', ...paths]);
    if ((await this.run(['diff', '--cached', '--quiet'])).code === 0) return false;
    const r = await this.run([...(await this.who()), 'commit', '-q', '-m', message]);
    if (r.code !== 0) throw new Error(`commit failed: ${r.err.trim()}`);
    return true;
  }

  async write(h, file, text, { message } = {}) {
    const w = await super.write(h, file, text);
    const rel = path.relative(this.root, path.join(h.dir, this.fileName(h, file)));
    await this.serial(async () => { if (await this.commit([rel], `Plantern: ${message || `${h.name} ${file}.json`}`)) this.setStatus('pending'); });
    if (this.cfg.url) this.serial(() => this.push()).catch(() => {});
    return { ...w, sync: this.status };
  }

  async createHouse(folder, locationText, modelText, { message } = {}) {
    const dir = await super.createHouse(folder, locationText, modelText);
    await this.added(path.relative(this.root, dir) || '.', message || `New house ${folder}`);
    return dir;
  }

  /** Something was put in the repository (a new or copied house): commit and push it. */
  async added(rel, message) {
    await this.serial(async () => { if (await this.commit([rel], `Plantern: ${message}`)) this.setStatus('pending'); });
    if (this.cfg.url) this.serial(() => this.push()).catch(() => {});
  }

  /** Push local commits; a rejected push (the remote moved) fetches and merges first. */
  async push() {
    if (!this.cfg.url) return;
    const ahead = await this.count(`origin/${this.branch}..HEAD`);
    if (ahead === 0) { this.setStatus('pushed'); return; }
    const r = await this.run(['push', '-q', 'origin', `HEAD:refs/heads/${this.branch}`]);
    if (r.code === 0) { await this.run(['fetch', '-q', 'origin', this.branch]); this.setStatus('pushed'); return; }
    if (/rejected|non-fast-forward|fetch first/i.test(r.err)) {
      // the remote moved on: fetch it and merge first (once; a second rejection waits for the next sync)
      if (this.pushing) { this.setStatus('pending', r.err.trim()); this.retry(); return; }
      this.pushing = true;
      try {
        const f = await this.run(['fetch', '-q', 'origin', this.branch]);
        if (f.code !== 0) { this.setStatus(failureKind(f.err) === 'offline' ? 'offline' : 'pending', f.err.trim()); this.retry(); return; }
        await this.integrate();
      } finally { this.pushing = false; }
      return;
    }
    this.setStatus(failureKind(r.err) === 'auth' ? 'auth' : failureKind(r.err) === 'offline' ? 'offline' : 'pending', r.err.trim());
    this.retry();
  }

  retry() { clearTimeout(this.retryTimer); this.retryTimer = setTimeout(() => this.serial(() => this.push()).catch(() => {}), 30000); this.retryTimer.unref?.(); }

  async count(range) {
    const r = await this.run(['rev-list', '--count', range]);
    if (r.code === 0) return Number(r.out.trim()) || 0;
    // no remote branch yet (an empty repository): everything local is ahead
    return range.endsWith('..HEAD') ? Number((await this.run(['rev-list', '--count', 'HEAD'])).out.trim()) || 0 : 0;
  }

  /** Fetch, take in what arrived (merging by id when both sides moved), push what is local. */
  async syncNow() {
    if (!this.cfg.url) return;
    // files edited in the clone outside Plantern (a text editor) are local changes too
    const dirty = (await this.run(['status', '--porcelain'])).out.split('\n').filter(l => /\.json"?$/.test(l.trim()) && !l.startsWith('??'));
    if (dirty.length) await this.commit(dirty.map(l => l.slice(3).replace(/^"|"$/g, '')), 'Plantern: changes made in the folder');
    const f = await this.run(['fetch', '-q', 'origin', this.branch]);
    if (f.code !== 0) {
      if (/couldn't find remote ref/i.test(f.err)) return this.push();        // an empty remote: nothing to take in
      const k = failureKind(f.err);
      this.setStatus(k === 'auth' ? 'auth' : k === 'offline' ? 'offline' : 'error', f.err.trim());
      return;
    }
    if (this.status.state === 'conflict') return;                            // waits for the person's choice
    return this.integrate();
  }

  /** Bring origin/<branch> in: fast-forward, or a merge by entity id; then push. */
  async integrate() {
    const behind = await this.count(`HEAD..origin/${this.branch}`), ahead = await this.count(`origin/${this.branch}..HEAD`);
    if (behind && !ahead) {
      const r = await this.run(['merge', '-q', '--ff-only', `origin/${this.branch}`]);
      if (r.code !== 0) { this.setStatus('error', r.err.trim()); return; }
      this.setStatus('pushed');
      await this.arrived();
      return;
    }
    if (behind && ahead) {
      const m = await this.run([...(await this.who()), 'merge', '-q', '--no-ff', '--no-commit', `origin/${this.branch}`]);
      if (m.code !== 0) {
        // git could not combine some files: merge the house files by entity id
        const files = (await this.run(['diff', '--name-only', '--diff-filter=U'])).out.split('\n').filter(Boolean);
        const stuck = [];
        for (const rel of files) {
          if (!rel.endsWith('.json')) { stuck.push(rel); continue; }
          const show = async stage => { const r = await this.run(['show', `:${stage}:${rel}`]); return r.code === 0 ? r.out : null; };
          const [b, mine, theirs] = [await show(1), await show(2), await show(3)];
          if (mine === null || theirs === null) { stuck.push(rel); continue; }
          let r;
          try { r = merge3(b ? JSON.parse(b) : {}, JSON.parse(mine), JSON.parse(theirs)); } catch { stuck.push(rel); continue; }
          if (r.conflicts.length) { stuck.push(rel); continue; }
          await fs.writeFile(path.join(this.root, rel), formatJson(r.merged));
          await this.run(['add', '--', rel]);
        }
        if (stuck.length) {
          await this.run(['merge', '--abort']);
          this.setStatus('conflict', `The same things were changed here and in the repository (${stuck.join(', ')}). Pick which version to keep on the Storage page.`);
          return;
        }
      }
      const c = await this.run([...(await this.who()), 'commit', '-q', '--no-edit']);
      if (c.code !== 0 && !/nothing to commit/i.test(c.out + c.err)) { await this.run(['merge', '--abort']); this.setStatus('error', c.err.trim()); return; }
      await this.arrived();
    }
    return this.push();
  }

  /** New commits arrived: let the registry see which house files changed. */
  async arrived() { await this.refresh(); this.onPoke?.(); }

  /** The person's pick after a conflict: keep the local version ('local') or the remote one ('remote'). */
  async resolve(use) {
    return this.serial(async () => {
      if (use === 'local') {
        const m = await this.run([...(await this.who()), 'merge', '-q', '-s', 'ours', '-m', 'Plantern: kept the version on this computer', `origin/${this.branch}`]);
        if (m.code !== 0) throw new Error(m.err.trim());
      } else if (use === 'remote') {
        const r = await this.run(['reset', '-q', '--hard', `origin/${this.branch}`]);
        if (r.code !== 0) throw new Error(r.err.trim());
      } else throw new Error('use must be local or remote');
      this.setStatus('pending');
      await this.arrived();
      await this.push();
    });
  }

  watch(onPoke) {
    this.onPoke = onPoke;
    super.watch(onPoke);
    if (this.cfg.url) { this.fetchTimer = setInterval(() => this.serial(() => this.syncNow()).catch(() => {}), this.fetchMs); this.fetchTimer.unref?.(); }
  }

  /**
   * The branches of this repository: { current, local: [name], remote: [name only on the repository], hasRemote, dirty }.
   * Fetches first (best effort) so branches created elsewhere show up.
   */
  async branches() {
    if (this.cfg.url) await this.serial(() => this.run(['fetch', '-q', '--prune', 'origin'])).catch(() => {});
    return this.branchList();
  }

  /** The branches as they are now (no fetch, no queue: also used inside a queued job). */
  async branchList() {
    const refs = async pattern => (await this.run(['for-each-ref', '--format=%(refname:short)', pattern])).out.split('\n').map(s => s.trim()).filter(Boolean);
    const local = await refs('refs/heads'), remoteAll = (await refs('refs/remotes/origin')).map(n => n.replace(/^origin\//, '')).filter(n => n !== 'HEAD' && n !== 'origin');
    const dirty = (await this.run(['status', '--porcelain', '--untracked-files=no'])).out.split('\n').filter(Boolean).length;
    return { current: this.branch, local, remote: remoteAll.filter(n => !local.includes(n)), hasRemote: !!this.cfg.url, dirty };
  }

  /**
   * Switch to branch `name` (a local one, or one that is only on the repository: it is checked out and follows it), or
   * with create:true start it from the current one. House files Plantern saved are already commits; edits made in
   * the folder to house files are committed first; anything else uncommitted stops the switch. Pushing a new branch
   * happens at once when there is a remote. Returns the branches() view.
   */
  switchBranch(name, { create = false } = {}) {
    return this.serial(async () => {
      name = String(name || '').trim();
      if (!name || (await this.run(['check-ref-format', '--branch', name])).code !== 0) throw new Error(`"${name}" is not a usable branch name`);
      if (name === this.branch) return this.branchList();
      if (this.status.state === 'conflict') throw new Error('Settle the conflict on this storage first (keep this computer\'s version or take the repository\'s), then switch branch.');
      const dirty = (await this.run(['status', '--porcelain', '--untracked-files=no'])).out.split('\n').filter(Boolean);
      const json = dirty.filter(l => /\.json"?$/.test(l.trim())), other = dirty.filter(l => !json.includes(l));
      if (json.length) await this.commit(json.map(l => l.slice(3).replace(/^"|"$/g, '')), 'Plantern: changes made in the folder');
      if (other.length) throw new Error(`There are changes in the folder that are not house files and not committed (${other.map(l => l.slice(3)).slice(0, 3).join(', ')}): commit or discard them first.`);
      const has = async ref => (await this.run(['rev-parse', '--verify', '-q', ref])).code === 0;
      let r;
      if (await has(`refs/heads/${name}`)) { if (create) throw new Error(`A branch ${name} already exists.`); r = await this.run(['checkout', '-q', name]); }
      else if (await has(`refs/remotes/origin/${name}`)) { if (create) throw new Error(`A branch ${name} already exists on the repository.`); r = await this.run(['checkout', '-q', '-b', name, '--track', `origin/${name}`]); }
      else if (create) r = await this.run(['checkout', '-q', '-b', name]);
      else throw new Error(`There is no branch ${name}.`);
      if (r.code !== 0) throw new Error(`Switching failed: ${r.err.trim()}`);
      this.branch = name; this.cfg.branch = name;
      await this.ctx.patch?.(this.id, { branch: name });
      this.setStatus(this.cfg.url ? 'pending' : 'pushed');
      await this.arrived();                                                  // the houses of the other branch
      if (this.cfg.url) await this.syncNow().catch(() => {});                // take in what the branch has new, push a new one
      return this.branchList();
    });
  }

  /** Sync now (the Storage page's button). */
  sync() { return this.serial(() => this.syncNow()); }

  close() { super.close(); clearInterval(this.fetchTimer); clearTimeout(this.retryTimer); }
}

export { versionOf };
