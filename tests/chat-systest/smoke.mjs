// One real, cheap turn to confirm the isolated instance can drive the Claude CLI
// before we spend tokens on the full real-run suite. Prints the event sequence.
import { login, startTurn, report, check, step, MODEL, BASE, RID } from './lib.mjs';

console.log(`\n# smoke: one real turn against ${BASE} (repo ${RID}), model ${MODEL}`);

await step('Smoke — one real turn drives the CLI end-to-end', async () => {
  await login();
  const t = startTurn({ message: 'Reply with exactly: OK', model: MODEL });
  const done = await t.waitFor((e) => e.type === 'done' || e.type === 'error', 120000);
  await t.controller.abort();

  console.log('  events:', t.events.map((e) => e.type).join(' → ') || '(none)');
  check('POST /api/chat opened an SSE stream (200)', t.status === 200, `status ${t.status} ${JSON.stringify(t.headersJson || '')}`);
  check('got a session event', t.events.some((e) => e.type === 'session'));
  check('got a done event (turn completed)', done?.type === 'done', `last=${done?.type} ${done?.message || ''}`);
  check('seq present + strictly increasing', strictlyIncreasing(t.events), seqList(t.events));
  return `events: ${t.events.map((e) => e.type).join(' → ') || '(none)'}`;
});

function strictlyIncreasing(evs) {
  let prev = -Infinity;
  for (const e of evs) { if (typeof e.seq !== 'number' || e.seq <= prev) return false; prev = e.seq; }
  return evs.length > 0;
}
function seqList(evs) { return evs.map((e) => e.seq).join(','); }

process.exit(report() === 0 ? 0 : 1);
