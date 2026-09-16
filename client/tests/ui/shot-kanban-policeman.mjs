// Evidence shots for openspec kanban-board-integrity (fleet task b2ea0809): render the
// Management App's Kanban against a MOCKED board that carries a goal, a policeman verdict
// and one card of each kind — honest, not verified yet (column ahead of the facts), stuck (🆘
// stamped by the policeman) and manual — then do what the Operator does: edit + save the
// goal, flip a card to manual, resolve a human request. The mock PATCH/POST/DELETE mutate
// the mock board like the harness's endpoints, so the reload after each save shows it.
//
//   node client/tests/ui/shot-kanban-policeman.mjs        (from the repo root or client/)
// Output: docs/screenshots/kanban-policeman-board.png (goal + verdict + badges),
//         kanban-policeman-goal-editing.png, kanban-policeman-detail.png (🆘 + manual controls)

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
const fleet = {
  at: now, hubVersion: '1.0.0+test',
  machines: [{
    machine: 'razvoj2016', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null,
    version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 2,
    agents: [
      { handle: 'razvoj2016/birocode#1', key: 'self/birocode', repoId: 'r-web', name: 'birocode', remoteUrl: 'https://github.com/acme/birocode.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't1' },
      { handle: 'razvoj2016/prg#1', key: 'self/prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/acme/prg.git', branch: 'feature/x', defaultBranch: 'main', onDefault: false, dirty: false, availability: 'claimed', lastActor: 'human', runningSince: now - 60_000, managed: true, docked: true, exists: true, tabId: 't2' },
    ],
  }],
};
const who = (repoId, status, extra = {}) => ({ repoId, sourceId: null, status, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, updatedAt: now - 30 * H, ...extra });
const node = (id, title, status, repoId, extra = {}) => ({ id, title, note: '', status, repoId, sourceId: null, assignees: repoId ? [who(repoId, status, extra.assignee || {})] : [], x: 0, y: 0, createdAt: 1, updatedAt: now - 30 * H, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, createdBy: 'arch', ...extra });
const STUCK = 'c3d4e5f6a1b2';
const MANUALME = 'e5f6a1b2c3d4';
const board = {
  staleHours: 24, edges: [], machines: [], scratch: '',
  goal: 'Ship the invoice CSV export and the Kanban integrity tools by Friday; nothing on the board may claim more than the facts show.',
  goalUpdatedAt: now - 2 * H,
  nodes: [
    node('a1b2c3d4e5f6', 'Kanban policeman + goal + human badge + manual', 'doing', 'r-web', { updatedAt: now - 10 * 60_000, assignee: { updatedAt: now - 10 * 60_000, verifiedStatus: 'doing' } }),
    node('b2c3d4e5f6a1', 'Fleet keep-alive column', 'pr-opened', 'r-web', { warning: 'claimed pr-opened, verified: nothing — no facts observed yet', assignee: { warning: 'claimed pr-opened, verified: nothing — no facts observed yet' } }),
    node(STUCK, 'Export the invoice register as CSV', 'doing', 'r-prg', { needsHuman: { at: now - 5 * 60_000, by: 'policeman', reason: 'pinged, no PR and no progress for 30 h (window 24 h)', requestId: null } }),
    node('d4e5f6a1b2c3', 'Write the release notes for 2.4', 'todo', 'r-web', { manual: true, manualAt: now - H }),
    node(MANUALME, 'Rotate the production API key', 'todo', 'r-prg', { dispatchedAt: null, dispatchCount: 0, assignee: { dispatchedAt: null, dispatchCount: 0 } }),
    node('f6a1b2c3d4e5', 'Ideas consumed on promotion', 'done', 'r-web', { mergeCommit: 'feedfacefeed', assignee: { verifiedStatus: 'done', mergeCommit: 'feedfacefeed' } }),
  ],
  integrity: {
    checkedAt: now - 20_000, cards: 6, honest: 3, dishonest: 1, stuck: 1, manual: 1,
    flagged: [
      { id: 'b2c3d4e5f6a1', title: 'Fleet keep-alive column', state: 'dishonest', reason: 'column ahead of reality — claimed pr-opened, verified: nothing — no facts observed yet' },
      { id: STUCK, title: 'Export the invoice register as CSV', state: 'stuck', reason: 'pinged, no PR and no progress for 30 h (window 24 h)' },
    ],
  },
};

const calls = [];
function mock(pathname, method, body) {
  const human = /^\/api\/taskgraph\/nodes\/([^/]+)\/human$/.exec(pathname);
  if (human) {
    const n = board.nodes.find((x) => x.id === human[1]);
    calls.push({ method, pathname });
    if (method === 'POST') n.needsHuman = { at: Date.now(), by: 'operator', reason: body?.reason || 'raised by the Operator', requestId: null };
    if (method === 'DELETE') n.needsHuman = null;
    return { status: 200, body: n };
  }
  const m = /^\/api\/taskgraph\/nodes\/([^/]+)$/.exec(pathname);
  if (m && method === 'PATCH') {
    const n = board.nodes.find((x) => x.id === m[1]);
    calls.push({ method, pathname, body });
    if (body?.manual != null) { n.manual = !!body.manual; n.manualAt = body.manual ? Date.now() : null; if (!body.manual) { /* nothing */ } board.integrity.manual = board.nodes.filter((x) => x.manual).length; }
    if (body?.title != null) n.title = body.title;
    if (body?.note != null) n.note = body.note;
    return { status: 200, body: n };
  }
  if (pathname === '/api/taskgraph/goal' && method === 'PATCH') { calls.push({ method, pathname, body }); board.goal = String(body?.text || '').trim(); board.goalUpdatedAt = Date.now(); return { status: 200, body: { goal: board.goal, goalUpdatedAt: board.goalUpdatedAt } }; }
  switch (pathname) {
    case '/api/auth/check': return { status: 200, body: { authenticated: true } };
    case '/api/arch': return { status: 200, body: { fleet: { selfLabel: 'razvoj2016' }, gateOpen: true, killSwitch: true } };
    case '/api/arch/fleet/status': return { status: 200, body: fleet };
    case '/api/taskgraph': return { status: 200, body: board };
    case '/api/taskgraph/layout': return { status: 200, body: { layout: null } };
    case '/api/notes': return { status: 200, body: [] };
    case '/api/tasks': return { status: 200, body: { session: { run: null } } };
    default: return { status: 200, body: {} };
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1380, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const req = route.request();
  const { pathname } = new URL(req.url());
  let body = null;
  try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
  const r = mock(pathname, req.method(), body);
  route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const card = (id) => `[data-task="${id}"]`;

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-board-goal] [data-goal-text]', { timeout: 15000 });
await page.waitForSelector(`${card(STUCK)} [data-board-check="needs-human"]`, { timeout: 15000 });
const goalShown = await page.$eval('[data-goal-text]', (e) => e.textContent);
const policeLine = await page.$eval('[data-police]', (e) => e.textContent);
const badges = {
  human: await page.$eval(`${card(STUCK)} [data-board-check="needs-human"]`, (e) => e.dataset.checkSource),
  dishonest: !!(await page.$(`${card('b2c3d4e5f6a1')} [data-board-check="unverified"]`)),
  manual: !!(await page.$(`${card('d4e5f6a1b2c3')} [data-board-check="manual"]`)),
  honestClean: !(await page.$(`${card('a1b2c3d4e5f6')} [data-board-check="unverified"], ${card('a1b2c3d4e5f6')} [data-board-check="needs-human"], ${card('a1b2c3d4e5f6')} [data-board-check="manual"]`)),
};
// The filter bar grew the two flags because some card carries them.
const flagChips = await page.$$eval('[data-filter-group="flag"] button', (els) => els.map((e) => e.textContent.trim().replace(/\s+\d+$/, '')));
await shotMain('kanban-policeman-board.png');

// 1) Edit + save the goal.
await page.click('[data-edit-goal]');
await page.fill('[data-goal-input]', 'Ship the invoice CSV export by Friday. Every card must be honest: a column may never be ahead of the verified facts.');
await shotMain('kanban-policeman-goal-editing.png');
await page.click('[data-goal-save]');
await page.waitForFunction(() => /Every card must be honest/.test(document.querySelector('[data-goal-text]')?.textContent || ''), null, { timeout: 5000 });
const goalAfter = await page.$eval('[data-goal-text]', (e) => e.textContent);

// 2) Flip a card to manual from the ✋ on its title row; its Ping is disabled; flip back from the detail.
await page.click(`${card(MANUALME)} [data-manual-toggle]`);
await page.waitForSelector(`${card(MANUALME)} [data-board-check="manual"]`, { timeout: 5000 });
await page.click(`${card(MANUALME)} .kb__title-text`);
await page.waitForSelector(`${card(MANUALME)} [data-manual-action]`, { timeout: 5000 });
const pingDisabledWhenManual = await page.$eval(`${card(MANUALME)} [data-dispatch]`, (b) => b.disabled);
const manualActionText = await page.$eval(`${card(MANUALME)} [data-manual-action]`, (b) => b.textContent);
const manualDetail = !!(await page.$(`${card(MANUALME)} [data-board-check="manual"]`));

// 3) Open the stuck card: the request block + "Resolved"; screenshot both open details.
await page.click(`${card(STUCK)} .kb__title-text`);
await page.waitForSelector(`${card(STUCK)} [data-board-check="needs-human"]`, { timeout: 5000 });
const humanDetail = await page.$eval(`${card(STUCK)} [data-board-check="needs-human"]`, (e) => e.textContent);
await shotMain('kanban-policeman-detail.png');
await page.click(`${card(STUCK)} [data-resolve-human]`);
await page.waitForFunction((sel) => !document.querySelector(`${sel} [data-board-check="needs-human"]`), card(STUCK), { timeout: 5000 });
const humanCleared = !(await page.$(`${card(STUCK)} [data-board-check="needs-human"]`));

// 4) Back to auto (re-open its detail first: opening the stuck card closed it — one open card at a time).
await page.click(`${card(MANUALME)} .kb__title-text`);
await page.waitForSelector(`${card(MANUALME)} [data-manual-action]`, { timeout: 5000 });
await page.click(`${card(MANUALME)} [data-manual-action]`);
await page.waitForFunction((sel) => !document.querySelector(`${sel} [data-board-check="manual"]`), card(MANUALME), { timeout: 5000 });
const backToAuto = !(await page.$(`${card(MANUALME)} [data-board-check="manual"]`));

// 5) Reload: the goal and the flags persisted (the mock store, like the harness's).
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-goal-text]', { timeout: 15000 });
const goalAfterReload = await page.$eval('[data-goal-text]', (e) => e.textContent);

// Drag/drop untouched.
const dragged = await page.evaluate((sel) => {
  const c = document.querySelector(sel);
  const dt = new DataTransfer();
  c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  return dt.getData('text/task-id');
}, card('a1b2c3d4e5f6'));

await browser.close();
await server.close();

const checks = {
  goalShown: /nothing on the board may claim/.test(goalShown),
  policeLineCounts: /1 not verified yet/.test(policeLine) && /1 need human/.test(policeLine) && /1 manual/.test(policeLine),
  humanBadgeByPoliceman: badges.human === 'policeman',
  dishonestBadge: badges.dishonest,
  manualBadge: badges.manual,
  honestCardClean: badges.honestClean,
  filterFlagsGrew: flagChips.includes('needs-human') && flagChips.includes('manual'),
  goalSaved: /Every card must be honest/.test(goalAfter) && calls.some((c) => c.pathname === '/api/taskgraph/goal'),
  manualViaSamePatch: calls.some((c) => c.method === 'PATCH' && c.pathname.endsWith(MANUALME) && c.body?.manual === true),
  pingDisabledWhenManual,
  manualDetailShown: manualDetail && /Back to auto/.test(manualActionText),
  humanDetailShown: /policeman/.test(humanDetail) && /no progress/.test(humanDetail),
  humanResolved: humanCleared && calls.some((c) => c.method === 'DELETE' && c.pathname.endsWith('/human')),
  backToAuto,
  goalSurvivesReload: goalAfterReload === goalAfter,
  cardDragIntact: dragged === 'a1b2c3d4e5f6',
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ goalShown, policeLine, badges, flagChips, goalAfter, pingDisabledWhenManual, manualActionText, humanDetail, calls, pageErrors: errs, checks, out: ['kanban-policeman-board.png', 'kanban-policeman-goal-editing.png', 'kanban-policeman-detail.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
