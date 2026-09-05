## ADDED Requirements

### Requirement: Agent-authored nodes are auto-placed

The harness SHALL auto-place a node created without a position (as the Tasks
agent's tools do) below the current lowest node, filling rows of four left to
right, so a batch created in one turn is readable on the canvas before anyone drags
it. Nodes created with an explicit position MUST keep it.

#### Scenario: A batch lands in rows

- **WHEN** the Tasks agent creates six tasks in one turn on a board whose lowest
  node sits at y = 400
- **THEN** the six nodes appear in two rows below y = 400, four then two, none
  overlapping

### Requirement: Graph section refreshes after an agent run

The Task graph section SHALL reload its board when its host signals that an agent
run which may have changed the graph has ended, so agent-created nodes appear
without a page reload.

#### Scenario: New nodes appear without reload

- **WHEN** the Tasks agent's run ends after creating nodes
- **THEN** the Task graph section shows them within one reload of the board, with
  no manual page refresh
