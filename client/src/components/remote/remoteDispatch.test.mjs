import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBundle, manageUrl, studioUrl, resolveView, nextZoom, readBigScreen, describeOutcome, createDispatcher,
  BIG_SCREEN_KEY, ZOOM_KEY, LANE_EVENT, REMOTE_OPEN_EVENT, REMOTE_OPEN_KEY, REMOTE_OPEN_TTL_MS,
  readRemoteOpen, clearRemoteOpen, remoteOpenMatches,
} from './remoteDispatch.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('detectBundle: the Management App is under the localview proxy, everything else is the studio', () => {
  assert.equal(detectBundle('/api/localview/057e/app/events-feed/manage/index.html'), 'manage');
  assert.equal(detectBundle('/studio/agent'), 'studio');
  assert.equal(detectBundle(''), 'studio');
});

test('manageUrl / studioUrl carry the screen name so the listener stays on after the hop', () => {
  assert.equal(manageUrl('', 'abc', 'kanban', 'projector'), '/api/localview/abc/app/events-feed/manage/index.html?tab=kanban&screen=projector');
  assert.equal(manageUrl('/proxy', 'abc', 'status', ''), '/proxy/api/localview/abc/app/events-feed/manage/index.html?tab=status');
  assert.equal(manageUrl('', '', 'kanban', 'p'), null);
  assert.equal(studioUrl('', '/studio', 'projector', 'pers-dec'), '/studio?agent=pers-dec&screen=projector');
  assert.equal(studioUrl('', '/studio/arch', ''), '/studio/arch');
});

test('resolveView stays in the current bundle when the view lives there, else hops', () => {
  assert.deepEqual(resolveView('kanban', 'studio'), { kind: 'manage', tab: 'kanban' });
  assert.deepEqual(resolveView('fleet', 'studio'), { kind: 'manage', tab: 'status' });
  assert.deepEqual(resolveView('arch', 'studio'), { kind: 'studio', path: '/studio/arch' });
  assert.deepEqual(resolveView('arch', 'manage'), { kind: 'manage', tab: 'arch' });
  assert.deepEqual(resolveView('agents', 'manage'), { kind: 'studio', path: '/studio/agents' });
  assert.equal(resolveView('nope', 'studio'), null);
  assert.deepEqual(resolveView(' Kanban ', 'manage'), { kind: 'manage', tab: 'kanban' });
});

test('nextZoom steps through the ladder and reset returns to 1', () => {
  assert.equal(nextZoom(1, 'in'), 1.15);
  assert.equal(nextZoom(1.15, 'in'), 1.3);
  assert.equal(nextZoom(2, 'in'), 2);
  assert.equal(nextZoom(1, 'out'), 0.9);
  assert.equal(nextZoom(0.8, 'out'), 0.8);
  assert.equal(nextZoom(1.5, 'reset'), 1);
  assert.equal(nextZoom('1.3', 'sideways'), 1.3);
  assert.equal(nextZoom(undefined, 'in'), 1.15);
});

test('readBigScreen: the URL forces and remembers; otherwise the remembered value decides', () => {
  const s = mem();
  assert.deepEqual(readBigScreen(s, ''), { on: false, name: '' });
  assert.deepEqual(readBigScreen(s, '?screen=projector'), { on: true, name: 'projector' });
  assert.equal(s.getItem(BIG_SCREEN_KEY), 'projector');
  assert.deepEqual(readBigScreen(s, '?tab=kanban'), { on: true, name: 'projector' });
  assert.deepEqual(readBigScreen(s, '?screen=1'), { on: true, name: 'big screen' });
  assert.deepEqual(readBigScreen(s, '?screen=0'), { on: false, name: '' });
  assert.deepEqual(readBigScreen(s, ''), { on: false, name: '' });
});

test('the remote-open mark is fresh for a short while, matches by repo id or name, and clears', () => {
  const s = mem();
  assert.equal(readRemoteOpen(s), null);
  s.setItem(REMOTE_OPEN_KEY, JSON.stringify({ agent: 'abc', at: 1000 }));
  assert.equal(readRemoteOpen(s, 1000 + REMOTE_OPEN_TTL_MS), 'abc');
  assert.equal(readRemoteOpen(s, 1001 + REMOTE_OPEN_TTL_MS), null);
  s.setItem(REMOTE_OPEN_KEY, '{bad');
  assert.equal(readRemoteOpen(s), null);
  s.setItem(REMOTE_OPEN_KEY, JSON.stringify({ agent: 'abc', at: 5 }));
  clearRemoteOpen(s);
  assert.equal(s.getItem(REMOTE_OPEN_KEY), null);
  const tab = { repoId: 'r-123', repoName: 'pers-dec' };
  assert.equal(remoteOpenMatches('r-123', tab), true);
  assert.equal(remoteOpenMatches('Pers-Dec', tab), true);
  assert.equal(remoteOpenMatches('prg', tab), false);
  assert.equal(remoteOpenMatches('', tab), false);
  assert.equal(remoteOpenMatches('r-123', null), false);
});

test('describeOutcome names the type and the result', () => {
  assert.equal(describeOutcome({ type: 'scroll' }, 'scrolled up'), 'scroll: scrolled up');
  assert.equal(describeOutcome({ type: 'x' }, null), 'x: ignored');
});

function fakeEnv(bundle, over = {}) {
  const posted = []; const assigned = []; const events = []; const navigated = []; const api = [];
  const body = { style: {} };
  const win = {
    location: { origin: 'http://h', assign: (u) => assigned.push(u) },
    postMessage: (m) => posted.push(m),
    dispatchEvent: (e) => events.push(e),
    localStorage: mem(),
    sessionStorage: mem(),
  };
  const doc = { body, querySelectorAll: () => [] };
  const env = {
    win, doc, root: '', bundle, screenName: 'projector',
    selfRepoId: () => 'self1', activeRepoId: () => 'repoA',
    navigate: (p) => navigated.push(p),
    post: async (p, b, o) => { api.push([p, o?.repoId]); },
    ...over,
  };
  return { env, posted, assigned, events, navigated, api, body };
}

test('open-agent in the studio posts the open-agent message to itself; in the Management App it hops to /studio?agent=', async () => {
  const s = fakeEnv('studio');
  assert.equal(await createDispatcher(s.env)({ type: 'open-agent', args: { repoId: 'pers-dec' } }), 'open-agent: steering to pers-dec');
  assert.equal(s.posted[0].agent, 'pers-dec');
  // the remote-open mark + event: the dock opens its first app beside the chat
  assert.equal(readRemoteOpen(s.env.win.sessionStorage), 'pers-dec');
  assert.equal(s.events.find((e) => e.type === REMOTE_OPEN_EVENT)?.detail?.agent, 'pers-dec');
  const m = fakeEnv('manage');
  await createDispatcher(m.env)({ type: 'open-agent', args: { handle: 'prg' } });
  assert.deepEqual(m.assigned, ['/studio?agent=prg&screen=projector']);
  assert.equal(await createDispatcher(s.env)({ type: 'open-agent', args: {} }), 'open-agent: no agent named');
});

test('open-view: same-bundle studio views use the router, management views hop with the screen name', async () => {
  const s = fakeEnv('studio');
  const d = createDispatcher(s.env);
  assert.equal(await d({ type: 'open-view', args: { view: 'arch' } }), 'open-view: showing /studio/arch');
  assert.deepEqual(s.navigated, ['/studio/arch']);
  assert.equal(await d({ type: 'open-view', args: { view: 'kanban' } }), 'open-view: opening management · kanban');
  assert.deepEqual(s.assigned, ['/api/localview/self1/app/events-feed/manage/index.html?tab=kanban&screen=projector']);
  assert.equal(await d({ type: 'open-view', args: { view: 'bogus' } }), 'open-view: unknown view bogus');
  const noSelf = fakeEnv('studio', { selfRepoId: () => '' });
  assert.equal(await createDispatcher(noSelf.env)({ type: 'open-view', args: { view: 'kanban' } }), 'open-view: this harness has no self repo registered');
});

test('zoom steps and remembers; lane raises the DOM event; stop posts to the shown agent', async () => {
  const s = fakeEnv('studio');
  const d = createDispatcher(s.env);
  assert.equal(await d({ type: 'zoom', args: { dir: 'in' } }), 'zoom: zoom 115%');
  assert.equal(s.body.style.zoom, '1.15');
  assert.equal(s.env.win.localStorage.getItem(ZOOM_KEY), '1.15');
  await d({ type: 'zoom', args: { dir: 'reset' } });
  assert.equal(s.body.style.zoom, '1');
  assert.equal(await d({ type: 'lane', args: { lane: 'ask' } }), 'lane: lane ask');
  assert.equal(s.events[0].type, LANE_EVENT);
  assert.equal(await d({ type: 'stop', args: {} }), 'stop: stopped builder');
  assert.deepEqual(s.api, [['/chat/stop?lane=builder', 'repoA']]);
  const none = fakeEnv('studio', { activeRepoId: () => null });
  assert.equal(await createDispatcher(none.env)({ type: 'stop' }), 'stop: no agent shown');
  assert.equal(await d({ type: 'scroll', args: { dir: 'up' } }), 'scroll: nothing to scroll');
  assert.equal(await d({ type: 'dance' }), 'dance: ignored');
});
