# deploy Specification

## Purpose
TBD - created by archiving change add-deploy-deadman-switch. Update Purpose after archive.
## Requirements
### Requirement: Last-good snapshot before swap

The deploy SHALL capture the currently-live build before it is overwritten, so a
healthy previous build always exists to roll back to. After stopping live and **before**
the destructive mirror that replaces the run directory, the deploy SHALL mirror the
current run directory to a `run-bin.lastgood` snapshot, excluding the live `logs/`
directory. On a cold deploy — where no live build exists to capture — the deploy SHALL
skip the snapshot and SHALL record that no auto-rollback is possible for that deploy.

#### Scenario: Snapshot taken before a warm swap

- **WHEN** a deploy stops a build that is already serving and is about to swap in a new build
- **THEN** the current run directory is mirrored to `run-bin.lastgood` before the new build overwrites it
- **AND** the live `logs/` directory is excluded from the snapshot

#### Scenario: Cold deploy cannot roll back

- **WHEN** a deploy runs with nothing currently serving the port
- **THEN** no last-good snapshot is captured
- **AND** the deploy records that auto-rollback is not available for this deploy

### Requirement: Armed auto-rollback after a healthy deploy

After swapping in a new build, restarting, and confirming health, the deploy SHALL arm
a one-time scheduled task that restores the last-good build after a bounded window
(default 15 minutes) unless an operator disarms it first. The window SHALL be
configurable, and the deploy SHALL provide an opt-out that deploys without arming the
task. Arming SHALL be skipped when no last-good snapshot was captured.

#### Scenario: Healthy deploy arms the switch

- **WHEN** a deploy swaps in a new build and the health check passes
- **AND** a last-good snapshot was captured
- **THEN** a one-time `ClaudeWebAutoRollback` task is armed to restore last-good after the configured window

#### Scenario: Opt-out skips arming

- **WHEN** a deploy is run with the no-arm option, or no last-good snapshot exists
- **THEN** the deploy completes without arming the auto-rollback task

### Requirement: Immediate rollback when a new build is unhealthy

When a freshly swapped-in build fails its health check, the deploy SHALL roll back to
the last-good build immediately and inline, without waiting for the timed window.

#### Scenario: Failed health check rolls back at once

- **WHEN** a deploy swaps in a new build and the post-restart health check fails
- **AND** a last-good snapshot exists
- **THEN** the last-good build is restored immediately rather than after the timed window

### Requirement: Operator disarm keeps the deploy

The deploy SHALL provide an explicit "keep it" action that disarms the armed
auto-rollback so the new build stays live permanently. If the action is never invoked
within the window, the armed task SHALL fire and restore the last-good build with no
operator present.

#### Scenario: Keeping it disarms the switch

- **WHEN** the operator invokes the "keep it" disarm after a healthy deploy
- **THEN** the `ClaudeWebAutoRollback` task is deleted and the new build stays live

#### Scenario: Unattended break self-heals

- **WHEN** a healthy deploy is left untouched and the new build breaks down before the window elapses
- **THEN** the armed task fires, restores the last-good build, restarts, and confirms health with no operator action

### Requirement: Restore preserves runtime state and is locale-safe

A rollback SHALL restore the last-good build by mirroring it over the run directory —
never a partial copy — while preserving runtime state: the live `logs/` directory and
the operator's `appsettings.json` SHALL be excluded from the mirror, and the
`%APPDATA%` data store SHALL never be touched. The auto-rollback SHALL be scheduled
with an absolute date-time trigger rather than a locale-parsed date string, so the
trigger fires at the intended time regardless of the host's date format.

#### Scenario: Mirror restore protects logs, config, and data

- **WHEN** a rollback restores the last-good build over the run directory
- **THEN** it mirrors the full last-good tree (not a partial copy)
- **AND** the live `logs/` directory and `appsettings.json` are preserved
- **AND** the `%APPDATA%` data store is left untouched

#### Scenario: Trigger fires regardless of host locale

- **WHEN** the auto-rollback task is armed on a host whose date format is day-first
- **THEN** the task fires at the intended time because it is scheduled with an absolute date-time, not a locale-parsed date string

