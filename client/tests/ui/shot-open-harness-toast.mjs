// Evidence for fleet task 6ee431ea (openspec manage-toast-overlay): the "harness opened"
// notification is an overlay toast, never an in-flow banner that pushes the GUI down.
//
//   node tests/ui/shot-open-harness-toast.mjs before   (OLD code: measures the layout jump)
//   node tests/ui/shot-open-harness-toast.mjs          (new toast, with assertions)
//
// The decisive measurement: the top of the dashboard body (.mg__body) before and after the
// notification fires. Before-change: the banner inserts between the header and the body, so
// the body moves DOWN by its height. After: zero movement (the layer is position:fixed and
// click-transparent), toasts stack, quiet ones fade after ~4 s with the clock paused on
// hover, sticky "cannot open" ones stay with their link, × and click-anywhere dismiss,
// role="status" rows in an aria-live="polite" layer.
//
// Shots: open-harness-toast-{before,after}.png (whole page, notification showing) and
// open-harness-toast-stack.png (several at once incl. a sticky one with its link).

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
function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { fleet: { selfLabel: 'spacex' }, gateOpen: true, killSwitch: true, goals: [], conversation: { id: '@arch', name: 'Arch agent', isDefault: true } };
    case '/api/arch/conversations': return { conversations: [{ id: '@arch', name: 'Arch agent', isDefault: true, running: false, busy: false, goal: null }] };
    case '/api/arch/fleet/status': return { at: now, hubVersion: '1.0.0+test', machines: [] };
    case '/api/taskgraph': return { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
    case '/api/taskgraph/layout': return { layout: null };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    case '/api/recurring': return { tasks: [] };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  if (pathname === '/api/arch/stream') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${base}/manage.html?tab=status&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mg__body', { timeout: 60000 });

const bodyTop = () => page.$eval('.mg__body', (n) => Math.round(n.getBoundingClientRect().top));
const fire = (detail) => page.evaluate((d) => window.dispatchEvent(new CustomEvent('birocode:agent-open', { detail: d })), detail);

const topBefore = await bodyTop();
await fire({ result: 'opened', label: 'pers-dec', key: '|r-pd', url: 'http://192.168.0.42:5099/studio?agent=r-pd' });
await page.waitForTimeout(400);
const topAfter = await bodyTop();
const shift = topAfter - topBefore;

if (tag === 'before') {
  await page.screenshot({ path: path.join(OUT, 'open-harness-toast-before.png') });
  console.log(JSON.stringify({ tag, topBefore, topAfter, layoutShiftPx: shift, pageErrors: errs }, null, 1));
  await browser.close(); await server.close();
  process.exit(errs.length === 0 && shift > 0 ? 0 : 1);   // the bug: the body jumps down
}

// ---- after ------------------------------------------------------------------------------------
const layer = await page.$eval('[data-toast-layer]', (n) => ({
  position: getComputedStyle(n).position, live: n.getAttribute('aria-live'),
  right: getComputedStyle(n).right, pointer: getComputedStyle(n).pointerEvents,
}));
const first = await page.$eval('[data-toast]', (n) => ({ role: n.getAttribute('role'), text: n.textContent, notice: n.dataset.openNotice }));
await page.screenshot({ path: path.join(OUT, 'open-harness-toast-after.png') });

// Stacking: two more, one sticky with its link (the "cannot open" family of card 720b3e0c).
await fire({ result: 'renavigated', label: 'web-flow-autodev#1', key: 'src-m|r-w', url: 'http://192.168.1.20:5099/studio?agent=r-w' });
await fire({ result: 'blocked', label: 'exporter#1', key: '|r-exp', url: 'http://192.168.0.42:5099/studio?agent=r-exp' });
await page.waitForFunction(() => document.querySelectorAll('[data-toast]').length === 3, null, { timeout: 5000 });
const stackShift = (await bodyTop()) - topBefore;
await page.screenshot({ path: path.join(OUT, 'open-harness-toast-stack.png') });
const stickyLink = await page.$eval('[data-open-notice="blocked"] [data-toast-link]', (a) => a.href);

// Hover pauses the clock: hold the pointer on the first quiet toast past its 4 s.
await page.hover('[data-open-notice="opened"]');
await page.waitForTimeout(4600);
const heldThroughHover = !!(await page.$('[data-open-notice="opened"]'));
await page.mouse.move(10, 10); // unhover: the clock resumes
await page.waitForFunction(() => !document.querySelector('[data-open-notice="opened"]') && !document.querySelector('[data-open-notice="renavigated"]'), null, { timeout: 7000 });
// The sticky one outlived every clock; × dismisses it.
const stickyStays = !!(await page.$('[data-open-notice="blocked"]'));
await page.click('[data-open-notice="blocked"] .toast__x');
await page.waitForFunction(() => document.querySelectorAll('[data-toast]').length === 0, null, { timeout: 5000 });
// Click-anywhere dismisses too.
await fire({ result: 'silent', label: 'pers-dec', key: '|r-pd', url: 'http://x/studio?agent=r-pd' });
await page.waitForSelector('[data-open-notice="silent"]', { timeout: 5000 });
await page.click('[data-open-notice="silent"]');
await page.waitForFunction(() => document.querySelectorAll('[data-toast]').length === 0, null, { timeout: 5000 });
const endShift = (await bodyTop()) - topBefore;

await browser.close(); await server.close();

const result = {
  zeroLayoutShift: shift === 0 && stackShift === 0 && endShift === 0,
  overlayLayer: layer.position === 'fixed' && layer.live === 'polite' && layer.pointer === 'none',
  toastIsAStatusLine: first.role === 'status' && /Opened pers-dec in a new tab/.test(first.text) && first.notice === 'opened',
  stacksAndStickyKeepsItsLink: /studio\?agent=r-exp/.test(stickyLink),
  hoverPausesTheClock: heldThroughHover,
  quietFadeStickyStaysUntilDismissed: stickyStays,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ topBefore, shift, stackShift, endShift, layer, first, stickyLink, heldThroughHover, stickyStays, pageErrors: errs, result }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
