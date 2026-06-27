## Why

"Discover local apps" wastes an agent call every time the End User refreshes the
Chrome page mid-scan: the discovery is tied to the HTTP request and the result
lives only in browser component state. A refresh both **cancels the in-flight
agent scan** (the browser aborts the fetch, `HttpContext.RequestAborted` fires,
and that token is threaded straight into the `claude` CLI run) and **discards any
result** that did complete (it was only ever held in `PinnedAgent.jsx` local
state). Separately, when several agents discover at once, the metadata reported
back (call number, tokens, cost, duration) can be cross-wired between
concurrent calls — they all hit the ClaudeMonitor gateway under one shared app
name, and the gateway resolves the response record by "latest record for that
app name".

## What Changes

- Make discovery **backend-owned**: a per-repo server-side job registry holds
  `{ status: running | done | error, result, startedAt, finishedAt }` for the
  most recent discovery of each repo. This mirrors the detached-chat
  `RunSessionService` pattern, but simpler — discovery is one-shot and returns a
  typed JSON report, not a streaming event log.
- **Stop the disconnect-kill**: the discovery CLI run is no longer cancelled by
  `HttpContext.RequestAborted`. A browser refresh (or any client disconnect)
  leaves the scan running to completion so the agent call is never wasted.
- **Reattach on load**: a status endpoint lets the dock, on mount, rejoin an
  in-flight scan (show the spinner) or pick up a result that completed while the
  page was away (show the cached apps) — same shape as the existing 5s dock poll.
- **Fix concurrent metadata cross-wiring**: give each discovery call a distinct
  gateway identity (per-call app name or correlation id) so the response record
  it gets back is its own, never a sibling concurrent call's.
- The discovery payload contract (`{ name, port, folder, evidence }`), the
  read-only scan policy, and single-repo-per-call scoping are **unchanged**.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `discover-local-apps`: discovery becomes backend-owned and survives client
  disconnect (no longer cancelled by request abort), exposes its status for
  reattach, and reports per-call metadata that is correct under concurrency.

## Impact

- **Backend (`ClaudeWeb.App`)**: `LocalAppsController` (stop passing
  `RequestAborted` into the run; add a status/reattach endpoint); a new per-repo
  discovery-job registry service; `StructuredAskRunner` / `LocalAppDiscoveryAsk`
  to carry a per-call gateway identity.
- **ClaudeMonitor gateway** (`EmbeddedApi.cs`): response-record lookup must key
  on a per-call identity/correlation id rather than `FindLatestRecord(app)`.
- **Frontend (`client/`)**: `PinnedAgent.jsx` discovery state moves from
  fire-and-forget local state to a reattach-on-mount + poll-while-running model.
- **Understanding app**: add/refresh `understanding-app/index.html` for the
  backend-owned discovery flow (per repo convention).
- No change to the discovered-apps JSON shape, the read-only policy, or
  per-repo scoping; no breaking API change for existing callers of
  `GET /api/local-apps/discover`.
