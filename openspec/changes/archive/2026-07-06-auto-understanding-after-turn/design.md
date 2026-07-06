# Design: auto-understanding-after-turn

## Context

"Ask for understanding" (spec `ask-for-understanding`) is a manual dock button:
`PinnedAgent.jsx` POSTs `/api/understanding/ask` with the builder lane's `sessionId`;
`UnderstandingJobs` (latest-only, per-repo, backend-owned) forks the conversation via Claude
Monitor snapshot-resume (`UnderstandingAsk`) and rebuilds `understanding-app/`.

Chat turns are backend-owned `RunSession`s (`RunSessionService`). A turn ends when
`RunSession.Complete()` runs — but Complete() is invoked from **three** call sites
(`ChatController` detached-run finally, `AutopilotService` auto-send, `AutopilotService` loop
resend), all with the same shape. The session already knows its repo, lane, terminal status
("done" vs "error"), and the Claude `SessionId` sniffed from stream events — exactly the inputs
the manual button provides.

Constraint: the chat module must not take a compile-time dependency on the understanding module
(module conventions, `plans/INTEGRATION.md`) — modules plug in via DI extensions and should stay
one-directional.

## Goals / Non-Goals

**Goals:**
- Every completed dock agent turn (builder lane, status "done") automatically refreshes the
  repo's Understanding app, when the repo has opted in.
- One choke point for "turn ended" — no per-call-site wiring, so future run starters (new
  autopilot modes) inherit the trigger for free.
- Never lose the newest turn to an in-flight run, and never stack more than one pending run.

**Non-Goals:**
- No change to what the understanding run does (prompt, fork mechanics, convention doc
  resolution) — only *when* it starts.
- No per-turn filtering intelligence ("only interesting turns") — that's a future concern.
- No ask-lane triggering: the ask lane is a read-only side conversation; the Understanding app
  explains the builder conversation, matching the manual button's `tab.sessionId`.
- No global (all-repos) switch; the setting is per repo.

## Decisions

### 1. Turn-end hook: an event on `RunSessionService`, subscribed by the understanding module

`RunSessionService` creates every `RunSession` (in `TryBeginRun`), so it installs a completion
callback on the session at creation; `RunSession.Complete()` invokes it once (inside the
existing single-transition guard) with `(repoId, lane, status, sessionId)`. The service surfaces
this as a plain .NET event `RunCompleted`. A new `AutoUnderstandingTrigger` service in the
understanding module subscribes at startup (hosted-service or DI activation in
`UnderstandingModuleExtensions`), keeping the dependency direction understanding → chat.

*Alternative rejected:* calling `UnderstandingJobs` from the three `Complete()` call sites —
three copies of the same wiring, and `ChatController`/`AutopilotService` would each grow an
understanding dependency; the next run starter would silently miss the trigger.

*Callback runs fire-and-forget on the thread that completes the run;* the trigger body only
reads the flag and calls the jobs registry (both non-blocking), so no run-completion latency is
added. Exceptions are caught and logged — a broken trigger must never fail a chat turn.

### 2. Trigger conditions: builder lane + "done" + session id + flag enabled

The trigger fires only when ALL hold: lane is `builder`; terminal status is `done` (a stopped,
crashed, or `is_error` run finalizes as "error" — explaining a failed turn is noise); the
session captured a `SessionId` (no transcript = nothing to fork — `UnderstandingAsk` would just
fail); and the repo's auto-understanding setting is on. Recursion is structurally impossible:
the understanding run executes via the Claude Monitor gateway, never through
`RunSessionService`, so it can't complete a `RunSession`.

### 3. Coalescing in `UnderstandingJobs`: one pending "latest", chained on completion

Manual `StartOrJoin` semantics are untouched (running → join; terminal → replace). The auto
path uses a new method (e.g. `EnqueueLatest(repoId, path, sessionId)`): if the repo has no
running job it starts one immediately (same as today); if a job IS running it overwrites the
repo's single pending slot with this newest session, and when the running job reaches its
terminal state it immediately starts the pending one (continuation inside the job's existing
background task). Intermediate turns are dropped by design — only the newest matters, since a
fork always explains the transcript's latest turn anyway.

*Alternative rejected:* a queue — every queued run after the first would rebuild the app for an
already-stale turn at real Claude cost.

*Note:* a pending auto-run and a manual press can race; both funnel through the same per-repo
job slot, so the worst case is one redundant rebuild, never a corrupted state.

### 4. Setting storage: a field on `RepositoryConfig`, endpoints on `UnderstandingController`

`RepositoryConfig` gains `bool AutoUnderstanding` (default `false`; absent in existing
`repositories.json` entries → false), mutated through `RepositoryRegistry` like
`Visibility`/`LocalApps`. The API lives with the feature:
`GET /api/understanding/auto` → `{ enabled }` and `POST /api/understanding/auto { enabled }`,
both repo-scoped via the standard `X-Repo-Id` resolution. Persisted server-side because the
trigger fires with no browser attached (detached runs, autopilot loops overnight).

*Alternative rejected:* device-local (localStorage) — the whole point is firing without a
client; *also rejected:* default ON — every turn spawns a paid agentic run, so enabling is an
explicit choice (and existing repos must not start burning tokens on deploy).

### 5. Dock UI: a toggle beside the existing button, same capability gate

`PinnedAgent.jsx` renders a small auto toggle (checkbox/switch) next to "Ask for understanding",
gated by the existing `understandingAgent` capability (Advanced-only) — no new capability map
entry. It loads state from `GET /api/understanding/auto` on mount/repo-change and flips it via
POST. Auto-run activity needs no new UI: the existing status poll + Console lane
(`op="understanding"`) already surface running/done/error; the dock's reattach-on-mount already
picks up a run it didn't start. The frontend adds a poll nudge: when the builder lane's chat
stream reports `done` and auto is on, start the existing understanding status poll so the
spinner appears without a manual refresh.

## Risks / Trade-offs

- [Every turn costs a Claude run once enabled] → default off, per-repo, one-click off; Console
  events keep each auto-run visible/auditable.
- [Turn cadence faster than build cadence starves the app of freshness] → coalescing keeps at
  most one pending run and always the newest session; latest-only semantics are preserved.
- [Event handler exceptions on the run-completion path] → trigger body is fully try/caught and
  logged; chat turn completion can never be blocked or failed by the trigger.
- [Shared `repositories.json` with the live :5099 process during tests] → tests that flip the
  auto flag must restore it (same discipline as `Visibility` — see dock test-isolation notes).
- [Self-Development: on birocode the agent overwrites `understanding-app/` every turn, dirtying
  the worktree] → acceptable and already true for manual runs; the flag defaults off.

## Migration Plan

Additive only. `AutoUnderstanding` absent in existing `repositories.json` → deserializes false
(off). No endpoint or schema removals; rollback = deploy previous build (the extra JSON field
is ignored by old code).

## Open Questions

- None blocking. (Deferred idea: a quiet-period debounce — e.g. skip auto-run if the next user
  message arrives within N seconds — left out until real usage shows it's needed.)
