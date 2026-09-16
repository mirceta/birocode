# task-graph Specification

## Purpose
The task dependency graph: one harness-wide board of task nodes (title, optional
note, optional repo and machine grouping, status, canvas position) and "depends on"
edges, served over `/api/taskgraph` and shown in the Ideas tab's Task graph section.
Seeds the existing behavior of `TaskGraphService` / `TaskGraphController`
(plans/task-dependency-graph.md, openspec sync-task-graph).
## Requirements
### Requirement: Global task board
The harness SHALL maintain one global task graph — nodes with a title (required,
≤ 2 000 chars), an optional note (≤ 20 000 chars), an optional repo id label, an
optional machine (grouping box) id, a status in `todo | doing | done`, and a canvas
position — plus edges where `Source` depends on `Target`, plus a free-text scratch
pad. It SHALL be served over `/api/taskgraph` (read the board; create, patch and
delete nodes; create and delete edges; create, patch and delete machines; set the
scratch) and persisted locally with atomic writes, independent of which repo is
selected.

#### Scenario: Create and read a node
- **WHEN** a node is created with a title through the API
- **THEN** it appears in the board read with status `todo`, the given position, and
  creation and update timestamps

#### Scenario: Blank title is refused
- **WHEN** a node is created or patched with an empty title
- **THEN** the request is rejected and the board is unchanged

### Requirement: Acyclic dependencies
Adding an edge SHALL be refused when either node is unknown, when source and target
are the same node, when the same dependency already exists, or when the edge would
create a dependency cycle. Each refusal SHALL name its reason (`MissingNode`,
`SelfLoop`, `Duplicate`, `Cycle`).

#### Scenario: Cycle refused
- **WHEN** A depends on B and an edge making B depend on A is requested
- **THEN** the edge is refused with the `Cycle` reason and the graph is unchanged

#### Scenario: Duplicate refused
- **WHEN** an edge that already exists is requested again
- **THEN** it is refused with the `Duplicate` reason

### Requirement: Deleting a node removes its edges
Deleting a node SHALL remove every edge touching it and SHALL record tombstones for
the node and those edges so the deletion wins over a stale copy on merge.

#### Scenario: Delete cascades
- **WHEN** a node with two dependencies is deleted
- **THEN** the node and both edges are gone from the board and tombstoned

### Requirement: Merge with tombstones
The graph SHALL merge per element by id with the same rules as the ideas board
(newer `UpdatedAt` wins; a newer tombstone suppresses; tombstones are pruned after
30 days) and SHALL ride the ideas shared-store wire when sync is enabled, so every
harness sharing a board converges on one graph.

#### Scenario: Remote node appears
- **WHEN** harness A adds a node and pushes, and harness B's next poll runs
- **THEN** the node appears on harness B's graph without user action

### Requirement: Task graph section in the Ideas tab
The Ideas tab SHALL show the graph as a third section beside Ideas and the Arch
plan: nodes are draggable (positions persist on drop), edges are drawn by connecting
nodes, the actionable set (nodes whose dependencies are all done) is highlighted,
and selecting a node lights the chain it unblocks. The section is an Advanced-mode
feature.

#### Scenario: Position persists
- **WHEN** the operator drags a node and drops it
- **THEN** the node keeps that position after a page reload

### Requirement: Kanban cards open their assignee in one reused worker window
Each assignee chip on a Kanban card SHALL offer an "open in worker window"
control that opens that assignee's machine harness with that repo agent's dock
active, in a single shared worker window named `birocode-worker`: every click,
for any card and any machine, SHALL reuse (renavigate) the same window rather
than opening another. The target URL SHALL be derived from the same
peer-registry address the Fleet Status "open harness" link uses (self: this
harness's root, proxy-prefix aware) plus the deep link carrying the target
machine's own repoId; when the machine's address is not known the control
SHALL be absent rather than a guessed or broken link. On a multi-assignee card
each assignee SHALL get its own control targeting its own machine and agent.

#### Scenario: Two clicks, one window
- **WHEN** the Operator clicks the worker control on a card assigned to machine A, then on a card assigned to machine B
- **THEN** one worker window opens at A's harness and the second click navigates that same window to B's harness — no second window

#### Scenario: Unknown machine degrades gracefully
- **WHEN** a card's assignee is on a machine whose address the hub does not know
- **THEN** that assignee's chip shows no worker control

