// node --test — Fleet Status "open harness" URL derivation (task e5cddb1e).
import test from 'node:test';
import assert from 'node:assert/strict';
import { harnessHref } from './harnessLink.js';

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
