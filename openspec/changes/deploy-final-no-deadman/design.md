# Design

## The lifecycle, before and after

| Step | Before | After |
|---|---|---|
| Guard, build, stage-before-stop | same | same |
| Snapshot live → `run-bin.lastgood` | yes | yes (the manual rollback point) |
| Swap, restart, health check | yes | yes — the health check is the success gate |
| Health FAILED | `rollback.ps1` inline | `rollback.ps1` inline (unchanged) |
| Health OK | arm `ClaudeWebAutoRollback` (15 min); operator must run `keep.ps1` or it reverts | **final** — log `deploy FINAL`, nothing armed, nothing to keep |
| Undo later | only inside the window, or by hand | by hand, any time: `rollback.ps1` or the Deployments tab's typed-confirm button |

## What was removed, file by file

- `arm-rollback.ps1`, `auto-keep.ps1`, `ClaudeWeb.App/Deploy/templates/arm.ps1.tmpl` —
  deleted. `DeployScriptProvisioner.ScriptNames` seeds `swap.ps1` + `rollback.ps1` only.
- `swap.ps1` — `-RollbackMinutes` / `-NoArm` gone; section 7 is now "healthy = final,
  unhealthy = restore now".
- `DeployService` — `RollbackInfo`/`Disarm` gone; `DeployStatus.ManualRollback`
  (`LastGoodPresent`, `LastGoodAt`) replaces the armed state. `POST /api/deploy/keep` gone.
- `Deployments.jsx` — the armed countdown card becomes a "Manual rollback" card: the
  final-deploy note, the last-good snapshot's age, "Roll back now" behind the typed confirm.
- `PeerUpgradeService` — `ArmGrace` and the wait-for-arm/disarm branch gone; the pure
  `Outcome(runningIsTarget, target, rolledBackSince, aborted, age)` rule says `done` the
  moment the target build answers.
- Arch role prompt: "runs the same guarded deploy a person would; a healthy restart is
  final (no auto-rollback timer, nothing to keep)" — marker v11.

## What was kept on purpose

- `rollback.ps1` and the last-good snapshot: the deliberate rollback path. The script
  still deletes a `ClaudeWebAutoRollback` task if one exists — pure cleanup for a machine
  that last deployed with an older build; it never arms anything.
- `keep.ps1` as a no-op with a message. Deleting it would turn "keep it" from an old
  runbook or a peer on an older build into a "file not found"; a one-line answer is kinder
  and costs nothing. Nothing in the repo calls it.

## Migration on the first deploy of this change

The build that deploys this change is deployed BY the old `swap.ps1` of the previous
checkout only if the operator deploys from an old tree; deploying from this tree uses the
new script and arms nothing. Either way, `DeployService` retires a leftover
`ClaudeWebAutoRollback` timer once at startup (logged), so no build carrying this change
can be reverted by the old timer.

## Tests

`DeployLifecycleTests` reads the repo's own scripts and notes: swap arms nothing, names
no keep, still snapshots and health-checks and restores inline on failure; the dead-man
files are gone; `keep.ps1` says it is no longer needed; the seeded tooling has no arm
script; CLAUDE.md and the runbook no longer tell anyone to keep. `PeerUpgradeTests`
covers the `Outcome` rule (done at once on the target build, no grace; rolled-back /
failed / window-end otherwise). Role-marker pins bumped to v11.
