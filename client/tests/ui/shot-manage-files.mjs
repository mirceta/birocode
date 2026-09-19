// Evidence shot for the Management dashboard's File System tab (openspec hub-file-system):
// the real Management App over a mocked GET /api/hubfs — this hub's store with a fresh and a
// stale file, one reachable peer with a file the arch moved, one dark peer named with its
// status — asserts the per-machine blocks, the provenance columns, the stale mark, the
// download link, the delete confirmation (and that Cancel leaves the file), and the how-to
// with the arch / repo-agent phrasings and the rules; screenshots the tab.
//
//   node client/tests/ui/shot-manage-files.mjs
// Output: docs/screenshots/manage-files.png

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
const D = 24 * 3600_000;
const file = (machine, p, by, from, at, size, version, note, via) => ({ machine, path: p, size, sizeHuman: `${(size / 1024).toFixed(1)} KB`, sha256: 'abc', contentType: 'application/json', uploadedBy: by, uploadedFrom: from, uploadedAt: at, updatedAt: at, version, note, via: via || null });
let hubFiles = [
  file('spacex', 'prg/fixtures/customers.json', 'spacex/prg#1', 'spacex', now - 3600_000, 14542, 1, 'test fixtures'),
  file('spacex', 'web/testdata.sql', 'MONSTER/web-flow-autodev#1', 'MONSTER', now - 2 * D, 2_200_000, 2, null, 'arch ← MONSTER'),
  file('spacex', 'old/dump.zip', 'spacex/prg#1', 'spacex', now - 45 * D, 900_000, 1, 'ancient'),
];
const hubfs = () => ({
  machine: 'spacex',
  stats: { files: hubFiles.length, bytes: hubFiles.reduce((n, f) => n + f.size, 0), maxFileBytes: 64 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 * 1024, maxFiles: 5000, staleDays: 30, root: 'C:/x' },
  files: hubFiles,
  peers: [
    { machine: 'MONSTER', sourceId: 'src-monster', status: 'ok', detail: null, allowSends: true, files: [file('MONSTER', 'web/testdata.sql', 'MONSTER/web-flow-autodev#1', 'MONSTER', now - 2 * D, 2_200_000, 1, null)] },
    { machine: 'laptop', sourceId: 'src-laptop', status: 'unreachable', detail: 'connection refused', allowSends: false, files: [] },
  ],
  howTo: {
    hub: 'spacex',
    rules: ['A hub path is a short forward-slash path of plain segments…', 'One file up to 64 MB; the store up to 2 GB / 5000 files.', 'Nothing expires by itself: files older than 30 days are marked stale here, and you delete them.'],
    arch: ['arch, have spacex/prg#1 upload its test fixtures (tests/fixtures) to the hub as prg/fixtures/, then have MONSTER/web-flow-autodev#1 download them into tests/fixtures.', 'arch, what is on the hub file system?'],
    repoAgent: ['upload tests/fixtures/customers.json to the hub file system as prg/fixtures/customers.json (hub_upload)', 'list the hub file system (hub_files) and download prg/fixtures/customers.json into tests/fixtures/ (hub_download)'],
    tools: { repoAgent: ['hub_upload', 'hub_download', 'hub_files'], arch: ['hub_files', 'hub_transfer'] },
  },
});
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [{ machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 0, agents: [] }] };
const board = { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
function mock(method, pathname, search) {
  if (pathname === '/api/hubfs/file' && method === 'DELETE') { const p = new URLSearchParams(search).get('path'); hubFiles = hubFiles.filter((f) => f.path !== p); return { ok: true, path: p }; }
  switch (pathname) {
    case '/api/hubfs': return hubfs();
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
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(route.request().method(), u.pathname, u.search)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=files&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-fs-pane]', { timeout: 15000 });
await page.waitForSelector('[data-fs-table="spacex"]', { timeout: 15000 });
const seen = await page.evaluate(() => ({
  tabLabel: [...document.querySelectorAll('button, [role=tab]')].map((b) => b.textContent.trim()).find((t) => /File System/.test(t)) || null,
  machines: [...document.querySelectorAll('[data-fs-machine]')].map((e) => ({ machine: e.dataset.fsMachine, self: e.dataset.fsSelf === '1', status: e.dataset.fsPeerStatus || 'self', rows: e.querySelectorAll('[data-fs-file]').length, head: e.querySelector('h4')?.textContent })),
  hubRows: [...document.querySelectorAll('[data-fs-table="spacex"] [data-fs-file]')].map((r) => ({ path: r.dataset.fsFile, stale: r.dataset.fsStale, text: r.textContent })),
  stats: document.querySelector('[data-fs-stats]')?.textContent,
  download: document.querySelector('[data-fs-download="prg/fixtures/customers.json"]')?.getAttribute('href'),
  howArch: [...document.querySelectorAll('[data-fs-howto-arch] code')].map((c) => c.textContent),
  howAgent: [...document.querySelectorAll('[data-fs-howto-agent] code')].map((c) => c.textContent),
  rules: document.querySelectorAll('[data-fs-rules] li').length,
}));
await shotMain('manage-files.png');

// Delete: confirm names the path; Cancel keeps it; Delete now removes it (the mock drops it).
await page.click('[data-fs-delete="old/dump.zip"]');
await page.waitForSelector('[data-fs-confirm]', { timeout: 5000 });
const confirmText = await page.$eval('[data-fs-confirm]', (e) => e.textContent);
await page.click('[data-fs-confirm-no]');
const stillThere = !!(await page.$('[data-fs-file="old/dump.zip"]'));
await page.click('[data-fs-delete="old/dump.zip"]');
await page.waitForSelector('[data-fs-confirm-yes]', { timeout: 5000 });
await page.click('[data-fs-confirm-yes]');
await page.waitForFunction(() => !document.querySelector('[data-fs-file="old/dump.zip"]'), null, { timeout: 8000 });
const gone = !(await page.$('[data-fs-file="old/dump.zip"]'));
await browser.close();
await server.close();

const monster = seen.machines.find((m) => m.machine === 'MONSTER');
const laptop = seen.machines.find((m) => m.machine === 'laptop');
const moved = seen.hubRows.find((r) => r.path === 'web/testdata.sql');
const result = {
  fileSystemTabListed: seen.tabLabel !== null,
  hubBlockFirstWithThreeFiles: seen.machines[0]?.self === true && seen.machines[0].rows === 3,
  peerBlocksShown: !!monster && monster.status === 'ok' && monster.rows === 1 && !!laptop && laptop.status === 'unreachable' && /connection refused/.test(laptop.head || ''),
  provenanceAndViaShown: !!moved && /MONSTER\/web-flow-autodev#1/.test(moved.text) && /@ MONSTER/.test(moved.text) && /arch ← MONSTER/.test(moved.text) && /2\.1 MB|2148\.4 KB/.test(moved.text),
  staleMarked: seen.hubRows.find((r) => r.path === 'old/dump.zip')?.stale === '1' && seen.hubRows.find((r) => r.path === 'prg/fixtures/customers.json')?.stale === '0',
  statsAndDownload: /4 files/.test(seen.stats || '') && /64\.0 MB|64 MB/.test(seen.stats || '') && /\/api\/hubfs\/file\?path=prg%2Ffixtures%2Fcustomers\.json/.test(seen.download || ''),   // 4 = the fleet's files (hub 3 + MONSTER 1)
  howToFromTheHarness: seen.howArch.length === 2 && /arch, have spacex\/prg#1 upload/.test(seen.howArch[0]) && seen.howAgent.length === 2 && /hub_upload/.test(seen.howAgent[0]) && seen.rules === 3,
  deleteConfirmsThenRemoves: /old\/dump\.zip/.test(confirmText) && stillThere && gone,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ seen, confirmText, stillThere, gone, pageErrors: errs, result, out: path.join(OUT, 'manage-files.png') }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
