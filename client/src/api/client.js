// Generic API client for Claude Web.
//
// Every request to /api/* is automatically authenticated: the backend's
// PasswordAuthMiddleware protects all /api routes and expects the shared
// password in the `X-Auth-Password` header (see plans/INTEGRATION.md section 4).
// The password is stored in localStorage under PW_KEY and injected here so that
// feature modules (M5 chat, M6 files, M7 save/history) never re-handle auth.

export const PW_KEY = 'claudeweb_pw';
export const REPO_KEY = 'claudeweb_repo';

export function getPassword() {
  return localStorage.getItem(PW_KEY) || '';
}

export function setPassword(pw) {
  localStorage.setItem(PW_KEY, pw);
}

export function clearPassword() {
  localStorage.removeItem(PW_KEY);
}

// The id of the repository the user has selected. Sent on every request as
// X-Repo-Id so the backend scopes chat/files/history to the chosen project.
// Read live from localStorage on each request so a repo switch takes effect
// immediately without re-creating the api helpers.
export function getRepoId() {
  return localStorage.getItem(REPO_KEY) || '';
}

export function setRepoId(id) {
  if (id) localStorage.setItem(REPO_KEY, id);
  else localStorage.removeItem(REPO_KEY);
}

// Thrown for any non-2xx response. Carries the HTTP status so callers can
// special-case 401 (wrong password) without parsing message strings.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function authHeaders(extra = {}) {
  const headers = { 'X-Auth-Password': getPassword(), ...extra };
  const repoId = getRepoId();
  if (repoId) headers['X-Repo-Id'] = repoId;
  return headers;
}

async function handle(res) {
  if (res.ok) {
    const ctype = res.headers.get('content-type') || '';
    if (ctype.includes('application/json')) return res.json();
    return res.text();
  }
  let detail = '';
  try {
    detail = await res.text();
  } catch {
    /* ignore */
  }
  const msg = detail || `Request failed (${res.status})`;
  throw new ApiError(msg, res.status);
}

// GET /api/<path>. `path` may be given with or without a leading slash.
function url(path) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean.startsWith('/api') ? clean : `/api${clean}`;
}

export async function apiGet(path) {
  const res = await fetch(url(path), { headers: authHeaders() });
  return handle(res);
}

export async function apiPost(path, body) {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res);
}

// Streaming POST helper for M5 (chat). Sends a JSON body and reads the
// response as a stream, invoking `onEvent(chunk)` with each decoded text
// chunk as it arrives. Resolves when the stream ends. The caller is
// responsible for parsing the chunk format (e.g. SSE `data:` lines).
//
// `options.signal` (an AbortSignal) lets the caller cancel an in-flight
// stream. Returns the full concatenated text for convenience.
export async function apiStream(path, body, onEvent, options = {}) {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }

  if (!res.body) {
    // No stream support: fall back to reading the whole body once.
    const text = await res.text();
    if (text && onEvent) onEvent(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) {
        full += chunk;
        if (onEvent) onEvent(chunk);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return full;
}
