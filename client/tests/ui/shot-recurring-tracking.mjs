// Evidence for fleet task 933709ea (Recurring tab: prompt-driven AND tracking-only cards):
// render the Management App's Recurring tab against a MOCKED board — one prompt card with a
// run history, one tracking-only card naming a registered local app, one tracking card on a
// peer — and assert in the page: both kinds render, the tracking card is visibly distinct
// (kind pill, dashed card, no run strip / next line / history), its "Open harness" calls the
// SAME per-agent tab helper the Kanban badge uses (window.open with the agent's named tab +
// the /studio?agent= deep link, no reload), the app link is the localview path, the composer
// offers both kinds and validates the tracking form; screenshots.
//
//   node client/tests/ui/shot-recurring-tracking.mjs      (from the repo root or client/)

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', '.claudeweb-preview');
mkdirSync(OUT, { recursive: true });

const now = Date.now();
const H = 3_600_000;
const fleet = {
  at: now, hubVersion: '1.0.0+test',
  machines: [
    { machine: 'fotrsqlbirokrat', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', version: '1.0.0+test', acceptsSends: true, gateOpen: true, managedCount: 2,
      agents: [
        { handle: 'fotrsqlbirokrat/birokrat-web', key: 'self/web-1', repoId: 'web-1', name: 'birokrat-web', branch: 'main', defaultBranch: 'main', onDefault: true, managed: true, docked: true, exists: true },
        { handle: 'fotrsqlbirokrat/birocode', key: 'self/bc-1', repoId: 'bc-1', name: 'birocode', branch: 'main', defaultBranch: 'main', onDefault: true, managed: true, docked: true, exists: true },
      ] },
    { machine: 'razvoj2016', sourceId: 'src-razvoj', self: false, address: 'http://192.168.0.20:5099', reachable: true, status: 'ok', version: '1.0.0+test', acceptsSends: true, gateOpen: true, allowSends: true, managedCount: 1,
      agents: [{ handle: 'razvoj2016/bironext', key: 'src-razvoj/bn-1', repoId: 'bn-1', name: 'bironext', branch: 'main', defaultBranch: 'main', onDefault: true, managed: true, docked: true, exists: true }] },
  ],
};
const run = (n, word, summary, ago) => ({ id: `r${n}`, n, dueAt: now - ago, missed: 0, trigger: 'schedule', mode: 'goal', status: 'done', stopReason: 'verified', turns: 2, armedAt: now - ago, endedAt: now - ago + 40_000, outcome: word, summary, machine: 'fotrsqlbirokrat', agent: 'birocode', word });
const board = {
  at: now, gateOpen: true, minIntervalMinutes: 5,
  tasks: [
    { id: 'p1', kind: 'prompt', title: 'CI health check', sourceId: null, repoId: 'bc-1', agentLabel: 'fotrsqlbirokrat/birocode', instructions: 'Look at the last 10 runs on main.', redacted: false,
      schedule: { kind: 'interval', everyMinutes: 120 }, scheduleWords: 'every 2 h', run: { mode: 'goal', maxTurns: 6 }, policy: { catchUp: true, skipWhenBusy: false, skipAbovePlanUsage: 85, requireDefaultBranch: false },
      enabled: true, pausedReason: null, runCount: 3, totalRuns: 3, createdAt: now - 3 * 24 * H, updatedAt: now - H, createdBy: 'operator', nextDueAt: now + 47 * 60_000, hold: null, running: null,
      lastRun: run(3, 'ok', 'all 10 green', 73 * 60_000), strip: ['ok', 'attention', 'ok'], attention: null },
    { id: 't1', kind: 'tracking', title: 'Nightly bank-statement import', sourceId: null, repoId: 'web-1', agentLabel: 'fotrsqlbirokrat/birokrat-web', instructions: null, redacted: false,
      description: 'The import of yesterday\'s bank statements runs every night at 02:00 inside the app\'s own scheduler; its log and the rejected lines are on the Imports page.', appId: 'web',
      schedule: null, scheduleWords: "runs inside the agent's app — no scheduled prompts", run: { mode: 'goal', maxTurns: 6 }, policy: {}, enabled: true, pausedReason: null, runCount: 0, totalRuns: 0,
      createdAt: now - 2 * H, updatedAt: now - 2 * H, createdBy: 'arch', nextDueAt: null, hold: null, running: null, lastRun: null, strip: [], attention: null },
    { id: 't2', kind: 'tracking', title: 'BiroNext invoice sync', sourceId: 'src-razvoj', repoId: 'bn-1', agentLabel: 'razvoj2016/bironext', instructions: null, redacted: false,
      description: 'Hourly sync of issued invoices to the accounting service, run by the BiroNext job host on razvoj2016.', appId: 'sync',
      schedule: null, scheduleWords: "runs inside the agent's app — no scheduled prompts", run: { mode: 'goal', maxTurns: 6 }, policy: {}, enabled: true, pausedReason: null, runCount: 0, totalRuns: 0,
      createdAt: now - 5 * H, updatedAt: now - 5 * H, createdBy: 'operator', nextDueAt: null, hold: null, running: null, lastRun: null, strip: [], attention: null },
  ],
};
const repos = [
  { id: 'web-1', name: 'birokrat-web', isSelf: false, localApps: [{ id: 'web', name: 'Birokrat web', port: 5300, kind: 'repo' }, { id: 'understanding', name: 'Understanding', port: 0, kind: 'harness' }] },
  { id: 'bc-1', name: 'birocode', isSelf: true, localApps: [{ id: 'understanding', name: 'Understanding', port: 0, kind: 'harness' }] },
];

function mock(pathname) {
  if (pathname === '/api/recurring') return board;
  if (pathname.startsWith('/api/recurring/p1/runs')) return { runs: [run(3, 'ok', 'all 10 green', 73 * 60_000), run(2, 'attention', 'deploy.yml failed twice', 193 * 60_000), run(1, 'ok', 'all green', 313 * 60_000)], total: 3 };
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'fotrsqlbirokrat' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/repos': return repos;
    case '/api/taskgraph': return { staleHours: 24, nodes: [], edges: [], machines: [] };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  // Record what the open-harness helper does instead of opening tabs: the named per-agent
  // tab (window.open('', name) finds-or-creates it) and the deep link it gets when fresh.
  window.__opened = [];
  window.open = (url, name) => {
    const w = { location: { href: 'about:blank' }, focused: 0, focus() { this.focused++; }, closed: false };
    window.__opened.push({ url, name, w });
    return w;
  };
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const r = {};
try {
  await page.goto(`${base}/manage.html?tab=recurring&layout=tabs`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-recurring]', { timeout: 60000 });
  r.cards = await page.$$eval('[data-recurring]', (els) => els.map((e) => ({ id: e.dataset.recurring, kind: e.dataset.rcKind, tracking: e.classList.contains('rc__card--tracking'), pill: !!e.querySelector('[data-rc-kind-pill]'), strip: !!e.querySelector('[data-rc-strip]'), next: !!e.querySelector('[data-rc-next]'), openHarness: !!e.querySelector('[data-rc-open-harness]'), words: e.querySelector('[data-rc-tracking-words]')?.textContent.trim() || null, appLink: e.querySelector('[data-rc-app-link]')?.getAttribute('href') || null })));
  r.summary = await page.locator('[data-rc-summary]').textContent();
  r.order = r.cards.map((c) => c.id);
  await page.screenshot({ path: path.join(OUT, 'recurring-both-kinds.png'), fullPage: false });

  // The tracking card's main action: open harness — the same per-agent tab the Kanban badge opens.
  await page.click('[data-recurring="t1"] [data-rc-open-harness]');
  await page.waitForTimeout(200);
  r.opened = await page.evaluate(() => window.__opened.map((o) => ({ name: o.name, url: o.url, navigatedTo: o.w.location.href, focused: o.w.focused })));
  // A second click finds the same named tab and focuses it — no second tab, no reload.
  await page.click('[data-recurring="t1"] [data-rc-open-harness]');
  await page.waitForTimeout(200);
  r.openedAgain = await page.evaluate(() => window.__opened.map((o) => o.name));

  // Expand the tracking card: editor with the app picker from this machine's registry, no history.
  // Click the title (the header's centre is the Open-harness button, which stops propagation).
  await page.click('[data-recurring="t1"] .rc__title');
  await page.waitForSelector('[data-recurring="t1"] .rc__body', { timeout: 10000 });
  r.trackingEditor = await page.evaluate(() => {
    const card = document.querySelector('[data-recurring="t1"]');
    const sel = card.querySelector('select[data-rc-app]');
    return { hasAppSelect: !!sel, appOptions: sel ? Array.from(sel.options).map((o) => o.value) : null, selected: sel?.value, hasHistory: !!card.querySelector('[data-rc-history],[data-rc-nohistory]'), hasRunNow: !!card.querySelector('[data-rc-run]'), hasPause: !!card.querySelector('[data-rc-pause]'), note: card.querySelector('[data-rc-tracking-note]')?.textContent || null, bodyOpen: !!card.querySelector('[data-rc-open-harness-body]') };
  });
  await page.locator('[data-recurring="t1"]').screenshot({ path: path.join(OUT, 'recurring-tracking-open.png') });
  // The peer's tracking card: free-text app id, link to that machine's harness.
  await page.click('[data-recurring="t2"] .rc__title');
  await page.waitForSelector('[data-recurring="t2"] .rc__body', { timeout: 10000 });
  r.peerEditor = await page.evaluate(() => { const card = document.querySelector('[data-recurring="t2"]'); return { textAppInput: !!card.querySelector('input[data-rc-app]'), value: card.querySelector('input[data-rc-app]')?.value }; });

  // The composer offers both kinds; the tracking form validates its own fields.
  await page.click('[data-rc-add-tracking]');
  await page.waitForSelector('[data-rc-composer="tracking"]', { timeout: 10000 });
  r.composerInvalid0 = await page.locator('[data-rc-composer] [data-rc-invalid]').textContent();
  await page.fill('[data-rc-composer] [data-rc-title]', 'Payroll export');
  await page.selectOption('[data-rc-composer] [data-rc-agent]', '|web-1');
  r.composerInvalid1 = await page.locator('[data-rc-composer] [data-rc-invalid]').textContent();
  await page.fill('[data-rc-composer] [data-rc-description]', 'runs on the 1st of each month inside the app');
  r.composerAppOptions = await page.$$eval('[data-rc-composer] select[data-rc-app] option', (os) => os.map((o) => o.value));
  r.composerCreateEnabled = await page.locator('[data-rc-composer] [data-rc-create]').isEnabled();
  r.composerHasSchedule = (await page.locator('[data-rc-composer] [data-rc-kind], [data-rc-composer] [data-rc-instructions]').count()) > 0;
  await page.screenshot({ path: path.join(OUT, 'recurring-tracking-composer.png'), fullPage: false });
} catch (e) {
  r.error = String(e);
} finally {
  await browser.close();
  await server.close();
}
r.errors = errs;
const t1 = r.cards?.find((c) => c.id === 't1'); const p1 = r.cards?.find((c) => c.id === 'p1'); const t2 = r.cards?.find((c) => c.id === 't2');
const ok = !r.error && errs.length === 0 && r.cards?.length === 3
  && p1 && p1.kind === 'prompt' && !p1.tracking && p1.strip && p1.next && !p1.openHarness
  && t1 && t1.kind === 'tracking' && t1.tracking && t1.pill && !t1.strip && !t1.next && t1.openHarness && t1.words === '⚙ runs inside Birokrat web' && t1.appLink === '/api/localview/web-1/app/web/'
  && t2 && t2.tracking && t2.words === '⚙ runs inside sync' && t2.appLink === 'http://192.168.0.20:5099/api/localview/bn-1/app/sync/'
  && r.order?.[0] === 'p1'
  && r.opened?.length === 1 && r.opened[0].name === 'birocode-agent-_web-1' && r.opened[0].url === '' && r.opened[0].navigatedTo === '/studio?agent=web-1' && r.opened[0].focused === 1
  && r.openedAgain?.length === 2 && r.openedAgain[1] === 'birocode-agent-_web-1'
  && r.trackingEditor?.hasAppSelect && r.trackingEditor.selected === 'web' && r.trackingEditor.appOptions?.includes('web') && !r.trackingEditor.hasHistory && !r.trackingEditor.hasRunNow && !r.trackingEditor.hasPause && r.trackingEditor.bodyOpen
  && r.peerEditor?.textAppInput && r.peerEditor.value === 'sync'
  && /title/i.test(r.composerInvalid0 || '') && /Describe what runs/.test(r.composerInvalid1 || '') && r.composerCreateEnabled === true && r.composerHasSchedule === false && r.composerAppOptions?.includes('web')
  && /1 active/.test(r.summary || '') && /2 tracking-only/.test(r.summary || '');
console.log(JSON.stringify(r, null, 1));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
