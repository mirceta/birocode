// Generic API client for Claude Web.
//
// Auth (plans/auth-login.md): the session token lives in an HttpOnly cookie
// set by POST /api/auth/login, so the browser attaches it to every same-origin
// fetch automatically — no password handling here. Feature modules never
// re-handle auth; a 401 means "not logged in" (the App-level gate handles it).

import { readTabState, writeTabState } from './viewState';

export const REPO_KEY = 'claudeweb_repo';

// Pre-session-auth versions kept the password in localStorage — purge it.
try {
  localStorage.removeItem('claudeweb_pw');
} catch {
  /* private mode */
}

// The id of the repository the user has selected. Sent on every request as
// X-Repo-Id so the backend scopes chat/files/history to the chosen project.
// The selection is part of a tab's "space" and follows its active agent, so it
// is per-browser-tab (sessionStorage, seeded once from localStorage) — two tabs
// on one machine don't clobber each other's project. See viewState.js.
let _repoId = readTabState(REPO_KEY) || '';

export function getRepoId() {
  return _repoId;
}

export function setRepoId(id) {
  _repoId = id || '';
  writeTabState(REPO_KEY, _repoId);
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

// `overrideRepoId` lets Dock tabs target a specific repo regardless of the
// global selection. When omitted, falls back to the global getRepoId().
function authHeaders(extra = {}, overrideRepoId) {
  const headers = { ...extra };
  const repoId = overrideRepoId || getRepoId();
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

export async function apiGet(path, { repoId } = {}) {
  const res = await fetch(url(path), { headers: authHeaders({}, repoId) });
  return handle(res);
}

// GET /api/<path> returning a Blob (e.g. screen snapshots). Auth via the
// usual headers, which an <img src> could not send.
export async function apiGetBlob(path, { repoId } = {}) {
  const res = await fetch(url(path), { headers: authHeaders({}, repoId) });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  return res.blob();
}

export async function apiPost(path, body, { repoId } = {}) {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }, repoId),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res);
}

export async function apiPut(path, body, { repoId } = {}) {
  const res = await fetch(url(path), {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }, repoId),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res);
}

export async function apiPatch(path, body, { repoId } = {}) {
  const res = await fetch(url(path), {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }, repoId),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(res);
}

export async function apiDelete(path, { repoId } = {}) {
  const res = await fetch(url(path), {
    method: 'DELETE',
    headers: authHeaders({}, repoId),
  });
  return handle(res);
}

// Upload a file via multipart/form-data. Returns the parsed JSON response.
export async function apiUpload(path, file, { repoId } = {}) {
  const form = new FormData();
  form.append('file', file);
  const rid = repoId || getRepoId();
  const res = await fetch(url(path), {
    method: 'POST',
    headers: { 'X-Repo-Id': rid },
    body: form,
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
    headers: authHeaders({ 'Content-Type': 'application/json' }, options.repoId),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
  });
  return readStream(res, onEvent);
}

// Streaming GET helper: reattaches to a detached backend run
// (GET /api/chat/stream?after=N). Same chunk contract as apiStream.
export async function apiStreamGet(path, onEvent, options = {}) {
  const res = await fetch(url(path), {
    headers: authHeaders({}, options.repoId),
    signal: options.signal,
  });
  return readStream(res, onEvent);
}

async function readStream(res, onEvent) {
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
