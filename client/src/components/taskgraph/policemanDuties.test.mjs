// node --test — the policeman's responsibilities table (openspec policeman-responsibilities-tab):
// every row is complete, every reading state the card can show has a row, the rules' numbers
// are the code's, and the filter narrows by every term.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, COLUMNS, RULES, VOCABULARY, allRows, filterRows } from './policemanDuties.js';
import { OBSERVATIONS } from './cardSections.js';

test('every group has a title, a lead and rows; every row fills all four columns and names its source', () => {
  assert.equal(COLUMNS.length, 4);
  assert.ok(GROUPS.length >= 6);
  for (const g of GROUPS) {
    assert.ok(g.key && g.title && g.lead, g.key);
    assert.ok(g.rows.length >= 3, `${g.key} has ${g.rows.length} rows`);
    for (const row of g.rows) {
      for (const [k] of COLUMNS) assert.ok(typeof row[k] === 'string' && row[k].trim(), `${g.key}: "${row.card}" lacks ${k}`);
      assert.ok(row.source, `${g.key}: "${row.card}" names no source`);
    }
  }
  assert.ok(allRows().length >= 40);
  assert.deepEqual([...new Set(allRows().map((r) => r.group))], GROUPS.map((g) => g.key));
});

test('every reading state has a row in the Read group, and the ones that need attention have a flag row', () => {
  const read = GROUPS.find((g) => g.key === 'read');
  const flag = GROUPS.find((g) => g.key === 'flag');
  for (const [key, [icon, word]] of Object.entries(OBSERVATIONS)) {
    assert.ok(read.rows.some((r) => r.does.includes(`${icon} ${word}`)), `no Read row for ${key}`);
  }
  for (const key of ['asked-question', 'blocked', 'errored', 'handoff']) {
    const [icon, word] = OBSERVATIONS[key];
    assert.ok(flag.rows.some((r) => r.card.includes(`${icon} ${word}`)), `no Flag row for ${key}`);
  }
  assert.equal(VOCABULARY.length, Object.keys(OBSERVATIONS).length);
  assert.deepEqual(VOCABULARY.find((v) => v[0] === 'handoff').slice(1, 3), ['🤝', 'Handoff pending']);
});

test('the rules quote the code’s numbers', () => {
  assert.equal(RULES.passEverySeconds, 60);
  assert.equal(RULES.attentionHours, 2);
  assert.equal(RULES.againstSweeps, 2);
  assert.equal(RULES.traceEveryMinutes, 5);
  assert.equal(RULES.maxQuestionsPerPass, 8);
  const text = allRows().map((r) => `${r.says} ${r.does} ${r.then}`).join('\n');
  assert.match(text, /after 2 h/);
  assert.match(text, /for 2 consecutive sweeps/);
  assert.match(text, /never backwards|forward only/);
  assert.match(text, /never touched/);
});

test('filterRows narrows by every term across all columns and drops empty groups', () => {
  assert.equal(filterRows('').length, GROUPS.length);
  const handoff = filterRows('handoff');
  assert.ok(handoff.length >= 2);
  assert.ok(handoff.every((g) => g.rows.every((r) => /handoff/i.test(`${r.card} ${r.says} ${r.does} ${r.then} ${r.source}`))));
  const narrow = filterRows('handoff follow-up 2 h');
  assert.ok(narrow.length >= 1 && allRows(narrow).length < allRows(handoff).length);
  assert.deepEqual(filterRows('zzz-nothing-matches'), []);
});
