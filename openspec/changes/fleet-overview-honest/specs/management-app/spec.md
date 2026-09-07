## ADDED Requirements

### Requirement: The Fleet Status Overview is complete, honest and readable
The Fleet Status Overview SHALL show, for every machine, every fact the header status
strip shows for a machine — harness build, host clock (time, date, timezone), GitHub
account, Claude account and plan, Claude plan usage (the 5-hour window, the weekly
quota and any per-model weekly limit, each with percent and reset time, plus stale /
unavailable), the admin state with its underlying facts — and the machine's fleet
posture, from ONE per-machine overview record produced by that machine's own probes
and carried in its describe. A value the machine cannot report SHALL be shown as
"unknown" with its reason (machine not reachable, build reports no overview, build
predates the field, not probed yet, no session, unavailable with the probe's error),
never as a blank. Labels and values SHALL meet WCAG AA contrast (≥ 4.5:1) on their
surface in both colour schemes.

#### Scenario: A peer on this build
- **WHEN** the hub polls a peer running this build whose Claude session is signed in
- **THEN** that machine's Overview shows its 5-hour and weekly usage meters with reset times, its host clock in its own zone, and its admin facts

#### Scenario: A peer on an older build
- **WHEN** the hub polls a peer whose describe carries the old overview without usage
- **THEN** the usage rows read "unknown — this machine's build predates this field" while the older facts still show

#### Scenario: Readable
- **WHEN** the Overview renders on the light Management page
- **THEN** every label and value has at least 4.5:1 contrast against its card
