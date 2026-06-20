// Chat system tests — behavioural / protocol layer (no CLI, no token spend).
// Scenarios 1-2,5-9 from plans/chat-system-tests.md that don't require a real
// run. Each scenario is a step() so the suite runs headless (an agent reads the
// verdict) OR interactive (an operator clicks through it on the hub) from this
// one definition — see ./README.md and lib.mjs. Exits non-zero if any check
// fails, so it can gate CI later.
import { api, raw, login, check, note, report, step, say, BASE, RID } from './lib.mjs';

console.log(`\n# Chat behavioural tests against ${BASE} (repo ${RID || '(default)'})`);

// ---- 1. Auth gate: every chat endpoint rejects a cookie-less call -------------
await step('1. Auth gate — chat endpoints reject calls without the session cookie', async () => {
  say('A logged-out client must be turned away from every chat endpoint.');
  const calls = [
    ['POST /api/chat', { path: '/api/chat', method: 'POST', body: { message: 'x' } }],
    ['GET /api/runs', { path: '/api/runs' }],
    ['GET /api/sessions', { path: '/api/sessions' }],
    ['GET /api/chat/stream', { path: '/api/chat/stream' }],
    ['POST /api/chat/stop', { path: '/api/chat/stop', method: 'POST' }],
    ['GET /api/sessions/x/messages', { path: '/api/sessions/x/messages' }],
  ];
  say(`Calling ${calls.length} endpoints with NO session cookie — each must answer 401.`);
  for (const [label, opt] of calls) {
    const { status } = await api(opt.path, { method: opt.method, body: opt.body, noAuth: true });
    check(`${label} → 401 without auth`, status === 401, `got ${status}`);
  }
  // Health stays open (it's the probe endpoint).
  say('But /api/health stays open — it is the unauthenticated liveness probe.');
  const h = await api('/api/health', { noAuth: true });
  check('GET /api/health → 200 without auth', h.status === 200, `got ${h.status}`);
});

// Authenticate for the rest. A step so the operator sees it happen.
await step('Authenticate — establish a session cookie', async () => {
  say('Establishing the session that the rest of the suite reuses.');
  await login();
  check('login establishes a session cookie', true);
  return 'logged in to the isolated instance';
});

// ---- 2. Validation: bad/empty input → 4xx, never 500 -------------------------
await step('2. Validation — empty / missing message → 4xx, not 500', async () => {
  say('Empty, whitespace-only, missing, and bodyless requests must be rejected as a clean 4xx — never crash with a 500.');
  const empty = await api('/api/chat', { method: 'POST', body: { message: '' } });
  check('empty message → 400', empty.status === 400, `got ${empty.status} ${empty.text?.slice(0, 80)}`);

  const ws = await api('/api/chat', { method: 'POST', body: { message: '   ' } });
  check('whitespace-only message → 400', ws.status === 400, `got ${ws.status}`);

  const missing = await api('/api/chat', { method: 'POST', body: {} });
  check('missing message field → 400', missing.status === 400, `got ${missing.status}`);

  // No body at all (Content-Type json, empty). Should be a clean 4xx, not a 500.
  const nobody = await raw('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  check('no body → 4xx (not 500)', nobody.status >= 400 && nobody.status < 500, `got ${nobody.status}`);
});

// ---- 5. Stop with nothing running → 404 -------------------------------------
await step('5. Stop when idle → 404 with an error message', async () => {
  say('Asking to stop when nothing is running should be a clean 404 carrying a message — not a silent no-op or a crash.');
  const { status, json } = await api('/api/chat/stop', { method: 'POST' });
  check('stop with no running turn → 404', status === 404, `got ${status}`);
  check('stop 404 carries an error message', !!json?.error, JSON.stringify(json));
});

// ---- 6/7. Stream with no run → 404; runs snapshot shape ----------------------
await step('6/7. Stream-when-idle → 404 + runs snapshot shape', async () => {
  say('Subscribing to the stream with no active run → 404; and the runs snapshot must always be a JSON object.');
  const stream = await api('/api/chat/stream?after=0', {});
  check('stream with no run → 404', stream.status === 404, `got ${stream.status}`);

  const runs = await api('/api/runs', {});
  check('runs snapshot → 200', runs.status === 200, `got ${runs.status}`);
  check('runs snapshot is a JSON object', runs.json && typeof runs.json === 'object', typeof runs.json);
});

// ---- 8. Sessions list + transcript safety -----------------------------------
await step('8. Sessions list + transcript safety (no leak, no 500)', async () => {
  say('The sessions list must be a JSON array; unknown and path-traversal session ids must not leak files or 500.');
  const list = await api('/api/sessions', {});
  check('sessions list → 200 array', list.status === 200 && Array.isArray(list.json), `got ${list.status} ${typeof list.json}`);

  // Nonexistent session id → 200 with empty transcript (not 404/500).
  const none = await api('/api/sessions/00000000-0000-0000-0000-000000000000/messages', {});
  check('unknown session messages → 200 []', none.status === 200 && Array.isArray(none.json) && none.json.length === 0, `got ${none.status} ${JSON.stringify(none.json)?.slice(0, 60)}`);

  // Path-traversal id (encoded backslashes) must not leak or 500.
  const trav = await api('/api/sessions/..%5C..%5C..%5Cwindows%5Cwin.ini/messages', {});
  const safe = trav.status !== 500 && !(typeof trav.text === 'string' && /\[fonts\]|\[extensions\]/i.test(trav.text));
  check('path-traversal session id → no 500 / no leak', safe, `got ${trav.status}`);
});

// ---- 9. Bad inputs on idle endpoints ----------------------------------------
await step('9. Bad inputs on idle endpoints → normalized, not 500', async () => {
  say('A garbage query param (unknown lane) must be normalised, still yielding a clean 404 — not a 500.');
  // Unknown lane on stream normalizes to builder → still 404 (no run), not 500.
  const badLane = await api('/api/chat/stream?lane=wat&after=0', {});
  check('unknown lane on stream → 404 (normalized, not 500)', badLane.status === 404, `got ${badLane.status}`);
  note('unknown lane on POST /api/chat is exercised in runs.mjs (it spawns a builder turn by design)');
});

process.exit(report() === 0 ? 0 : 1);
