## ADDED Requirements

### Requirement: Colour-coded tasks with pinned legends

The Task graph SHALL render tasks freely on the canvas, without machine boxes, and
SHALL colour each task's border by the machine of its assigned agent and its
background by its repository (keyed by remote URL, so one repository on two machines
shares a colour), with a "Machines" legend and a "Repositories" legend pinned above
the canvas.

#### Scenario: Colours are stable and distinct

- **WHEN** tasks on two machines and two repositories are on the board
- **THEN** the two machines get different border hues, the two repositories different
  background tints, borders are distinguishable from backgrounds, and after a reload
  every machine and repository keeps its colour

#### Scenario: Unassigned tasks

- **WHEN** a task has no agent assigned
- **THEN** it renders with the neutral border and background and counts under
  "unassigned" in both legends

#### Scenario: Legends stay put

- **WHEN** the operator pans or zooms the graph
- **THEN** the legends do not move and keep listing every machine and repository on
  the board with its count

#### Scenario: Legacy boxes

- **WHEN** a task still belongs to a machine box from the earlier layout
- **THEN** it renders at its absolute place with no box drawn and is re-saved as
  absolute once
