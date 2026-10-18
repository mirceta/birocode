// node --test — goal templates (openspec arch-goal-templates, fleet task 545b9548).
import test from 'node:test';
import assert from 'node:assert/strict';
import { valuesWithDefaults, missingInputs, fill, previewGoal, composeArchMessage, startRequest, generalisationCandidates, draftFromGoal, applyGeneralisation, undefinedPlaceholders, templateBody, isTemplate } from './goalTemplates.js';

const tpl = {
  id: 't1', kind: 'goal-template', label: 'Ship a feature', purpose: '{agent} ships {feature} on {branch}.', maxIterations: 40, branch: '{branch}', sourceGoalId: '4ccefa45',
  inputs: [{ name: 'agent', type: 'agent' }, { name: 'feature', type: 'text' }, { name: 'branch', type: 'branch', default: 'feat/x' }, { name: 'card', type: 'task' }],
  steps: [{ title: 'Brief {agent}: build {feature}', done: 'closing line DONE on {branch}', kind: 'send' }, { title: 'Verify the PR', done: null, kind: 'verify' }],
};

test('defaults fill in, missing inputs are named, text is filled live', () => {
  assert.deepEqual(valuesWithDefaults(tpl, { agent: ' prg#1 ' }), { agent: 'prg#1', feature: '', branch: 'feat/x', card: '' });
  assert.deepEqual(missingInputs(tpl, { agent: 'prg#1' }), ['feature', 'card']);
  assert.equal(fill(tpl.purpose, tpl, { agent: 'prg#1' }), 'prg#1 ships {feature} on feat/x.');
  assert.equal(isTemplate(tpl), true);
  assert.equal(isTemplate({ text: 'x' }), false);
});

test('the preview goal is the filled plan, every step pending, shaped for the Subagents stepper', () => {
  const g = previewGoal(tpl, { agent: 'prg#1', feature: 'the Prompts tab' });
  assert.equal(g.state, 'preview');
  assert.deepEqual(g.plan.map((s) => [s.index, s.title, s.state, s.kind]), [[1, 'Brief prg#1: build the Prompts tab', 'pending', 'send'], [2, 'Verify the PR', 'pending', 'verify']]);
  assert.equal(g.plan[0].done, 'closing line DONE on feat/x');
});

test('the Arch chat message carries purpose, inputs, defaults and STEP lines the server parses, then the protocol', () => {
  const m = composeArchMessage(tpl, { agent: 'prg#1', feature: 'the Prompts tab', card: '5cc3e900' });
  const lines = m.split('\n');
  assert.match(lines[0], /^GOAL TEMPLATE "Ship a feature" — propose it, we discuss it, start it only on my go\.$/);
  assert.equal(lines[1], 'Purpose: prg#1 ships the Prompts tab on feat/x.');
  assert.equal(lines[2], 'Inputs: agent = prg#1 · feature = the Prompts tab · branch = feat/x · card = 5cc3e900');
  assert.equal(lines[3], 'Defaults: cap 40 · branch feat/x');
  assert.equal(lines[5], 'STEP 1 — [send] Brief prg#1: build the Prompts tab — done when: closing line DONE on feat/x');
  assert.equal(lines[6], 'STEP 2 — [verify] Verify the PR');
  assert.match(m, /captured from goal 4ccefa45/);
  assert.match(lines.at(-1), /start_arch_goal .* steps = these STEP lines/);
  assert.match(composeArchMessage(tpl, {}), /feature = \{feature\} \(not set\)/);
});

test('start now: agents → keys, cards → tasks, the declared plan, the arch as starter; problems block it', () => {
  const agents = [{ handle: 'prg#1', key: 'src1/repoA' }];
  const ok = startRequest(tpl, { agent: 'prg#1', feature: 'x', card: '5cc3e900' }, agents);
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.body.repos, ['src1/repoA']);
  assert.deepEqual(ok.body.tasks, ['5cc3e900']);
  assert.equal(ok.body.startedBy, 'arch');
  assert.equal(ok.body.maxIterations, 40);
  assert.equal(ok.body.steps.length, 2);
  assert.match(ok.body.goal, /^prg#1 ships x on feat\/x\. \(goal template "Ship a feature"\)$/);
  const bad = startRequest(tpl, { agent: 'ghost#9' }, agents);
  assert.ok(bad.problems.some((p) => p.includes('fill {feature}')));
  assert.ok(bad.problems.some((p) => p.includes('"ghost#9" is not an agent')));
});

const goal = {
  id: 'd750eceb', maxIterations: 60,
  goal: "Operator's ask: legal-research builds its app on feat/legal-app; card 3a37d10f tracks it.",
  owns: [{ key: 'k', handle: 'DESKTOP-POAPPP3/legal-research' }], tasks: [{ id: '3a37d10f99', title: 'New repo agent' }],
  plan: [{ title: 'Brief DESKTOP-POAPPP3/legal-research: STUDY', done: 'STUDY: DONE', kind: 'send', state: 'done' }, { title: 'PR on feat/legal-app for 3a37d10f', done: 'TASK PR', kind: 'verify', state: 'pending' }],
};

test('a goal becomes a draft: name, purpose, plan, cap, source; its concrete names become input candidates', () => {
  const d = draftFromGoal(goal);
  assert.equal(d.sourceGoalId, 'd750eceb');
  assert.equal(d.maxIterations, 60);
  assert.equal(d.steps.length, 2);
  assert.deepEqual(d.steps[0], { title: 'Brief DESKTOP-POAPPP3/legal-research: STUDY', done: 'STUDY: DONE', kind: 'send' });
  const c = generalisationCandidates(goal);
  assert.deepEqual(c.map((x) => [x.name, x.type, x.value, x.count]), [
    // the agent: its handle in the plan + its short name in the text
    ['agent', 'agent', 'DESKTOP-POAPPP3/legal-research', 2], ['task', 'task', '3a37d10f', 2], ['branch', 'branch', 'feat/legal-app', 2],
  ]);
  const g = applyGeneralisation(d, c);
  assert.equal(g.steps[0].title, 'Brief {agent}: STUDY');
  assert.equal(g.steps[1].title, 'PR on {branch} for {task}');
  assert.match(g.purpose, /on \{branch\}; card \{task\} tracks it/);
  assert.match(g.purpose, /: \{agent\} builds its app/);   // the short name became {agent} too
  assert.deepEqual(g.inputs.map((i) => [i.name, i.type, i.default]), [['agent', 'agent', ''], ['task', 'task', ''], ['branch', 'branch', '']]);
  assert.deepEqual(applyGeneralisation(d, c.slice(0, 1), { keepAsDefault: true }).inputs[0].default, 'DESKTOP-POAPPP3/legal-research');
  assert.deepEqual(undefinedPlaceholders({ ...g, inputs: g.inputs.slice(0, 1) }), ['branch', 'task']);   // first-appearance order
});

test('an agent is matched by every form it is named by, longest first', async () => {
  const { agentVariants } = await import('./goalTemplates.js');
  assert.deepEqual(agentVariants('HUB/prg#2'), ['HUB/prg#2', 'HUB/prg', 'prg#2', 'prg']);
  assert.deepEqual(agentVariants('phone-agent'), ['phone-agent']);
  assert.deepEqual(agentVariants(''), []);
});

test('the template body drops empty steps and keeps the parts the server validates', () => {
  const b = templateBody({ label: 'x', purpose: 'p', steps: [{ title: 'a', kind: 'send' }, { title: '  ' }], inputs: [{ name: 'agent', type: 'agent', label: '' }], maxIterations: '30' });
  assert.equal(b.steps.length, 1);
  assert.equal(b.maxIterations, 30);
  assert.deepEqual(b.inputs, [{ name: 'agent', type: 'agent', label: null, default: null }]);
});
