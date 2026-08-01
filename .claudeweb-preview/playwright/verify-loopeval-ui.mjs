// Browser-verify the Tests-tab E2E eval runner (openspec add-loop-eval-ui-runner,
// task 4.4) per docs/claude-web/browser-testing.md — against a DISPOSABLE
// instance this script boots itself, never live, and never spending an agent
// turn (every spawned "stub" run halts at the suite's own kill-switch-off
// preflight before any CLI use).
//
// Checks:
//   1. Advanced mode: Tests → E2E eval shows the runner with scenario rows +
//      cost copy; kill-switch-off renders the actionable instruction and
//      blocks Start
//   2. Basic mode: the section (and the whole advanced console) is hidden
//   3. Start → confirm flow: with preconditions green the confirm step
//      restates the cost; Cancel starts nothing
//   4. One-run-at-a-time: second POST while a stub run is active → 409; the
//      run panel streams state → failed with the preflight verdict rows
//
// IMPORTANT: the instance runs FROM .claudeweb-preview/bin (inside the repo
// tree) ON PURPOSE — Program.FindRepoRoot then self-pins this checkout, so the
// runner service can resolve tests/loop-eval/ like the real self-dev setup.
//
//   node .claudeweb-preview/playwright/verify-loopeval-ui.mjs

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// Playwright lives in the gitignored .preview-test/ sandbox on this box (see
// docs/claude-web/browser-testing.md) — fall back to it when the bare
// specifier doesn't resolve from this script's location.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import(
    pathToFileURL(join(REPO, '.preview-test', 'node_modules', 'playwright', 'index.mjs')).href));
}
const PORT = Number(process.env.LOOPEVALUI_PORT || 5212);
const BASE = `http://localhost:${PORT}`;
const PW = 'loopevalui-pw-7712';
const DATADIR = join(os.tmpdir(), 'cw-loopeval-ui', 'datadir');
const OUT = join(REPO, '.claudeweb-preview', 'out-loopeval-ui.png');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 300)}`);
};
const health = async () => {
  try { return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; }
  catch { return false; }
};

let pid = null;
let browser = null;
try {
  // ---- boot: fresh datadir, gate ON + kill switch OFF (the shown-precondition
  //      case AND the guarantee that no stub run ever reaches an agent turn) ----
  if (await health()) throw new Error(`something already answers on ${BASE} — set LOOPEVALUI_PORT`);
  rmSync(join(os.tmpdir(), 'cw-loopeval-ui'), { recursive: true, force: true });
  mkdirSync(DATADIR, { recursive: true });
  writeFileSync(join(DATADIR, 'autopilot-gate.json'), JSON.stringify({ enabled: true }));
  writeFileSync(join(DATADIR, 'autopilot.json'), JSON.stringify({
    Enabled: false, AutoAdvance: false, Threshold: 0.85, ArmedRepoIds: [],
    DenyList: ['reset --hard'], Brain: 'stub', BrainModel: 'haiku',
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
  const openConsole = async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/studio/autopilot`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    return page;
  };

  // ---- 1. Advanced: section + precondition instruction + blocked Start ----
  const adv = await browser.newContext({ viewport: { width: 1000, height: 1200 } });
  await adv.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }]);
  await adv.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'));
  let page = await openConsole(adv);
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

  await page.locator('.ap-tabs button, nav button', { hasText: '🧪 Tests' }).first().click();
  await page.locator('.ap-subtabs button', { hasText: 'E2E eval' }).click();
  await page.locator('.le-runner').waitFor({ timeout: 10000 });
  await page.locator('.le-row').first().waitFor({ timeout: 10000 });

  check('advanced: E2E section renders 3 scenario rows', await page.locator('.le-row').count() === 3,
    `rows=${await page.locator('.le-row').count()}`);
  check('advanced: cost copy (turns + minutes) shown per row',
    (await page.locator('.le-cost').allTextContents()).every((t) => /agent turns/.test(t) && /min/.test(t)));
  const banner = await page.locator('.le-runner .st-prereq').textContent().catch(() => '');
  check('kill-switch-off instruction names the Autopilot console toggle',
    /kill switch is OFF/i.test(banner || '') && /Enabled ON/i.test(banner || ''), banner);
  check('Start blocked while a precondition is unmet',
    (await page.locator('.le-row button:disabled').count()) === 3);
  await page.screenshot({ path: OUT, fullPage: true });

  // ---- 2. Basic mode: hidden ----
  const basic = await browser.newContext({ viewport: { width: 1000, height: 1200 } });
  await basic.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }]);
  await basic.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'basic'));
  const bpage = await openConsole(basic);
  await bpage.waitForTimeout(1500);
  check('basic: E2E eval section is hidden', (await bpage.locator('.le-runner').count()) === 0);
  await basic.close();

  // ---- 3. confirm flow with preconditions green (kill switch ON via the
  //         shipped config endpoint; still nothing started — we Cancel) ----
  const flip = await api('/api/autopilot/config', { method: 'POST', body: JSON.stringify({ Enabled: true }) });
  check('kill switch flipped ON for the confirm-flow check', flip.status === 200, `http ${flip.status}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.ap-tabs button, nav button', { hasText: '🧪 Tests' }).first().click();
  await page.locator('.ap-subtabs button', { hasText: 'E2E eval' }).click();
  await page.locator('.le-row').first().waitFor({ timeout: 10000 });
  const goalRow = page.locator('.le-row', { hasText: 'Goal loop' });
  await goalRow.locator('button:not(:disabled)', { hasText: 'Start' }).click({ timeout: 10000 });
  const confirmText = await goalRow.locator('.le-confirm').textContent();
  check('confirm step restates the cost before POSTing',
    /agent turns/.test(confirmText || '') && /min/.test(confirmText || ''), confirmText);
  await goalRow.locator('.le-confirm button', { hasText: 'Cancel' }).click();
  const idle = await (await api('/api/loopeval/runs/current')).json();
  check('Cancel starts nothing', idle.run === null || idle.run === undefined, JSON.stringify(idle));

  // ---- 4. stub run + 409 + streamed failure verdicts (kill switch back OFF
  //         so the spawned suite halts at its own preflight, zero turns) ----
  await api('/api/autopilot/config', { method: 'POST', body: JSON.stringify({ Enabled: false }) });
  const first = await api('/api/loopeval/runs', { method: 'POST', body: JSON.stringify({ scenario: 'goal' }) });
  check('stub run starts (POST /api/loopeval/runs → 200)', first.status === 200, `http ${first.status} ${JSON.stringify(await first.json().catch(() => null))}`);
  const second = await api('/api/loopeval/runs', { method: 'POST', body: JSON.stringify({ scenario: 'queue' }) });
  const secondBody = await second.json().catch(() => ({}));
  check('second start while active → 409 naming the active run',
    second.status === 409 && /already active/.test(secondBody.error || '') && /goal/.test(secondBody.error || ''),
    `http ${second.status} ${JSON.stringify(secondBody)}`);

  // The run panel streams in over SSE and resolves failed at the suite's own
  // kill-switch preflight, with the verdict row rendered.
  await page.locator('.le-run').waitFor({ timeout: 15000 });
  await page.locator('.le-run .ap-state', { hasText: 'failed' }).waitFor({ timeout: 90000 });
  const assertRows = await page.locator('.le-asserts li').allTextContents();
  check('failed preflight verdict rows render in the run panel',
    assertRows.some((t) => /kill switch/.test(t)), JSON.stringify(assertRows));
  check('overall verdict line renders', /FAIL/.test(await page.locator('.le-verdict').textContent() || ''));
  check('live tail streamed', ((await page.locator('.le-tail').textContent()) || '').includes('live preflight'));

  // With the run terminal AND the precondition restored, Start re-enables.
  await api('/api/autopilot/config', { method: 'POST', body: JSON.stringify({ Enabled: true }) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.ap-tabs button, nav button', { hasText: '🧪 Tests' }).first().click();
  await page.locator('.ap-subtabs button', { hasText: 'E2E eval' }).click();
  await page.locator('.le-row').first().waitFor({ timeout: 10000 });
  await page.locator('.le-row button:not(:disabled)', { hasText: 'Start' }).first()
    .waitFor({ timeout: 15000 });
  check('Start re-enabled after the run resolved (and preconditions green again)', true);
  await page.screenshot({ path: OUT, fullPage: true });

  check('no browser console errors', errs.length === 0, JSON.stringify(errs));
  await adv.close();
} catch (e) {
  check('browser verification ran to completion', false, e?.stack || String(e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  rmSync(join(os.tmpdir(), 'cw-loopeval-ui'), { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
}

const pass = results.length > 0 && results.every((r) => r.ok);
console.log(pass ? `\nPASS: loopeval UI (${results.length} checks) — screenshot ${OUT}` : '\nFAIL: loopeval UI');
process.exit(pass ? 0 : 1);
