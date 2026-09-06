## ADDED Requirements

### Requirement: list_tasks takes the board's filters
The `list_tasks` tool SHALL accept optional `status`, `machine` and `repoId` filters,
ANDed. `machine` SHALL be a machine label or `self`, or the literal `unassigned` for
tasks with no assignee; `repoId` SHALL be resolved exactly as `assign_task` resolves an
assignee (a handle such as `spacex/prg#2`, a repo id, or a unique name with `machine`).
An unknown machine or agent SHALL be refused with the known handles rather than
answered with an empty list.

#### Scenario: What is spacex working on
- **WHEN** the arch calls `list_tasks` with machine `spacex` and status `doing`
- **THEN** only tasks assigned to an agent on spacex that are in progress are returned

#### Scenario: Unknown agent
- **WHEN** the arch calls `list_tasks` with repoId `spacex/nope`
- **THEN** the tool refuses and names the handles spacex has
