## ADDED Requirements

### Requirement: A loop names who armed it and its transitions are published on the harness feed
Every loop instance SHALL record who armed it — `operator` (the Loop panel and the loop
endpoint), `arch` (the arch agent's `start_loop`) or `arch@<machine>` (a fleet arch through
the peer API) — and the ungated loop projection SHALL carry it as `armedBy`. The dock Loop
panel SHALL show "by arch" (or the machine) on the summary and the armed row for a loop
the Operator did not arm, and SHALL let the Operator edit, flip, stop and re-arm it exactly
as their own; the Operator's re-arm is a new arming by the operator. A stop by the arch
SHALL resolve the loop `stopped` with reason `arch`; the button's `user` wording is
unchanged. The loop store SHALL publish on the harness feed, with the repo as source and
status words only (kind, mode, status, iterations, cap, who armed it, reason, detail):
`loop.armed` on every arming, `loop.fired` on every send, and `loop.escalated`,
`loop.capped`, `loop.done`, `loop.error` or `loop.stopped` when the loop resolves.

#### Scenario: Armed by the arch, stopped by the Operator
- **WHEN** the arch arms a goal loop on a repo and the Operator later presses Disarm on that repo's dock
- **THEN** the panel showed the loop as armed "by arch" until then, and the loop resolves `stopped · user` as any of the Operator's own

#### Scenario: Transitions on the feed
- **WHEN** a recipe loop is armed, sends twice and hits its cap
- **THEN** the feed carries `loop.armed`, `loop.fired`, `loop.fired`, `loop.capped` for that repo, each with the kind, the iterations and who armed it, and no prompt text
