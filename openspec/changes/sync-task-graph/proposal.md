# sync-task-graph — the shared board sync carries the Task graph, not just Ideas

## Why

The shared-store sync (openspec ideas-drive-sync / ideas-harness-hub) replicates
only the ideas board. The Task graph — the other harness-global planning surface
(`/api/taskgraph`: step nodes, depends-on edges, machine boxes, scratchpad) — is
still per-node: a graph built on one harness is invisible on every other, even
when both already share an ideas board over the same hub. The operator plans on
one machine and loses the plan on the next.

## What Changes

- **One sync channel, two boards**: the shared store payload gains a `graph`
  section (`nodes`, `edges`, `machines`, `scratch`, `scratchUpdatedAt`,
  `tombstones`) beside `ideas`/`tombstones`. The existing sync config (URL,
  enable, poll) and status now cover both boards — no second sync bar, no new
  user-facing configuration. The Apps Script endpoint stores the `store` blob
  opaquely, so deployed scripts keep working unchanged.
- **TaskGraphService becomes sync-capable**, mirroring NotesService: a
  `Changed` event (local mutations only, never merge), `Snapshot()`, and a
  deterministic, commutative `MergeFrom()` with per-element tombstones:
  - nodes and machines: per-id newest-`UpdatedAt`-wins (local ties), tombstone
    at/after `UpdatedAt` suppresses, later edit revives;
  - edges (immutable): presence-union minus tombstoned ids, then a canonical
    validity rebuild in id order that drops edges referencing missing nodes,
    duplicate source→target pairs, self-loops, and cycle-formers — both sides
    apply the same rule to the same union, so they converge;
  - scratchpad: last-writer-wins by a new `ScratchUpdatedAt` stamp; on an exact
    tie with different text (e.g. two legacy boards that both predate the
    stamp), the texts are joined deterministically instead of one side being
    silently discarded;
  - deletes tombstone: node delete also tombstones its dropped edges; machine
    delete stamps the detached nodes so the detach wins remotely.
- **Sync engine + hub carry both boards**: `IdeasSyncService` subscribes to
  both `Changed` events and pushes/merges both; the hub (`IdeasHubService`)
  serves the graph in its store, merges a POSTed graph, and bumps its revision
  on hub-local graph edits. Join seeding (openspec
  adopt-preexisting-ideas-on-join) naturally uploads a pre-existing graph too.
- **Out of scope**: live refresh of an open Task graph panel (it loads on
  mount; remote changes appear on next open/reload) and any UI changes.

## Capabilities

### New Capabilities
- `taskgraph`: seeds the capability (global board over `/api/taskgraph`) and
  adds its replication over the shared board sync.

### Modified Capabilities
- `ideas`: the link-configured shared store and the harness-hosted hub carry
  the task graph section alongside the ideas board.

## Impact

- **Backend**: `TaskGraphService` (event/snapshot/merge/tombstones, delete
  signatures gain `now`), `IdeasSyncClient.SharedStore` (+`Graph`),
  `IdeasSyncService`, `IdeasHubService` (store type becomes the combined
  SharedStore), `NotesController` (hub wire projection), `TaskGraphController`
  (pass `Now()` to deletes).
- **Storage**: `taskgraph.json` gains `ScratchUpdatedAt` + `Tombstones` —
  older files deserialize with defaults, no migration.
- **Wire**: additive `graph` field in the shared store; old peers ignore it
  (their pushes drop it, and any newer peer re-seeds it on the next merge —
  transient mixed-version fleets converge each round).
- **Frontend**: none.
