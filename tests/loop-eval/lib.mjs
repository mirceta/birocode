// Shared harness for the loop-eval suite (openspec: add-loop-eval-suite,
// live mode: add-loop-eval-live-mode).
//
// TWO RUN MODES, same scenarios and assertions:
//
// ISOLATED (default) — boots an ISOLATED ClaudeWeb instance the same way
// tests/chat-systest/hub/instance.mjs does — binaries copied OUTSIDE the repo
// tree (so Program.FindRepoRoot finds no .sln and does not auto-pin this
// repo), fresh CLAUDEWEB_DATADIR, own port — then drives the REAL loop engine
// with REAL agent turns through the shipped operator surface only: login,
// /api/repos, /api/dock, /api/chat, /api/autopilot/loop, /api/autopilot/loops.
//
// LIVE (--live or LOOPEVAL_LIVE=1) — targets the OPERATOR'S RUNNING live
// harness (:5099) instead, so a human can watch the run in the real UI: the
// fixture repo card, its agent dock turns, the Autopilot console loop card.
// Live mode never boots/seeds/kills anything and never writes the live data
// dir; loop internals come from GET /api/autopilot/loops/{repoId}/debug.
//
// The autopilot gate is host-only by design (AutopilotGate.cs — no enable
// endpoint, ever). Each mode respects that boundary its own way: isolated
// seeds autopilot-gate.json + autopilot.json into the isolated data dir
// BEFORE boot (same trust level as the operator clicking the host GUI);
// live FAILS FAST with instructions when the gate or kill switch is off —
// it never enables either itself.
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
  // Live mode (add-loop-eval-live-mode): same scenarios against the running
  // :5099 harness, watchable by the operator. Off = today's isolated mode.
  live: process.argv.includes('--live') || process.env.LOOPEVAL_LIVE === '1',
  livePort: Number(process.env.LOOPEVAL_LIVE_PORT || 5099),
  livePw: process.env.LOOPEVAL_LIVE_PW || '',              // terminal runs — never defaulted
  // Harness-minted one-shot session token (openspec: add-loop-eval-ui-runner).
  // Set ONLY by the harness's own eval-runner service when it spawns this suite
  // from the Tests tab — not for manual use. Installed directly as the session
  // cookie (no login call); revoked by the harness when the run ends.
  liveToken: process.env.LOOPEVAL_LIVE_TOKEN || '',
  liveRoot: process.env.LOOPEVAL_LIVE_ROOT || join(os.tmpdir(), 'cw-loopeval-live'),
  port: Number(process.env.LOOPEVAL_PORT || 5210),
  pw: process.env.LOOPEVAL_PW || 'loopeval-pw-4471',
  root: process.env.LOOPEVAL_ROOT || join(os.tmpdir(), 'cw-loopeval'),
  keep: process.env.LOOPEVAL_KEEP === '1',                 // skip teardown for debugging / inspection
  skipBuild: process.env.LOOPEVAL_SKIP_BUILD === '1',
};
export const base = () => `http://localhost:${CFG.live ? CFG.livePort : CFG.port}`;

/** Live fixture repos carry a distinctive suffix so a human (and the
 *  collision preflight) can always tell them apart from real projects. */
export const repoDisplayName = (baseName) => CFG.live ? `${baseName}-live` : baseName;

/** Live auth comes from EXACTLY ONE explicit source — password (terminal runs)
 *  or harness-minted token (Tests-tab runs). Never defaulted, never read off
 *  disk, and never a silent fallback from one to the other: with neither (or
 *  both) set we refuse before any network call. */
function requireLiveCredential() {
  if (!CFG.live) return;
  if (CFG.livePw && CFG.liveToken) {
    throw new Error('live mode: both LOOPEVAL_LIVE_PW and LOOPEVAL_LIVE_TOKEN are set — set exactly ONE (password for terminal runs, token only when the harness spawns the run), refusing to guess');
  }
  if (!CFG.livePw && !CFG.liveToken) {
    throw new Error('live mode needs a credential: LOOPEVAL_LIVE_PW=<the live operator password> (terminal runs) or LOOPEVAL_LIVE_TOKEN (set by the harness UI runner — not for manual use) — refusing to touch the network without one');
  }
}
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

// ------------------------------------------------------------ describe mode
// (openspec: loop-eval-scenario-transparency) `--describe` prints a JSON
// manifest built from the SAME constants the run uses, then exits — no build,
// no provisioning, no network, no tokens. The harness relays it to the Tests
// tab so the operator can read what a scenario arms, acts on, and must prove
// before ever clicking Start. Scenarios must check `describing` FIRST.

export const DESCRIBE_VERSION = 1;
export const describing = process.argv.includes('--describe');

export function describeAndExit(manifest) {
  console.log(JSON.stringify({ describeVersion: DESCRIBE_VERSION, ...manifest }, null, 2));
  process.exit(0);
}

/** The committed-template facts every manifest states about its fixture:
 *  name, repo-relative path, and the file list read straight off disk. */
export function fixtureFacts(name) {
  const dir = join(HERE, 'fixtures', name, 'repo-template');
  const files = readdirSync(dir, { recursive: true })
    .map((p) => String(p).replaceAll('\\', '/'))
    .filter((p) => statSync(join(dir, p)).isFile())
    .sort();
  return { name, templatePath: `tests/loop-eval/fixtures/${name}/repo-template`, files };
}

/** Print + optionally write the summary; return the process exit code.
 *  Assign it to process.exitCode (do NOT process.exit()): with a live harness
 *  still up, undici keep-alive sockets can be mid-close and an abrupt exit
 *  trips a libuv assertion on Windows (exit 127 instead of the verdict code).
 *  The unref'd timer hard-exits any straggling handle with the right code. */
export function finish(verdicts, jsonOut, extra = {}) {
  const s = verdicts.summary(extra);
  console.log(`@@LOOPEVAL@@ ${JSON.stringify({ scenario: s.scenario, summary: true, pass: s.pass, failed: s.asserts.filter((a) => !a.ok).map((a) => a.name) })}`);
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(s, null, 2)); say(`summary written → ${jsonOut}`); }
  say(s.pass ? `PASS: ${s.scenario} (${s.asserts.length} assertions)` : `FAIL: ${s.scenario}`);
  const code = s.pass ? 0 : 1;
  setTimeout(() => process.exit(code), 8000).unref();
  return code;
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
  if (CFG.live) { say('live mode — no build, targeting the running live harness'); return; }
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

/** Copy → git init → initial commit, so agent commits never dirty the template. */
function materializeFixture(root, fixtureName) {
  const fixtureRepo = join(root, 'fixture-repo');
  cpSync(join(HERE, 'fixtures', fixtureName, 'repo-template'), fixtureRepo, { recursive: true });
  const git = (...a) => spawnSync('git', ['-C', fixtureRepo, '-c', 'user.email=loopeval@local', '-c', 'user.name=loopeval', ...a], { stdio: 'ignore' });
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'fixture: initial state');
  return fixtureRepo;
}

/**
 * Provision for the selected mode.
 *
 * ISOLATED: scratch root with a bin copy outside the repo, fresh datadir with
 * the gate + kill switch pre-seeded, and the fixture repo materialized from
 * its committed template.
 *
 * LIVE: the live harness must ALREADY answer (we never boot it); only the
 * fixture repo is materialized, into its own scratch root. No gate seeding,
 * no datadir, no binaries — the live instance and store are the operator's.
 */
export async function provision(fixtureName) {
  if (CFG.live) {
    requireLiveCredential();
    if (!(await health()))
      throw new Error(`no live harness answers on ${base()} — start it (or set LOOPEVAL_LIVE_PORT) first`);
    const ROOT = CFG.liveRoot;
    say(`live mode — provisioning fixture scratch ${ROOT} (live instance untouched)`);
    if (existsSync(ROOT)) say('note: replacing a previous run\'s scratch fixture (a LOOPEVAL_KEEP leftover repo card would now point at the new copy — the preflight will insist you remove it first)');
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
    return { root: ROOT, datadir: null, fixtureRepo: materializeFixture(ROOT, fixtureName), pid: null, live: true };
  }
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

  return { root: ROOT, datadir, fixtureRepo: materializeFixture(ROOT, fixtureName), pid: null, live: false };
}

// ------------------------------------------------------- golden examples
// (openspec: loop-evals) A "golden example" is a captured human-babysat task
// packaged as a git bundle (tag eval/start, branch golden, tag eval/final)
// plus manifest.json (acceptance checks + queue seed hints), plan.md, and a
// labeled conversation.jsonl. The golden.mjs scenario replays the real loop
// from eval/start and scores the outcome against the checks (verdict) and the
// golden trajectory (evidence). Authored by the curation UI (api/loop-evals).

/** Where committed / external golden examples live. Defaults to the committed
 *  tests/loop-evals/examples; override for large real-world captures. */
export function goldenExampleDir(exampleId) {
  const root = process.env.LOOPEVAL_GOLDEN_EXAMPLES_ROOT
    || join(REPO, 'tests', 'loop-evals', 'examples');
  return join(root, exampleId);
}

/** Read an example's manifest + plan text off disk — no network, no clone, so
 *  --describe and the drift guard can use it before spending anything. */
export function readGoldenManifest(exampleId) {
  const dir = goldenExampleDir(exampleId);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`golden example not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const planPath = join(dir, 'plan.md');
  return { dir, manifest, bundle: join(dir, 'repo.bundle'),
    planText: existsSync(planPath) ? readFileSync(planPath, 'utf8') : '' };
}

/**
 * Clone a golden example's repo.bundle at eval/start into a fresh working copy
 * on a `work` branch, with the golden answer STRIPPED (golden branch + eval/*
 * tags + origin removed) so the driven agent can't peek. Returns
 * { fixtureRepo, startSha }: startSha bounds the run's own commit chain and is
 * the shared ancestor the trajectory scorer diffs against. The bundle file is
 * left intact on disk — compareTrajectory fetches the golden chain back from
 * it under a private namespace at scoring time.
 */
export function materializeGolden(root, bundlePath, subdir = 'fixture-repo') {
  if (!existsSync(bundlePath)) throw new Error(`golden example has no repo.bundle: ${bundlePath}`);
  const fixtureRepo = join(root, subdir);
  const clone = spawnSync('git', ['clone', '-q', bundlePath, fixtureRepo], { encoding: 'utf8' });
  if (clone.status !== 0) throw new Error(`git clone of bundle failed: ${clone.stderr || clone.stdout}`);
  const git = (...a) => spawnSync('git', ['-C', fixtureRepo, ...a], { encoding: 'utf8' });
  const startSha = (git('rev-parse', 'refs/tags/eval/start').stdout || '').trim();
  if (!/^[0-9a-f]{40}$/.test(startSha)) throw new Error('bundle is missing the eval/start tag');
  git('checkout', '-q', '-B', 'work', startSha);      // working tree = start state
  git('branch', '-D', 'golden');                       // strip the answer (ignore if not local)
  git('tag', '-d', 'eval/start'); git('tag', '-d', 'eval/final');
  git('remote', 'remove', 'origin');
  return { fixtureRepo, startSha };
}

/** Run a manifest's acceptance checks in the given working copy, in order.
 *  Each `{ name, command }` runs through the platform shell; ok = exit 0. This
 *  is the golden scenario's PRIMARY verdict (mechanical, not byte-identity). */
export function runChecks(fixtureRepo, checks) {
  return (checks || []).map((c) => {
    const r = spawnSync(c.command, { cwd: fixtureRepo, shell: true, encoding: 'utf8', timeout: 120_000 });
    const ok = r.status === 0;
    return { name: c.name, ok,
      detail: ok ? '' : `exit ${r.status}: ${((r.stdout || '') + (r.stderr || '')).trim().slice(0, 200)}` };
  });
}

function commitChain(fixtureRepo, range) {
  const out = spawnSync('git', ['-C', fixtureRepo, 'log', '--reverse', '--format=@@%H', '--name-only', range],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).stdout || '';
  const commits = []; let cur = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('@@')) { cur = { sha: line.slice(2), files: new Set() }; commits.push(cur); }
    else if (line.trim() && cur) cur.files.add(line.trim());
  }
  return commits;
}
function jaccard(a, b) {
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

/**
 * Trajectory EVIDENCE (never a verdict — a correct run may validly diverge):
 * positional files-touched Jaccard overlap of the run's own commit chain
 * (startSha..work) vs the golden chain (startSha..golden, fetched back from the
 * bundle). Reports turn counts, per-position overlap, and the first position
 * where the run touched a wholly different fileset (firstDivergence).
 */
export function compareTrajectory(fixtureRepo, startSha, bundlePath) {
  const f = spawnSync('git', ['-C', fixtureRepo, 'fetch', '-q', bundlePath,
    '+refs/heads/golden:refs/goldeneval/golden', '+refs/tags/eval/final:refs/goldeneval/final'],
    { encoding: 'utf8' });
  if (f.status !== 0) throw new Error(`fetch golden failed: ${f.stderr || f.stdout}`);
  const run = commitChain(fixtureRepo, `${startSha}..work`);
  const golden = commitChain(fixtureRepo, `${startSha}..refs/goldeneval/golden`);
  const n = Math.min(run.length, golden.length);
  const overlaps = []; let firstDivergence = -1;
  for (let i = 0; i < n; i++) {
    const o = jaccard(run[i].files, golden[i].files);
    overlaps.push(Number(o.toFixed(2)));
    if (firstDivergence < 0 && o === 0) firstDivergence = i;
  }
  if (firstDivergence < 0 && run.length !== golden.length) firstDivergence = n;
  const meanOverlap = overlaps.length ? overlaps.reduce((a, b) => a + b, 0) / overlaps.length : 0;
  return { runTurns: run.length, goldenTurns: golden.length, overlaps, firstDivergence, meanOverlap };
}

/**
 * Provision for a golden-example run — the instance scaffolding of provision()
 * (isolated: scratch bin + datadir with gate/kill-switch seeded; live: verify
 * the live harness answers), MINUS fixture materialization: the caller
 * materializes one or more working copies from the bundle via materializeGolden
 * (a reliability sweep makes several against one booted instance). Carries the
 * resolved example (dir, bundle, manifest, planText) on the returned ctx.
 */
export async function provisionFromBundle(exampleId) {
  const { dir, manifest, bundle, planText } = readGoldenManifest(exampleId);
  const common = { exampleId, exampleDir: dir, bundle, manifest, planText };
  if (CFG.live) {
    requireLiveCredential();
    if (!(await health()))
      throw new Error(`no live harness answers on ${base()} — start it (or set LOOPEVAL_LIVE_PORT) first`);
    const ROOT = CFG.liveRoot;
    say(`live mode — provisioning golden scratch ${ROOT} (live instance untouched)`);
    if (existsSync(ROOT)) say('note: replacing a previous run\'s scratch fixture (a LOOPEVAL_KEEP leftover repo card would now point at the new copy — the preflight will insist you remove it first)');
    rmSync(ROOT, { recursive: true, force: true });
    mkdirSync(ROOT, { recursive: true });
    return { root: ROOT, datadir: null, pid: null, live: true, ...common };
  }
  if (await health()) throw new Error(`something already answers on ${base()} — stop it (or set LOOPEVAL_PORT) first`);
  const ROOT = CFG.root;
  say(`provisioning scratch root ${ROOT}`);
  rmSync(ROOT, { recursive: true, force: true });
  const datadir = join(ROOT, 'datadir');
  mkdirSync(datadir, { recursive: true });
  cpSync(join(REPO, '.claudeweb-preview', 'bin'), join(ROOT, 'bin'), { recursive: true });
  writeFileSync(join(datadir, 'autopilot-gate.json'), JSON.stringify({ enabled: true }));
  writeFileSync(join(datadir, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: true, Threshold: 0.85, ArmedRepoIds: [],
    DenyList: ['reset --hard', 'force-push'], Brain: 'cli', BrainModel: 'haiku',
  }, null, 2));
  return { root: ROOT, datadir, pid: null, live: false, ...common };
}

export async function boot(ctx) {
  if (CFG.live) { say('live mode — no boot, the live harness is already running'); return; }
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
let cookiePinned = false; // token path: never let a Set-Cookie clobber the installed token
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
    if (setc && !cookiePinned) cookie = setc.split(';')[0];
    let json = null;
    try { json = await r.json(); } catch { /* SSE or empty body */ }
    return { status: r.status, json };
  } finally { if (timer) clearTimeout(timer); }
}

export async function login() {
  requireLiveCredential();
  if (CFG.live && CFG.liveToken) {
    // Harness-minted token: install it as the session cookie, no login call.
    // Probe with the cheapest authorized GET so a revoked/stale token fails
    // RIGHT HERE with a verdict naming the credential (mirrors the
    // wrong-password copy below) instead of a confusing mid-scenario 401.
    cookie = `claudeweb_session=${CFG.liveToken}`;
    cookiePinned = true;
    const probe = await api('GET', '/api/repos');
    if (probe.status === 401) {
      throw new Error('live token rejected: http 401 — is LOOPEVAL_LIVE_TOKEN a session freshly minted by the live harness? It is revoked the moment its run ends; rerun from the Tests tab, never reuse one');
    }
    if (probe.status !== 200) throw new Error(`live token probe failed: http ${probe.status}`);
    return;
  }
  const r = await api('POST', '/api/auth/login', { password: CFG.live ? CFG.livePw : CFG.pw });
  if (r.status !== 200) {
    throw new Error(CFG.live
      ? `live login failed: http ${r.status} — is LOOPEVAL_LIVE_PW the live operator password?`
      : `login failed: http ${r.status}`);
  }
}

// Live-mode bookkeeping: what THIS run created on the live harness, so
// teardown removes exactly that and nothing else.
let liveRepoId = null;
let liveTabId = null;

/**
 * Live preflight (design D2) — one verdict per unmet operator precondition,
 * each naming exactly what to click. In isolated mode this is a silent no-op
 * (the gate/kill switch were seeded before boot), keeping verdict counts and
 * assertion text identical to today's runs. NEVER enables anything itself:
 * the gate is host-only by design (AutopilotGate.cs) and stays that way.
 */
export async function livePreflight(verdicts) {
  if (!CFG.live) return true;
  const loops = await api('GET', '/api/autopilot/loops');
  const gateOk = verdicts.assert('live preflight: operator gate is open',
    loops.json?.gateOpen === true,
    'enable Autopilot in the HOST GUI (operator gate toggle on the harness window), then rerun');

  // killSwitchEnabled rides the (session-auth, ungated) debug bundle; the
  // repoId only scopes the bundle's loop slice, so a placeholder id is fine
  // this early — the global flag is what we need.
  const dbg = await api('GET', '/api/autopilot/loops/loopeval-preflight/debug');
  const killOk = verdicts.assert('live preflight: autopilot kill switch is on',
    dbg.json?.killSwitchEnabled === true,
    'turn the kill switch ON in the Autopilot console (Enabled toggle), then rerun');

  const repos = await api('GET', '/api/repos');
  const leftovers = (Array.isArray(repos.json) ? repos.json : [])
    .filter((r) => /^loopeval-.*-live$/.test(r.name || ''));
  const cleanOk = verdicts.assert('live preflight: no leftover loopeval-*-live repo',
    leftovers.length === 0,
    leftovers.map((r) => `${r.name} (${r.id})`).join(', ')
      + ' — the previous run\'s fixture is still up; click FINISH AGENT on the Tests tab'
      + ' (or DELETE /api/repos/{id}), then rerun');

  return gateOk && killOk && cleanOk;
}

export async function registerRepo(path, name) {
  const r = await api('POST', '/api/repos', { Folder: path, Name: name, Visibility: 'advanced' });
  if (!r.json?.id) throw new Error(`repo registration failed: http ${r.status} ${JSON.stringify(r.json)}`);
  say(`fixture repo registered: ${r.json.id}`);
  if (CFG.live) liveRepoId = r.json.id;
  return r.json.id;
}

/** Live mode's reason to exist: tell the human where to watch, right when
 *  there is something to watch. Silent in isolated mode. */
export function announceWatch(repoName) {
  if (!CFG.live) return;
  say('');
  say('┌──────────────────────────────────────────────────────────────');
  say(`│ WATCH IT LIVE: ${base()}`);
  say(`│   → its agent dock is in the DOCKS strip — open the "${repoName}" agent`);
  say('│     (already bound to the driven conversation: seed turn, then loop turns)');
  say(`│   → the repo card "${repoName}" is under advanced visibility`);
  say('│   → Autopilot console shows the loop card ticking through phases');
  say('└──────────────────────────────────────────────────────────────');
  say('');
}

/** Open a dock tab for the fixture repo (openspec: loop-eval-watchable-dock).
 *  Every scenario creates one — mode-blind — so the driven conversation is
 *  always visible in the dashboard's DOCKS strip, not just on the repo card. */
export async function createTab(repoId, repoName) {
  const t = await api('POST', '/api/dock', { repoId, repoName });
  const tabId = t.json?.id;
  if (!tabId) throw new Error(`dock tab creation failed: http ${t.status} ${JSON.stringify(t.json)}`);
  if (CFG.live) liveTabId = tabId;
  say(`dock tab ${tabId} opened for ${repoName}`);
  return tabId;
}

/** Bind the tab to the conversation the loop will drive (the seed turn's
 *  session), so opening the dock shows the seeded turn immediately instead of
 *  an empty chat. A missing session id downgrades to a warning — the binding
 *  is an upgrade, never a new hard dependency (design D2): run discovery
 *  still attaches the dock on the loop's first send. */
export async function bindTabSession(tabId, sessionId) {
  if (!sessionId) { say('warn: no seed session id — dock tab left unbound (run discovery will attach it on the first loop send)'); return false; }
  const r = await api('PATCH', `/api/dock/${tabId}`, { sessionId });
  if (r.status !== 200) { say(`warn: dock tab ${tabId} not bound to session (http ${r.status}) — continuing unbound`); return false; }
  say(`dock tab ${tabId} bound to session ${sessionId}`);
  return true;
}

export async function createTabWithStash(repoId, repoName, prompts) {
  const tabId = await createTab(repoId, repoName);
  for (const text of prompts) {
    const s = await api('POST', `/api/dock/${tabId}/stash`, { text });
    if (s.status !== 200) throw new Error(`stash failed: http ${s.status} ${JSON.stringify(s.json)}`);
  }
  say(`dock tab ${tabId} stashed with ${prompts.length} prompt(s)`);
  return tabId;
}

// ------------------------------------------------------- briefing rules
// (briefing scenario) The GLOBAL operator briefing store, reached through the
// shipped GET/PUT /api/autopilot/briefing surface only. The scenario injects
// ONE self-scoped rule and teardown removes exactly that rule BY ID — never a
// blind restore of a snapshot — so an operator's concurrent edits on a live
// box survive the run untouched.

let injectedRuleId = null;

export async function briefingGet() {
  const r = await api('GET', '/api/autopilot/briefing');
  if (r.status !== 200 || !r.json) throw new Error(`briefing GET failed: http ${r.status}`);
  return r.json;
}

/** Append one enabled rule to the current list via the editor's own
 *  replace-the-whole-set PUT; returns { id, rev, payload } of the new state. */
export async function briefingAddRule(text) {
  const cur = await briefingGet();
  const rules = (cur.rules || []).map((x) => ({ id: x.id, text: x.text, enabled: x.enabled }));
  rules.push({ id: null, text, enabled: true });
  const r = await api('PUT', '/api/autopilot/briefing', { rules });
  if (r.status !== 200 || !r.json) throw new Error(`briefing PUT failed: http ${r.status} ${JSON.stringify(r.json || {}).slice(0, 300)}`);
  const added = (r.json.rules || []).find((x) => x.text === text);
  if (!added?.id) throw new Error('briefing PUT accepted but the injected rule is missing from the returned snapshot');
  injectedRuleId = added.id;
  say(`briefing rule injected (id ${added.id}, rev ${r.json.rev})`);
  return { id: added.id, rev: r.json.rev, payload: r.json };
}

/** Remove exactly the rule this run injected (no-op when none). KEEP leaves it
 *  in place and prints the manual step, like the rest of the KEEP contract. */
export async function briefingRemoveInjectedRule() {
  if (!injectedRuleId) return;
  if (CFG.keep) {
    say(`LOOPEVAL_KEEP=1 — injected briefing rule left in place (id ${injectedRuleId}); remove it via the dock's Briefing section (or PUT /api/autopilot/briefing without it)`);
    return;
  }
  try {
    const cur = await briefingGet();
    const rules = (cur.rules || []).filter((x) => x.id !== injectedRuleId)
      .map((x) => ({ id: x.id, text: x.text, enabled: x.enabled }));
    const r = await api('PUT', '/api/autopilot/briefing', { rules });
    if (r.status !== 200) throw new Error(`http ${r.status}`);
    say(`injected briefing rule removed (rev ${r.json?.rev})`);
    injectedRuleId = null;
  } catch (e) {
    say(`warn: injected briefing rule ${injectedRuleId} not removed (${e?.message}) — remove it in the dock's Briefing section`);
  }
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

/** The per-repo debug bundle — live mode's one window into loop internals
 *  (openspec: add-loop-debug-handoff). Read-only toward the live datadir. */
async function debugBundle(repoId) {
  const r = await api('GET', `/api/autopilot/loops/${repoId}/debug`);
  return r.json || null;
}

/**
 * The repo's autopilot audit entries, normalized to the isolated-mode shape
 * ({Outcome}) so scenario asserts are mode-blind. Isolated reads the scratch
 * datadir's JSONL; live reads the debug bundle's per-repo slice (server-side
 * filtered — other repos on the live box never leak into an assert).
 */
export async function readAudit(ctx, repoId = liveRepoId) {
  if (CFG.live) {
    const b = repoId ? await debugBundle(repoId) : null;
    // briefed/briefingRev (openspec: loop-agent-briefing): stamped on every
    // audit entry; a live harness built before the stamps rode the bundle
    // yields undefined here, which the briefing scenario names in its verdict.
    return (b?.audit || []).map((a) => ({
      Outcome: a.outcome, At: a.at, Confidence: a.confidence,
      Briefed: a.briefed === true, BriefingRev: a.briefingRev ?? 0,
    }));
  }
  try {
    return readFileSync(join(ctx.datadir, 'autopilot-audit.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

export function readLoopsJson(ctx) {
  try { return readFileSync(join(ctx.datadir, 'loops.json'), 'utf8'); } catch { return ''; }
}

/**
 * The queue loop's sent-history in arm order. Isolated: parse the scratch
 * store's loops.json (System.Text.Json escapes backticks/quotes — parse,
 * never substring-match). Live: the same field off the debug bundle.
 */
export async function queueSentTexts(ctx, repoId) {
  if (CFG.live) {
    const b = await debugBundle(repoId);
    const texts = b?.loop?.queueSentTexts;
    return Array.isArray(texts) ? texts : [];
  }
  try {
    const loops = JSON.parse(readLoopsJson(ctx)).Loops || {};
    return Object.values(loops).find((l) => l.Kind === 'queue')?.QueueSentTexts || [];
  } catch { return []; }
}

/** Capture failure evidence BEFORE teardown removes it: isolated = the
 *  instance's log tail + final loops.json; live = the repo's debug bundle. */
export async function captureDiagnostics(ctx, verdicts) {
  if (!ctx) return;
  if (CFG.live) {
    const b = liveRepoId ? await debugBundle(liveRepoId).catch(() => null) : null;
    verdicts.diagnostics = { debugBundle: JSON.stringify(b || {}).slice(0, 8000) };
    return;
  }
  let logTail = '';
  try {
    const logs = join(ctx.root, 'bin', 'logs');
    const newest = readdirSync(logs).map((f) => join(logs, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    if (newest) logTail = readFileSync(newest, 'utf8').split(/\r?\n/).slice(-80).join('\n');
  } catch { /* no logs yet */ }
  verdicts.diagnostics = { logTail, loopsJson: readLoopsJson(ctx).slice(0, 8000) };
}

/** Live teardown (design D5): remove exactly what this run created on the
 *  live harness — loop, dock tab, registry entry, scratch dir — or, with
 *  LOOPEVAL_KEEP=1, leave it all for UI inspection and print the manual
 *  steps. Failures warn and name the leftover; the verdict is never masked. */
async function downLive(ctx) {
  if (CFG.keep) {
    say('LOOPEVAL_KEEP=1 — leaving the live fixture in place: its agent dock stays watchable.');
    say('Finish it with the FINISH AGENT button on the Tests tab (it stops the loop, closes the');
    say('dock tab, unregisters the repo card, and deletes the scratch copy). Manual fallback:');
    if (liveRepoId) say(`  1. stop the loop + remove the repo card in the UI (or DELETE /api/repos/${liveRepoId})`);
    if (liveTabId) say(`  2. close its dock tab (or DELETE /api/dock/${liveTabId})`);
    say(`  3. delete the scratch copy ${ctx.root}`);
    return;
  }
  say('live teardown: unregistering the fixture from the live harness');
  if (liveRepoId) {
    const stop = await api('POST', '/api/autopilot/loop', { repoId: liveRepoId, action: 'stop' }).catch(() => null);
    if (!stop || stop.status !== 200) say(`warn: loop stop returned http ${stop?.status ?? 'error'} (fine if it already resolved)`);
  }
  if (liveTabId) {
    const t = await api('DELETE', `/api/dock/${liveTabId}`).catch(() => null);
    if (!t || t.status !== 200) say(`warn: dock tab ${liveTabId} not removed (http ${t?.status ?? 'error'}) — close it in the UI`);
  }
  if (liveRepoId) {
    const r = await api('DELETE', `/api/repos/${liveRepoId}`).catch(() => null);
    if (!r || r.status !== 200) say(`warn: repo ${liveRepoId} not unregistered (http ${r?.status ?? 'error'}) — remove its card in the UI`);
  }
  try { rmSync(ctx.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); }
  catch { say(`warn: could not remove ${ctx.root} — left on disk, safe to delete later`); }
}

export async function down(ctx) {
  if (!ctx) return;
  if (CFG.live) { await downLive(ctx); return; }
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
