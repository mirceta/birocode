# Proposal: recurring-arch-tools-tracking — arch tools for recurring tasks + the tracking-only card

Fleet task `933709ea5ada4fa5a785ba1b7a8729ce` (Operator, 2026-10-05). Extends openspec
`recurring-tasks` (PR #128).

## Why

1. Only the Operator can create a recurring task, in the Recurring tab. The arch agent — the
   fleet's middle management — cannot answer "what is scheduled and how did the last runs go",
   nor set a chore up when the Operator asks it to in chat.
2. Some recurring jobs need no prompts from us at all: they already run by themselves inside
   an app of a repo agent (a nightly import in the product's own scheduler). The Operator wants
   them on the same board, as a bookmark that opens that agent's harness so they can go and
   look — without the scheduler ever sending anything.

## What changes

- **Arch tools** `list_recurring`, `recurring_runs`, `create_recurring`, `update_recurring`,
  `delete_recurring`, in the existing tool pattern (names, `ToolOutcome` result shape, audit,
  the sends scope rule: only agents the arch manages). They go through the **same command
  path as the tab** — a new `RecurringCommands` service the controller now delegates to — so
  there is one store, one validation and one gate rule. The role prompt gains a "Recurring
  tasks" section: the arch creates / edits / deletes only when the Operator asks.
- **A second card kind, `tracking`.** The scheduler never sends it anything; it has no
  schedule; the card carries the agent, a title, a description of what runs there and
  optionally the agent's registered local app the job lives in. In the tab it is visibly
  distinct (kind pill, dashed card, no run strip / next line / history) and its main action is
  **Open harness** — the existing per-agent tab helper the Kanban badge uses (one tab per
  agent, focused without reload). Created, edited and deleted in the tab and through the arch
  tools alike. The optional local app resolves from this machine's local-apps registry for
  agents here (a picker) and is a plain id for a peer's agent; its link is the documented
  localview proxy path on that agent's harness.

## Out of scope

Reading a tracking job's own history from inside the product; a schedule display for tracking
cards (the job's cadence belongs to the app; the description says it in words).
