# openspec-cockpit Specification

## Purpose
TBD - created by archiving change add-openspec-cockpit. Update Purpose after archive.
## Requirements
### Requirement: A read-only Cockpit tab in the Control Room

The Control Room app (`openspec-port-app/`) SHALL present a **Cockpit** tab that displays
live OpenSpec state read-only, as the inspect-twin of the Console tab. The tab SHALL NOT
expose any action that creates, archives, validates, or otherwise mutates OpenSpec
artifacts — every such action stays in the Console tab. Adding the Cockpit SHALL NOT
remove or alter any existing Control Room tab.

#### Scenario: Open the Cockpit

- **WHEN** the operator selects the Cockpit tab
- **THEN** the current OpenSpec state is shown without running any mutating command, and the existing tabs (Console, Control, Workflows, …) remain available

### Requirement: Show in-flight changes with completion status

The Cockpit SHALL list every active change (the contents of `openspec/changes/` excluding
`archive/`), sourced from `openspec list --json`, each showing its name, `status`, last
modified time, and task completion as `completedTasks` of `totalTasks`. Selecting a change
SHALL show its deltas from `openspec show <id> --json` and its task checklist read from the
change's `tasks.md` (which `openspec show --json` does not include), grouped by section with
each item's done state.

#### Scenario: Inspect an active change

- **WHEN** there is an active change with some tasks complete and the operator selects it
- **THEN** the Cockpit shows its completion (e.g. 15 of 19) and status, and on selection reveals its deltas and per-task checklist

#### Scenario: No active changes

- **WHEN** there are no active changes
- **THEN** the in-flight section shows an explicit empty state rather than an error or a blank panel

### Requirement: Show shipped (archived) changes

The Cockpit SHALL list shipped changes read from `openspec/changes/archive/`, newest
first, each showing the ship date taken from the archived folder's date prefix and the
title taken from that change's `proposal.md` heading. Because no OpenSpec CLI command
enumerates archived changes, the server SHALL read the `archive/` directory directly.

#### Scenario: Review what shipped

- **WHEN** one or more changes have been archived
- **THEN** the Cockpit lists them newest-first with each one's ship date and proposal title

### Requirement: Show the living baseline of capabilities

The Cockpit SHALL list the baseline specifications from `openspec spec list --json`, each
showing the capability id and its requirement count, and SHALL let the operator open a
capability to read its requirements and scenarios via `openspec show <cap> --json`. This
is the Cockpit's answer to "what does the system do today?".

#### Scenario: Read a capability's baseline

- **WHEN** the operator opens a capability from the baseline list
- **THEN** the Cockpit shows that capability's requirements and their scenarios

### Requirement: Cross-link in-flight changes to the baseline they touch

The Cockpit SHALL surface the delta relationship between active changes and the baseline:
each in-flight change SHALL show the capabilities its delta specs touch (each badged by its
ADDED / MODIFIED / REMOVED operation), and each baseline capability SHALL indicate how many
active changes are currently editing it. The data SHALL come from the existing
`GET ./api/cockpit` aggregation — each active change carries the capabilities it touches — so
no new endpoint or mutating verb is introduced. A capability with no active change against it
SHALL show no indicator, and a net-new (ADDED) capability not yet in the baseline SHALL appear
only on its change's forward tags.

#### Scenario: See which baseline capability a change edits

- **WHEN** the operator views an in-flight change whose delta specs touch a capability
- **THEN** the change's card shows that capability tagged with its delta operation

#### Scenario: See a baseline capability has work in flight

- **WHEN** an active change has a delta against a capability that exists in the baseline
- **THEN** that capability's baseline card shows that one or more changes are in flight against it, naming them on hover

### Requirement: Teach the old-system → OpenSpec mapping in-app

The Cockpit SHALL render a legend mapping each old `plans/*` operator move — viewing the
current/active plans, inspecting an old or closed plan, asking "what does the system do
today?", and checking a feature's completion — to the OpenSpec primitive that now serves
it, so the operator learns the translation while inspecting.

#### Scenario: Learn the translation

- **WHEN** the operator views the Cockpit's legend
- **THEN** each old planning move is paired with the OpenSpec primitive (active changes, the archive, the spec baseline, task counts) that replaces it

### Requirement: Single read-only aggregation endpoint

The Control Room server SHALL expose a read-only `GET ./api/cockpit` endpoint that returns
active changes, baseline specs, and archived changes in one response, plus a read-only
`GET ./api/cockpit/show?id=<name>` passthrough to `openspec show <name> --json` for
drill-in. These endpoints SHALL only read state; no new mutating verb SHALL be added to the
exec whitelist, and any drill-in id SHALL be sanitised by the existing safe-name rule
before reaching a command.

#### Scenario: Fetch aggregated state

- **WHEN** the Cockpit requests `GET ./api/cockpit`
- **THEN** it receives active changes, baseline specs, and archived changes together, and no OpenSpec artifact is created or modified by the request

#### Scenario: Reject an unsafe drill-in id

- **WHEN** `GET ./api/cockpit/show` is requested with an id that is not a valid lowercase-dash name
- **THEN** the request is rejected without invoking any command

