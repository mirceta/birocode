// node --test — the live step machinery and the persisted tool calls that now ride with an arch
// reply (openspec arch-chat-tool-calls-history): a transcript's toolCalls become steps in the
// exact shape the live stream renders, so a finished turn keeps showing what it called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyToolEvent, settleSteps, stepsFromToolCalls } from './turnSteps.js';

test('stepsFromToolCalls maps persisted calls to the live step shape (done / error, input, result)', () => {
  const steps = stepsFromToolCalls([
    { kind: 'tool', id: 't1', name: 'mcp__arch__send_task', tool: 'send_task', status: 'done', ok: true, summary: 'a', detail: '{"repoId":"a"}', preview: '{"ok":true}', startedAt: 1700000000000, durationMs: 5000 },
    { kind: 'tool', id: 't2', name: 'Read', tool: 'Read', status: 'error', ok: false, summary: 'C:\\x.txt', detail: '{"file_path":"C:\\\\x.txt"}', preview: 'Read is not allowed', startedAt: null, durationMs: null },
    { id: 't3', tool: 'recall', ok: null },
  ]);
  assert.equal(steps.length, 3);
  assert.deepEqual(steps[0], { kind: 'tool', id: 't1', name: 'mcp__arch__send_task', status: 'done', ok: true, summary: 'a', detail: '{"repoId":"a"}', preview: '{"ok":true}', startedAt: 1700000000000, durationMs: 5000, persisted: true });
  assert.equal(steps[1].status, 'error');
  assert.equal(steps[1].ok, false);
  assert.equal(steps[1].preview, 'Read is not allowed');
  // A call with no result is done, not an error; the tool name stands in for a missing name.
  assert.equal(steps[2].status, 'done');
  assert.equal(steps[2].ok, true);
  assert.equal(steps[2].name, 'recall');
  assert.equal(steps[2].detail, '');
  assert.deepEqual(stepsFromToolCalls(null), []);
});

test('a live tool event settles into the same fields a persisted call carries', () => {
  let steps = applyToolEvent([], { status: 'start', id: 'x', name: 'mcp__arch__list_agents', summary: '' });
  steps = applyToolEvent(steps, { status: 'end', id: 'x', ok: true, preview: '{"ok":true}' });
  const settled = settleSteps(steps);
  const persisted = stepsFromToolCalls([{ id: 'x', name: 'mcp__arch__list_agents', ok: true, preview: '{"ok":true}' }])[0];
  for (const k of ['kind', 'id', 'name', 'status', 'ok', 'preview']) assert.equal(settled[0][k], persisted[k], k);
});
