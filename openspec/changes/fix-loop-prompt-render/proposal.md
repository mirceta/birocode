# fix-loop-prompt-render

## Why

During the 2026-07-28 goal-loop test the End User watched the pinned
conversation while the loop drove it — and saw only the assistant's answers
appearing, never the questions. Investigation (understanding-app, same date)
found the cause: the stable SSE contract has no user-message event. The user
bubble is drawn client-side by the composer (`sendTo()`), but an autopilot
send never goes through the composer — the open page discovers the run via
the 5s reconcile poll and `attachToRun()` only appends an empty assistant
bubble and streams the reply into it. The prompts exist in the transcript on
disk, so a full refresh shows them; live, nothing ever draws them.

(A second symptom from the same test — the FIRST send's user line missing
even after refresh — turned out to be a Claude CLI persistence quirk: v2.1.220
never wrote the `user` line for the first resumed `-p` run. That is outside
the Harness's render path and out of scope here; the Harness's own durable
record of every send remains the autopilot audit log.)

## What Changes

- **Engine emits the prompt as a stream event**: `AutopilotService.SendPrompt`
  emits a synthetic `{type:"user", text, actor:"loop"}` event into the claimed
  run's seq-numbered buffer BEFORE the CLI starts. Because it lands in the
  RunSession buffer it is broadcast to attached clients and replayed to late
  attachers (`GET /api/chat/stream?after=N`) exactly like every other event.
- **Client renders the new event**: `makeEventHandler` gains a `case 'user'`
  that draws the user bubble the composer would have drawn — inserted above
  the trailing empty assistant bubble that `attachToRun` appends before
  replay, or appended (with a fresh assistant bubble) when no such bubble
  exists.
- User-typed sends are unaffected: the composer path does not emit or receive
  the event, so no duplicate bubbles.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `chat` — server-initiated prompts become visible in the live conversation
  (ADDED requirement).
- `autopilot-loops` (change-tree capability; no baseline spec yet — additive
  requirement for the engine-side emit).
