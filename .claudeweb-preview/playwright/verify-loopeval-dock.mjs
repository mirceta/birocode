// Browser-verify the watchable dock (openspec loop-eval-watchable-dock,
// tasks 3.3 + 3.4) per docs/claude-web/browser-testing.md — against a
// DISPOSABLE instance this script boots itself, never live. Unlike
// verify-loopeval-ui.mjs (stub runs only), this runs the REAL goal scenario
// end to end and spends real agent turns (~3-4 CLI turns, haiku):
//
//   1. Tests tab → Start "Goal loop" → confirm; the passive where-to-watch
//      hint shows until the fixture's dock tab exists
//   2. "▶ Watch its agent dock" appears naming the loopeval-goal-live tab;
//      clicking it activates the tab and lands on the chat surface where the
//      seed turn is already visible
//   3. Loop-driven turns stream into that same dock (LOOP_DONE / GOAL_VERIFIED)
//   4. After the run resolves: verdict PASS, the watch affordance is gone,
//      and the dock tab is cleaned up (no loopeval-*-live tab remains)
//
// The instance runs FROM .claudeweb-preview/bin (inside the repo tree) ON
// PURPOSE — Program.FindRepoRoot self-pins this checkout, so the runner
// service resolves tests/loop-eval/ like the real self-dev setup.
//
//   node .claudeweb-preview/playwright/verify-loopeval-dock.mjs

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import(
    pathToFileURL(join(REPO, '.preview-test', 'node_modules', 'playwright', 'index.mjs')).href));
}
const PORT = Number(process.env.LOOPEVALDOCK_PORT || 5213);
const BASE = `http://localhost:${PORT}`;
const PW = 'loopevaldock-pw-3319';
const DATADIR = join(os.tmpdir(), 'cw-loopeval-dock', 'datadir');
const SHOT = (n) => join(REPO, '.claudeweb-preview', `out-loopeval-dock-${n}.png`);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 400)}`);
};
const health = async () => {
  try { return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; }
  catch { return false; }
};

let pid = null;
let browser = null;
try {
  // ---- boot: fresh datadir, gate ON + kill switch ON + real CLI brain so the
  //      spawned live suite passes its own preflight and drives real turns ----
  if (await health()) throw new Error(`something already answers on ${BASE} — set LOOPEVALDOCK_PORT`);
  rmSync(join(os.tmpdir(), 'cw-loopeval-dock'), { recursive: true, force: true });
  mkdirSync(DATADIR, { recursive: true });
  writeFileSync(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: true }));
  writeFileSync(join(DATADIR, 'autopilot.json'), JSON.stringify({
    Enabled: true, AutoAdvance: true, Threshold: 0.85, ArmedRepoIds: [],
    DenyList: ['reset --hard', 'force-push'], Brain: 'cli', BrainModel: 'haiku',
  }, null, 2));

  const exe = join(REPO, '.claudeweb-preview', 'bin', 'ClaudeWeb.exe');
  const child = spawn(exe, [], {
    cwd: join(REPO, '.claudeweb-preview', 'bin'), detached: true, stdio: 'ignore',
    env: { ...process.env, CLAUDEWEB_DATADIR: DATADIR, CLAUDEWEB_Port: String(PORT), CLAUDEWEB_AuthPassword: PW },
  });
  child.unref();
  pid = child.pid;
  let up = false;
  for (let i = 0; i < 45 && !up; i++) { up = await health(); if (!up) await new Promise((r) => setTimeout(r, 1000)); }
  if (!up) throw new Error('instance never became healthy');
  console.log(`instance up on ${BASE} (pid ${pid}, self-pinned to this checkout)`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }),
  });
  const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1];
  if (!token) throw new Error(`login failed: http ${login.status}`);
  const api = (p, opt = {}) => fetch(`${BASE}${p}`, {
    ...opt, headers: { 'Content-Type': 'application/json', Cookie: `claudeweb_session=${token}`, ...(opt.headers || {}) },
  });

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }]);
  await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'));
  const page = await ctx.newPage();
  const errs = [];
  let phase = 'boot'; // labels each captured error with where in the flow it happened
  // Known-benign, PRE-EXISTING platform noise (not this feature): the chat
  // surface probes the selected repo for understanding.md / plan.md
  // (UnderstandingPanel's documented "no file → render nothing" contract),
  // and FileController.Read answers 400 for a missing file — the browser
  // logs every 4xx. The bare fixture repo has neither file, so watching its
  // dock always logs exactly these. Match on the URL so nothing else hides.
  const BENIGN_MISSING_DOC = /\/api\/files\/read\?path=(understanding|plan)\.md/;
  const capture = (text, url) => {
    const line = `[${phase}] ${text}${url ? ` @ ${url}` : ''}`;
    if (BENIGN_MISSING_DOC.test(url || '') && /\b400\b/.test(text)) {
      console.log(`     (ignored benign: ${line})`);
      return;
    }
    errs.push(line);
  };
  page.on('console', (m) => { if (m.type() === 'error') capture(m.text(), m.location()?.url); });
  page.on('pageerror', (e) => capture('pageerror: ' + e.message, ''));
  page.on('response', (r) => {
    if (r.status() >= 400) capture(`http ${r.status()} ${r.request().method()}`, r.url());
  });

  const openEval = async () => {
    await page.goto(`${BASE}/studio/autopilot`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.locator('.ap-tabs button, nav button', { hasText: '🧪 Tests' }).first().click();
    await page.locator('.ap-subtabs button', { hasText: 'E2E eval' }).click();
    await page.locator('.le-row').first().waitFor({ timeout: 15000 });
  };

  // ---- 1. Start the real goal run from the Tests tab ----
  phase = 'start-run';
  await openEval();
  const goalRow = page.locator('.le-row', { hasText: 'Goal loop' });
  await goalRow.locator('button:not(:disabled)', { hasText: 'Start' }).click({ timeout: 15000 });
  await goalRow.locator('.le-confirm button', { hasText: 'Start eval' }).click();
  await page.locator('.le-run').waitFor({ timeout: 15000 });
  check('run panel appears after Start → confirm', true);

  // Until the fixture's dock tab exists, the section shows the passive hint
  // (preflight + fixture setup take a while; poll rather than race a single
  // snapshot). Tolerate the tab appearing before our first look.
  const early = await page.locator('.le-watch').textContent().catch(() => '');
  check('watch area renders during the run (hint or control)', !!early,
    `le-watch: ${JSON.stringify(early)}`);
  const sawHintFirst = /appears here once the run seeds/.test(early || '');
  console.log(`     (passive hint shown first: ${sawHintFirst})`);

  // ---- 2. Watch control appears once the tab exists, naming the fixture ----
  phase = 'wait-watch-control';
  const watchBtn = page.locator('.le-watch button', { hasText: 'Watch its agent dock' });
  await watchBtn.waitFor({ timeout: 360000 }); // preflight + fixture + seed turn
  // The live fixture repo is deterministically named `loopeval-goal-live`
  // (repoDisplayName in tests/loop-eval/lib.mjs), and the dock tab carries it.
  const named = await page.locator('.le-watch b').textContent().catch(() => '');
  check('watch control appears naming the loopeval-goal-live dock',
    (named || '').trim() === 'loopeval-goal-live', `named=${JSON.stringify(named)}`);
  const dock = await (await api('/api/dock')).json();
  const dockTabs = Array.isArray(dock) ? dock : (dock.tabs || []);
  const liveTab = dockTabs.find((t) => /^loopeval-.*-live$/.test(t.repoName || ''));
  check('dock tab exists in the synced dock list and is session-bound',
    !!liveTab && !!liveTab.sessionId, JSON.stringify(dockTabs).slice(0, 300));
  await page.screenshot({ path: SHOT('run'), fullPage: true });

  // ---- 3. Click it: lands on the chat surface, seed turn already visible ----
  phase = 'watch-chat';
  await watchBtn.click();
  await page.waitForURL('**/studio', { timeout: 15000 });
  const seedMsg = page.locator('.msg', { hasText: 'Reply with the single word' });
  await seedMsg.first().waitFor({ timeout: 30000 });
  check('watch click lands on the dock chat with the seed turn visible', true);

  // Loop-driven turns stream into this SAME conversation: the work turn ends
  // with LOOP_DONE and the verify turn emits GOAL_VERIFIED.
  await page.locator('.msg', { hasText: /LOOP_DONE|GOAL_VERIFIED/ }).first()
    .waitFor({ timeout: 600000 });
  check('loop-driven turns stream into the watched dock (sentinel visible)', true);
  await page.screenshot({ path: SHOT('chat'), fullPage: true });

  // ---- 4. Run resolves: verdict PASS, watch affordance gone, tab cleaned up ----
  // Poll the runner API for terminal state (the suite tears down right after
  // the verdict), then re-open the Tests tab and assert the UI agrees.
  phase = 'teardown-window';
  let cur = null;
  for (let i = 0; i < 120; i++) {
    cur = (await (await api('/api/loopeval/runs/current')).json())?.run || null;
    if (cur && ['passed', 'failed', 'stopped', 'error'].includes(cur.state)) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  check('run resolved terminal via the runner API', !!cur && cur.state === 'passed',
    JSON.stringify(cur).slice(0, 400));

  phase = 'post-run';
  await openEval();
  await page.locator('.le-run').waitFor({ timeout: 15000 });
  const verdict = await page.locator('.le-verdict').textContent().catch(() => '');
  check('UI verdict line shows PASS', /PASS/.test(verdict || ''), verdict);
  check('no watch affordance once the run is terminal',
    (await page.locator('.le-watch').count()) === 0);
  const after = await (await api('/api/dock')).json();
  const afterTabs = Array.isArray(after) ? after : (after.tabs || []);
  check('dock tab cleaned up after the run',
    !afterTabs.some((t) => /^loopeval-.*-live$/.test(t.repoName || '')),
    JSON.stringify(afterTabs).slice(0, 300));
  const leftover = await page.locator('.le-error').textContent().catch(() => '');
  check('no leftover fixture repo reported', !/Leftover fixture/.test(leftover || ''), leftover);
  await page.screenshot({ path: SHOT('final'), fullPage: true });

  check('no browser console errors', errs.length === 0, JSON.stringify(errs).slice(0, 400));
  await ctx.close();
} catch (e) {
  check('browser verification ran to completion', false, e?.stack || String(e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  rmSync(join(os.tmpdir(), 'cw-loopeval-dock'), { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
}

const pass = results.length > 0 && results.every((r) => r.ok);
console.log(`@@LOOPEVALDOCK@@ ${JSON.stringify({ pass, checks: results })}`);
console.log(pass ? `\nPASS: watchable dock (${results.length} checks) — screenshots ${SHOT('*')}` : '\nFAIL: watchable dock');
process.exit(pass ? 0 : 1);
