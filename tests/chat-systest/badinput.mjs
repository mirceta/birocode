// Chat system tests — scenario 9: malformed *real* inputs that reach the CLI.
// The bug-hunt layer: a bad sessionId / model / lane must produce a graceful
// terminal (error or done) — never a hang, a 500, or a wedged run slot. Spends a
// little token. Run against an isolated instance (see ./README.md).
import { api, login, startTurn, waitFor, check, note, report, step, say, MODEL, BASE, RID } from './lib.mjs';

console.log(`\n# Chat bad-input tests against ${BASE} (repo ${RID}), model ${MODEL}`);
await login();

const lastOf = (evs) => evs[evs.length - 1];
async function stopBoth() {
  await api('/api/chat/stop', { method: 'POST' }).catch(() => {});
  await api('/api/chat/stop?lane=ask', { method: 'POST' }).catch(() => {});
  await waitFor(async () => {
    const r = await api('/api/runs', {});
    return Object.values(r.json || {}).every((v) => v.status !== 'running');
  }, 15000);
}
// step() makes the scenario pausable on the hub and records its checks; stopBoth
// releases any run slot before the next scenario.
async function scenario(name, fn) {
  await step(name, fn);
  await stopBoth();
}
// A run is "graceful" if the SSE opened (200) and reached a terminal event
// (done or error) within the timeout — i.e. it neither 500'd nor hung.
async function expectGracefulTerminal(label, opts, ms = 120000) {
  const t = startTurn(opts);
  say(`Waiting up to ${ms / 1000}s for "${label}" to reach a terminal — it must not hang, 500, or wedge a run slot.`);
  const term = await t.waitFor((e) => e.type === 'done' || e.type === 'error', ms);
  note(`${label}: ${t.events.map((e) => e.type).join(' → ') || `(http ${t.status})`}`);
  check(`${label}: opened SSE (200), not 4xx/5xx`, t.status === 200, `status ${t.status} ${JSON.stringify(t.headersJson || '')}`);
  check(`${label}: reached a terminal event (no hang)`, !!term, `last=${lastOf(t.events)?.type}`);
  return { t, term };
}

// ---- 9a. Resume a non-existent session --------------------------------------
await scenario('9a. Resume non-existent session', async () => {
  say('Resuming a sessionId that never existed must terminate gracefully (clean error or a fresh start) — not hang or crash.');
  const { term } = await expectGracefulTerminal('resume-ghost', {
    message: 'Reply with exactly: OK', model: MODEL,
    sessionId: 'deadbeef-0000-0000-0000-000000000000',
  });
  // Either it cleanly errors, or the CLI starts fresh — both are acceptable as
  // long as it's a clean terminal. Flag only a hang/crash (asserted above).
  note(`terminal type: ${term?.type}${term?.message ? ` — ${term.message}` : ''}`);
});

// ---- 9b. Unknown model -------------------------------------------------------
await scenario('9b. Unknown model', async () => {
  say('A bogus model name must surface a clean error event — not a silent success and not a hang.');
  const { term } = await expectGracefulTerminal('bad-model', {
    message: 'Reply with exactly: OK', model: 'claude-totally-not-a-model-9999',
  });
  check('unknown model surfaces an error event (not a silent success)', term?.type === 'error', `got ${term?.type}`);
});

// ---- 9c. Unknown lane normalises to builder ---------------------------------
await scenario('9c. Unknown lane → builder', async () => {
  say('An unknown lane must normalise to builder: the turn still runs and is recorded under builder, not a new phantom slot.');
  const t = startTurn({ message: 'Reply with exactly: OK', model: MODEL, lane: 'zzz-not-a-lane' });
  const term = await t.waitFor((e) => e.type === 'done' || e.type === 'error', 120000);
  check('unknown lane still runs (200)', t.status === 200, `status ${t.status}`);
  check('unknown lane completes', term?.type === 'done', `last=${lastOf(t.events)?.type}`);
  const runs = await api('/api/runs', {});
  const keys = Object.keys(runs.json || {});
  check('unknown lane is recorded under builder, not a new slot', keys.includes(RID) && !keys.some((k) => k.includes('#zzz')), `keys=${keys.join(',')}`);
});

// ---- 9d. Malformed sessionId (path-ish) -------------------------------------
await scenario('9d. Malformed sessionId', async () => {
  say('A path-ish sessionId (../../etc/passwd) must terminate gracefully — no traversal, no 500, no hang.');
  await expectGracefulTerminal('weird-sid', {
    message: 'Reply with exactly: OK', model: MODEL,
    sessionId: '../../etc/passwd',
  });
});

process.exit(report() === 0 ? 0 : 1);
