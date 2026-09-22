// Evidence shot for board task b06d56c4 (openspec status-open-harness): Management → Status,
// an agent's expanded details carry "open harness ↗" that calls the SAME helper the Kanban
// badge calls. window.open is stubbed to record the named target: a click on a peer agent opens
// the tab named exactly as the badge would (sourceId|repoId) at the peer's studio link; a self
// agent's tab is named '|repoId' at this harness; a second click on the same agent finds the
// existing tab and never renavigates it; an unreachable machine's button is disabled.
//
//   node client/tests/ui/shot-status-open-harness.mjs
// Output: docs/screenshots/status-open-harness.png

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
const agent = (self, sourceId, repoId, name, label) => ({
  handle: `${label}/${name}#1`, key: self ? repoId : `${sourceId}/${repoId}`, repoId, name, remoteUrl: `https://github.com/mirceta/${name}.git`,
  branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null,
  managed: true, docked: true, exists: true, tabId: self ? 't1' : null, occupancy: { occupied: false, source: 'auto' },
});
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [
  { machine: 'spacex', sourceId: 'self', self: true, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: false, gateOpen: true, allowSends: true, managedCount: 1, agents: [agent(true, 'self', 'r-prg', 'prg', 'spacex')] },
  { machine: 'MONSTER', sourceId: 'src-monster', self: false, address: 'http://192.168.1.20:5099', reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true, managedCount: 1, agents: [agent(false, 'src-monster', 'r-webflow', 'web-flow-autodev', 'MONSTER')] },
  { machine: 'laptop', sourceId: 'src-laptop', self: false, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: false, acceptsUpgrades: false, gateOpen: false, allowSends: false, managedCount: 1, agents: [agent(false, 'src-laptop', 'r-x', 'x', 'laptop')] },
] };
function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'spacex' }, gateOpen: true, killSwitch: true };
    case '/api/arch/fleet/status': return fleet;
    case '/api/taskgraph': return { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  // The default placement: per-agent tabs beside the dashboard (the badge's own default).
  localStorage.removeItem('manageapp.harnessWindow');
  // The stub the harness-window shots use: per-name handles, a fresh one is about:blank.
  window.__opens = []; window.__handles = {};
  window.open = (url, name, features) => {
    window.__opens.push({ url, name, features });
    if (!window.__handles[name]) window.__handles[name] = { name, _href: 'about:blank', focused: 0, focus() { this.focused++; }, get location() { const h = this; return { get href() { return h._href; }, set href(v) { h._href = v; } }; } };
    return window.__handles[name];
  };
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });

await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-agent]', { timeout: 60000 });

// 1. The peer agent: open its details, the button names the badge's tab key and the peer's studio link.
await page.click('[data-agent="src-monster/r-webflow"]');
await page.waitForSelector('[data-open-agent-harness="src-monster/r-webflow"]', { timeout: 10000 });
const peer = await page.$eval('[data-open-agent-harness="src-monster/r-webflow"]', (b) => ({ tab: b.dataset.openAgentTab, url: b.dataset.openAgentUrl, disabled: b.disabled, text: b.textContent }));
await shotMain('status-open-harness.png');
await page.click('[data-open-agent-harness="src-monster/r-webflow"]');
const first = await page.evaluate(() => ({ opens: window.__opens.slice(), handle: window.__handles['birocode-agent-src-monster_r-webflow'] ? { href: window.__handles['birocode-agent-src-monster_r-webflow']._href, focused: window.__handles['birocode-agent-src-monster_r-webflow'].focused } : null }));
// 2. A second click: the existing tab is found and focused, never navigated again.
await page.click('[data-open-agent-harness="src-monster/r-webflow"]');
const second = await page.evaluate(() => ({ opens: window.__opens.length, handle: { href: window.__handles['birocode-agent-src-monster_r-webflow']._href, focused: window.__handles['birocode-agent-src-monster_r-webflow'].focused } }));
// 3. The self agent: this harness's own studio link, the '|repoId' tab key the badge uses for local assignees.
await page.click('[data-agent="r-prg"]');
await page.waitForSelector('[data-open-agent-harness="r-prg"]', { timeout: 10000 });
const self = await page.$eval('[data-open-agent-harness="r-prg"]', (b) => ({ tab: b.dataset.openAgentTab, url: b.dataset.openAgentUrl, disabled: b.disabled }));
await page.click('[data-open-agent-harness="r-prg"]');
const selfOpen = await page.evaluate(() => window.__opens.at(-1));
// 4. A machine without an address: the button is there but disabled and says why.
await page.click('[data-agent="src-laptop/r-x"]');
await page.waitForSelector('[data-open-agent-harness="src-laptop/r-x"]', { timeout: 10000 });
const noAddr = await page.$eval('[data-open-agent-harness="src-laptop/r-x"]', (b) => ({ disabled: b.disabled, url: b.dataset.openAgentUrl, note: b.parentElement.textContent }));
await browser.close();
await server.close();

const result = {
  buttonInDetailsBesideOccupancy: /open harness/.test(peer.text) && !peer.disabled,
  peerTabKeyAndUrlMatchTheBadge: peer.tab === 'src-monster|r-webflow' && peer.url === 'http://192.168.1.20:5099/studio?agent=r-webflow',
  firstClickOpensNamedTabAndNavigatesIt: first.opens.length === 1 && first.opens[0].name === 'birocode-agent-src-monster_r-webflow' && first.opens[0].url === '' && first.opens[0].features === undefined && first.handle?.href === 'http://192.168.1.20:5099/studio?agent=r-webflow' && first.handle.focused === 1,
  secondClickFocusesWithoutReload: second.opens === 2 && second.handle.href === 'http://192.168.1.20:5099/studio?agent=r-webflow' && second.handle.focused === 2,
  selfAgentUsesThisHarnessAndLocalKey: self.tab === '|r-prg' && /\/studio\?agent=r-prg$/.test(self.url) && !self.disabled && selfOpen.name === 'birocode-agent-_r-prg',
  unknownAddressIsDisabledHonestly: noAddr.disabled && noAddr.url === '' && /address unknown/.test(noAddr.note),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ peer, first, second, self, selfOpen, noAddr, pageErrors: errs, result, out: path.join(OUT, 'status-open-harness.png') }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
