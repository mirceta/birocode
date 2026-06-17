# Understanding — queued prompts per agent

## Goal
Each agent gets an ordered **prompt queue**. While the agent is busy on the current
prompt (a normal send 409s), the operator queues up the next prompts. **Nothing
auto-runs** — when the agent is free, the operator **approves (taps) each queued
prompt** to send it, or taps **×** to delete it. The harness never sends a queued
prompt on its own.

## Kickoff done
- On `main` synced with `origin/main` → branch `feature/queued-prompts`.
- Active feature plans entry + detail plan `plans/queued-prompts.md`.

## How it'll work (grounded)
- Reuse the [prompt-stash](plans/prompt-stash.md) pattern: a per-agent, backend-synced
  list on the `DockTab` (`dock.json`), new `POST/DELETE /dock/{id}/queue` (+ reorder).
- Approve = tap a queued item → `ChatContext.sendTo` (only when the agent is idle).
- Surfaces: main Chat tab + dashboard docks, like stash.

## Open question
- Keep the queue separate from prompt-stash, or merge them (a stash chip gains an
  approve/send action)?

## Status
DESIGN/kickoff — not implemented yet.
