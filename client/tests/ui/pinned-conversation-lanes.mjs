// Rendering test (openspec pin-conversation-lanes): in every management-agent
// conversation view — the Arch pane and the Tasks pane of the Management App —
// the header strip with the Chat / Tools / History lanes stays in view when the
// transcript is scrolled to its end, the composer stays put, and nothing but the
// message list scrolls (no second scrollbar on the pane or the page).
//
// It renders the REAL app (client/manage.html through a Vite dev server) against
// mocked /api responses — a 60-message transcript — in a headless browser, so a
// CSS regression that lets the strip scroll away fails here, not on the living
// room screen. No harness needed, nothing touches :5099.
//
//   npm --prefix client run test:ui
//
// Exit code 0 = every check passed. Screenshots land in client/tests/ui/out/.

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(clientRoot, 'tests', 'ui', 'out');
mkdirSync(OUT, { recursive: true });

// ---- fixtures ------------------------------------------------------------------

const PARA = 'The agent explains what it did, why, and what comes next. '.repeat(6);
const transcript = Array.from({ length: 60 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  text: i % 2 === 0 ? `Message ${i + 1}: please look into item ${i + 1}.` : `Message ${i + 1}.\n\n${PARA}\n\n${PARA}`,
  actor: i % 2 === 0 ? 'human' : undefined,
}));

const archState = {
  gateOpen: true, killSwitch: true, loop: null, engine: null, session: null,
  home: { path: 'C:/repos/arch-home', exists: true, commits: [] },
  disallowedTools: [], agents: [], repos: [], scope: { repoIds: [], fleet: [] },
  fleet: { selfLabel: 'test-box', acceptSends: false, acceptUpgrades: false, sources: [] },
  drivenQuietSeconds: 300,
};

function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return archState;
    case '/api/arch/messages': return { sessionId: 'sess-1', messages: transcript };
    case '/api/autopilot/loops': return { loops: [], recipes: [] };
    case '/api/tasks': return { session: { run: null }, home: { path: 'C:/repos/tasks-home', exists: true } };
    case '/api/tasks/messages': return { messages: transcript };
    case '/api/tasks/tools': return { server: {}, tools: [], totalCalls: 0, home: {} };
    case '/api/arch/tools': return { tools: [], denied: [] };
    case '/api/arch/tools/preflight': return { checks: [] };
    case '/api/arch/tool-calls': return { calls: [] };
    default: return {};
  }
}

// ---- cases ---------------------------------------------------------------------

const ALL_TABS = ['arch', 'tasks', 'ideas', 'graph', 'kanban', 'events', 'status'];
const CASES = [
  { name: 'big screen · tabs · arch', viewport: { width: 1920, height: 1080 }, layout: 'tabs', tab: 'arch', panes: ['arch'] },
  { name: 'big screen · panes · arch + tasks', viewport: { width: 1920, height: 1080 }, layout: 'panes', tab: 'arch', panes: ['arch', 'tasks'] },
  { name: 'laptop · tabs · tasks', viewport: { width: 1366, height: 768 }, layout: 'tabs', tab: 'tasks', panes: ['tasks'] },
  { name: 'laptop · panes · arch + tasks', viewport: { width: 1366, height: 768 }, layout: 'panes', tab: 'arch', panes: ['arch', 'tasks'] },
  { name: 'narrow window · tabs · arch', viewport: { width: 820, height: 700 }, layout: 'tabs', tab: 'arch', panes: ['arch'] },
];

// ---- in-page measurement -------------------------------------------------------

// Scroll the transcript (and, to expose the bug, anything else that can scroll) to
// the very end, then report where the lane strip and the composer ended up.
function measure(paneKey) {
  const pane = document.querySelector(`[data-pane="${paneKey}"]`);
  if (!pane) return { error: `no pane ${paneKey}` };
  const scroll = pane.querySelector('.arch__scroll');
  const lanes = pane.querySelector('.arch__lanes');
  const composer = pane.querySelector('.arch__composer textarea');
  const body = pane.querySelector('.mg__pane-body') || pane;
  if (!scroll || !lanes || !composer) return { error: 'conversation markup missing' };

  const overflow = scroll.scrollHeight - scroll.clientHeight;
  scroll.scrollTop = scroll.scrollHeight;
  const otherScrollers = [];
  for (let el = scroll.parentElement; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && el !== document.documentElement && el !== document.body) {
      el.scrollTop = el.scrollHeight;
      otherScrollers.push(el.className || el.tagName);
    }
  }
  window.scrollTo(0, document.documentElement.scrollHeight);
  const pageScrolls = document.documentElement.scrollHeight > window.innerHeight + 1;

  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  const inside = (r, box) => r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= box.left - 1 && r.right <= box.right + 1;
  const viewport = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && (at === el || el.contains(at));
  };
  const tabs = [...lanes.querySelectorAll('[role="tab"]')];
  const bodyRect = rect(body);
  return {
    overflow,
    otherScrollers,
    pageScrolls,
    lanesInPane: inside(rect(lanes), bodyRect) && inside(rect(lanes), viewport),
    tabsHittable: tabs.length > 0 && tabs.every(hit),
    tabLabels: tabs.map((b) => b.textContent.trim()),
    composerInPane: inside(rect(composer), bodyRect) && inside(rect(composer), viewport),
    composerHittable: hit(composer),
    // The end of the transcript is reachable: the last message's bottom edge sits
    // inside the list (a single long message may be taller than a narrow pane's
    // list, so its top edge is not required to be in view).
    lastTurnVisible: (() => {
      const turns = scroll.querySelectorAll('.turn');
      const last = turns[turns.length - 1];
      if (!last) return false;
      const l = rect(last); const s = rect(scroll);
      return l.bottom <= s.bottom + 1 && l.bottom >= s.top;
    })(),
  };
}

// ---- run -----------------------------------------------------------------------

async function launch() {
  const attempts = [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  let lastErr;
  for (const opts of attempts) {
    try { return await chromium.launch(opts); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const server = await createServer({
  root: clientRoot,
  configFile: false,
  logLevel: 'error',
  plugins: [react()],
  define: { __BUILD_TIME__: JSON.stringify('test') },
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
await server.listen();
const port = server.httpServer.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await launch();
const failures = [];
const report = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

try {
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: c.viewport });
    const hidden = ALL_TABS.filter((k) => !c.panes.includes(k));
    await ctx.addInitScript(({ layout, tab, hidden: h }) => {
      localStorage.setItem('manageapp.layout', layout);
      localStorage.setItem('manageapp.tab', tab);
      localStorage.setItem('manageapp.hidden', JSON.stringify(h));
      localStorage.setItem('claudeweb_ui_mode', 'advanced');
    }, { layout: c.layout, tab: c.tab, hidden });
    // Only the harness API — not Vite's own modules under /src/api/.
    await ctx.route((url) => url.pathname.startsWith('/api/'), (route) => {
      const { pathname } = new URL(route.request().url());
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname)) });
    });
    const page = await ctx.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await page.goto(`${base}/manage.html?tab=${c.tab}&layout=${c.layout}`, { waitUntil: 'domcontentloaded' });
    let loaded = true;
    for (const key of c.panes) {
      const sel = `[data-pane="${key}"] .arch__scroll .turn`;
      try {
        await page.waitForFunction((s) => document.querySelectorAll(s).length >= 60, sel, { timeout: 15000 });
      } catch {
        loaded = false;
        const diag = await page.evaluate((s) => ({
          panes: [...document.querySelectorAll('[data-pane]')].map((p) => p.dataset.pane),
          turns: document.querySelectorAll(s).length,
          banners: [...document.querySelectorAll('.arch__banner, .mg__banner, .mg__note')].map((b) => b.textContent.trim()),
          text: document.body.innerText.slice(0, 400),
        }), sel);
        await page.screenshot({ path: path.join(OUT, `${c.name.replace(/[^a-z0-9]+/gi, '-')}-NOT-LOADED.png`) });
        report(false, `${c.name} › ${key}: transcript did not render — ${JSON.stringify(diag)} pageErrors=${JSON.stringify(pageErrors)} consoleErrors=${JSON.stringify(consoleErrors.slice(0, 3))}`);
      }
    }
    if (!loaded) { await ctx.close(); continue; }
    // Let the pages' own "scroll to bottom on new messages" effects settle first.
    await page.waitForTimeout(300);

    const measured = {};
    for (const key of c.panes) measured[key] = await page.evaluate(measure, key);
    // Evidence of the scrolled state, before the lane clicks below re-mount the list.
    await page.screenshot({ path: path.join(OUT, `${c.name.replace(/[^a-z0-9]+/gi, '-')}-scrolled.png`) });

    for (const key of c.panes) {
      const m = measured[key];
      const tag = `${c.name} › ${key}`;
      if (m.error) { report(false, `${tag}: ${m.error}`); continue; }
      report(m.overflow > 200, `${tag}: transcript overflows its list (${m.overflow}px) — the scenario is real`);
      report(m.lanesInPane, `${tag}: lane strip is inside the pane after scrolling to the end`);
      report(m.tabsHittable, `${tag}: every lane tab is hittable (${m.tabLabels.join(' | ')})`);
      report(m.composerInPane && m.composerHittable, `${tag}: composer stays in place and hittable`);
      report(m.lastTurnVisible, `${tag}: the last message is visible inside the list`);
      report(m.otherScrollers.length === 0 && !m.pageScrolls, `${tag}: only the message list scrolls (others: ${m.otherScrollers.join(', ') || 'none'}${m.pageScrolls ? ', page' : ''})`);

      // The strip must not just be visible but usable: switch lanes while scrolled
      // down, clicking where the tab IS (a raw mouse click — Locator.click would
      // scroll a hidden tab into view first and hide the bug).
      const tools = page.locator(`[data-pane="${key}"] .arch__lanes [role="tab"]`, { hasText: 'Tools' });
      const box = await tools.boundingBox();
      let toolsOn = null;
      if (box && box.y >= 0 && box.y + box.height <= c.viewport.height) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        toolsOn = await tools.getAttribute('aria-selected').catch(() => null);
      }
      report(toolsOn === 'true', `${tag}: Tools lane opens with a click where the tab sits, from the scrolled state`);
      const chat = page.locator(`[data-pane="${key}"] .arch__lanes [role="tab"]`, { hasText: 'Chat' });
      const cbox = await chat.boundingBox();
      if (cbox) await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
    }
    await page.screenshot({ path: path.join(OUT, `${c.name.replace(/[^a-z0-9]+/gi, '-')}.png`) });
    report(pageErrors.length === 0, `${c.name}: no page errors (${pageErrors.join('; ') || 'none'})`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}

console.log(failures.length === 0 ? `\nOK — ${CASES.length} cases, all checks passed` : `\n${failures.length} check(s) failed`);
process.exit(failures.length === 0 ? 0 : 1);
