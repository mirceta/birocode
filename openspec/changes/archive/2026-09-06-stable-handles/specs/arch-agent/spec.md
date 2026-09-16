## ADDED Requirements

### Requirement: Agent handles

Every repo agent SHALL have a short stable handle — a slug of its repo name with `#2`,
`#3`… when the name repeats on that machine — presented as `<machine>/<handle>`
everywhere agents are listed (fleet Status tab, kanban assignee, Arch managed agents,
list_agents, list_machines, the peer describe) and shown as its `#k` suffix on the
dashboard dock chips.

#### Scenario: Repeated repo names

- **WHEN** a machine registers two repos named "prg"
- **THEN** they read `prg` and `prg#2`, and removing or renaming either never changes the
  other's handle

### Requirement: Tools accept handles

The arch tools that name an idea (idea_to_task) SHALL accept `#N` or `N` beside the id,
and the tools that name a repo agent (send_task, git_state, read_transcript, assign_task,
create_task) SHALL accept `<machine>/<handle>`, `<handle>` with a machine, or a unique
name beside the raw id; an ambiguous reference SHALL be refused with the handles to use.

#### Scenario: Handle in place of the id

- **WHEN** the arch calls send_task with repoId "spacex/prg#2"
- **THEN** the task goes to that repo on spacex exactly as with its raw id

#### Scenario: Ambiguous name

- **WHEN** the arch names "prg" on a machine with two repos of that name and neither
  handle is "prg"
- **THEN** the tool refuses and lists `spacex/prg` and `spacex/prg#2`
