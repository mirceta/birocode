// Browser-verify the dock OpenSpec lane (openspec add-dock-openspec-lane,
// tasks 4.2 / 4.3 / 4.4) per docs/claude-web/browser-testing.md — against a
// DISPOSABLE instance this script boots itself (own CLAUDEWEB_DATADIR), never
// live. Fixture: three registered temp repos — oslane-a (openspec/ dir present
// → full Cockpit), oslane-b (no openspec/ → not-ready panel), oslane-global
// (the global selector's repo) — and dock tabs for A + B only.
//
//   4.2  Advanced mode: the 🛰️ OpenSpec lane shows on a dock, selecting it
//        renders the Cockpit over the chat with the composer still below, and
//        selecting another lane swaps away (mutual exclusion).
//   4.3  Dock A and dock B each show THEIR OWN repo's OpenSpec state at the
//        same time (full cockpit vs not-ready, each naming its repo) while the
//        global selection is a third repo; switching the global selector to
//        oslane-b in the Projects tab does not re-scope dock A's lane.
//   4.4  Basic mode: no 🛰️ OpenSpec lane anywhere (the flag — and the whole
//        agent dock surface — is Advanced-gated).
//
//   node .claudeweb-preview/playwright/verify-dock-openspec-lane.mjs

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
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

const PORT = Number(process.env.OSLANE_PORT || 5218);
const BASE = `http://localhost:${PORT}`;
const PW = 'oslane-pw-7141';
const ROOT = join(os.tmpdir(), 'cw-oslane');
const DATADIR = join(ROOT, 'datadir');
const SHOT = (n) => join(REPO, '.claudeweb-preview', `out-oslane-${n}.png`);
const LANE = '🛰️ OpenSpec';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 400)}`);
};
const health = async () => {
  try { return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; }
  catch { return false; }
};
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, stdio: 'pipe' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`);
};

let pid = null;
let browser = null;
try {
  if (await health()) throw new Error(`something already answers on ${BASE} — set OSLANE_PORT`);
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(DATADIR, { recursive: true });

  // ---- fixture repos: A has openspec/, B does not, GLOBAL is the selector's ----
  const mkRepo = (name, withOpenspec) => {
    const dir = join(ROOT, name);
    mkdirSync(dir, { recursive: true });
    git(dir, 'init');
    git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'seed');
    if (withOpenspec) mkdirSync(join(dir, 'openspec', 'changes'), { recursive: true });
    return dir;
  };
  const dirA = mkRepo('oslane-a', true);
  const dirB = mkRepo('oslane-b', false);
  const dirG = mkRepo('oslane-global', false);

  // ---- boot the disposable instance ----
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
  console.log(`instance up on ${BASE} (pid ${pid})`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }),
  });
  const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1];
  if (!token) throw new Error(`login failed: http ${login.status}`);
  const api = (m, p, body) => fetch(`${BASE}${p}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', Cookie: `claudeweb_session=${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const reg = async (dir, name) => {
    const r = await api('POST', '/api/repos', { Folder: dir, Name: name, Visibility: 'advanced' });
    const j = await r.json();
    if (!j?.id) throw new Error(`repo registration failed (${name}): http ${r.status} ${JSON.stringify(j)}`);
    return j.id;
  };
  const idA = await reg(dirA, 'oslane-a');
  const idB = await reg(dirB, 'oslane-b');
  const idG = await reg(dirG, 'oslane-global');
  const mkTab = async (repoId, repoName) => {
    const r = await api('POST', '/api/dock', { repoId, repoName });
    const j = await r.json();
    if (!j?.id) throw new Error(`dock tab creation failed (${repoName}): http ${r.status} ${JSON.stringify(j)}`);
    return j.id;
  };
  await mkTab(idA, 'oslane-a');
  await mkTab(idB, 'oslane-b');

  browser = await chromium.launch();

  // Known-benign platform noise on bare fixture repos: the dock chat probes
  // understanding.md / plan.md and FileController answers 400 for a missing
  // file (documented contract). Match by URL so nothing else hides behind it.
  const BENIGN_MISSING_DOC = /\/api\/files\/read\?path=(understanding|plan)\.md/;
  const errs = [];
  const wire = (page, tag) => {
    const capture = (text, url) => {
      const line = `[${tag}] ${text}${url ? ` @ ${url}` : ''}`;
      if (BENIGN_MISSING_DOC.test(url || '') && /\b400\b/.test(text)) {
        console.log(`     (ignored benign: ${line})`);
        return;
      }
      errs.push(line);
    };
    page.on('console', (m) => { if (m.type() === 'error') capture(m.text(), m.location()?.url); });
    page.on('pageerror', (e) => capture('pageerror: ' + e.message, ''));
    page.on('response', (r) => { if (r.status() >= 400) capture(`http ${r.status()} ${r.request().method()}`, r.url()); });
  };

  // ============ Advanced-mode context (4.2 + 4.3) ============
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 } });
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }]);
  await ctx.addInitScript(([gid]) => {
    localStorage.setItem('claudeweb_ui_mode', 'advanced');
    localStorage.setItem('claudeweb_repo', gid); // seeds the per-tab global selection
    localStorage.setItem('claudeweb_dash_view', 'phones'); // full docks, not summary cards
  }, [idG]);
  const page = await ctx.newPage();
  wire(page, 'advanced');

  const openDash = async () => {
    await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.locator('.app-header__title--btn').click({ timeout: 15000 });
    try {
      await page.locator('.dash__grid .phone').first().waitFor({ timeout: 15000 });
    } catch (e) {
      await page.screenshot({ path: SHOT('debug'), fullPage: true });
      const dump = await page.evaluate(() => ({
        dashHeader: document.querySelectorAll('.dash__header').length,
        dashGrid: document.querySelectorAll('.dash__grid').length,
        gridChildren: [...document.querySelectorAll('.dash__grid > *')].map((el) => el.className).slice(0, 10),
        phones: document.querySelectorAll('.phone').length,
        bodyClasses: [...document.querySelectorAll('main > *, .app-content > *')].map((el) => el.className).slice(0, 10),
      }));
      const dock = await (await api('GET', '/api/dock')).json();
      throw new Error(`dash never showed cards: ${JSON.stringify(dump)} :: dock=${JSON.stringify(dock).slice(0, 300)} :: ${e.message}`);
    }
  };
  const card = (name) => page.locator('.dash__grid .phone').filter({
    has: page.locator('.phone__name', { hasText: name }),
  });

  await openDash();
  const cardA = card('oslane-a');
  const cardB = card('oslane-b');
  check('both fixture docks render on the dashboard',
    (await cardA.count()) === 1 && (await cardB.count()) === 1,
    `A=${await cardA.count()} B=${await cardB.count()}`);

  // ---- 4.2 lane appears + Cockpit over chat + composer below ----
  const laneA = cardA.locator('.phone__lane', { hasText: 'OpenSpec' });
  check('4.2 OpenSpec lane button present on the dock (Advanced)', (await laneA.count()) === 1,
    `count=${await laneA.count()}`);
  await laneA.click();
  await cardA.locator('.ck').waitFor({ timeout: 15000 });
  check('4.2 selecting the lane shows the Cockpit in the dock', true);
  check('4.2 lane is aria-selected while the Cockpit shows',
    (await laneA.getAttribute('aria-selected')) === 'true');
  check('4.2 composer still available below the Cockpit',
    (await cardA.locator('textarea').count()) > 0,
    'no textarea in the card while the Cockpit is open');

  // Mutual exclusion: picking the chat lane swaps the Cockpit away.
  await cardA.locator('.phone__lane').first().click();
  await cardA.locator('.ck').waitFor({ state: 'detached', timeout: 10000 });
  check('4.2 selecting another lane swaps the Cockpit away', true);
  check('4.2 lane deselected after the swap',
    (await laneA.getAttribute('aria-selected')) === 'false');

  // ---- 4.3 per-dock scope, global selection elsewhere ----
  await laneA.click();
  await cardA.locator('.ck').waitFor({ timeout: 15000 });
  const laneB = cardB.locator('.phone__lane', { hasText: 'OpenSpec' });
  await laneB.click();
  await cardB.locator('.ck').waitFor({ timeout: 15000 });

  const repoOnA = (await cardA.locator('.ck__repo').textContent() || '').trim();
  const repoOnB = (await cardB.locator('.ck__repo').textContent() || '').trim();
  check('4.3 dock A cockpit is scoped to oslane-a', repoOnA === 'oslane-a', `header=${repoOnA}`);
  check('4.3 dock B cockpit is scoped to oslane-b', repoOnB === 'oslane-b', `header=${repoOnB}`);
  check('4.3 dock A (openspec/ present) renders the ready cockpit',
    (await cardA.locator('.ck__prep--ok').count()) === 1 && (await cardA.locator('.ck__legend').count()) === 1,
    `prep-ok=${await cardA.locator('.ck__prep--ok').count()} legend=${await cardA.locator('.ck__legend').count()}`);
  check('4.3 dock B (no openspec/) renders the not-ready panel naming oslane-b',
    (await cardB.locator('.ck__prep--bad').count()) === 1 &&
    /oslane-b/.test(await cardB.locator('.ck__prep').textContent() || ''),
    await cardB.locator('.ck__prep').textContent().catch(() => ''));
  await page.screenshot({ path: SHOT('two-docks'), fullPage: true });

  // Switch the global selector to oslane-b in the Projects tab, come back,
  // re-open dock A's lane: it must still be scoped to oslane-a.
  await page.goto(`${BASE}/studio/projects`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('.project-card', { hasText: 'oslane-b' }).first().click();
  await page.locator('.project-card', { hasText: 'oslane-b' }).locator('.project-card__badge--active')
    .waitFor({ timeout: 10000 });
  await openDash();
  await card('oslane-a').locator('.phone__lane', { hasText: 'OpenSpec' }).click();
  await card('oslane-a').locator('.ck').waitFor({ timeout: 15000 });
  const repoOnAAfter = (await card('oslane-a').locator('.ck__repo').textContent() || '').trim();
  check('4.3 global selector switch does not re-scope dock A\'s lane',
    repoOnAAfter === 'oslane-a', `header=${repoOnAAfter}`);
  await page.screenshot({ path: SHOT('after-switch'), fullPage: true });
  await ctx.close();

  // ============ Basic-mode context (4.4) ============
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 1200 } });
  await ctxB.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }]);
  // no ui-mode init script: default is Basic
  const pageB = await ctxB.newPage();
  wire(pageB, 'basic');
  await pageB.goto(`${BASE}/studio`, { waitUntil: 'networkidle', timeout: 20000 });
  check('4.4 Basic mode renders no OpenSpec lane anywhere',
    (await pageB.locator('.phone__lane', { hasText: 'OpenSpec' }).count()) === 0);
  check('4.4 Basic mode has no dashboard opener (agent docks themselves are Advanced)',
    (await pageB.locator('.app-header__title--btn').count()) === 0);
  await pageB.screenshot({ path: SHOT('basic'), fullPage: true });
  await ctxB.close();

  check('no browser console errors', errs.length === 0, JSON.stringify(errs).slice(0, 600));
} catch (e) {
  check('browser verification ran to completion', false, e?.stack || String(e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  rmSync(ROOT, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
}

const pass = results.length > 0 && results.every((r) => r.ok);
console.log(`@@OSLANE@@ ${JSON.stringify({ pass, checks: results })}`);
console.log(pass ? `\nPASS: dock OpenSpec lane (${results.length} checks) — screenshots ${SHOT('*')}` : '\nFAIL: dock OpenSpec lane');
process.exit(pass ? 0 : 1);
