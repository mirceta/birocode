# Repo-agent subagents

## Why

Fleet task 5872a223 (the Operator, 2026-10-11): the arch can open goal conversations
("subagents") — goal loop, step plan, Subagents tab, NEEDS_HUMAN answer, stop / continue. Repo
agents cannot. Give every repo agent the same: a tool to spawn its own goal-driven subagent
conversation in its own checkout, shown in a new **Subagents** dock lane, with its summary
reported back into the parent's conversation.

## What changes

- **Backend**: `RepoSubagentStore` (subagents.json; the summary persists until delivered),
  `RepoSubagentService` (start / stop / message-answer / mark / edit / continue; the engine hooks),
  keys `<repoId>~sub~<id>` for the loop slot, run slot and MCP identity. The autopilot engine ticks
  subagent loops after the arch's, with the parent's checkout as cwd, the repo's engine and model,
  the subagent's own session only, a read-only CLI for helpers, and the repo-agent MCP server with
  `&sub=<id>`. `SubagentsController` serves `/api/subagents…` for the dock lane.
- **Tools** (repo-agent MCP): `start_subagent`, `list_subagents`, `stop_subagent`,
  `message_subagent` for the parent; `mark_step`, `edit_subagent_plan` for the subagent (owner-only).
  The preamble says when to use one and when not; `docs/repo-agent-subagents-convention.md` is the
  harness_help topic.
- **Boundaries**: one writer per checkout (a writer waits for the parent's builder slot and for
  sibling writers; the parent's builder send and an arch send are refused while a writer turn
  runs); read-only helpers run alongside; stay on the parent's branch, no push / merge / deploy
  unless the goal says so; at most 3 running per repo, cap 1–30 turns (default 10); no nesting; the
  gate, claims and deploy guard apply unchanged; runs are billed to the repo like any builder run.
- **UI**: `SubagentsPanel` / `GoalPlanPanel` take an `owner` (the arch by default, so the
  Management tab is unchanged); the dock's **⑂ Subagents** lane (feature `subagentsDock`, advanced)
  with a count badge, a start form and the subagent's transcript.
- **Fleet**: per-agent `subagents` counts on Fleet Status and the peer describe (an optional
  field); `GET /api/arch/peer/subagents` and `GET /api/arch/fleet/subagents` let the hub read a repo
  agent's subagents (list, plan, last messages); the Status chip shows "⑂N"; the Management
  Subagents tab gains a "Repo-agent subagents" block.

## Verification

- xunit `RepoSubagentTests` (keys, store, inline STEP markers, boundaries text, tool catalogue,
  preamble, identity routing, the convention doc) — suite 985/985; node `subagentOwner.test.mjs` —
  client 294/294.
- A real end-to-end (`.claudeweb-preview/subagents-live.ps1` running
  `client/tests/ui/e2e-repo-subagents.mjs`) on an isolated harness over a throwaway git repo: the
  parent agent called `start_subagent`; the subagent created and committed a file; its 3 steps
  turned green with evidence; it verified (GOAL_VERIFIED); the summary landed in the parent's
  conversation tagged `subagent` and the parent answered it; Fleet Status, the hub summary and the
  hub read all carried it — 18/18 checks. Screenshots `docs/screenshots/repo-subagents-*.png`.

## Decided provisionally (open questions for the Operator)

Writers by default; the parent is refused its own builder turn while a writer runs; the arch does
not start repo subagents (it only reads them); caps 3 / 10 / 30; the summary costs one parent turn.
