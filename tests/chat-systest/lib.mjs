// Shared helpers for the Chat black-box system tests (plans/chat-system-tests.md).
//
// These drive the running Harness over the SAME HTTP/SSE surface the frontend
// uses. Point them at an ISOLATED instance (fresh CLAUDEWEB_DATADIR, own port)
// so real CLI turns and repo registrations never touch the operator's live
// store — see ./README.md for how to launch one.
//
// Config via env (defaults match the README's isolated instance):
//   BASE  base URL of the harness under test       (http://localhost:5310)
//   RID   X-Repo-Id of the throwaway scratch repo  (set by the launcher)
//   PW    seed password of the fresh datadir        (systest-pw-9912)
//   MODEL cheap model for token-spending cases      (claude-haiku-4-5)

export const BASE = process.env.BASE || 'http://localhost:5310';
export const RID = process.env.RID || '';
export const PW = process.env.PW || 'systest-pw-9912';
export const MODEL = process.env.MODEL || 'claude-haiku-4-5';

let cookie = ''; // claudeweb_session=... captured at login

// ---- structured events -------------------------------------------------------
// Tests are driven two ways from ONE definition (plans/chat-system-tests.md):
//   • headless    — run end-to-end, emit a verdict (an agent runs the suite).
//   • interactive — a human steps through, the hub shows feedback per step.
// To make that possible without a second copy of each test, steps emit
// single-line JSON events with a sentinel prefix. The hub parses these to draw
// the step list; the human-readable [PASS]/[FAIL] lines keep flowing alongside,
// so anything that greps the console today still works.
export const EVENT = '@@SYSTEST@@';
export const MODE = process.env.SYSTEST_MODE || 'headless';
function emit(obj) { console.log(`${EVENT} ${JSON.stringify(obj)}`); }

// ---- findings ----------------------------------------------------------------
// Every check records a result; a failing check is a candidate bug. We never
// throw on a failed assertion — the point is to run ALL scenarios and collect
// the full picture, not stop at the first surprise.
const results = [];
export function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`);
  return !!pass;
}
export function note(msg) { console.log(`  ·    ${msg}`); }

export function report() {
  const fails = results.filter((r) => !r.pass);
  console.log(`\n===== summary: ${results.length - fails.length}/${results.length} passed =====`);
  if (fails.length) {
    console.log('FINDINGS (candidate bugs):');
    for (const f of fails) console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  emit({ type: 'summary', passed: results.length - fails.length, total: results.length });
  return fails.length;
}

// ---- steps -------------------------------------------------------------------
// A step is the unit of a test: a named scenario the harness can pause on and
// report on individually. Inside a step, use check()/note() exactly as before —
// the checks recorded during the step are attributed to it. A step may `return`
// a short string to set its "observed" summary line (otherwise one is derived).
//
//   await step('Auth gate rejects no-cookie', async () => { ... check(...) ... });
//
// Headless runs steps back-to-back. Interactive blocks before each step until
// the hub releases it (see interactive control below), so the operator advances
// the test by clicking.
let stepIndex = -1;

// Interactive control channel: the hub writes a line to our stdin when the
// operator clicks — "go" (run the next step), "skip" (skip it), "abort" (stop).
// Headless never reads stdin.
const goQueue = [];
let goResolve = null;
let stdinWired = false;
function wireStdin() {
  if (stdinWired) return;
  stdinWired = true;
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const cmd = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!cmd) continue;
      if (goResolve) { const r = goResolve; goResolve = null; r(cmd); }
      else goQueue.push(cmd);
    }
  });
  process.stdin.resume();
}
function waitForControl() {
  return new Promise((resolve) => {
    if (goQueue.length) return resolve(goQueue.shift());
    goResolve = resolve;
  });
}

export async function step(name, fn) {
  const i = ++stepIndex;

  let control = 'go';
  if (MODE === 'interactive') {
    wireStdin();
    emit({ type: 'step', phase: 'await', i, name }); // SPA: this step is ready
    control = await waitForControl();
  }
  if (control === 'abort') {
    emit({ type: 'aborted', i });
    process.exit(report() === 0 ? 0 : 1);
  }
  if (control === 'skip') {
    console.log(`\n## (skipped) ${name}`);
    emit({ type: 'step', phase: 'end', i, name, status: 'skip', observed: 'skipped by operator', checks: [] });
    return;
  }

  emit({ type: 'step', phase: 'start', i, name });
  console.log(`\n## ${name}`);
  const mark = results.length;
  let observed = '';
  try {
    const r = await fn();
    if (typeof r === 'string') observed = r;
  } catch (e) {
    check(`${name} threw`, false, e?.message || String(e));
  }
  const mine = results.slice(mark);
  const failed = mine.filter((r) => !r.pass);
  const status = failed.length ? 'fail' : 'pass';
  if (!observed) {
    observed = status === 'pass'
      ? `${mine.length} check${mine.length === 1 ? '' : 's'} passed`
      : `${failed.length}/${mine.length} checks failed`;
  }
  emit({ type: 'step', phase: 'end', i, name, status, observed,
    checks: mine.map((r) => ({ name: r.name, pass: r.pass, detail: r.detail })) });
}

// ---- auth + scoped fetch -----------------------------------------------------
export async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  });
  const setCookie = res.headers.getSetCookie?.() || [res.headers.get('set-cookie')].filter(Boolean);
  const m = (setCookie.join('; ').match(/claudeweb_session=[^;]+/) || [])[0];
  if (m) cookie = m;
  if (!res.ok || !cookie) throw new Error(`login failed: http ${res.status}, cookie=${!!cookie}`);
  return cookie;
}

// One request to the harness. By default sends the auth cookie and scopes to the
// scratch repo via X-Repo-Id. Pass {noAuth:true} / {noRepo:true} / {repoId:'x'}
// to exercise the cross-cutting gates. Returns the raw Response.
export function raw(path, { method = 'GET', body, headers = {}, noAuth = false, noRepo = false, repoId, signal } = {}) {
  const h = { ...headers };
  if (!noAuth && cookie) h.Cookie = cookie;
  const rid = repoId !== undefined ? repoId : RID;
  if (!noRepo && rid) h['X-Repo-Id'] = rid;
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  return fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    signal,
  });
}

// JSON convenience: returns {status, json, text}.
export async function api(path, opts) {
  const res = await raw(path, opts);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { /* non-json */ }
  return { status: res.status, json, text, res };
}

// ---- SSE -------------------------------------------------------------------
// Parse a `data: {json}\n\n` SSE byte stream into event objects. Calls onEvent
// for each parsed event. Resolves when the stream ends (server closed or abort).
export async function readSse(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of frame.split('\n')) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload) continue;
          try { onEvent(JSON.parse(payload)); }
          catch { onEvent({ type: '_unparsed', raw: payload }); }
        }
      }
    }
  } catch (e) {
    if (e?.name !== 'AbortError') throw e;
  }
}

// Start a chat turn and stream it in the background. Returns a live handle:
//   { events, controller, done, waitFor(pred,ms), status }
// `events` accrues as they arrive; `done` resolves when the SSE ends; call
// controller.abort() to detach (the run keeps going server-side).
export function startTurn({ message, lane, model, sessionId, repoId } = {}) {
  const controller = new AbortController();
  const events = [];
  const body = { message };
  if (lane) body.lane = lane;
  if (model) body.model = model;
  if (sessionId) body.sessionId = sessionId;
  const handle = { events, controller, status: 0, headersJson: undefined, done: null };
  handle.done = (async () => {
    const res = await raw('/api/chat', { method: 'POST', body, repoId, signal: controller.signal });
    handle.status = res.status;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream')) {
      // Error path (4xx) returns JSON, not SSE.
      handle.headersJson = await res.json().catch(() => undefined);
      return;
    }
    await readSse(res, (e) => events.push(e));
  })();
  handle.waitFor = (pred, ms = 30000) => waitFor(() => events.find(pred), ms);
  return handle;
}

// Poll a predicate until truthy or timeout. Resolves the value or null.
export async function waitFor(fn, ms = 30000, step = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
