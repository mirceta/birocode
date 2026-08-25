import { apiStreamGet } from './client';
import { createSseParser } from '../components/chat/sseParser';

// Shared multiplexed chat-stream hub (openspec reduce-connection-appetite).
//
// Every conversation used to hold its own long-lived GET /api/chat/stream
// reader — with a few running docks that alone wedged the browser's hard
// 6-connections-per-origin HTTP/1.1 limit. This module keeps ONE connection to
// GET /api/chat/stream-multi for ALL attachments: subscriptions register here,
// and any change to the subscription set aborts and reopens the shared
// connection (debounced) with each sub's fresh watermark from getAfter().
// Event replay across reopens is absorbed by ChatContext's seq dedup.
//
// hubAttach() resolves its `done` promise with:
//   'ended'       — that sub's run stream completed (the normal end)
//   'none'        — the server has no run for that sub (the 404 analogue)
//   'aborted'     — the caller aborted (stop, tab close, reset)
//   'unsupported' — multi endpoint missing (old server) or persistently
//                   failing; the caller falls back to the legacy per-run stream
// The returned handle exposes .abort(), preserving the abortRefs contract in
// ChatContext (stopTo / resetConversation / tab cleanup all call .abort()).

const REOPEN_DEBOUNCE_MS = 60;
const RETRY_MS = 2000;
const MAX_FAILURES = 5;

const subs = new Map(); // key -> {repoId, lane, getAfter, onEvent, resolve}
let controller = null;
let reopenTimer = null;
let generation = 0;
let supported = true;
let failures = 0;

export function hubSupported() {
  return supported;
}

export function hubAttach({ repoId, lane = 'builder', getAfter, onEvent }) {
  const key = `${repoId}|${lane}`;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const sub = { repoId, lane, getAfter, onEvent, resolve: resolveDone };
  subs.set(key, sub);
  scheduleReopen();
  return {
    done,
    abort() {
      if (subs.get(key) === sub) {
        subs.delete(key);
        scheduleReopen();
      }
      sub.resolve('aborted');
    },
  };
}

function scheduleReopen() {
  clearTimeout(reopenTimer);
  reopenTimer = setTimeout(openNow, REOPEN_DEBOUNCE_MS);
}

function settleAll(outcome) {
  for (const s of subs.values()) s.resolve(outcome);
  subs.clear();
}

async function openNow() {
  const gen = ++generation;
  if (controller) controller.abort(); // supersede the current connection
  if (subs.size === 0) { controller = null; return; }

  const payload = [...subs.values()].map((s) => ({
    repoId: s.repoId, lane: s.lane, after: s.getAfter() || 0,
  }));
  const c = new AbortController();
  controller = c;
  const parse = createSseParser((env) => {
    const sub = subs.get(`${env.repoId}|${env.lane || 'builder'}`);
    if (!sub) return; // late event for a sub aborted mid-flight
    if (env.ctl === 'none' || env.ctl === 'end') {
      subs.delete(`${env.repoId}|${env.lane || 'builder'}`);
      sub.resolve(env.ctl === 'end' ? 'ended' : 'none');
      // No reopen here: other subs keep riding this same connection.
      return;
    }
    if (env.evt) sub.onEvent(env.evt);
  });

  try {
    await apiStreamGet(`/chat/stream-multi?subs=${encodeURIComponent(JSON.stringify(payload))}`, parse, {
      signal: c.signal,
    });
    // Server closed cleanly (every sub it knew of ended). Any sub still
    // registered raced in after the request was built — reconnect for it.
    failures = 0;
    if (gen === generation && subs.size > 0) scheduleReopen();
  } catch (err) {
    if (err.name === 'AbortError') return; // superseded by a newer openNow
    if (err.status === 404) {
      // Old server without the multi endpoint (e.g. right after a rollback):
      // permanently fall back to the legacy per-run streams.
      supported = false;
      settleAll('unsupported');
      return;
    }
    failures += 1;
    if (failures >= MAX_FAILURES) {
      failures = 0;
      settleAll('unsupported'); // callers use the legacy path for these runs
      return;
    }
    if (gen === generation && subs.size > 0) reopenTimer = setTimeout(openNow, RETRY_MS);
  } finally {
    if (controller === c) controller = null;
  }
}
