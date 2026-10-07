// node --test — the Status tab's line after "open harness" (openspec status-open-agent-anywhere),
// and its toast form (openspec manage-toast-overlay).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openNoticeText, openToastOf } from './openNotice.js';

test('quiet outcomes fade and carry no link', () => {
  for (const result of ['opened', 'renavigated', 'self-reopened']) {
    const v = openNoticeText({ result, label: 'pers-dec' });
    assert.ok(!v.sticky && !v.link, result);
    assert.match(v.text, /pers-dec/);
  }
  const raised = openNoticeText({ result: 'steered', raised: true, label: 'pers-dec' });
  assert.ok(!raised.sticky && /Switched pers-dec/.test(raised.text));
});

test('a tab that did not come to the front, did not answer, or was blocked stays with a link', () => {
  const notRaised = openNoticeText({ result: 'steered', raised: false, label: 'pers-dec' });
  assert.ok(notRaised.sticky && notRaised.link && /another window/.test(notRaised.text));
  const silent = openNoticeText({ result: 'silent', label: 'pers-dec' });
  assert.ok(silent.sticky && silent.link && /did not answer/.test(silent.text));
  const blocked = openNoticeText({ result: 'blocked', label: 'pers-dec' });
  assert.ok(blocked.sticky && blocked.link && /pop-up/.test(blocked.text));
  assert.match(openNoticeText({ result: 'blocked' }).text, /the agent/);   // no label: a generic name, never "undefined"
  assert.ok(openNoticeText({}).sticky);
});

test('openToastOf: the same wording and persistence as a toast; the link only with a URL; the data hooks ride along', () => {
  const quiet = openToastOf({ result: 'opened', label: 'pers-dec', key: '|r-pd', url: 'http://x/studio?agent=r-pd' });
  assert.ok(!quiet.sticky && quiet.link === null && /Opened pers-dec/.test(quiet.text));
  assert.deepEqual(quiet.data, { 'open-notice': 'opened', 'open-notice-agent': '|r-pd' });
  const blocked = openToastOf({ result: 'blocked', label: 'pers-dec', key: '|r-pd', url: 'http://x/studio?agent=r-pd' });
  assert.ok(blocked.sticky);
  assert.deepEqual(blocked.link, { href: 'http://x/studio?agent=r-pd', text: 'open pers-dec in a new tab ↗' });
  // Sticky but URL-less (unknown machine): persistent, no dead link.
  const noUrl = openToastOf({ result: 'no-address', label: 'pers-dec', machine: 'laptop' });
  assert.ok(noUrl.sticky && noUrl.link === null && /no address/.test(noUrl.text));
  assert.equal(openToastOf({}).data['open-notice'], '');
});
