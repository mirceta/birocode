// Browser/HTTP regression checks, reusing an isolated live-test transcript. No model calls.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let chromium;
try { ({ chromium } = createRequire(path.join(root, 'client/package.json'))('playwright')); }
catch { ({ chromium } = createRequire(path.join(root, '.claudeweb-preview/playwright/package.json'))('playwright')); }
const previous = process.env.PARITY_EVIDENCE || fs.readdirSync(path.join(root, '.claudeweb-preview'))
  .filter(n => n.startsWith('parity-live-')).sort().reverse().map(n => path.join(root, '.claudeweb-preview', n))
  .find(p => fs.existsSync(path.join(p, 'verdict.json')) && JSON.parse(fs.readFileSync(path.join(p, 'verdict.json'))).pass);
if (!previous) throw new Error('Run the live parity verification first.');
const run = path.join(root, '.claudeweb-preview', 'parity-ui-' + Date.now());
const data = path.join(run, 'data'); fs.mkdirSync(run); fs.cpSync(path.join(previous, 'data'), data, { recursive: true });
const base = 'http://127.0.0.1:5239', password = 'isolated-parity-test', id = 'a'.repeat(32);
const checks = []; let app, browser, headers;
const delay = ms => new Promise(r => setTimeout(r, ms));
function check(name, pass) { checks.push({ name, pass: !!pass }); console.log((pass ? 'ok' : 'FAIL') + ' - ' + name); if (!pass) throw new Error(name); }
async function api(url, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + '/api' + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(url + ': ' + JSON.stringify(result)); return result;
}
try {
  const exe = path.join(root, '.claudeweb-preview/parity-test-artifacts/bin/ClaudeWeb.App/debug/ClaudeWeb.exe');
  app = spawn(exe, [], { cwd: path.dirname(exe), windowsHide: true, stdio: 'ignore', env: { ...process.env,
    CLAUDEWEB_DATADIR: data, CLAUDEWEB_PORT: '5239', CLAUDEWEB_AUTHPASSWORD: password, CLAUDEWEB_ARCHHOMEDIR: path.join(data, 'arch-home'), CLAUDEWEB_LANBYPASSCIDRS__0: '' } });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await delay(500); }
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  const cookie = login.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1]; check('login', cookie);
  headers = { Cookie: `claudeweb_session=${cookie}`, 'Content-Type': 'application/json', 'X-Repo-Id': id };
  const repo2 = path.join(run, 'other-repo'); fs.mkdirSync(repo2); spawnSync('git', ['init', '-q', repo2]);
  const other = await api('/repos', { folder: repo2, name: 'Other parity repo', visibility: 'advanced' });
  await api(`/repos/${other.id}/provider`, { provider: 'claude', model: 'claude-sonnet-4-6' });
  await api('/dock', { repoId: other.id, repoName: 'Other parity repo', status: 'idle' });
  const tabs = await api('/dock'), tab = tabs.find(t => t.repoId === id);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  await context.addCookies([{ name: 'claudeweb_session', value: cookie, url: base }]);
  await context.addInitScript(({ id, tabId }) => {
    localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('claudeweb_repo', id);
    localStorage.setItem('claudeweb_dock_active', tabId); localStorage.setItem('claudeweb_chat_view', 'agent');
  }, { id, tabId: tab.id });
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/studio', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('select.chat__model');
  check('saved primary model', await page.locator('select.chat__model').first().inputValue() === 'gpt-6-astra');
  await page.locator('.provider-capabilities summary').first().click();
  check('capability guidance names unsupported integrations', (await page.locator('.provider-capabilities').first().innerText()).includes('Claude-in-Chrome'));
  await page.screenshot({ path: path.join(run, 'capabilities.png'), fullPage: true });
  await page.locator('.app-header__title--btn').click();
  await page.locator('.dash__view').nth(1).click();
  const secondary = page.locator('.phone').filter({ has: page.locator('.phone__name', { hasText: 'Other parity repo' }) });
  await secondary.locator('select.chat__model').waitFor();
  check('background dock has its own model', await secondary.locator('select.chat__model').inputValue() === 'claude-sonnet-4-6');
  await secondary.locator('select.chat__model').selectOption('claude-haiku-4-5-20251001');
  for (let i = 0; i < 30; i++) { if ((await api('/repos')).find(r => r.id === other.id)?.model === 'claude-haiku-4-5-20251001') break; await delay(200); }
  let repos = await api('/repos');
  check('background model change targets that repo', repos.find(r => r.id === other.id)?.model === 'claude-haiku-4-5-20251001');
  check('background change preserves primary selection', repos.find(r => r.id === id)?.model === 'gpt-6-astra');
  await secondary.locator('.phone__provider-select').selectOption('codex');
  await page.waitForFunction(() => [...document.querySelectorAll('.phone')].find(p => p.querySelector('.phone__name')?.textContent === 'Other parity repo')?.querySelector('select.chat__model')?.value === 'gpt-6-astra');
  check('engine control and embedded model picker agree', await secondary.locator('select.chat__model').inputValue() === 'gpt-6-astra');
  await page.screenshot({ path: path.join(run, 'docks.png'), fullPage: true });
  await page.locator('.app-header__title--btn').click();
  await page.locator('select.chat__model').first().selectOption('claude-sonnet-4-6');
  await delay(500);
  await page.locator('select.chat__model').first().selectOption('gpt-6-astra');
  await delay(500);
  await api(`/repos/${id}/provider`, { provider: 'claude', model: 'claude-sonnet-4-6' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('select.chat__model');
  check('reload honors external engine changes', await page.locator('select.chat__model').first().inputValue() === 'claude-sonnet-4-6');
  await api(`/repos/${id}/provider`, { provider: 'codex', model: 'gpt-6-astra' });
  const unsupported = await fetch(base + '/api/chat', { method: 'POST', headers, body: JSON.stringify({ message: 'browser test', browser: true }) });
  check('unsupported browser request is explicit', unsupported.status === 400 && (await unsupported.json()).code === 'provider-capability');
  const missing = await fetch(base + '/api/chat', { method: 'POST', headers, body: JSON.stringify({ message: 'continue', sessionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }) });
  const events = (await missing.text()).split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5)));
  check('missing history fails without silent reset', events.some(e => e.type === 'error') && !events.some(e => e.type === 'session'));
  check('no browser exceptions', !errors.length);
} catch (e) {
  console.log('FAIL - ' + e.stack); checks.push({ name: e.message, pass: false });
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) { await page.screenshot({ path: path.join(run, 'failure.png'), fullPage: true }).catch(() => {}); fs.writeFileSync(path.join(run, 'failure.html'), await page.content().catch(() => '')); }
}
finally {
  if (browser) await browser.close().catch(() => {});
  if (app?.pid) spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  const pass = checks.every(c => c.pass); fs.writeFileSync(path.join(run, 'verdict.json'), JSON.stringify({ pass, checks }, null, 2));
  console.log('@@PROVIDER_UI@@ ' + JSON.stringify({ pass, run, checks })); process.exitCode = pass ? 0 : 1;
}
