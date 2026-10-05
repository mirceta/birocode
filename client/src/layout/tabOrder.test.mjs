// openspec tabbed-agent-tab: the Agent tab's place in the nav, the landing path for an
// ?agent= link, and its exclusion from the pane strip. Run: `npm --prefix client test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortTabs, landingPathForAgentLink, paneTabsWithoutAgent, isAgentPath } from './tabOrder.js';

const T = (...keys) => keys.map((key) => ({ key }));

test('saved order first, unmentioned tabs follow in default order', () => {
  assert.deepEqual(sortTabs(T('claude', 'files', 'git', 'history'), ['git', 'claude']).map((t) => t.key), ['git', 'claude', 'files', 'history']);
  assert.deepEqual(sortTabs(T('claude', 'files'), []).map((t) => t.key), ['claude', 'files']);
});

test('the Agent tab, never placed by the saved order, sits right after Chat', () => {
  assert.deepEqual(sortTabs(T('claude', 'files', 'git', 'agent'), []).map((t) => t.key), ['claude', 'agent', 'files', 'git']);
  assert.deepEqual(sortTabs(T('claude', 'files', 'git', 'agent'), ['git', 'files', 'claude']).map((t) => t.key), ['git', 'files', 'claude', 'agent']);
  // Once the Operator places it, the saved order wins like for any tab.
  assert.deepEqual(sortTabs(T('claude', 'files', 'agent'), ['agent', 'claude', 'files']).map((t) => t.key), ['agent', 'claude', 'files']);
  // Without a Chat tab in the list it just follows default order.
  assert.deepEqual(sortTabs(T('files', 'agent'), []).map((t) => t.key), ['files', 'agent']);
});

test('an ?agent= link lands on the Agent tab when the feature is on, on Chat otherwise', () => {
  assert.equal(landingPathForAgentLink(true), '/studio/agent');
  assert.equal(landingPathForAgentLink(false), '/studio');
});

test('the Agent tab never joins the pane strip', () => {
  assert.deepEqual(paneTabsWithoutAgent(T('claude', 'agent', 'files')).map((t) => t.key), ['claude', 'files']);
  assert.ok(isAgentPath('/studio/agent') && isAgentPath('/studio/agent/') && !isAgentPath('/studio') && !isAgentPath('/studio/agents'));
});
