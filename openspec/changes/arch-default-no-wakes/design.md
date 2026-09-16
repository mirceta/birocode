# Design

## The rule lives in one place

`ArchGoals.TakesRepoWakes(key)` is the only statement of "who may take repo wake-ups":
false for `ArchStateStore.DefaultConversationId` (and for anything that resolves to it
through `KeyOrDefault`), true for every sibling `@arch:<id>`. Every enforcement point
calls it, so the rule cannot drift between the composer, the arm route, the restore
path and the resume path.

## Enforcement points

| Where | Before | After |
|---|---|---|
| `ArchAgentService.ComposeWake(key)` | broadcast: every managed repo turn for any armed conversation | default conversation → `null`, watermark follows the feed's last seq, draft dropped |
| `ArchAgentService.Arm(key)` | arms any conversation, records the standing memory | default conversation → `InvalidOperationException(NoWakeLoopReason)`; the Arch page's `POST /api/arch/loop` answers `400 { error }` |
| `ArchAgentService.RestoreStandingLoopIfNeeded(key)` | re-arms from memory after a driven loop ends | default conversation → clears the memory, returns false |
| `ArchAgentService.ResumeLoopIfStopped(key)` | the operator's message re-arms an escalated/capped wake loop | default conversation → no |
| engine tick (`AutopilotService`) | — | `RetireDefaultWakeLoop()` before the instances tick: stops a wake-kind loop still active on `@arch`, clears its memory, logs once each |

`RetireDefaultWakeLoop` is what fixes a hub that already runs with the stale loop and
memory (`loops.json` `@arch` kind `arch` active; `arch.json` `StandingLoopMode: drive`)
without touching the data dir by hand: the first tick after the deploy retires both.
It is idempotent and two dictionary reads when there is nothing to do.

## What stays

- The dock's driven kinds (goal · recipe) on the Arch agent: `HasWake(@arch)` now
  always reads false, so their repeats go out on the quiet floor — the same pacing a
  goal conversation has had since PR #71.
- Sibling conversations' standing wake loops, their restore-after-driven and resume
  paths, `arch.wake` on the feed, goal summaries to the default conversation.
- The Arch page for a sibling is unchanged; for the default conversation the
  standing-loop card becomes a short note (`data-no-wakes`).

## Tests

Pure: `TakesRepoWakes` for default / null / non-conversation / sibling; the state
store clears the default conversation's memory without touching a sibling's.
