## REMOVED Requirements

### Requirement: Armed auto-rollback after a healthy deploy
**Reason**: The dead-man's switch protected against a harness that would not come up after a deploy; that no longer happens in practice, and the 15-minute keep ritual (and the fleet's wait-for-arm-then-disarm dance) was only friction. A healthy deploy is final.
**Migration**: `swap.ps1` arms nothing; `-RollbackMinutes` / `-NoArm` are gone; `arm-rollback.ps1`, `auto-keep.ps1` and the seeded `arm.ps1` are deleted. A `ClaudeWebAutoRollback` timer left by an older build is retired once at harness startup (and by `keep.ps1` / `rollback.ps1` if run).

### Requirement: Operator disarm keeps the deploy
**Reason**: There is no armed rollback to disarm, so "keep it" has nothing to do.
**Migration**: `keep.ps1` remains as a harmless no-op that prints "keep is no longer needed"; `POST /api/deploy/keep` and the Deployments tab's "Keep it" are removed; no runbook, prompt or tool tells anyone to keep.

## MODIFIED Requirements

### Requirement: Last-good snapshot before swap

The deploy SHALL capture the currently-live build before it is overwritten, so a
previous build always exists to roll back to **on purpose** (and for the inline restore
when the health check fails). After stopping live and **before** the destructive mirror
that replaces the run directory, the deploy SHALL mirror the current run directory to a
`run-bin.lastgood` snapshot, excluding the live `logs/` directory. On a cold deploy —
where no live build exists to capture — the deploy SHALL skip the snapshot and SHALL
record that no rollback point exists for that deploy.

#### Scenario: Snapshot taken before a warm swap

- **WHEN** a deploy stops a build that is already serving and is about to swap in a new build
- **THEN** the current run directory is mirrored to `run-bin.lastgood` before the new build overwrites it
- **AND** the live `logs/` directory is excluded from the snapshot

#### Scenario: Cold deploy has no rollback point

- **WHEN** a deploy runs with nothing currently serving the port
- **THEN** no last-good snapshot is captured
- **AND** the deploy records that no rollback point exists for this deploy

### Requirement: Restore preserves runtime state

A rollback SHALL restore the last-good build by mirroring it over the run directory —
never a partial copy — while preserving runtime state: the live `logs/` directory and
the operator's `appsettings.json` SHALL be excluded from the mirror, and the
`%APPDATA%` data store SHALL never be touched.

#### Scenario: Mirror restore protects logs, config, and data

- **WHEN** a rollback restores the last-good build over the run directory
- **THEN** it mirrors the full last-good tree (not a partial copy)
- **AND** the live `logs/` directory and `appsettings.json` are preserved
- **AND** the `%APPDATA%` data store is left untouched

## ADDED Requirements

### Requirement: A healthy deploy is final

After swapping in a new build and restarting, the deploy SHALL treat the health check as
the success gate and nothing else: when it passes, the deploy SHALL end with the new
build live, SHALL arm no timer or scheduled task, and SHALL require no further action
("keep") from anyone. No script, prompt, tool output or runbook SHALL tell an operator or
agent to keep a deploy.

#### Scenario: Healthy deploy just stays

- **WHEN** a deploy swaps in a new build and the post-restart health check passes
- **THEN** the deploy logs that it is final and exits with no `ClaudeWebAutoRollback` (or any other) task registered

#### Scenario: Legacy timer retired

- **WHEN** a harness starts and finds a `ClaudeWebAutoRollback` task left by an older build
- **THEN** it deletes the task once and logs that deploys are final

### Requirement: Manual rollback stays available

The deploy tooling SHALL keep a deliberate rollback path: `rollback.ps1` restores the
last-good snapshot and restarts, runnable by hand at any time and from the Deployments
tab behind a typed confirmation; the tab SHALL show whether a last-good snapshot exists
and when it was captured. Nothing SHALL trigger this rollback automatically except the
deploy's own inline restore after a failed health check.

#### Scenario: Roll back on purpose

- **WHEN** the operator runs `rollback.ps1` or confirms "Roll back now" in the Deployments tab
- **THEN** the last-good build is restored over the run directory and restarted, and the ledger records a rollback

#### Scenario: Nothing rolls back by itself

- **WHEN** a healthy deploy is left untouched for any length of time
- **THEN** the new build stays live
