## MODIFIED Requirements

### Requirement: Triggered from the agent dock

The system SHALL let the operator trigger discovery for a repository from that
repository's agent dock in the dashboard, via an explicit "Discover local apps" action.
When invoked, the action SHALL run discovery for the dock's repository and present the
returned structured findings (name and port per app) to the operator. From the presented
findings, the operator SHALL be able to **register** a discovered app as a local app with
a single per-row action that submits that app's name and port to the existing
registered-apps endpoint; a discovered app whose port already matches a registered local
app SHALL instead be shown as already registered rather than offering the register action.
The discovery scan itself remains read-only — registration is a separate, operator-initiated
call to the registered-apps endpoint, not a side effect of discovery. The action is an
Advanced-mode affordance.

#### Scenario: Click discovers the dock's repo

- **WHEN** the operator clicks "Discover local apps" in an agent dock pinned to a repository
- **THEN** discovery runs for that dock's repository and the structured list of discovered apps (with ports) is shown in that dock

#### Scenario: Per-dock scope

- **WHEN** the operator triggers discovery from a dock pinned to one repository while other docks are pinned to other repositories
- **THEN** only the triggering dock's repository is scanned for that action

#### Scenario: Register a discovered app from the dock

- **WHEN** the operator clicks the register action on a discovered app that is not yet registered
- **THEN** that app's name and port are submitted to the registered-apps endpoint, and once it is registered the dock's local-app list (and the discovered row's state) reflect the new app without a manual refresh

#### Scenario: Already-registered app shows its state

- **WHEN** a discovered app's port matches an app that is already registered for that repository
- **THEN** the dock shows that discovered row as already registered and does not offer the register action for it

#### Scenario: A failed registration is surfaced for that row

- **WHEN** registering a discovered app fails
- **THEN** the failure is shown for that discovered row and the rest of the discovered list remains actionable
