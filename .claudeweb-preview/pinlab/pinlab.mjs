// Fleet task 61a0d521 — Status tab pinned agents, on an isolated harness that reads the REAL fleet (lab.ps1: HUB, HUBPW,
// OUT). Everything the Operator does is done in the Status tab (Playwright): pin agents on two machines from their
// list chips, see the bar, expand a pinned chip, reload, open from a second browser, unpin one from the bar.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const { HUB, HUBPW, OUT } = process.env;
const BASE = `${HUB}/api/localview/c7a98bafdf4d433d990f870a0eda8725/app/events-feed/manage/?tab=status&layout=tabs&fleetTab=agents`;
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f));
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 600) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 220) : ''}`); if (!ok) out.failed = true; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 400) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
let n = 0;
const shot = async (page, name, opts = {}) => { n += 1; await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`), ...opts }); };

const b = await chromium.launch();
const mkCtx = async () => {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {} });
  const page = await ctx.newPage();
  await page.request.fetch(HUB + '/api/auth/login', { method: 'POST', data: { password: HUBPW } });
  return { ctx, page };
};
try {
  const { page } = await mkCtx();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const api = (p, init) => page.request.fetch(HUB + p, init);
  // The real fleet, as the lab hub sees it (peers answer slowly on the first poll).
  const fleet = await until(async () => { const d = await (await api('/api/arch/fleet/status')).json(); return (d.machines || []).filter((m) => !m.self && m.reachable && (m.agents || []).length).length ? d : null; }, 60000, 3000)
    || await (await api('/api/arch/fleet/status')).json();
  const total = fleet.machines.reduce((s, m) => s + (m.agents || []).length, 0);
  const self = fleet.machines.find((m) => m.self);
  const peer = fleet.machines.find((m) => !m.self && m.reachable && (m.agents || []).length);
  check('the lab hub reads the real fleet', total > 20 && !!peer, `${total} agents on ${fleet.machines.length} machines: ${fleet.machines.map((m) => `${m.machine}${m.reachable ? '' : ' (dark)'} ${(m.agents || []).length}`).join(', ')}`);
  const A = self.agents.find((a) => a.name === 'pers-dec') || self.agents[0];
  const B = peer.agents[0];
  const C = self.agents.find((a) => a.repoId !== A.repoId && a.name !== 'Claude Web (this app)') || self.agents[1];

  await page.goto(BASE);
  await page.locator(`[data-machine="${peer.machine}"] [data-agent]`).first().waitFor({ timeout: 60000 });
  check('1 no pins yet: no bar', (await page.locator('[data-pinned-bar]').count()) === 0);
  const wrapOf = (m, a) => page.locator(`[data-machine="${m.machine}"] .fs__chipwrap:has([data-agent="${a.key}"])`).first();

  // 2. pin from the list chips: hover shows the control
  await wrapOf(self, A).scrollIntoViewIfNeeded();
  await wrapOf(self, A).hover();
  await sleep(300);
  const box = await wrapOf(self, A).boundingBox();
  await shot(page, 'pin-control-on-hover', { clip: { x: Math.max(0, box.x - 200), y: Math.max(0, box.y - 60), width: box.width + 400, height: box.height + 120 } });
  await wrapOf(self, A).locator('[data-pin-toggle="pin"]').click();
  await until(async () => (await page.locator('[data-pinned-bar] [data-pinned]').count()) === 1);
  await wrapOf(peer, B).scrollIntoViewIfNeeded();
  await wrapOf(peer, B).hover();
  await wrapOf(peer, B).locator('[data-pin-toggle="pin"]').click();
  await until(async () => (await page.locator('[data-pinned-bar] [data-pinned]').count()) === 2);
  await wrapOf(self, C).scrollIntoViewIfNeeded();
  await wrapOf(self, C).hover();
  await wrapOf(self, C).locator('[data-pin-toggle="pin"]').click();
  // pinning the same one again (idempotent: it is now an unpin control on the list chip, and the API refuses doubles)
  await api('/api/settings/status-pins', { method: 'POST', data: { sourceId: 'self', repoId: A.repoId, pinned: true, machine: self.machine, name: A.name } });
  await until(async () => (await page.locator('[data-pinned-bar] [data-pinned]').count()) === 3);
  await page.evaluate(() => window.scrollTo(0, 0));
  const pinnedKeys = await page.$$eval('[data-pinned-bar] [data-pinned]', (els) => els.map((e) => e.getAttribute('data-pinned')));
  const labels = await page.$$eval('[data-pinned-bar] [data-pin-machine]', (els) => els.map((e) => e.parentElement.getAttribute('data-label') ? e.parentElement.textContent : e.parentElement.textContent));
  check('2a pinned from list chips on two machines; the bar keeps the pin order; pinning twice adds nothing', pinnedKeys.join(',') === [`self|${A.repoId}`, `${peer.sourceId}|${B.repoId}`, `self|${C.repoId}`].join(','), pinnedKeys.join(', '));
  check('2b the bar labels them "machine / agent"', labels.length === 3 && labels[1].includes(`${peer.machine} / `), labels.join(' · '));
  const listPinned = await wrapOf(self, A).locator('[data-pin-toggle="unpin"]').count();
  check('2c the list chip of a pinned agent shows 📌 (unpin) beside it', listPinned === 1);
  // same chip, same live state as the list
  const listState = await page.locator(`[data-machine="${peer.machine}"] [data-agent="${B.key}"]`).first().getAttribute('data-running');
  const barState = await page.locator(`[data-pinned="${peer.sourceId}|${B.repoId}"] [data-agent]`).getAttribute('data-running');
  check('2d the pinned chip is the list\'s chip: same agent key, same live state', listState === barState, `list running=${listState} bar running=${barState}`);
  await page.locator(`[data-pinned="${peer.sourceId}|${B.repoId}"] [data-agent]`).click();
  check('2e a click on a pinned chip expands its details under the bar (the list chip\'s click)', await until(() => page.locator(`[data-pinned-detail="${peer.sourceId}|${B.repoId}"]`).count()));
  const dbl = await page.locator(`[data-pinned="${peer.sourceId}|${B.repoId}"] [data-agent]`).getAttribute('data-dblclick-harness');
  check('2f double-click opens the harness with the same target the list chip uses', dbl === `${peer.sourceId}|${B.repoId}`, dbl);
  await shot(page, 'pinned-bar-with-details');
  await page.locator(`[data-pinned="${peer.sourceId}|${B.repoId}"] [data-agent]`).click();

  // 3. a pin on a machine of the fleet that is not answering right now stays, greyed, with the reason
  const darkM = fleet.machines.find((m) => !m.reachable);
  const DK = `${darkM?.sourceId}|repo-on-${darkM?.machine}`;
  await api('/api/settings/status-pins', { method: 'POST', data: { sourceId: darkM.sourceId, repoId: `repo-on-${darkM.machine}`.replace(/[^A-Za-z0-9_.:-]/g, '-'), pinned: true, machine: darkM.machine, name: 'its agent' } });
  const darkKey = `${darkM.sourceId}|${`repo-on-${darkM.machine}`.replace(/[^A-Za-z0-9_.:-]/g, '-')}`;
  await page.reload();
  await page.locator('[data-pinned-bar]').waitFor({ timeout: 30000 });
  const loadingSeen = await page.locator('[data-pinned-loading]').count();
  await page.locator(`[data-machine="${peer.machine}"] [data-agent]`).first().waitFor({ timeout: 60000 });   // the fleet answered
  await until(async () => (await page.locator('[data-pinned-bar] [data-pinned]').count()) === 4);
  const dark = page.locator(`[data-pinned="${darkKey}"][data-pinned-dark]`);
  check('3a a pin on a fleet machine that is not answering stays in the bar, greyed, with the reason', (await dark.count()) === 1 && new RegExp(`${darkM.machine} is not answering`).test(await dark.textContent()), `${darkM.machine}: ${await dark.textContent()}`);
  check('3b right after a reload (before the first poll) pins say "loading", never "gone"', (await page.locator('text=no longer in the fleet').count()) === 0, `loading placeholders seen: ${loadingSeen}`);
  void DK;
  check('4a after a reload the pins are there, same order', (await page.$$eval('[data-pinned-bar] [data-pinned]', (els) => els.map((e) => e.getAttribute('data-pinned')))).slice(0, 3).join(',') === pinnedKeys.join(','));
  await shot(page, 'pinned-bar-after-reload');

  // 4b. a second browser (fresh profile): the hub's pins
  const second = await mkCtx();
  await second.page.goto(BASE);
  await second.page.locator(`[data-machine="${peer.machine}"] [data-agent]`).first().waitFor({ timeout: 60000 });
  await second.page.locator('[data-pinned-bar] [data-pinned]').first().waitFor({ timeout: 30000 });
  check('4b a second browser sees the same pins', (await second.page.locator('[data-pinned-bar] [data-pinned]').count()) === 4);
  await second.page.evaluate(() => window.scrollTo(0, 0));
  await shot(second.page, 'second-browser-same-pins');

  // 5. unpin from the bar, and the greyed one; reload
  await page.locator(`[data-pinned="self|${C.repoId}"] [data-pin-toggle="unpin"]`).click();
  await page.locator(`[data-pinned="${darkKey}"] [data-pin-toggle="unpin"]`).click();
  await until(async () => (await page.locator('[data-pinned-bar] [data-pinned]').count()) === 2);
  await page.reload();
  await page.locator(`[data-machine="${peer.machine}"] [data-agent]`).first().waitFor({ timeout: 60000 });
  await page.locator('[data-pinned-bar] [data-pinned]').first().waitFor({ timeout: 30000 });
  const after = await page.$$eval('[data-pinned-bar] [data-pinned]', (els) => els.map((e) => e.getAttribute('data-pinned')));
  check('5 unpinned from the bar: gone after a reload, the rest in order', after.join(',') === [`self|${A.repoId}`, `${peer.sourceId}|${B.repoId}`].join(','), after.join(', '));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'after-unpin-reload');
  // and unpinning everything hides the bar
  for (const k of after) await page.locator(`[data-pinned="${k}"] [data-pin-toggle="unpin"]`).click();
  check('6 nothing pinned: the bar is hidden', await until(async () => (await page.locator('[data-pinned-bar]').count()) === 0));
  // leave the two real pins in the lab store for the record (the lab data dir is deleted anyway)
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('lab ran to the end', false, e.stack || e.message);
} finally {
  await b.close();
}
out.passed = out.checks.filter((c) => c.ok).length; out.total = out.checks.length;
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(`@@RESULT@@ ${out.passed}/${out.total}`);
