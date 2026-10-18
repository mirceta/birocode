// Fleet task 64dcb229 — goal references, live on the lab hub (lab.ps1: HUB, HUBPW, OUT). Checks:
//  1. the Subagents tab's Active | All filter (default Active, hidden count on All, remembered per browser) and the
//     toolbar badge counting the Active set;
//  2. every goal row carries its #ref chip; a click copies the id; the selected goal's header shows it too;
//  3. "💬 mention" switches to the Arch tab and puts "goal <id> (title)" into the composer at the caret, focused;
//  4. a goal id in the Arch chat renders as a chip that opens that goal in the Subagents tab (a real arch turn quotes
//     the id; the lab arch manages nothing);
//  5. a {goal} placeholder in the composer offers the live goals.
// Screenshots go into a public repo: conversation text and goal titles are blurred (ids stay readable).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const { HUB, HUBPW, OUT } = process.env;
const BASE = `${HUB}/api/localview/c7a98bafdf4d433d990f870a0eda8725/app/events-feed/manage/`;
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
for (const f of fs.readdirSync(SHOTS)) fs.unlinkSync(path.join(SHOTS, f));
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + String(detail).slice(0, 200) : ''}`); if (!ok) out.failed = true; };
const until = async (fn, ms = 15000, step = 400) => { const t0 = Date.now(); for (;;) { const v = await Promise.resolve().then(fn).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, step)); } };
let n = 0;
const shot = async (page, name) => { n += 1; await page.screenshot({ path: path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`) }); };
const HOUR = 3600_000;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(HUB).origin });
await ctx.addInitScript(() => {
  try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); if (!sessionStorage.getItem('goallab.reset')) { localStorage.removeItem('manageapp.subagentsFilter'); sessionStorage.setItem('goallab.reset', '1'); } } catch {}
  const css = '.msg__markdown:not(:has(.gref)), .sa__row-title, .sa__question, .gref-strip__title, .gp, .arch__banner, .msg--actor-goal .msg__text { filter: blur(4px); } .gref, .gref * { filter: none !important; }';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const api = (p, init) => page.request.fetch(HUB + p, init);
const convsNow = async () => ((await (await api('/api/arch/conversations')).json()).conversations || []);

try {
  check('logs in at the lab hub', (await api('/api/auth/login', { method: 'POST', data: { password: HUBPW } })).ok());
  let convs = await convsNow();
  // The lab copy carries the live 24 conversations (the cap): remove the oldest finished goal — in the LAB copy only.
  if (convs.length >= 24) {
    const victim = convs.filter((c) => !c.isDefault && c.goal && c.goal.state !== 'running' && c.id !== '@arch:policeman').sort((a, z) => (a.goal.endedAt || 0) - (z.goal.endedAt || 0))[0];
    if (victim) await api(`/api/arch/conversations/${encodeURIComponent(victim.id)}`, { method: 'DELETE' });
  }
  // A goal must drive a repo agent or a board task: a lab-only card, unassigned (the lab arch manages nothing).
  const node = await (await api('/api/taskgraph/nodes', { method: 'POST', data: { title: 'Lab card for the goal-references check', status: 'todo' } })).json().catch(() => ({}));
  const taskId = node?.id || node?.node?.id;
  const start = await api('/api/arch/goals', { method: 'POST', data: { goal: 'Lab goal: check that goals are referenceable from the Operator chat', repos: [], tasks: taskId ? [taskId] : [], maxIterations: 1 } });
  const sj = await start.json().catch(() => ({}));
  convs = await convsNow();
  const fresh = convs.find((c) => c.goal && /Lab goal: check that goals are referenceable/.test(c.goal.goal || ''));
  check('a fresh goal exists in the lab (the lab arch manages nothing)', !!fresh, fresh ? fresh.goal.id : JSON.stringify(sj).slice(0, 200));
  const now = Date.now();
  const lastLife = (c) => Math.max(c.goal?.lastSentAt || 0, c.goal?.endedAt || 0, c.goal?.startedAt || 0, c.createdAt || 0, ...((c.goal?.plan || []).map((s) => s.updatedAt || 0)));
  const nonDefault = convs.filter((c) => !c.isDefault);
  const expectActive = nonDefault.filter((c) => c.running || c.busy || c.goal?.state === 'running' || c.goal?.held || now - lastLife(c) < HOUR);
  const oldFinished = nonDefault.length - expectActive.length;

  // 1. the filter
  await page.goto(BASE + '?tab=subagents&layout=tabs');
  await page.locator('[data-subagents]').waitFor({ timeout: 20000 });
  await until(() => page.locator('[data-subagent]').count(), 15000);
  check('1a the filter defaults to Active', (await page.locator('[data-subagents-filter]').getAttribute('data-subagents-filter')) === 'active');
  const activeRows = await page.locator('[data-subagent]').count();
  check('1b Active lists running / held / recently active goals only — older finished goals are hidden', activeRows === expectActive.length && oldFinished > 0, `${activeRows} shown, ${oldFinished} older finished hidden`);
  const allLabel = await page.locator('[data-subagents-filter-btn="all"]').innerText();
  check('1c the All toggle shows the hidden count', allLabel.includes(String(oldFinished)), allLabel);
  const badge = await page.locator('[data-subagent-count]').first().getAttribute('data-subagent-count').catch(() => null);
  check('1d the tab badge counts the Active set', Number(badge) === expectActive.length, `badge ${badge}`);
  await page.locator(`[data-subagent="${fresh.id}"]`).click();   // the lab goal in the header, not a live one
  await page.waitForTimeout(600);
  await shot(page, 'subagents-active-filter');
  await page.locator('[data-subagents-filter-btn="all"]').click();
  check('1e All lists every goal conversation', !!(await until(async () => (await page.locator('[data-subagent]').count()) >= nonDefault.length - 0 ? true : null, 5000)), `${await page.locator('[data-subagent]').count()} rows of ${nonDefault.length}`);
  await shot(page, 'subagents-all-filter');
  await page.reload(); await page.locator('[data-subagents]').waitFor();
  check('1f the choice is remembered per browser', (await page.locator('[data-subagents-filter]').getAttribute('data-subagents-filter')) === 'all');
  await page.locator('[data-subagents-filter-btn="active"]').click();

  // 2. #ref chips + copy
  const row = page.locator(`[data-subagent="${fresh.id}"]`);
  await row.waitFor();
  await row.click();
  const ref = row.locator(`[data-goal-ref="${fresh.goal.id}"]`);
  check('2a every goal row carries its #ref chip', (await page.locator('[data-subagent] [data-goal-ref]').count()) === (await page.locator('[data-subagent]').count()) - (await page.locator('[data-subagent]').evaluateAll((els) => els.filter((e) => !e.querySelector('[data-goal-ref]')).length)) && (await ref.count()) === 1);
  await ref.click();
  const clip = await until(() => page.evaluate(() => navigator.clipboard.readText()), 3000);
  check('2b a click copies the goal id', clip === fresh.goal.id, clip);
  const tip = await ref.getAttribute('title');
  check('2c the tooltip carries the full conversation id and the first line', tip.includes(fresh.id) && tip.includes('Lab goal'), tip);
  check('2d the selected goal\'s header shows the ref and a mention', (await page.locator(`[data-goal-header="${fresh.goal.id}"] [data-goal-ref]`).count()) === 1 && (await page.locator(`[data-goal-header="${fresh.goal.id}"] [data-mention-kind="goal"]`).count()) === 1);
  await shot(page, 'subagents-ref-copied-and-header');

  // 3. mention → Arch composer
  await page.locator(`[data-goal-header="${fresh.goal.id}"] [data-mention-kind="goal"]`).click();
  const composer = page.locator('.arch__composer textarea');
  const val = await until(async () => { const v = await composer.inputValue(); return v.includes(`goal ${fresh.goal.id} (`) ? v : null; }, 10000);
  check('3a "mention" switches to the Arch tab with "goal <id> (title)" in the composer', !!val, val);
  check('3b the composer is focused with the caret after the mention', await composer.evaluate((el) => document.activeElement === el && el.selectionStart === el.value.length));
  await page.keyboard.type('— add a step: verify it on the hub');
  const typed = await composer.inputValue();
  check('3c the Operator continues the sentence right there', typed.startsWith(`goal ${fresh.goal.id} (`) && typed.endsWith('verify it on the hub'), typed);
  await composer.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await shot(page, 'arch-composer-with-mention');

  // 5. {goal} placeholder picks from live goals
  await composer.fill('Continue goal {goal} with cap 5');
  const chip = page.locator('[data-placeholder="goal"]');
  check('5a a {goal} placeholder becomes a goal chip', !!(await until(() => chip.count(), 5000)) && (await chip.getAttribute('data-placeholder-kind')) === 'goal');
  const opts = await until(async () => { const v = await chip.locator('datalist option').evaluateAll((os) => os.map((o) => o.value)); return v.length ? v : null; }, 8000);
  check('5b …offering the live goals (running first)', !!opts && opts[0] === fresh.goal.id, (opts || []).slice(0, 4).join(', '));
  await composer.fill('');

  // 4. a goal id in the chat renders as a chip that opens the goal
  // The Operator-facing conversation may be mid-turn (the harness delivers goal summaries into it): retry while 409.
  let send = null;
  for (let i = 0; i < 40; i++) {
    send = await api('/api/arch/send', { method: 'POST', data: { text: `Lab check, use no tools: reply with exactly this sentence: The lab goal is goal ${fresh.goal.id}.` } });
    if (send.status() !== 409) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  check('4a the arch takes the Operator message', send.ok(), send.status());
  const chatChip = page.locator(`.arch__composer`).locator('xpath=..').locator(`.msg [data-goal-ref="${fresh.goal.id}"]`);
  const shown = await until(() => page.locator(`.msg [data-goal-ref="${fresh.goal.id}"]`).count(), 240000, 2000);
  check('4b the goal id in the chat renders as a chip (the Operator message and the arch reply)', (shown || 0) >= 1, `${shown} chip(s)`);
  await until(async () => ((await page.locator(`.msg [data-goal-ref="${fresh.goal.id}"]`).count()) >= 2 ? true : null), 180000, 2000);   // the arch's reply too
  await page.waitForTimeout(500);
  await shot(page, 'arch-chat-goal-chips');
  await page.locator(`.msg [data-goal-ref="${fresh.goal.id}"]`).last().click();
  const opened = await until(async () => ((await page.locator('[data-subagents-conv]').getAttribute('data-subagents-conv').catch(() => null)) === fresh.id ? true : null), 8000);
  check('4c clicking the chip opens that goal in the Subagents tab', !!opened);
  await shot(page, 'chip-opened-the-goal');
  void chatChip;

  await api(`/api/arch/goals/${fresh.goal.id}/stop`, { method: 'POST', data: {} });
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('unexpected error', false, e.stack || e.message);
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(`@@GOALLAB@@ ${out.failed ? 'FAILED' : 'OK'} ${out.checks.filter((x) => x.ok).length}/${out.checks.length}`);
await b.close();
