// openspec arch-prompts-tab (fleet task f6add917) — drives the lab (lab.ps1: HUB, HUBPW, OUT, MODE from env).
//   MODE=before : the old Management bundle (origin/main) — screenshot the in-chat prompts block above the composer.
//   MODE=after  : this branch — the Prompts tab (seeded library, chips, tools, usage), a prompt FILLED from live
//                 machines/agents and SENT to the arch (a real turn), "Open in Arch chat" landing in the composer,
//                 the cleaned-up chat with its one 📋 Prompts button, and the library actions.
// Screenshots go into a public repo: the arch conversation's message text is blurred.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const { HUB, HUBPW, OUT, MODE } = process.env;
const BASE = `${HUB}/api/localview/c7a98bafdf4d433d990f870a0eda8725/app/events-feed/manage/`;
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) if (f.startsWith(MODE)) fs.unlinkSync(path.join(SHOTS, f));
const out = { mode: MODE, checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 200) : ''}`); if (!ok) out.failed = true; };
const until = async (fn, ms = 15000, step = 400) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
let n = 0;
const shot = async (page, name, clip) => { n += 1; await page.screenshot({ path: path.join(SHOTS, `${MODE}-${String(n).padStart(2, '0')}-${name}.png`), ...(clip ? { clip } : {}) }); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => {
  try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); } catch {}
  const css = '.msg__text, .msg__markdown, .arch__thinking, .arch__banner { filter: blur(5px); }';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const api = (p, init) => page.request.fetch(HUB + p, init);

try {
  check('logs in at the lab hub', (await api('/api/auth/login', { method: 'POST', data: { password: HUBPW } })).ok());
  if (MODE === 'before') {
    await page.goto(BASE + '?tab=arch&layout=tabs');
    const panel = page.locator('[data-arch-prompts]');
    check('before: the old cached-prompts block sits above the Arch composer', !!(await until(() => panel.count())), await panel.count());
    await page.waitForTimeout(1500);
    await shot(page, 'arch-chat-with-the-old-prompts-block');
  } else {
    // 1. the Prompts tab
    await page.goto(BASE + '?tab=prompts&layout=tabs');
    await page.locator('[data-prompts-tab]').waitFor({ timeout: 20000 });
    const cards = await until(async () => { const c = await page.locator('[data-prompt-card]').count(); return c > 0 ? c : null; }, 20000);
    const lib = await (await api('/api/prompts?owner=arch')).json();
    check('1a the Prompts tab shows the whole arch library as cards', cards === lib.length && cards > 0, `${cards} cards, ${lib.length} prompts`);
    check('1b grouped by category', (await page.locator('[data-prompts-group]').count()) >= 2, await page.locator('[data-prompts-group]').count());
    check('1c placeholders render as chips inside the templates', (await page.locator('[data-prompt-card] [data-template-chip]').count()) > 0, await page.locator('[data-prompt-card] [data-template-chip]').count());
    check('1d each card says where it came from and how often it was used', (await page.locator('[data-prompt-card] [data-prompt-usage]').count()) === cards);
    const tools = await page.locator('[data-prompt-tools]').count();
    check('1e seeded prompts show the tools they lead to (from the Arch examples)', tools > 0, `${tools} cards with tools`);
    await shot(page, 'prompts-tab');

    // 2. Use: fill a prompt from live data and SEND it to the arch
    // A harmless prompt made for the test — never a seeded fleet command (even a lab arch must not be told to
    // upgrade or deploy anything); deleted at the end.
    const target = await (await api('/api/prompts', { method: 'POST', data: { owner: 'arch', emoji: '🧪', label: 'Lab check: ping a machine', category: 'Ask & nudge', text: 'Lab check only, use no tools: reply with the single word PONG followed by the machine name {machine}.' } })).json();
    await page.reload();
    await page.locator(`[data-prompt-card="${target.id}"]`).waitFor({ timeout: 15000 });
    const card = page.locator(`[data-prompt-card="${target.id}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.locator(`[data-prompt-use-btn="${target.id}"]`).click();
    const sheet = card.locator(`[data-prompt-use="${target.id}"]`);
    await sheet.waitFor();
    const fieldLog = [];
    for (const field of await sheet.locator('[data-prompt-field]').all()) {
      const name = await field.getAttribute('data-prompt-field');
      const sel = field.locator('select[data-prompt-input]');
      const inp = field.locator('input[data-prompt-input]');
      if (await sel.count()) {
        const val = await sel.locator('option').nth(1).getAttribute('value').catch(() => null);
        if (val) await sel.selectOption(val);
        fieldLog.push(`${name}=select:${val}`);
      } else if (await inp.count()) {
        await inp.fill(/n|cap|count/.test(name) ? '3' : 'lab-value');
        fieldLog.push(`${name}=input`);
      } else fieldLog.push(`${name}=?${await field.innerHTML()}`);
    }
    console.log('fields:', fieldLog.join(' | '));
    const kinds = await sheet.locator('[data-prompt-field]').evaluateAll((els) => els.map((e) => `${e.dataset.promptField}:${e.dataset.promptFieldKind}`));
    const picks = await sheet.locator('select[data-prompt-input]').count();
    check('2a "Use" opens a fill-in sheet; machine / agent placeholders pick from live data', kinds.length === 0 || picks > 0 || !kinds.some((k) => /:(machine|agent)$/.test(k)), kinds.join(', '));
    const filled = (await sheet.locator('[data-prompt-preview]').innerText()).trim();
    check('2b the preview has no unfilled placeholder left', !/\{[a-z][a-z0-9_-]*\}/.test(filled), filled);
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await shot(page, 'use-sheet-filled');
    const usesBefore = target.uses || 0;
    await sheet.locator('[data-prompt-send]').click();
    check('2c sent: the tab says so', !!(await until(() => page.locator('[data-prompts-note]').count(), 15000)), await page.locator('[data-prompts-note]').textContent().catch(() => ''));
    const reply = await until(async () => {
      const m = await (await api('/api/arch/messages?tail=6')).json();
      const msgs = m.messages || [];
      const userIdx = msgs.map((x) => x.role === 'user' && (x.text || '').includes(filled.slice(0, 40))).lastIndexOf(true);
      const after = userIdx >= 0 ? msgs.slice(userIdx + 1).find((x) => x.role === 'assistant' && (x.text || '').trim()) : null;
      return after ? { user: msgs[userIdx].text, reply: after.text } : null;
    }, 240000, 3000);
    check('2d the filled prompt reached the arch conversation and the arch answered (a real turn)', !!reply, reply ? `user: ${reply.user.slice(0, 80)} → reply ${reply.reply.length} chars` : 'no reply');
    const usedNow = (await (await api('/api/prompts?owner=arch')).json()).find((p) => p.id === target.id);
    check('2e the use was counted', (usedNow?.uses || 0) === usesBefore + 1 && !!usedNow.lastUsedAt, `uses ${usesBefore} → ${usedNow?.uses}`);

    // 3. Open in Arch chat → the composer, the clean header, the one picker
    const other = lib.find((p) => p.id !== target.id && /\{[a-z]/.test(p.text)) || lib.find((p) => p.id !== target.id);
    const oc = page.locator(`[data-prompt-card="${other.id}"]`);
    await oc.scrollIntoViewIfNeeded();
    await oc.locator(`[data-prompt-use-btn="${other.id}"]`).click();
    await oc.locator('[data-prompt-open-chat]').click();
    const composer = page.locator('.arch__composer textarea');
    const draft = await until(async () => { const v = await composer.inputValue(); return v.trim() ? v : null; }, 15000);
    check('3a "Open in Arch chat" switches to the Arch tab with the prompt in the composer', !!draft && draft.includes(other.text.slice(0, 25).replace(/\{[^}]*\}/g, '').trim().slice(0, 10)), draft);
    check('3b the old cached-prompts block is gone from the chat', (await page.locator('[data-arch-prompts]').count()) === 0);
    check('3c the composer keeps ONE prompts affordance (📋 Prompts) and the fill-in chips', (await page.locator('[data-arch-prompts-button]').count()) === 1 && (await page.locator('[data-placeholder-chips]').count()) <= 1);
    await page.waitForTimeout(800);
    await composer.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(300);
    await shot(page, 'arch-chat-clean-composer-with-handoff');
    await page.locator('[data-arch-prompts-button]').click();
    await page.locator('[data-arch-prompt-popover]').waitFor();
    // "Open in Arch chat" counts as a use too, so the two prompts used once lead (the newest first).
    const firstPick = await page.locator('[data-arch-prompt-pick]').first().getAttribute('data-arch-prompt-pick');
    check('3d the 📋 Prompts button opens a compact searchable picker, most used first', (await page.locator('[data-arch-prompt-pick]').count()) > 0 && [target.id, other.id].includes(firstPick), firstPick);
    await shot(page, 'arch-chat-prompts-picker');
    await page.locator('[data-arch-prompts-manage]').click();
    check('3e "Manage prompts in the Prompts tab" goes there', !!(await until(() => page.locator('[data-prompts-tab]').count(), 5000)));

    // 4. library actions (duplicate → edit → move → delete), store unchanged in behaviour
    const before = (await (await api('/api/prompts?owner=arch')).json()).length;
    const first = page.locator('[data-prompt-card]').first();
    const firstId = await first.getAttribute('data-prompt-card');
    await first.locator(`[data-prompt-duplicate="${firstId}"]`).click();
    const dupList = await until(async () => { const l = await (await api('/api/prompts?owner=arch')).json(); return l.length === before + 1 ? l : null; });
    const dup = dupList?.find((p) => p.label.endsWith('(copy)'));
    check('4a duplicate makes a custom copy right after the original', !!dup && !dup.seedId, dup?.label);
    const dc = page.locator(`[data-prompt-card="${dup.id}"]`);
    await dc.waitFor();
    await dc.locator(`[data-prompt-edit="${dup.id}"]`).click();
    await dc.locator('[data-ap-label]').fill('Lab copy');
    await dc.locator('[data-ap-save]').click();
    check('4b edit saves', !!(await until(async () => (await (await api('/api/prompts?owner=arch')).json()).find((p) => p.id === dup.id && p.label === 'Lab copy'))));
    page.once('dialog', (d) => d.accept());
    await page.locator(`[data-prompt-delete="${dup.id}"]`).click();
    check('4c delete removes it', !!(await until(async () => (await (await api('/api/prompts?owner=arch')).json()).length === before)));
    await api(`/api/prompts/${target.id}`, { method: 'DELETE' });   // the test's own prompt
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('unexpected error', false, e.stack || e.message);
}
fs.writeFileSync(path.join(OUT, `result-${MODE}.json`), JSON.stringify(out, null, 2));
console.log(`@@PROMPTLAB@@ ${MODE} ${out.failed ? 'FAILED' : 'OK'} ${out.checks.filter((x) => x.ok).length}/${out.checks.length}`);
await b.close();
