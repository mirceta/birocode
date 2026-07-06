# Proposal: auto-understanding-after-turn

## Why

The dock's "Ask for understanding" button (openspec spec `ask-for-understanding`) rebuilds the
repo's Understanding app for the latest assistant turn — but only when the Operator/End User
remembers to press it, so the Understanding app is stale for every turn nobody asked about.
Chat runs are already backend-owned and their completion is observable server-side, so the
harness can trigger the same run automatically at the end of every agent turn and keep the
Understanding app current with zero clicks.

## What Changes

- **Auto-trigger on turn end**: when a dock agent's chat run completes (the backend marks the
  run terminal with a session id), the harness automatically starts the same understanding run
  the button starts today — per repo, using the just-finished conversation's session id.
- **Opt-in toggle per repo**: auto-mode is a per-repo setting (default **off** — every turn
  spawns a paid agentic run, so the user opts in), persisted server-side so the trigger fires
  even when no browser is attached. The dock exposes the toggle next to the existing "Ask for
  understanding" button (Advanced mode only, same capability gate).
- **Coalescing, not queuing**: the existing latest-only/join semantics stay; if a turn ends
  while an understanding run is still in flight, the newest turn must not be silently lost —
  the run for the newest session re-fires after the in-flight one finishes (one pending
  "latest" at most, intermediate turns dropped).
- **No recursion / no error turns**: auto-trigger fires only for successful (`done`) chat runs,
  and only for dock chat runs — the understanding run itself goes through Claude Monitor, not
  the chat pipeline, so it can never re-trigger itself.
- The manual button behaves exactly as today; Console lifecycle events (`op="understanding"`)
  are unchanged and become the visible trace of each auto-run.

## Capabilities

### New Capabilities

_None — this extends the existing understanding capability._

### Modified Capabilities

- `ask-for-understanding`: add requirements for (1) an automatic trigger at chat-run
  completion gated on a persisted per-repo auto-mode setting, (2) the dock control to view
  and flip that setting, and (3) coalescing behavior when turns finish faster than
  understanding runs complete.

## Impact

- **Backend**: `RunSessionService` (or its completion path) gains a turn-completed hook that
  calls `UnderstandingJobs`; `UnderstandingJobs` gains coalescing of a pending latest run; a
  small per-repo settings store + endpoint for the auto-mode flag (pattern: existing per-repo
  config like `Visibility` on `RepositoryConfig`).
- **API**: new get/set endpoints for the per-repo auto-understanding setting (or a field on an
  existing repo-settings endpoint); `/api/understanding/ask` and `/status` unchanged.
- **Frontend**: `PinnedAgent.jsx` renders the toggle beside the existing button and reflects
  auto-run activity through the same status poll; capability map untouched (reuses
  `understandingAgent`, Advanced-only).
- **Dependencies**: none new — reuses Claude Monitor snapshot-resume, `RepoEventLog`, and the
  existing job registry. Cost note: opt-in default keeps Claude usage unchanged until enabled.
