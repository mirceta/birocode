// Evidence shots for openspec kanban-card-sections: the Kanban rendered against a MOCKED
// board with one card per Board-check state (honest · not verified yet · needs human ·
// manual) plus a blocked one, then a card's Links opened and a 🆘 resolved inline. Asserts
// that no card shows a raw reason string ("column ahead of reality", "claimed …") or a bare
// "unverified" badge, that every Board check names its source, that Resolve works without
// opening the card, and that card drag still sets its drag data.
//
//   node client/tests/ui/shot-kanban-card-sections.mjs
// Output: docs/screenshots/kanban-card-sections.png, kanban-card-sections-links.png

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
const H = 3600_000;
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [{ machine: 'razvoj2016', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 2, agents: [
  { handle: 'razvoj2016/birocode#1', key: 'self/birocode', repoId: 'r-web', name: 'birocode', remoteUrl: 'https://github.com/acme/birocode.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: now - 60_000, managed: true, docked: true, exists: true, tabId: 't1' },
  { handle: 'razvoj2016/prg#1', key: 'self/prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/acme/prg.git', branch: 'feature/x', defaultBranch: 'main', onDefault: false, dirty: false, availability: 'claimed', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't2' },
] }] };
const who = (repoId, status, extra = {}) => ({ repoId, sourceId: null, status, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, updatedAt: now - 30 * H, ...extra });
const node = (id, title, status, repoId, extra = {}) => ({ id, title, note: '', status, repoId, sourceId: null, assignees: repoId ? [who(repoId, status, extra.assignee || {})] : [], x: 0, y: 0, createdAt: 1, updatedAt: now - 30 * H, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, createdBy: 'arch', ...extra });
const HONEST = 'a1b2c3d4e5f6', LYING = 'b2c3d4e5f6a1', STUCK = 'c3d4e5f6a1b2', MANUAL = 'd4e5f6a1b2c3', BLOCKED = 'e5f6a1b2c3d4', DEP = 'f6a1b2c3d4e5';
const board = {
  staleHours: 24, machines: [], scratch: '', goal: 'Ship the invoice CSV export by Friday.', goalUpdatedAt: now - 2 * H,
  edges: [{ id: 'e1', source: BLOCKED, target: DEP }],
  nodes: [
    node(HONEST, 'Kanban card sections', 'committed', 'r-web', { branch: 'feat/kanban-card-sections', pushed: true, verifiedStatus: 'committed', verifiedAt: now - 3 * 60_000, updatedAt: now - 10 * 60_000, assignee: { verifiedStatus: 'committed', verifiedAt: now - 3 * 60_000, updatedAt: now - 10 * 60_000, branch: 'feat/kanban-card-sections', pushed: true } }),
    node(LYING, 'Fleet keep-alive column', 'pr-opened', 'r-web', { branch: 'feat/harness-watchdog', pushed: false, verifiedStatus: 'doing', verifiedAt: now - 2 * 60_000, warning: 'claimed pr-opened, verified: doing — branch not on origin', assignee: { verifiedStatus: 'doing', warning: 'claimed pr-opened, verified: doing — branch not on origin', branch: 'feat/harness-watchdog', pushed: false } }),
    node(STUCK, 'Export the invoice register as CSV', 'doing', 'r-prg', { needsHuman: { at: now - 6 * 60_000, by: 'policeman', reason: 'pinged 30 h ago, no branch and no PR; its last reply asked for a production credential', requestId: null } }),
    node(MANUAL, 'Write the release notes for 2.4', 'todo', 'r-web', { manual: true, manualAt: now - H }),
    node(DEP, 'Build the CSV endpoint', 'doing', 'r-prg', { dispatchedAt: now - 2 * H, assignee: { dispatchedAt: now - 2 * H } }),
    node(BLOCKED, 'Wire the CSV button on the register page', 'todo', 'r-web', { dispatchedAt: null, dispatchCount: 0, assignee: { dispatchedAt: null, dispatchCount: 0 } }),
    node('0a1b2c3d4e5f', 'Ideas consumed on promotion', 'done', 'r-web', { prUrl: 'https://github.com/acme/birocode/pull/67', prNumber: 67, mergeCommit: 'feedfacefeed', verifiedStatus: 'done', verifiedAt: now - 20 * H, assignee: { verifiedStatus: 'done', mergeCommit: 'feedfacefeed', prUrl: 'https://github.com/acme/birocode/pull/67', prNumber: 67 } }),
  ],
  integrity: { checkedAt: now - 20_000, cards: 7, honest: 4, dishonest: 1, stuck: 1, manual: 1, flagged: [
    { id: LYING, title: 'Fleet keep-alive column', state: 'dishonest', reason: 'column ahead of reality — claimed pr-opened, verified: doing — branch not on origin' },
    { id: STUCK, title: 'Export the invoice register as CSV', state: 'stuck', reason: 'pinged, no PR and no progress for 30 h (window 24 h)' },
  ] },
};
const calls = [];
function mock(pathname, method) {
  const human = /^\/api\/taskgraph\/nodes\/([^/]+)\/human$/.exec(pathname);
  if (human && method === 'DELETE') { calls.push({ method, pathname }); const n = board.nodes.find((x) => x.id === human[1]); n.needsHuman = null; return n; }
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'razvoj2016' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return { layout: { visible: ['todo', 'doing', 'committed', 'pr-opened', 'done'], widths: { todo: 300, doing: 320, committed: 300, 'pr-opened': 300, done: 260 } } };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.setItem('manageapp.kanbanSub', 'board');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const req = route.request();
  const { pathname } = new URL(req.url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, req.method())) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const card = (id) => `[data-task="${id}"]`;

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`${card(HONEST)} [data-board-check]`, { timeout: 15000 });
const checks = await page.$$eval('[data-board-check]', (els) => els.map((e) => ({ id: e.closest('[data-task]').dataset.task, key: e.dataset.boardCheck, source: e.dataset.checkSource, text: e.textContent })));
const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
const boardText = await page.$eval('[data-kanban]', (e) => e.textContent);
const steps = await page.$eval(`${card(LYING)} [data-card-progress]`, (e) => Array.from(e.querySelectorAll('[data-step]')).map((s) => `${s.dataset.step}:${s.dataset.stepState}`));
const blockedNote = await page.$eval(`${card(BLOCKED)} [data-progress-note]`, (e) => e.textContent);
const linksBrief = await page.$eval(`${card(LYING)} [data-links-brief]`, (e) => e.textContent);
await shotMain('kanban-card-sections.png');

// Open the lying card's Links (must NOT open the card's detail panel).
await page.click(`${card(LYING)} .kb__links-sum`);
await page.waitForSelector(`${card(LYING)} [data-link="branch"]`, { timeout: 5000 });
const linkRows = await page.$$eval(`${card(LYING)} [data-link]`, (els) => els.map((e) => `${e.dataset.link}: ${e.textContent.trim()}`));
const detailOpenedByLinks = !!(await page.$(`${card(LYING)} .kb__detail`));
await shotMain('kanban-card-sections-links.png');

// Resolve the 🆘 inline, without opening the card.
await page.click(`${card(STUCK)} [data-resolve-human]`);
await page.waitForFunction((sel) => document.querySelector(`${sel} [data-board-check]`)?.dataset.boardCheck !== 'needs-human', card(STUCK), { timeout: 5000 });
const stuckAfter = await page.$eval(`${card(STUCK)} [data-board-check]`, (e) => e.dataset.boardCheck);
const detailOpenedByResolve = !!(await page.$(`${card(STUCK)} .kb__detail`));

const dragged = await page.evaluate((sel) => { const c = document.querySelector(sel); const dt = new DataTransfer(); c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); return dt.getData('text/task-id'); }, card(HONEST));
await browser.close();
await server.close();

const result = {
  honestCard: byId[HONEST]?.key === 'honest' && byId[HONEST].source === 'auto-verifier' && /Committed is confirmed by the facts/.test(byId[HONEST].text),
  lyingCardIsNotVerified: byId[LYING]?.key === 'unverified' && /marked PR open, but no pull request has been found on GitHub yet/.test(byId[LYING].text) && /auto-verifier/.test(byId[LYING].text),
  stuckCardNeedsHuman: byId[STUCK]?.key === 'needs-human' && byId[STUCK].source === 'policeman' && /the policeman/.test(byId[STUCK].text) && /production credential/.test(byId[STUCK].text),
  manualCard: byId[MANUAL]?.key === 'manual' && byId[MANUAL].source === 'operator' && /by hand/.test(byId[MANUAL].text),
  everyCheckNamesASource: checks.every((c) => /auto-verifier|policeman|the agent|you \(operator\)/.test(c.text)),
  noRawReasonStrings: !/column ahead of reality|claimed pr-opened|verified: doing|⚠ unverified/.test(boardText),
  progressStepsForLyingCard: steps.join(',') === 'todo:done,doing:done,committed:done,pr-opened:current-unverified,pr-merged:todo,done:todo',
  blockedNote: /blocked — waits on Build the CSV endpoint/.test(blockedNote),
  linksBrief: linksBrief === '⎇ feat/harness-watchdog (not on origin) · stale',
  linksOpenWithoutDetail: linkRows.some((r) => r.startsWith('branch:') && /not on origin/.test(r)) && linkRows.some((r) => r.startsWith('verified:')) && !detailOpenedByLinks,
  resolveInline: stuckAfter === 'honest' && !detailOpenedByResolve && calls.some((c) => c.method === 'DELETE'),
  cardDragIntact: dragged === HONEST,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ checks, steps, blockedNote, linksBrief, linkRows, stuckAfter, pageErrors: errs, result, out: ['kanban-card-sections.png', 'kanban-card-sections-links.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
