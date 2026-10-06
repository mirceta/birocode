// Evidence shot for the Management dashboard's Repo Agent Requests tab (openspec
// repo-agent-requests): the real Management App over a mocked GET /api/arch/requests — two
// pending requests (one from this hub's agent, one pulled from a peer), an approved-and-delivered
// one, a dismissed one, a reachable and a dark peer, the how-to — asserts the tab is listed,
// pending cards carry agent@machine / title / text / Approve / Dismiss, the decided section is
// collapsed by default and opens, peers are named with their status, Approve posts to
// /approve and the card turns approved, Dismiss asks first (Cancel keeps it) then posts to
// /dismiss; screenshots the tab.
//
//   node client/tests/ui/shot-manage-requests.mjs
// Output: docs/screenshots/manage-requests.png, manage-requests-decided.png, manage-requests-goal.png

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
const req = (id, sourceId, machine, repoId, agent, title, text, createdAt, status, extra = {}) => ({ id, sourceId, machine, repoId, agent, title, text, createdAt, status, decidedAt: null, decidedBy: null, deliveredAt: null, decisionSynced: sourceId == null, conversationId: null, ...extra });
let requests = [
  req('r1', null, 'spacex', 'r-prg', 'prg#1', 'Need the staging DB', 'Please have MONSTER/web-flow-autodev#1 upload prod.bak to the hub as web/db/prod.bak so I can reproduce the invoice bug. I tried the fixtures; they lack the 2025 rows. Meanwhile I am writing the migration.', now - 4 * 60_000, 'pending',
    { probe: 'Do you have SQL Server with the Birokrat databases restored, and is it safe to change C:\\Birokrat on your machine? Check the service and the db list; say what would break.', ifFits: 'Take branch feature/invoice-import, run the migration against your local Birokrat, upload the resulting prod.bak to the hub as web/db/prod.bak.', ifNone: 'Tell me nobody fits; I will stub the data and note it in the PR.', meanwhile: 'I finish the migration script and push the branch.' }),
  req('r2', 'src-monster', 'MONSTER', 'r-web', 'web-flow-autodev#1', null, 'Decision needed: keep the legacy /v1 routes for one more release or drop them now?', now - 25 * 60_000, 'pending'),
  req('r3', 'src-monster', 'MONSTER', 'r-web', 'web-flow-autodev#1', 'More test runners', 'I need a second runner.', now - 3 * 3600_000, 'approved', { decidedAt: now - 2 * 3600_000, decidedBy: 'spacex', deliveredAt: now - 2 * 3600_000 + 9000, conversationId: '@arch' }),
  req('r4', null, 'spacex', 'r-prg', 'prg#1', null, 'Can I delete the old fixtures?', now - 26 * 3600_000, 'dismissed', { decidedAt: now - 25 * 3600_000, decidedBy: 'spacex' }),
];
const calls = [];
const view = () => ({
  hub: 'spacex', available: true, gateOpen: true, pulledAt: now - 7000,
  requests: requests.map((r) => (r.goalId ? { request: r, goal: { id: r.goalId, state: 'running', conversation: '@arch:g77', name: 'goal: Need the staging DB', iterations: 2, cap: 20 } } : r)),
  defaultGoalCap: 20, pending: requests.filter((r) => r.status === 'pending').length,
  peers: [
    { machine: 'MONSTER', sourceId: 'src-monster', status: 'ok', detail: '2 request(s) from managed agents', allowSends: true, managed: true },
    { machine: 'laptop', sourceId: 'src-laptop', status: 'unreachable', detail: 'connection refused', allowSends: false, managed: false },
  ],
  howTo: {
    hub: 'spacex', tool: 'request_arch',
    agent: ['A repo agent calls request_arch(text, title?) when it needs something only the arch can give.', 'The call only records the request here — the arch is not woken and sees nothing until you approve.'],
    operatorSteps: ['Approve: the request is posted into the arch\'s conversation.', 'Dismiss: the request is closed; the arch never sees it.', 'A request from another machine\'s agent gets here when this hub pulls it.'],
  },
});
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [{ machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 0, agents: [] }] };
const board = { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
function mock(method, pathname, postData) {
  const m = pathname.match(/^\/api\/arch\/requests\/([^/]+)\/(approve|dismiss)$/);
  if (m && method === 'POST') {
    const drive = m[2] === 'approve' && /"drive"\s*:\s*true/.test(postData || '');
    calls.push(`${drive ? 'approve-goal' : m[2]}:${m[1]}`);
    const status = m[2] === 'approve' ? 'approved' : 'dismissed';
    requests = requests.map((r) => (r.id === m[1] ? { ...r, status, decidedAt: Date.now(), decidedBy: 'spacex', deliveredAt: status === 'approved' ? Date.now() : null, mode: drive ? 'goal' : (status === 'approved' ? 'message' : null), goalId: drive ? 'g-77' : null } : r));
    return { ok: true, status: drive ? 'approved-goal' : status === 'approved' ? 'approved-delivered' : 'dismissed', detail: '', request: requests.find((r) => r.id === m[1]) };
  }
  switch (pathname) {
    case '/api/arch/requests': return view();
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'spacex' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return { layout: null };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const u = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(route.request().method(), u.pathname, route.request().postData())) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=requests&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-rq-root]', { timeout: 15000 });
await page.waitForSelector('[data-rq-card="r1"]', { timeout: 15000 });
const seen = await page.evaluate(() => ({
  tabLabel: [...document.querySelectorAll('button, [role=tab]')].map((b) => b.textContent.trim()).find((t) => /Repo Agent Requests/.test(t)) || null,
  pendingCount: document.querySelector('[data-rq-pending-count]')?.textContent,
  cards: [...document.querySelectorAll('[data-rq-card]')].map((c) => ({ id: c.dataset.rqCard, status: c.dataset.rqStatus, text: c.textContent, approve: !!c.querySelector('[data-rq-approve]'), approveGoal: !!c.querySelector('[data-rq-approve-goal]'), dismiss: !!c.querySelector('[data-rq-dismiss]'), fields: [...c.querySelectorAll('[data-rq-field]')].map((f) => f.dataset.rqField) })),
  decidedToggle: document.querySelector('[data-rq-toggle-decided]')?.textContent,
  peers: [...document.querySelectorAll('[data-rq-peer]')].map((p) => ({ machine: p.dataset.rqPeer, status: p.dataset.rqPeerStatus, text: p.textContent })),
  howTo: document.querySelector('[data-rq-howto]')?.textContent,
}));
await shotMain('manage-requests.png');

// The decided section opens on click and lists the approved (delivered) and the dismissed one.
await page.click('[data-rq-toggle-decided]');
await page.waitForSelector('[data-rq-card="r3"]', { timeout: 5000 });
const decided = await page.evaluate(() => [...document.querySelectorAll('[data-rq-card]')].map((c) => ({ id: c.dataset.rqCard, status: c.dataset.rqStatus, badge: c.querySelector('[data-rq-badge]')?.textContent, foot: c.querySelector('.rq__hint')?.textContent })));
await shotMain('manage-requests-decided.png');

// Approve r1 AS A GOAL (openspec repo-agent-requests-goal-drive): one POST to /approve with drive: true, the card turns approved · goal running and names the goal conversation.
await page.click('[data-rq-approve-goal="r1"]');
await page.waitForFunction(() => document.querySelector('[data-rq-card="r1"]')?.dataset.rqStatus === 'approved', null, { timeout: 8000 });
await page.waitForSelector('[data-rq-goal="r1"]', { timeout: 8000 });
const afterApprove = await page.evaluate(() => ({ status: document.querySelector('[data-rq-card="r1"]')?.dataset.rqStatus, badge: document.querySelector('[data-rq-badge="r1"]')?.textContent, goal: document.querySelector('[data-rq-goal="r1"]')?.textContent, pending: document.querySelector('[data-rq-pending-count]')?.textContent }));
await shotMain('manage-requests-goal.png');

// Dismiss r2: the confirm names the agent; Cancel keeps it pending; Dismiss now posts and the card turns dismissed.
await page.click('[data-rq-dismiss="r2"]');
await page.waitForSelector('[data-rq-confirm]', { timeout: 5000 });
const confirmText = await page.$eval('[data-rq-confirm]', (e) => e.textContent);
await page.click('[data-rq-confirm-cancel]');
const stillPending = await page.evaluate(() => document.querySelector('[data-rq-card="r2"]')?.dataset.rqStatus);
await page.click('[data-rq-dismiss="r2"]');
await page.waitForSelector('[data-rq-confirm-dismiss]', { timeout: 5000 });
await page.click('[data-rq-confirm-dismiss]');
await page.waitForFunction(() => document.querySelector('[data-rq-card="r2"]')?.dataset.rqStatus === 'dismissed', null, { timeout: 8000 });
const afterDismiss = await page.evaluate(() => ({ status: document.querySelector('[data-rq-card="r2"]')?.dataset.rqStatus, empty: !!document.querySelector('[data-rq-empty]') }));
await browser.close();
await server.close();

const r1 = seen.cards.find((c) => c.id === 'r1');
const r2 = seen.cards.find((c) => c.id === 'r2');
const result = {
  requestsTabListed: seen.tabLabel !== null,
  twoPendingCardsOnlyByDefault: seen.cards.length === 2 && seen.cards.every((c) => c.status === 'pending') && /2 pending/.test(seen.pendingCount || ''),
  cardCarriesAgentMachineTitleTextButtons: !!r1 && /spacex\/prg#1/.test(r1.text) && /Need the staging DB/.test(r1.text) && /prod\.bak/.test(r1.text) && r1.approve && r1.approveGoal && r1.dismiss,
  structuredFieldsRendered: !!r1 && r1.fields.join(',') === 'probe,ifFits,ifNone,meanwhile' && /Probe for peers/.test(r1.text) && /is it safe to change/.test(r1.text) && !r2.fields.length,
  pulledCardNamesItsMachine: !!r2 && /MONSTER\/web-flow-autodev#1/.test(r2.text) && /legacy \/v1 routes/.test(r2.text),
  decidedCollapsedThenOpens: /Decided \(2\)/.test(seen.decidedToggle || '') && decided.length === 4 && decided.find((c) => c.id === 'r3')?.status === 'approved' && /in the arch chat/.test(decided.find((c) => c.id === 'r3')?.badge || '') && decided.find((c) => c.id === 'r4')?.status === 'dismissed' && /decided by spacex/.test(decided.find((c) => c.id === 'r4')?.foot || ''),
  peersNamedWithStatus: seen.peers.length === 2 && seen.peers[0].machine === 'MONSTER' && seen.peers[0].status === 'ok' && seen.peers[1].status === 'unreachable' && /connection refused/.test(seen.peers[1].text) && /this arch's scope/.test(seen.peers[1].text),
  howToFromTheHarness: /request_arch/.test(seen.howTo || '') && /not woken/.test(seen.howTo || ''),
  approveAsGoalPostsDriveAndShowsTheGoal: calls[0] === 'approve-goal:r1' && afterApprove.status === 'approved' && /goal running/.test(afterApprove.badge || '') && /goal: Need the staging DB/.test(afterApprove.goal || '') && /2\/20 polls/.test(afterApprove.goal || '') && /1 pending/.test(afterApprove.pending || ''),
  dismissConfirmsThenPosts: /MONSTER\/web-flow-autodev#1/.test(confirmText) && stillPending === 'pending' && calls[1] === 'dismiss:r2' && afterDismiss.status === 'dismissed' && afterDismiss.empty && calls.length === 2,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ seen, decided, afterApprove, confirmText, stillPending, afterDismiss, calls, pageErrors: errs, result, out: [path.join(OUT, 'manage-requests.png'), path.join(OUT, 'manage-requests-decided.png')] }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
