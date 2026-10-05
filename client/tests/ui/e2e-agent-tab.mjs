// Real end-to-end for openspec tabbed-agent-tab (fleet task 15502893) against a BUILT, isolated
// harness instance (see .claudeweb-preview/agent-tab-e2e.ps1, which boots it and runs this):
//   1. an "open harness" link (/studio?agent=<repoId>) lands on the new Agent tab, at desktop
//      width and at phone width — the agent's dashboard phone, full screen;
//   2. the tab stays full screen under a second layout setting (reordered tabs, wide spans)
//      while the other tabs DO get the pane strip under that setting;
//   3. the bottom nav still works from the Agent tab (Files and back);
//   4. the Management board's Status → "open harness" and a Kanban badge open the harness in a
//      new browser tab that lands on the Agent tab (the real window.open path, not a stub).
// Env: BASE (http://127.0.0.1:port), PW (the instance's password). Prints one JSON summary.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE; const PW = process.env.PW;
if (!BASE || !PW) { console.log(JSON.stringify({ error: 'BASE and PW are required' })); process.exit(1); }
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const errs = [];
async function loggedIn(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 3 : 2 });
  await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('manageapp.layout', 'tabs'); localStorage.setItem('manageapp.hidden', '[]'); });
  const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: PW } });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  return ctx;
}
const api = async (ctx, method, p, data) => {
  const r = await ctx.request.fetch(`${BASE}/api${p}`, { method, data, headers: { 'X-Auth-Password': PW } });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
};
const state = (page) => page.evaluate(() => ({
  path: location.pathname,
  agentRoute: !!document.querySelector('[data-agent-route]'),
  agentView: document.querySelector('[data-agent-view]')?.dataset.agentView || null,
  solo: document.querySelector('[data-dash-solo]')?.dataset.dashSolo || null,
  phone: !!document.querySelector('.dash--solo .phone'),
  phoneLanes: [...document.querySelectorAll('.dash--solo .phone button, .dash--solo .phone [role=tab]')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12),
  paneStrip: !!document.querySelector('.pane-strip'),
  frameAgent: !!document.querySelector('.app-frame--agent'),
  nav: [...document.querySelectorAll('.bottom-nav__item')].map((a) => ({ text: a.textContent.trim(), active: a.classList.contains('is-active'), href: a.getAttribute('href') })),
  phoneRect: (() => { const el = document.querySelector('.dash--solo .phone'); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }; })(),
}));

const result = {};
try {
  const desk = await loggedIn({ width: 1500, height: 900 });
  const repos = await api(desk, 'GET', '/repos');
  const self = (Array.isArray(repos) ? repos : repos.repos || []).find((r) => r.isSelf);
  if (!self) throw new Error('no self repo on the instance');
  const dock = await api(desk, 'POST', '/dock', { repoId: self.id, repoName: self.name });
  const node = await api(desk, 'POST', '/taskgraph/nodes', { title: 'E2E: land on the Agent tab', repoId: self.id });
  await api(desk, 'POST', `/taskgraph/nodes/${node.id}/assign`, { repoId: self.id, by: 'e2e' });
  const dash = await api(desk, 'PUT', '/settings/ui', { tabOrder: [], tabWidths: {}, hiddenTabs: [] });
  result.seeded = { self: self.id, dock: dock?.id || null, node: node?.id || null, settingsReset: !!dash };

  // ---- 1. desktop: the link lands on the Agent tab ---------------------------------------------
  const p1 = await desk.newPage();
  p1.on('pageerror', (e) => errs.push(`desk: ${e.message}`));
  await p1.goto(`${BASE}/studio?agent=${encodeURIComponent(self.id)}`, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.dash--solo .phone', { timeout: 60000 });
  await p1.waitForTimeout(1500);
  result.desktop = await state(p1);
  await p1.screenshot({ path: path.join(OUT, 'agent-tab-desktop.png') });

  // ---- 3. the bottom nav still works from the Agent tab ---------------------------------------
  await p1.click('.bottom-nav__item[href="/studio/files"]');
  await p1.waitForFunction(() => location.pathname === '/studio/files', null, { timeout: 15000 });
  result.navToFiles = await state(p1);
  await p1.click('.bottom-nav__item[href="/studio/agent"]');
  await p1.waitForSelector('.dash--solo .phone', { timeout: 30000 });
  result.navBack = await state(p1);

  // ---- 2. another layout setting: tabs reordered, wide spans — the Agent tab is still full -----
  await api(desk, 'PUT', '/settings/ui', { tabOrder: ['files', 'git', 'history', 'claude', 'agent'], tabWidths: { files: 2, claude: 2, history: 2 }, hiddenTabs: [] });
  await p1.goto(`${BASE}/studio/files`, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.bottom-nav__item', { timeout: 30000 });
  await p1.waitForTimeout(1500);
  result.layout2Files = await state(p1);
  await p1.screenshot({ path: path.join(OUT, 'agent-tab-layout2-files.png') });
  await p1.goto(`${BASE}/studio?agent=${encodeURIComponent(self.id)}`, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.dash--solo .phone', { timeout: 60000 });
  await p1.waitForTimeout(1200);
  result.layout2Agent = await state(p1);
  await p1.screenshot({ path: path.join(OUT, 'agent-tab-layout2.png') });
  await api(desk, 'PUT', '/settings/ui', { tabOrder: [], tabWidths: {}, hiddenTabs: [] });

  // ---- 4. from the Management board: Status → open harness, and a Kanban badge ----------------
  const manage = `${BASE}/api/localview/${self.id}/app/events-feed/manage/index.html`;
  result.fleet = ((await api(desk, 'GET', '/arch/fleet/status')).machines || []).map((m) => ({ machine: m.machine, agents: (m.agents || []).map((a) => a.key) }));
  const p2 = await desk.newPage();
  const manageConsole = [];
  p2.on('pageerror', (e) => errs.push(`manage: ${e.message} ${e.stack || ''}`.slice(0, 400)));
  p2.on('console', (m) => { if (m.type() === 'error') manageConsole.push(m.text().slice(0, 300)); });
  p2.on('response', (r) => { if (r.status() >= 400) manageConsole.push(`${r.status()} ${r.url()}`); });
  result.manageConsole = manageConsole;
  await p2.goto(`${manage}?tab=status&layout=tabs&fleetTab=agents`, { waitUntil: 'domcontentloaded' });
  try { await p2.waitForSelector(`[data-agent="${self.id}"]`, { timeout: 30000 }); }
  catch (e) { result.manageBody = await p2.evaluate(() => document.body.innerText.slice(0, 600)); throw e; }
  await p2.click(`[data-agent="${self.id}"]`);
  await p2.waitForSelector(`[data-open-agent-harness="${self.id}"]`, { timeout: 15000 });
  const [popStatus] = await Promise.all([desk.waitForEvent('page', { timeout: 30000 }), p2.click(`[data-open-agent-harness="${self.id}"]`)]);
  popStatus.on('pageerror', (e) => errs.push(`popStatus: ${e.message}`));
  await popStatus.waitForSelector('.dash--solo .phone', { timeout: 60000 });
  await popStatus.waitForTimeout(1200);
  result.fromStatus = await state(popStatus);
  await popStatus.screenshot({ path: path.join(OUT, 'agent-tab-from-status.png') });
  // A second click focuses the same tab without opening another page.
  const pagesBefore = desk.pages().length;
  await p2.click(`[data-open-agent-harness="${self.id}"]`);
  await p2.waitForTimeout(1500);
  result.repeatClickNoNewPage = desk.pages().length === pagesBefore;
  // One browser tab per agent: a Kanban badge click would FOCUS the tab the Status click opened.
  // Close it first so the badge opens (and lands) afresh — that is the screenshot the brief asks for.
  await popStatus.close();

  await p2.goto(`${manage}?tab=kanban&layout=tabs`, { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector(`[data-open-worker$="|${self.id}"]`, { timeout: 60000 });
  const [popKanban] = await Promise.all([desk.waitForEvent('page', { timeout: 30000 }), p2.click(`[data-open-worker$="|${self.id}"]`)]);
  popKanban.on('pageerror', (e) => errs.push(`popKanban: ${e.message}`));
  await popKanban.waitForSelector('.dash--solo .phone', { timeout: 60000 });
  await popKanban.waitForTimeout(1200);
  result.fromKanban = await state(popKanban);
  await popKanban.screenshot({ path: path.join(OUT, 'agent-tab-from-kanban.png') });
  await desk.close();

  // ---- 1b. phone width ------------------------------------------------------------------------
  const phone = await loggedIn({ width: 390, height: 844 });
  const p3 = await phone.newPage();
  p3.on('pageerror', (e) => errs.push(`phone: ${e.message}`));
  await p3.goto(`${BASE}/studio?agent=${encodeURIComponent(self.id)}`, { waitUntil: 'domcontentloaded' });
  await p3.waitForSelector('.dash--solo .phone', { timeout: 60000 });
  await p3.waitForTimeout(1200);
  result.phone = await state(p3);
  await p3.screenshot({ path: path.join(OUT, 'agent-tab-phone.png') });
  await phone.close();

  const full = (s) => s && s.path === '/studio/agent' && s.agentRoute && s.frameAgent && !s.paneStrip && s.phone && s.phoneRect && s.phoneRect.w >= s.phoneRect.vw - 8 && s.phoneRect.h >= s.phoneRect.vh * 0.6;
  result.checks = {
    desktopLandsOnAgentTabFullScreen: full(result.desktop) && result.desktop.nav.some((n) => n.href === '/studio/agent' && n.active),
    agentTabIsNextToChatInTheNav: (() => { const h = result.desktop.nav.map((n) => n.href); return h.indexOf('/studio/agent') === h.indexOf('/studio') + 1; })(),
    bottomNavWorksFromAgentTab: result.navToFiles.path === '/studio/files' && !result.navToFiles.agentRoute && result.navBack.path === '/studio/agent' && result.navBack.phone,
    otherTabsGetPanesUnderLayout2: result.layout2Files.paneStrip === true,
    agentTabStillFullUnderLayout2: full(result.layout2Agent) && result.layout2Agent.nav[0]?.href === '/studio/files',
    fromStatusLandsOnAgentTab: full(result.fromStatus),
    repeatClickFocusesNotReopens: result.repeatClickNoNewPage === true,
    fromKanbanLandsOnAgentTab: full(result.fromKanban),
    phoneWidthLandsOnAgentTab: full(result.phone),
    noPageErrors: errs.length === 0,
  };
  result.pageErrors = errs;
  result.pass = Object.values(result.checks).every(Boolean);
} catch (e) {
  result.error = String(e?.stack || e);
  result.pageErrors = errs;
  result.pass = false;
}
await browser.close();
console.log(JSON.stringify(result, null, 1));
process.exit(result.pass ? 0 : 1);
