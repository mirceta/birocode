# Reduce the web UI's connection appetite

## Why

2026-08-25 incident: a Tools-lane save hung forever on the phone. Root cause was not
the server (handler finished in ms) but the browser's hard 6-connections-per-origin
HTTP/1.1 limit: every running agent dock holds its own long-lived
`GET /api/chat/stream` reader for the entire turn, and 20+ pollers (11 requests every
5 s phase-aligned in the steady state, ~21 in the worst realistic dock layout, many
with no visibility gating) fill the rest. New fetches then queue silently inside the
browser — "saving takes years", "Loading tool settings… forever". The limit itself is
browser-hardcoded and cannot be raised without TLS/HTTP-2.

## What changes

1. **One multiplexed chat stream** — a new `GET /api/chat/stream-multi` carries the
   events of ANY number of (repo, lane) run attachments over a single SSE connection,
   each event enveloped with its origin. The client attaches every conversation
   (dock tabs, project, harness, ask) through one shared hub connection instead of
   one reader per conversation. The legacy per-run `GET /api/chat/stream` stays, and
   the client falls back to it automatically if the multi endpoint is unavailable or
   repeatedly failing.
2. **Visibility gating for every steady-state poller** — all recurring dashboard
   pollers skip their tick while `document.hidden` (the pattern several already use),
   so a locked phone or a background tab generates near-zero traffic.

Out of scope (future change): consolidating the many 5 s pollers into one combined
status endpoint; TLS/HTTP-2.

## Capabilities

- `chat` (delta): multiplexed attachment requirement.
- `client-traffic` (new): the connection-budget rules the web UI must follow.

## Impact

- Server: `ChatController` + a new `ChatStreamMultiplexer` in `Services/Chat`
  (read-only composition over existing `RunSession.StreamAsync`; no change to run
  lifecycle, buffering, or the send path).
- Client: new `api/chatStreamHub.js`; `ChatContext.streamRun` reroutes through it;
  ~10 components gain a `document.hidden` guard on their poll tick.
- Risk: medium on the stream path (mitigated by the untouched legacy fallback and
  seq-dedup already in `makeEventHandler`); near-zero on the poller gating.
