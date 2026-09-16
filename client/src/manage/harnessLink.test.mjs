// node --test — Fleet Status "open harness" URL derivation (task e5cddb1e).
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentWorkerHref, harnessHref, harnessRootFromLocation } from './harnessLink.js';

test('self machine links to this harness root, honouring the proxy prefix', () => {
  assert.equal(harnessHref({ self: true, address: null }), '/');
  assert.equal(harnessHref({ self: true }, '/preview'), '/preview/');
});

test('remote machine links to the peer registry address verbatim', () => {
  assert.equal(harnessHref({ self: false, address: 'http://192.168.0.20:5099' }), 'http://192.168.0.20:5099');
  assert.equal(harnessHref({ self: false, address: 'https://monster.example' }), 'https://monster.example');
});

test('unknown or malformed addresses yield null, never a broken href', () => {
  assert.equal(harnessHref({ self: false, address: '' }), null);
  assert.equal(harnessHref({ self: false, address: null }), null);
  assert.equal(harnessHref({ self: false, address: 'monster-no-scheme' }), null);
  assert.equal(harnessHref({ self: false, address: 'ftp://x' }), null);
  assert.equal(harnessHref(null), null);
});

// Board task afed9d6d: the worker-window deep link — machine harness + ?agent=.
test('worker link = harness base + /studio?agent=<repoId>, encoded', () => {
  assert.equal(
    agentWorkerHref({ self: false, address: 'http://192.168.0.101:5099' }, '', 'repo-1'),
    'http://192.168.0.101:5099/studio?agent=repo-1',
  );
  assert.equal(agentWorkerHref({ self: true }, '', 'r 1#2'), '/studio?agent=r%201%232');
  assert.equal(agentWorkerHref({ self: true }, '/prefix', 'x'), '/prefix/studio?agent=x');
});

test('worker link degrades to null when machine or agent is unknown', () => {
  assert.equal(agentWorkerHref({ self: false, address: 'no-scheme' }, '', 'r1'), null);
  assert.equal(agentWorkerHref(undefined, '', 'r1'), null);
  assert.equal(agentWorkerHref({ self: true }, '', ''), null);
  assert.equal(agentWorkerHref({ self: true }, '', null), null);
});

test('harness root from the page location: origin vs localview proxy prefix', () => {
  assert.equal(harnessRootFromLocation('/studio'), '');
  assert.equal(harnessRootFromLocation('/api/localview/r1/app/manage/'), '');
  assert.equal(harnessRootFromLocation('/prefix/api/localview/r1/app/manage/'), '/prefix');
  assert.equal(harnessRootFromLocation(''), '');
});
