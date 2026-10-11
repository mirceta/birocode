import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeOf, showingLine, lastReply, openQuestion, chatBody, targetLabel, cleanPin, sofaOn, appsOf } from './remoteModel.js';

test('sofa view shows in the showing line and drives the button; apps come from the repo list', () => {
  assert.equal(showingLine([{ name: 'projector', activeAgent: 'pers-dec', layout: 'sofa' }]), 'projector · pers-dec · sofa view');
  assert.equal(showingLine([{ name: 'projector', activeAgent: 'pers-dec', layout: 'normal' }]), 'projector · pers-dec');
  assert.equal(sofaOn([{ layout: 'sofa' }]), true);
  assert.equal(sofaOn([{ layout: 'normal' }]), false);
  assert.equal(sofaOn([]), false);
  const repos = [{ id: 'r1', localApps: [{ id: 'app--28166', name: 'homepage', port: 28166 }, { id: 'app--5', port: 5 }] }];
  assert.deepEqual(appsOf(repos, 'r1'), [{ id: 'app--28166', name: 'homepage' }, { id: 'app--5', name: 'App :5' }]);
  assert.deepEqual(appsOf(repos, 'nope'), []);
});

test('badgeOf: one badge by urgency', () => {
  assert.equal(badgeOf({ status: 'running', waiting: true, unseenResult: true }), 'busy');
  assert.equal(badgeOf({ status: 'idle', waiting: true, unseenResult: true }), 'waiting');
  assert.equal(badgeOf({ status: 'done', unseenResult: true }), 'unseen');
  assert.equal(badgeOf({ status: 'idle' }), '');
  assert.equal(badgeOf(null), '');
});

test('showingLine: the first live screen, agent before view before name; null when nothing listens', () => {
  assert.equal(showingLine([]), null);
  assert.equal(showingLine(null), null);
  assert.equal(showingLine([{ name: 'projector', activeAgent: 'pers-dec', view: 'agent' }]), 'projector · pers-dec');
  assert.equal(showingLine([{ name: 'projector', activeAgent: null, view: 'management · kanban' }]), 'projector · management · kanban');
  assert.equal(showingLine([{ name: 'projector' }]), 'projector');
});

test('lastReply: the latest non-empty assistant message', () => {
  assert.equal(lastReply([]), null);
  const m = lastReply([{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'Done.' }, { role: 'assistant', text: '  ' }, { role: 'user', text: 'ok' }]);
  assert.equal(m.text, 'Done.');
});

test('openQuestion: the last tool call is an unanswered AskUserQuestion and the assistant spoke last', () => {
  const input = { questions: [{ question: 'Which statement?', header: 'October', options: [{ label: 'NLB', description: '1.–31.10.' }, { label: 'Revolut' }] }] };
  const tools = [{ name: 'Read', result: 'x' }, { name: 'AskUserQuestion', input, result: '' }];
  const msgs = [{ role: 'user', text: 'import' }, { role: 'assistant', text: 'Two match.' }];
  const q = openQuestion(tools, msgs);
  assert.equal(q.question, 'Which statement?');
  assert.deepEqual(q.options.map((o) => o.label), ['NLB', 'Revolut']);
  assert.equal(q.options[0].description, '1.–31.10.');
  // answered (a result arrived) → no open question
  assert.equal(openQuestion([{ name: 'AskUserQuestion', input, result: 'NLB' }], msgs), null);
  // the user already replied → no open question
  assert.equal(openQuestion(tools, [...msgs, { role: 'user', text: 'NLB' }]), null);
  // the question is not the last tool call → no open question
  assert.equal(openQuestion([...tools, { name: 'Bash', result: '' }], msgs), null);
  // input as a JSON string (the transcript's raw form) works too
  assert.equal(openQuestion([{ name: 'AskUserQuestion', input: JSON.stringify(input), result: '' }], msgs).options.length, 2);
  assert.equal(openQuestion([{ name: 'AskUserQuestion', input: '{bad', result: '' }], msgs), null);
  assert.equal(openQuestion([], msgs), null);
});

test('chatBody: lane only when not builder, session when known', () => {
  assert.deepEqual(chatBody('hi', { lane: 'builder' }), { message: 'hi' });
  assert.deepEqual(chatBody('hi', { lane: 'ask', sessionId: 's1' }), { message: 'hi', lane: 'ask', sessionId: 's1' });
});

test('targetLabel and cleanPin', () => {
  assert.equal(targetLabel(null), '');
  assert.equal(targetLabel({ kind: 'arch' }, (k) => (k === 'remote.theArch' ? 'the arch' : k)), 'the arch');
  assert.equal(targetLabel({ kind: 'agent', name: 'pers-dec' }), 'pers-dec');
  assert.equal(targetLabel({ kind: 'agent', repoId: 'abc' }), 'abc');
  assert.equal(cleanPin('12 34-56 78'), '123456');
  assert.equal(cleanPin(null), '');
});

// ---- fleet agents on the remote (openspec remote-fleet-agents) ------------------------------------
import { apiPathFor, badgeOfFleet, fleetGroups, dockTabFor, followScreen, pinHop } from './remoteModel.js';

test('apiPathFor: this harness directly, a peer through the relay', () => {
  assert.equal(apiPathFor('self', '/chat'), '/chat');
  assert.equal(apiPathFor(null, 'dock'), '/dock');
  assert.equal(apiPathFor('a1b2', '/sessions/s 1/messages'), '/remote/relay/a1b2/sessions/s 1/messages');
  assert.equal(apiPathFor('p/q', 'chat/stop?lane=ask'), '/remote/relay/p%2Fq/chat/stop?lane=ask');
});

test('fleetGroups: this dock first, then each peer with its DOCKED agents; a dark peer is kept, greyed', () => {
  const tabs = [{ id: 't1', repoId: 'r1', repoName: 'birocode', sessionId: 's1', color: '#abc', status: 'running' }];
  const fleet = { machines: [
    { machine: 'HUB', sourceId: 'self', self: true, reachable: true, agents: [{ repoId: 'r1', name: 'birocode', docked: true }] },
    { machine: 'LIVING ROOM', sourceId: 'lr', self: false, reachable: true, status: 'ok', agents: [
      { key: 'lr:a', repoId: 'a', name: 'pers-dec', docked: true, availability: 'busy' },
      { key: 'lr:b', repoId: 'b', name: 'daljinski', docked: true, availability: 'available', unseenResult: true },
      { key: 'lr:c', repoId: 'c', name: 'not-docked', docked: false },
    ] },
    { machine: 'LAPTOP', sourceId: 'lt', self: false, reachable: false, status: 'unreachable', agents: [{ repoId: 'x', name: 'x', docked: true }] },
  ] };
  const g = fleetGroups(fleet, tabs);
  assert.equal(g.length, 3);
  assert.deepEqual(g[0].agents.map((a) => [a.sourceId, a.repoId, a.badge, a.sessionId, a.tabId]), [['self', 'r1', 'busy', 's1', 't1']]);
  assert.equal(g[0].machine, 'HUB'); assert.equal(g[0].self, true);
  assert.deepEqual(g[1].agents.map((a) => [a.sourceId, a.name, a.badge]), [['lr', 'pers-dec', 'busy'], ['lr', 'daljinski', 'unseen']]);
  assert.equal(g[1].agents[0].status, 'running');
  assert.equal(g[2].reachable, false); assert.equal(g[2].agents.length, 1, 'a dark machine keeps its agents');
  // no fleet status at all → this harness alone, from the dock
  assert.deepEqual(fleetGroups(null, tabs).map((x) => x.sourceId), ['self']);
  assert.equal(badgeOfFleet({ availability: 'available' }), '');
  assert.equal(dockTabFor([{ repoId: 'a', sessionId: 'sa' }], 'a').sessionId, 'sa');
  assert.equal(dockTabFor([], 'a'), null);
});

test('followScreen: keep the peer while it shows a screen; come home when it went dark there and lit up at home — but not on the stale heartbeat right after the hop', () => {
  assert.equal(followScreen('self', [], []), 'self');
  assert.equal(followScreen('lr', [], [{ name: 'projector' }]), 'lr');
  assert.equal(followScreen('lr', [{ name: 'projector' }], [{ name: 'projector' }]), 'lr', 'both alive (the hop in flight): believe the last send');
  assert.equal(followScreen('lr', [{ name: 'projector' }], []), 'self', 'seen there before, now only here: home');
  assert.equal(followScreen('lr', [], []), 'lr', 'nothing anywhere: no evidence, keep');
  // just after the hop: home still shows the tab that LEFT (its heartbeat lingers 20 s), the peer has not loaded yet
  assert.equal(followScreen('lr', [{ name: 'projector' }], [], { seenThere: false, sinceHopMs: 4000 }), 'lr');
  assert.equal(followScreen('lr', [{ name: 'projector' }], [], { seenThere: false, sinceHopMs: 31000 }), 'self', 'grace over and never seen there: it never arrived');
  assert.equal(followScreen('lr', [{ name: 'projector' }], [], { seenThere: true, sinceHopMs: 4000 }), 'self', 'seen there already, now gone there and back here: home');
});

test('pinHop: the PIN and a same-origin `then`; anything else is dropped', () => {
  assert.deepEqual(pinHop('?pin=123456&then=%2Fstudio%3Fagent%3Dpers-dec%26screen%3Dprojector'), { pin: '123456', then: '/studio?agent=pers-dec&screen=projector' });
  assert.deepEqual(pinHop('?then=/studio/arch'), { pin: '', then: '/studio/arch' });
  assert.deepEqual(pinHop('?pin=123456&then=//evil.example/x'), { pin: '123456', then: '/studio' });
  assert.deepEqual(pinHop('?pin=123456&then=https://evil.example/'), { pin: '123456', then: '/studio' });
  assert.deepEqual(pinHop('?pin=12'), { pin: '', then: '/studio' });
  assert.equal(pinHop(''), null);
  assert.equal(pinHop('?screen=projector'), null);
});
