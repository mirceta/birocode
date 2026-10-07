// REAL end-to-end for openspec arch-custom-prompts (fleet task ebc91192) against a BUILT,
// isolated harness instance seeded with a copy of this hub's live data (.claudeweb-preview/
// arch-prompts-live.ps1 boots it and runs this). On the Management dashboard's Arch agent tab:
//   1. the Cached prompts panel seeds itself on first use from the REAL Arch examples data
//      (the committed snapshot of the mined categories) — cards grouped by category;
//   2. a prompt with placeholders is inserted, its chips offer the hub's machines / agents,
//      the values are filled, and the prompt is SENT to the real arch (a read-only ask);
//   3. "▶ send" on "Which agents are free?" sends it now (a real turn);
//   4. re-seed: an edited seeded prompt survives, a deleted one comes back, a custom one stays;
//   5. tool parity: the Operator asks the arch to cache a prompt → cache_prompt stores it.
// The repo agents' own prompt library (no owner) is asserted untouched throughout.
// Env: BASE, PW. Prints one JSON summary; exit 0 only when the must-pass checks hold.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE; const PW = process.env.PW;
if (!BASE || !PW) { console.log(JSON.stringify({ error: 'BASE and PW are required' })); process.exit(1); }
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('manageapp.layout', 'tabs'); localStorage.setItem('manageapp.hidden', '[]'); localStorage.setItem('arch.promptsOpen', '1'); localStorage.setItem('arch.sideOpen', '0'); });
const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { password: PW } });
if (!login.ok()) { console.log(JSON.stringify({ error: `login failed: ${login.status()}` })); process.exit(1); }
const api = async (method, p, data) => {
  const r = await ctx.request.fetch(`${BASE}/api${p}`, { method, data, headers: { 'X-Auth-Password': PW } });
  const text = await r.text();
  try { return { status: r.status(), body: JSON.parse(text) }; } catch { return { status: r.status(), body: text }; }
};
// Wait for the arch's reply to land in the default conversation (a real turn).
async function waitForReply(afterCount, maxMs = 240_000) {
  const t0 = Date.now();
  for (;;) {
    const m = (await api('GET', '/arch/messages?conv=@arch')).body?.messages || [];
    const assistants = m.filter((x) => x.role === 'assistant' && x.text);
    const running = (await api('GET', '/arch')).body?.session?.run?.status === 'running';
    if (assistants.length > afterCount && !running) return assistants[assistants.length - 1].text;
    if (Date.now() - t0 > maxMs) return null;
    await sleep(4000);
  }
}
const assistantCount = async () => ((await api('GET', '/arch/messages?conv=@arch')).body?.messages || []).filter((x) => x.role === 'assistant' && x.text).length;

const result = { shots: [] };
try {
  const repos = (await api('GET', '/repos')).body;
  const self = (Array.isArray(repos) ? repos : repos.repos || []).find((r) => r.isSelf);
  const chatBefore = (await api('GET', '/prompts')).body;
  const examples = (await api('GET', '/arch/examples')).body;
  result.examples = { source: examples?.source, categories: examples?.categories?.length };
  result.chatPromptsBefore = Array.isArray(chatBefore) ? chatBefore.length : null;
  const archBefore = (await api('GET', `/prompts?owner=arch`)).body;
  result.archPromptsBefore = Array.isArray(archBefore) ? archBefore.length : null;

  // ---- 1. the panel seeds itself on first use ----
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}/api/localview/${self.id}/app/events-feed/manage/index.html?tab=arch&layout=tabs`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-arch-prompts]', { timeout: 60000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-arch-prompts]')?.dataset.apCount || 0) >= 20, null, { timeout: 60000 });
  await sleep(800);
  const panel = await page.$eval('[data-arch-prompts]', (n) => ({
    count: Number(n.dataset.apCount), counts: n.dataset.apCounts, note: n.querySelector('[data-ap-note]')?.textContent || '',
    groups: [...n.querySelectorAll('[data-ap-group]')].map((g) => ({ name: g.dataset.apGroup, cards: g.querySelectorAll('[data-ap-card]').length })),
    seeds: [...n.querySelectorAll('[data-ap-card]')].map((c) => c.dataset.apSeed).filter(Boolean),
    marks: [...n.querySelectorAll('[data-ap-card]')].map((c) => c.dataset.apMark),
  }));
  result.panel = panel;
  const shot = async (sel, file) => { const el = await page.$(sel); if (el) { await el.screenshot({ path: path.join(OUT, file) }); result.shots.push(file); } };
  await shot('[data-arch-prompts]', 'arch-prompts-panel.png');

  // ---- 2. insert a placeholder prompt, fill the chips from the pick lists, send it ----
  await page.fill('[data-ap-search]', 'investigate');
  await page.waitForSelector('[data-ap-seed="investigate"] [data-ap-insert]', { timeout: 10000 });
  await page.click('[data-ap-seed="investigate"] [data-ap-insert]');
  await page.waitForSelector('[data-placeholder-chips]', { timeout: 10000 });
  const chips = await page.$$eval('[data-placeholder]', (ns) => ns.map((n) => ({ name: n.dataset.placeholder, kind: n.dataset.placeholderKind, options: [...(n.querySelector('datalist')?.options || [])].map((o) => o.value) })));
  result.chips = chips;
  await shot('.arch__composer', 'arch-prompts-chips.png');
  const machine = chips.find((c) => c.name === 'machine')?.options[0];
  const agentOpts = chips.find((c) => c.name === 'agent')?.options || [];
  const agent = agentOpts.find((h) => /birokrat-ai-platform/.test(h)) || agentOpts[0];
  await page.fill('[data-placeholder-input="machine"]', machine || 'this hub');
  await page.click('[data-placeholder-fill="machine"]');
  await page.fill('[data-placeholder-input="agent"]', agent || 'the birocode agent');
  await page.click('[data-placeholder-fill="agent"]');
  await page.waitForFunction(() => !document.querySelector('[data-placeholder-chips]'), null, { timeout: 5000 });
  const filledDraft = await page.$eval('.arch__composer textarea', (n) => n.value);
  result.filledDraft = filledDraft;
  await shot('.arch__composer', 'arch-prompts-filled.png');
  let n0 = await assistantCount();
  await page.click('.arch__composer .arch__btn--primary');
  log('sent the filled investigate prompt');
  const reply1 = await waitForReply(n0);
  result.reply1 = reply1 ? reply1.slice(0, 400) : null;
  await sleep(1500);
  await shot('[data-arch-conv], .arch__chat, .arch', 'arch-prompts-sent.png');

  // ---- 3. "which agents are free?" via ▶ send now ----
  await page.fill('[data-ap-search]', 'free');
  await page.waitForSelector('[data-ap-seed="agents-status"] [data-ap-send]', { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('[data-ap-seed="agents-status"] [data-ap-send]')?.disabled, null, { timeout: 120000 });
  n0 = await assistantCount();
  await page.click('[data-ap-seed="agents-status"] [data-ap-send]');
  log('sent "which agents are free?" now');
  const reply2 = await waitForReply(n0);
  result.reply2 = reply2 ? reply2.slice(0, 400) : null;
  await page.fill('[data-ap-search]', '');

  // ---- 4. re-seed behaviour: edit one, delete one, add a custom, re-seed ----
  await page.click('[data-ap-seed="redeploy-hub"] [data-ap-edit]');
  await page.waitForSelector('[data-ap-form] [data-ap-text]', { timeout: 5000 });
  await page.fill('[data-ap-form] [data-ap-text]', 'We merged PR #{pr} in birocode. Pull main and redeploy HERE only, then tell me the commit and the health check in one line.');
  await page.click('[data-ap-form] [data-ap-save]');
  await page.waitForSelector('[data-ap-seed="redeploy-hub"][data-ap-mark="edited"]', { timeout: 10000 });
  await page.click('[data-ap-seed="card-delete"] [data-ap-delete]');
  await page.waitForFunction(() => !document.querySelector('[data-ap-seed="card-delete"]'), null, { timeout: 10000 });
  await page.click('[data-ap-new]');
  await page.waitForSelector('[data-ap-form] [data-ap-text]', { timeout: 5000 });
  await page.fill('[data-ap-form] [data-ap-label]', 'My own: fleet build table');
  await page.fill('[data-ap-form] [data-ap-text]', 'Which build is each fleet harness on? Table: machine, commit, healthy.');
  await page.selectOption('[data-ap-form] [data-ap-category]', 'Deploy & fleet');
  await page.click('[data-ap-form] [data-ap-save]');
  await page.waitForSelector('[data-ap-card][data-ap-mark="custom"]', { timeout: 10000 });
  const countBeforeReseed = await page.$eval('[data-arch-prompts]', (n) => Number(n.dataset.apCount));
  await page.click('[data-ap-reseed]');
  await page.waitForFunction(() => /added 1/.test(document.querySelector('[data-ap-note]')?.textContent || ''), null, { timeout: 15000 });
  await page.waitForSelector('[data-ap-seed="card-delete"]', { timeout: 10000 });
  const afterReseed = await page.$eval('[data-arch-prompts]', (n) => ({
    count: Number(n.dataset.apCount), note: n.querySelector('[data-ap-note]')?.textContent || '',
    editedText: n.querySelector('[data-ap-seed="redeploy-hub"]')?.getAttribute('title') || '', editedMark: n.querySelector('[data-ap-seed="redeploy-hub"]')?.dataset.apMark,
    deletedBack: !!n.querySelector('[data-ap-seed="card-delete"]'), customStays: !!n.querySelector('[data-ap-card][data-ap-mark="custom"]'),
  }));
  result.reseed = { countBeforeReseed, ...afterReseed };
  await page.fill('[data-ap-search]', 'redeploy');
  await sleep(400);
  await shot('[data-arch-prompts]', 'arch-prompts-reseed.png');
  await page.fill('[data-ap-search]', '');

  // ---- 5. tool parity: the Operator asks the arch to cache a prompt ----
  const tools = (await api('GET', '/arch/tools')).body;
  result.tools = ['cache_prompt', 'list_cached_prompts', 'remove_cached_prompt'].map((t) => ({ t, present: !!(tools?.tools || []).find((x) => x.name === t) }));
  n0 = await assistantCount();
  const ask = 'Please cache this prompt for me (cache_prompt): label "Peer health check", text "Is {machine} reachable and on the newest build? One line.", category "Deploy & fleet". Then confirm with list_cached_prompts how many prompts there are. Do nothing else.';
  const sent = await api('POST', '/arch/send', { text: ask });
  result.cacheAskSent = sent.status;
  const reply3 = await waitForReply(n0);
  result.reply3 = reply3 ? reply3.slice(0, 400) : null;
  const archAfter = (await api('GET', `/prompts?owner=arch`)).body;
  const cached = (Array.isArray(archAfter) ? archAfter : []).find((p) => /peer health/i.test(p.label || '') || /\{machine\} reachable/.test(p.text || ''));
  result.cachedByTool = cached ? { label: cached.label, category: cached.category, seeded: !!cached.seedId, text: cached.text } : null;
  const toolCalls = (await api('GET', '/arch/tools')).body?.tools || [];
  result.toolCalls = Object.fromEntries(['cache_prompt', 'list_cached_prompts'].map((t) => [t, toolCalls.find((x) => x.name === t)?.calls || 0]));
  result.chatPromptsAfter = (await api('GET', '/prompts')).body?.length ?? null;
  result.archPromptsAfter = Array.isArray(archAfter) ? archAfter.length : null;
  result.seededList = (Array.isArray(archAfter) ? archAfter : []).map((p) => `${p.emoji} ${p.label}${p.seedId ? '' : ' (custom)'}${p.edited ? ' (edited)' : ''}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-ap-card][data-ap-mark="custom"]', { timeout: 60000 });
  await sleep(600);
  await shot('[data-arch-prompts]', 'arch-prompts-after-tool.png');
} catch (e) {
  result.error = String(e?.stack || e);
}
await ctx.close(); await browser.close();

const checks = {
  seededFromRealExamplesOnFirstUse: (result.archPromptsBefore === 0) && (result.panel?.count || 0) >= 24 && /first use/.test(result.panel?.note || '') && result.examples?.categories >= 20,
  cardsGroupedByCategory: (result.panel?.groups || []).length >= 5 && (result.panel?.groups || []).every((g) => g.cards > 0),
  everyCardSeededAtStart: (result.panel?.marks || []).length > 0 && (result.panel?.marks || []).every((m) => m === 'seeded'),
  chipsOfferMachinesAndAgents: (result.chips || []).some((c) => c.name === 'machine' && c.kind === 'machine' && c.options.length >= 1) && (result.chips || []).some((c) => c.name === 'agent' && c.kind === 'agent' && c.options.length >= 1),
  placeholdersFilledIntoTheDraft: !!result.filledDraft && !/\{machine\}|\{agent\}/.test(result.filledDraft) && /birokrat|birocode|\//.test(result.filledDraft),
  filledPromptSentAndAnswered: !!result.reply1,
  sendNowAnswered: !!result.reply2,
  reseedKeepsEditsRestoresDeletedKeepsCustom: !!result.reseed && result.reseed.editedMark === 'edited' && /HERE only/.test(result.reseed.editedText) && result.reseed.deletedBack && result.reseed.customStays && result.reseed.count === result.reseed.countBeforeReseed + 1,
  toolsInCatalogue: (result.tools || []).every((t) => t.present),
  archCachedAPromptOnTheOperatorsAsk: !!result.cachedByTool && !result.cachedByTool.seeded && (result.toolCalls?.cache_prompt || 0) >= 1,
  repoAgentsLibraryUntouched: result.chatPromptsBefore !== null && result.chatPromptsBefore === result.chatPromptsAfter,
  noPageErrors: errs.length === 0,
};
result.checks = checks;
result.pageErrors = errs;
console.log(JSON.stringify(result, null, 1));
const must = ['seededFromRealExamplesOnFirstUse', 'cardsGroupedByCategory', 'chipsOfferMachinesAndAgents', 'placeholdersFilledIntoTheDraft', 'filledPromptSentAndAnswered', 'sendNowAnswered', 'reseedKeepsEditsRestoresDeletedKeepsCustom', 'toolsInCatalogue', 'repoAgentsLibraryUntouched', 'noPageErrors'];
console.log(must.every((k) => checks[k]) ? 'ALL PASS' : 'SOME FAILED');
process.exit(must.every((k) => checks[k]) ? 0 : 1);
