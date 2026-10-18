import test from 'node:test';
import assert from 'node:assert/strict';
import { nextKept, sameKept, MAX_KEPT } from './agentKeepAlive.js';

test('the first visit adds the dock; returning moves it to the front without dropping the others', () => {
  let k = nextKept([], 'a', ['a', 'b', 'c']);
  assert.deepEqual(k, ['a']);
  k = nextKept(k, 'b', ['a', 'b', 'c']);
  assert.deepEqual(k, ['b', 'a']);
  k = nextKept(k, 'a', ['a', 'b', 'c']);
  assert.deepEqual(k, ['a', 'b']); // back to a: still mounted, b kept too
});

test('closed tabs are dropped; an unknown active id adds nothing', () => {
  assert.deepEqual(nextKept(['a', 'b', 'c'], 'a', ['a', 'c']), ['a', 'c']);
  assert.deepEqual(nextKept(['a'], 'zz', ['a']), ['a']);
  assert.deepEqual(nextKept(['a'], null, ['a']), ['a']);
});

test('past the cap the least recently shown dock is unmounted', () => {
  const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
  let k = [];
  for (const id of ids) k = nextKept(k, id, ids);
  assert.equal(k.length, MAX_KEPT);
  assert.deepEqual(k, ['8', '7', '6', '5', '4', '3']);
  assert.deepEqual(nextKept(['a', 'b', 'c'], 'c', ['a', 'b', 'c'], 2), ['c', 'a']);
});

test('sameKept compares order too', () => {
  assert.equal(sameKept(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameKept(['a', 'b'], ['b', 'a']), false);
});
