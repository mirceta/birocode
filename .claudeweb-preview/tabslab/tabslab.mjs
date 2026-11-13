// Idea #33 — the projector keeps agent pages like browser tabs. Live on the lab hub (lab.ps1: HUB, HUBPW, OUT).
// The big screen is a studio page with ?screen=projector; the "phone" is POST /api/remote/commands (the exact path
// the Remote page's Agents list uses). Checks:
//  1. the first open-agent loads agent A on the Agent tab;
//  2. open-agent B switches with NO page load, and A stays mounted (hidden);
//  3. back to A: the SAME dock element (no remount: a marker set on it survives), no page load, nothing refetched for
//     its transcript; B is now the kept one;
//  4. an unnamed remote command (lane ask) reaches only the shown dock;
//  5. a third and fourth agent: the kept set grows, every return is instant.
// Chat contents are blurred in the screenshots.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const { HUB, HUBPW, OUT } = process.env;
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f));
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 220) : ''}`); if (!ok) out.failed = true; };
const until = async (fn, ms = 20000, step = 300) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
let n = 0;
const shot = async (page, name) => { n += 1; await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`) }); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(() => {
  try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {}
  const css = '.msg, .chat__scroll, .phone__path, .copy-path { filter: blur(4px); }';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let navigations = 0; page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations += 1; });
const reqs = []; page.on('request', (r) => reqs.push(r.url()));
const api = (p, init) => page.request.fetch(HUB + p, init);
const send = async (type, args) => (await api('/api/remote/commands', { method: 'POST', data: { type, args, screenOn: 'self', screen: 'projector' } })).json();
const shownRepo = () => page.locator('[data-agent-view]').getAttribute('data-agent-repo');
const kept = () => page.$$eval('[data-kept-dock]', (els) => els.map((e) => e.getAttribute('data-kept-dock')));

try {
  check('logs in at the lab hub', (await api('/api/auth/login', { method: 'POST', data: { password: HUBPW } })).ok());
  const dock = await (await api('/api/dock')).json();
  const tabs = (dock.tabs || dock || []).filter((t) => t.repoId);
  check('the copied dock has at least three agent tabs', tabs.length >= 3, tabs.length);
  const [A, B, C, D] = tabs;

  await page.goto(`${HUB}/studio?screen=projector`);
  await page.waitForTimeout(2500);
  const nav0 = navigations;
  const pageId = await page.evaluate(() => (window.__labPageId = Math.random().toString(36).slice(2)));

  // 1. first open-agent
  await send('open-agent', { repoId: A.repoId });
  check('1 the first open-agent shows agent A on the Agent tab', await until(async () => (await shownRepo()) === A.repoId), `${A.repoName}`);
  await page.waitForTimeout(1500);
  await page.evaluate((id) => { const el = document.querySelector(`[data-dash-solo] .phone`); if (el) el.dataset.labMark = id; }, A.id);
  await shot(page, 'agent-a-first-visit');

  // 2. switch to B
  await send('open-agent', { repoId: B.repoId });
  check('2a open-agent B shows agent B', await until(async () => (await shownRepo()) === B.repoId), B.repoName);
  await page.waitForTimeout(1200);
  check('2b …with no page load (same document)', (await page.evaluate(() => window.__labPageId)) === pageId, `frame navigations (incl. SPA route changes) ${navigations - nav0}`);
  check('2c A stays mounted, hidden', (await kept()).includes(A.id), (await kept()).join(','));
  await shot(page, 'agent-b');

  // 3. back to A
  const before = reqs.length;
  await send('open-agent', { repoId: A.repoId });
  await until(async () => (await shownRepo()) === A.repoId);
  await page.waitForTimeout(1500);
  const mark = await page.evaluate(() => { const vis = [...document.querySelectorAll('[data-dash-solo] > *')].find((e) => !e.hidden); return vis?.querySelector('.phone')?.dataset.labMark || null; });
  check('3a back to A: the SAME dock element (not remounted)', mark === A.id, mark);
  check('3b …no page load', (await page.evaluate(() => window.__labPageId)) === pageId);
  const refetch = reqs.slice(before).filter((u) => /\/api\/(chat|sessions|dock\/[^/]+\/(transcript|messages))/.test(u) && !/stream|events|status|activity/.test(u));
  check('3c …its transcript is not fetched again', refetch.length === 0, refetch.slice(0, 3).join(' '));
  check('3d B is now the kept (hidden) one', (await kept()).includes(B.id) && !(await kept()).includes(A.id), (await kept()).join(','));
  await shot(page, 'back-to-a-instant');

  // 4. an unnamed remote command reaches only the shown dock
  await send('lane', { lane: 'ask' });
  await page.waitForTimeout(1500);
  const lanes = await page.$$eval('[data-dash-solo] > *', (els) => els.map((e) => ({ hidden: e.hidden, ask: e.querySelectorAll('.phone__lane')[1]?.getAttribute('aria-selected') === 'true' })));
  check('4 "lane ask" switches only the shown dock', lanes.filter((l) => !l.hidden).every((l) => l.ask) && lanes.filter((l) => l.hidden).every((l) => !l.ask), JSON.stringify(lanes));
  await send('lane', { lane: 'builder' });

  // 5. more agents
  await send('open-agent', { repoId: C.repoId });
  await until(async () => (await shownRepo()) === C.repoId);
  if (D) { await send('open-agent', { repoId: D.repoId }); await until(async () => (await shownRepo()) === D.repoId); }
  await page.waitForTimeout(800);
  await send('open-agent', { repoId: B.repoId });
  await until(async () => (await shownRepo()) === B.repoId);
  await page.waitForTimeout(800);
  const k = await kept();
  check('5 after C (and D) and back to B: A, C (D) stay kept, still the same document', k.includes(A.id) && k.includes(C.id) && (!D || k.includes(D.id)) && (await page.evaluate(() => window.__labPageId)) === pageId, k.join(','));
  await shot(page, 'four-agents-kept');
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('lab ran to the end', false, e.message);
} finally {
  await b.close();
}
out.passed = out.checks.filter((c) => c.ok).length;
out.total = out.checks.length;
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(`@@RESULT@@ ${out.passed}/${out.total}`);
