# Proposal: local-app-lifecycle-controls

## Why

The agent dock's Local Apps panel can discover, cache, register, and **start** a
repository's local apps — but that is where control ends. Once an app is running
(or wedged, or serving a stale build) the harness offers nothing: the operator has
to walk to the host, hunt the process by port, kill it by hand, rebuild by hand,
and relaunch. `LocalAppRunner` deliberately launches detached without retaining
PIDs, so today there is literally nothing to kill from the harness side. Stop,
Restart, and Rebuild close the loop so the panel manages the whole lifecycle of a
cached app, phone-first, without host access.

## What Changes

- **Stop**: a new per-row action + endpoint that stops a running cached app by
  port. Since no PID is retained, the owning process is resolved live from the
  listening port at stop time (loopback TCP table → PID) and terminated with its
  child processes. Guardrails: the action refuses to touch a port that is not a
  cached finding for the caller's repo, and structurally refuses to kill the
  harness's own process (Self-Development: the Repo may be the Harness — stopping
  "the app on :5099" must never shoot the harness itself).
- **Restart**: stop (when running) → wait for the port to actually free → launch
  the cached `startCommand` detached, as one action. Requires a known start
  command; reports each phase to the Event Console.
- **Rebuild**: findings gain an optional **`buildCommand`** (sibling of
  `startCommand`) flowing through the whole pipeline — discovery prompt, typed
  report + validating parse, on-disk cache union, import/export contract (old
  caches and old import payloads stay valid). A new rebuild action runs the
  cached build command in the app's folder as a harness-owned, disconnect-proof
  job (like discovery jobs) with captured output and exit code surfaced in the
  panel; Rebuild is unavailable when no build command is known.
- **Build-command backfill for existing caches**: repositories already have
  populated caches whose findings predate `buildCommand`. A new targeted agent
  ask — sent through the same `ClaudeMonitor` structured-output mechanism as
  discovery — takes the cached findings that lack a build command (name, folder,
  port, start command) and asks the agent to inspect *those folders only* and
  return each one's build command (empty = build-less). The result merges into
  the cache by port, touching only `buildCommand`; a full re-discovery also now
  extracts build commands, so backfill is the cheap targeted path, not the only
  one.
- **Panel UI**: per-row Stop / Restart / Rebuild join Register / Run / Check,
  enabled from live running state + known commands; running rebuild shows
  in-flight state and its outcome. Advanced-mode affordances, same as the rest
  of the panel.

## Capabilities

### New Capabilities

_None — this grows the existing discovery/run surface._

### Modified Capabilities

- `discover-local-apps`: the typed report/cache/import/export contracts gain the
  optional `buildCommand` field; new requirements for stopping a cached app by
  port (live port→process resolution, harness self-protection), restarting
  (stop→wait-free→start), rebuilding (tracked build job with captured
  outcome), and backfilling build commands into an existing cache via a
  targeted read-only agent ask; the panel requirement's per-row affordances
  extend from register/Run/Check to include Stop / Restart / Rebuild.

## Impact

- **Backend**: `LocalAppRunner` (port→PID resolution, process-tree kill,
  wait-for-port-free, tracked build execution), `LocalAppsController` (new
  `stop` / `restart` / `rebuild` endpoints + projections), `LocalAppExposureReport`
  (`buildCommand` field + parse), `LocalAppDiscoveryAsk` (prompt schema),
  `LocalAppDiscoveryCache` (field flows through union merge; back-compat load),
  `RepoEventLog` emissions for the new actions.
- **Frontend**: the dock's Local Apps panel (per-row actions, rebuild job state,
  export JSON contract), i18n keys, CSS.
- **Contracts**: import/export JSON gains optional `buildCommand`; existing
  payloads without it remain valid (empty = unknown, same as `startCommand`).
- **Safety**: killing by port is the sharpest edge — bounded by repo-scoped
  cache membership, explicit harness-self guard, and event-log auditability.
