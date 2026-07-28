# Proposal: discover-apps-panel

## Why

The Discover Local Apps feature has outgrown its home in the agent dock: the dock now
carries two action buttons ("Discover local apps", "Load cache") plus an inline findings
list that, on a repo with many apps, swallows the dock's vertical space. At the same
time the cache's overwrite-on-save behavior loses data — a later partial scan (agents
routinely miss apps and get re-run) clobbers a previously fuller result, and there is no
way to curate what's cached.

## What Changes

- **Dock slims to two buttons.** The agent dock keeps exactly one button that runs
  discovery and one button that opens a dedicated Discover Local Apps panel. The inline
  findings list (and the separate "Load cache" button) leave the dock.
- **New overlay panel.** A panel opens as an overlay on the agent dock and hosts
  everything related to the feature: the discovered/cached apps with the existing
  per-row affordances (register / Run / Check, live running state), the discovery job
  state, and the cache state (whether one exists, its age).
- **Cache save becomes union-by-port** instead of wholesale overwrite: a completed
  discovery merges its findings into the existing cache, keyed by port — new ports are
  added, matching ports are refreshed with the newer finding, and previously cached
  ports the new scan missed are kept. Repeated partial scans accumulate toward the full
  set instead of erasing each other. **BREAKING** for anyone relying on "rediscovery
  replaces the cache" — removal is now an explicit edit, not a side effect of a scan.
- **Cache becomes editable.** From the panel the operator can delete a cached record
  (per-row), backed by a new harness endpoint that removes one finding from the
  per-repo cache file. This is the counterpart the union model requires: stale entries
  no longer age out via overwrite, so the operator prunes them explicitly.

## Capabilities

### New Capabilities

(none — everything lands in the existing capability)

### Modified Capabilities

- `discover-local-apps`:
  - "Persist a completed discovery to a per-repo on-disk cache" changes from
    overwrite-on-save to union-by-port merge.
  - "Triggered from the agent dock" and "Dock offers loading from cache alongside
    rediscovery" change: the dock presents only run-discovery and open-panel actions;
    findings presentation, cache load, and per-row affordances move into the new
    overlay panel (still Advanced-mode).
  - New requirement: an operator-facing panel that shows discovery/cache state.
  - New requirement: delete a single cached finding via a cache-edit endpoint,
    surfaced as a per-row action in the panel.

## Impact

- **Backend** (`ClaudeWeb.App/`):
  - `Services/StructuredAsk/LocalAppDiscoveryCache.cs` — `Save` gains union-by-port
    merge; new delete-one-record operation.
  - `Services/StructuredAsk/LocalAppDiscoveryJobs.cs` — write-through call site
    unchanged in shape but now merges; cache-backed job rehydration must tolerate the
    merged set.
  - `Controllers/LocalAppsController.cs` — new DELETE endpoint for a cached finding;
    existing discovery/cache-load/run/check endpoints unchanged.
- **Frontend** (`client/src/`):
  - `components/dashboard/PinnedAgent.jsx` — dock UI reduced to two buttons; findings
    list extracted.
  - New panel component (overlay on the agent dock) hosting findings, job state, cache
    state, and cache editing.
  - `context/UiModeContext.jsx` — capability map entry for the panel (Advanced mode,
    per the UI-modes convention).
- **Docs/spec**: delta spec for `discover-local-apps`; no change to the agent prompt,
  the read-only-scan policy, or the structured-ask mechanism.
