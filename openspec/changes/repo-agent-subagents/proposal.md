# Repo-agent goal conversations

## Why

Fleet task 5872a223 (the Operator, 2026-10-11): the arch can open goal conversations
("goal conversations") — goal loop, step plan, Goal conversations tab, NEEDS_HUMAN answer, stop / continue. Repo
agents cannot. Give every repo agent the same: a tool to spawn its own goal-driven goal conversation
conversation in its own checkout, shown in a new **Goal conversations** dock lane, with its summary
reported back into the parent's conversation.

## What changes

- **Backend**: `RepoSubagentStore` (goal conversations.json; the summary persists until delivered),
  `RepoSubagentService` (start / stop / message-answer / mark / edit / continue; the engine hooks),
  keys `<repoId>~sub~<id>` for the loop slot, run slot and MCP identity. The autopilot engine ticks
  goal conversation loops after the arch's, with the parent's checkout as cwd, the repo's engine and model,
  the goal conversation's own session only, a read-only CLI for helpers, and the repo-agent MCP server with
  `&sub=<id>`. `SubagentsController` serves `/api/goal-conversations…` for the dock lane.
- **Tools** (repo-agent MCP): `start_goal_conversation`, `list_goal_conversations`, `stop_goal_conversation`,
  `message_goal_conversation` for the parent; `mark_step`, `edit_goal_plan` for the goal conversation (owner-only).
  The preamble says when to use one and when not; `docs/goal-conversations-convention.md` is the
  harness_help topic.
- **Boundaries**: one writer per checkout (a writer waits for the parent's builder slot and for
  sibling writers; the parent's builder send and an arch send are refused while a writer turn
  runs); read-only helpers run alongside; stay on the parent's branch, no push / merge / deploy
  unless the goal says so; at most 3 running per repo, cap 1–30 turns (default 10); no nesting; the
  gate, claims and deploy guard apply unchanged; runs are billed to the repo like any builder run.
- **UI**: `SubagentsPanel` / `GoalPlanPanel` take an `owner` (the arch by default, so the
  Management tab is unchanged); the dock's **⑂ Goal conversations** lane (feature `subagentsDock`, advanced)
  with a count badge, a start form and the goal conversation's transcript.
- **Fleet**: per-agent `goal conversations` counts on Fleet Status and the peer describe (an optional
  field); `GET /api/arch/peer/subagents` and `GET /api/arch/fleet/subagents` let the hub read a repo
  agent's goal conversations (list, plan, last messages); the Status chip shows "⑂N"; the Management
  Goal conversations tab gains a "Repo-agent goal conversations" block.

## Addendum — the main-conversation pointer and concurrent writers (the Operator's review, 2026-10-11)

The Operator asked whether running goal conversations through Claude Monitor (or in worktrees) would keep
their conversations from mixing with the main one. Findings: the CLI stores every conversation of a
checkout in ONE folder named after the working directory, whoever launches it (Claude Monitor's
snapshot code writes there too); worktrees isolate the folder but collide on the products' fixed
ports. The mixing comes from harness paths that took "the newest transcript in the folder" as the
agent's conversation. The Operator's resolution: **make the main conversation explicit.**

- `MainConversationStore` (main-conversations.json) + `MainConversationTracker`: the pointer follows
  the main thread — a builder run on the repo's own key that resumed the main session moves it to the
  run's session (in place or forked); a dock tab only seeds a missing pointer (see Addendum 2: picking
  never moves it); with none yet the first conversation becomes main; the Operator sets it explicitly (`POST
  /api/main-conversation`, the picker's "★ make main"). Goal conversation runs (their own key), the ask lane and
  side conversations never move it. `RunSession.ResumedFrom` records what each builder run resumed.
- The readers use it and never guess: the suggestion loop, a driven loop armed with no session (engine,
  dock arming, `arm_my_loop`), the arch's send / read_transcript resolution, the goal conversation summary. The
  conversation picker marks the main conversation and names every goal conversation session (a goal conversation records
  every session it ever had).
- `concurrent: true` on `start_goal_conversation` / the lane's form: a writer that runs alongside the parent with
  no lock, told to touch and commit only its own files. The default stays one writer at a time.

## Verification

- xunit `RepoSubagentTests` (keys, store, inline STEP markers, boundaries text, tool catalogue,
  preamble, identity routing, the convention doc) — suite 985/985; node `subagentOwner.test.mjs` —
  client 294/294.
- A real end-to-end (`.claudeweb-preview/subagents-live.ps1` running
  `client/tests/ui/e2e-repo-subagents.mjs`) on an isolated harness over a throwaway git repo: the
  parent agent called `start_goal_conversation`; the goal conversation created and committed a file; its 3 steps
  turned green with evidence; it verified (GOAL_VERIFIED); the summary landed in the parent's
  conversation tagged `goal-conversation` and the parent answered it; Fleet Status, the hub summary and the
  hub read all carried it — 18/18 checks. Screenshots `docs/screenshots/repo-subagents-*.png`.
- After the addendum: xunit `MainConversationTests` (follow rules, store, dock event, goal conversation sessions,
  concurrent wording) — suite 1001/1001; the live end-to-end extended to 21/21: while the goal conversation's
  transcript was the NEWEST in the folder the pointer still named the parent's conversation and the
  picker marked one main and the goal conversation's session; the pointer named the session the summary turn ran
  in (this CLI version resumes in place — no fork — and both cases are handled).

## Addendum 2 — the eval and the four holes it closed (the Operator: "can we be sure?")

A loop-eval scenario, `tests/loop-eval/goal-conversations.mjs` (real turns, isolated, 21 assertions), was
written against the design and run on the build BEFORE fixing: it failed 5 assertions — the
parent's own drive loop ran during a writer goal conversation's turn (36 of 90 samples overlapped), picking a
goal conversation's or a side conversation in the main tab moved "main", "make main" accepted a goal conversation's
conversation, and an older datadir was never re-seeded. Fixed: the parent's loops wait for a writer
like its chat and the arch do; a tab only seeds a missing pointer (picking never moves it — only
"make main"); a goal conversation's conversation is refused as main everywhere (409 on make-main); a missing
pointer is seeded at startup from the agent's oldest dock tab; the follow rules check-and-set under
one lock. The same scenario then passed 21/21 (one interim run failed only its concurrent check on an eval-timing race, fixed in the scenario), and 21/21 twice in a row after that.

## Decided provisionally (open questions for the Operator)

Writers by default; the parent is refused its own builder turn while a writer runs; the arch does
not start repo goal conversations (it only reads them); caps 3 / 10 / 30; the summary costs one parent turn.
