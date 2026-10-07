// node --test — the shared toast's pure half (fleet task 6ee431ea, openspec
// manage-toast-overlay): normalization, the stack cap that never drops a sticky toast
// for a quiet one, and the 4 s / sticky split.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeToast, addToast, TOAST_TTL_MS, TOAST_MAX } from './toast.js';

test('makeToast normalizes: trimmed text, sticky flag, link only with an href, data map, unique ids', () => {
  const t = makeToast({ text: '  Opened prg in a new tab.  ', sticky: false, link: { href: 'http://x/studio', text: 'open ↗' }, data: { 'open-notice': 'opened' } });
  assert.equal(t.text, 'Opened prg in a new tab.');
  assert.equal(t.sticky, false);
  assert.deepEqual(t.link, { href: 'http://x/studio', text: 'open ↗' });
  assert.deepEqual(t.data, { 'open-notice': 'opened' });
  assert.equal(makeToast({ text: 'x', link: { text: 'no href' } }).link, null);
  assert.equal(makeToast({}).text, '…');
  assert.notEqual(makeToast({ text: 'a' }).id, makeToast({ text: 'a' }).id);
});

test('addToast stacks newest last and past the cap drops the oldest NON-sticky first', () => {
  let list = [];
  for (let i = 0; i < TOAST_MAX; i += 1) list = addToast(list, makeToast({ text: `t${i}`, sticky: i === 0 }));
  assert.equal(list.length, TOAST_MAX);
  const overflow = addToast(list, makeToast({ text: 'new' }));
  assert.equal(overflow.length, TOAST_MAX);
  assert.equal(overflow[0].text, 't0');                   // the sticky one survives
  assert.ok(!overflow.some((t) => t.text === 't1'));       // the oldest quiet one went
  assert.equal(overflow.at(-1).text, 'new');
  // All sticky: the cap still holds (the very oldest goes).
  let sticky = [];
  for (let i = 0; i < TOAST_MAX + 1; i += 1) sticky = addToast(sticky, makeToast({ text: `s${i}`, sticky: true }));
  assert.equal(sticky.length, TOAST_MAX);
  assert.equal(sticky[0].text, 's1');
});

test('the clock is ~4 s (the hover pause and sticky persistence are the layer\'s)', () => {
  assert.equal(TOAST_TTL_MS, 4000);
});
