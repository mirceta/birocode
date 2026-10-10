// Evidence for fleet task 28278f6c (openspec model-free-text): the model picker carries
// Claude Opus 5.5, and the model is also a FREE-TEXT id — "Custom model id…" reveals an
// input, the typed id is shape-validated only, used, shown as the current value and
// remembered per device for re-picking. The rig mounts the Management App's Arch pane,
// which renders the SAME ModelSelector component the repo-agent chat composer mounts —
// one component, every mount gets both features.
//
//   node tests/ui/shot-model-picker-custom.mjs
// Shots: model-picker-opus55.png (the catalogue expanded, Opus 5.5 in place),
//        model-picker-custom.png (the free-text input with a typed id),
//        model-picker-recent.png (the remembered id re-pickable after a reload).

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
let archModel = 'claude-fable-5-1';
const posts = [];
function mock(pathname, method, body) {
  if (pathname === '/api/arch/model' && method === 'POST') { posts.push(body); archModel = body?.model || archModel; return { model: archModel }; }
  switch (pathname) {
    case '/api/auth/check': return { authenticated: true };
    case '/api/arch': return { conversation: { id: '@arch', name: 'Arch agent', isDefault: true }, gateOpen: true, killSwitch: true, fleet: { selfLabel: 'spacex' }, goals: [], agents: [], recipes: [], model: archModel };
    case '/api/arch/conversations': return { conversations: [{ id: '@arch', name: 'Arch agent', isDefault: true, running: false, busy: false, goal: null }] };
    case '/api/arch/messages': return { sessionId: 's0', total: 0, messages: [] };
    case '/api/autopilot/loops': return { loops: [] };
    case '/api/codex-usage': return { available: false };
    case '/api/taskgraph': return { staleHours: 24, edges: [], machines: [], scratch: '', goal: '', goalUpdatedAt: 0, nodes: [], integrity: { checkedAt: now, cards: 0, honest: 0, dishonest: 0, stuck: 0, manual: 0, external: 0, flagged: [] } };
    case '/api/taskgraph/layout': return { layout: null };
    case '/api/notes': return [];
    case '/api/tasks': return { session: { run: null } };
    case '/api/recurring': return { tasks: [] };
    default: return {};
  }
}

const server = await createServer({ root: clientRoot, configFile: false, logLevel: 'error', plugins: [react()], define: { __BUILD_TIME__: '"shot"' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('manageapp.layout', 'tabs');
  localStorage.setItem('manageapp.hidden', '[]');
  localStorage.setItem('claudeweb_ui_mode', 'advanced');
  localStorage.removeItem('claudeweb_custom_models');
});
await ctx.route((u) => u.pathname.startsWith('/api/'), async (route) => {
  const { pathname } = new URL(route.request().url());
  if (pathname === '/api/arch/stream') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
  const body = route.request().method() === 'POST' ? JSON.parse(route.request().postData() || 'null') : null;
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock(pathname, route.request().method(), body)) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${base}/manage.html?tab=arch&layout=tabs`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-model-select]', { timeout: 60000 });

// 1. The catalogue: Opus 5.5 present, newest-first slot, Custom group at the end.
const options = await page.$eval('[data-model-select]', (s) => [...s.options].map((o) => ({ v: o.value, t: o.text, g: o.parentElement.label })));
const initial = await page.$eval('[data-model-select]', (s) => s.value);
// Expand the select inline (size trick) so the native popup becomes screenshotable.
await page.$eval('[data-model-select]', (s) => { s.size = s.options.length + 4; });
await (await page.$('[data-model-select]')).screenshot({ path: path.join(OUT, 'model-picker-opus55.png') });
await page.$eval('[data-model-select]', (s) => { s.size = 0; });

// 2. Custom…: the input reveals; an invalid shape cannot be applied; a valid id is used.
await page.selectOption('[data-model-select]', '__custom__');
await page.waitForSelector('[data-model-custom-input]', { timeout: 5000 });
await page.fill('[data-model-custom-input]', 'two words');
const invalid = await page.$eval('[data-model-custom-input]', (i) => i.getAttribute('aria-invalid'));
const applyDisabled = await page.$eval('[data-model-custom-apply]', (b) => b.disabled);
await page.fill('[data-model-custom-input]', 'claude-brand-new-6');
await (await page.$('.chat__bar, .arch__composer, body')).screenshot({ path: path.join(OUT, 'model-picker-custom.png') });
await page.press('[data-model-custom-input]', 'Enter');
await page.waitForFunction(() => document.querySelector('[data-model-select]')?.value === 'claude-brand-new-6', null, { timeout: 5000 });
const posted = posts.at(-1)?.model;
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('claudeweb_custom_models') || '[]'));

// 3. Reload: the remembered id sits in the Custom group and is re-pickable; the current
//    value (persisted server-side) still shows as selected.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-model-select]', { timeout: 60000 });
await page.waitForFunction(() => document.querySelector('[data-model-select]')?.value === 'claude-brand-new-6', null, { timeout: 10000 });
const after = await page.$eval('[data-model-select]', (s) => ({
  value: s.value,
  customGroup: [...s.options].filter((o) => o.parentElement.label && /custom|özel/i.test(o.parentElement.label)).map((o) => o.value),
}));
await page.$eval('[data-model-select]', (s) => { s.size = s.options.length + 4; });
await (await page.$('[data-model-select]')).screenshot({ path: path.join(OUT, 'model-picker-recent.png') });

await browser.close(); await server.close();

const claudeIds = options.filter((o) => o.g === 'Anthropic (Claude)').map((o) => o.v);
const result = {
  opus55InTheListNewestFirst: claudeIds.includes('claude-opus-5-5')
    && claudeIds.indexOf('claude-opus-5-5') > claudeIds.indexOf('claude-fable-5')
    && claudeIds.indexOf('claude-opus-5-5') < claudeIds.indexOf('claude-opus-4-8')
    && options.find((o) => o.v === 'claude-opus-5-5')?.t === 'Opus 5.5',
  archDefaultUnchanged: initial === 'claude-fable-5-1',
  customEntryPresent: options.some((o) => o.v === '__custom__'),
  invalidShapeCannotApply: invalid === 'true' && applyDisabled,
  typedIdUsedAndPosted: posted === 'claude-brand-new-6',
  rememberedPerDevice: stored.includes('claude-brand-new-6'),
  shownAsCurrentAndRepickableAfterReload: after.value === 'claude-brand-new-6' && after.customGroup.includes('claude-brand-new-6'),
  noPageErrors: errs.length === 0,
};
console.log(JSON.stringify({ initial, claudeIds, invalid, applyDisabled, posted, stored, after, pageErrors: errs, result }, null, 1));
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
