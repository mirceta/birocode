# add-loop-debug-handoff

## Why

When a dock loop misbehaves, the operator has no way to hand the problem to an
agent. The evidence is scattered: the loop record lives in `loops.json`, sends
in `autopilot-audit.jsonl`, but the engine's per-tick reasoning — why it held,
what dedup guard is blocking, whether the agent read as busy — is in-memory
only and invisible. The user ends up saying "the loop doesn't work and I can't
even tell you what happened."

## What Changes

- **Debug bundle read**: a new session-auth `GET
  /api/autopilot/loops/{repoId}/debug` assembles one self-describing JSON
  bundle for that agent's loop: gate/kill-switch/threshold state, the repo,
  the full loop record, a live engine snapshot (busy, current decision +
  reason, the dedup guards, repo-filtered intercepts and log rows),
  repo-filtered audit entries, and — crucially — the **on-disk file paths**
  (`loops.json`, `autopilot-audit.jsonl`, `autopilot-gate.json`, the repo's
  transcript directory) plus an agent-facing hint naming the engine source
  files, so a pasted bundle lets an agent on the host dig deeper by itself.
  Deliberately NOT operator-gated (like the status projection) so a loop's
  terminal state stays debuggable after the gate closes — but every
  prompt-bearing field (prompts, goal, pending prompt, snippets, deny list)
  is redacted while the gate is closed, keeping the closed-gate disclosure
  surface unchanged.
- **Copy for debugging**: the dock loop popover gains a button that fetches
  the bundle and puts a paste-ready block (one-line header + fenced JSON) on
  the clipboard — with an execCommand fallback for non-secure contexts and,
  if both fail, an inline read-only textarea for manual copy. Visible even
  when the agent has no or a stopped loop (terminal states are the debugging
  case).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `autopilot-loops`: adds the ungated (session-auth, gate-redacted) per-repo
  debug bundle read.
- `agent-dock`: the loop popover adds the copy-for-debugging action.

## Impact

- Backend: `AutopilotService` (a `DebugSnapshot` read of the in-memory
  guards/state), `AutopilotController` (the debug endpoint),
  `LoopConfigStore`/`AutopilotAuditLog` (expose their file path).
- Frontend: `DockLoopControl.jsx` (button + clipboard + fallback), i18n
  en/tr, `dashboard.css`.
- No stores change shape; no new persistence.
