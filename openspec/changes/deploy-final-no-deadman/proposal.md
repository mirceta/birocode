# Deploy flow: a healthy deploy is final (no dead-man's switch, no keep step)

## Why

Every deploy armed a 15-minute auto-rollback (`ClaudeWebAutoRollback`) and someone had
to run `keep.ps1` in time or the harness reverted itself. That protected against an
era when an agent could ship a harness that would not come up. It basically never
happens now: the harness always comes up (a feature may be imperfect, but the app
deploys), so the timer only ever fired by accident — a session killed by the very
restart it triggered, a keep forgotten while testing — and the keep ritual became pure
friction, including in the fleet: `upgrade_peer` had to wait for the arm to land so it
could disarm it. The Operator asked (2026-09-16) to remove it.

## What changes

- **A deploy that passes its health check is final.** `swap.ps1` still does every
  pre-check — origin/main guard, build, stage-before-stop, restart, **health check as the
  success gate** — and on a healthy restart it simply stays. Nothing is armed, no timer,
  nothing to disarm.
- **The dead-man pieces are removed.** `arm-rollback.ps1`, `auto-keep.ps1` and the seeded
  `arm.ps1.tmpl` are deleted; `swap.ps1` loses `-RollbackMinutes` / `-NoArm`; the
  Deployments tab loses the armed countdown and "Keep it"; `POST /api/deploy/keep` is gone.
- **`keep.ps1` is a harmless no-op** (chosen over deleting it): it prints "keep is no
  longer needed" so an operator, an older peer runbook or an agent that still says "keep
  it" gets a clear answer instead of an error. If an OLDER build left a
  `ClaudeWebAutoRollback` timer registered, it removes it as a courtesy. No caller
  invokes it any more.
- **Manual rollback stays.** `swap.ps1` still snapshots the live build to
  `run-bin.lastgood` before the swap; `rollback.ps1` still restores it — inline when the
  health check fails, and on purpose whenever a human runs it or clicks the Deployments
  tab's typed-confirm "Roll back now". The tab now shows the snapshot's presence and age.
- **Migration.** `DeployService` retires a legacy `ClaudeWebAutoRollback` timer once at
  startup, so the first build carrying this change is not reverted by the old build's
  timer.
- **Fleet.** `upgrade_peer` / the peer's startup reconcile mark the job `done` the moment
  the target build answers — no waiting for an arm, no disarm. The arch role prompt says
  so (marker v11); docs and the event-feed contract follow.

## Non-goals

No change to the guard, the staged build, the run-dir layout, the ledger, or what
`rollback.ps1` restores. Nothing here makes rollbacks automatic again.
