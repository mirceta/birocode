## MODIFIED Requirements

### Requirement: Agent handles

Every repo agent SHALL have a short stable handle — a slug of its repo name with `#2`,
`#3`… when the name repeats on that machine — presented as `<machine>/<handle>`
everywhere agents are listed (kanban assignee, Arch managed agents, list_agents,
list_machines, the peer describe, the fleet Status tab's agent detail and chip title)
and shown as its `#k` suffix on the dashboard dock chips. The one exception is the
fleet Status tab's Agents-view chip label, which shows the `<handle>` part alone under
its machine's section header (see the management-app spec, "Status tab agent chips
name the repo agent only").

#### Scenario: Repeated repo names

- **WHEN** a machine registers two repos named "prg"
- **THEN** they read `prg` and `prg#2`, and removing or renaming either never changes the
  other's handle
