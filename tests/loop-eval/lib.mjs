// Shared harness for the loop-eval suite (openspec: add-loop-eval-suite).
//
// Boots an ISOLATED ClaudeWeb instance the same way tests/chat-systest/hub/
// instance.mjs does — binaries copied OUTSIDE the repo tree (so
// Program.FindRepoRoot finds no .sln and does not auto-pin this repo), fresh
// CLAUDEWEB_DATADIR, own port — then drives the REAL loop engine with REAL
// agent turns through the shipped operator surface only: login, /api/repos,
// /api/dock, /api/chat, /api/autopilot/loop, /api/autopilot/loops.
//
// The autopilot gate is host-only by design (AutopilotGate.cs — no enable
// endpoint, ever). The eval respects that boundary: it seeds
// autopilot-gate.json + autopilot.json into the isolated data dir BEFORE
// boot, which is the same trust level as the operator clicking the host GUI.
//
// Scenarios (goal.mjs, queue.mjs) import this and emit @@LOOPEVAL@@ {json}
// verdict lines; exit code 0 only when every assertion passed. Runs spend
// real Claude turns and real minutes — on demand only, never CI.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..');            // tests/loop-eval → repo root

export const CFG = {
  port: Number(process.env.LOOPEVAL_PORT || 5210),
  pw: process.env.LOOPEVAL_PW || 'loopeval-pw-4471',
  root: process.env.LOOPEVAL_ROOT || join(os.tmpdir(), 'cw-loopeval'),
  keep: process.env.LOOPEVAL_KEEP === '1',                 // skip teardown for debugging
  skipBuild: process.env.LOOPEVAL_SKIP_BUILD === '1',
};
export const base = () => `http://localhost:${CFG.port}`;
export const minutes = (n) => n * 60_000;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = () => new Date().toISOString().slice(11, 19);
export const say = (...a) => console.log(stamp(), ...a);

/** Thrown to short-circuit a scenario after a failed precondition — the
 *  failure is already recorded as a verdict, so no extra one is added. */
export class Abort extends Error {}

// ---------------------------------------------------------------- verdicts

export class Verdicts {
  constructor(scenario) { this.scenario = scenario; this.list = []; this.diagnostics = null; }
  assert(name, ok, detail = '') {
    const v = { name, ok: !!ok, detail: String(detail ?? '').slice(0, 2000) };
    this.list.push(v);
    console.log(`@@LOOPEVAL@@ ${JSON.stringify({ scenario: this.scenario, assert: name, ok: v.ok, detail: v.detail.slice(0, 300) })}`);
    say(v.ok ? `ok   - ${name}` : `FAIL - ${name} :: ${v.detail.slice(0, 300)}`);
    return v.ok;
  }
  get pass() { return this.list.length > 0 && this.list.every((v) => v.ok); }
  summary(extra = {}) {
    return { scenario: this.scenario, pass: this.pass, asserts: this.list,
      diagnostics: this.pass ? null : this.diagnostics, ...extra };
  }
}

export function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

/** Print + optionally write the summary; return the process exit code. */
export function finish(verdicts, jsonOut, extra = {}) {
  const s = verdicts.summary(extra);
  console.log(`@@LOOPEVAL@@ ${JSON.stringify({ scenario: s.scenario, summary: true, pass: s.pass, failed: s.asserts.filter((a) => !a.ok).map((a) => a.name) })}`);
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(s, null, 2)); say(`summary written → ${jsonOut}`); }
  say(s.pass ? `PASS: ${s.scenario} (${s.asserts.length} assertions)` : `FAIL: ${s.scenario}`);
  return s.pass ? 0 : 1;
}

// ------------------------------------------------------- instance lifecycle

function runToCompletion(cmd, args, cwd = REPO) {
  return new Promise((res, rej) => {
    say('$', cmd, args.join(' '));
    // Windows resolves dotnet/git via PATHEXT — needs a shell, whole line as one string.
    const p = process.platform === 'win32'
      ? spawn(`${cmd} ${args.join(' ')}`, { cwd, shell: true })
      : spawn(cmd, args, { cwd });
    p.stdout?.on('data', (d) => process.stdout.write(d));
    p.stderr?.on('data', (d) => process.stderr.write(d));
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
  });
}

export async function buildOnce() {
  const bin = join(REPO, '.claudeweb-preview', 'bin');
  if (CFG.skipBuild && existsSync(join(bin, process.platform === 'win32' ? 'ClaudeWeb.exe' : 'ClaudeWeb'))) {
    say('LOOPEVAL_SKIP_BUILD=1 — reusing existing .claudeweb-preview/bin'); return;
  }
  await runToCompletion('dotnet', ['build', 'ClaudeWeb.App/ClaudeWeb.App.csproj', '-o', '.claudeweb-preview/bin']);
}

export async function health(url = base()) {
  try { return (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) })).ok; }
  catch { return false; }
}

/**
 * Provision the scratch root: bin copy outside the repo, fresh datadir with
 * the gate + kill switch pre-seeded, and the scenario's fixture repo
 * materialized from its committed template (copy → git init → initial commit,
 * so agent commits never dirty the template).
 */
export async function provision(fixtureName) {
  if (await health()) throw new Error(`something already answers on ${base()} — stop it (or set LOOPEVAL_PORT) first`);
  const ROOT = CFG.root;
  say(`provisioning scratch root ${ROOT}`);
  rmSync(ROOT, { recursive: true, force: true });
  const datadir = join(ROOT, 'datadir');
  mkdirSync(datadir, { recursive: true });
  cpSync(join(REPO, '.claudeweb-preview', 'bin'), join(ROOT, 'bin'), { recursive: true });

  // Host-side gate/kill-switch seed (design D2). Shapes must match the C#
  // stores exactly: the gate serializes lowercase {enabled}, the config
  // store's Data class round-trips PascalCase and is case-SENSITIVE on read.
  writeFileSync(join(datadir, 'autopilot-gate.json'), JSON.stringify({ enabled: true }));
  writeFileSync(join(datadir, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: true, Threshold: 0.85, ArmedRepoIds: [],
    DenyList: ['reset --hard', 'force-push'], Brain: 'cli', BrainModel: 'haiku',
  }, null, 2));

  const fixtureRepo = join(ROOT, 'fixture-repo');
  cpSync(join(HERE, 'fixtures', fixtureName, 'repo-template'), fixtureRepo, { recursive: true });
  const git = (...a) => spawnSync('git', ['-C', fixtureRepo, '-c', 'user.email=loopeval@local', '-c', 'user.name=loopeval', ...a], { stdio: 'ignore' });
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'fixture: initial state');

  return { root: ROOT, datadir, fixtureRepo, pid: null };
}

export async function boot(ctx) {
  say(`launching ClaudeWeb on ${base()} (isolated datadir)`);
  const exe = join(ctx.root, 'bin', process.platform === 'win32' ? 'ClaudeWeb.exe' : 'ClaudeWeb');
  const child = spawn(exe, [], {
    cwd: join(ctx.root, 'bin'), detached: true, stdio: 'ignore',
    env: { ...process.env, CLAUDEWEB_DATADIR: ctx.datadir, CLAUDEWEB_Port: String(CFG.port), CLAUDEWEB_AuthPassword: CFG.pw },
  });
  child.unref();
  ctx.pid = child.pid;
  for (let i = 0; i < 60; i++) { if (await health()) { say(`instance healthy (pid ${ctx.pid})`); return; } await sleep(1000); }
  throw new Error(`instance never became healthy on ${base()}`);
}

let cookie = '';
export async function api(method, path, body, extraHeaders = {}, timeoutMs = 0) {
  const ctl = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(base() + path, {
      method,
      headers: { 'content-type': 'application/json', cookie, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    const setc = r.headers.get('set-cookie');
    if (setc) cookie = setc.split(';')[0];
    let json = null;
    try { json = await r.json(); } catch { /* SSE or empty body */ }
    return { status: r.status, json };
  } finally { if (timer) clearTimeout(timer); }
}

export async function login() {
  const r = await api('POST', '/api/auth/login', { password: CFG.pw });
  if (r.status !== 200) throw new Error(`login failed: http ${r.status}`);
}

export async function registerRepo(path, name) {
  const r = await api('POST', '/api/repos', { Folder: path, Name: name, Visibility: 'advanced' });
  if (!r.json?.id) throw new Error(`repo registration failed: http ${r.status} ${JSON.stringify(r.json)}`);
  say(`fixture repo registered: ${r.json.id}`);
  return r.json.id;
}

export async function createTabWithStash(repoId, repoName, prompts) {
  const t = await api('POST', '/api/dock', { repoId, repoName });
  const tabId = t.json?.id;
  if (!tabId) throw new Error(`dock tab creation failed: http ${t.status} ${JSON.stringify(t.json)}`);
  for (const text of prompts) {
    const s = await api('POST', `/api/dock/${tabId}/stash`, { text });
    if (s.status !== 200) throw new Error(`stash failed: http ${s.status} ${JSON.stringify(s.json)}`);
  }
  say(`dock tab ${tabId} stashed with ${prompts.length} prompt(s)`);
  return tabId;
}

// ------------------------------------------------------- engine driving

export async function runState(repoId) {
  const r = await api('GET', '/api/runs');
  return r.json?.[repoId] || null;
}

export async function loopState(repoId) {
  const r = await api('GET', '/api/autopilot/loops');
  return (r.json?.loops || []).find((l) => l.repoId === repoId) || null;
}

/**
 * Seed one conversation turn so the arm-time session pin has a transcript to
 * resolve (a fresh repo has none — the rehearsal learned this). Doubles as
 * the CLI probe: if this cheap turn can't complete, the box can't run the
 * suite and we abort before arming anything.
 */
export async function seedTurn(repoId) {
  say('seeding a conversation (CLI probe)…');
  await api('POST', '/api/chat', { message: 'Reply with the single word: ready. Do not touch any files.' },
    { 'X-Repo-Id': repoId }, 4000).catch(() => { /* drop the SSE attachment fast */ });
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    const run = await runState(repoId);
    if (run && run.status !== 'running') return { ok: run.status === 'done', run };
  }
  return { ok: false, run: { status: 'timeout' } };
}

/**
 * Poll the loop until it resolves (active=false) or the deadline passes.
 * Logs one status line per poll so a watching human sees progress.
 */
export async function watchLoop(repoId, { deadlineMs, tickMs = 5000 } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < deadlineMs) {
    await sleep(tickMs);
    const l = await loopState(repoId);
    const run = await runState(repoId);
    if (l) last = l;
    say(`loop status=${l?.status} phase=${l?.phase} sent=${l?.queueSent ?? '-'} left=${l?.queueRemaining ?? '-'} iter=${l?.iterationsDone} run=${run?.status ?? '-'}`);
    if (l && !l.active) return { loop: l, timedOut: false };
  }
  return { loop: last, timedOut: true };
}

// ------------------------------------------------------- diagnostics + teardown

export function runNode(script, cwd, args = []) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 60_000 });
  return { status: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

export function readAudit(ctx) {
  try {
    return readFileSync(join(ctx.datadir, 'autopilot-audit.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

export function readLoopsJson(ctx) {
  try { return readFileSync(join(ctx.datadir, 'loops.json'), 'utf8'); } catch { return ''; }
}

/** Capture the instance's log tail + final loops.json BEFORE teardown removes them. */
export function captureDiagnostics(ctx, verdicts) {
  if (!ctx) return;
  let logTail = '';
  try {
    const logs = join(ctx.root, 'bin', 'logs');
    const newest = readdirSync(logs).map((f) => join(logs, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    if (newest) logTail = readFileSync(newest, 'utf8').split(/\r?\n/).slice(-80).join('\n');
  } catch { /* no logs yet */ }
  verdicts.diagnostics = { logTail, loopsJson: readLoopsJson(ctx).slice(0, 8000) };
}

export async function down(ctx) {
  if (!ctx) return;
  if (CFG.keep) { say(`LOOPEVAL_KEEP=1 — leaving instance up (pid ${ctx.pid}, root ${ctx.root})`); return; }
  say(`tearing down (pid ${ctx.pid})`);
  if (ctx.pid) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(ctx.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-ctx.pid, 'SIGKILL'); } catch { try { process.kill(ctx.pid, 'SIGKILL'); } catch { /* */ } } }
  }
  // Windows releases the datadir/exe handles a beat after taskkill returns —
  // retry the rm with backoff and never let a stubborn lock hang the suite.
  for (let i = 0; i < 6; i++) {
    try { rmSync(ctx.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); return; }
    catch { await sleep(600); }
  }
  say(`warn: could not remove ${ctx.root} — left on disk, safe to delete later`);
}
