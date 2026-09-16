# One policeman: the Board check runs the sweep, the model answers one question per card

> Proposal only (2026-09-16). Nothing built. Written down because the Operator asked "how could
> we merge them, because they are doing the same responsibilities" — this is the answer to judge.

## Why

There are two checkers on the board and they share one responsibility, keep the Kanban honest:

- the **Board check** — harness code, every 60 s: reads git and GitHub, moves cards forward to the
  facts, judges every card, flags stuck ones (openspec board-check-provenance made it visible);
- the **policeman conversation** — a model turn every 5 min in an arch conversation: reads the
  Board check's verdict, every card, each assignee's last messages and each repo's PRs, then
  observes, syncs and flags through a fenced set of tools (kanban-policeman-conversation,
  policeman-syncs-cards, policeman-observes-agents).

Laid side by side, the split is by *who can decide*, not by responsibility. And the conversation
is the wrong shape for its job: the model is placed at the top of the loop, deciding to call the
next tool, when the only judgment it adds is narrow — read what an agent said and name the state
it is in. Everything else it does (list cards, trace PRs, move a card) is a pure function it
ferries between two tools. The loop it runs exists only as prose in a prompt: it cannot be
inspected, tested or drawn; it can skip a card; and it pays for the whole board every pass. The
sessions, context cap, rollover and handover exist only because it was built as a chat.

## What changes

One loop, in code — the Board check's — with one model call inside it:

1. **The sweep stays where it is.** Every 60 s (and at startup, Re-verify, or a sync) the Board
   check reads the facts for every in-flight card and moves it forward. New: it traces each repo's
   open and merged PRs to cards itself (`PrTrace`, today only reachable through the policeman's
   `list_pull_requests` + `sync_card`), so a card behind its PR is moved without a model.
2. **One question per card.** For each in-flight card whose assignee has messages newer than the
   card's last observation, the loop makes one stateless model call: here are the last N messages,
   which of these seven states is the agent in (`CardObservations`), and why, in one line, as JSON.
   No session, no context cap, no rollover. The Agent section is written by the loop, stamped
   `board-check`, with the reason.
3. **Flags by rule, informed by the reading.** Stuck by the mechanical rules, or the reading says
   asked / blocked / errored, or the column contradicts the facts for two sweeps → 🆘 with the
   reason. One name on the flag.
4. **The Board check subtab becomes the policeman's face.** The journal gains a row per model
   question (card, state chosen, reason, tokens). The conversation, its prompt, its sessions strip,
   its tool fences and its recipe loop are retired. Escalation lives on the card, where you already
   answer it.
5. **The name.** There is one policeman again, and it is the loop.

## What it costs

- New: the classifier call (a bounded `claude -p` or API call with a fixed prompt and a JSON
  schema); PR tracing inside the verifier pass; the journal rows for questions asked.
- Removed: `PolicemanLifecycle`, `PolicemanPrompt`'s six steps, `PolicemanToolPolicy` and the
  three fences, the policeman's MCP tools, `@arch:policeman`, the Policeman subtab's chat.
- Kept: `PrTrace`, `CardObservations`, `BoardIntegrity`, `BoardVerifier`, the card sections, the
  Board check journal and subtab, `TaskGraphService` observation and flag stamping.

## Risk, and how to retire it before building

A one-shot classifier may judge worse than an agent that can dig. Before touching the lifecycle:
run the classifier over the transcripts of the agents already on the board and compare its states
with the observations the current policeman wrote. Agreement → build. Disagreement → let the
classifier ask for more context (still one bounded call), and measure again.

## Impact

- Supersedes the agent half of policeman-observes-agents and policeman-module; keeps their data.
- The Operator loses "talk to the policeman"; gains a reason column and a per-card answer box.
  A one-off question about a decision goes to the arch, which reads everything.
