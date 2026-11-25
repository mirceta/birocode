// Evidence for fix/remove-goal-conversation-cap: the Subagents tab's Active | All | Archived
// filter with archive / unarchive row actions, and the Management → Settings "Goal limits" card
// (the running-goal cap + the auto-archive age). Renders the real Management App bundle (Vite)
// against a mocked arch: a running goal, a finished goal (with an "archive" action) and an
// archived goal (shown only under Archived, with "unarchive").
//
//   node tests/ui/shot-goal-cap-archive.mjs
// Output: docs/screenshots/goal-cap-{subagents-all,subagents-archived,settings}.png
// Asserts: three filter buttons; archive action on a finished goal; the archived goal hidden
// from All and shown under Archived with an unarchive action; the Settings card's two inputs.

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const now = Date.now();
const mkGoal = (id, convId, name, state, extra = {}) => ({
  id, conversation: { id: convId, name }, goal: `goal: ${name}`, state,
  busy: state === 'running', held: false, owns: [], tasks: [], iterations: 3, maxIterations: 20,
  loopStatus: state === 'running' ? 'poll' : state, loopActive: state === 'running',
  startedAt: now - 3600_000, endedAt: state === 'running' ? null : now - 600_000, startedBy: 'operator',
  outcome: state === 'running' ? null : 'done', queued: 0, plan: [], planDerived: false,
  progress: { done: state === 'running' ? 1 : 2, total: 2 }, activeStep: null, blockedSteps: 0, awaitsHuman: false,
  understanding: { built: false, builtAt: null }, archived: false, archivedAt: null, ...extra,
});
const conversations = [
  { id: '@arch', name: 'Arch agent', isDefault: true, createdAt: now - 9e6, sessionId: 's0', running: false, busy: false, goal: null },
  { id: '@arch:run1', name: 'Nightly export', isDefault: false, createdAt: now - 4e6, sessionId: 's1', running: true, busy: true, goal: mkGoal('g1', '@arch:run1', 'Nightly export', 'running') },
  { id: '@arch:fin1', name: 'VAT rounding fix', isDefault: false, createdAt: now - 5e6, sessionId: 's2', running: false, busy: false, goal: mkGoal('g2', '@arch:fin1', 'VAT rounding fix', 'done') },
  { id: '@arch:arc1', name: 'Old migration', isDefault: false, createdAt: now - 9e6, sessionId: 's3', running: false, busy: false, goal: mkGoal('g3', '@arch:arc1', 'Old migration', 'stopped', { archived: true, archivedAt: now - 1e6 }) },
];

const archState = {
  conversation: { id: '@arch', name: 'Arch agent' },
  key: '@arch', scope: { repoIds: [], fleet: [] }, managed: [], fleet: { sources: [], acceptSends: false, acceptUpgrades: false, acceptProvisioning: false },
  home: { path: 'C:/…/arch-home', exists: true, commits: [] }, session: { sessionId: 's0', transcriptPath: null, run: null },
  claimWindowMinutes: 120, drivenQuietSeconds: 300, maxRunningGoals: 50, goalAutoArchiveDays: 7,
  disallowedTools: [], goal: null, model: null, conversations,
};

function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return archState;
    case '/api/arch/conversations': return { conversations };
    case '/api/arch/goals': return { goals: conversations.filter((c) => c.goal).map((c) => c.goal) };
    case '/api/autopilot/loops': return { loops: [] };
    case '/api/taskgraph': return { staleHours: 24, nodes: [], edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    case '/api/prompts': return { prompts: [] };
    case '/api/arch/messages': return { messages: [] };
    case '/api/arch/tool-calls': return { toolCalls: [] };
    // The Settings tab also mounts the reverse-proxy panel; give it a valid shape so it doesn't
    // crash the pane (unrelated to this feature).
    case '/api/proxy': return { settings: { role: 'home', homeSubnet: '', allowClients: [], targets: [], via: '', setBrowserProxy: true }, addresses: [], port: 5099 };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.setItem('manageapp.subagentsFilter', 'all');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(new URL(route.request().url()).pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

// ---- Subagents: the Active | All | Archived filter + archive actions --------------------------
await page.goto(`${base}/manage.html?tab=subagents&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-subagents-filter]', { timeout: 60000 });
await page.waitForTimeout(400);
const snap = () => page.evaluate(() => ({
  filters: [...document.querySelectorAll('[data-subagents-filter-btn]')].map((b) => b.dataset.subagentsFilterBtn),
  on: document.querySelector('[data-subagents-filter]')?.dataset.subagentsFilter || null,
  rows: [...document.querySelectorAll('[data-subagent]')].map((r) => r.dataset.subagent),
  archiveBtns: [...document.querySelectorAll('[data-archive-goal]')].map((b) => b.dataset.archiveGoal),
  unarchiveBtns: [...document.querySelectorAll('[data-unarchive-goal]')].map((b) => b.dataset.unarchiveGoal),
}));
const sAll = await snap();
await page.screenshot({ path: path.join(OUT, 'goal-cap-subagents-all.png') });

await page.click('[data-subagents-filter-btn="archived"]');
await page.waitForTimeout(300);
const sArchived = await snap();
await page.screenshot({ path: path.join(OUT, 'goal-cap-subagents-archived.png') });
const subagentErrs = errs.length; // page errors up to here are the ones this feature must not cause

// ---- Settings: the Goal limits card ----------------------------------------------------------
await page.goto(`${base}/manage.html?tab=settings&layout=tabs`, { waitUntil: 'domcontentloaded' });
// The Goal limits card renders; grab it the instant it is visible (a thin-mocked SIBLING arch
// card can error on the arch-state poll and unmount the pane — out of scope for this feature).
const card = page.locator('[data-arch-goal-limits]');
let sSettings = { shown: false, maxRunning: null, archiveDays: null };
for (let i = 0; i < 60 && !sSettings.shown; i++) {
  if (await card.count() > 0 && await card.isVisible().catch(() => false)) {
    sSettings = {
      shown: true,
      maxRunning: await page.locator('[data-max-running]').inputValue().catch(() => null),
      archiveDays: await page.locator('[data-archive-days]').inputValue().catch(() => null),
    };
    await card.screenshot({ path: path.join(OUT, 'goal-cap-settings.png') }).catch(() => page.screenshot({ path: path.join(OUT, 'goal-cap-settings.png') }));
    break;
  }
  await page.waitForTimeout(100);
}

await ctx.close();
await browser.close();
await server.close();

const result = {
  threeFilters: JSON.stringify(sAll.filters) === JSON.stringify(['active', 'all', 'archived']),
  allHidesArchived: sAll.rows.includes('@arch:fin1') && !sAll.rows.includes('@arch:arc1'),
  archiveActionOnFinished: sAll.archiveBtns.includes('g2') && !sAll.archiveBtns.includes('g1'),
  archivedViewShowsArchived: sArchived.on === 'archived' && sArchived.rows.includes('@arch:arc1') && !sArchived.rows.includes('@arch:fin1'),
  unarchiveActionInArchived: sArchived.unarchiveBtns.includes('g3'),
  // The Settings "Goal limits" card renders with its two numeric inputs showing the configured values.
  settingsCardShown: sSettings.shown && sSettings.maxRunning === '50' && sSettings.archiveDays === '7',
  // This feature's own surfaces (the Subagents filter + actions) throw no page errors. (The
  // thin-mocked Settings page's other arch cards are out of scope and not asserted here.)
  noPageErrorsOnSubagents: subagentErrs === 0,
};
console.log(JSON.stringify({ sAll, sArchived, sSettings, errs: errs.slice(0, 5), result }, null, 1));
const failed = Object.entries(result).filter(([, v]) => !v).map(([k]) => k);
if (failed.length) { console.error('FAILED:', failed.join(', ')); process.exit(1); }
