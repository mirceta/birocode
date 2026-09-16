// Evidence shots for openspec cross-repo-effort-legs: the Kanban rendered against a MOCKED
// board carrying the Knjiga-pošte card as it should have been modelled — a DRIVER leg
// (web-flow-autodev, PR #21 merged) and a DRIVEN, AGENTLESS leg (prgcopies\copy1\prg, PR #166
// open) — once honestly in PR open (partially merged) and once claimed done. Asserts the Legs
// section names every leg with role / no-agent / merge state, "1 of 2 legs merged — partially
// merged, not done", the Board check on the done-claim names the unmerged leg, the
// `partially merged` filter chip exists, the detail lets you add an agentless leg by path
// (POST …/legs) and type a leg (POST …/legs/role), and a plain card shows no Legs section.
//
//   node client/tests/ui/shot-kanban-effort-legs.mjs
// Output: docs/screenshots/kanban-effort-legs.png, kanban-effort-legs-detail.png

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
const COPY = 'C:\\prgcopies\\copy1\\prg';
const PR21 = 'https://github.com/mirceta/web-flow-autodev/pull/21';
const PR166 = 'https://github.com/mirceta/prg/pull/166';
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [{ machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 2, agents: [
  { handle: 'spacex/web-flow-autodev#1', key: 'self/r-webflow', repoId: 'r-webflow', name: 'web-flow-autodev', remoteUrl: 'https://github.com/mirceta/web-flow-autodev.git', branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't1' },
  { handle: 'spacex/prg#1', key: 'self/r-prg', repoId: 'r-prg', name: 'prg', remoteUrl: 'https://github.com/mirceta/prg.git', branch: 'master', defaultBranch: 'master', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null, managed: true, docked: true, exists: true, tabId: 't2' },
] }] };
const leg = (o) => ({ sourceId: null, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: now - 30 * H, dispatchCount: 1, updatedAt: now - 2 * H, ...o });
const driver = (status) => leg({ repoId: 'r-webflow', role: 'driver', status, verifiedStatus: 'pr-merged', verifiedAt: now - 60_000, branch: 'knjiga-poste-prenos-orchestration', pushed: true, prUrl: PR21, prNumber: 21, mergeCommit: '4fbaff0c6bf9' });
const driven = (status) => leg({ repoId: `path:${COPY}`, path: COPY, role: 'driven', status, verifiedStatus: 'pr-opened', verifiedAt: now - 60_000, branch: 'knjiga-poste', pushed: true, prUrl: PR166, prNumber: 166, dispatchedAt: null, dispatchCount: 0 });
const node = (id, title, status, legs, extra = {}) => ({ id, title, note: '', status, repoId: legs[0]?.repoId || null, sourceId: null, assignees: legs, x: 0, y: 0, createdAt: 1, updatedAt: now - 2 * H, assignedBy: 'arch', assignedAt: now - 40 * H, dispatchedAt: legs[0]?.dispatchedAt || null, dispatchCount: legs[0]?.dispatchCount || 0, createdBy: 'arch', branch: legs[0]?.branch, prUrl: legs[0]?.prUrl, prNumber: legs[0]?.prNumber, verifiedStatus: legs[0]?.verifiedStatus, verifiedAt: legs[0]?.verifiedAt, ...extra });
const HONEST = 'cbc74bc0934f4442b9bd2949203818af', LYING = 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', PLAIN = 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
const board = {
  staleHours: 24, machines: [], scratch: '', goal: 'Knjiga pošte prenos: orchestration in web-flow-autodev drives prg.', goalUpdatedAt: now - 2 * H,
  edges: [],
  nodes: [
    node(HONEST, 'Knjiga pošte prenos orchestration', 'pr-opened', [driver('pr-merged'), driven('pr-opened')]),
    node(LYING, 'Knjiga pošte — as it was wrongly marked', 'done', [driver('done'), driven('done')], { warning: 'claimed done, verified: pr-merged' }),
    node(PLAIN, 'Kanban card sections', 'doing', [leg({ repoId: 'r-prg', status: 'doing' })]),
  ],
  integrity: { checkedAt: now - 20_000, cards: 3, honest: 2, dishonest: 1, stuck: 0, manual: 0, external: 0, flagged: [{ id: LYING, title: 'Knjiga pošte — as it was wrongly marked', state: 'dishonest', reason: 'column ahead of reality — cross-repo effort: 1 of 2 legs merged' }] },
};
const calls = [];
function mock(pathname, method, body) {
  const legs = /^\/api\/taskgraph\/nodes\/([^/]+)\/legs$/.exec(pathname);
  if (legs && method === 'POST') {
    calls.push({ method, pathname, body });
    const n = board.nodes.find((x) => x.id === legs[1]);
    n.assignees = [...n.assignees, leg({ repoId: body.path ? `path:${body.path}` : body.repoId, path: body.path || null, role: body.role || null, status: n.status, branch: body.branch || null, prUrl: body.prUrl || null, dispatchedAt: null, dispatchCount: 0 })];
    return n;
  }
  const role = /^\/api\/taskgraph\/nodes\/([^/]+)\/legs\/role$/.exec(pathname);
  if (role && method === 'POST') {
    calls.push({ method, pathname, body });
    const n = board.nodes.find((x) => x.id === role[1]);
    n.assignees = n.assignees.map((a) => (`${a.sourceId || ''}|${a.repoId}` === body.key ? { ...a, role: body.role || null } : a));
    return n;
  }
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'spacex' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return board;
    case '/api/taskgraph/layout': return { layout: { visible: ['todo', 'doing', 'committed', 'pr-opened', 'done'], widths: { todo: 240, doing: 360, committed: 240, 'pr-opened': 380, done: 380 } } };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.setItem('manageapp.kanbanSub', 'board');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const req = route.request();
  const { pathname } = new URL(req.url());
  let body = null;
  try { body = req.postDataJSON(); } catch { body = null; }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, req.method(), body)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const card = (id) => `[data-task="${id}"]`;

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector(`${card(HONEST)} [data-card-legs]`, { timeout: 15000 });
const legsOf = async (id) => page.$$eval(`${card(id)} [data-leg]`, (els) => els.map((e) => ({ key: e.dataset.leg, role: e.dataset.legRole, merged: e.dataset.legMerged, agentless: e.dataset.legAgentless || null, text: e.textContent })));
const honestLegs = await legsOf(HONEST);
const honestBrief = await page.$eval(`${card(HONEST)} [data-legs-brief]`, (e) => e.textContent);
const honestPartial = await page.$eval(`${card(HONEST)} [data-card-legs]`, (e) => e.dataset.legsPartial || null);
const honestCheck = await page.$eval(`${card(HONEST)} [data-board-check]`, (e) => ({ key: e.dataset.boardCheck, text: e.textContent }));
const lyingCheck = await page.$eval(`${card(LYING)} [data-board-check]`, (e) => ({ key: e.dataset.boardCheck, text: e.textContent }));
const lyingSteps = await page.$eval(`${card(LYING)} [data-card-progress]`, (e) => Array.from(e.querySelectorAll('[data-step]')).map((s) => `${s.dataset.step}:${s.dataset.stepState}`));
const plainHasLegs = !!(await page.$(`${card(PLAIN)} [data-card-legs]`));
const chips = await page.$$eval(`${card(HONEST)} [data-assignee]`, (els) => els.map((e) => e.textContent));
const flagChip = !!(await page.$('[data-flag-chip="partial-merge"]'));
await shotMain('kanban-effort-legs.png');

// The detail: type the plain card's leg as the driver, then add an agentless driven leg by path.
await page.click(`${card(PLAIN)} [data-card-progress]`);
await page.waitForSelector(`${card(PLAIN)} [data-leg-editor]`, { timeout: 5000 });
await page.selectOption(`${card(PLAIN)} [data-leg-role-select="|r-prg"]`, 'driver');
await page.waitForFunction((sel) => document.querySelector(`${sel} [data-card-legs]`), card(PLAIN), { timeout: 5000 });
await page.selectOption(`${card(PLAIN)} [data-leg-role-input]`, 'driven');
await page.fill(`${card(PLAIN)} [data-leg-path-input]`, 'C:\\prgcopies\\copy2\\skratek');
await page.fill(`${card(PLAIN)} [data-leg-branch-input]`, 'feat/sections');
await page.click(`${card(PLAIN)} [data-leg-add]`);
await page.waitForFunction((sel) => document.querySelectorAll(`${sel} [data-leg]`).length === 2, card(PLAIN), { timeout: 5000 });
const plainLegs = await legsOf(PLAIN);
const plainBrief = await page.$eval(`${card(PLAIN)} [data-legs-brief]`, (e) => e.textContent);
await shotMain('kanban-effort-legs-detail.png');

await browser.close();
await server.close();

const roleCall = calls.find((c) => c.pathname.endsWith('/legs/role'));
const addCall = calls.find((c) => c.pathname.endsWith('/legs'));
const result = {
  everyLegNamedWithRoleAndMergeState: honestLegs.length === 2
    && honestLegs[0].role === 'driver' && honestLegs[0].merged === 'true' && /spacex\/web-flow-autodev#1/.test(honestLegs[0].text) && /merged \(PR #21\)/.test(honestLegs[0].text)
    && honestLegs[1].role === 'driven' && honestLegs[1].merged === 'false' && honestLegs[1].agentless === 'true' && /copy1\/prg/.test(honestLegs[1].text) && /no agent/.test(honestLegs[1].text) && /PR #166 open, not merged/.test(honestLegs[1].text),
  partiallyMergedIsNamed: honestPartial === 'true' && /1 of 2 legs merged — partially merged, not done/.test(honestBrief),
  honestColumnStaysHonest: honestCheck.key === 'honest',
  doneClaimNamesTheUnmergedLeg: lyingCheck.key === 'unverified' && /1 of 2 legs merged on GitHub/.test(lyingCheck.text) && /copy1\/prg — PR #166 open, not merged/.test(lyingCheck.text) && /not done until every leg is merged/.test(lyingCheck.text) && lyingSteps.includes('done:current-unverified'),
  agentlessChipNeverNamesAnAgent: chips.some((t) => /copy1\/prg \(no agent\)/.test(t)) && !chips.some((t) => /prg#1/.test(t)),
  plainCardHasNoLegsSection: !plainHasLegs,
  filterChip: flagChip,
  typeALegFromTheDetail: !!roleCall && roleCall.body?.key === '|r-prg' && roleCall.body?.role === 'driver',
  addAnAgentlessLegByPath: !!addCall && addCall.body?.path === 'C:\\prgcopies\\copy2\\skratek' && addCall.body?.role === 'driven' && addCall.body?.branch === 'feat/sections' && addCall.body?.repoId === null
    && plainLegs.length === 2 && plainLegs[1].agentless === 'true' && /copy2\/skratek/.test(plainLegs[1].text) && /0 of 2 legs merged/.test(plainBrief),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ honestLegs, honestBrief, honestCheck, lyingCheck, lyingSteps, chips, plainLegs, plainBrief, calls, pageErrors: errs, result, out: ['kanban-effort-legs.png', 'kanban-effort-legs-detail.png'].map((f) => path.join(OUT, f)) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
