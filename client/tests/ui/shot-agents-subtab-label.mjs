// Evidence shot for fleet task 1dc2812c (Status → Agents: no machine prefix on the chip
// label): render the Management App's Fleet Status tab against a MOCKED fleet whose
// machines have long names, screenshot the Agents subtab, and assert in the page that
// every chip's visible label is the repo agent alone (no "<machine>/"), is not
// truncated, and still carries the full handle on data-handle.
//
//   node client/tests/ui/shot-agents-subtab-label.mjs            (from the repo root or client/)
//   SHOT_NAME=before SHOT_ASSERT=0 node client/tests/ui/shot-agents-subtab-label.mjs
// Output: .claudeweb-preview/agents-subtab-label-<SHOT_NAME|after>.png

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', '.claudeweb-preview');
mkdirSync(OUT, { recursive: true });
const name = process.env.SHOT_NAME || 'after';
const assertNow = (process.env.SHOT_ASSERT ?? '1') !== '0';

// Long machine names: the case the Operator reported (the prefix ate the label).
const machines = [
  { label: 'fotrsqlbirokrat', sourceId: null, self: true },
  { label: 'DESKTOP-POAPPP3-living-room-workstation', sourceId: 'src-living' },
  { label: 'razvoj2016', sourceId: 'src-razvoj' },
];
const repos = [
  { name: 'Claude Web (this app)', slug: 'claude-web-this-app', remote: 'https://github.com/mirceta/birocode.git' },
  { name: 'prg', slug: 'prg', remote: 'https://github.com/acme/prg.git' },
  { name: 'prg', slug: 'prg#2', remote: 'https://github.com/acme/prg-2.git' },
];
const fleet = {
  at: Date.now(), hubVersion: '1.0.0+test',
  machines: machines.map((m, mi) => ({
    machine: m.label, sourceId: m.self ? 'self' : m.sourceId, self: !!m.self, address: m.self ? null : `http://${m.sourceId}:5099`,
    reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false,
    gateOpen: true, allowSends: true, managedCount: 3,
    agents: repos.map((r, ri) => ({
      handle: `${m.label}/${r.slug}`, key: `${m.self ? 'self' : m.sourceId}/${r.slug}-${mi}`, repoId: `${r.slug}-${mi}`, name: r.name, remoteUrl: r.remote,
      branch: ri === 0 ? 'main' : `feature/x${mi}`, defaultBranch: 'main', onDefault: ri === 0, dirty: false, availability: ri === 0 ? 'available' : 'claimed',
      lastActor: 'human', runningSince: mi === 1 && ri === 1 ? Date.now() - 90_000 : null, managed: ri < 2, docked: true, exists: true, tabId: 't1',
    })),
  })),
};

function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'fotrsqlbirokrat' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return { staleHours: 24, nodes: [], edges: [], machines: [] };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.fleetTab', 'agents');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.removeItem('manageapp.fleetFilters');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('[data-agent] .fs__chip-name', { timeout: 60000 });
await page.waitForTimeout(300);
const chips = await page.$$eval('[data-agent] .fs__chip-name', (els) => els.map((e) => ({
  // The label's own text: the glyph + monogram AgentMark ("ft/cwt") is a child
  // element, not the label, so only this element's text nodes count.
  text: Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(),
  handle: e.dataset.handle,
  truncated: e.scrollWidth > e.clientWidth,
  machine: e.closest('[data-machine]')?.dataset.machine,
})));
const headers = await page.$$eval('.fs__mlabel', (els) => els.map((e) => e.textContent.trim()));
const shot = path.join(OUT, `agents-subtab-label-${name}.png`);
await (await page.$('main') || page).screenshot({ path: shot });
await browser.close();
await server.close();

const withPrefix = chips.filter((c) => c.text.includes('/'));
const truncated = chips.filter((c) => c.truncated);
const lostHandle = chips.filter((c) => !c.handle || !c.handle.startsWith(`${c.machine}/`));
const missingHeader = machines.filter((m) => !headers.includes(m.label));
console.log(JSON.stringify({ name, chips: chips.map((c) => `${c.machine} :: "${c.text}" (handle ${c.handle}${c.truncated ? ', TRUNCATED' : ''})`), headers, withPrefix: withPrefix.length, truncated: truncated.length, lostHandle: lostHandle.length, missingHeader, pageErrors: errs, out: shot }, null, 1));
if (!assertNow) process.exit(errs.length === 0 ? 0 : 1);
process.exit(withPrefix.length === 0 && truncated.length === 0 && lostHandle.length === 0 && missingHeader.length === 0 && errs.length === 0 ? 0 : 1);
