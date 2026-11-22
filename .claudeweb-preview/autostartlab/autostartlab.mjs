// Fleet task f88f97fe — local-app autostart + sentry, live on two isolated harnesses on the hub machine (lab.ps1).
// Lab hub :5304 (copy of the live repositories.json + discovery cache; nothing of the live apps is flagged) and lab
// peer "spacex-lab" :5306. Throwaway test apps: hub alpha 47411 / beta 47412 / gamma 47413 (never flagged) /
// zeta 47414 (broken command); peer delta 47421 / epsilon 47422 (never flagged). Everything the Operator does is
// done in the Management dashboard's Local apps tab (Playwright); the checks read the APIs and the real ports.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const { OUT, BIN, BINPEER, LIVEDATA } = process.env;
const HUB_PORT = 5304, PEER_PORT = 5306;
const HUB = `http://127.0.0.1:${HUB_PORT}`, PEER = `http://127.0.0.1:${PEER_PORT}`;
const HUBPW = 'lab-as-' + Math.random().toString(36).slice(2, 8), PEERPW = 'lab-asp-' + Math.random().toString(36).slice(2, 8);
const SELF_REPO = 'c7a98bafdf4d433d990f870a0eda8725';
const BASE = `${HUB}/api/localview/${SELF_REPO}/app/events-feed/manage/?tab=localapps&layout=tabs`;
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f));
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 2000) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 220) : ''}`); if (!ok) out.failed = true; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 500) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
const listening = (port) => new Promise((res) => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); s.setTimeout(1500, () => { s.destroy(); res(false); }); });
const killPort = (port) => { try { execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }); } catch { /* none */ } };

// ---- fixtures -----------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-autostartlab-'));
const serve = [
  "import http from 'node:http';",
  "import fs from 'node:fs';",
  'const port = Number(process.argv[2]);',
  "const log = (m) => fs.appendFileSync(port + '.log', new Date().toISOString() + ' pid ' + process.pid + ' ' + m + String.fromCharCode(10));",
  "log('start ' + process.cwd());",
  "process.on('uncaughtException', (e) => { log('error ' + e.code + ' ' + e.message); process.exit(1); });",
  "http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/plain' }); s.end('ok ' + port); }).listen(port, '127.0.0.1', () => log('listening'));",
  '',
].join(String.fromCharCode(10));
const hubRepo = path.join(tmp, 'autostart-demo'); const peerRepo = path.join(tmp, 'spacex-demo');
for (const d of [hubRepo, peerRepo]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'serve.mjs'), serve); }
const hubData = path.join(tmp, 'hub-data'); const peerData = path.join(tmp, 'peer-data');
fs.mkdirSync(hubData); fs.mkdirSync(peerData);
fs.copyFileSync(path.join(LIVEDATA, 'repositories.json'), path.join(hubData, 'repositories.json'));
fs.cpSync(path.join(LIVEDATA, 'local-app-cache'), path.join(hubData, 'local-app-cache'), { recursive: true });
fs.writeFileSync(path.join(peerData, 'collector-sources.json'), JSON.stringify([{ id: 'self', label: 'spacex-lab', address: '', kind: 'self', active: true, cred: null, allowSends: false }]));
for (const d of [hubData, peerData]) fs.writeFileSync(path.join(d, 'autopilot-gate.json'), '{"enabled":false}');

const procs = {};
const startHarness = (name, bin, port, data, pw) => {
  const env = { ...process.env, CLAUDEWEB_DATADIR: data, CLAUDEWEB_PORT: String(port), CLAUDEWEB_AUTHPASSWORD: pw, CLAUDEWEB_LANBYPASSCIDRS__0: '',
    CLAUDEWEB_ARCHHOMEDIR: path.join(data, 'arch-home'), CLAUDEWEB_PROXY_NO_BROWSER: '1', CLAUDEWEB_AUTOSTART_BOOT_DELAY_SEC: '3', CLAUDEWEB_AUTOSTART_GRACE_SEC: '8' };
  procs[name] = spawn(path.join(bin, 'ClaudeWeb.exe'), [], { cwd: bin, env, stdio: 'ignore', windowsHide: true });
  return until(() => fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.ok), 60000);
};
const stopHarness = (name) => { try { execSync(`taskkill /PID ${procs[name].pid} /F`, { stdio: 'ignore' }); } catch { /* gone */ } };

let n = 0; const frames = [];
const shot = async (page, name) => { n += 1; const buf = await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`) }); frames.push(buf); };

const b = await chromium.launch();
try {
  check('lab peer "spacex-lab" is up on :5306', await startHarness('peer', BINPEER, PEER_PORT, peerData, PEERPW));
  check('lab hub is up on :5304', await startHarness('hub', BIN, HUB_PORT, hubData, HUBPW));
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {} });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const peerCtx = await b.newContext();
  const hubApi = (p, init) => page.request.fetch(HUB + p, init);
  const peerApi = (p, init) => peerCtx.request.fetch(PEER + p, init);
  check('logs in on both', (await hubApi('/api/auth/login', { method: 'POST', data: { password: HUBPW } })).ok() && (await peerApi('/api/auth/login', { method: 'POST', data: { password: PEERPW } })).ok());

  // The Operator's setup (as the Local setup form does): register the demo repos and their apps; subscribe the peer.
  const hubRepoId = (await (await hubApi('/api/repos', { method: 'POST', data: { folder: hubRepo, name: 'autostart-demo' } })).json()).id;
  for (const [name, port] of [['alpha', 47411], ['beta', 47412], ['gamma', 47413], ['zeta', 47414]]) await hubApi(`/api/repos/${hubRepoId}/localapps`, { method: 'POST', data: { name, port, kind: 'repo' } });
  const peerRepoId = (await (await peerApi('/api/repos', { method: 'POST', data: { folder: peerRepo, name: 'spacex-demo' } })).json()).id;
  for (const [name, port] of [['delta', 47421], ['epsilon', 47422]]) await peerApi(`/api/repos/${peerRepoId}/localapps`, { method: 'POST', data: { name, port, kind: 'repo' } });
  const src = await hubApi('/api/collector/sources', { method: 'POST', data: { address: PEER, label: 'spacex-lab', credential: PEERPW } });
  check('the hub subscribes the lab peer', src.ok(), src.status());

  // 1. the tab lists every machine's registered apps
  await page.goto(BASE);
  await page.locator('[data-local-apps-tab]').waitFor({ timeout: 30000 });
  await until(async () => (await page.locator('[data-la-machine="spacex-lab"] [data-la-row]').count()) >= 2, 30000);
  const machines = await page.$$eval('[data-la-machine]', (els) => els.map((e) => e.getAttribute('data-la-machine')));
  const hubRows = await page.locator('[data-la-machine]').first().locator('[data-la-row]').count();
  check('1 the Local apps tab lists the hub (its real registered apps + the demo) and spacex-lab', machines.length === 2 && machines[1] === 'spacex-lab' && hubRows > 10, `${machines.join(', ')} · hub rows ${hubRows}`);
  const hubLabel = machines[0];
  const row = (m, repoId, app) => page.locator(`[data-la-row="${m}/${repoId}/${app}"]`);
  await row(hubLabel, hubRepoId, 'alpha').scrollIntoViewIfNeeded();
  await shot(page, 'tab-before-flags');

  // 2. flag in the UI: type the start command, toggle Autostart, (alpha) a health URL
  const flag = async (m, repoId, app, port, { health } = {}) => {
    const r = row(m, repoId, app);
    await r.locator('[data-la-field="startCommand"]').fill(`node serve.mjs ${port}`);
    await r.locator('[data-la-field="startCommand"]').press('Enter');
    await r.locator('[data-la-autostart]').click();
    await until(async () => (await r.locator('[data-la-autostart]').isChecked()) && (await r.getAttribute('class'))?.includes('la__row--on'), 15000);
    if (health) { await r.locator('[data-la-field="healthUrl"]').fill(health); await r.locator('[data-la-field="healthUrl"]').press('Enter'); await sleep(800); }
  };
  await flag(hubLabel, hubRepoId, 'alpha', 47411, { health: 'http://127.0.0.1:47411/health' });
  await flag(hubLabel, hubRepoId, 'beta', 47412);
  // zeta's command is broken on purpose (the file does not exist)
  { const r = row(hubLabel, hubRepoId, 'zeta'); await r.locator('[data-la-field="startCommand"]').fill('node missing.mjs'); await r.locator('[data-la-field="startCommand"]').press('Enter'); await r.locator('[data-la-autostart]').click(); await sleep(1000); }
  await flag('spacex-lab', peerRepoId, 'delta', 47421);
  const fleet = await (await hubApi('/api/local-apps/autostart/fleet?fresh=true')).json();
  const hubM = fleet.machines.find((m) => m.self); const peerM = fleet.machines.find((m) => m.machine === 'spacex-lab');
  check('2a three hub apps flagged in the UI, stored on the hub', hubM.flagged === 3, `flagged ${hubM.flagged}`);
  const peerSelf = await (await peerApi('/api/arch/peer/local-apps')).json();
  const pf = peerSelf.data.rows.find((r) => r.appId === 'delta')?.flag;
  check('2b the hub pushed spacex-lab its slice: delta flagged there, with its start command; versions in sync', pf?.autostart === true && pf?.startCommand === 'node serve.mjs 47421' && peerM.inSync, JSON.stringify(pf));
  check('2c unflagged apps stay unflagged (gamma, epsilon)', !peerSelf.data.rows.find((r) => r.appId === 'epsilon')?.flag?.autostart && !hubM.overview.rows.find((r) => r.appId === 'gamma')?.flag?.autostart);

  // 3. apply now on the hub: the flagged apps that are down start; gamma is never touched. (The lab's 3 s boot pass
  //    may already have started what was flagged by then — stop them so Apply now is what brings them up.)
  killPort(47411); killPort(47412);
  await until(async () => !(await listening(47411)) && !(await listening(47412)), 15000);
  await page.locator(`[data-la-apply="${hubLabel}"]`).click();
  const up3 = await until(async () => (await listening(47411)) && (await listening(47412)), 30000);
  check('3a Apply now on the hub started alpha and beta (detached, with their commands)', up3);
  check('3b gamma (not flagged) was not started', !(await listening(47413)));
  await page.locator(`[data-la-check="${hubLabel}"]`).click();
  await until(async () => (await row(hubLabel, hubRepoId, 'alpha').locator('[data-la-state]').getAttribute('data-la-state')) === 'up', 20000);
  await row(hubLabel, hubRepoId, 'alpha').scrollIntoViewIfNeeded();
  await shot(page, 'hub-applied-alpha-beta-up');

  // 4. apply now on spacex-lab
  await page.locator('[data-la-apply="spacex-lab"]').click();
  check('4a Apply now on spacex-lab started delta there', await until(() => listening(47421), 30000));
  check('4b epsilon (not flagged on spacex-lab) was not started', !(await listening(47422)));

  // 5. kill alpha: the sentry detects it and restarts it once
  killPort(47411);
  check('5a alpha killed', await until(async () => !(await listening(47411)), 10000));
  const t5 = Date.now();
  await page.locator(`[data-la-check="${hubLabel}"]`).click();
  const back = await until(() => listening(47411), 40000);
  let diag = '';
  if (!back) {
    try { diag = fs.readFileSync(path.join(hubRepo, '47411.log'), 'utf8').trim().split(/\r?\n/).slice(-5).join(' | '); } catch (e) { diag = 'no app log: ' + e.message; }
    try {
      const a = (await (await hubApi('/api/local-apps/autostart/fleet?fresh=true')).json()).machines.find((m) => m.self).overview.rows.find((r) => r.appId === 'alpha');
      const pid = /pid (\d+)/.exec(a.lastStartResult || '')?.[1];
      diag += ` || last start: ${a.lastStartTrigger} ${a.lastStartResult}`;
      if (pid) diag += ' || procs: ' + execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${pid} -or $_.ParentProcessId -eq ${pid} } | ForEach-Object { [string]$_.ProcessId + [char]32 + $_.Name + [char]32 + $_.CommandLine }"`).toString().trim().split(/\r?\n/).join(', ');
    } catch (e) { diag += ' || proc diag failed ' + e.message; }
    try { diag += ' || tcp: ' + execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 47411 -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.State + [char]32 + $_.OwningProcess }"').toString().trim().split(/\r?\n/).join(', '); } catch { /* none */ }
  }
  check('5b Check now: the sentry saw alpha down and restarted it (one attempt)', back, `listening again after ${Math.round((Date.now() - t5) / 1000)} s ${diag}`);
  await sleep(1500);
  await page.locator(`[data-la-check="${hubLabel}"]`).click();
  await until(async () => (await row(hubLabel, hubRepoId, 'alpha').locator('[data-la-state]').getAttribute('data-la-state')) === 'up', 20000);
  const alpha = (await (await hubApi('/api/local-apps/autostart/fleet?fresh=true')).json()).machines.find((m) => m.self).overview.rows.find((r) => r.appId === 'alpha');
  check('5c alpha is up again; its last start says "sentry restart"', alpha.state === 'up' && /sentry restart|check-now restart/.test(alpha.lastStartTrigger || ''), `${alpha.state} · ${alpha.lastStartTrigger} · ${alpha.lastStartResult}`);
  await row(hubLabel, hubRepoId, 'alpha').scrollIntoViewIfNeeded();
  await shot(page, 'sentry-restarted-alpha');

  // 6. zeta never comes up: one attempt, then failing — no loop — and the tab badge turns red
  const zetaRow = async () => (await (await hubApi('/api/local-apps/autostart/fleet?fresh=true')).json()).machines.find((m) => m.self).overview.rows.find((r) => r.appId === 'zeta');
  const checkNow = () => hubApi('/api/local-apps/autostart/check', { method: 'POST', data: { machine: 'self' } });
  await sleep(9000); // past the lab's 8 s start grace
  const failing = await until(async () => { await checkNow(); const z = await zetaRow(); return z.state === 'failing' ? z : null; }, 40000, 3000);
  for (let i = 0; i < 3; i++) { await checkNow(); await sleep(500); }
  const zeta = await zetaRow();
  check('6a a broken app gets one restart attempt, then "failing" — and stays failing: no further start in 3 more sentry passes', failing && zeta.state === 'failing' && zeta.lastStartAt === failing.lastStartAt && /restart/.test(zeta.lastStartTrigger || ''),
    `${zeta.state} · ${zeta.lastStartTrigger} · last start unchanged ${zeta.lastStartAt === failing?.lastStartAt} · ${zeta.lastError}`);
  await page.locator(`[data-la-check="${hubLabel}"]`).click();
  await until(async () => (await row(hubLabel, hubRepoId, 'zeta').locator('[data-la-state]').getAttribute('data-la-state')) === 'failing', 15000);
  await page.reload();
  const badge = await until(async () => page.locator('[data-local-apps-badge]').getAttribute('data-local-apps-badge'), 40000);
  check('6b the Local apps tab carries a red badge count', Number(badge) >= 1, badge);
  await row(hubLabel, hubRepoId, 'zeta').scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, 'failing-red-badge');
  const summary = await (await hubApi('/api/local-apps/autostart/summary')).json();
  check('6c summary (what the arch\'s local_apps_status reads): 1 failing', summary.failing === 1, JSON.stringify(summary));

  // 7. the sentry interval reaches every machine
  await page.locator('[data-la-interval]').fill('1');
  await page.locator('[data-la-settings-save]').click();
  await sleep(1500);
  const ps = (await (await peerApi('/api/arch/peer/local-apps')).json()).data.settings;
  check('7 the sentry interval set on the hub is pushed to spacex-lab', ps.intervalMin === 1, JSON.stringify(ps));

  // 8. boot: kill the flagged apps and restart each harness — the boot pass starts them again
  killPort(47421); stopHarness('peer');
  await until(async () => !(await listening(PEER_PORT)) && !(await listening(47421)), 15000);
  await startHarness('peer', BINPEER, PEER_PORT, peerData, PEERPW);
  check('8a spacex-lab restarted ("reboot"): its boot pass started delta again, epsilon still untouched', await until(() => listening(47421), 40000) && !(await listening(47422)));
  killPort(47412); stopHarness('hub');
  await until(async () => !(await listening(HUB_PORT)) && !(await listening(47412)), 15000);
  await startHarness('hub', BIN, HUB_PORT, hubData, HUBPW);
  check('8b the hub restarted: its boot pass started beta again, gamma still untouched', await until(() => listening(47412), 40000) && !(await listening(47413)));
  await page.request.fetch(HUB + '/api/auth/login', { method: 'POST', data: { password: HUBPW } });
  await page.goto(BASE);
  await page.locator('[data-la-machine="spacex-lab"] [data-la-row]').first().waitFor({ timeout: 30000 });
  await page.locator('[data-la-flagged-only]').check();
  await sleep(1500);
  await shot(page, 'after-reboot-flagged-only');
  const log = fs.readFileSync(path.join(BIN, 'logs', fs.readdirSync(path.join(BIN, 'logs')).sort().pop()), 'utf8').split('\n').filter((l) => l.includes('[AUTOSTART]'));
  check('8c the hub log records each attempt', log.some((l) => / boot /.test(l) || /boot:/.test(l)) && log.some((l) => /launched pid/.test(l)), log.slice(-3).join(' | '));
  fs.writeFileSync(path.join(OUT, 'autostart-log.txt'), log.join('\n'));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('lab ran to the end', false, e.stack || e.message);
} finally {
  await b.close();
  stopHarness('hub'); stopHarness('peer');
  for (const p of [47411, 47412, 47413, 47414, 47421, 47422]) killPort(p);
  await sleep(1000);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* a process may still hold a file */ }
}

try {
  const gif = GIFEncoder();
  for (const buf of frames) {
    const png = PNG.sync.read(buf);
    const w = Math.floor(png.width / 2); const h = Math.floor(png.height / 2);
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
      let s = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += png.data[((y * 2 + dy) * png.width + (x * 2 + dx)) * 4 + c];
      data[(y * w + x) * 4 + c] = s >> 2;
    }
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: 2200 });
  }
  gif.finish();
  fs.writeFileSync(path.join(OUT, 'autostart.gif'), gif.bytes());
} catch (e) { console.log('GIF failed: ' + e.message); }
out.passed = out.checks.filter((c) => c.ok).length; out.total = out.checks.length;
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(`@@RESULT@@ ${out.passed}/${out.total}`);
