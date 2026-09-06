# Design: arch-goal-conversations

## D1 — A goal is a conversation record, not a new loop kind

The conversation record (`ArchStateStore.ConversationData`) carries the goal: id, text,
owned repo keys (bare repo id locally, `sourceId/repoId` on a fleet source), owned task
ids, `requireMerged`, state (`running | done | stopped | capped | error`), start/end,
who started it, last wake, outcome, and the queue of Operator messages. The loop on the
conversation is the ordinary goal kind (`LoopConfigStore.StartGoal` on the conversation
key, armed by `operator` or `arch`), so the engine, the pacing floor, the Loops lane and
the dock control all work unchanged. "Running" is the goal's own state; **busy** =
running AND the loop active (`ArchGoalRouting.IsBusy`). A loop the Operator stops from
the Loops lane makes the conversation not-busy at once; the tick reconciles the goal to
the loop's outcome (`ReconcileGoals`), so ownership never outlives the loop.

## D2 — Routing is a per-conversation scope on the existing wake

`ComposeWake(conv)` already filtered the collector's events past the conversation's
watermark by the managed set. The scope is now `ArchGoalRouting.ScopeFor(goal, legacy,
managed)`: the owned keys for a running goal; the whole managed set for a goal-less
conversation only when legacy broadcast is on; else nothing. `ComposeWakeCore` also takes
the owned task ids and keeps `task.status` events for them (or for an owned assignee).
The driven policy's `hasWake` therefore fires only on owned events — the "early wake
inside its own pacing". Unowned events are swept once per tick into the inbox
(`SweepInbox`, own watermark, no replay on first run), bounded to 200 entries.

`task.status` is published by `TaskGraphService` (optional feed) when a task's status
changes through `UpdateNode` or `MarkDispatched`; the source names the task and its
assignee so `KeyOf` attributes it to the managed key. Sync merges publish nothing.

## D3 — What a goal conversation's send carries

The engine composes the goal loop's send as before; for an arch conversation with a
running goal it is prefixed by `DecorateDrivenPrompt`: the queued Operator messages
(drained), the board check that sent it back to work, and the wake draft (what happened
on its repos and tasks). The decoration is composed only when the run slot is free, so a
busy slot never drains the queue for a send that does not go. The loop's own goal text
names its scope and id (`LoopGoalText`), so the agent knows it is a goal conversation.

## D4 — Completion is gated by the board

`ArchDrivenPolicy.Apply` takes a `completionBlocker`: when the kind decided `done`
(GOAL_VERIFIED) and the board says an owned task is short of the floor
(`TaskLifecycle.Blocker`: `pr-opened`, or `pr-merged` with `requireMerged`), the decision
becomes a work-phase re-propose — a new phase, sent at once, the blocker in the
decoration. `NEEDS_HUMAN` stays the escalated hold it is. When the loop resolves
(done / capped / error, or the Operator's stop), `OnDrivenResolved` ends the goal:
release, inbox line, `arch.goal` feed event, and the summary (goal, outcome, owned repos,
task statuses, the conversation's last reply) queued for the default conversation —
delivered by the tick as one turn with actor `goal` when that slot is free; a goal
summary never resumes a stopped loop (only the Operator's message does).

## D5 — Surfaces

`GET /api/arch/conversations` carries `goal` + `busy` per conversation; `GET /api/arch`
carries this conversation's `goal`, `busy`, every `goals`, `legacyBroadcast`, the
`inbox`. `POST /api/arch/goals` (operator start; `mode` optional), `POST
/api/arch/goals/{id}/stop`, `POST /api/arch/goals/{id}/message`, `POST /api/arch/routing
{legacyBroadcast}`, `DELETE /api/arch/inbox`. Tools: `start_arch_goal`, `list_arch_goals`,
`stop_arch_goal` (23 in the catalogue). Fleet status agents and the ungated loops
projection (`goalOwners`) name the driving goal for the Status chips and the dock cards.
