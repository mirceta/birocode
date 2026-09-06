// node --test — the liveness policy of the embedded local-app frame (openspec
// local-app-liveness-hysteresis, board task d1ce7236). The first test is the
// regression: one bad sample used to hide a live app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, next, initial, UP, DOWN, UNKNOWN, OFFLINE_AFTER_MISSES, OFFLINE_AFTER_MS, PROBE_TIMEOUT_MS } from './liveness.js';

const proxyDown = (verdict) => ({ res: { status: verdict === 'no-app' ? 404 : 502, headers: { 'X-ClaudeWeb-Localview': verdict } } });

test('regression: a single down sample never hides an app that was up', () => {
  let s = next(initial(), UP, 1000);
  assert.equal(s.online, true);
  s = next(s, DOWN, 5000);
  assert.equal(s.online, true, 'the old code flipped here');
  s = next(s, DOWN, 9000);
  assert.equal(s.online, true);
});

test('a live app goes offline only after three consecutive downs spanning ten seconds', () => {
  let s = next(initial(), UP, 0);
  s = next(s, DOWN, 4000);
  s = next(s, DOWN, 8000);
  s = next(s, DOWN, 9000); // three misses but only 9 s since the last good sample
  assert.equal(s.online, true);
  s = next(s, DOWN, 12000);
  assert.equal(s.online, false);
  assert.equal(OFFLINE_AFTER_MISSES, 3);
  assert.equal(OFFLINE_AFTER_MS, 10000);
});

test('an up sample resets the misses at once', () => {
  let s = next(initial(), UP, 0);
  s = next(s, DOWN, 4000);
  s = next(s, DOWN, 8000);
  s = next(s, UP, 12000);
  assert.deepEqual(s, { online: true, misses: 0, lastUp: 12000 });
  s = next(s, DOWN, 16000);
  s = next(s, DOWN, 20000);
  assert.equal(s.online, true);
});

test('a timed-out or unsendable probe changes nothing', () => {
  const up = next(initial(), UP, 0);
  assert.deepEqual(next(up, UNKNOWN, 4000), up);
  const never = initial();
  assert.deepEqual(next(never, UNKNOWN, 4000), never); // still unknown: the empty state waits for a real answer
  const down = next(initial(), DOWN, 0);
  assert.deepEqual(next(down, UNKNOWN, 4000), down);
});

test('an app never seen up goes offline on the first down (a dead port shows the empty state at once)', () => {
  const s = next(initial(), DOWN, 0);
  assert.equal(s.online, false);
  assert.equal(s.misses, 1);
});

test('only the harness verdict counts as down; any answer from the app is up', () => {
  assert.equal(classify({ res: { status: 200, headers: {} } }), UP);
  assert.equal(classify({ res: { status: 401, headers: {} } }), UP);
  assert.equal(classify({ res: { status: 500, headers: {} } }), UP);
  assert.equal(classify({ res: { status: 502, headers: {} } }), UP); // a 502 the APP produced, not the proxy
  assert.equal(classify(proxyDown('unreachable')), DOWN);
  assert.equal(classify(proxyDown('no-app')), DOWN);
  assert.equal(classify({ res: { status: 502, headers: { get: (n) => (n === 'x-claudeweb-localview' ? 'unreachable' : null) } } }), DOWN);
});

test('timeouts are unknown; a same-origin send failure is unknown; a cross-origin refusal is down', () => {
  assert.equal(classify({ error: 'AbortError' }), UNKNOWN);
  assert.equal(classify({ error: 'TypeError', sameOrigin: true }), UNKNOWN);
  assert.equal(classify({ error: 'TypeError', sameOrigin: false }), DOWN);
  assert.equal(classify({ res: { status: 0, headers: {} }, sameOrigin: false }), UP); // opaque no-cors answer
  assert.ok(PROBE_TIMEOUT_MS >= 8000, 'the probe must outlast a queued request, not a 3 s guess');
});

test('the optimistic start (a kept-alive frame) counts as up now', () => {
  const s = initial(true);
  assert.equal(s.online, true);
  assert.ok(s.lastUp > 0);
});
