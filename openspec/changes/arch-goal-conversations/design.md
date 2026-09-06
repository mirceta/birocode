# Design: arch-goal-conversations

## D1 — A goal is a conversation record plus the ordinary goal loop

The conversation record (`ArchStateStore.ConversationData`) carries the goal: id, text,
the repo keys (bare repo id locally, `sourceId/repoId` on a fleet source) and task ids it
drives, state (`running | done | stopped | capped | error`), start/end, who started it,
outcome, and the queue of Operator messages. The loop on the conversation is the ordinary
goal kind (`LoopConfigStore.StartGoal` on the conversation key, armed by `operator` or
`arch`), so the engine, the quiet floor, the Loops lane and the dock control all work
unchanged. "Running" is the goal's own state; **busy** = running AND the loop active
(`ArchGoals.IsBusy`). A loop the Operator stops from the Loops lane makes the conversation
not-busy at once; the tick reconciles the goal to the loop's outcome (`ReconcileGoals`).

## D2 — Polling only: a goal conversation never takes a wake

`ArchDrivenPolicy` already paces a repeat of the same prompt by "a wake OR the quiet
floor". For a conversation with a running goal the engine's `hasWake` callback is
`ArchAgentService.HasWake`, which answers false (`ArchGoals.PollsOnly`), so the repeat
waits for the floor alone: the goal prompt goes out every N minutes, and the arch checks
its agents with its tools on each turn. The feed is not read for goal conversations. The
opt-in standing wake loop of a goal-less conversation is untouched (it is the old
behaviour and only runs when the Operator arms it). A new prompt — the first send of an
arm, the verification prompt — still goes at once, as for every driven loop.

## D3 — What a goal conversation's send carries

The engine composes the goal loop's send as before; for a conversation with a running goal
`DecorateDrivenPrompt` prefixes the Operator messages queued while it was busy (drained
here, so the decoration is composed only when the run slot is free). Nothing else: the
loop's own goal text names its scope, its id and the rule "nobody calls you — check them
yourself" (`ArchGoals.LoopGoalText`).

## D4 — Completion and the summary

The goal kind's own ladder decides: `LOOP_DONE` → verification prompt → `GOAL_VERIFIED`
resolves done; `NEEDS_HUMAN` holds (escalated, the conversation stays busy); cap, error
and the Operator's stop resolve as before. When the loop resolves, `OnDrivenResolved` ends
the goal: release, an `arch.goal` feed event, and the summary (goal, outcome, driven
agents, task statuses, the conversation's last reply) queued for the default
conversation — delivered by the tick as one turn with actor `goal` when that slot is
free; a goal summary never resumes a stopped loop (only the Operator's message does).

## D5 — Surfaces

`GET /api/arch/conversations` carries `goal` + `busy` per conversation; `GET /api/arch`
carries this conversation's `goal`, `busy` and every `goals`. `POST /api/arch/goals`
(operator start; `mode` optional), `POST /api/arch/goals/{id}/stop`, `POST
/api/arch/goals/{id}/message`. Tools: `start_arch_goal`, `list_arch_goals`,
`stop_arch_goal` (23 in the catalogue). Fleet status agents and the ungated loops
projection (`goalOwners`) name the driving goal for the Status chips and the dock cards.
