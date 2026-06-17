# Queued prompts — line up what the agent runs next

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-17): DESIGN.** On `feature/queued-prompts`. Builds on the
> [prompt-stash](prompt-stash.md) precedent (per-agent, backend-synced list) but adds
> **auto-execution**.

## Problem

While an agent is working on the current prompt, the operator can't send the next one
(the run gate returns 409 — `chat.busyError`). Today they can only **stash** an idea
([prompt-stash](prompt-stash.md)) and manually re-send it later. The operator wants to
**queue prompts that run automatically, in order**, as soon as the agent is free —
so they can line up a sequence of work and walk away.

## Goal

Each agent has an ordered **prompt queue**. While it's running, the operator enqueues
prompts; when the current run finishes, the harness **auto-sends the next queued
prompt**, and continues until the queue is empty.

## How it fits the current architecture

- **Send + busy:** `ChatContext.sendTo(text, {key, repoId, tabId, lane})` sends a
  prompt and sets the tab `status: 'running'`; sending during a run 409s.
- **Completion hook:** the stream handler marks `status: 'done'` / `'error'` when a run
  ends (ChatContext, the `end`/done + error paths). **This is the trigger point**: on
  a successful finish, if the tab's queue is non-empty, dequeue the head and `sendTo`
  it.
- **Per-agent, backend-synced storage:** mirror prompt-stash — a `Queue` list on the
  `DockTab` in `dock.json`, with `POST /dock/{id}/queue` + `DELETE
  /dock/{id}/queue/{itemId}` (and reorder), riding the existing dock sync so a queue
  built on the phone shows on desktop. Closing an agent discards its queue.

## Open design questions (resolve before building)

- **Relationship to prompt-stash.** Options: (a) a **separate** queue (stash =
  passive notes, queue = auto-run) — clearest but two similar UIs; (b) **upgrade
  stash** with a "run when free" action so a chip can be promoted to the queue;
  (c) replace stash with the queue. Lean (a) or (b).
- **Failure handling.** If a queued prompt's run **errors**, do we **pause** the queue
  (safer — operator inspects) or **continue**? Lean: pause on error, surface it.
- **Where auto-send fires.** The completion hook runs per conversation `key`; the
  queue is per `tabId`. Fire only for the builder lane (not the read-only Ask lane),
  and only on the agent's own dock tab.
- **Edit/reorder** queued items before they run; and a visible "next up" indicator.
- **Surfaces:** main Chat tab + dashboard docks (like stash); gating/UI mode.
- **Guardrails:** cap queue length; confirm-clear; don't auto-send if the operator
  stopped the run manually (Stop ≠ "run the next one").

## Out of scope (for now)

- Cross-agent / global queues; scheduling by time (that's `/schedule`).
- Branching/conditional queues.

## Verification (planned)

Browser ([browser-testing](../docs/claude-web/browser-testing.md)): while an agent
runs, enqueue 2 prompts; on finish the first auto-sends, then the second; an errored
run pauses the queue; queue persists across reload and shows on a second tab; Stop
doesn't trigger the next.
