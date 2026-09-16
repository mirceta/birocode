## MODIFIED Requirements

### Requirement: Deleting a node removes its edges
Deleting a node SHALL remove every edge touching it and SHALL record tombstones for
the node and those edges so the deletion wins over a stale copy on merge. When the
deleted node was promoted from an idea (it carries that idea's id), deleting it SHALL
restore that idea to the Ideas list as inactive, keeping its original text/project/
priority — but only when the idea is consumed by exactly that node, so deleting one
task never frees an idea linked to another.

#### Scenario: Delete cascades
- **WHEN** a node with two dependencies is deleted
- **THEN** the node and both edges are gone from the board and tombstoned

#### Scenario: Delete restores the source idea
- **WHEN** a node that was promoted from an idea is deleted
- **THEN** that idea returns to the Ideas list as inactive with its original
  text/project/priority
