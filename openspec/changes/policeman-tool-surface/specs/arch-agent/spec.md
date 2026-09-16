## ADDED Requirements

### Requirement: The policeman is offered only its own tool surface
The harness MCP server SHALL answer `tools/list` per conversation: the policeman conversation
SHALL be offered only its observe-only subset (the read-only tools, memory, and
`board_integrity` / `flag_needs_human` / `clear_needs_human`), every other arch conversation
the full catalogue. Every arch tool outside that subset SHALL also be passed to the
policeman's CLI turns as a disallowed tool by its MCP name, and SHALL still be refused with
`policeman-observe-only` if a call reaches the server. The Tools lane of an arch conversation
SHALL show that conversation's surface: for the policeman, the tools it is offered, the
policy, and the arch tools withheld from it, with usage counted for that conversation only.

#### Scenario: The policeman's session lists its tools
- **WHEN** the policeman's CLI session calls tools/list on the harness MCP server
- **THEN** the answer holds exactly the observe-only subset — no send_task, dispatch_task, update_task, assign_task, create_task, delete_task, idea_to_task, adopt_branch, upgrade_peer, loop or goal tools

#### Scenario: The arch's session is untouched
- **WHEN** the default arch conversation (or a goal conversation) calls tools/list
- **THEN** the answer is the full catalogue, as before

#### Scenario: The Tools lane in the policeman subtab
- **WHEN** the Operator opens the Tools lane inside the Kanban's Policeman subtab
- **THEN** it reads "observe-only · 13 of 27 arch tools", lists only those 13, and names the 14 withheld ones in a section of their own
