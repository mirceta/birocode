# autopilot-loops — delta

Fixes the drive-loop stall found in the first pinned-session goal-loop run: a
send whose run completes without writing an assistant reply left the dedup
guard waiting forever on a trailing message that would never change.

## ADDED Requirements

### Requirement: A reply-less run does not stall a drive loop

The engine SHALL treat a drive-mode send whose run has completed while the
loop's pinned session still shows the same trailing assistant message the send
was issued against as having produced no reply: after one engine tick of grace
(to absorb transcript flush lag), it SHALL clear the drive dedup guard and
let the loop's kind decide again, surfacing the interim state in the
agent's autopilot status rather than idling silently. Each retry send SHALL
bump the iteration counter as a normal send, so the iteration cap bounds
retries.

#### Scenario: Empty completion retries instead of stalling

- **WHEN** a goal loop's send completes with no new assistant message in the pinned session
- **THEN** within two engine ticks the loop sends again as the next iteration instead of idling until disarm

#### Scenario: Errored run without a reply reaches the error stop

- **WHEN** a drive send's run ends in status error without writing an assistant reply
- **THEN** the guard is cleared and the kind's decision runs (instead of the guard swallowing every tick before it)

### Requirement: Consecutive reply-less runs stop the loop

The engine SHALL count consecutive reply-less runs per drive loop and, after
the third, resolve the loop with status `error` and stop reason `no-reply`
instead of retrying further. A run that does produce a new assistant reply
SHALL reset the counter, and re-arming SHALL clear both the counter and the
grace marker along with the other per-repo dedup guards.

#### Scenario: Third miss stops with no-reply

- **WHEN** three consecutive sends of a drive loop each complete without a new assistant reply
- **THEN** the loop resolves with status error and stop reason no-reply, visible in the loop readout

#### Scenario: A real reply resets the miss count

- **WHEN** a send finally produces a new assistant reply after an earlier miss
- **THEN** the miss counter resets and the loop continues judging replies normally
