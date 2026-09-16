# Tasks — ideas-consume-on-promotion

## 1. Backend — notes

- [x] 1.1 `Note` gains `ConsumedByTaskId` (nullable; older stores/peers read as null).
- [x] 1.2 `NotesService.List(bool includeConsumed = false)` hides consumed by default;
      `Snapshot()` still carries all ideas for sync.
- [x] 1.3 `Consume(ideaId, taskId, now)` / `Unconsume(ideaId, taskId, now)` (restore
      inactive, keep original fields, only when consumed by that task) /
      `ReconcileConsumed(links, now)` (idempotent migration).

## 2. Backend — task graph choke point

- [x] 2.1 `TaskGraphService` takes an optional `NotesService`; `AddNode` consumes the
      source idea, `DeleteNode` restores it. `MergeFrom` untouched (no double-fire).
- [x] 2.2 `IdeaTaskLinks()` for migration.
- [x] 2.3 `ConsumedIdeaMigration` hosted service wires reconcile at startup; registered.

## 3. API + tools

- [x] 3.1 `GET /api/notes?includeConsumed=` flows to `List`.
- [x] 3.2 arch `list_ideas` gains `includeConsumed` (surfaces `consumed` + `taskId`);
      `idea_to_task` consumes via AddNode and returns `{ taskId, ideaHandle }`; both
      tool descriptions updated.
- [x] 3.3 Tasks agent `update_idea` id-lookup includes consumed (still resolvable).

## 4. Frontend

- [x] 4.1 Ideas panel: one fetch with `includeConsumed`, split into the live list and an
      off-by-default "Consumed" view (names the task, links to Kanban); `sendToGraph`
      moves the idea to consumed (no more inactive-PATCH).
- [x] 4.2 Kanban idea-handle chip fetches `includeConsumed` so consumed ideas resolve `#N`.

## 5. Tests + verify

- [x] 5.1 promote consumes; includeConsumed toggles; delete restores (inactive, fields
      kept); done keeps consumed; delete of an unrelated task never frees; reload
      round-trip; migration; reconcile idempotent; tool schema exposes the flag.
- [x] 5.2 `dotnet build` + full test suite green; client build green.
