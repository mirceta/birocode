// Evidence shots for fleet task 15e00e7d (openspec status-harness-primary-button):
// Management → Status → an agent's details — "open harness" as the obvious primary action.
//
//   node tests/ui/shot-status-harness-button.mjs [before|after]
//
// Both runs shoot the open agent details in light AND dark (the dashboard follows
// prefers-color-scheme) and at a narrow laptop width:
//   docs/screenshots/status-harness-button-<tag>[-dark|-narrow].png
// The "after" run also ASSERTS the hierarchy: the button is the first focusable action
// inside the details, its hit target is ≥ 40px tall and ≥ 200px wide, its font ≥ 14px,
// every other control in the details is visibly smaller, the behaviour contract is
// untouched (same data-open-agent-tab / url the Kanban badge uses, focus-not-reload on a
// second click), and the unknown-address agent still shows the button disabled with the
// honest note.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const tag = process.argv[2] === 'before' ? 'before' : 'after';
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const now = Date.now();
const agent = (self, sourceId, repoId, name, label, extra = {}) => ({
  handle: `${label}/${name}#1`, key: self ? repoId : `${sourceId}/${repoId}`, repoId, name, remoteUrl: `https://github.com/mirceta/${name}.git`,
  branch: 'main', defaultBranch: 'main', onDefault: true, dirty: false, availability: 'available', lastActor: 'human', runningSince: null,
  managed: true, docked: true, exists: true, tabId: self ? 't1' : null, occupancy: { occupied: false, source: 'auto' }, ...extra,
});
const fleet = { at: now, hubVersion: '1.0.0+test', machines: [
  { machine: 'MONSTER', sourceId: 'src-monster', self: false, address: 'http://192.168.1.20:5099', reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: true, acceptsUpgrades: true, gateOpen: true, allowSends: true, managedCount: 1, agents: [
    agent(false, 'src-monster', 'r-webflow', 'web-flow-autodev', 'MONSTER', { branch: 'feat/exporter', onDefault: false }),
  ] },
  { machine: 'laptop', sourceId: 'src-laptop', self: false, address: null, reachable: true, status: 'ok', detail: null, version: '1.0.0+test', behind: false, acceptsSends: false, acceptsUpgrades: false, gateOpen: false, allowSends: false, managedCount: 1, agents: [
    agent(false, 'src-laptop', 'r-x', 'x', 'laptop'),
  ] },
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

async function scene({ colorScheme, width, file, probe }) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: 2, colorScheme });
  await ctx.addInitScript(() => {
    localStorage.setItem('manageapp.layout', 'tabs');
    localStorage.setItem('manageapp.hidden', '[]');
    localStorage.setItem('claudeweb_ui_mode', 'advanced');
    localStorage.removeItem('manageapp.fleetFilters');
    window.__opens = []; window.__handles = {};
    window.open = (url, name) => {
      window.__opens.push({ url, name });
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
  await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-agent="src-monster/r-webflow"]', { timeout: 60000 });
  await page.click('[data-agent="src-monster/r-webflow"]');
  await page.waitForSelector('[data-detail="src-monster/r-webflow"]', { timeout: 10000 });
  const el = await page.$('[data-detail="src-monster/r-webflow"]');
  await el.screenshot({ path: path.join(OUT, file) });
  const out = probe ? await probe(page) : null;
  await ctx.close();
  return { out, errs };
}

// The three shots this run contributes.
await scene({ colorScheme: 'light', width: 1500, file: `status-harness-button-${tag}.png` });
await scene({ colorScheme: 'dark', width: 1500, file: `status-harness-button-${tag}-dark.png` });
const { out: probed, errs } = await scene({
  colorScheme: 'light', width: 1100, file: `status-harness-button-${tag}-narrow.png`,
  probe: async (page) => {
    const geom = await page.evaluate(() => {
      const detail = document.querySelector('[data-detail="src-monster/r-webflow"]');
      const btn = detail.querySelector('[data-open-agent-harness]');
      const r = btn.getBoundingClientRect();
      const controls = [...detail.querySelectorAll('button')].filter((b) => b !== btn);
      const actions = [...detail.querySelectorAll('button, a')];
      return {
        tab: btn.dataset.openAgentTab, url: btn.dataset.openAgentUrl, disabled: btn.disabled, text: btn.textContent.trim(),
        w: r.width, h: r.height, font: parseFloat(getComputedStyle(btn).fontSize),
        isFirstAction: actions[0] === btn,
        othersSmaller: controls.every((b) => b.getBoundingClientRect().height < r.height - 8),
      };
    });
    await page.click('[data-open-agent-harness="src-monster/r-webflow"]');
    await page.click('[data-open-agent-harness="src-monster/r-webflow"]');
    const opens = await page.evaluate(() => ({ n: window.__opens.length, handle: window.__handles['birocode-agent-src-monster_r-webflow'] ? { href: window.__handles['birocode-agent-src-monster_r-webflow']._href, focused: window.__handles['birocode-agent-src-monster_r-webflow'].focused } : null }));
    await page.click('[data-agent="src-laptop/r-x"]');
    await page.waitForSelector('[data-open-agent-harness="src-laptop/r-x"]', { timeout: 10000 });
    const noAddr = await page.$eval('[data-open-agent-harness="src-laptop/r-x"]', (b) => ({ disabled: b.disabled, note: b.parentElement.textContent }));
    return { geom, opens, noAddr };
  },
});

await browser.close();
await server.close();

if (tag === 'before') {
  console.log(JSON.stringify({ tag, shots: 3, geomNow: probed.geom, pageErrors: errs }, null, 1));
  process.exit(errs.length === 0 ? 0 : 1);
}
const g = probed.geom;
const result = {
  primaryIsTheFirstAction: g.isFirstAction,
  bigHitTarget: g.h >= 40 && g.w >= 200 && g.font >= 14,
  labelAndIcon: /open harness/i.test(g.text) && /[🖥↗]/u.test(g.text),
  everyOtherControlIsSmaller: g.othersSmaller,
  behaviourUntouched: g.tab === 'src-monster|r-webflow' && g.url === 'http://192.168.1.20:5099/studio?agent=r-webflow'
    && probed.opens.n === 2 && probed.opens.handle?.href === 'http://192.168.1.20:5099/studio?agent=r-webflow' && probed.opens.handle.focused === 2,
  unknownAddressStillHonest: probed.noAddr.disabled && /address unknown/.test(probed.noAddr.note),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ tag, geom: g, opens: probed.opens, noAddr: probed.noAddr, pageErrors: errs, result }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
