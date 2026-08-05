## ADDED Requirements

### Requirement: OpenSpec lane in the agent dock

The agent dock's lane switcher SHALL offer an **OpenSpec** lane as a sibling of the existing
Builder, Ask, Files, and Console lanes. Selecting the OpenSpec lane SHALL display the harness
OpenSpec Cockpit (the read-only in-flight · shipped · baseline inspect surface) rendered over
the chat, with the composer remaining below — the same overlay behavior as the Files and
Console lanes. Selecting any other lane, or opening a local app, SHALL swap back out of the
OpenSpec view. The lane SHALL be gated by an Advanced-default capability flag, consistent with
the Files and Console lanes, so Basic mode does not show it unless the operator opts in.

#### Scenario: The OpenSpec lane appears beside the other lanes

- **WHEN** an operator views an agent dock in Advanced mode
- **THEN** the lane switcher shows an OpenSpec lane alongside Builder, Ask, Files, and Console

#### Scenario: Selecting OpenSpec shows the Cockpit over the chat

- **WHEN** the operator selects the OpenSpec lane on a dock
- **THEN** the OpenSpec Cockpit is shown over the chat while the composer remains below,
  and selecting another lane or opening a local app swaps back out of it

#### Scenario: The lane is hidden in Basic mode by default

- **WHEN** the dock is viewed in Basic mode and the operator has not enabled the lane
- **THEN** the OpenSpec lane is not shown

### Requirement: The OpenSpec lane is scoped to the dock's own repository

The OpenSpec Cockpit shown in a dock's OpenSpec lane SHALL reflect the OpenSpec state of
**that dock's repository**, independent of the harness's global repo selection. Two docks
bound to two different repositories SHALL each show their own repository's OpenSpec state at
the same time, and changing the global repo selection SHALL NOT change what a dock's OpenSpec
lane displays.

#### Scenario: Each dock shows its own repository's OpenSpec state

- **WHEN** two docks bound to different repositories both have the OpenSpec lane selected
- **THEN** each dock's OpenSpec view reflects its own repository's changes and baseline, not
  the other's and not the globally selected repository's

#### Scenario: Global repo selection does not alter a dock's OpenSpec lane

- **WHEN** the operator changes the global repo selector while a dock's OpenSpec lane is open
- **THEN** that dock's OpenSpec view continues to reflect the dock's own repository
