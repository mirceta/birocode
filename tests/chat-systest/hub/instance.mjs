// Isolated-instance orchestration for the Chat system-test hub.
//
// Automates the manual dance in ../README.md: build the backend, copy the
// binaries OUTSIDE the repo (so Program.FindRepoRoot finds no .sln and does NOT
// auto-pin this repo), launch ClaudeWeb.exe on an isolated port with a fresh
// CLAUDEWEB_DATADIR + seed password, register a throwaway scratch repo, and
// record everything in hub/.state/instance.json. `down` kills the process tree
// and removes the scratch root. The live :5099 store is never touched.
//
// Usage (also driven by server.mjs):
//   node instance.mjs up      # build + launch + register, write .state/instance.json
//   node instance.mjs down    # kill the instance, remove the scratch root
//   node instance.mjs status  # print current instance.json + health
//
// Emits NDJSON log lines on stdout ({type, msg}) so the hub can stream progress.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');           // tests/chat-systest/hub → repo root
const STATE_DIR = join(HERE, '.state');
const STATE_FILE = join(STATE_DIR, 'instance.json');

export const CFG = {
  port: Number(process.env.SYSTEST_PORT || 5310),
  pw: process.env.SYSTEST_PW || 'systest-pw-9912',
  model: process.env.SYSTEST_MODEL || 'claude-haiku-4-5',
  root: process.env.SYSTEST_ROOT || join(os.tmpdir(), 'cw-systest'),
};
export const base = () => `http://localhost:${CFG.port}`;

// log() yields a structured line the hub can render; also human-readable.
const log = (type, msg) => process.stdout.write(JSON.stringify({ type, msg }) + '\n');

export function readState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}
function writeState(s) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function health(url = base()) {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

// Run a command to completion, streaming its output as log lines. Throws on
// non-zero exit so `up` aborts loudly rather than half-provisioning.
function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    log('cmd', `${cmd} ${args.join(' ')}`);
    // On Windows dotnet/git resolve via PATHEXT, so a shell is needed. Pass the
    // whole line as one shell string (not cmd+args+shell, which is deprecated).
    const win = process.platform === 'win32';
    const p = win
      ? spawn(`${cmd} ${args.join(' ')}`, { cwd: REPO, shell: true, ...opts })
      : spawn(cmd, args, { cwd: REPO, ...opts });
    p.stdout?.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => log('out', l)));
    p.stderr?.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => log('err', l)));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
  });
}

async function apiPost(path, body, cookie) {
  const r = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : undefined; } catch { /* */ }
  return { status: r.status, json, text, headers: r.headers };
}

export async function up() {
  if (await health()) {
    log('warn', `something already answers on ${base()} — refusing to clobber it. Run "down" first.`);
    const prev = readState();
    if (prev?.rid) { log('done', `reusing existing instance (rid ${prev.rid})`); return prev; }
    throw new Error(`port ${CFG.port} is busy but no known instance to reuse`);
  }

  // 1. Build the backend to an isolated dir inside the repo (gitignored).
  log('step', 'building backend → .claudeweb-preview/bin');
  await run('dotnet', ['build', 'ClaudeWeb.App/ClaudeWeb.App.csproj', '-o', '.claudeweb-preview/bin']);

  // 2. Provision a scratch root OUTSIDE the repo: bin copy, datadir, git repo.
  const ROOT = CFG.root;
  log('step', `provisioning scratch root ${ROOT}`);
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'datadir'), { recursive: true });
  mkdirSync(join(ROOT, 'scratch-repo'), { recursive: true });
  cpSync(join(REPO, '.claudeweb-preview', 'bin'), join(ROOT, 'bin'), { recursive: true });
  writeFileSync(join(ROOT, 'scratch-repo', 'README.md'), 'hello\n');
  for (const a of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'init']]) {
    spawnSync('git', ['-C', join(ROOT, 'scratch-repo'), ...a], { stdio: 'ignore' });
  }

  // 3. Launch ClaudeWeb.exe detached on the isolated port + fresh datadir.
  log('step', `launching ClaudeWeb on ${base()} (fresh datadir, seed password)`);
  const exe = join(ROOT, 'bin', process.platform === 'win32' ? 'ClaudeWeb.exe' : 'ClaudeWeb');
  const child = spawn(exe, [], {
    cwd: join(ROOT, 'bin'),
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      CLAUDEWEB_DATADIR: join(ROOT, 'datadir'),
      CLAUDEWEB_Port: String(CFG.port),
      CLAUDEWEB_AuthPassword: CFG.pw,
    },
  });
  child.unref();
  const pid = child.pid;

  // 4. Wait for health.
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { ok = await health(); if (!ok) await sleep(1000); }
  if (!ok) throw new Error(`instance never became healthy on ${base()}`);
  log('out', 'instance healthy');

  // 5. Log in, register the scratch repo, capture its id.
  const login = await apiPost('/api/auth/login', { password: CFG.pw });
  const setCookie = login.headers.getSetCookie?.() || [login.headers.get('set-cookie')].filter(Boolean);
  const cookie = (setCookie.join('; ').match(/claudeweb_session=[^;]+/) || [])[0];
  if (!cookie) throw new Error('login to fresh instance failed');
  const reg = await apiPost('/api/repos',
    { Folder: join(ROOT, 'scratch-repo'), Name: 'scratch', Visibility: 'advanced' }, cookie);
  const rid = reg.json?.id;
  if (!rid) throw new Error(`scratch repo registration failed: http ${reg.status} ${reg.text}`);
  log('out', `scratch repo registered: rid ${rid}`);

  const state = { base: base(), port: CFG.port, rid, pw: CFG.pw, model: CFG.model,
    scratch: join(ROOT, 'scratch-repo'), root: ROOT, pid, startedAt: Date.now() };
  writeState(state);
  log('done', `instance up — base ${state.base}, rid ${rid}, pid ${pid}`);
  return state;
}

export async function down() {
  const s = readState();
  if (!s) { log('warn', 'no instance.json — nothing to tear down'); return; }
  log('step', `killing instance pid ${s.pid} and its tree`);
  if (s.pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(s.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-s.pid, 'SIGKILL'); } catch { try { process.kill(s.pid, 'SIGKILL'); } catch { /* */ } } }
  }
  // The process is dead, but on Windows taskkill returns before the OS releases
  // the datadir/exe file handles — an immediate rmSync hits EPERM. Retry with
  // backoff, and never let a stubborn lock leave the instance "stuck": clearing
  // the state file is what marks it down, so that always happens.
  if (s.root && existsSync(s.root)) {
    log('step', `removing scratch root ${s.root}`);
    let removed = false;
    for (let i = 0; i < 6 && !removed; i++) {
      try { rmSync(s.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); removed = true; }
      catch (e) { if (i === 5) log('warn', `could not remove ${s.root} (${e.code || e.message}) — left on disk, safe to delete later`); else await sleep(600); }
    }
  }
  rmSync(STATE_FILE, { force: true });
  log('done', 'instance down, state cleared');
}

// CLI entry point.
if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  const cmd = process.argv[2];
  const run_ = async () => {
    if (cmd === 'up') await up();
    else if (cmd === 'down') await down();
    else if (cmd === 'status') {
      const s = readState();
      log('out', s ? `instance.json: ${JSON.stringify(s)}` : 'no instance.json');
      log('out', `health(${base()}) = ${await health()}`);
    } else { log('err', 'usage: node instance.mjs up|down|status'); process.exit(2); }
  };
  run_().catch((e) => { log('err', e?.message || String(e)); process.exit(1); });
}
