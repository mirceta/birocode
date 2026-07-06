# agent-dock

## ADDED Requirements

### Requirement: Agent dock reconstructed from the collected feed
The events-app primary page SHALL offer an Agents tab rendering a dock — one card per collector source (machine), each containing one square per repository that `turn.*` events have been observed for on that source — reconstructed client-side from the already-polled collector feed, with no additional endpoint or request. Each square SHALL show the repository name, a running indicator while a `turn.start` has no matching `turn.ended` (dropped again after the board's running-max-age), and run count plus last-activity age. A source with no observed agent activity SHALL render its card with an explicit empty note. The tab SHALL state that it reconstructs from the recent retained trail.

#### Scenario: Seeing what runs where
- **WHEN** agents have produced turn events on several machines
- **THEN** the Agents tab shows each machine's card with a square per repository worked on, and squares with unfinished `turn.start` events show a running indicator

#### Scenario: Old harness without start events
- **WHEN** a source emits only `turn.ended` events (no `turn.start`)
- **THEN** its repo squares and trails render from finish events alone and the running indicator simply never lights

#### Scenario: Machine with no activity
- **WHEN** a registered source has produced no `turn.*` events within the retained feed
- **THEN** its card renders with an explicit "no agent activity observed" note, never blank

### Requirement: Trail drill-down per machine and repository
Clicking a repo square outside display mode SHALL open the reconstructed trail for that machine × repository — newest first: started rows for open runs, finished rows with status, duration when both ends were observed, and turns/cost when reported — with a close affordance. In display mode squares SHALL be inert and no trail SHALL render.

#### Scenario: Reading a repo's trail
- **WHEN** the Operator clicks a repo square outside display mode
- **THEN** the trail for that machine × repo opens in place, showing each run's start/finish, status, and duration where derivable

#### Scenario: Display mode stays glanceable
- **WHEN** the page is in display mode
- **THEN** dock cards and running indicators render, but squares have no click affordance and no trail opens
