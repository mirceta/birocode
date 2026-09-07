// Real paid CLI calls; isolated harness data/repo. Native credentials are reused, never modified.
// Run through run.cmd so the evidence and final verdict survive agent-session restarts.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'client/package.json'));
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire(path.join(root, '.claudeweb-preview/playwright/package.json'))('playwright')); }
const run = path.join(root, '.claudeweb-preview', 'parity-live-' + Date.now());
const data = path.join(run, 'data'), repo = path.join(run, 'repo');
fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(repo);
const id = 'a'.repeat(32), port = Number(process.env.PARITY_PORT || 5238), base = `http://127.0.0.1:${port}`;
const password = 'isolated-parity-test', checks = [];
let app, browser, headers, lastSession;
const delay = ms => new Promise(r => setTimeout(r, ms));
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'ok' : 'FAIL'} - ${name} ${detail}`);
  if (!pass) throw new Error(name + ': ' + detail);
}
async function request(url, body, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(base + '/api' + url, { headers, method, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(240000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status} ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
async function turn(message, sessionId, lane) {
  const start = Date.now(); console.log('starting turn', message.slice(0, 90));
  const r = await fetch(base + '/api/chat', { method: 'POST', headers, body: JSON.stringify({ message, sessionId, lane }), signal: AbortSignal.timeout(240000) });
  const raw = await r.text();
  const events = raw.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5)));
  fs.writeFileSync(path.join(run, `turn-${start}.json`), JSON.stringify(events, null, 2));
  check('turn completes', r.ok && events.some(e => e.type === 'done') && !events.some(e => e.type === 'error'), events.filter(e => e.type === 'error').map(e => e.message).join('; '));
  lastSession = events.find(e => e.type === 'session')?.sessionId;
  return { events, id: lastSession, text: events.filter(e => e.type === 'token').map(e => e.text).join('') };
}
try {
  console.log('Evidence directory:', run);
  spawnSync('git', ['init', '-q', repo]);
  spawnSync('git', ['-C', repo, '-c', 'user.name=parity', '-c', 'user.email=parity@example.invalid', 'commit', '--allow-empty', '-m', 'init'], { stdio: 'ignore' });
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), 'When creating a text file for a task, append the line APRICOT to the file. Keep responses concise.\n');
  fs.writeFileSync(path.join(data, 'repositories.json'), JSON.stringify([{ Id: id, Name: 'Provider parity', Path: repo, Provider: 'claude', Visibility: 'advanced' }]));
  fs.writeFileSync(path.join(data, 'autopilot-gate.json'), JSON.stringify({ enabled: true }));
  const exe = path.join(root, '.claudeweb-preview/parity-artifacts/bin/ClaudeWeb.App/debug/ClaudeWeb.exe');
  const proxyConfig = path.join(data, 'proxy-config.json');
  fs.writeFileSync(proxyConfig, JSON.stringify({ mcpServers: Object.fromEntries(['one', 'two'].map(name => [name, {
    command: process.execPath, args: [path.join(root, 'tests/provider-parity/mcp-probe.mjs')], env: { BIROKRAT_API_KEY: 'proxy-' + name }
  }])) }));
  for (const name of ['one', 'two']) {
    const proxy = spawnSync(exe, ['--mcp-stdio-proxy', proxyConfig, name], { windowsHide: true, encoding: 'utf8', timeout: 15000,
      input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'harness_probe', arguments: {} } }) + '\n' });
    check('MCP proxy preserves per-server environment: ' + name, proxy.status === 0 && proxy.stdout.includes('proxy-' + name), proxy.error?.message || proxy.stderr);
  }
  app = spawn(exe, [], { cwd: path.dirname(exe), windowsHide: true, stdio: 'ignore', env: { ...process.env,
    CLAUDEWEB_DATADIR: data, CLAUDEWEB_PORT: String(port), CLAUDEWEB_AUTHPASSWORD: password,
    CLAUDEWEB_WORKINGDIRECTORY: repo, CLAUDEWEB_ARCHHOMEDIR: path.join(data, 'arch-home'), CLAUDEWEB_LANBYPASSCIDRS__0: '' } });
  app.on('error', e => console.log('host spawn error', e.message));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await delay(500); }
  const auth = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  const cookie = auth.headers.get('set-cookie')?.match(/claudeweb_session=([^;]+)/)?.[1];
  check('isolated harness login', !!cookie);
  headers = { Cookie: `claudeweb_session=${cookie}`, 'Content-Type': 'application/json', 'X-Repo-Id': id };
  const nonce = 'cobalt-' + Math.random().toString(36).slice(2, 10);
  const claude = await turn(`The feature we are working on is named ${nonce}. Keep that name for the next turn; do not edit files yet. Reply with the name only.`);
  check('Claude executes', claude.text.includes(nonce));
  await request(`/repos/${id}/provider`, { provider: 'codex', model: 'gpt-6-astra' });
  const codex = await turn('Create handoff.txt containing the feature name we agreed on. Follow the repository formatting instructions. Reply with the file contents.', claude.id);
  check('Claude to Codex handoff recalls chat and loads CLAUDE.md', codex.text.includes(nonce) && codex.text.includes('APRICOT'));
  check('handoff is visible', codex.events.some(e => e.type === 'handoff'));
  let messages = await request(`/sessions/${codex.id}/messages`);
  check('Codex reload preserves both providers', messages.some(m => m.text.includes(nonce)) && messages.some(m => m.text.includes('APRICOT')));
  check('Codex appears in session list', (await request('/sessions')).some(s => s.id === codex.id && s.provider === 'codex'));
  const resumed = await turn('What feature name have we been working on? Answer with the name only, without using tools.', codex.id);
  check('Codex native resume', resumed.id === codex.id && resumed.text.includes(nonce));
  await request(`/repos/${id}/provider`, { provider: 'claude', model: '' });
  const back = await turn('What feature name have we been working on? Answer with the name only, without using tools.', codex.id);
  check('Codex to Claude handoff', back.text.includes(nonce) && back.events.some(e => e.type === 'handoff'));
  await request(`/repos/${id}/provider`, { provider: 'codex', model: 'gpt-6-astra' });
  const token = 'PARITY-MCP-' + Math.random().toString(36).slice(2, 9);
  await request('/tools/host', { birokratServerEntry: path.join(root, 'tests/provider-parity/mcp-probe.mjs') }, 'PUT');
  await request(`/tools/birokrat?repoId=${id}`, { enabled: true, apiKey: token, apiUrl: 'http://127.0.0.1:9/unused', companies: [] }, 'PUT');
  const mcp = await turn('Call the birokrat harness_probe MCP tool and write the returned token to mcp.txt. Reply with the token.', back.id);
  check('MCP environment and execution', fs.readFileSync(path.join(repo, 'mcp.txt'), 'utf8').includes(token));
  check('live MCP result details', mcp.events.some(e => e.type === 'tool' && e.status === 'end' && e.preview?.includes(token)));
  check('MCP durable history', (await request(`/sessions/${mcp.id}/tools`)).some(t => t.preview?.includes(token)));
  await turn('Try to create readonly-probe.txt. If writing is blocked, report that restriction.', undefined, 'ask');
  check('Ask filesystem restriction', !fs.existsSync(path.join(repo, 'readonly-probe.txt')));
  await request('/autopilot/loop', { repoId: id, action: 'start', kind: 'recipe', mode: 'drive', sessionId: mcp.id,
    prompt: 'Call birokrat harness_probe again, write the returned token to loop-mcp.txt, then end with PARITY_DONE. If asked to verify, check that file and finish with PARITY_DONE.', sentinel: 'PARITY_DONE', maxIterations: 4 });
  let loop;
  for (let i = 0; i < 150; i++) {
    loop = (await request('/autopilot')).loops.find(l => l.repoId === id);
    if (loop && !loop.active) break;
    if (i % 15 === 0) console.log('loop progress', JSON.stringify(loop));
    await delay(2000);
  }
  check('Codex loop observes completion', loop && !loop.active && loop.status === 'done' && loop.stopReason === 'sentinel', JSON.stringify(loop));
  check('loop receives same MCP tools', fs.readFileSync(path.join(repo, 'loop-mcp.txt'), 'utf8').includes(token));
  const sessionCount = (await request('/sessions')).length;
  await request('/local-apps/discover');
  let discovery;
  for (let i = 0; i < 120; i++) {
    discovery = await request('/local-apps/discover/status');
    if (discovery.status !== 'running') break;
    await delay(2000);
  }
  check('Codex discovery helper without Claude Monitor', discovery.status === 'done', JSON.stringify(discovery));
  await request('/understanding/ask', { sessionId: mcp.id });
  let understanding;
  for (let i = 0; i < 150; i++) {
    understanding = await request('/understanding/status');
    if (understanding.status !== 'running') break;
    await delay(2000);
  }
  check('Codex Understanding helper', understanding.status === 'done' && fs.existsSync(path.join(repo, 'understanding-app/index.html')), JSON.stringify(understanding));
  check('helpers do not pollute conversations', (await request('/sessions')).length === sessionCount);
  const tab = await request('/dock', { repoId: id, repoName: 'Provider parity', sessionId: mcp.id, status: 'done' });
  // Browser reload and persisted model/capability controls.
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addCookies([{ name: 'claudeweb_session', value: cookie, url: base }]);
  await ctx.addInitScript(({ repoId, tabId }) => {
    localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('claudeweb_repo', repoId);
    localStorage.setItem('claudeweb_dock_active', tabId); localStorage.setItem('claudeweb_chat_view', 'agent');
  }, { repoId: id, tabId: tab.id });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/studio', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('select.chat__model', { timeout: 30000 });
  check('saved Codex model in browser', await page.locator('select.chat__model').first().inputValue() === 'gpt-6-astra');
  await page.waitForFunction(code => document.body.innerText.includes(code), nonce, { timeout: 30000 });
  check('browser displays transferred conversation', (await page.locator('body').innerText()).includes(nonce));
  await page.screenshot({ path: path.join(run, 'studio.png'), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('select.chat__model');
  await page.waitForFunction(code => document.body.innerText.includes(code), nonce, { timeout: 30000 });
  check('browser reload retains conversation', (await page.locator('body').innerText()).includes(nonce));
  check('browser reload without JS errors', errors.length === 0, errors.join('; '));
  fs.writeFileSync(path.join(run, 'checks.json'), JSON.stringify(checks, null, 2));
} catch (e) { console.log('FAIL - exception', e.stack); checks.push({ name: 'exception', pass: false, detail: e.message }); }
finally {
  if (browser) await browser.close().catch(() => {});
  if (app?.pid) spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  const pass = checks.length > 0 && checks.every(c => c.pass);
  fs.writeFileSync(path.join(run, 'verdict.json'), JSON.stringify({ pass, checks }, null, 2));
  console.log('@@PROVIDER_PARITY@@ ' + JSON.stringify({ pass, run, checks }));
  process.exitCode = pass ? 0 : 1;
}
