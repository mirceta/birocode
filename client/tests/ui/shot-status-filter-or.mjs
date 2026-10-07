// Evidence shot for fleet task ca7d22b8 (openspec status-filter-or): Management → Status → Agents
// over the REAL fleet snapshot of this hub (client/tests/ui/fixtures/fleet-status-live.json,
// captured from GET /api/arch/fleet/status). Types "prg | webflow" into the agent filter and
// asserts both kinds of agent survive, that "prg, webflow" and "*prg*" behave the same, that a
// single pattern still matches as before, that the shown count equals the chips listed, that the
// state chips' counts follow the OR filter, and that the hint is visible. Screenshots the tab.
//
//   node client/tests/ui/shot-status-filter-or.mjs [--name <suffix>]
// Output: docs/screenshots/status-filter-or<suffix>.png

import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const suffix = process.argv.includes('--name') ? process.argv[process.argv.indexOf('--name') + 1] : '';
const fleet = JSON.parse(readFileSync(path.join(clientRoot, 'tests', 'ui', 'fixtures', 'fleet-status-live.json'), 'utf8').replace(/^\uFEFF/, ''));
const now = Date.now();
function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: fleet.machines.find((m) => m.self)?.machine || 'hub' }, gateOpen: true, killSwitch: true };
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
  localStorage.setItem('manageapp.fleetAgentsLayout', 'merged');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const shotMain = async (file) => (await page.$('main') || page).screenshot({ path: path.join(OUT, file) });
const read = () => page.evaluate(() => ({
  names: [...document.querySelectorAll('[data-agent]')].map((c) => c.querySelector('.fs__chip-name')?.dataset.label || c.dataset.agent),
  shown: document.querySelector('[data-shown]')?.dataset.shown,
  total: document.querySelector('[data-shown]')?.dataset.total,
  counts: Object.fromEntries([...document.querySelectorAll('[data-filter]')].map((b) => [b.dataset.filter, b.querySelector('.fs__count')?.textContent])),
  noMatch: !!document.querySelector('[data-no-match]'),
  placeholder: document.querySelector('[data-search]')?.getAttribute('placeholder'),
  hint: document.querySelector('[data-search-hint]')?.textContent || null,
  value: document.querySelector('[data-search]')?.value,
  persisted: localStorage.getItem('manageapp.fleetFilters'),
}));
const type = async (q) => { await page.fill('[data-search]', q); await page.waitForTimeout(400); return read(); };

await page.goto(`${base}/manage.html?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-agent]', { timeout: 60000 });
const all = await read();
const or = await type('prg | webflow');
await shotMain(`status-filter-or${suffix}.png`);
const comma = await type('prg, webflow');
const star = await type('*prg*');
const single = await type('prg');
const spaced = await type('  prg  |  webflow  ');
const trailing = await type('prg |');
const andInside = await type('spacex prg | webflow');
// Persistence: the typed value survives a reload.
await page.fill('[data-search]', 'prg | webflow');
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-agent]', { timeout: 60000 });
const afterReload = await read();
await browser.close();
await server.close();

const hasPrg = (names) => names.some((n) => /prg/i.test(n));
const hasWebflow = (names) => names.some((n) => /webflow|web-flow/i.test(n));
const onlyThose = (names) => names.every((n) => /prg|webflow|web-flow/i.test(n));
const result = {
  fixtureIsRealFleet: fleet.machines.length >= 2 && Number(all.total) >= 10,
  orWithPipeMatchesBothKinds: hasPrg(or.names) && hasWebflow(or.names) && onlyThose(or.names) && !or.noMatch,
  shownCountEqualsListed: or.shown === String(or.names.length) && or.counts.all === String(or.names.length),
  commaIsTheSameAsPipe: comma.names.join(',') === or.names.join(','),
  starWildcardEqualsPlain: star.names.join(',') === single.names.join(','),
  singlePatternUnchanged: hasPrg(single.names) && single.names.every((n) => /prg/i.test(n)) && !hasWebflow(single.names),
  whitespaceAroundSeparatorsIgnored: spaced.names.join(',') === or.names.join(','),
  trailingSeparatorIsJustOnePattern: trailing.names.join(',') === single.names.join(','),
  wordsStillAndInsideAnAlternative: andInside.names.length <= or.names.length && andInside.names.every((n) => /prg|webflow|web-flow/i.test(n)),
  hintShown: /either/.test(or.placeholder || '') || /either/.test(or.hint || ''),
  persistsAcrossReload: afterReload.value === 'prg | webflow' && afterReload.names.join(',') === or.names.join(','),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ all: { shown: all.shown, total: all.total }, or, comma: comma.names, star: star.names, single: single.names, afterReload: { value: afterReload.value, shown: afterReload.shown }, pageErrors: errs, result, out: path.join(OUT, `status-filter-or${suffix}.png`) }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
