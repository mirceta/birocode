# Design — harness event feed (pilot)

## Context

This is a proof-of-concept for a future cross-machine setup (a collector service + app
on another computer that reads events from many harnesses and reacts). The pilot proves
the first link only: one harness publishes a `turn.ended` event over a read-only REST
feed, and an in-repo app consumes it. Keep it small; keep the envelope general.

## Key decisions

### 1. New harness-scoped feed, not a wider per-repo log

We add `HarnessEventFeed` rather than extend `RepoEventLog`.

- **Why not reuse `RepoEventLog`:** it is per-repo, and its spec
  (`agent-dock-event-console`) explicitly excludes agent/turn lifecycle ("Gateway
  internals are not logged"). A cross-harness collector wants **one stream per harness**,
  not one per repo.
- **What we reuse:** the *pattern* — in-memory ring buffer, monotonic `seq`, watermark
  read — which is already proven. Whether to extract a shared buffer primitive or just
  mirror the ~100 lines is left to implementation; mirroring is acceptable for a pilot.
- **Turn-ended is a harness-owned boundary,** not gateway internals: the harness itself
  launched the run and observes its terminal SSE. So publishing it does not violate the
  spirit of the per-repo exclusion; it just belongs on the harness feed.

### 2. Envelope shape (the general mechanism)

```
{ seq: int, at: long(ms), type: string, source: { repoId, repoName? }, data: object }
```

`turn.ended` payload (seeded type):

```
type: "turn.ended"
data: { sessionId, status: "done" | "error", costUsd?, numTurns? }
```

`type` is the extension point: future events (`run.started`, `tool.used`, `deploy.done`,
…) reuse the same envelope and the same read endpoint. Readers parse the envelope first
and switch on `type`.

### 3. Read contract

`GET /api/events?after=N` → `{ events: [...envelope], lastSeq }`.

- `after` default `-1` ⇒ full retained feed (matches the per-repo endpoint's semantics).
- Watermark polling only for the pilot; no WebSocket/SSE push yet (same envelope can be
  pushed later).
- Strictly read-only: a `GET` with no side effects. **No new action endpoint** is added
  anywhere in this change.

### 4. Where `turn.ended` is published

At the existing terminal point in `CliRunnerService.HandleResult` (the path that already
emits the SSE `done`/`error` for a run). Inject `HarnessEventFeed`; publish best-effort
inside a try/catch so a feed failure can never affect the run. Use data the harness
*already has* there (sessionId, error flag, cost, turn count) — no new agent
instrumentation, no extra gateway calls.

### 5. The pilot consumer app

- Build-less, self-contained static folder at the repo root (like `understanding-app/`,
  `homepage/`). Working name `events-app/` (final name settled in implementation).
- Served via the existing local-app mechanism. Default: a synthetic `kind:harness` app
  (like Understanding/Lab) so it needs no port and no operator config — settled when
  wiring `RepositoryRegistry` / `LocalProxyController`.
- Polls `GET /api/events?after=watermark`, advances the watermark, renders the stream.
- **Generic over the envelope:** lists whatever `type`s arrive (turn.ended highlighted),
  so it is also the test bed for future event types.
- Relative URLs only; obeys `docs/local-exposure-convention.md`.

## Open question deferred to the future task

How a **remote** collector authenticates to many harnesses. The feed sits behind
`PasswordAuthMiddleware`, so a remote reader needs a credential per harness (the
`X-Auth-Password` header works for tooling today). Designing that (per-harness tokens,
discovery, fan-in) is out of scope for the pilot but is the obvious next step.

## Risks

- **Low.** Additive: one service, one read-only endpoint, one best-effort publish call,
  one static app. No change to existing endpoints, the per-repo log, or auth. The only
  touch to a hot path is a guarded best-effort publish at turn end.
