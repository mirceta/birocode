import test from 'node:test';
import assert from 'node:assert/strict';
import { overallUi, checkMark, orderChecks, countsLine, browserAgentCount } from './chromeReadiness.js';

test('overall state maps to the strip dot, and loading / unreachable are their own states', () => {
  assert.deepEqual(overallUi('ready'), { dot: 'ok', labelKey: 'chromeReady.state.ready' });
  assert.equal(overallUi('degraded').dot, 'pending');
  assert.equal(overallUi('not-ready').dot, 'err');
  assert.equal(overallUi(undefined, { loading: true }).dot, 'loading');
  assert.equal(overallUi('checking').labelKey, 'chromeReady.checking');   // the server's first, not-yet-read answer
  assert.equal(overallUi(undefined, { loadError: true }).labelKey, 'chromeReady.state.unreachable');
  assert.equal(overallUi('ready', { loadError: true }).dot, 'ok');       // a failed tick keeps the last good state
});

test('a check that could not be checked never gets a green tick', () => {
  assert.equal(checkMark('pass').mod, 'pass');
  assert.equal(checkMark('fail').mark, '✗');
  assert.equal(checkMark('warn').mod, 'warn');
  assert.deepEqual(checkMark('unknown'), { mark: '?', mod: 'unknown' });
  assert.deepEqual(checkMark(undefined), { mark: '?', mod: 'unknown' });
  assert.equal(checkMark('info').mod, 'info');                          // nothing to judge yet: neither tick nor question mark
});

test('failures are read first, passes last, order kept inside a group', () => {
  const ids = orderChecks([
    { id: 'chrome', state: 'pass' }, { id: 'bridge', state: 'fail' }, { id: 'extensionLogin', state: 'unknown' },
    { id: 'profile', state: 'warn' }, { id: 'login', state: 'fail' }, { id: 'cli', state: 'pass' },
  ]).map((c) => c.id);
  assert.deepEqual(ids, ['bridge', 'login', 'profile', 'extensionLogin', 'chrome', 'cli']);
  assert.deepEqual(orderChecks(null), []);
});

test('the counts line names only what needs attention', () => {
  assert.equal(countsLine({ pass: 8, fail: 2, warn: 1, unknown: 2 }), '2 failed · 1 warning · 2 not checkable');
  assert.equal(countsLine({ pass: 9, fail: 0, warn: 0, unknown: 0 }), '');
  assert.equal(countsLine({ pass: 7, fail: 0, warn: 2, unknown: 0 }), '2 warnings');
  assert.equal(countsLine(null), '');
});

test('browser-mode agents on this device are counted from the per-agent map', () => {
  assert.equal(browserAgentCount({ 'tab:a': true, 'repo:b': true }), 2);
  assert.equal(browserAgentCount({}), 0);
  assert.equal(browserAgentCount(undefined), 0);
});
