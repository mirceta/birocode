// Verify local-app-lifecycle-controls (openspec, tasks 4.1/4.1b/4.2) against a
// DISPOSABLE harness instance this script boots itself (own CLAUDEWEB_DATADIR,
// never live). Fixture repo `lac-a` holds real tiny node apps:
//   miniapp  (:5361) — server writing pid.txt each boot; build.mjs sleeps ~2s,
//                      appends builds.log, prints MINIAPP BUILD OK, exit 0
//   miniapp2 (:5362) — buildfail.mjs prints BOOM, exit 3
//   miniapp3 (:5363) — backfill target: blatant package.json build script,
//                      imported WITHOUT a buildCommand
//   (:5364)          — row with no start/build command (UI gating)
//   (:PORT)          — a finding claiming the harness's own port (self-guard)
//
// API section: buildCommand threading, stop (outside-started listener, dead
// port, un-cached port, harness self-guard), restart (plain start + real cycle
// with a new PID, no-command rejection), rebuild (success w/ output + exit 0,
// failure w/ exit 3, start-or-join, no-command rejection), backfill
// (nothing-to-do fast paths + a REAL gateway run filling only the missing
// buildCommand, all other cache fields byte-identical), event emissions.
// UI section (Playwright): per-row gating, Stop flips the dot, rebuild chip +
// captured output, export JSON round-trips buildCommand through import, and
// the panel's activity section shows the phases live and after reopen.
//
//   node .claudeweb-preview/playwright/verify-localapp-lifecycle.mjs
//   (set LAC_SKIP_BACKFILL=1 to skip the real-gateway backfill check)

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

const PORT = Number(process.env.LAC_PORT || 5223);
const BASE = `http://localhost:${PORT}`;
const PW = 'lac-pw-4711';
const ROOT = join(os.tmpdir(), 'cw-lac');
const DATADIR = join(ROOT, 'datadir');
const APP_A = 5361; // miniapp: server + ok build
const APP_B = 5362; // miniapp2: failing build
const APP_C = 5363; // miniapp3: backfill target
const APP_X = 5364; // no commands at all
const SHOT = (n) => join(REPO, '.claudeweb-preview', `out-lac-${n}.png`);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 500)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const health = async () => {
  try { return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; }
  catch { return false; }
};
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, stdio: 'pipe' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`);
};
const alive = (p) => { try { process.kill(p, 0); return true; } catch { return false; } };

let pid = null;
let browser = null;
const spawnedApps = []; // node child PIDs this script started directly
try {
  if (await health()) throw new Error(`something already answers on ${BASE} — set LAC_PORT`);
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(DATADIR, { recursive: true });

  // ---- fixture repos ----
  const mkRepo = (name) => {
    const dir = join(ROOT, name);
    mkdirSync(dir, { recursive: true });
    git(dir, 'init');
    git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'seed');
    return dir;
  };
  const dirA = mkRepo('lac-a');
  const dirB = mkRepo('lac-b');

  const serveSrc = (port) => `
import http from 'node:http';
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./pid.txt', import.meta.url), String(process.pid));
http.createServer((req, res) => { res.end('miniapp ok'); }).listen(${port}, '127.0.0.1');
`;
  const miniapp = join(dirA, 'miniapp');
  mkdirSync(miniapp);
  writeFileSync(join(miniapp, 'serve.mjs'), serveSrc(APP_A));
  writeFileSync(join(miniapp, 'build.mjs'), `
import { appendFileSync } from 'node:fs';
appendFileSync(new URL('./builds.log', import.meta.url), new Date().toISOString() + '\\n');
console.log('MINIAPP BUILD START');
await new Promise((r) => setTimeout(r, 2000));
console.log('MINIAPP BUILD OK');
`);
  const miniapp2 = join(dirA, 'miniapp2');
  mkdirSync(miniapp2);
  writeFileSync(join(miniapp2, 'serve.mjs'), serveSrc(APP_B));
  writeFileSync(join(miniapp2, 'buildfail.mjs'), `
console.error('BOOM: fixture build failure');
process.exit(3);
`);
  const miniapp3 = join(dirA, 'miniapp3');
  mkdirSync(miniapp3);
  writeFileSync(join(miniapp3, 'serve.mjs'), serveSrc(APP_C));
  writeFileSync(join(miniapp3, 'package.json'), JSON.stringify({
    name: 'miniapp3',
    scripts: { build: 'node build.mjs' },
  }, null, 2));
  writeFileSync(join(miniapp3, 'build.mjs'), 'console.log("miniapp3 build");');
  writeFileSync(join(miniapp3, 'README.md'),
    '# miniapp3\n\nLocal app on port 5363. Build the servable artifacts with `npm run build` (from this folder).\n');

  // ---- boot the disposable instance ----
  const exe = join(REPO, '.claudeweb-preview', 'bin', 'ClaudeWeb.exe');
  const child = spawn(exe, [], {
    cwd: join(REPO, '.claudeweb-preview', 'bin'), detached: true, stdio: 'ignore',
    env: { ...process.env, CLAUDEWEB_DATADIR: DATADIR, CLAUDEWEB_Port: String(PORT), CLAUDEWEB_AuthPassword: PW },
  });
  child.unref();
  pid = child.pid;
  let up = false;
  for (let i = 0; i < 45 && !up; i++) { up = await health(); if (!up) await sleep(1000); }
  if (!up) throw new Error('instance never became healthy');
  console.log(`instance up on ${BASE} (pid ${pid})`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }),
  });
  const token = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1];
  if (!token) throw new Error(`login failed: http ${login.status}`);
  const api = async (m, p, body, repoId) => {
    const r = await fetch(`${BASE}${p}`, {
      method: m,
      headers: {
        'Content-Type': 'application/json',
        Cookie: `claudeweb_session=${token}`,
        ...(repoId ? { 'X-Repo-Id': repoId } : {}),
      },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    let j = null;
    try { j = await r.json(); } catch { /* empty body */ }
    return { status: r.status, j };
  };

  const reg = async (dir, name) => {
    const { status, j } = await api('POST', '/api/repos', { Folder: dir, Name: name, Visibility: 'advanced' });
    if (!j?.id) throw new Error(`repo registration failed (${name}): http ${status} ${JSON.stringify(j)}`);
    return j.id;
  };
  const repoA = await reg(dirA, 'lac-a');
  const repoB = await reg(dirB, 'lac-b');

  // ============================ API SECTION ============================

  // ---- backfill nothing-to-do: no cache (before anything is imported) ----
  {
    const { j } = await api('POST', '/api/local-apps/backfill-build-commands', {}, repoA);
    check('backfill with no cache reports nothing-to-do/no-cache',
      j?.status === 'nothing-to-do' && j?.reason === 'no-cache', JSON.stringify(j));
  }

  // ---- seed the cache via import (no agent needed) ----
  const findings = [
    { name: 'miniapp', port: APP_A, folder: 'miniapp', evidence: 'miniapp/serve.mjs:5', startCommand: 'node serve.mjs', buildCommand: 'node build.mjs' },
    { name: 'miniapp2', port: APP_B, folder: 'miniapp2', evidence: 'miniapp2/serve.mjs:5', startCommand: 'node serve.mjs', buildCommand: 'node buildfail.mjs' },
    { name: 'miniapp3', port: APP_C, folder: 'miniapp3', evidence: 'miniapp3/serve.mjs:5', startCommand: 'node serve.mjs' },
    { name: 'no-commands', port: APP_X, folder: 'miniapp2', evidence: 'miniapp2/serve.mjs:5' },
    { name: 'harness-self', port: PORT, folder: '.', evidence: 'self:1', startCommand: 'echo no', buildCommand: 'echo no' },
  ];
  {
    const { status, j } = await api('POST', '/api/local-apps/cache/import', JSON.stringify(findings), repoA);
    const apps = j?.apps || [];
    const byPort = Object.fromEntries(apps.map((a) => [a.port, a]));
    check('import seeds the cache and rows carry buildCommand',
      status === 200 && apps.length === 5
        && byPort[APP_A]?.buildCommand === 'node build.mjs'
        && byPort[APP_C]?.buildCommand === ''
        && byPort[APP_X]?.startCommand === '',
      JSON.stringify(j).slice(0, 300));
  }
  const statusOf = async () => (await api('GET', '/api/local-apps/discover/status', undefined, repoA)).j;
  const rowOf = async (port) => ((await statusOf())?.apps || []).find((a) => a.port === port);

  // ---- stop an app the harness never started ----
  {
    const proc = spawn(process.execPath, ['serve.mjs'], { cwd: miniapp, detached: true, stdio: 'ignore' });
    proc.unref();
    spawnedApps.push(proc.pid);
    let row = null;
    for (let i = 0; i < 20 && !row?.running; i++) { await sleep(500); row = await rowOf(APP_A); }
    check('hand-started listener shows running=true', !!row?.running, JSON.stringify(row));
    const nodePid = Number(readFileSync(join(miniapp, 'pid.txt'), 'utf8'));

    const { status, j } = await api('POST', '/api/local-apps/stop', { port: APP_A }, repoA);
    let stopped = false;
    for (let i = 0; i < 20 && !stopped; i++) { await sleep(500); stopped = !(await rowOf(APP_A))?.running; }
    check('stop kills the outside-started listener (port frees, process gone)',
      status === 200 && j?.ok === true && stopped && !alive(nodePid),
      `http ${status} ${JSON.stringify(j)} stopped=${stopped} alive=${alive(nodePid)}`);
  }

  // ---- stop with nothing listening ----
  {
    const { status, j } = await api('POST', '/api/local-apps/stop', { port: APP_A }, repoA);
    check('stop on a dead port is an explicit error',
      status === 400 && /listening/i.test(j?.error || ''), `http ${status} ${JSON.stringify(j)}`);
  }

  // ---- stop a port that is listening but NOT a cached finding ----
  {
    const net = await import('node:net');
    const squatter = net.createServer(() => {});
    await new Promise((r) => squatter.listen(5399, '127.0.0.1', r));
    const { status, j } = await api('POST', '/api/local-apps/stop', { port: 5399 }, repoA);
    const stillUp = squatter.listening;
    squatter.close();
    check('stop on an un-cached port is rejected and touches nothing',
      status === 400 && /no discovered app/i.test(j?.error || '') && stillUp,
      `http ${status} ${JSON.stringify(j)} stillUp=${stillUp}`);
  }

  // ---- the harness never stops itself ----
  {
    const { status, j } = await api('POST', '/api/local-apps/stop', { port: PORT }, repoA);
    const healthy = await health();
    check('self-guard: stopping the harness port is refused and the harness survives',
      status === 400 && /harness/i.test(j?.error || '') && healthy,
      `http ${status} ${JSON.stringify(j)} healthy=${healthy}`);
  }

  // ---- restart: not running -> plain start; running -> new PID ----
  {
    const r1 = await api('POST', '/api/local-apps/restart', { port: APP_A }, repoA);
    let row = null;
    for (let i = 0; i < 20 && !row?.running; i++) { await sleep(500); row = await rowOf(APP_A); }
    const pid1 = Number(readFileSync(join(miniapp, 'pid.txt'), 'utf8'));
    check('restart on a stopped app is a plain start',
      r1.status === 200 && !!row?.running && pid1 > 0, `http ${r1.status} ${JSON.stringify(r1.j)}`);

    const r2 = await api('POST', '/api/local-apps/restart', { port: APP_A }, repoA);
    let pid2 = pid1;
    for (let i = 0; i < 24 && pid2 === pid1; i++) {
      await sleep(500);
      try { pid2 = Number(readFileSync(join(miniapp, 'pid.txt'), 'utf8')); } catch { /* mid-swap */ }
    }
    row = null;
    for (let i = 0; i < 20 && !row?.running; i++) { await sleep(500); row = await rowOf(APP_A); }
    check('restart on a running app cycles the process (new PID, port live)',
      r2.status === 200 && pid2 !== pid1 && !!row?.running && !alive(pid1),
      `http ${r2.status} pid1=${pid1} pid2=${pid2} running=${row?.running}`);
  }

  // ---- restart / run / rebuild without the needed command ----
  {
    const r = await api('POST', '/api/local-apps/restart', { port: APP_X }, repoA);
    check('restart without a start command is rejected',
      r.status === 400 && /start command/i.test(r.j?.error || ''), JSON.stringify(r.j));
    const b = await api('POST', '/api/local-apps/rebuild', { port: APP_C }, repoA);
    check('rebuild without a build command is rejected',
      b.status === 400 && /build command/i.test(b.j?.error || ''), JSON.stringify(b.j));
  }

  // ---- rebuild: success + captured output, start-or-join, app untouched ----
  {
    const pidBefore = Number(readFileSync(join(miniapp, 'pid.txt'), 'utf8'));
    const [r1, r2] = await Promise.all([
      api('POST', '/api/local-apps/rebuild', { port: APP_A }, repoA),
      api('POST', '/api/local-apps/rebuild', { port: APP_A }, repoA),
    ]);
    check('concurrent rebuilds start-or-join one job',
      r1.status === 200 && r2.status === 200
        && r1.j?.rebuild?.startedAt === r2.j?.rebuild?.startedAt,
      `${JSON.stringify(r1.j?.rebuild)} vs ${JSON.stringify(r2.j?.rebuild)}`);

    let rb = null;
    for (let i = 0; i < 30 && rb?.status !== 'succeeded' && rb?.status !== 'failed'; i++) {
      await sleep(500);
      rb = (await rowOf(APP_A))?.rebuild;
    }
    const builds = readFileSync(join(miniapp, 'builds.log'), 'utf8').trim().split('\n');
    check('rebuild succeeds with exit 0 and captured output (job survived the finished requests)',
      rb?.status === 'succeeded' && rb?.exitCode === 0 && /MINIAPP BUILD OK/.test(rb?.output || ''),
      JSON.stringify(rb).slice(0, 300));
    check('start-or-join ran the build exactly once', builds.length === 1, `builds.log lines=${builds.length}`);
    const pidAfter = Number(readFileSync(join(miniapp, 'pid.txt'), 'utf8'));
    const row = await rowOf(APP_A);
    check('rebuild does not stop or restart the server', pidAfter === pidBefore && !!row?.running,
      `pidBefore=${pidBefore} pidAfter=${pidAfter} running=${row?.running}`);
  }

  // ---- rebuild: honest failure ----
  {
    await api('POST', '/api/local-apps/rebuild', { port: APP_B }, repoA);
    let rb = null;
    for (let i = 0; i < 20 && rb?.status !== 'failed' && rb?.status !== 'succeeded'; i++) {
      await sleep(500);
      rb = (await rowOf(APP_B))?.rebuild;
    }
    check('failing build reports failed with exit code and output',
      rb?.status === 'failed' && rb?.exitCode === 3 && /BOOM/.test(rb?.output || ''),
      JSON.stringify(rb).slice(0, 300));
  }

  // ---- backfill nothing-to-do: none missing (repo B) ----
  {
    await api('POST', '/api/local-apps/cache/import',
      JSON.stringify([{ name: 'full', port: 5390, folder: '.', evidence: 'x:1', startCommand: 'echo hi', buildCommand: 'echo build' }]), repoB);
    const { j } = await api('POST', '/api/local-apps/backfill-build-commands', {}, repoB);
    check('backfill with nothing missing reports nothing-to-do/none-missing',
      j?.status === 'nothing-to-do' && j?.reason === 'none-missing', JSON.stringify(j));
  }

  // ---- backfill for real (gateway on :5123): fills ONLY miniapp3 ----
  if (process.env.LAC_SKIP_BACKFILL === '1') {
    console.log('skip - real-gateway backfill (LAC_SKIP_BACKFILL=1)');
  } else {
    const before = (await statusOf())?.apps || [];
    // Two findings lack a buildCommand: miniapp3 (blatant package.json) and the
    // no-commands row (nothing to find) — the ask must enumerate exactly those.
    const { j: started } = await api('POST', '/api/local-apps/backfill-build-commands', {}, repoA);
    check('backfill enumerates exactly the findings missing a build command',
      started?.status === 'started' && started?.backfill?.status === 'running' && started?.backfill?.asked === 2,
      JSON.stringify(started));

    let bf = started?.backfill;
    for (let i = 0; i < 360 && bf?.status === 'running'; i++) {
      await sleep(1000);
      bf = (await statusOf())?.backfill;
    }
    check('backfill job completes (real agent run)', bf?.status === 'done', JSON.stringify(bf));

    const after = (await statusOf())?.apps || [];
    const b3 = after.find((a) => a.port === APP_C);
    check('backfill fills miniapp3 buildCommand from its package.json',
      !!b3?.buildCommand && /build/.test(b3.buildCommand), JSON.stringify(b3));
    // Enumerated rows (APP_C, APP_X) may change ONLY buildCommand; everything
    // else — including un-enumerated rows entirely — must be byte-identical.
    const enumerated = new Set([APP_C, APP_X]);
    const untouched = before.every((a) => {
      const now = after.find((x) => x.port === a.port);
      return now && now.name === a.name && now.folder === a.folder && now.evidence === a.evidence
        && now.startCommand === a.startCommand && now.discoveredAt === a.discoveredAt
        && (enumerated.has(a.port) || now.buildCommand === a.buildCommand);
    });
    check('backfill merge is surgical (only enumerated buildCommands changed; all discovery times kept)',
      untouched, JSON.stringify({ untouched }));
  }

  // ---- event log carries the lifecycle phases (activity feed source) ----
  {
    const { j } = await api('GET', `/api/repos/${repoA}/events?after=-1`);
    const evs = j?.events || [];
    const has = (op, phase, re) => evs.some((e) => e.op === op && e.phase === phase && re.test(e.detail + e.title));
    check('events: stop emitted started (with PID) and done',
      has('stop', 'started', /PID \d+/) && has('stop', 'done', /terminated/i), `n=${evs.length}`);
    check('events: restart phases + rebuild outcomes present',
      has('restart', 'done', /launch issued/i) && has('rebuild', 'started', /running/i)
        && has('rebuild', 'done', /succeeded/i) && has('rebuild', 'error', /exit 3/), `n=${evs.length}`);
  }

  // ============================ UI SECTION ============================

  const mkTab = async (rid, repoName) => {
    const { status, j } = await api('POST', '/api/dock', { repoId: rid, repoName });
    if (!j?.id) throw new Error(`dock tab creation failed (${repoName}): http ${status}`);
    return j.id;
  };
  await mkTab(repoA, 'lac-a');
  await mkTab(repoB, 'lac-b');

  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1400 } });
  await ctx.addCookies([{ name: 'claudeweb_session', value: token, url: BASE }]);
  await ctx.addInitScript(([rid]) => {
    localStorage.setItem('claudeweb_ui_mode', 'advanced');
    localStorage.setItem('claudeweb_repo', rid);
    localStorage.setItem('claudeweb_dash_view', 'phones');
  }, [repoA]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('.app-header__title--btn').click({ timeout: 15000 });
  const card = page.locator('.dash__grid .phone').filter({
    has: page.locator('.phone__name', { hasText: 'lac-a' }),
  });
  await card.waitFor({ timeout: 15000 });

  const openPanel = async () => {
    await card.locator('.phone__discover-btn--panel').click();
    await card.locator('.phone__discover-panel').waitFor({ timeout: 10000 });
    // Panel auto-loads the cache when the job registry is idle; rows land async.
    await card.locator('.phone__discover-list li').first().waitFor({ timeout: 15000 });
  };
  await openPanel();
  const row = (port) => card.locator('.phone__discover-list li').filter({
    has: page.locator('.phone__discover-port', { hasText: `:${port}` }),
  });

  // Row gating: no commands at all -> Run/Restart/Rebuild disabled, no Stop.
  {
    const rx = row(APP_X);
    check('UI: no-command row disables Run, Restart and Rebuild',
      await rx.locator('.phone__discover-run').isDisabled()
        && await rx.locator('.phone__discover-restart').isDisabled()
        && await rx.locator('.phone__discover-rebuild').isDisabled()
        && (await rx.locator('.phone__discover-stop').count()) === 0);
  }

  // Running row (miniapp is up from the API section): Stop shown, Run hidden.
  {
    const ra = row(APP_A);
    await ra.locator('.phone__discover-stop').waitFor({ timeout: 15000 });
    check('UI: running row offers Stop and hides Run',
      (await ra.locator('.phone__discover-run').count()) === 0
        && (await ra.locator('.phone__discover-stop').count()) === 1);

    // Click Stop: the dot flips off and the activity section shows the phases
    // WITHOUT reopening the panel (D8's "did my click do anything?").
    await ra.locator('.phone__discover-stop').click();
    await ra.locator('.phone__discover-dot:not(.phone__discover-dot--on)').waitFor({ timeout: 20000 });
    check('UI: Stop flips the running dot off', true);
    const activity = card.locator('[data-testid="discover-activity"]');
    await activity.locator('.phone__discover-activity-item', { hasText: 'Stop · miniapp' })
      .first().waitFor({ timeout: 15000 });
    check('UI: activity section shows the Stop phases without reopening', true);
  }

  // Rebuild from the row: chip appears, lands on "build ok", output expandable.
  {
    const ra = row(APP_A);
    await ra.locator('.phone__discover-rebuild').click();
    await ra.locator('.phone__discover-buildchip--succeeded').waitFor({ timeout: 30000 });
    await ra.locator('.phone__discover-buildchip').click();
    const out = await ra.locator('.phone__discover-buildout').textContent();
    check('UI: rebuild chip lands on success and exposes the captured output',
      /MINIAPP BUILD OK/.test(out || ''), (out || '').slice(0, 120));
  }

  // Export round-trips buildCommand through import (repo B via API).
  {
    await card.locator('.phone__discover-btn', { hasText: 'Export' }).click();
    const exported = await card.locator('.phone__discover-export-text').inputValue();
    const parsed = JSON.parse(exported);
    const expA = parsed.apps.find((a) => a.port === APP_A);
    check('UI: export JSON carries buildCommand and no machine-local fields',
      expA?.buildCommand === 'node build.mjs' && !('running' in expA) && !('rebuild' in expA) && !('discoveredAt' in expA),
      JSON.stringify(expA));
    const imp = await api('POST', '/api/local-apps/cache/import', exported, repoB);
    const impA = (imp.j?.apps || []).find((a) => a.port === APP_A);
    check('UI: exported JSON imports on another repo with buildCommand intact',
      imp.status === 200 && impA?.buildCommand === 'node build.mjs', JSON.stringify(impA));
    await card.locator('.phone__discover-btn', { hasText: /Close|Kapat/ }).click();
  }

  // Reopen the panel: earlier activity is still there (server-side log).
  {
    await card.locator('.phone__discover-panel-close').click();
    await openPanel();
    const items = card.locator('[data-testid="discover-activity"] .phone__discover-activity-item');
    await items.first().waitFor({ timeout: 15000 });
    check('UI: reopening still shows earlier activity (server-side history)',
      (await items.count()) > 0 && (await items.allTextContents()).some((t) => /Stop · miniapp/.test(t)));
  }

  await page.screenshot({ path: SHOT('panel'), fullPage: true });
  check('no page errors', errs.length === 0, errs.join(' | '));
} catch (e) {
  check('script completed', false, e.stack || String(e));
} finally {
  if (browser) await browser.close().catch(() => {});
  // Kill any fixture server still listening (started by us OR relaunched
  // detached by the harness) — resolve live from the ports, like Stop does.
  for (const port of [APP_A, APP_B, APP_C]) {
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command',
      `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`],
      { stdio: 'pipe' });
    const owner = parseInt(String(r.stdout).trim(), 10);
    if (owner > 0) spawnSync('taskkill', ['/PID', String(owner), '/T', '/F'], { stdio: 'ignore' });
  }
  for (const p of spawnedApps) { try { process.kill(p, 0); spawnSync('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  if (pid) { try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
  await sleep(500);
  try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* locked file; temp dir */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
