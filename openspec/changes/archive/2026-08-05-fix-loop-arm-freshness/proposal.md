# fix-loop-arm-freshness

## Why

The first real goal-loop run died on arm (2026-07-27): the driven-loop safety
ladder (NEEDS_HUMAN / deny-list / sentinel) inspects the agent's trailing
assistant message, but at arm time that message PREDATES the loop — it is
whatever the human and agent were last talking about. Arming in an agent whose
last reply mentioned "deploy" (this repo's own deploy conversation) escalated
the loop at iteration 0 with `deny-list: reply mentions "deploy"` — the loop
never sent a single prompt. Any trailing `LOOP_DONE` or `NEEDS_HUMAN:` from an
earlier conversation would misfire the same way.

Two adjacent trust breaks surfaced in the same session:

- The dock loop popover's goal/cap fields are blank component state — after a
  restart (or any loop resolve) the stored goal looks "erased" even though
  `loops.json` still holds it.
- `DrainLegacyArming` silently converts legacy `autopilot.json` ArmedRepoIds
  into ACTIVE suggestion loops at startup — loops the user never armed this
  session. The user's rule is absolute: **no loop runs unless explicitly armed.**

## What Changes

- **Pre-arm reply immunity (engine)**: the engine reads the trailing assistant
  message's timestamp; for DRIVEN kinds (recipe, goal), a reply older than the
  loop's `ArmedAt` is history, not a response to the loop — the kind decides as
  if the agent had not spoken yet (no ladder, no sentinel, no run-error stop),
  so a freshly armed drive loop's first act is to SEND its stored prompt. The
  suggestion kind keeps its designed act-on-current-message behavior.
- **Parameter rehydration (dock UI)**: opening the loop popover seeds the
  goal / cap / mode fields from the agent's persisted loop record (via the
  gated detail read, so prompt disclosure rules are unchanged). A resolved or
  restart-survived loop shows the parameters it was armed with, not blanks.
- **No implicit arming**: the legacy drain no longer arms anything — it clears
  the legacy list and logs that it was dropped. Loops exist only when the user
  arms them; a restart resumes only loops that were still armed by the user.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `autopilot-loops` (change-tree capability; no baseline spec yet — additive
  requirements)
