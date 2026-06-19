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
  return fails.length;
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
