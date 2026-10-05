// Evidence shot for openspec arch-model-fable: the Arch tab's composer row carries the dock's
// own model picker (the same ModelSelector the repo agents have), preselected with the model
// GET /api/arch reports, and a pick posts to POST /api/arch/model — the arch's counterpart of
// the repo's provider endpoint — and shows the server's answer.
//
//   node client/tests/ui/shot-arch-model-picker.mjs
// Output: docs/screenshots/arch-model-picker.png

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(clientRoot, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const now = Date.now();
let model = 'claude-fable-5-1';
const archState = () => ({
  gateOpen: true, killSwitch: true, model, loop: null, engine: null, session: { id: 'sess-1' },
  home: { path: 'C:/repos/arch-home', exists: true, commits: [] },
  disallowedTools: [], agents: [], repos: [], scope: { repoIds: [], fleet: [] },
  fleet: { selfLabel: 'spacex', acceptSends: false, acceptUpgrades: false, sources: [] },
  drivenQuietSeconds: 300,
});
const messages = [
  { role: 'user', text: 'which model are you on?', timestamp: new Date(now - 60_000).toISOString(), synthetic: false, actor: 'human', toolCalls: null },
  { role: 'assistant', text: 'Whatever the picker below says — every turn of mine is spawned with it.', timestamp: new Date(now - 50_000).toISOString(), synthetic: false, actor: null, toolCalls: null },
];
const posts = [];
function mock(pathname, method, body) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/tasks': return { session: { run: null } };
    case '/api/arch': return archState();
    case '/api/arch/model': {
      posts.push(body);
      if (body?.model && !body.model.startsWith('claude')) return { status: 400, body: { error: `"${body.model}" is not a Claude model; the arch agent runs on Claude only.`, model } };
      model = body?.model || 'claude-fable-5-1';
      return { model };
    }
    case '/api/arch/conversations': return { conversations: [{ id: '@arch', name: 'Arch agent', isDefault: true, createdAt: now, sessionId: 'sess-1' }] };
    case '/api/arch/messages': return { sessionId: 'sess-1', messages, total: messages.length };
    case '/api/arch/tool-calls': return { calls: [], turns: [], total: 0 };
    case '/api/arch/tools': return { tools: [], denied: [] };
    case '/api/arch/tool-calls/preflight': return { checks: [] };
    case '/api/codex-usage': return { available: false };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.endsWith('/stream')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }); return; }
  const req = route.request();
  let body = null;
  try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
  const r = mock(u.pathname, req.method(), body);
  if (r && typeof r.status === 'number' && r.body) { route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) }); return; }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`${base}/manage.html?tab=arch&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.arch__composer-row select.chat__model', { timeout: 15000 });
const before = await page.evaluate(() => {
  const sel = document.querySelector('.arch__composer-row select.chat__model');
  return { value: sel.value, groups: [...sel.querySelectorAll('optgroup')].map((g) => g.dataset.provider), hasFable: !!sel.querySelector('option[value="claude-fable-5-1"]') };
});
await (await page.$('main') || page).screenshot({ path: path.join(OUT, 'arch-model-picker.png') });

// A Claude pick posts and sticks.
await page.selectOption('.arch__composer-row select.chat__model', 'claude-sonnet-4-6');
await page.waitForFunction(() => document.querySelector('.arch__composer-row select.chat__model')?.value === 'claude-sonnet-4-6', null, { timeout: 10000 });
const picked = await page.evaluate(() => document.querySelector('.arch__composer-row select.chat__model').value);

// A codex pick is refused by the server; the picker falls back to what the server kept and the error shows.
await page.selectOption('.arch__composer-row select.chat__model', 'gpt-6-astra');
await page.waitForSelector('.arch__banner--err', { timeout: 10000 }).catch(() => null);
await page.waitForTimeout(300);
const refused = await page.evaluate(() => ({
  value: document.querySelector('.arch__composer-row select.chat__model').value,
  error: (document.querySelector('.arch__banner--err')?.textContent || '').trim(),
}));
await browser.close();
await server.close();

const result = {
  pickerInComposerRow: before.value === 'claude-fable-5-1' && before.hasFable,
  sameTwoFamiliesAsTheDock: before.groups.join(',') === 'claude,codex',
  claudePickPostsAndSticks: posts[0]?.model === 'claude-sonnet-4-6' && picked === 'claude-sonnet-4-6',
  codexPickRefusedKeepsServerModel: posts[1]?.model === 'gpt-6-astra' && refused.value === 'claude-sonnet-4-6' && /not a Claude model/.test(refused.error),
  noPageErrors: errs.length === 0,
  posts, before, refused, errs,
};
console.log(JSON.stringify(result, null, 2));
const ok = result.pickerInComposerRow && result.sameTwoFamiliesAsTheDock && result.claudePickPostsAndSticks && result.codexPickRefusedKeepsServerModel && result.noPageErrors;
process.exit(ok ? 0 : 1);
