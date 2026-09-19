// Evidence shot for openspec policeman-handoff-detection: the Kanban rendered against a MOCKED
// board with one card whose conversation ended in a handoff (pending, target prg) and one whose
// handoff is tracked (a follow-up card exists). Asserts the Agent section's words, the attention
// styling on the pending one only, and the data attributes the arch / tests key on.
//
//   node client/tests/ui/shot-kanban-handoff.mjs
// Output: docs/screenshots/kanban-handoff.png

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
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [{ machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 2, agents: [
  { handle: 'spacex/web-flow-autodev#1', key: 'self/r-webflow', repoId: 'r-webflow', name: 'web-flow-autodev', remoteUrl: 'https://github.com/mirceta/web-flow-autodev.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't1' },
  { handle: 'spacex/prg#1', key: 'self/r-prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/mirceta/prg.git', branch: 'master', defaultBranch: 'master', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't2' },
] }] };
const who = (repoId, status) => ({ repoId, sourceId: null, status, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, updatedAt: now - 30 * H, verifiedStatus: 'doing' });
const node = (id, title, repoId, extra = {}) => ({ id, title, note: '', status: 'doing', repoId, sourceId: null, assignees: [who(repoId, 'doing')], x: 0, y: 0, createdAt: 1, updatedAt: now - 30 * H, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, createdBy: 'arch', verifiedStatus: 'doing', ...extra });
const PENDING = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', TRACKED = 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', FOLLOW = 'cbc74bc0934f4442b9bd2949203818af';
const board = {
  staleHours: 24, machines: [], scratch: '', goal: '', goalUpdatedAt: 0, edges: [],
  nodes: [
    node(PENDING, 'Knjiga pošte orchestration', 'r-webflow', { observation: { at: now - 25 * 60_000, by: 'policeman', state: 'handoff', summary: 'wrote HANDOFF.md: the invoice import in prg must skip voided rows; a prg agent should fix and merge it, then it will pull', target: 'prg', sessionId: null } }),
    node(TRACKED, 'Register export orchestration', 'r-webflow', { observation: { at: now - 3 * H, by: 'policeman', state: 'handoff', summary: 'the register export needs a prg fix for the CSV encoding', target: 'spacex/prg#1', followUpId: FOLLOW } }),
    node(FOLLOW, 'prg: fix the CSV encoding of the register export (handoff from #b2c3d4e5)', 'r-prg'),
  ],
  integrity: { checkedAt: now - 20_000, cards: 3, honest: 3, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] },
};
function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'spacex' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return { layout: { visible: ['todo', 'doing', 'committed', 'pr-opened', 'done'], widths: { todo: 200, doing: 520, committed: 200, 'pr-opened': 200, done: 200 } } };
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
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const card = (id) => `[data-task="${id}"]`;

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`${card(PENDING)} [data-agent-observation]`, { timeout: 15000 });
const read = async (id) => page.$eval(`${card(id)} [data-agent-observation]`, (e) => ({ key: e.dataset.agentObservation, target: e.dataset.observationTarget || null, followUp: e.dataset.observationFollowup || null, attention: e.classList.contains('kb__agent--attention'), text: e.textContent }));
const pending = await read(PENDING);
const tracked = await read(TRACKED);
await (await page.$('main') || page).screenshot({ path: path.join(OUT, 'kanban-handoff.png') });
await browser.close();
await server.close();

const result = {
  pendingReadsHandoffWithTarget: pending.key === 'handoff' && pending.target === 'prg' && pending.followUp === null && /Handoff pending/.test(pending.text) && /for prg/.test(pending.text) && /no follow-up task on the board yet/.test(pending.text),
  pendingNeedsAttention: pending.attention === true,
  trackedNamesTheFollowUp: tracked.key === 'handoff' && tracked.followUp === 'cbc74bc0' && /Handoff tracked/.test(tracked.text) && /follow-up card #cbc74bc0 exists/.test(tracked.text),
  trackedIsCalm: tracked.attention === false,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ pending, tracked, pageErrors: errs, result, out: path.join(OUT, 'kanban-handoff.png') }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
