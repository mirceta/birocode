# Design — reduce-connection-appetite

## Multiplexed stream

### Server

`GET /api/chat/stream-multi?subs=<urlencoded JSON>` where
`subs = [{"repoId":"…","lane":"builder","after":123}, …]` (≤ 32 entries).

- Sessions resolve via `RunSessionService.Get(repoId, lane)` — explicit ids, no
  `X-Repo-Id` / global-selection dependency (docks span repos).
- A new `ChatStreamMultiplexer.Merge(subs, ct)` pumps each session's existing
  `StreamAsync(after, ct)` into one merged channel. Every item is an envelope:
  - `{"repoId":r,"lane":l,"evt":<original event JSON>}` — a run event, embedded
    verbatim (string concat, no re-parse; the inner event keeps its own `seq`).
  - `{"repoId":r,"lane":l,"ctl":"none"}` — no session for that sub (the multi
    analogue of the single stream's 404).
  - `{"repoId":r,"lane":l,"ctl":"end"}` — that sub's replay+live stream completed.
- The response ends when every pump has completed (replay-only subs end
  immediately after replay). The client reopens when its subscription set changes
  or a new run appears — reconcile() already provides that signal.
- `RequestAborted` cancels all pumps; `RunSession` subscriber cleanup is the
  existing `finally` in `StreamAsync`.

### Client

New `api/chatStreamHub.js` — module singleton:

- `hubAttach({repoId, lane, getAfter, onEvent}) → {done, abort()}`. One shared
  `apiStreamGet('/chat/stream-multi?…')` connection serves all registered subs;
  registering/removing a sub aborts and reopens the connection (60 ms debounce)
  with each sub's **fresh** watermark from `getAfter()` — the seq-dedup in
  ChatContext's `makeEventHandler` absorbs any replay overlap.
- `done` resolves `'ended' | 'none' | 'aborted' | 'unsupported'`.
  `'unsupported'` fires on HTTP 404 (older server) or 5 consecutive connection
  failures — the caller then falls through to the untouched legacy per-run loop.
- The returned handle exposes `.abort()`, so `abortRefs.current[key]` keeps its
  existing contract (stopTo / resetConversation / tab-close all call `.abort()`).

`ChatContext.streamRun` becomes: try the hub when supported; on `'unsupported'`
run the exact legacy retry loop that exists today. No other ChatContext path
changes; `attachToRun`, `reconcile`, sends, and stops are untouched.

The send path (`POST /api/chat`) keeps its own per-turn stream: sends originate
from the operator's device one at a time, so at most ~2 connections total
(1 active send + 1 shared hub) replace today's N-per-running-agent.

## Poller visibility gating

Every recurring poller's tick starts with `if (document.hidden) return;`
(the pattern `ChatContext`/`TrafficPanel`/`FlagsContext` already use). Gated in
this change: Dashboard (runs+messages, autopilot/loops), Scoreboard,
AccountChips (all three probes), HostClock, AdminStatusTile, DockIdentityRows,
EventConsole, ProductFrame probe, DiscoverAppsPanel (status + events),
IdeasSyncBar. Pollers that already re-sync on `visibilitychange` need nothing
more; the others simply resume on their next visible tick (≤ one interval of
staleness after unlock, and `ChatContext`'s visibilitychange reconcile covers
the chat surface immediately).

## Rollback / compatibility

- Old client + new server: legacy endpoints untouched.
- New client + old server (rollback.ps1 case): hub gets 404 → `'unsupported'` →
  legacy path; UI behaves exactly as today.
