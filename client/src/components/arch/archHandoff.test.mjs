// node --test — "Use in Arch chat" hand-off (openspec arch-prompts-tab).
import test from 'node:test';
import assert from 'node:assert/strict';
import { handoffToArch, takeHandoff, openManageTab, HANDOFF_EVENT, OPEN_TAB_EVENT, HANDOFF_KEY } from './archHandoff.js';

function fakeWin() {
  const store = new Map();
  const events = [];
  return {
    events,
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    dispatchEvent(e) { events.push(e); return true; },
  };
}

test('a hand-off parks the text, announces it and asks for the Arch tab; taking it consumes it', () => {
  const w = fakeWin();
  assert.equal(handoffToArch('deploy {machine}', w), true);
  assert.deepEqual(w.events.map((e) => e.type), [HANDOFF_EVENT, OPEN_TAB_EVENT]);
  assert.equal(w.events[1].detail.tab, 'arch');
  assert.equal(w.sessionStorage.getItem(HANDOFF_KEY), 'deploy {machine}');
  assert.equal(takeHandoff(w), 'deploy {machine}');
  assert.equal(takeHandoff(w), null);                        // consumed once
});

test('an empty hand-off does nothing; openManageTab names the tab', () => {
  const w = fakeWin();
  assert.equal(handoffToArch('  ', w), false);
  assert.equal(w.events.length, 0);
  openManageTab('prompts', w);
  assert.equal(w.events[0].detail.tab, 'prompts');
});
