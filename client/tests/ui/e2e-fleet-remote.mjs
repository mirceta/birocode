// openspec remote-fleet-agents — end-to-end on TWO isolated harnesses (HUB, PEER, HUBPW, PEERPW, SID
// from the env; launched by client/tests/ui/fleet-remote-e2e.ps1): a projector tab (1920x1080,
// logged in at the HUB, ?screen=projector) and a phone (390x844) that pairs with the HUB only.
//   - the phone lists the agents of BOTH machines, grouped; the peer's list equals the peer's own dock
//     (list-completeness), the hub's equals the hub's dock
//   - the relay is allow-listed (dock yes, repos no) and a chat send is refused while sends are off
//   - tapping a peer agent sends the projector to the PEER's harness, logged in by the one-shot PIN
//     (no login page), showing that agent; the peer's heartbeat reaches the phone through the relay
//   - a zoom from the phone reaches the projector THERE; peek reads the peer agent's transcript
//   - tapping a hub agent brings the projector home; a view tapped while away brings it home first
// No prompt is sent (that would run an agent). Prints one JSON line of facts; exit 1 when a check fails.
import { chromium } from 'playwright';
import fs from 'node:fs';

const { HUB, PEER, HUBPW, PEERPW, SID } = process.env;
const SHOTS = process.env.SHOTS || '';
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail }); if (!ok) out.failed = true; };
const until = async (fn, ms = 12000, step = 300) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

const b = await chromium.launch({ channel: 'chrome' });
// The projector: NO password header on the context — it will visit the peer too, and the peer's
// gate must see only what the PIN hop gives it. It logs in at the hub by cookie.
const projCtx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await projCtx.addInitScript(() => { try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {} });
const proj = await projCtx.newPage();
const projErrs = []; proj.on('pageerror', (e) => projErrs.push(e.message));
const phoneCtx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const phone = await phoneCtx.newPage();
const phoneErrs = []; phone.on('pageerror', (e) => phoneErrs.push(e.message));
const hubApi = (path, init) => proj.request.fetch(HUB + path, init);                  // cookie session at the hub
const peerDirect = (path) => proj.request.fetch(PEER + path, { headers: { 'X-Auth-Password': PEERPW } }); // the test's own eyes on the peer
const hubScreens = async () => (await hubApi('/api/remote/screens')).json();
const peerScreens = async () => (await peerDirect('/api/remote/screens')).json();
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: 'jpeg', quality: 80 }); };

try {
  // 1. the projector: logged in at the hub, listening as "projector"
  const login = await hubApi('/api/auth/login', { method: 'POST', data: { password: HUBPW } });
  check('the projector logs in at the hub', login.ok(), login.status());
  await proj.goto(`${HUB}/studio?screen=projector`);
  check('the pill shows listening', await until(() => proj.locator('.bigscreen__pill.is-on').count().then((n) => n > 0)));
  check('the projector heartbeats at the hub', await until(async () => (await hubScreens()).find((x) => x.name === 'projector')));

  // 2. the phone pairs with the HUB (and only the hub)
  const minted = await (await hubApi('/api/remote/pair/new', { method: 'POST' })).json();
  await phone.goto(`${HUB}/remote`);
  check('the phone sees the pairing screen', await until(() => phone.locator('.remote--pair').count().then((n) => n > 0)));
  await phone.fill('.remote__pin', minted.pin);
  await phone.click('.remote__btn--primary');
  check('the phone is in after pairing', await until(() => phone.locator('.remote__agents').count().then((n) => n > 0)));

  // 3. the list: both machines, grouped; the peer's agents are exactly the peer's dock
  const peerDock = await (await peerDirect('/api/dock')).json();
  const hubDock = await (await hubApi('/api/dock')).json();
  const peerGroup = phone.locator(`.remote__machine[data-source="${SID}"]`);
  const listed = await until(async () => { const n = await peerGroup.locator('.remote__agent').count(); return n >= peerDock.length ? n : null; }, 40000, 1000);
  check('the phone shows the peer machine with its agents', !!listed, `${listed} agents listed, peer dock has ${peerDock.length}`);
  const peerNames = await peerGroup.locator('.remote__agent b').allTextContents();
  check('list-completeness: the peer group equals the peer\'s own dock', sameSet(peerNames, peerDock.map((t) => t.repoName)), JSON.stringify({ phone: peerNames, peer: peerDock.map((t) => t.repoName) }));
  const hubNames = await phone.locator('.remote__machine[data-source="self"] .remote__agent b').allTextContents();
  check('the hub group equals the hub\'s own dock', sameSet(hubNames, hubDock.map((t) => t.repoName)), JSON.stringify({ phone: hubNames, hub: hubDock.map((t) => t.repoName) }));
  const heads = await phone.locator('.remote__machinehead').allTextContents();
  check('the peer group is headed by its machine label', heads.some((h) => /PEER-E2E/.test(h)), heads.join(' / '));
  await shot(phone, 'e2e-phone-fleet-list');

  // 4. the relay: allow-listed; sends gated by the hub's switch
  const relayDock = await phone.request.get(`${HUB}/api/remote/relay/${SID}/dock`);
  check('relay: the peer dock is readable through the hub', relayDock.ok() && Array.isArray(await relayDock.json()), relayDock.status());
  const relayRepos = await phone.request.get(`${HUB}/api/remote/relay/${SID}/repos`);
  check('relay: anything off the allow-list is 404', relayRepos.status() === 404, relayRepos.status());
  const sendOff = await phone.request.post(`${HUB}/api/remote/relay/${SID}/chat`, { headers: { 'X-Repo-Id': peerDock[0]?.repoId || 'x' }, data: { message: 'never sent' } });
  check('relay: a chat send is refused (403) while sends to the peer are off', sendOff.status() === 403, sendOff.status() + ' ' + (await sendOff.text()).slice(0, 100));
  const allow = await hubApi(`/api/collector/sources/${SID}/sends`, { method: 'POST', data: { allow: true } });
  check('the Operator allows sends to the peer', allow.ok(), allow.status());
  const stopRelay = await phone.request.post(`${HUB}/api/remote/relay/${SID}/chat/stop?lane=builder`, { headers: { 'X-Repo-Id': peerDock[0]?.repoId || 'x' } });
  // The peer's own answer comes back ("No running turn" is the peer talking — the relay reached it).
  const stopText = await stopRelay.text();
  check('relay: with sends on, a stop reaches the peer (its own answer, not 403 / 502 / "not relayed")', ![403, 502].includes(stopRelay.status()) && !/not relayed|unknown machine/.test(stopText), stopRelay.status() + ' ' + stopText.slice(0, 100));

  // 5. tap a peer agent -> the projector hops to the PEER's harness, logged in by the PIN, showing it
  const peerAgent = peerDock.find((t) => t.repoName === 'pers-dec') || peerDock[0];
  await peerGroup.locator('.remote__agent', { hasText: peerAgent.repoName }).first().click();
  const hopped = await until(async () => proj.url().startsWith(PEER) && /\/studio/.test(proj.url()) && !/\/remote/.test(proj.url()) && (await proj.locator('body').textContent()).includes(peerAgent.repoName), 30000, 500);
  check(`the projector is on the PEER showing ${peerAgent.repoName}`, hopped, proj.url());
  check('no login page on the peer (the PIN signed the screen in)', (await proj.locator('input[type="password"]').count()) === 0);
  check('the hop URL ends in the studio, not on /remote', !/\/remote/.test(proj.url()), proj.url());
  const peerBeat = await until(async () => (await peerScreens()).find((s) => s.name === 'projector' && s.activeAgent === peerAgent.repoName), 20000);
  check('the projector heartbeats at the PEER with the active agent', !!peerBeat, peerBeat && peerBeat.activeAgent);
  const showing = await until(() => phone.locator('.remote__showing:not(.remote__showing--none)').textContent().then((s) => (/PEER-E2E/.test(s || '') ? s : null)), 15000);
  check('the phone says the projector shows the peer (through the relay)', !!showing, showing);
  check('the composer targets the peer agent, naming the machine', await until(() => phone.locator('.remote__targethead').textContent().then((s) => new RegExp(`${peerAgent.repoName}.*PEER-E2E`).test(s || '')), 5000));
  await shot(proj, 'e2e-projector-on-peer'); await shot(phone, 'e2e-phone-on-peer');

  // 6. commands follow the screen: a zoom from the phone lands on the projector at the PEER
  await phone.click('.remote__ctl .remote__btn >> nth=4'); // A+
  const zoomed = await until(() => proj.evaluate(() => document.body.style.zoom).then((z) => (z === '1.15' ? z : null)), 10000);
  check('zoom from the phone applied on the projector at the peer', zoomed === '1.15', zoomed);
  await phone.click('.remote__ctl .remote__btn >> nth=3'); // A-
  await until(() => proj.evaluate(() => document.body.style.zoom === '1'), 6000);
  // peek through the relay: the peer agent's last reply
  const peekBtn = await until(() => phone.locator('.remote__peektoggle').count().then((n) => n > 0), 15000);
  check('peek is offered for the peer agent (its transcript, through the relay)', peekBtn);
  if (peekBtn) {
    await phone.click('.remote__peektoggle');
    check('peek shows the peer agent\'s last reply', await until(() => phone.locator('.remote__peektext').textContent().then((t) => (t || '').trim().length > 20), 5000));
    await shot(phone, 'e2e-phone-peer-peek');
    await phone.click('.remote__peektoggle');
  }

  // 7. tap a hub agent -> the projector comes home
  const hubAgent = hubDock.find((t) => t.repoName === 'birocode') || hubDock[0];
  await phone.locator(`.remote__machine[data-source="self"] .remote__agent`, { hasText: hubAgent.repoName }).first().click();
  const home = await until(async () => proj.url().startsWith(HUB) && /\/studio/.test(proj.url()) && (await proj.locator('body').textContent()).includes(hubAgent.repoName), 30000, 500);
  check(`the projector is back at the HUB showing ${hubAgent.repoName}`, home, proj.url());
  check('the hub heartbeat reports the active agent', await until(async () => (await hubScreens()).find((s) => s.name === 'projector' && s.activeAgent === hubAgent.repoName), 20000));
  check('the phone follows the screen home', await until(() => phone.locator('.remote__showing').textContent().then((s) => (s && !/PEER-E2E/.test(s) ? s : null)), 15000));
  await shot(proj, 'e2e-projector-home');

  // 8. away again, then a view: the screen comes home FIRST, then opens the hub's Kanban
  await peerGroup.locator('.remote__agent', { hasText: peerAgent.repoName }).first().click();
  check('away on the peer again', await until(() => (proj.url().startsWith(PEER) && /\/studio/.test(proj.url()) ? proj.url() : null), 30000, 500), proj.url());
  await until(async () => (await peerScreens()).find((s) => s.name === 'projector'), 15000);
  await phone.locator('.remote__chip', { hasText: 'Kanban' }).click();
  const kanban = await until(() => (proj.url().startsWith(HUB) && /events-feed\/manage\/index\.html\?tab=kanban&screen=projector/.test(proj.url()) ? proj.url() : null), 40000, 500);
  check('a view tapped while away brings the projector home and opens the hub Kanban', !!kanban, proj.url());
  await shot(proj, 'e2e-projector-kanban-after-away');
} catch (e) {
  out.error = String(e?.message || e);
  out.failed = true;
} finally {
  out.projErrors = projErrs.slice(0, 3); out.phoneErrors = phoneErrs.slice(0, 3); out.projUrl = proj.url();
  await b.close();
}
console.log(JSON.stringify(out));
if (SHOTS) fs.writeFileSync(`${SHOTS}/e2e-result.json`, JSON.stringify(out, null, 1));
process.exit(out.failed ? 1 : 0);
