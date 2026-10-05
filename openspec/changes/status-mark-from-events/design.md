# Design — status-mark-from-events

## D1 · The dock's latch stays the authority where it speaks

Nothing changes for a machine on a build with PR #142 and a docked repo: its latch decides,
and the hub's record is acknowledged through the latest finish whenever the latch says "nothing
unchecked", so a later loss of the latch (the repo undocked, a build changed) never surfaces an
old finish as new.

## D2 · Where it cannot speak, the event feed does

"Cannot speak" = the describe carries no `unseenResult` (a build before the field) or the repo
holds no dock there (`docked == false`). The collector already pulls `turn.ended` from every
machine on a cursor — a log, not a sampled state — so a finish is not missed because the Status
tab was closed or the describe was stale. The rule for a finish is the dock trigger's: not the
read-only ask lane, status `done` or `error`.

## D3 · Restart-safe in the producer's clock

Finish and acknowledgement are compared in the producing machine's clock (the event's `at`),
never against the hub's. A backlog pull is told apart from a live pull (`after < 0`) so a hub
restart re-raises nothing already checked and still counts what ended while it was down.

## D4 · The dismiss goes where the mark lives

`MarkAgentChecked` acknowledges the hub's record first; the peer relay happens only where the
peer's latch speaks. A peer without the endpoint (`no-peer-api`) with a cleared hub record is a
success, not a 502.
