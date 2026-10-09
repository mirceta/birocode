import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBundle, manageUrl, studioUrl, resolveView, nextZoom, readBigScreen, describeOutcome, createDispatcher,
  BIG_SCREEN_KEY, ZOOM_KEY, LANE_EVENT, LAYOUT_EVENT, PUSH_APP_EVENT, REMOTE_TYPES, sofaLayout, pickApp,
} from './remoteDispatch.js';

test('sofaLayout: maximize always, split 30 / 70 only when an app is pushed; normal restores', () => {
  assert.deepEqual(sofaLayout('sofa', true), { maximize: true, split: true, ratio: 30 });
  assert.deepEqual(sofaLayout('sofa', false), { maximize: true, split: false, ratio: null });
  assert.deepEqual(sofaLayout('normal', true), { maximize: false, split: false, ratio: null });
  assert.deepEqual(sofaLayout(undefined, true), { maximize: true, split: true, ratio: 30 });
});

test('pickApp: by id, by name, or the first; null without apps', () => {
  const apps = [{ id: 'app--28166', name: 'homepage' }, { id: 'app--5077', name: 'App :5077' }];
  assert.equal(pickApp(apps, 'first').id, 'app--28166');
  assert.equal(pickApp(apps, undefined).id, 'app--28166');
  assert.equal(pickApp(apps, 'APP--5077').id, 'app--5077');
  assert.equal(pickApp(apps, 'Homepage').id, 'app--28166');
  assert.equal(pickApp(apps, 'nope'), null);
  assert.equal(pickApp([], 'first'), null);
  assert.ok(REMOTE_TYPES.includes('layout') && REMOTE_TYPES.includes('push-app'));
});

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
  assert.equal(await d({ type: 'layout', args: { mode: 'sofa' } }), 'layout: layout sofa');
  assert.equal(await d({ type: 'layout', args: { mode: 'NORMAL' } }), 'layout: layout normal');
  assert.deepEqual(s.events.filter((e) => e.type === LAYOUT_EVENT).map((e) => e.detail.mode), ['sofa', 'normal']);
  assert.equal(await d({ type: 'push-app', args: { app: 'homepage' } }), 'push-app: push app homepage');
  assert.equal(await d({ type: 'push-app', args: {} }), 'push-app: push app first');
  assert.deepEqual(s.events.filter((e) => e.type === PUSH_APP_EVENT).map((e) => e.detail.app), ['homepage', 'first']);
  assert.equal(await d({ type: 'stop', args: {} }), 'stop: stopped builder');
  assert.deepEqual(s.api, [['/chat/stop?lane=builder', 'repoA']]);
  const none = fakeEnv('studio', { activeRepoId: () => null });
  assert.equal(await createDispatcher(none.env)({ type: 'stop' }), 'stop: no agent shown');
  assert.equal(await d({ type: 'scroll', args: { dir: 'up' } }), 'scroll: nothing to scroll');
  assert.equal(await d({ type: 'dance' }), 'dance: ignored');
});
