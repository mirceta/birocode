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
// Wire identity: every subscription gets a unique id, sent in the payload and
// echoed by the server on every envelope. Dispatch is an exact id lookup — an
// envelope can only reach the subscription whose watermark this connection
// actually carried. That is what makes two watchers of the SAME run safe: each
// has its own wire entry, its own replay, its own end signal. A sub registered
// while an older connection is still delivering receives NOTHING from it (its
// id was never in that payload) — it starts at the debounced reopen, with its
// watermark intact.
//
// hubAttach() resolves its `done` promise with:
//   'ended'       — that sub's run stream completed (the normal end)
//   'none'        — the server has no run for that sub (the 404 analogue)
//   'aborted'     — the caller aborted (stop, tab close, reset)
//   'unsupported' — multi endpoint missing (old server), rejected (400), or
//                   persistently failing; the caller falls back to the legacy
//                   per-run stream, and the hub stays off for this page life
//                   so mixed hub/legacy operation can't stack connections.
// The returned handle exposes .abort(), preserving the abortRefs contract in
// ChatContext (stopTo / resetConversation / tab cleanup all call .abort()).

const REOPEN_DEBOUNCE_MS = 60;
const RETRY_MS = 2000;
const MAX_FAILURES = 5;

const subs = new Map(); // wire id -> {repoId, lane, getAfter, onEvent, resolve}
let nextAttachId = 0;
let controller = null;
let reopenTimer = null;
let generation = 0;
let supported = true;
let failures = 0;

export function hubSupported() {
  return supported;
}

export function hubAttach({ repoId, lane = 'builder', getAfter, onEvent }) {
  const id = ++nextAttachId;
  // Normalize exactly like the server (ChatController.NormalizeLane), so the
  // echoed lane can never disagree with what we registered.
  const normLane = lane === 'ask' ? 'ask' : 'builder';
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const sub = { repoId, lane: normLane, getAfter, onEvent, resolve: resolveDone };
  subs.set(id, sub);
  scheduleReopen();
  return {
    done,
    abort() {
      if (subs.delete(id)) scheduleReopen();
      sub.resolve('aborted');
    },
  };
}

function scheduleReopen(delay = REOPEN_DEBOUNCE_MS) {
  clearTimeout(reopenTimer);
  reopenTimer = setTimeout(openNow, delay);
}

function settleAll(outcome) {
  for (const s of subs.values()) s.resolve(outcome);
  subs.clear();
}

async function openNow() {
  const gen = ++generation;
  if (controller) controller.abort(); // supersede the current connection
  if (subs.size === 0) { controller = null; return; }

  // One wire entry PER SUBSCRIPTION, each with its own id and watermark —
  // duplicate watchers of one run simply get parallel replays; no grouping,
  // no shared-minimum watermark.
  const payload = [...subs.entries()].map(([id, s]) => ({
    id, repoId: s.repoId, lane: s.lane, after: s.getAfter() || 0,
  }));
  const c = new AbortController();
  controller = c;
  const parse = createSseParser((env) => {
    const sub = subs.get(env.id);
    if (!sub) return; // aborted mid-flight, or an id this hub never issued
    if (env.ctl === 'none' || env.ctl === 'end') {
      subs.delete(env.id);
      sub.resolve(env.ctl === 'end' ? 'ended' : 'none');
      // No reopen here: other subs keep riding this same connection.
      return;
    }
    if (env.evt) {
      // One conversation's broken handler must never kill the shared
      // connection (or starve other subscriptions) — isolate it.
      try { sub.onEvent(env.evt); } catch { /* conversation-level failure */ }
    }
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
    if (err.status === 404 || err.status === 400) {
      // 404: old server without the endpoint (right after a rollback).
      // 400: the server rejected our payload — a contract bug; don't loop on it.
      supported = false;
      settleAll('unsupported');
      return;
    }
    failures += 1;
    if (failures >= MAX_FAILURES) {
      // Persistently failing: hand EVERY conversation to the legacy path and
      // keep the hub off for the rest of this page's life — a half-evicted
      // mixed mode would stack legacy sockets under new hub connections.
      supported = false;
      settleAll('unsupported');
      return;
    }
    if (gen === generation && subs.size > 0) scheduleReopen(RETRY_MS);
  } finally {
    if (controller === c) controller = null;
  }
}
