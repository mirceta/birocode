// Fleet task 545b9548 — goal templates, live on the lab hub (lab.ps1: HUB, HUBPW, OUT). Checks:
//  1. the cached prompt ccf3ee7d was migrated into the first goal template (7 steps, 5 inputs);
//  2. "save as template" on a FINISHED goal in Subagents: the plan + text become a draft, concrete names are offered for
//     generalisation, the saved template lands in the Prompts tab;
//  3. the template view: filling the inputs updates the stepper preview live;
//  4. "Send to Arch chat" puts the structured template (purpose, inputs, STEP lines) into the composer, not sent;
//  5. "Start now" starts a goal whose plan is exactly the filled steps, started by the arch.
// Screenshots go into a public repo: live goal titles / text are blurred; lab content stays readable.
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

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => {
  try { localStorage.setItem('claudeweb_ui_mode', 'advanced'); localStorage.setItem('manageapp.subagentsFilter', 'all'); } catch {}
  const css = '.sa__row-title, .sa__question, .gref-strip__title, .sa__tabpanel, .arch__banner, .msg__markdown:not(:has(.gref)), .msg--actor-goal .msg__text, [data-template-generalise] code, [data-save-template-panel] [data-template-field="purpose"], [data-save-template-panel] [data-template-field="label"], [data-save-template-panel] .gt-ed__step input { filter: blur(4px); }';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const api = (p, init) => page.request.fetch(HUB + p, init);
const prompts = async () => (await (await api('/api/prompts?owner=arch')).json());

try {
  check('logs in at the lab hub', (await api('/api/auth/login', { method: 'POST', data: { password: HUBPW } })).ok());

  // 1. migration
  const migrated = (await prompts()).find((p) => p.id.startsWith('ccf3ee7d'));
  check('1a the cached prompt ccf3ee7d is now a goal template (same id)', migrated?.kind === 'goal-template', migrated?.kind);
  check('1b …with the seven gated steps and the five inputs (agent, purpose, examples, branch, n)', migrated?.steps?.length === 7 && (migrated?.inputs || []).map((i) => i.name).join(',') === 'agent,purpose,examples,branch,n', `${migrated?.steps?.length} steps; ${(migrated?.inputs || []).map((i) => i.name)}`);

  // 2. save a FINISHED goal as a template
  const convs = ((await (await api('/api/arch/conversations')).json()).conversations || []);
  const finished = convs.filter((c) => c.goal && c.goal.state !== 'running' && (c.goal.plan || []).length >= 3 && (c.goal.owns || []).length > 0).sort((a, z) => (z.goal.endedAt || 0) - (a.goal.endedAt || 0))[0];
  check('2a a finished goal with a step plan exists in the copied store', !!finished, finished ? `${finished.goal.id}: ${finished.goal.plan.length} steps, ${finished.goal.state}` : 'none');
  await page.goto(BASE + '?tab=subagents&layout=tabs');
  await page.locator(`[data-subagent="${finished.id}"]`).click({ timeout: 20000 });
  await page.locator(`[data-save-template="${finished.goal.id}"]`).click();
  const panel = page.locator(`[data-save-template-panel="${finished.goal.id}"]`);
  await panel.waitFor();
  const cands = await panel.locator('[data-template-candidate]').count();
  check('2b the editor offers the goal\'s concrete names for generalisation', cands > 0, `${cands} candidate(s)`);
  await shot(page, 'save-as-template-generalise');
  await panel.locator('[data-template-generalise-apply]').click();
  await panel.locator('[data-template-field="label"]').fill('Lab template from a finished goal');
  const stepsInEditor = await panel.locator('[data-template-step]').count();
  check('2c the draft carries the goal\'s whole step plan', stepsInEditor === finished.goal.plan.length, `${stepsInEditor} of ${finished.goal.plan.length}`);
  await panel.locator('[data-template-save]').click();
  const saved = await until(async () => (await prompts()).find((p) => p.label === 'Lab template from a finished goal'), 8000);
  check('2d saved into the Prompts tab: a goal template with the source goal, the plan and {agent} input', saved?.kind === 'goal-template' && saved?.sourceGoalId === finished.goal.id && saved?.steps?.length === finished.goal.plan.length && (saved?.inputs || []).some((i) => i.name === 'agent' && i.type === 'agent'), saved ? `${saved.steps.length} steps; inputs ${(saved.inputs || []).map((i) => `${i.name}:${i.type}`)}` : 'not saved');
  console.log('saved steps:', JSON.stringify((saved?.steps || []).map((x) => x.title.slice(0, 70))), '| owns:', JSON.stringify(finished.goal.owns.map((o) => o.handle)));
  const tail = finished.goal.owns[0].handle.split('/').pop();
  const allText = [saved?.purpose || '', ...(saved?.steps || []).flatMap((x) => [x.title, x.done || ''])].join(' | ');
  check('2e concrete names were generalised: no agent name left, the card and branch became {task} / {branch}', !allText.includes(finished.goal.owns[0].handle) && !allText.includes(tail) && allText.includes('{task}') && allText.includes('{branch}'), `agent forms gone: ${!allText.includes(tail)}; {task} ${allText.includes('{task}')}; {branch} ${allText.includes('{branch}')}`);

  // 3. template view: fill → preview
  await page.goto(BASE + '?tab=prompts&layout=tabs');
  await page.locator('[data-templates-section]').waitFor({ timeout: 20000 });
  // The template saved from the LIVE goal carries that goal's text (paths, URLs): keep it unreadable in screenshots.
  if (saved) await page.addStyleTag({ content: `[data-template-card="${saved.id}"] .pt__text, [data-template-card="${saved.id}"] .pt__tpl-steps { filter: blur(4px); }` });
  check('3a the Prompts tab lists the goal templates in their own section', (await page.locator('[data-template-card]').count()) >= 2);
  const card = page.locator(`[data-template-card="${migrated.id}"]`);
  await card.locator(`[data-template-use="${migrated.id}"]`).click();
  const sheet = card.locator(`[data-template-sheet="${migrated.id}"]`);
  await sheet.waitFor();
  check('3b the template view shows the plan as the Subagents stepper (preview)', (await sheet.locator('[data-plan-preview="1"] [data-plan-step]').count()) === 7);
  const before = await sheet.locator('[data-plan-step="2"] .gp__step-title').innerText();
  await sheet.locator('[data-template-value="agent"]').fill('lab-agent#1');
  await sheet.locator('[data-template-value="purpose"]').fill('reviewing contracts');
  await sheet.locator('[data-template-value="examples"]').fill('harness-tabs, phone-agent');
  await sheet.locator('[data-template-value="branch"]').fill('feat/contracts-app');
  const after = await sheet.locator('[data-plan-step="2"] .gp__step-title').innerText();
  const step1 = await sheet.locator('[data-plan-step="1"] .gp__step-title').innerText();
  check('3c filling the inputs updates the preview live (placeholders substituted)', before !== after && after.includes('harness-tabs, phone-agent') && step1.includes('lab-agent#1'), `${before.slice(0, 60)} → ${after.slice(0, 60)}`);
  check('3d the purpose above the stepper is filled too', (await sheet.locator('[data-template-purpose]').innerText()).includes('reviewing contracts'));
  await sheet.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'template-view-filled-preview');

  // 4. send to Arch chat
  await sheet.locator('[data-template-send-chat]').click();
  const composer = page.locator('.arch__composer textarea');
  const draft = await until(async () => { const v = await composer.inputValue(); return v.includes('GOAL TEMPLATE') ? v : null; }, 10000);
  check('4a "Send to Arch chat" lands the structured template in the Arch composer', !!draft && draft.includes('Purpose: lab-agent#1 builds its own agentic app') && draft.includes('STEP 1 — [wait]') && draft.includes('STEP 7 — [verify]'), (draft || '').split('\n').slice(0, 2).join(' | '));
  check('4b …and nothing was sent', (((await (await api('/api/arch/messages?tail=3')).json()).messages || []).every((m) => !(m.text || '').includes('GOAL TEMPLATE'))));
  await composer.evaluate((el) => { el.scrollIntoView({ block: 'end' }); el.scrollTop = 0; });
  await shot(page, 'arch-composer-with-template');

  // 5. start now — a lab template driving a lab card (the lab arch manages no agent). The lab copy carries the live 24
  // conversations (the cap): remove the oldest finished goal — in the LAB copy only — so a new one can start.
  {
    const cs = ((await (await api('/api/arch/conversations')).json()).conversations || []);
    if (cs.length >= 24) {
      const victim = cs.filter((c) => !c.isDefault && c.goal && c.goal.state !== 'running' && c.id !== '@arch:policeman' && c.id !== finished.id).sort((a, z) => (a.goal.endedAt || 0) - (z.goal.endedAt || 0))[0];
      if (victim) await api(`/api/arch/conversations/${encodeURIComponent(victim.id)}`, { method: 'DELETE' });
    }
  }
  const card2 = await (await api('/api/taskgraph/nodes', { method: 'POST', data: { title: 'Lab card for the goal-template check', status: 'todo' } })).json();
  const cardId = card2?.id || card2?.node?.id;
  const lt = await (await api('/api/prompts/templates', { method: 'POST', data: { label: 'Lab: check a card', purpose: 'Check card {card} for {topic}.', inputs: [{ name: 'card', type: 'task' }, { name: 'topic', type: 'text' }], steps: [{ title: 'Read card {card}', done: 'its state is known', kind: 'verify' }, { title: 'Report on {topic}', done: 'one line to the Operator', kind: 'other' }], maxIterations: 2 } })).json();
  await page.goto(BASE + '?tab=prompts&layout=tabs');
  const c3 = page.locator(`[data-template-card="${lt.id}"]`);
  await c3.waitFor({ timeout: 20000 });
  await c3.locator(`[data-template-use="${lt.id}"]`).click();
  const s3 = c3.locator(`[data-template-sheet="${lt.id}"]`);
  await s3.locator('[data-template-value="card"]').fill(String(cardId).slice(0, 8));
  await s3.locator('[data-template-value="topic"]').fill('the lab');
  page.once('dialog', (d) => d.accept());
  await s3.locator('[data-template-start]').click();
  const started = await until(async () => ((await (await api('/api/arch/conversations')).json()).conversations || []).find((c) => c.goal && /goal template "Lab: check a card"/.test(c.goal.goal || '')), 15000);
  if (!started) console.log('start-now error shown:', await s3.locator('[data-template-sheet-error]').innerText().catch(() => '(none)'), '| note:', await page.locator('[data-prompts-note]').innerText().catch(() => '(none)'));
  check('5a "Start now" created a goal from the template', !!started, started?.goal?.id);
  const plan = (started?.goal?.plan || []).map((s) => `${s.title}|${s.kind}`);
  check('5b …with exactly the filled plan (titles, kinds), declared not derived', plan.join(' ; ') === `Read card ${String(cardId).slice(0, 8)}|verify ; Report on the lab|other` && started?.goal?.planDerived !== true, plan.join(' ; '));
  check('5c …started by the arch', started?.goal?.startedBy === 'arch', started?.goal?.startedBy);
  // Show the new (lab) goal: select it, open its Step plan tab, lift the blur for this one conversation only.
  if (started) {
    await page.addStyleTag({ content: `[data-subagent="${started.id}"] .sa__row-title, [data-goal-view="${started.id}"] .sa__tabpanel, [data-goal-header="${started.goal.id}"] .gref-strip__title { filter: none !important; }` });
    await page.locator(`[data-subagent="${started.id}"]`).click().catch(() => {});
    await page.locator('[data-goal-tab="plan"]').click().catch(() => {});
  }
  await page.waitForTimeout(800);
  await shot(page, 'start-now-goal-in-subagents');
  if (started) await api(`/api/arch/goals/${started.goal.id}/stop`, { method: 'POST', data: {} });
  const used = (await prompts()).find((p) => p.id === lt.id);
  check('5d the template\'s use was counted', (used?.uses || 0) >= 1, used?.uses);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('unexpected error', false, e.stack || e.message);
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(`@@TEMPLAB@@ ${out.failed ? 'FAILED' : 'OK'} ${out.checks.filter((x) => x.ok).length}/${out.checks.length}`);
await b.close();
