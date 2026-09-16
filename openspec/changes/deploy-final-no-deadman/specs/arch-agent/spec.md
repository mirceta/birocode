## ADDED Requirements

### Requirement: A peer upgrade is final when the peer answers on the new build

When a harness deploys itself on a fleet arch's `upgrade_peer` request, it SHALL run the
committed guarded deploy (origin/main guard, stage-before-stop, restart, health check)
and SHALL report the job `done` as soon as the process serving requests is the target
commit — without waiting for, arming or disarming any rollback timer. A failed health
check SHALL make the deploy restore last-good inline and the job SHALL read
`rolled-back`; an abort in the deploy log SHALL read `failed`. The arch's role prompt
SHALL describe the upgrade as final when healthy and SHALL not mention an auto-rollback
or a keep step.

#### Scenario: Healthy upgrade is done at once

- **WHEN** a peer restarts on the requested commit and answers the health check
- **THEN** its upgrade job reports `done` with a detail saying the deploy is final, and no `ClaudeWebAutoRollback` task exists on that machine

#### Scenario: Unhealthy upgrade is restored inline

- **WHEN** a peer's new build fails the post-restart health check
- **THEN** the deploy restores last-good itself and the job reports `rolled-back`
