## Context

"Discover local apps" (capability `discover-local-apps`) is a per-repo, read-only
agent scan triggered from a dock's button. Today the whole thing is request-bound:

- `LocalAppsController.Discover(CancellationToken ct)` receives `ct ==
  HttpContext.RequestAborted` and threads it down `DiscoverAsync(repo.Path, ct)`
  → `RunClaudePrompt(request, ct)` → into the `claude` CLI run. A browser refresh
  aborts the fetch, so `ct` cancels the still-running agent scan.
- The result is returned synchronously and stored only in `PinnedAgent.jsx`
  local `useState` (`discovery`, `discovering`). Unmount (refresh) drops it.
- Every call reaches the ClaudeMonitor gateway under the same app name
  `"claudeweb-structured-ask"` (the `StructuredAskRunner` default). The gateway
  builds its response metadata via `FindLatestRecord(request.App)` =
  highest-`CallNumber` record for that name — so concurrent calls can swap
  metadata (tokens/cost/duration/call number).

The harness already solved the request-bound problem for chat with
`RunSessionService` (backend-owned runs, seq-buffered, reattach via
`?after=N`). Discovery is strictly simpler: one-shot, returns a typed JSON
report, no streaming log. So we adapt the *pattern*, not the machinery.

## Goals / Non-Goals

**Goals:**
- A browser refresh (or any disconnect) never cancels an in-flight discovery and
  never wastes the agent call.
- A dock that (re)loads can reattach: see a running scan's spinner, or pick up a
  result/error that landed while it was away — without re-running the scan.
- Concurrent discoveries report their own per-call metadata, never a sibling's.
- No change to the discovered-apps payload, the read-only policy, or
  single-repo-per-call scoping.

**Non-Goals:**
- No streaming/progress events for discovery (it stays one-shot; only
  running/done/error states are exposed).
- No persistence of discovery state across a harness restart (in-memory is
  sufficient; a restart simply means "no recent discovery").
- No change to the discovery prompt, schema, retry, or JSON-isolation logic.
- Not addressing Max-plan throttling under heavy concurrency (separate concern;
  the existing API fallback still applies).

## Decisions

### 1. Backend-owned per-repo discovery registry (in-memory)

Add a `LocalAppDiscoveryJobs` service (singleton) holding a
`ConcurrentDictionary<string /*repoId*/, DiscoveryJob>`. A `DiscoveryJob` carries
`Status (Running|Done|Error)`, `Result` (the typed apps list on success),
`Error`, `StartedAt`, `FinishedAt`, and the backing `Task`.

- `StartOrJoin(repoId, path)`: if a job for `repoId` is `Running`, return it;
  otherwise create one, kick off `DiscoverAsync` on a background task, and store
  it. This satisfies "only one discovery per repository at a time" and the
  join-existing scenario.
- The background task runs with a cancellation token that is **independent of any
  request** (the job's own `CancellationTokenSource`, effectively never
  cancelled in v1). This is the core fix for disconnect-kill.

*Alternative considered:* reuse `RunSessionService` directly. Rejected — it's
built around seq-numbered streaming event buffers for chat turns; discovery has
no stream and a different result shape. Borrow the ownership/reattach idea, keep
a purpose-built, smaller store.

### 2. Endpoints: start is fire-and-poll, status is reattach

- `GET /api/local-apps/discover` (existing route) becomes start-or-join: it
  registers/joins the job and returns the current state immediately (running, or
  the just-finished result). It no longer blocks on `RequestAborted` for the run
  itself — even if the client aborts, the job lives on.
- `GET /api/local-apps/discover/status` returns the current `DiscoveryJob` state
  for the caller's repo (resolved by `X-Repo-Id`/`?repo=` like every per-repo
  endpoint): `{ status, apps?, error?, startedAt, finishedAt }`.

*Decision:* keep the existing route's shape backward-compatible — on a completed
job it still returns `{ repoId, repoName, apps }`; it additionally may return a
`running` status when a scan is still in flight.

### 3. Frontend: reattach-on-mount + poll-while-running

`PinnedAgent.jsx` stops treating discovery as fire-and-forget local state:

- On mount (and on repo change), call `/local-apps/discover/status` for the
  dock's repo. If `running`, show the spinner and start polling; if `done`/`error`,
  render that result/error.
- The Discover button calls the start endpoint, then polls status until terminal,
  reusing the existing dock-poll cadence (~5s) rather than a long-held request.
- Result display is driven by the server state, so a refresh re-derives it from
  the backend instead of losing it.

### 4. Per-call gateway identity for correct concurrent metadata

Give each discovery call a distinct identity so the gateway resolves *its* record.
Preferred: pass a unique app name / correlation id per call (e.g.
`claudeweb-structured-ask#<callId>`) from `StructuredAskRunner` through
`ClaudeMonitor.Client` to the gateway, and have the gateway match the response
record by that identity instead of `FindLatestRecord(app)`.

*Alternative considered:* have the gateway return the metadata inline in the
run's own response (no post-hoc record lookup at all). Cleaner long-term but a
larger gateway-contract change; the correlation-id match is the minimal fix that
removes the cross-wiring. Final mechanism pinned during apply against the actual
`EmbeddedApi`/`Client` surface.

## Risks / Trade-offs

- **In-memory state lost on harness restart** → acceptable: a restart just means
  "no recent discovery"; the dock falls back to idle and the user can re-run.
- **Unbounded/forgotten jobs leak memory** → keep at most one job per repo
  (overwrite on next start) and store only the latest result; no historical list.
- **A truly stuck CLI run can't be cancelled by the user in v1** (we removed the
  only cancellation source) → mitigate with the existing per-run timeout in the
  CLI runner; a dedicated cancel endpoint is out of scope and can be added later.
- **Gateway identity change could affect other callers** of the shared gateway →
  scope the correlation-id match additively so a missing id still falls back to
  the current `FindLatestRecord` behavior for non-discovery callers.
- **Poll vs. long-poll** → simple interval polling is chosen for parity with the
  existing dock poll and to avoid holding connections; the cost is up to one
  poll interval of latency before a finished result shows.

## Migration Plan

Additive, no data migration. Ship behind the existing `localAppDiscovery`
Advanced-mode feature flag (unchanged). The existing `GET
/api/local-apps/discover` stays backward-compatible. Verify on an isolated
preview port with Playwright (refresh-mid-scan reattaches; concurrent
discoveries report distinct metadata) before the normal deploy cycle. Rollback
is a straight revert — no persisted state to undo.

## Open Questions (resolved during apply)

- **Per-call identity mechanism — RESOLVED: unique app name (Option A).**
  Investigation of the real gateway showed `EmbeddedApi.FindLatestRecord(app)`
  keys purely on `ClaudeCallRecord.AppName`, which is set from `request.App`. So
  giving each call a unique app name (`claudeweb-structured-ask#<GUID>` in
  `StructuredAskRunner`) makes "latest record for this app" unambiguously the
  call's own — fixing the cross-wiring with **zero edits to the
  `ClaudeMonitor` gateway/client** (a separate `birokrat-ai-platform` repo and a
  separately-deployed `:5123` process shared by all callers). This keeps the
  change in-repo with a clean single-repo revert. The rejected alternative
  (explicit correlation id resolved in the gateway) was cleaner for the gateway's
  stats but required a cross-repo edit + gateway redeploy. Trade-off accepted: the
  gateway's in-memory `_callsByApp` stats dict and dashboard gain one
  `#<id>`-suffixed entry per discovery call (minor for a low-volume feature).
- **Start endpoint shape — RESOLVED: `200` with a status body.** Both
  `discover` and `discover/status` return the same `{ repoId, repoName, status,
  apps?, error?, startedAt?, finishedAt? }` body (status ∈ running|done|error|idle),
  which keeps `PinnedAgent` handling uniform and the completed shape
  (`{ repoId, repoName, apps }`) backward-compatible.
