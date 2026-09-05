# Proposal: arch-driven-loops — the dock's loop kinds, armed on the arch agent

## Why

Repo agents can be driven by a goal loop ("work until GOAL_VERIFIED"), a recipe loop
(resend a prompt until its sentinel) or a queue loop from their dock. The arch agent
only has its standing wake loop. The Operator wants to give the arch agent a goal the
same way — "get every managed repo onto main and green" — and let the same machinery
drive it, rather than a second implementation.

## What

- The autopilot loop endpoint accepts the reserved id `@arch` for the **goal** and
  **recipe** kinds, pins the arch conversation, and refuses the suggestion kind (its
  newest-transcript semantics do not apply) and the queue kind (the arch has no dock
  stash to drain).
- The engine ticks a driven instance on `@arch` through the same mechanics as any
  repo — home folder as cwd, the arch MCP tools and tool denials, briefing, audit, cap —
  with two arch rules applied on top of the kind's decision:
  1. `NEEDS_HUMAN:` is an escalated **hold**, as for the standing loop.
  2. A **repeat of the last sent prompt waits for a wake** (a managed repo turn started
     or ended since the last arch turn); a new prompt — first send, verification,
     phase change, next step — goes out at once.
- One slot per agent still holds: arming a goal displaces the standing wake loop. The
  arch remembers that it was armed (mode, cap) and **restores the wake loop** when the
  driven loop ends — done, capped, errored, or disarmed from the loop control.
- The Arch surface mounts the dock's own loop control (kinds goal · recipe) beside the
  standing-loop card; the header shows the driven loop's kind and progress; the
  standing card says it is paused while a driven loop runs.

## Out of scope

The queue kind on the arch (needs a stash surface for the arch), the suggestion kind,
and running a driven loop and the wake loop at the same time.
