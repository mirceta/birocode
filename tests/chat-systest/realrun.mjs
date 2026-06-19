// Chat system tests — real-run layer (drives the actual Claude CLI; SPENDS
// TOKENS, authorised per plans/chat-system-tests.md). Scenarios 3,4,5,6,10-14.
// Prompts are tiny and the cheap model is used. Run against an isolated instance
// (see ./README.md). Each scenario is isolated in try/catch so one failure never
// hides the rest.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { api, raw, readSse, login, startTurn, waitFor, sleep, check, note, report, MODEL, BASE, RID } from './lib.mjs';

const SCRATCH = process.env.SCRATCH || '';
console.log(`\n# Chat real-run tests against ${BASE} (repo ${RID}), model ${MODEL}`);
await login();

const strictlyInc = (evs) => { let p = -Infinity; for (const e of evs) { if (typeof e.seq !== 'number' || e.seq <= p) return false; p = e.seq; } return evs.length > 0; };
const lastOf = (evs) => evs[evs.length - 1];

async function stopBoth() {
  await api('/api/chat/stop', { method: 'POST' }).catch(() => {});
  await api('/api/chat/stop?lane=ask', { method: 'POST' }).catch(() => {});
  // let slots release
  await waitFor(async () => {
    const r = await api('/api/runs', {});
    const vals = Object.values(r.json || {});
    return vals.every((v) => v.status !== 'running');
  }, 15000);
}

async function scenario(name, fn) {
  console.log(`\n## ${name}`);
  try { await fn(); } catch (e) { check(`${name} did not throw`, false, e?.message || String(e)); }
  await stopBoth();
}

// ---- 10. Basic turn: ordered session → token… → done ------------------------
await scenario('10. Basic turn', async () => {
  const t = startTurn({ message: 'Reply with exactly: OK', model: MODEL });
  const done = await t.waitFor((e) => e.type === 'done' || e.type === 'error', 120000);
  note(`events: ${t.events.map((e) => e.type).join(' → ')}`);
  check('completed with done', done?.type === 'done', `last=${lastOf(t.events)?.type}`);
  const firstSession = t.events.findIndex((e) => e.type === 'session');
  const firstToken = t.events.findIndex((e) => e.type === 'token');
  const doneIdx = t.events.findIndex((e) => e.type === 'done');
  check('session is first event', firstSession === 0, `at ${firstSession}`);
  check('token(s) arrive before done', firstToken !== -1 && firstToken < doneIdx, `token@${firstToken} done@${doneIdx}`);
  check('seq strictly increasing', strictlyInc(t.events));
  check('done carries a sessionId', !!done?.sessionId, JSON.stringify(done)?.slice(0, 80));
});

// ---- 11. Resume: a 2nd turn appends to the same session ----------------------
await scenario('11. Resume + sessions/transcript', async () => {
  const t1 = startTurn({ message: 'Reply with exactly: ALPHA', model: MODEL });
  const d1 = await t1.waitFor((e) => e.type === 'done', 120000);
  const sid = d1?.sessionId;
  check('first turn produced a sessionId', !!sid, String(sid));
  if (!sid) return;
  await stopBoth();

  const t2 = startTurn({ message: 'Reply with exactly: BETA', model: MODEL, sessionId: sid });
  const d2 = await t2.waitFor((e) => e.type === 'done', 120000);
  check('resume turn completed', d2?.type === 'done');
  check('resume kept the same sessionId', d2?.sessionId === sid, `got ${d2?.sessionId}`);

  const list = await api('/api/sessions', {});
  const found = Array.isArray(list.json) && list.json.some((s) => s.id === sid);
  check('resumed session appears in /api/sessions', found, `ids=${(list.json || []).map((s) => s.id).join(',').slice(0, 80)}`);

  const msgs = await api(`/api/sessions/${sid}/messages`, {});
  const text = JSON.stringify(msgs.json || []);
  check('transcript has user + assistant text', msgs.status === 200 && /ALPHA|BETA/.test(text) && msgs.json.some((m) => m.role === 'assistant'), `n=${msgs.json?.length}`);
});

// ---- 3. 409 single-flight (builder) -----------------------------------------
await scenario('3. 409 single-flight', async () => {
  const a = startTurn({ message: 'Count slowly to 20, one number per line.', model: MODEL });
  const sess = await a.waitFor((e) => e.type === 'session', 60000);
  check('first builder turn started (session event)', !!sess);
  const b = startTurn({ message: 'Reply with exactly: OK', model: MODEL });
  await b.done; // resolves once headers/JSON known
  check('second builder turn → 409', b.status === 409, `got ${b.status}`);
  check('409 carries an error message', !!b.headersJson?.error, JSON.stringify(b.headersJson));
});

// ---- 4. Ask concurrency: ask runs alongside a live builder ------------------
await scenario('4. Ask concurrency', async () => {
  const a = startTurn({ message: 'Count slowly to 20, one number per line.', model: MODEL });
  await a.waitFor((e) => e.type === 'session', 60000);
  const ask = startTurn({ message: 'Reply with exactly: OK', model: MODEL, lane: 'ask' });
  const askSession = await ask.waitFor((e) => e.type === 'session' || e.type === 'error', 60000);
  check('ask lane NOT rejected while builder runs', ask.status === 200, `got ${ask.status} ${JSON.stringify(ask.headersJson || '')}`);
  check('ask lane opened its own session', askSession?.type === 'session', `got ${askSession?.type}`);
  // runs snapshot should show two distinct keys (builder + ask) for this repo
  const runs = await api('/api/runs', {});
  const keys = Object.keys(runs.json || {});
  check('runs snapshot exposes a separate ask slot', keys.some((k) => k.includes('#ask')), `keys=${keys.join(',')}`);
});

// ---- 5. Stop kills the running turn -----------------------------------------
await scenario('5. Stop a live turn', async () => {
  const a = startTurn({ message: 'Count slowly to 50, one number per line.', model: MODEL });
  await a.waitFor((e) => e.type === 'token' || e.type === 'session', 60000);
  const stop = await api('/api/chat/stop', { method: 'POST' });
  check('stop returns 200', stop.status === 200, `got ${stop.status}`);
  check('stop body says stopped', stop.json?.stopped === true, JSON.stringify(stop.json));
  // the stream should end (terminal); runs flips off "running"
  const term = await waitFor(async () => {
    const r = await api('/api/runs', {});
    const v = (r.json || {})[RID];
    return v && v.status !== 'running' ? v : null;
  }, 30000);
  check('runs snapshot flips off running after stop', !!term, `status=${term?.status}`);
});

// ---- 6. Reattach: replay after seq N, no dupes/gaps -------------------------
await scenario('6. Reattach replay', async () => {
  const a = startTurn({ message: 'Reply with exactly: OK', model: MODEL });
  await a.waitFor((e) => e.events?.length >= 2 || e.type === 'token' || e.type === 'usage', 60000);
  await sleep(300);
  const seen = a.events.slice();
  const N = seen.length >= 2 ? seen[1].seq : 0;
  a.controller.abort(); // detach; run continues server-side

  const replay = [];
  const res = await raw(`/api/chat/stream?after=${N}`, {});
  check('reattach stream → 200', res.status === 200, `got ${res.status}`);
  await readSse(res, (e) => replay.push(e));
  check('replay only returns seq > N', replay.every((e) => e.seq > N), `N=${N} seqs=${replay.map((e) => e.seq).join(',')}`);
  check('replay seq strictly increasing (no dupes)', strictlyInc(replay), replay.map((e) => e.seq).join(','));
  const union = [...seen, ...replay].map((e) => e.seq).sort((x, y) => x - y);
  const gaps = union.filter((s, i) => i > 0 && s !== union[i - 1] + 1 && s !== union[i - 1]);
  check('no gaps across detach boundary', gaps.length === 0, `union=${union.join(',')}`);
  check('reattached stream reaches a terminal event', replay.some((e) => e.type === 'done' || e.type === 'error'), replay.map((e) => e.type).join(','));
});

// ---- 13. Model param honoured (run completes cleanly) -----------------------
await scenario('13. Model parameter', async () => {
  const t = startTurn({ message: 'Reply with exactly: OK', model: MODEL });
  const done = await t.waitFor((e) => e.type === 'done' || e.type === 'error', 120000);
  check('explicit model turn completes (no error)', done?.type === 'done', `last=${lastOf(t.events)?.type} ${lastOf(t.events)?.message || ''}`);
  check('done reports a cost (number)', typeof done?.cost === 'number', `cost=${done?.cost}`);
  note('the CLI honours --model; black-box can confirm completion + cost, not the exact model id');
});

// ---- 12. Tool lifecycle: a forced Read emits tool events --------------------
await scenario('12. Tool lifecycle', async () => {
  const t = startTurn({ message: 'Use the Read tool to read the file README.md, then reply with exactly: DONE', model: MODEL });
  const done = await t.waitFor((e) => e.type === 'done' || e.type === 'error', 150000);
  const tools = t.events.filter((e) => e.type === 'tool');
  note(`tool events: ${tools.map((e) => `${e.name || ''}:${e.status}`).join(' , ') || '(none)'}`);
  check('turn completed', done?.type === 'done', `last=${lastOf(t.events)?.type}`);
  check('emitted a tool start', tools.some((e) => e.status === 'start'), `count=${tools.length}`);
  check('emitted a tool end with ok flag', tools.some((e) => e.status === 'end' && 'ok' in e), `ends=${tools.filter((e) => e.status === 'end').length}`);
});

// ---- 14. Ask lane is read-only (cannot write files) ------------------------
await scenario('14. Ask read-only', async () => {
  const canary = 'systest-canary.txt';
  const t = startTurn({ message: `Create a file named ${canary} in the project root containing the text hi. Do it now.`, lane: 'ask', model: MODEL });
  await t.waitFor((e) => e.type === 'done' || e.type === 'error', 150000);
  if (!SCRATCH) { note('SCRATCH dir not provided — skipping on-disk assertion'); check('SCRATCH provided for read-only check', false, 'set SCRATCH=<scratch repo path>'); return; }
  const wrote = existsSync(join(SCRATCH, canary));
  check('ask lane did NOT create a file on disk (read-only held)', !wrote, wrote ? `${canary} was written!` : 'no file written');
});

process.exit(report() === 0 ? 0 : 1);
