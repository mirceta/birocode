# Tasks — sync-task-graph

## 1. TaskGraphService becomes sync-capable

- [x] 1.1 `Changed` event raised after every successful LOCAL mutation (node/
      edge/machine add/update/delete, scratch set), never by `MergeFrom`.
- [x] 1.2 `GraphTombstone(Id, DeletedAt)` + `Tombstones` and `ScratchUpdatedAt`
      on the persisted board (legacy files load with defaults); tombstones
      pruned at the 30-day retention in `Save()`.
- [x] 1.3 Deletes record tombstones: `DeleteNode(id, now)` tombstones the node
      and each edge dropped with it; `DeleteEdge(id, now)` tombstones the
      edge; `DeleteMachine(id, now)` tombstones the box and stamps detached
      nodes' `UpdatedAt`. `SetScratch` stamps `ScratchUpdatedAt`.
      (Controller passes `Now()`.)
- [x] 1.4 `Snapshot()` and deterministic commutative `MergeFrom(remote)`:
      nodes/machines per-id LWW with tombstone suppression/revival; edges
      union minus tombstoned ids + canonical validity rebuild (id order;
      drop missing-node/self-loop/duplicate-pair/cycle-formers); dangling
      `MachineId` detached post-merge; scratch LWW by stamp with
      deterministic tie join; returns `(LocalChanged, RemoteStale)`.

## 2. Sync channel carries the graph

- [x] 2.1 `IdeasSyncClient.SharedStore` gains `Graph`
      (`TaskGraphService.GraphSnapshot`, nullable for old peers).
- [x] 2.2 `IdeasSyncService`: inject `TaskGraphService`, subscribe its
      `Changed`, merge the graph section on poll and pull-merge-push, include
      the graph snapshot in every push, OR the two `RemoteStale` outcomes.
- [x] 2.3 `IdeasHubService`: store type becomes the combined `SharedStore`;
      `Get()` serves both boards; `Post()` merges both under the same rev CAS;
      subscribe `TaskGraphService.Changed` for the rev bump.
- [x] 2.4 `NotesController`: hub wire projection includes `graph`; POST passes
      the graph section through.

## 3. Verify

- [x] 3.1 Isolated .NET Debug build (never the running app's bin).
- [x] 3.2 Two-instance isolated e2e (`verify-taskgraph-sync.mjs`, hub A +
      node B with own datadirs): pre-existing graph on B seeds the hub on
      join; nodes/edges/machines/scratch replicate both ways; a delete on A
      does not resurrect from B; conflicting concurrent edges converge to one
      valid edge on both; ideas sync still works over the same store.
- [x] 3.3 `openspec validate sync-task-graph --strict`.

## 4. Wrap-up

- [x] 4.1 Commit on the feature branch (explicit paths, never `git add -A`);
      PR/merge is the user's call (main ruleset blocks agent merges).
