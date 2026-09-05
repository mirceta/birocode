## ADDED Requirements

### Requirement: Agent-authored ideas

The ideas board SHALL accept entries created and edited by the Tasks agent through
the Tasks MCP (`create_idea`, `update_idea`, `list_ideas`) with the same validation
as the composer (text required, ≤ 20 000 chars; project ≤ 200 chars; priority
clamped 0–5). A partial `update_idea` SHALL preserve every field it does not name.
Agent-authored entries are ordinary notes: they sync, merge and tombstone like any
other.

#### Scenario: Agent files an idea

- **WHEN** the Tasks agent calls `create_idea` with text and a project
- **THEN** the note appears on every device browsing the harness like a typed one

#### Scenario: Partial update keeps the rest

- **WHEN** the Tasks agent calls `update_idea` with only a new priority
- **THEN** the note's text, project and active flag are unchanged

### Requirement: Break into tasks from the composer

The Ideas composer SHALL offer a "Break into tasks" action (Advanced mode) that
hands the current draft to the Tasks agent, switches the panel to the Task graph
section with a working indicator, and, when the agent's run ends, reloads the graph
so the new tasks are visible without a page reload. The draft SHALL be kept until
the run has been accepted by the harness; a refused send (agent busy) SHALL show
the reason and leave the draft in place.

#### Scenario: Draft becomes tasks

- **WHEN** the operator pastes a multi-part prompt and clicks Break into tasks
- **THEN** the panel shows the Task graph with a working indicator, and after the
  run ends the new nodes and their dependency edges are on the canvas

#### Scenario: Agent busy

- **WHEN** Break into tasks is clicked while a Tasks turn is already running
- **THEN** the panel shows the refusal and the draft is unchanged
