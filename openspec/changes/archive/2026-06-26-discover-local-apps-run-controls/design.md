## Context

`discover-local-apps` is a per-repo, read-only agent scan triggered from a dock.
It returns a typed `{ name, port, folder, evidence }` per app and lets the operator
register one as a Local-tab app. The capability already locates each app's server
(the listen/bind call), so it has, in hand, the information needed to *start* the
app — and the harness can trivially observe whether the app's loopback port is
currently accepting connections. This change adds those two affordances (start +
live running check) plus the static `startCommand` the scan can extract, without
touching the read-only scan policy or per-repo scoping.

## Goals / Non-Goals

**Goals:**
- The scan additionally reports each app's start command (best-effort, optional).
- The dock shows whether each discovered app is running *right now*, accurately.
- The operator can start a discovered app from the dock and confirm it came up.
- Additive and backward-compatible: existing `discover[/status]` payload fields
  and callers are unaffected; new fields are optional.

**Non-Goals:**
- No Stop/kill of a started app (no PID tracking) — deferred. The operator stops
  apps the usual way for now.
- No change to the scan's read-only policy, retry/JSON-isolation, single-repo
  scoping, or the backend-owned job model from `discover-local-apps-resilient`.
- No persistence of run/launch state across a harness restart.

## Decisions

### 1. `running` is harness-computed at fetch time, never baked into the scan

A scan takes ~30–60s; whether an app is up changes second to second. Baking a
running flag into the (slow, cached) scan result would show stale truth. Instead
the controller computes `running` per app when it projects the status body, by
checking the app's port for a TCP listener
(`IPGlobalProperties.GetActiveTcpListeners()` — pure in-process, no shell, no
network). So `discover/status` carries a `running` flag that is fresh as of the
fetch, and the **Check** button is simply "re-fetch status" (recompute liveness).

*Alternative considered:* have the discovery agent report `running`. Rejected —
it freezes a runtime fact at scan time; it would be wrong by the time the operator
sees it, and the agent would still have to shell out to check, breaking the
read-only policy.

### 2. `startCommand` is a static field on the typed report

Add `startCommand` to `LocalAppFinding`, rendered into the prompt's output schema
like every other field (single source of truth). The prompt asks the agent to
report the command that launches the app, read from the same file where the port
is bound (e.g. `node serve.mjs`, `powershell -File serve.ps1`). It is **optional**
— an empty string when the agent can't determine it — so the existing validation
(non-empty name/folder, in-range port) is unchanged and a missing command never
fails the parse. The UI disables Run when it's empty.

### 3. Run resolves the command server-side from the scan, by port

`POST /api/local-apps/run { port }` resolves the caller's repo
(`X-Repo-Id`/`?repo=`), reads that repo's most recent `DiscoveryJob` result, finds
the finding whose `port` matches, and launches its stored `startCommand` in
`Path.Combine(repo.Path, finding.Folder)`. The client supplies only the port; the
command executed is the one discovery extracted and the harness stored — never an
arbitrary string off the wire. If there is no completed scan, no matching finding,
or the finding has no `startCommand`, the endpoint returns a `400` with an explicit
reason. (Authorization is the harness's existing session+IP gate; the harness runs
with the operator's own privileges by design — this is a deliberate, gated host
action, not a sandbox boundary.)

### 4. Launch detached; observe via the port, not the process

The app is launched as a detached child (`powershell.exe -NoProfile -Command
<startCommand>`, `WorkingDirectory` = the app folder, `CreateNoWindow`, output not
redirected) so it outlives the request and keeps listening. The harness does NOT
hold the `Process` handle as the source of truth for "running" — liveness is read
off the port (Decision 1), which also correctly reflects apps started outside the
harness. This is why Stop is deferred: without retained PIDs there is nothing to
kill yet, and adding PID tracking is a separate, larger surface.

### 5. Frontend: a per-row running dot + Run + Check

Each discovered row shows a live running indicator (from the `running` flag), a
**Run** button (disabled when already running or no `startCommand`; on click POSTs
`/run`, then auto-re-checks after a short grace), and a **Check** button that
re-fetches status (recomputing every row's `running`). Register is unchanged.
Advanced-mode only, under the existing `localAppDiscovery` flag.

## Risks / Trade-offs

- **Start command may be wrong / app fails to start.** The launch is fire-and-
  forget; the operator confirms via Check (port liveness). A bad command simply
  results in no listener appearing — visible, not silently "successful".
- **Run with no completed scan / no command.** Guarded with an explicit 400; the
  UI only offers Run for rows that carry a `startCommand`.
- **No Stop in v1.** Accepted scope cut; documented. A started app keeps running
  until stopped out-of-band. PID tracking + a Stop endpoint can follow.
- **Port-liveness cost per status fetch.** `GetActiveTcpListeners()` is a cheap
  in-process snapshot; computing a boolean per discovered app is negligible at the
  dock's 5s cadence.

## Migration Plan

Additive, no data migration. New report field is optional; new endpoint is new;
status payload gains optional fields. Ships under the existing `localAppDiscovery`
Advanced-mode flag. Verify on an isolated preview port with Playwright (running dot
reflects a real listener; Run launches a discovered app and Check flips it to
running) before the normal deploy cycle. Rollback is a straight revert — no
persisted state.
