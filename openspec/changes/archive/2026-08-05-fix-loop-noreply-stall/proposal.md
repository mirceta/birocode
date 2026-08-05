# fix-loop-noreply-stall

## Why

The first pinned-session goal-loop run (2026-07-27, right after
fix-loop-conversation-identity shipped) sent iteration 1 correctly — and then
stalled forever. The CLI run completed ("Done, 1 turn") but wrote NO assistant
message into the transcript (an empty completion; Claude Code later stamped a
synthetic "No response requested." placeholder). The engine's drive dedup guard
waits for the pinned session's trailing assistant message to CHANGE before it
will decide again; with no reply the snippet never moved, so every 10s tick was
swallowed by the guard. No error, no retry, no state change — the loop showed
"looping" while doing nothing until the user disarmed it by hand.

The same guard also starves the error ladder: a send whose run *errors* without
writing a reply leaves the snippet unmoved too, so the run-error stop in the
kind's decision never gets a chance to fire.

## What Changes

- **No-reply escape (engine)**: when a drive-mode send's run has completed but
  the trailing assistant message still equals the snippet the send was issued
  against, the engine waits ONE grace tick (covers transcript flush), then
  clears the dedup guard and lets the kind decide again — for a driven kind
  that means re-sending the prompt as the next iteration, so the existing
  iteration cap bounds the retries. The interim state is surfaced ("run done
  with no new reply — retrying"), not silently idle.
- **Consecutive-miss stop**: after 3 consecutive reply-less runs the loop
  resolves with status `error`, stop reason `no-reply`, instead of burning
  turns forever. A reply arriving (snippet moves) resets the miss counter, and
  re-arming clears both escape guards like the other per-repo dedup state.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `autopilot-loops` (change-tree capability; no baseline spec yet — additive
  requirements)
