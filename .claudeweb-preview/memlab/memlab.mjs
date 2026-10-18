// openspec arch-memory-store (fleet task 0953472c) — drives the lab (lab.ps1: HUB, HUBPW, OUT, LABHOME from env):
//  1. first run imported the arch home's memory/*.md and seeded the two principles (API + the tab);
//  2. an edit made IN THE TAB is what the arch sees on its next REAL turn (a Claude CLI turn on the lab harness);
//  3. the turn recorded lastUsed / "used recently";
//  4. a secret is refused — in the tab (visible error) and by the server (400 with the reason);
//  5. the arch's role prompt in the home is v20 (memory rule rewritten).
// Screenshots go into a public repo: entry bodies are blurred except the Operator's principles.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const { HUB, HUBPW, OUT, LABHOME } = process.env;
const MANAGE = `${HUB}/api/localview/c7a98bafdf4d433d990f870a0eda8725/app/events-feed/manage/?tab=memory&layout=tabs`;
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f));
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 200) : ''}`); if (!ok) out.failed = true; };
const until = async (fn, ms = 15000, step = 400) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
let n = 0;
const shot = async (page, name) => { n += 1; await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false }); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => {
  try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {}
  const css = '[data-memory]:not([data-memory-kind="principle"]) .mem__body, [data-memory]:not([data-memory-kind="principle"]) .mem__meta .mem__dim { filter: blur(5px); }';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const api = (p, init) => page.request.fetch(HUB + p, init);
const MARK = 'OWL-' + Math.floor(1000 + Math.random() * 9000);

try {
  check('logs in at the lab hub', (await api('/api/auth/login', { method: 'POST', data: { password: HUBPW } })).ok());
  const mdCount = fs.readdirSync(path.join(LABHOME, 'memory')).filter((f) => f.endsWith('.md')).length;
  const mem = await (await api('/api/memory')).json();
  const imported = mem.entries.filter((e) => e.source);
  check(`1a first run imported every memory/*.md of the arch home (${mdCount} files)`, imported.length === mdCount, `${imported.length} imported`);
  check('1b imported entries are author arch, dated from git, marked for review', imported.every((e) => e.author === 'arch' && e.needsReview && e.created > 0), imported.slice(0, 3).map((e) => `${e.title}:${e.kind}`).join(', '));
  const principles = mem.entries.filter((e) => e.kind === 'principle');
  check('1c the Operator\'s two principles are seeded (operator, pinned)', principles.length === 2 && principles.every((e) => e.author === 'operator' && e.pinned), principles.map((e) => e.title).join(' | '));
  check('1d kinds were assigned by content', new Set(imported.map((e) => e.kind)).size >= 3, [...new Set(imported.map((e) => e.kind))].join(','));

  await page.goto(MANAGE);
  await page.locator('[data-memory-tab]').waitFor({ timeout: 20000 });
  check('1e the Memory tab shows the imported entries and the principles', (await page.locator('[data-memory]').count()) === mem.entries.length, `${await page.locator('[data-memory]').count()} cards`);
  await shot(page, 'memory-tab');

  // 2. edit a principle IN THE TAB
  const front = page.locator('[data-memory][data-memory-kind="principle"]', { hasText: 'Front desk' }).first();
  await front.locator('[data-memory-edit]').click();
  const ed = page.locator('[data-memory-editor]').first();
  const body = ed.locator('[data-memory-field="body"]');
  await body.fill((await body.inputValue()) + ` Sign off every reply to the Operator with the word ${MARK}.`);
  await ed.locator('[data-memory-field="reason"]').fill('lab check: the arch must see this edit on its next turn');
  await shot(page, 'editing-a-principle');
  await ed.locator('[data-memory-save]').click();
  check('2a the edit is saved from the tab', !!(await until(() => page.locator('[data-memory-note]').count())), await page.locator('[data-memory-note]').textContent().catch(() => ''));
  const edited = (await (await api('/api/memory')).json()).entries.find((e) => e.title.startsWith('Front desk'));
  check('2b the store holds the new text, a new version, confirmed by the Operator', edited.body.includes(MARK) && edited.versions >= 2 && !edited.needsReview, `versions ${edited.versions}`);
  const preview = await (await api('/api/memory/context?message=hello')).json();
  check('2c the next turn\'s memory block carries the edited principle', (preview.text || '').includes(MARK));

  // 3. a REAL arch turn sees it
  const send = await api('/api/arch/send', { method: 'POST', data: { text: 'Lab check, answer in one line without using any tools: which sign-off word does your principles block tell you to use?' } });
  check('3a the arch accepts the Operator message', send.ok(), send.status());
  const reply = await until(async () => {
    const m = await (await api('/api/arch/messages?tail=6')).json();
    const msgs = m.messages || [];
    const last = msgs[msgs.length - 1];
    return last && last.role === 'assistant' && (last.text || '').trim() ? last.text : null;
  }, 240000, 3000);
  check(`3b the arch's reply names ${MARK} (it read the edit made in the tab)`, (reply || '').includes(MARK), reply);
  const after = (await (await api('/api/memory')).json()).entries.find((e) => e.id === edited.id);
  check('3c the turn recorded lastUsed / used recently on what it loaded', !!after.lastUsed && after.usedRecently, `useCount ${after.useCount}`);
  await page.reload(); await page.locator('[data-memory-tab]').waitFor();
  await page.locator('[data-memory-filter="used"]').click();
  await shot(page, 'used-recently');
  await page.locator('[data-memory-filter="used"]').click();

  // 4. a secret is refused
  const before = (await (await api('/api/memory')).json()).entries.length;
  const r = await api('/api/memory', { method: 'POST', data: { title: 'db access', body: 'Server=db1;Database=crm;User Id=sa;Password=hunter22;', kind: 'fleet-fact', reason: 'so the arch can connect' } });
  const rj = await r.json();
  check('4a the server refuses a connection string with a password (400 + the reason)', r.status() === 400 && /refused: this looks like a connection string/.test(rj.error), rj.error);
  await page.locator('[data-memory-add]').click();
  const ne = page.locator('[data-memory-editor="new"]');
  await ne.locator('[data-memory-field="title"]').fill('GitHub access');
  await ne.locator('[data-memory-field="kind"]').selectOption('fleet-fact');
  await ne.locator('[data-memory-field="body"]').fill('use token ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789');
  await ne.locator('[data-memory-field="reason"]').fill('so pushes work');
  await ne.locator('[data-memory-save]').click();
  const shown = await until(() => ne.locator('[data-memory-problems], [data-memory-error]').first().textContent(), 4000);
  check('4b the tab shows the refusal visibly and saves nothing', /secret|GitHub token/i.test(shown || '') && (await (await api('/api/memory')).json()).entries.length === before, shown);
  await shot(page, 'secret-refused');

  // 5. the role prompt
  const role = fs.readFileSync(path.join(LABHOME, 'CLAUDE.md'), 'utf8');
  check('5a the arch home\'s role prompt is v20 with the memory-store rule', role.includes('arch-role v20') && role.includes('confirm_memory'));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('unexpected error', false, e.stack || e.message);
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(`@@MEMLAB@@ ${out.failed ? 'FAILED' : 'OK'} ${out.checks.filter((x) => x.ok).length}/${out.checks.length}`);
await b.close();
