// Evidence shot for fleet task 4ddcfce3 (agent badge identity): render the Management
// App's Fleet Status tab and Kanban board against a MOCKED fleet where the same two
// repositories run on three machines — six agents sharing one repo hue — and screenshot
// both views, so the PR shows same-hue agents told apart by glyph + monogram. Also
// asserts, in the page, that every agent's mark is identical in the two views.
//
//   node client/tests/ui/shot-agent-badges.mjs        (from the repo root or client/)
// Output: .claudeweb-preview/agent-badges-fleet.png, agent-badges-kanban.png

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', '.claudeweb-preview');
mkdirSync(OUT, { recursive: true });

// Three machines, each running the same two repos (identical remote URLs → identical
// repo hue), plus one extra repo on the first machine.
const machines = [
  { label: 'razvoj2016', sourceId: null, self: true },
  { label: 'living room', sourceId: 'src-living' },
  { label: 'DESKTOP-POAPPP3', sourceId: 'src-desk' },
];
const repos = [
  { name: 'prg', slug: 'prg', remote: 'https://github.com/acme/prg.git' },
  { name: 'birocode', slug: 'birocode', remote: 'git@github.com:acme/birocode.git' },
];
const fleet = {
  at: Date.now(), hubVersion: '1.0.0+test',
  machines: machines.map((m, mi) => ({
    machine: m.label, sourceId: m.self ? 'self' : m.sourceId, self: !!m.self, address: m.self ? null : `http://${m.sourceId}:5099`,
    reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false,
    gateOpen: true, allowSends: true, managedCount: 2,
    agents: repos.concat(mi === 0 ? [{ name: 'game-arcade', slug: 'game-arcade', remote: 'https://github.com/acme/game-arcade.git' }] : []).map((r, ri) => ({
      handle: `${m.label}/${r.slug}#1`, key: `${m.self ? 'self' : m.sourceId}/${r.slug}-${mi}`, repoId: `${r.slug}-${mi}`, name: r.name, remoteUrl: r.remote,
      branch: ri === 0 ? 'main' : `feature/x${mi}`, defaultBranch: 'main', onDefault: ri === 0, dirty: false, availability: ri === 0 ? 'available' : 'claimed',
      lastActor: 'human', runningSince: mi === 1 && ri === 0 ? Date.now() - 90_000 : null, managed: true, docked: true, exists: true, tabId: 't1',
    })),
  })),
};
const assignee = (mi, slug, status = 'doing') => ({ repoId: `${slug}-${mi}`, sourceId: machines[mi].self ? null : machines[mi].sourceId, status });
const board = {
  staleHours: 24,
  nodes: [
    { id: 't1', title: 'Same repo, three machines: prg everywhere', note: '', status: 'doing', repoId: 'prg-0', sourceId: null, assignees: [assignee(0, 'prg'), assignee(1, 'prg'), assignee(2, 'prg')], x: 0, y: 0, createdAt: 1, updatedAt: Date.now(), assignedBy: 'operator', assignedAt: 1, dispatchedAt: Date.now() - 600_000, dispatchCount: 1 },
    { id: 't2', title: 'birocode on the living room', note: '', status: 'todo', repoId: 'birocode-1', sourceId: 'src-living', assignees: [assignee(1, 'birocode', 'todo')], x: 0, y: 0, createdAt: 1, updatedAt: Date.now(), assignedBy: 'operator', assignedAt: 1 },
    { id: 't3', title: 'birocode on the desktop', note: '', status: 'todo', repoId: 'birocode-2', sourceId: 'src-desk', assignees: [assignee(2, 'birocode', 'todo')], x: 0, y: 0, createdAt: 1, updatedAt: Date.now(), assignedBy: 'operator', assignedAt: 1 },
    { id: 't4', title: 'birocode here', note: '', status: 'done', repoId: 'birocode-0', sourceId: null, assignees: [assignee(0, 'birocode', 'done')], x: 0, y: 0, createdAt: 1, updatedAt: Date.now(), assignedBy: 'operator', assignedAt: 1 },
    { id: 't5', title: 'game arcade', note: '', status: 'todo', repoId: 'game-arcade-0', sourceId: null, assignees: [assignee(0, 'game-arcade', 'todo')], x: 0, y: 0, createdAt: 1, updatedAt: Date.now(), assignedBy: 'operator', assignedAt: 1 },
  ],
  edges: [], machines: [],
};

function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'razvoj2016' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return board;
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.fleetTab', 'agents');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.removeItem('claudeweb_taskgraph_palette');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const readMarks = () => page.$$eval('[data-agent-mark]', (els) => els.map((e) => [e.dataset.agentMark, e.dataset.glyph, e.dataset.monogram, e.getAttribute('aria-label')]));

await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-agent] [data-agent-mark]', { timeout: 15000 });
const fleetMarks = await readMarks();
const fleetShot = await page.$('main') || page;
await fleetShot.screenshot({ path: path.join(OUT, 'agent-badges-fleet.png') });

await page.goto(`${base}/manage.html?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.kb__chip--who [data-agent-mark]', { timeout: 15000 });
const kanbanMarks = await readMarks();
await (await page.$('main') || page).screenshot({ path: path.join(OUT, 'agent-badges-kanban.png') });
await browser.close();
await server.close();

// Parity: every agent seen on the board carries the identical glyph + monogram on Fleet Status.
const byKey = new Map(fleetMarks.map(([k, g, m, l]) => [k, `${g} ${m} ${l}`]));
const mismatches = kanbanMarks.filter(([k, g, m, l]) => byKey.get(k) !== `${g} ${m} ${l}`);
const distinctFleet = new Set(fleetMarks.map(([, g, m]) => `${g}|${m}`)).size;
console.log(JSON.stringify({
  fleetAgents: fleetMarks.length, distinctMarks: distinctFleet,
  fleetMarks: fleetMarks.map(([, g, m, l]) => `${g} ${m} (${l})`),
  kanbanChips: kanbanMarks.length, mismatches, pageErrors: errs,
  out: [path.join(OUT, 'agent-badges-fleet.png'), path.join(OUT, 'agent-badges-kanban.png')],
}, null, 1));
process.exit(mismatches.length === 0 && errs.length === 0 && distinctFleet === fleetMarks.length ? 0 : 1);
