// openspec policeman-observes-agents: the policeman modelled one owner per graph — three
// deterministic machines (every node and edge names its C# routine), two prompt machines (every
// node names its prompt step), and the contract boundary between them is exactly where the code
// hands control to the model and reads its text back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINES, ORDER, GROUPS, elements, validate } from './policemanMachines.js';

test('every machine validates and is owned by exactly one side', () => {
  const v = validate();
  assert.equal(v.ok, true, v.problems.join('; '));
  assert.deepEqual(ORDER, ['loop', 'facts', 'tools', 'prompt-pass', 'prompt-cards']);
  assert.deepEqual(ORDER.map((k) => MACHINES[k].group), ['code', 'code', 'code', 'prompt', 'prompt']);
  assert.deepEqual(Object.keys(GROUPS), ['code', 'prompt']);
  for (const k of ORDER) assert.ok(MACHINES[k].lives.length >= 2, k + ' names where it lives');
});

test('the code machines name real routines, and the model appears only at the contract boundary', () => {
  const loop = MACHINES.loop;
  assert.deepEqual(loop.nodes.filter((n) => n.who === 'model').map((n) => n.id), ['pass']);
  assert.deepEqual(loop.edges.filter((e) => e.who === 'model').map((e) => e.id), ['pass->wait']);
  assert.match(loop.edges.find((e) => e.id === 'pass->wait').where, /NeedsHumanMarker/);
  assert.match(loop.nodes.find((n) => n.id === 'rollover').where, /RolloverPoliceman/);
  assert.match(loop.edges.find((e) => e.id === 'errored->armed').where, /PolicemanTick/);
  for (const n of loop.nodes) assert.ok(/ArchStateStore|LoopConfigStore|AutopilotService|ArchAgentService|ArchPoliceman|AutopilotGate|AutopilotConfigStore|CliRunnerService/.test(n.where), n.id + ': ' + n.where);

  const facts = MACHINES.facts;
  assert.equal(facts.nodes.filter((n) => n.who === 'model').length, 0);
  assert.match(facts.nodes.find((n) => n.id === 'judge').where, /BoardIntegrity\.Judge/);
  assert.match(facts.nodes.find((n) => n.id === 'apply').where, /ApplyVerification/);
  assert.match(facts.edges.find((e) => e.id === 'apply->committed').label, /FORWARD only/);
  const chain = ['todo', 'doing', 'committed', 'pr-opened', 'pr-merged', 'done'];
  for (let i = 0; i + 1 < chain.length; i++) assert.ok(facts.edges.some((e) => e.source === chain[i] && e.target === chain[i + 1]), chain[i]);
  assert.ok(!facts.edges.some((e) => chain.indexOf(e.target) >= 0 && chain.indexOf(e.source) > chain.indexOf(e.target)), 'no backwards move');

  const tools = MACHINES.tools;
  assert.deepEqual(tools.nodes.filter((n) => n.who === 'model').map((n) => n.id), ['cli']);
  assert.ok(tools.nodes.some((n) => /ToolsList\(conversation\)/.test(n.where)));
  assert.ok(tools.edges.some((e) => /DisallowedToolsFor/.test(e.where)));
  assert.ok(tools.nodes.some((n) => /IsToolAllowed/.test(n.where)));
  assert.ok(tools.nodes.some((n) => /PrTrace\.Trace/.test(n.where)) && tools.nodes.some((n) => /SetObservation/.test(n.where)) && tools.nodes.some((n) => /VerifyOnce/.test(n.where)));
});

test('the prompt machines are all the model’s, labelled with their prompt step, and say which inputs come ready-made from code', () => {
  for (const key of ['prompt-pass', 'prompt-cards']) {
    const m = MACHINES[key];
    for (const n of m.nodes) assert.equal(n.who, 'model', key + '/' + n.id);
    assert.ok(m.lives.some((l) => /ArchPoliceman\.cs → Prompt/.test(l)), key + ' names the prompt');
  }
  const pass = MACHINES['prompt-pass'];
  for (const n of pass.nodes) assert.match(n.where, /^Prompt/, n.id);
  assert.equal(pass.nodes.find((n) => n.shape === 'ref').to, 'prompt-cards');
  const cards = MACHINES['prompt-cards'];
  assert.ok(cards.nodes.filter((n) => /\(code\)/.test(n.where)).length >= 5, 'facts-driven states are marked as coming from code');
  assert.ok(cards.nodes.filter((n) => /the model’s reading/.test(n.where)).length === 2);
});

test('elements carry position, shape, who, where and the machine group', () => {
  for (const key of ORDER) {
    const els = elements(key);
    const m = MACHINES[key];
    assert.equal(els.length, m.nodes.length + m.edges.length);
    for (const e of els.filter((x) => !x.data.source)) {
      assert.ok(Number.isFinite(e.position.x));
      assert.ok(e.data.where.length > 0);
      assert.ok(new RegExp(`group-${m.group}`).test(e.classes));
    }
  }
  assert.throws(() => elements('nope'));
});
