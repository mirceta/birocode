## Why

The harness has been steadily moving work to be **backend-owned**: local-app
discovery now runs as a refresh-resilient server job, apps are launched and
port-checked by the backend, autopilot intercepts and the loop engine drive
repos on their own. Each of these is *something the harness does to a repository*
— but from the dock there is **no window into it**. The End User clicks
"Discover", the button spins, and whether the backend is waiting on the agent
gateway, has come back with a result, or has rendered apps to the UI is all
invisible. When several such operations exist (discover, Run an app, Check a
port), there is no single place that narrates "what the harness is doing for
this repository right now, and what just came of it".

This change adds that window: a per-repo **Event Console** in the agent dock.

The scope is deliberately **shallow and harness-owned**. The console logs the
**boundary our application controls** — that an operation was *invoked* and we
are *awaiting* a response, then that the response *returned* and *what the
harness did with it* (e.g. discovery rendered the found apps to the UI). It does
**not** report what the ClaudeMonitor gateway does internally (which tools the
sub-agent called, its tokens/steps) — that is the gateway's own domain and stays
a black box. We start shallow and deepen only if a real need appears.

## What Changes

- **New capability — a per-repo event log.** A backend service holds, per
  repository, a seq-numbered append-only ring of small lifecycle events
  (`{ seq, at, op, phase, title, detail }`). It mirrors the proven
  `RunSessionService` buffer shape (monotonic seq, soft cap, `?after=N`
  watermark) but is simpler: append-only, no streaming channel required for the
  first slice.
- **Instrument the existing discovery-feature operations** to emit boundary
  events into that log — the three things we just built:
  - **Discovery**: `started` ("waiting for the agent gateway…") → `done`
    ("returned N apps — rendered to the dock") / `error`.
  - **Run an app**: `started` ("launching <app> on :<port>…") → `done`
    ("launch issued").
  - **Check a port**: `started` ("probing :<port>…") → `done` ("port live" /
    "not listening").
- **Expose the log** via a poll endpoint (`GET /api/repos/{repoId}/events?after=N`)
  returning events after the caller's watermark plus the current high-water seq —
  the same reattach-by-watermark contract the dock already uses for discovery
  status and chat reattach.
- **New Console lane in the agent dock**, a sibling to Builder / Ask / Files in
  `PinnedAgent.jsx`. It is scoped **per repository** (background jobs are already
  keyed per repo, so two docks on the same repo see the same console), polls at
  the existing ~5s dock cadence, and renders the events as a running log.
- **Defaults Advanced** per the UI-modes convention (new features default to
  Advanced; the End User's Basic mode does not get the Console lane unless asked).

## Capabilities

### New Capabilities
- `agent-dock-event-console`: a per-repository, harness-owned lifecycle event log
  surfaced as a Console lane in the agent dock — records that harness-owned
  background operations were invoked, are awaiting a response, and what the
  harness did with the result; does not expose agent-gateway internals.

### Modified Capabilities
<!-- none — discovery/run/check are instrumented as emit sources, but their own
     contracts (payload shapes, read-only policy, per-repo scoping) are unchanged -->

## Impact

- **Backend (`ClaudeWeb.App`)**: new `RepoEventLog` singleton (per-repo
  seq-numbered ring); a new events endpoint (likely on a `ReposController` or a
  small `RepoEventsController`); emit calls added at the boundaries in
  `LocalAppsController` / `LocalAppDiscoveryJobs` (discovery start/done/error),
  and in `LocalAppRunner` callers (run launch, port check) — instrumentation
  only, no behavioural change to those operations.
- **Frontend (`client/`)**: new Console lane button + render path in
  `PinnedAgent.jsx`; a small `EventConsole` component that polls
  `/api/repos/{repoId}/events?after=N` and renders the log; new i18n keys
  (`en.json` / `tr.json`); `dashboard.css` styles; capability-map entry in
  `UiModeContext.jsx` as `'advanced'`.
- **Understanding app**: refresh `understanding-app/index.html` to show the
  event-log flow (emit at the boundary → per-repo ring → dock polls `?after=N`)
  per the repo convention.
- **No change** to discovery/run/check payload contracts, the read-only scan
  policy, per-repo scoping, or any existing API; the gateway is untouched.

## Out of scope (explicit, for a later slice if needed)

- Tool-by-tool detail of what the agent did inside the gateway (would require
  threading tool-use events out of ClaudeMonitor — a separate, larger change).
- Autopilot-intercept and loop-engine events feeding the same console (the log
  is built source-agnostic so these can emit later without a rewrite).
- Server-Sent-Events transport (polling first; graduate to SSE only if the live
  cadence feels laggy).
- Cross-session persistence of the log (in-memory ring only; lost on restart).
