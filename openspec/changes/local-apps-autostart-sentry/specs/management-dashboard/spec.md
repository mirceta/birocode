## ADDED Requirements

### Requirement: The Operator marks which registered local apps come up after a reboot
The Management dashboard SHALL have a Local apps tab listing every registered local app of every machine of the fleet: machine, agent, app, port/URL, its start command and where that command comes from. Each app SHALL have an Autostart toggle, an optional health URL with an expected status, a start order and a delay, and an optional start command of its own. An app without any start command SHALL NOT be flaggable until one is given. The flags SHALL be stored on the hub, the single writer, and pushed to each machine as a versioned slice; a machine that missed a push SHALL be re-pushed when it next answers with an older version.

#### Scenario: Flagging an app on another machine
- **WHEN** the Operator types a start command for an app on spacex and switches its Autostart on
- **THEN** the hub stores the flag and spacex's harness holds the same flag in its own slice

### Requirement: Each machine starts its flagged apps at boot and on demand
Each machine's harness SHALL, shortly after it starts and when the Operator presses Apply now, start each flagged app that does not answer: detached, in the flagged order, with each app's delay, using its start command in its folder. Every attempt SHALL be logged. Apply SHALL never stop an app that is running, and SHALL never start an app that is not flagged.

#### Scenario: After a reboot
- **WHEN** a machine's harness starts and two of its flagged apps are not listening
- **THEN** it launches both, in order, and an unflagged app on the same machine stays down

### Requirement: A sentry verifies the flagged apps and restarts a failed one once
Every N minutes (configurable, default 5), each machine SHALL probe its flagged apps: the health URL with the expected status when set, else the TCP port. A failed app SHALL get one restart attempt, stopping a hung listener first. If it still fails after that attempt, or fails again within the restart cooldown, it SHALL be marked failing, with no further automatic restarts until it answers again or the Operator applies. A just-launched app SHALL get a start grace until it is first seen up. The tab SHALL show each app's state, last check and last start with its result, and the tab's label SHALL carry a red count of flagged apps that are down or failing.

#### Scenario: An app is killed
- **WHEN** a flagged app that was up stops listening
- **THEN** the next sentry pass restarts it once and it shows up again

#### Scenario: An app cannot start
- **WHEN** a flagged app's restart attempt does not bring it back
- **THEN** it is marked failing, the tab's badge counts it, and later passes do not start it again
