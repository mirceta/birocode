// Evidence shot for openspec repo-agent-requests: the arch conversation (Management App → Arch
// tab) over a mocked transcript in which an approved repo-agent request was relayed by the
// harness as a user message tagged actor "request", and the arch answered the agent with
// send_task. Asserts the tag is rendered on that message and screenshots the chat.
//
//   node client/tests/ui/shot-arch-chat-request.mjs
// Output: docs/screenshots/arch-chat-request.png

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
const archState = {
  gateOpen: true, killSwitch: true, loop: null, engine: null, session: { id: 'sess-1' },
  home: { path: 'C:/repos/arch-home', exists: true, commits: [] },
  disallowedTools: [], agents: [], repos: [], scope: { repoIds: [], fleet: [] },
  fleet: { selfLabel: 'spacex', acceptSends: false, acceptUpgrades: false, sources: [] },
  drivenQuietSeconds: 300,
};
const call = (id, name, ok, detail, preview, at) => ({ kind: 'tool', id, name, tool: name.replace(/^mcp__arch__/, ''), status: ok === false ? 'error' : 'done', ok, summary: '', detail, preview, startedAt: at, durationMs: 1200 });
const requestText = '[Request from repo agent spacex/prg#1 — approved by the Operator: Need the staging DB]\nPlease have MONSTER/web-flow-autodev#1 upload prod.bak to the hub as web/db/prod.bak so I can reproduce the invoice bug. I tried the fixtures; they lack the 2025 rows. Meanwhile I am writing the migration.\n\n(The agent recorded this with request_arch; the Operator approved it on the Repo Agent Requests tab. Act on it as you would on the Operator\'s own instruction, and answer the agent with send_task if it needs a reply.)';
const messages = [
  { role: 'user', text: 'keep prg and web-flow green today', timestamp: new Date(now - 1800_000).toISOString(), synthetic: false, actor: 'human', toolCalls: null },
  { role: 'assistant', text: 'On it. Both agents have their tasks.', timestamp: new Date(now - 1790_000).toISOString(), synthetic: false, actor: null, toolCalls: [
    call('t1', 'mcp__arch__list_agents', true, '{}', '{"ok":true,"detail":"2 agents"}', new Date(now - 1795_000).toISOString()),
  ] },
  { role: 'user', text: requestText, timestamp: new Date(now - 240_000).toISOString(), synthetic: false, actor: 'request', toolCalls: null },
  { role: 'assistant', text: 'Approved request from prg#1. I asked MONSTER/web-flow-autodev#1 to upload prod.bak to the hub as web/db/prod.bak and will move it to spacex with hub_transfer when it lands; prg#1 is told to expect it under hub-downloads/web/db/prod.bak.', timestamp: new Date(now - 225_000).toISOString(), synthetic: false, actor: null, toolCalls: [
    call('t2', 'mcp__arch__send_task', true, '{"machine":"MONSTER","repoId":"web-flow-autodev#1","text":"Upload prod.bak to the hub file system as web/db/prod.bak (hub_upload) and reply with the hub path."}', '{"ok":true,"status":"sent","detail":"queued on MONSTER/web-flow-autodev#1"}', new Date(now - 235_000).toISOString()),
    call('t3', 'mcp__arch__send_task', true, '{"machine":"self","repoId":"prg#1","text":"Your request is approved: prod.bak is being uploaded by web-flow-autodev#1; it will arrive on this machine\'s hub store as web/db/prod.bak — hub_download it into hub-downloads/."}', '{"ok":true,"status":"sent","detail":"queued on spacex/prg#1"}', new Date(now - 230_000).toISOString()),
  ] },
];
function mock(pathname) {
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return archState;
    case '/api/arch/conversations': return { conversations: [{ id: '@arch', name: 'Arch agent', isDefault: true, createdAt: now, sessionId: 'sess-1' }] };
    case '/api/arch/messages': return { sessionId: 'sess-1', messages, total: messages.length };
    case '/api/arch/tool-calls': return { sessionId: 'sess-1', calls: [], turns: [], total: 0, truncated: false, limit: 50 };
    case '/api/autopilot/loops': return { loops: [], recipes: [] };
    case '/api/arch/tools': return { tools: [], denied: [] };
    case '/api/arch/tool-calls/preflight': return { checks: [] };
    case '/api/tasks': return { session: { run: null } };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.endsWith('/stream')) { route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }); return; }
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(u.pathname)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`${base}/manage.html?tab=arch&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.msg--actor-request', { timeout: 15000 });
const seen = await page.evaluate(() => ({
  tag: document.querySelector('.msg--actor-request .msg__actor')?.textContent,
  text: document.querySelector('.msg--actor-request .msg__text')?.textContent,
  sends: [...document.querySelectorAll('.step--tool .step__name')].map((e) => e.textContent),
}));
await (await page.$('main') || page).screenshot({ path: path.join(OUT, 'arch-chat-request.png') });
await browser.close();
await server.close();

const result = {
  requestMessageTagged: seen.tag === 'request',
  requestTextShown: /approved by the Operator: Need the staging DB/.test(seen.text || '') && /prod\.bak/.test(seen.text || ''),
  archAnsweredWithSendTask: seen.sends.filter((s) => /send_task/.test(s)).length === 2,
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ seen, pageErrors: errs, result, out: path.join(OUT, 'arch-chat-request.png') }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
