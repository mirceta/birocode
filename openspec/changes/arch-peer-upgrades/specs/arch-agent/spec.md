## ADDED Requirements

### Requirement: A peer can be upgraded by its fleet on request

Every harness SHALL expose `POST /api/arch/peer/upgrade` behind the password
middleware and a receiver opt-in "accept fleet upgrades" (off by default,
persisted beside "accept fleet sends" and reported in the peer describe). An
accepted request SHALL fetch and check out the requested ref (default: the
caller's main commit), carry any template-declared missing keys into the
preserved live configuration with their defaults, and run the harness's own
committed deploy script detached with its guard, stage-before-stop and dead-man
switch intact. The job SHALL be pollable, SHALL refuse a second concurrent job,
and SHALL disarm its own dead-man switch only after the health check passes and
the new version is reported; otherwise last-good SHALL be restored as today.

#### Scenario: Opt-in off

- **WHEN** a peer receives an upgrade request while "accept fleet upgrades" is off
- **THEN** it answers `not-accepting` and runs nothing

#### Scenario: Healthy upgrade keeps itself

- **WHEN** the deploy restarts the peer, its health check passes and its describe reports the requested version
- **THEN** the peer disarms its dead-man switch and the job reports `done` with the new version

#### Scenario: Broken build restores last-good

- **WHEN** the new build fails its health check or never reports the new version within the window
- **THEN** the dead-man switch restores last-good and the job reports `rolled-back`

### Requirement: The arch agent sees version drift and can drive an upgrade

The arch agent's `list_machines` and the Fleet card SHALL show each subscribed
peer's build version against this harness's, flagging drift, and the wake
briefing SHALL mention drift. A tool `upgrade_peer(machine, ref?)` SHALL start a
peer upgrade only when the arch loop is armed, the source allows sends, the peer
accepts upgrades and its version differs from the requested ref; every call SHALL
be audited and the outcome reported on a later wake.

#### Scenario: Drift is visible

- **WHEN** a peer runs an older build than this harness
- **THEN** `list_machines` marks it as behind and names both versions

#### Scenario: Upgrade refused for a current peer

- **WHEN** `upgrade_peer` targets a peer already on the requested ref
- **THEN** the tool returns `current` and no request is sent
