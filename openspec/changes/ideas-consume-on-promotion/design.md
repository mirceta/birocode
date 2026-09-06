# Design — ideas-consume-on-promotion

## Consumption is a field on the idea, not a separate store

An idea's `Note` record gains `ConsumedByTaskId` (string, nullable). Non-null =
consumed by that task node. This keeps the state on the idea, so it replicates over the
existing ideas sync channel (per-note LWW by `UpdatedAt`) with no new wire shape — the
reverse link `task.ideaId` already exists. Older stores and sync peers deserialize the
field as null (not consumed), so nothing needs migrating on the wire.

`NotesService.List(includeConsumed = false)` filters consumed ideas out by default.
`Snapshot()` is unchanged (it must carry every idea, consumed included, for sync).

## One choke point: TaskGraphService.AddNode / DeleteNode

Every promotion path already funnels through `TaskGraphService.AddNode` with the source
`ideaId` (the UI POST `/api/taskgraph/nodes` and the arch `idea_to_task` tool), and
every task deletion through `DeleteNode`. So the linkage lives there:

- `AddNode`: if the node carries an `ideaId`, call `NotesService.Consume(ideaId, node.Id)`.
- `DeleteNode`: if the removed node had an `ideaId`, call
  `NotesService.Unconsume(ideaId, node.Id)` — which only restores when the idea is
  consumed by *that* task, so deleting one task never frees an idea linked to another.

`TaskGraphService` takes an optional `NotesService` (DI injects it; pure-graph unit
tests omit it → consumption is a no-op). No cycle: `NotesService` depends only on
`Logger`. `MergeFrom` (sync) rebuilds node lists directly and never calls
AddNode/DeleteNode, so consumption never double-fires on a sync peer — the consumed
flag arrives with the idea instead.

Completion/merge is a status change (`UpdateNode`), never a delete, so it structurally
keeps the idea consumed with no special case.

## Migration

A one-shot `IHostedService` (`ConsumedIdeaMigration`) runs at startup once both boards
have loaded (state loads in their constructors, before `StartAsync`). It reads
`TaskGraphService.IdeaTaskLinks()` (idea id → node id for every node with an `ideaId`)
and calls `NotesService.ReconcileConsumed`, which consumes each still-unconsumed linked
idea. Idempotent: a later start finds nothing to do.

## Surfaces

- `GET /api/notes?includeConsumed=true` returns consumed ideas too (each carries
  `consumedByTaskId`); default stays consumed-free.
- The Ideas panel fetches once with `includeConsumed`, splits client-side into the live
  list and an off-by-default "Consumed" section that names the task and links to Kanban.
  The Kanban idea-handle chip fetches `includeConsumed` so promoted (now consumed) ideas
  still resolve their `#N`.
- `list_ideas` gains `includeConsumed`; `idea_to_task` returns `{ taskId, ideaHandle }`.
