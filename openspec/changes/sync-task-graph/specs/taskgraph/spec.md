# taskgraph — delta for sync-task-graph

## ADDED Requirements

### Requirement: Global task graph board
The harness SHALL maintain one global task dependency graph — step nodes
(title, note, optional repo label, optional machine box, status, canvas
position), depends-on edges (source depends on target; self-loops, duplicates
and cycles refused), machine grouping boxes, and a free-text scratchpad —
served over `/api/taskgraph` and persisted locally with atomic writes,
independent of which repo is selected. An unreadable store file at startup
MUST leave the file untouched (never reseeded). (Seeds the existing behavior
of `TaskGraphService`.)

#### Scenario: Board is device-independent
- **WHEN** a node is added from any device browsing the harness
- **THEN** every device browsing that harness sees it in the Task graph panel

#### Scenario: Unreadable store is preserved
- **WHEN** the local taskgraph store file is unreadable at startup
- **THEN** the harness starts with an empty in-memory board and leaves the
  file untouched for forensics

### Requirement: Task graph replication over the shared board sync
The harness SHALL, when the shared board sync (the ideas sync configuration)
is enabled, replicate the task graph over the same channel: the shared
store payload carries a graph section (nodes, edges, machines, scratchpad
with its update stamp, and graph tombstones) beside the ideas board, under
the same poll/CAS-push choreography, revision counter, and offline-tolerance
rules. Local graph mutations SHALL schedule the same debounced merged push as
ideas edits; sync failures MUST NOT block or degrade local graph operations.
When sync is disabled or unconfigured, graph behavior MUST be purely local
and identical to pre-sync behavior. First contact with a store (join) SHALL
seed it with the pre-existing local graph exactly as it seeds pre-existing
ideas.

#### Scenario: Remote node appears
- **WHEN** harness A adds a graph node and pushes, and harness B's next poll
  runs
- **THEN** the node appears on harness B's graph without user action

#### Scenario: Unconfigured harness stays local
- **WHEN** no sync configuration exists
- **THEN** all task graph operations work exactly as before and the harness
  makes no outbound sync calls

#### Scenario: Join seeds the graph too
- **WHEN** a harness holding a task graph built before sync was ever
  configured enables sync against a shared store
- **THEN** the first sync exchange uploads the graph alongside the ideas, and
  the store's graph section holds the union of both sides

### Requirement: Per-element graph merge with tombstones
Graph merging SHALL be deterministic and commutative, per element kind:
nodes and machines merge per id with newest-`UpdatedAt`-wins (local wins
ties), elements present on only one side are kept, and deletions are recorded
as tombstones (id + deletion time) that suppress an element at or after its
`UpdatedAt` while a later edit revives it. Edges are immutable: the merge
takes the union of both sides minus tombstoned edge ids, then rebuilds
validity in a canonical order that drops edges referencing missing nodes,
duplicate source→target pairs, self-loops, and edges that would close a
dependency cycle — so all peers converge on the same edge set. Deleting a
node SHALL tombstone the node and every edge dropped with it; deleting a
machine SHALL stamp its detached nodes so the detachment propagates. A node
whose machine box no longer exists after a merge SHALL be detached rather
than left dangling. The scratchpad merges last-writer-wins by its update
stamp; an exact-tie conflict with differing text SHALL be resolved by a
deterministic join of both texts, never by silently discarding one side.
Tombstones older than the retention window (30 days) are pruned. Legacy local
stores without the stamp or tombstone list MUST load unchanged.

#### Scenario: Delete does not resurrect
- **WHEN** harness A deletes a node (and its edges) while harness B is
  offline holding copies, and B later syncs
- **THEN** the node and those edges stay deleted on both boards

#### Scenario: Conflicting concurrent edges converge
- **WHEN** harness A adds edge X→Y and harness B adds edge Y→X while apart,
  then both sync
- **THEN** both boards converge on the same single surviving edge, chosen by
  the canonical rebuild order, and neither board holds a cycle

#### Scenario: Concurrent edits of the same node
- **WHEN** harness A and harness B both edit the same node while apart, then
  sync
- **THEN** both boards converge on the version with the newer `UpdatedAt`,
  and no other element is affected
