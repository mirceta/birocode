# Queued prompts — stack up prompts, approve each when free

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-17): DESIGN.** On `feature/queued-prompts`. Builds on the
> [prompt-stash](prompt-stash.md) precedent (per-agent, backend-synced list).

## Problem

While an agent is working on the current prompt, the operator can't send the next one
(the run gate returns 409 — `chat.busyError`). They want to **line up the next prompts
while the agent is busy** and not lose the thought.

## Goal

Each agent has an ordered **prompt queue**. While it's running, the operator enqueues
prompts. **Nothing auto-runs** — when the agent is free, each queued prompt waits for
the operator to **approve** it (tap to send). Each item also has an **× to delete** it.

## Behaviour

- **Enqueue** while the agent is busy (when a normal send would 409).
- **Approve (tap)** a queued item → it sends as the next prompt. Operator-driven only;
  the harness never sends a queued prompt on its own.
- **Delete (×)** removes an item without sending it.
- Order is editable (reorder), head shown as "next".

## How it fits the current architecture

- **Send + busy:** `ChatContext.sendTo(text, {key, repoId, tabId, lane})` sends a
  prompt and sets the tab `status: 'running'`; sending during a run 409s.
- **Approval send:** tapping a queued item calls `sendTo` with its text once the agent
  is idle (disabled / no-op while a run is in flight).
- **Per-agent, backend-synced storage:** mirror prompt-stash — a `Queue` list on the
  `DockTab` in `dock.json`, with `POST /dock/{id}/queue`, `DELETE
  /dock/{id}/queue/{itemId}`, and reorder, riding the existing dock sync so a queue
  built on the phone shows on desktop. Closing an agent discards its queue.
- **Surfaces:** main Chat tab + dashboard docks (like stash).

## Relationship to prompt-stash

Both are per-agent backend-synced prompt lists. Stash = loose notes you load back into
the composer; queue = an ordered list of prompts you approve to run next. Open: keep
them as two lists, or merge (a stash chip gains an "approve/send" action). **TBD.**

## Out of scope

- Auto-execution of queued prompts (explicitly **not** wanted — every send is approved).
- Cross-agent / global queues; time scheduling (that's `/schedule`).

## Verification (planned)

Browser ([browser-testing](../docs/claude-web/browser-testing.md)): while an agent
runs, enqueue 2 prompts; neither sends on its own; when the agent is free, tapping one
sends it and tapping × deletes another; queue persists across reload and shows on a
second tab.
