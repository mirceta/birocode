# The Operator-facing arch conversation takes no wake loop

## Why

Repo agents' turn-end wake-ups came back into the Operator-facing arch conversation.
The goal-conversations change (PR #71) specified that the default conversation "SHALL
receive no repo wake-ups" and its first commit enforced that with a per-conversation
wake scope; its second commit ("simplify … no event routing") deleted the scope, so
`ComposeWake` broadcasts every managed repo turn to any conversation with an armed
wake loop — the default one included. The default conversation still had a *standing
wake loop memory* (armed once on 2026-09-06 11:00 on an older build), and the engine
brings that loop back every time a goal loop on the default conversation ends
(`RestoreStandingLoopIfNeeded`), re-recording the memory as it does. Result: after
each goal on the Arch agent finishes, the Operator's chat fills with
`[wake-up from the harness …]` turns for every repo agent turn on the fleet.

## What changes

- **One rule, pure.** `ArchGoals.TakesRepoWakes(conversationId)`: the default
  conversation never takes repo wake-ups; a sibling conversation keeps its opt-in
  standing wake loop.
- **Enforced where wakes are made and where loops are armed.** `ComposeWake` composes
  nothing for the default conversation (its watermark follows the feed so nothing
  piles up); `Arm` refuses it (`400` from the Arch page with the reason);
  `RestoreStandingLoopIfNeeded` never brings its loop back and clears the memory;
  the operator's-message resume ignores it.
- **The stale loop is retired.** An engine-tick step (`RetireDefaultWakeLoop`) stops a
  wake-kind loop still armed on the default conversation by an older build and clears
  its standing-loop memory, once, logged.
- **The Arch page says so.** On the default conversation the "Standing wake loop" card
  is replaced by a note; siblings keep the card.

## Non-goals

Goal loops on the default conversation (the dock's "goal" kind on the Arch agent) keep
working; their repeats are paced by the quiet floor alone, as a goal conversation's are.
No change to sibling conversations, to `arch.wake` on the feed, or to goal summaries.
