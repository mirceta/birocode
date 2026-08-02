// Token-path verification for openspec add-loop-eval-ui-runner (task 4.2).
// Proves the LOOPEVAL_LIVE_TOKEN auth path in tests/loop-eval/lib.mjs WITHOUT
// spending a single agent turn, against a DISPOSABLE instance (never live):
//
//   1. neither credential set  -> refuses before touching the network
//   2. both credentials set    -> refuses (no implicit fallback / guessing)
//   3. bogus token             -> 'live token rejected: http 401' verdict, no turns
//   4. minted token (a real session in the instance's store) -> the probe and
//      the authorized preflight calls succeed, and the run stops at the
//      EXISTING preflight-only failure (operator gate off on a fresh datadir)
//      — proving the token authenticates while still spending zero turns
//
//   node .claudeweb-preview/playwright/verify-loopeval-token.mjs
//
// No Playwright needed (pure fetch + child processes). Exit 0 = all checks hold.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const PORT = Number(process.env.TOKENCHECK_PORT || 5211);
const PW = 'tokencheck-pw-9911';
const ROOT = join(os.tmpdir(), 'cw-loopeval-tokencheck');
const BASE = `http://localhost:${PORT}`;
const GOAL = join(REPO, 'tests', 'loop-eval', 'goal.mjs');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 400)}`);
}

// Run goal.mjs --live against the disposable port with a controlled credential
// env (every inherited LOOPEVAL_* stripped first), capturing combined output.
function runScenario(extraEnv) {
  const env = { ...process.env, ...extraEnv };
  for (const k of Object.keys(env)) if (k.startsWith('LOOPEVAL_') && !(k in extraEnv)) delete env[k];
  env.LOOPEVAL_LIVE_PORT = String(PORT);
  env.LOOPEVAL_LIVE_ROOT = join(ROOT, 'fixture-scratch');
  const r = spawnSync(process.execPath, [GOAL, '--live'], { encoding: 'utf8', timeout: 120_000, env });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

async function health() {
  try { return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; }
  catch { return false; }
}

let pid = null;
try {
  // ---- disposable instance: fresh datadir (gate OFF by default), bin copy
  //      OUTSIDE the repo tree so it never self-pins this checkout ----
  if (await health()) throw new Error(`something already answers on ${BASE} — set TOKENCHECK_PORT`);
  rmSync(ROOT, { recursive: true, force: true });
  const datadir = join(ROOT, 'datadir');
  mkdirSync(datadir, { recursive: true });
  cpSync(join(REPO, '.claudeweb-preview', 'bin'), join(ROOT, 'bin'), { recursive: true });
  const exe = join(ROOT, 'bin', process.platform === 'win32' ? 'ClaudeWeb.exe' : 'ClaudeWeb');
  if (!existsSync(exe)) throw new Error('no build at .claudeweb-preview/bin — run dotnet build -o .claudeweb-preview/bin first');
  const child = spawn(exe, [], {
    cwd: join(ROOT, 'bin'), detached: true, stdio: 'ignore',
    env: { ...process.env, CLAUDEWEB_DATADIR: datadir, CLAUDEWEB_Port: String(PORT), CLAUDEWEB_AuthPassword: PW },
  });
  child.unref();
  pid = child.pid;
  let up = false;
  for (let i = 0; i < 45 && !up; i++) { up = await health(); if (!up) await new Promise((r) => setTimeout(r, 1000)); }
  if (!up) throw new Error('disposable instance never became healthy');
  console.log(`disposable instance up on ${BASE} (pid ${pid})`);

  // ---- 1. neither credential: refuse before any network call ----
  const none = runScenario({});
  check('neither credential -> refuses and names both variables',
    none.status !== 0 && none.out.includes('LOOPEVAL_LIVE_PW') && none.out.includes('LOOPEVAL_LIVE_TOKEN')
      && none.out.includes('refusing to touch the network'), none.out.slice(0, 600));

  // ---- 2. both credentials: refuse, no fallback guessing ----
  const both = runScenario({ LOOPEVAL_LIVE_PW: 'whatever', LOOPEVAL_LIVE_TOKEN: 'whatever' });
  check('both credentials -> refuses (set exactly one)',
    both.status !== 0 && both.out.includes('set exactly ONE'), both.out.slice(0, 600));

  // ---- 3. bogus token: credential-naming 401 verdict, zero agent turns ----
  const bad = runScenario({ LOOPEVAL_LIVE_TOKEN: 'deadbeef'.repeat(8) });
  check('bogus token -> live token rejected: http 401 (verdict names the credential)',
    bad.status !== 0 && bad.out.includes('live token rejected: http 401')
      && bad.out.includes('LOOPEVAL_LIVE_TOKEN'), bad.out.slice(0, 800));
  check('bogus token -> stopped before any agent turn',
    !bad.out.includes('seeding a conversation'), 'CLI probe line found in output');

  // ---- 4. minted token: a REAL session from the instance's own store (the
  //         same store CreateSession writes) authorizes the suite's calls;
  //         the run halts at the existing gate-off preflight, spending nothing ----
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  });
  const token = (login.headers.get('set-cookie') || '').match(/claudeweb_session=([^;]+)/)?.[1];
  if (login.status !== 200 || !token) throw new Error(`could not mint a session: http ${login.status}`);
  const minted = runScenario({ LOOPEVAL_LIVE_TOKEN: token });
  check('minted token -> probe passes (no rejection), authorized preflight verdicts appear',
    !minted.out.includes('live token rejected')
      && minted.out.includes('live preflight: operator gate is open'), minted.out.slice(0, 800));
  check('minted token -> run stops at the gate-off preflight (fail-fast, zero turns)',
    minted.status !== 0 && !minted.out.includes('seeding a conversation'), minted.out.slice(0, 800));
} catch (e) {
  check('token-path verification ran to completion', false, e?.stack || String(e));
} finally {
  if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  for (let i = 0; i < 5; i++) {
    try { rmSync(ROOT, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); break; }
    catch { await new Promise((r) => setTimeout(r, 500)); }
  }
}

const pass = results.length > 0 && results.every((r) => r.ok);
console.log(pass ? `\nPASS: token path (${results.length} checks)` : '\nFAIL: token path');
process.exit(pass ? 0 : 1);
