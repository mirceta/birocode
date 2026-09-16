// openspec goal-app — browser + API verify against an ISOLATED harness (own datadir,
// goal-app-e2e.ps1 boots it). Asserts: every repo lists the synthetic local app "goal";
// the Goal slot serves the explicit empty state; /api/goal/status is idle; the Auto flag
// round-trips through /api/goal/auto and lands in the iso repositories.json; ask without
// a conversation is a friendly 400; the audit trail knows the feature; the dock renders
// 🎯 Update goal + Auto in the SAME row as 🧠 Ask for understanding + Auto; screenshot.
// Net-zero: its dock tab lives in the iso datadir only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
// playwright lives in client/node_modules (a devDependency there); resolve from that root.
const { chromium } = createRequire(path.resolve(process.cwd(), '..', '..', 'client', 'package.json'))('playwright');

const PORT = process.env.PORT || '5231';
const BASE = `http://127.0.0.1:${PORT}`;
const PW = process.env.PW || 'changeme';
const DATA = process.env.DATA || '';
const OUT = path.resolve(process.cwd(), '..', 'out-goal-app-dock.png');

const r = {};
let pass = true;
const expect = (k, got, ok) => { r[k] = `${ok ? 'PASS' : 'FAIL'} (${got})`; if (!ok) pass = false; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: PW } });
await ctx.addInitScript(() => localStorage.setItem('claudeweb_ui_mode', 'advanced'));
const api = ctx.request;
const j = async (resp) => { try { return await resp.json(); } catch { return null; } };

try {
  // 1) Every repo reports the Goal local app, after Understanding.
  const repos = await j(await api.get(`${BASE}/api/repos`));
  const list = Array.isArray(repos) ? repos : repos?.repos || [];
  const self = list.find((x) => x.isSelf) || list[0];
  expect('repos.listed', list.length, list.length > 0);
  const every = list.every((x) => (x.localApps || []).some((a) => a.id === 'goal' && a.kind === 'harness'));
  expect('repos.everyHasGoalApp', `${list.length} repos`, every);
  const ids = (self.localApps || []).map((a) => a.id);
  expect('repos.goalAfterUnderstanding', ids.join(','), ids.indexOf('goal') === ids.indexOf('understanding') + 1);

  // 2) The Goal slot serves the explicit empty state.
  const slot = await api.get(`${BASE}/api/localview/${self.id}/app/goal/`);
  const html = await slot.text();
  expect('slot.emptyState', `${slot.status()}`, slot.status() === 200 && html.includes('No Goal app here yet') && html.includes('goal-app/goal.json'));
  const missing = await api.get(`${BASE}/api/localview/${self.id}/app/goal/nope.js`);
  expect('slot.missingAssetIs404', `${missing.status()}`, missing.status() === 404);

  // 3) Status idle; ask without a conversation is a friendly 400.
  const h = { 'X-Repo-Id': self.id };
  const st = await j(await api.get(`${BASE}/api/goal/status`, { headers: h }));
  expect('goal.statusIdle', JSON.stringify(st), st?.status === 'idle' && st?.repoId === self.id);
  const ask = await api.post(`${BASE}/api/goal/ask`, { headers: h, data: {} });
  const askBody = await j(ask);
  expect('goal.askNoSession400', `${ask.status()} ${askBody?.error}`, ask.status() === 400 && /start a conversation/i.test(askBody?.error || ''));
  const stAfter = await j(await api.get(`${BASE}/api/goal/status`, { headers: h }));
  expect('goal.askStartedNothing', stAfter?.status, stAfter?.status === 'idle');

  // 4) Auto flag: default off, round-trips, persisted in the iso datadir, independent of understanding's.
  const a0 = await j(await api.get(`${BASE}/api/goal/auto`, { headers: h }));
  expect('auto.defaultOff', JSON.stringify(a0), a0?.enabled === false);
  await api.post(`${BASE}/api/goal/auto`, { headers: h, data: { enabled: true } });
  const a1 = await j(await api.get(`${BASE}/api/goal/auto`, { headers: h }));
  expect('auto.on', JSON.stringify(a1), a1?.enabled === true);
  const u = await j(await api.get(`${BASE}/api/understanding/auto`, { headers: h }));
  expect('auto.independentOfUnderstanding', JSON.stringify(u), u?.enabled === false);
  if (DATA) {
    const persisted = JSON.parse(fs.readFileSync(path.join(DATA, 'repositories.json'), 'utf8'));
    const entry = (Array.isArray(persisted) ? persisted : persisted.repos || persisted.Repos || []).find((x) => (x.Id || x.id) === self.id);
    expect('auto.persisted', JSON.stringify({ AutoGoal: entry?.AutoGoal ?? entry?.autoGoal }), (entry?.AutoGoal ?? entry?.autoGoal) === true);
  }

  // 5) Audit trail accepts the feature filter.
  const audit = await j(await api.get(`${BASE}/api/agentic-audit?feature=update-goal`));
  expect('audit.featureKnown', JSON.stringify(audit), Array.isArray(audit?.calls));

  // 6) Dock: 🎯 + Auto right next to 🧠 + Auto, one row.
  // The header's dashboard toggle only renders with >= 2 docks (Layout.jsx).
  for (const id of ['GOALCHECK-01', 'GOALCHECK-02'])
    await api.post(`${BASE}/api/dock`, { data: { id, repoId: self.id, repoName: self.name, status: 'idle', createdAt: 0 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { r.pageError = String(e); });
  await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const btn = page.locator('.app-header__title--btn');
  try {
    await btn.waitFor({ timeout: 30000 });
  } catch (e) {
    await page.screenshot({ path: OUT.replace('dock', 'debug'), fullPage: true });
    r.debugUrl = page.url();
    r.debugBody = (await page.locator('body').innerText()).slice(0, 400);
    throw e;
  }
  await btn.click();
  await page.locator('.dash__header').waitFor({ timeout: 15000 });
  // The row lives in the PinnedAgent "phone"; the dashboard opens on cards, so switch.
  await page.locator('.dash__view', { hasText: /phone/i }).click();
  await page.locator('.dash__grid--phones').waitFor({ timeout: 15000 });
  const row = page.locator('.phone__understanding-row').first();
  try {
    await row.waitFor({ timeout: 15000 });
  } catch (e) {
    await page.screenshot({ path: OUT.replace('dock', 'debug'), fullPage: true });
    r.debugBody = (await page.locator('body').innerText()).slice(0, 600);
    throw e;
  }
  const uBtn = row.locator('[data-understanding-btn]');
  const gBtn = row.locator('[data-goal-btn]');
  const gAuto = row.locator('[data-goal-auto]');
  expect('dock.bothButtonsInOneRow', `${await uBtn.count()}/${await gBtn.count()}`, (await uBtn.count()) === 1 && (await gBtn.count()) === 1);
  expect('dock.goalAfterUnderstanding', 'order', await row.evaluate((el) => {
    const u = el.querySelector('[data-understanding-btn]'); const g = el.querySelector('[data-goal-btn]');
    return !!(u && g && (u.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING));
  }));
  expect('dock.goalLabel', await gBtn.textContent(), /Update goal/.test(await gBtn.textContent()));
  expect('dock.goalDisabledNoSession', await gBtn.isDisabled(), await gBtn.isDisabled());
  expect('dock.goalAutoReflectsServer', await gAuto.isChecked(), await gAuto.isChecked() === true);
  await gAuto.click();
  await page.waitForTimeout(400);
  const a2 = await j(await api.get(`${BASE}/api/goal/auto`, { headers: h }));
  expect('dock.autoFlipsServer', JSON.stringify(a2), a2?.enabled === false);
  const phone = page.locator('.phone').first();
  await phone.screenshot({ path: OUT });
  await page.close();
} catch (e) {
  r.error = String(e);
  pass = false;
} finally {
  await browser.close();
}

console.log(JSON.stringify(r, null, 2));
console.log('shot:', OUT);
console.log(pass ? 'ALL PASS' : 'SOME FAILED');
process.exit(pass ? 0 : 1);
