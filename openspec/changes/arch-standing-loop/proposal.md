# Proposal: arch-standing-loop — the arch agent stays armed while it waits for you

## Why

Every arch loop stop on 2026-09-05 was `escalate · needs-human`: the arch agent asked
the Operator a question, the loop went inactive, the Operator answered in the arch
chat — and nothing resumed, so the Operator had to press Arm again, three times in
fifteen minutes. The default cap of six wake-ups adds a second copy of the same
friction. Asking the Operator is the coordinator's normal mode, not a terminal state,
and the arch agent has no reason to stop wakes from other repos while one question
waits.

## What

- A reply ending in `NEEDS_HUMAN:` becomes an **escalated hold**, not a stop: the loop
  stays armed, the Arch surface shows "waiting for you: <question>", and the
  Operator's reply lifts the hold. Wake-ups from managed repo turns keep arriving while
  the question stands, so the arch agent carries on with the other repos.
- **No cap by default** for the arch loop (`0` = uncapped, which the engine already
  honours for suggestion loops); the cap field stays for anyone who wants one.
- An arch loop that had already stopped as `escalate` or `capped` **resumes when the
  Operator sends a message** in the arch chat, with the watermark moved to now so no
  history replays. No Arm press.
- Armed already survives a restart (the loop store persists `Active`); nothing changes
  there. Stop and the autopilot gate remain the off switches.
- The role prompt tells the arch agent it keeps being woken for other repos while a
  question waits, and not to repeat the question unless something changed.

## Out of scope

Errored turns and the Operator's own Stop still disarm (an errored CLI must not be
retried blindly; Stop is an explicit act). Auto-arming a harness that has never been
armed.
