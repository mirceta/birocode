// openspec sofa-mode — end-to-end on an isolated harness (BASE, PW from the env; launched by
// .claudeweb-preview/sofa-remote-e2e.ps1): a projector tab (1920x1080, logged in, ?screen=projector)
// and a phone (390x844, NOT logged in). The phone pairs with the PIN the projector mints, taps an
// agent → the projector lands on the Agent tab showing that dock; taps Kanban → the projector hops to
// the Management App's Kanban and keeps listening; taps Arch → stays in the Management App on Arch;
// taps the agent again → back to the studio's Agent tab. No prompt is sent (that would run an agent).
// Prints one JSON line of facts; exit 1 when an expectation fails.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE, PW = process.env.PW;
const SHOTS = process.env.SHOTS || '';
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail }); if (!ok) out.failed = true; };
const until = async (fn, ms = 12000, step = 300) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };

const b = await chromium.launch({ channel: 'chrome' });
const projCtx = await b.newContext({ viewport: { width: 1920, height: 1080 }, extraHTTPHeaders: { 'X-Auth-Password': PW } });
await projCtx.addInitScript(() => { try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {} });
const proj = await projCtx.newPage();
const projErrs = []; proj.on('pageerror', (e) => projErrs.push(e.message));
proj.on('console', (m) => { if (m.type() === 'error') projErrs.push('console: ' + m.text()); });
proj.on('response', (r) => { if (r.status() >= 400) projErrs.push(`${r.status()} ${new URL(r.url()).pathname}`); });
const phoneCtx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const phone = await phoneCtx.newPage();
const phoneErrs = []; phone.on('pageerror', (e) => phoneErrs.push(e.message));
const api = (path, init) => proj.request.fetch(BASE + path, init);
const screens = async () => (await api('/api/remote/screens')).json();

try {
  // 0. the remote routes are gated: no session, no header → 401; the pair redeem is reachable
  const anon = await phone.request.post(BASE + '/api/remote/commands', { data: { type: 'scroll', args: { dir: 'up' } } });
  check('commands need a session', anon.status() === 401, anon.status());
  const anonPair = await phone.request.post(BASE + '/api/remote/pair', { data: { pin: '000000' } });
  check('pair redeem is reachable without a session (401 wrong, not a gate 401 page)', anonPair.status() === 401 && (await anonPair.text()).includes('PIN'), anonPair.status());

  // 1. the projector: a logged-in studio tab (the shell gates on the session COOKIE, not the header), forced on as "projector"
  const login = await proj.request.post(BASE + "/api/auth/login", { data: { password: PW } });
  check("the projector logs in", login.ok(), login.status());
  await proj.goto(`${BASE}/studio?screen=projector`);
  const pill = await until(() => proj.locator('.bigscreen__pill.is-on').count().then((n) => n > 0));
  check('the pill shows listening', pill);
  const s1 = await until(async () => { const s = await screens(); return s.find((x) => x.name === 'projector') ? s : null; });
  check('the projector heartbeats', !!s1, s1 && s1.map((s) => `${s.name}:${s.view}`).join(','));

  // 2. the phone: not logged in → the pairing screen
  await phone.goto(`${BASE}/remote`);
  check('the phone sees the pairing screen', await until(() => phone.locator('.remote--pair').count().then((n) => n > 0)));
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/e2e-phone-pair.jpg`, type: 'jpeg', quality: 80 });
  await phone.fill('.remote__pin', '123456');
  await phone.click('.remote__btn--primary');
  check('a wrong PIN is refused', await until(() => phone.locator('.remote__err').count().then((n) => n > 0)));
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/e2e-phone-wrong.jpg`, type: 'jpeg', quality: 80 });

  // 3. mint the PIN on the projector through the pill's menu, read it, type it on the phone
  const probe = await proj.request.post(BASE + '/api/remote/pair/new');
  check('POST /api/remote/pair/new answers', probe.ok(), probe.status() + ' ' + (await probe.text()).slice(0, 120));
  await proj.click('.bigscreen__pill');
  if (SHOTS) await proj.screenshot({ path: `${SHOTS}/e2e-menu.jpg`, type: 'jpeg', quality: 80 });
  await proj.click('.bigscreen__pair');
  const pinText = await until(() => proj.locator('.bigscreen__pin').textContent());
  const pin = (pinText || '').replace(/\D/g, '');
  check('the projector shows a 6-digit PIN', /^\d{6}$/.test(pin), pinText);
  if (SHOTS) await proj.screenshot({ path: `${SHOTS}/e2e-pin.jpg`, type: 'jpeg', quality: 80 });
  await proj.click('.bigscreen__pinbox .bigscreen__pair'); // Done
  await phone.fill('.remote__pin', pin);
  await phone.click('.remote__btn--primary');
  check('the phone is in after pairing', await until(() => phone.locator('.remote__agents').count().then((n) => n > 0)));
  const showing = await until(() => phone.locator('.remote__showing:not(.remote__showing--none)').textContent(), 8000);
  check('the phone says what the projector shows', !!showing, showing);
  const again = await phone.request.post(BASE + '/api/remote/pair', { data: { pin } });
  check('the PIN is single use', again.status() === 401, again.status());
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}/e2e-phone-paired.jpg`, type: 'jpeg', quality: 80 });

  // 4. tap an agent → the projector lands on the Agent tab with that dock
  const agentBtn = phone.locator('.remote__agent', { hasText: 'pers-dec' }).first();
  const agentName = (await agentBtn.count()) ? 'pers-dec' : await phone.locator('.remote__agent b').first().textContent();
  await (await agentBtn.count() ? agentBtn : phone.locator('.remote__agent').first()).click();
  const landed = await until(async () => /\/studio\/agent/.test(proj.url()) && (await proj.locator('body').textContent()).includes(agentName));
  check(`the projector opened ${agentName} in the Agent tab`, landed, proj.url());
  const beat = await until(async () => (await screens()).find((s) => s.name === 'projector' && s.activeAgent === agentName));
  check('the heartbeat reports the active agent', !!beat, beat && beat.activeAgent);
  // sofa view (openspec sofa-mode): ⤢ on; no app pushed yet → the chat alone; push an app → split 30 / 70; off → normal
  check('the phone offers Sofa view', await until(() => phone.locator('.remote__sofa').count().then((n) => n > 0), 5000));
  await phone.click('.remote__sofa');
  check('the dock maximizes the chat', await until(() => proj.locator('.phone--chat-max').count().then((n) => n > 0), 8000));
  check('no app pushed → no split yet', (await proj.locator('.phone__screen--split').count()) === 0);
  check('the heartbeat reports sofa', await until(async () => (await screens()).find((s) => s.name === 'projector' && s.layout === 'sofa'), 10000));
  check('the button shows on', await until(() => phone.locator('.remote__sofa.is-on').count().then((n) => n > 0), 8000));
  if (await phone.locator('.remote__app').count()) {
    await phone.locator('.remote__app').first().click();
    check('pushing an app from the phone splits the dock', await until(() => proj.locator('.phone__screen--split').count().then((n) => n > 0), 8000));
    const chatPct = await proj.locator('.phone__screen--split .phone__main').first().evaluate((e) => e.style.flex).catch(() => '');
    check('the chat pane is 30 %', /\b30%/.test(chatPct || ''), chatPct);
    if (SHOTS) { await proj.screenshot({ path: `${SHOTS}/e2e-projector-sofa.jpg`, type: 'jpeg', quality: 80 }); await phone.screenshot({ path: `${SHOTS}/e2e-phone-sofa.jpg`, type: 'jpeg', quality: 80 }); }
  } else check('the repo has local apps for the Apps row', false, 'none listed');
  await phone.click('.remote__sofa');
  check('sofa view off restores the dock', await until(async () => (await proj.locator('.phone--chat-max').count()) === 0 && (await proj.locator('.phone__screen--split').count()) === 0, 8000));
  if (SHOTS) { await proj.screenshot({ path: `${SHOTS}/e2e-projector-agent.jpg`, type: 'jpeg', quality: 80 }); await phone.screenshot({ path: `${SHOTS}/e2e-phone-agent.jpg`, type: 'jpeg', quality: 80 }); }
  check('the composer targets the agent', (await phone.locator('.remote__targethead').textContent()).includes(agentName));
  // peek: the opened agent's last reply, collapsed by default, readable on the phone
  const peekBtn = await until(() => phone.locator('.remote__peektoggle').count().then((n) => n > 0), 10000);
  check('peek is offered for an agent with a transcript', peekBtn);
  if (peekBtn) {
    await phone.click('.remote__peektoggle');
    check('peek shows the last reply', await until(() => phone.locator('.remote__peektext').textContent().then((t) => (t || '').trim().length > 20), 5000));
    if (SHOTS) await phone.screenshot({ path: `${SHOTS}/e2e-phone-peek.jpg`, type: 'jpeg', quality: 80 });
    await phone.click('.remote__peektoggle');
  }
  await phone.locator('.remote__lane', { hasText: 'Ask' }).click();
  check('the lane toggle reaches the projector dock', await until(() => proj.locator('body').textContent().then((t) => /Ask/.test(t || '')), 5000));
  await phone.locator('.remote__lane').first().click();

  // 5. scroll / zoom commands are taken (outcome shows in the pill's menu)
  await phone.click('.remote__ctl .remote__btn >> nth=4'); // A+
  const zoomed = await until(() => proj.evaluate(() => document.body.style.zoom), 6000);
  check('zoom in applied on the projector', zoomed === '1.15', zoomed);
  await phone.click('.remote__ctl .remote__btn >> nth=3'); // A−
  await until(() => proj.evaluate(() => document.body.style.zoom === '1'), 6000);

  // 6. tap Kanban → the projector hops to the Management App and keeps listening
  await phone.locator('.remote__chip', { hasText: 'Kanban' }).click();
  const hopped = await until(() => /events-feed\/manage\/index\.html\?tab=kanban&screen=projector/.test(proj.url()));
  check('the projector hopped to the Management Kanban with the screen name', hopped, proj.url());
  const beat2 = await until(async () => (await screens()).find((s) => s.name === 'projector' && /management/.test(s.view || '')), 15000);
  check('the Management App heartbeats as the projector', !!beat2, beat2 && beat2.view);
  if (SHOTS) await proj.screenshot({ path: `${SHOTS}/e2e-projector-kanban.jpg`, type: 'jpeg', quality: 80 });

  // 7. tap Arch → stays in the Management App, Arch tab
  await phone.locator('.remote__chip', { hasText: 'Arch' }).click();
  const arch = await until(() => /tab=arch/.test(proj.url()), 12000);
  check('the projector shows Management · Arch', arch, proj.url());
  check('the composer now targets the arch', await until(() => phone.locator('.remote__targethead').textContent().then((t) => /arch/i.test(t)), 5000));
  if (SHOTS) { await proj.screenshot({ path: `${SHOTS}/e2e-projector-arch.jpg`, type: 'jpeg', quality: 80 }); await phone.screenshot({ path: `${SHOTS}/e2e-phone-arch.jpg`, type: 'jpeg', quality: 80 }); }

  // 8. tap the agent again → back to the studio Agent tab (hop from the Management App)
  await (await phone.locator('.remote__agent', { hasText: agentName }).count() ? phone.locator('.remote__agent', { hasText: agentName }).first() : phone.locator('.remote__agent').first()).click();
  const back = await until(async () => /\/studio\/agent/.test(proj.url()) && (await proj.locator('body').textContent()).includes(agentName), 15000);
  check('back on the Agent tab from the Management App', back, proj.url());
  check('the hook exists on the page', await proj.evaluate(() => typeof window.claudewebRemote === 'function'));
  const hooked = await proj.evaluate(() => window.claudewebRemote({ type: 'zoom', args: { dir: 'in' } }));
  check('the hook dispatches directly', /zoom 115%/.test(hooked || ''), hooked);
} catch (e) {
  out.error = String(e?.message || e);
  out.failed = true;
} finally {
  out.projErrors = projErrs.slice(0, 3); out.phoneErrors = phoneErrs.slice(0, 3);
  await b.close();
}
console.log(JSON.stringify(out));
if (SHOTS) fs.writeFileSync(`${SHOTS}/e2e-result.json`, JSON.stringify(out, null, 1));
process.exit(out.failed ? 1 : 0);
