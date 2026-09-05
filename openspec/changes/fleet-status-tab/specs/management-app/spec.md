## ADDED Requirements

### Requirement: Status tab

The Management App SHALL have a Status tab showing every repo agent on every machine
of the fleet in the dashboard dock strip's language, sourced from one hub endpoint
that never waits on a peer.

#### Scenario: Reading the fleet

- **WHEN** the operator opens the Status tab
- **THEN** each machine renders a header (reachability, build, whether it is behind
  the hub, its opt-ins, how many repos its arch manages) and a strip of agent chips,
  each showing the running dot, the repo name, its branch, and whether that branch is
  the default (free to be given work)

#### Scenario: Filtering

- **WHEN** the operator picks "on main", "not on main" or "running"
- **THEN** only matching agents remain in every strip and the filter shows its count

#### Scenario: Agent detail

- **WHEN** the operator clicks a chip
- **THEN** a detail card shows branch vs default, dirty state, running time or last
  actor, availability and arch scope, and for a local dock a link that opens it

### Requirement: Events page without an Agents tab

The events page SHALL NOT offer an Agents tab; the fleet's agent state lives in the
Management App's Status tab.

#### Scenario: Tabs on the events page

- **WHEN** the events page loads
- **THEN** its tabs are Activity, GitHub and Sounds plus the Manage link
