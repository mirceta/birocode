## Why

"Discover local apps" tells the operator *which* apps exist and on what port, and
lets them register one — but it stops there. To actually use a discovered app the
operator still has to leave the harness, open a terminal, remember the start
command, and run it; and they have no in-dock way to tell whether an app is even
running right now. Discovery already knows where each app's server lives (it found
the listen/bind call), so it can also surface *how to start it*, and the harness
can cheaply tell *whether it is up* by checking the port. That closes the loop:
discover → see if it's running → start it → register it, all from the dock.

## What Changes

- **Discovery extracts the start command.** The typed report gains a
  `startCommand` field — the command that launches the app (e.g. `node serve.mjs`,
  `powershell -File serve.ps1`), read from the same file/line where the port is
  bound. Optional (empty when the agent can't determine it). Schema and prompt
  stay a single source of truth (rendered from the typed report).
- **The harness reports live running state.** Whether an app is running is a
  point-in-time fact, so it is NOT baked into the (slow) scan result — it is
  computed by the harness at response time by checking the app's loopback port for
  a TCP listener. The discovery status payload carries a per-app `running` flag
  that is always fresh as of the fetch.
- **Run button.** A new `POST /api/local-apps/run` looks up the scanned finding
  for the caller's repo by port, and launches its `startCommand` **detached** in
  the app's folder. The command run is the one discovery extracted and stored
  server-side (resolved from the repo's scan result by port), not an arbitrary
  string from the client.
- **Check button.** Re-fetches the discovery status, which recomputes each app's
  live `running` flag — so the operator can confirm an app came up (or is already
  up) without leaving the dock. After a Run, the dock auto-checks shortly after.
- Read-only scan policy, single-repo-per-call scoping, and the existing
  `{ name, port, folder, evidence }` fields are **unchanged** and
  backward-compatible (new fields are additive). Stop/kill is intentionally out of
  scope for this change.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `discover-local-apps`: discovery additionally extracts each app's start command,
  the result carries a harness-computed live `running` flag, and the dock can
  start a discovered app and re-check its running state on demand.

## Impact

- **Backend (`ClaudeWeb.App`)**: `LocalAppExposureReport` gains `startCommand`;
  `LocalAppDiscoveryAsk` prompt asks for it; a new port-liveness + launch service;
  `LocalAppsController` adds `startCommand` + `running` to the status projection
  and a `POST /run` endpoint; DI registration.
- **Frontend (`client/`)**: `PinnedAgent.jsx` discovery rows gain a running
  indicator, a Run button, and a Check button; new i18n keys; CSS.
- **Understanding app**: refresh `understanding-app/index.html` for the
  discover → check → run loop (per repo convention).
- No breaking API change: `GET /api/local-apps/discover[/status]` keeps its shape
  and simply carries the new additive fields; existing callers are unaffected.
