# Design — sync-task-graph

## Context

Two harness-global boards exist: ideas (`NotesService`, sync-capable since
ideas-drive-sync) and the task graph (`TaskGraphService`, local-only). The sync
stack is layered exactly for this extension: `IdeasSyncService` (choreography)
→ `IdeasSyncClient` (wire) → shared store (Apps Script or harness hub), with
the store treated as an opaque blob by both store implementations.

## Goals / Non-Goals

- **Goal**: the task graph replicates over the *existing* sync channel with the
  same guarantees ideas have (CAS push, offline tolerance, no resurrection,
  join seeding) — zero new configuration surface.
- **Non-goal**: live refresh of an open graph panel; per-element conflict UI;
  a second sync service or store file.

## Decisions

### One store, one rev, both boards

The shared store becomes `{ ideas, tombstones, graph }`. Alternative — a
separate sync config + store per board — was rejected: it doubles the config
burden and the polling, and the boards are owned by the same operator with the
same sharing intent. A single rev counter also keeps CAS semantics trivial.

Mixed versions: an old harness's push writes a store without `graph`. The
next merge on a new harness treats a missing `graph` as empty (union merge —
nothing local is deleted, because deletions only travel via tombstones) and
flags remote-stale, re-seeding the section on its next push. Convergent, at
the cost of a redundant push per old-harness write during the transition.

### Merge semantics per element kind

- **Nodes / machines** copy the proven note merge verbatim: per-id LWW by
  `UpdatedAt` (local wins ties), remote-only items appended in `CreatedAt`
  order, tombstone `DeletedAt >= UpdatedAt` suppresses, later edit revives.
  One tombstone list covers all ids (they are GUIDs — no namespace collisions).
- **Edges are immutable** (`Id, Source, Target`), so LWW is meaningless:
  presence-union minus tombstoned ids. A tombstoned edge id is dead forever —
  re-adding the same dependency mints a new id, so no revive rule is needed.
  Because two nodes can independently add edges that are jointly invalid
  (duplicate pair, or a cycle like A→B on one side and B→A on the other), the
  union passes through a **canonical validity rebuild**: iterate candidates
  sorted by id, keep an edge only if both endpoints exist in the merged node
  set, it is not a self-loop, its (source, target) pair is unseen, and it does
  not close a cycle against the edges kept so far. Deterministic on identical
  input → every peer converges to the same edge set; the loser edge is dropped
  silently (same trade-off the backend already makes by refusing cycles).
- **Scratch** is one shared text: LWW by `ScratchUpdatedAt` (new field,
  defaults 0 for legacy files). Exact tie with different text — realistically
  only two pre-upgrade boards meeting at stamp 0 — joins both texts in ordinal
  order with a separator, because silently discarding one operator's
  scratchpad is worse than a one-time seam. Blank sides short-circuit to the
  other side.

### Deletion completeness

`DeleteNode` currently drops touching edges without a trace; remotely those
edges would only die via the missing-node rule, and could resurrect the moment
the node is revived by a later remote edit. Deletes now tombstone the node
**and** each dropped edge. `DeleteMachine` stamps its detached nodes'
`UpdatedAt` so the detach (MachineId null + absolute coords) beats stale remote
copies. After merge, any node whose `MachineId` no longer resolves is detached
in place (coords kept) — dangling parents must never reach the frontend.

### Hub carries the combined store

`IdeasHubService.HubEnvelope.Store` changes from `NotesService.BoardSnapshot`
to `IdeasSyncClient.SharedStore` (the wire record — it already is the shared
vocabulary between client, hub, and controller). The hub merges both sections
under its existing gate/rev, and subscribes to `TaskGraphService.Changed` for
the rev bump exactly as it does for notes.

## Risks / Trade-offs

- **Payload growth**: the store now hauls the whole graph each exchange. Both
  boards are operator-scale (tens to low hundreds of elements); the existing
  whole-board protocol already accepted this shape of cost for ideas.
- **Silent edge drops** on conflicting concurrent edges: acceptable — the
  backend's cycle refusal already makes edge validity a hard invariant, and
  determinism guarantees both sides agree on which edge survived.
