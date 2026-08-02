// Browser-verify the Tests-tab scenario transparency disclosures (openspec
// loop-eval-scenario-transparency, task 4.2) per
// docs/claude-web/browser-testing.md — against a DISPOSABLE instance this
// script boots itself, never live. Purely read-only on the eval side: the
// kill switch stays OFF, no run is ever started, zero agent turns.
//
// Checks:
//   1. Each scenario row has the collapsed "what does this test?" disclosure
//   2. goal: Arms (kind/mode/cap/deadline) + the verbatim goal prompt,
//      Acts on (fixture template path + files), Must hold (assertion list)
//   3. queue: deny list rendered + the 6-prompt → artifact table
//   4. run-all: composes the two child manifests as stacked sub-sections
//   5. Graceful degrade: break goal.mjs's --describe JSON on disk → preflight
//      serves manifestError, the row still lists, the disclosure shows the
//      error note; restore → manifest is back (mtime invalidation, live)
//
// The instance runs FROM .claudeweb-preview/bin (inside the repo tree) ON
// PURPOSE — Program.FindRepoRoot self-pins this checkout, so the runner
// service resolves tests/loop-eval/ and its --describe like real self-dev.
//
//   node .claudeweb-preview/playwright/verify-loopeval-manifest.mjs

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
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
const PORT = Number(process.env.LOOPEVALUI_PORT || 5213);
const BASE = `http://localhost:${PORT}`;
const PW = 'loopevalman-pw-3319';
const DATADIR = join(os.tmpdir(), 'cw-loopeval-manifest', 'datadir');
const OUT = join(REPO, '.claudeweb-preview', 'out-loopeval-manifest.png');
const GOAL_SCRIPT = join(REPO, 'tests', 'loop-eval', 'goal.mjs');

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
const goalOriginal = readFileSync(GOAL_SCRIPT, 'utf8'); // restored in finally, no matter what
try {
  if (await health()) throw new Error(`something already answers on ${BASE} — set LOOPEVALUI_PORT`);
  rmSync(join(os.tmpdir(), 'cw-loopeval-manifest'), { recursive: true, force: true });
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
  const api = (p) => fetch(`${BASE}${p}`, { headers: { Cookie: `claudeweb_session=${token}` } });

  // ---- API layer first: the preflight payload carries the manifests ----
  const pre = await (await api('/api/loopeval/preflight')).json();
  const byId = Object.fromEntries((pre.scenarios || []).map((s) => [s.id, s]));
  check('preflight: all 3 scenarios carry a manifest, no manifestError',
    ['goal', 'queue', 'run-all'].every((id) => byId[id]?.manifest && !byId[id]?.manifestError),
    JSON.stringify(Object.fromEntries(Object.entries(byId).map(([k, v]) => [k, v.manifestError || !!v.manifest]))));
  check('goal manifest: loop params from the suite constants',
    byId.goal?.manifest?.loop?.kind === 'goal' && byId.goal?.manifest?.loop?.maxIterations === 6
      && /Implement the missing/.test(byId.goal?.manifest?.loop?.goal || ''),
    JSON.stringify(byId.goal?.manifest?.loop || {}).slice(0, 200));
  check('queue manifest: 6 prompts with path+pattern, deny list, verify on',
    byId.queue?.manifest?.loop?.prompts?.length === 6
      && byId.queue.manifest.loop.prompts.every((p) => p.prompt && p.path && p.pattern)
      && byId.queue.manifest.loop.denyList?.length === 2 && byId.queue.manifest.loop.verifyEnabled === true,
    JSON.stringify(byId.queue?.manifest?.loop || {}).slice(0, 200));
  check('run-all manifest composes the two children',
    byId['run-all']?.manifest?.composes?.map((m) => m.id).join(',') === 'goal,queue',
    JSON.stringify(byId['run-all']?.manifest || {}).slice(0, 200));
  check('served titles come from the manifests',
    byId.goal?.title === byId.goal?.manifest?.title, `${byId.goal?.title} vs ${byId.goal?.manifest?.title}`);

  // ---- UI layer: the disclosures ----
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1600 } });
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }]);
  await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const openEval = async () => {
    await page.goto(`${BASE}/studio/autopilot`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.locator('.ap-tabs button, nav button', { hasText: '🧪 Tests' }).first().click();
    await page.locator('.ap-subtabs button', { hasText: 'E2E eval' }).click();
    await page.locator('.le-row').first().waitFor({ timeout: 10000 });
  };
  await openEval();

  check('every row has a collapsed "what does this test?" toggle',
    (await page.locator('.le-man__toggle').count()) === 3
      && (await page.locator('.le-man').count()) === 0);

  // goal row
  const goalRow = page.locator('.le-row', { hasText: 'Goal loop' });
  await goalRow.locator('.le-man__toggle').click();
  await goalRow.locator('.le-man').waitFor({ timeout: 5000 });
  const armsText = await goalRow.locator('.le-man__block', { hasText: 'Arms' }).textContent();
  check('goal Arms: kind, mode, cap, deadline',
    /goal/.test(armsText) && /drive/.test(armsText) && /iteration cap 6/.test(armsText) && /15 min/.test(armsText), armsText);
  await goalRow.locator('.le-man__goal summary').click();
  const goalQuote = await goalRow.locator('.le-man__goal blockquote').textContent();
  check('goal prompt shown verbatim', /Implement the missing `done` command/.test(goalQuote || ''), goalQuote);
  const actsText = await goalRow.locator('.le-man__block', { hasText: 'Acts on' }).textContent();
  check('goal Acts on: fixture template path + files + lifecycle',
    /tests\/loop-eval\/fixtures\/goal\/repo-template/.test(actsText) && /goal-check\.mjs/.test(actsText)
      && /torn down/.test(actsText), actsText);
  const mustHold = await goalRow.locator('.le-man__expected li').allTextContents();
  check('goal Must hold: the assertion contract list renders',
    mustHold.length >= 5 && mustHold.some((t) => /done · verified/.test(t)), JSON.stringify(mustHold));

  // queue row
  const queueRow = page.locator('.le-row', { hasText: 'Queue loop' });
  await queueRow.locator('.le-man__toggle').click();
  const qArms = queueRow.locator('.le-man__block', { hasText: 'Arms' });
  check('queue Arms: deny list terms rendered',
    /reset --hard/.test(await qArms.textContent()) && /force-push/.test(await qArms.textContent()));
  await queueRow.locator('.le-man__goal summary').click();
  check('queue prompt table: 6 rows mapping prompt → artifact',
    (await queueRow.locator('.le-man__prompts tbody tr').count()) === 6
      && /src\/add\.mjs/.test(await queueRow.locator('.le-man__prompts').textContent()));

  // run-all row
  const allRow = page.locator('.le-row', { hasText: 'Full sweep' });
  await allRow.locator('.le-man__toggle').click();
  check('run-all discloses two stacked child manifests',
    (await allRow.locator('.le-man__child').count()) === 2
      && /Goal loop/.test(await allRow.locator('.le-man__child').first().textContent()));
  await page.screenshot({ path: OUT, fullPage: true });

  // ---- graceful degrade: break goal.mjs's describe JSON, live ----
  writeFileSync(GOAL_SCRIPT, goalOriginal.replace(
    'if (L.describing) {',
    'if (L.describing) { console.log("NOT JSON {{{"); process.exit(0); } if (false) {'));
  const broken = await (await api('/api/loopeval/preflight')).json();
  const bGoal = (broken.scenarios || []).find((s) => s.id === 'goal');
  check('broken describe → manifestError served, scenario still listed',
    !!bGoal && !bGoal.manifest && /invalid JSON/.test(bGoal.manifestError || ''),
    JSON.stringify({ err: bGoal?.manifestError, hasManifest: !!bGoal?.manifest }));
  check('broken describe → title falls back to ScenarioDef', /Goal loop/.test(bGoal?.title || ''), bGoal?.title);
  await openEval();
  const gRow = page.locator('.le-row', { hasText: 'Goal loop' });
  await gRow.locator('.le-man__toggle').click();
  const note = await gRow.locator('.le-man .le-error').textContent({ timeout: 5000 });
  check('UI shows the graceful error note, not a crash',
    /could not describe itself/.test(note || '') && /Starting it still works/.test(note || ''), note);

  // restore → mtime invalidation brings the manifest back
  writeFileSync(GOAL_SCRIPT, goalOriginal);
  const healed = await (await api('/api/loopeval/preflight')).json();
  const hGoal = (healed.scenarios || []).find((s) => s.id === 'goal');
  check('restore → manifest back on the next preflight (mtime invalidation)',
    !!hGoal?.manifest && !hGoal.manifestError, hGoal?.manifestError);

  check('no browser console errors', errs.length === 0, JSON.stringify(errs));
  await ctx.close();
} catch (e) {
  check('browser verification ran to completion', false, e?.stack || String(e));
} finally {
  writeFileSync(GOAL_SCRIPT, goalOriginal); // never leave the suite broken
  if (browser) await browser.close().catch(() => {});
  if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  rmSync(join(os.tmpdir(), 'cw-loopeval-manifest'), { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
}

const pass = results.length > 0 && results.every((r) => r.ok);
console.log(pass ? `\nPASS: loopeval manifest UI (${results.length} checks) — screenshot ${OUT}` : '\nFAIL: loopeval manifest UI');
process.exit(pass ? 0 : 1);
