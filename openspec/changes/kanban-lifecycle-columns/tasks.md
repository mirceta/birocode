# Tasks — kanban-lifecycle-columns

## 1. Lifecycle core

- [x] 1.1 `TaskLifecycle` (pure): Rank, IsDelivered, Ceiling, ClampClaim, FromFacts, IsStale
- [x] 1.2 `TaskGraphService`: six statuses; Node linkage fields (Branch, HeadCommit, Pushed, PrUrl, PrNumber, MergeCommit, VerifiedStatus, VerifiedAt, Warning)
- [x] 1.3 `RecordClaim` + forward-only `ApplyVerification`; rank-guarded `MarkDispatched`; `IsBlocked` via IsDelivered
- [x] 1.4 Migration on load (Board.SchemaVersion 2): done → pr-merged with merge evidence, else committed + warning
- [x] 1.5 `StaleAfterMs` (default 24 h, `TaskBoard:StaleHours` config) + stale helper

## 2. Verification

- [x] 2.1 `ITaskFactsProbe` + `GitTaskFactsProbe` (git branch/ancestry, gh PR lookup, deploy-log check for harness repos)
- [x] 2.2 `TaskVerificationPoller` background service (60 s; self-machine, branch-recorded, not-done nodes) + DI wiring

## 3. Arch surfaces

- [x] 3.1 `ToolUpdateTask`: branch/commit/pr args, ClampClaim, clamp warning note
- [x] 3.2 `ToolListTasks`: rank sort, stale, linkage fields; DispatchTask/prereq gates via IsDelivered
- [x] 3.3 `ToolListAgents`: `unpushedTaskBranches`; `FleetStatus()`: per-machine `staleTasks`
- [x] 3.4 `DispatchMessage`: TASK COMMITTED / TASK PR / TASK BLOCKED closing convention
- [x] 3.5 Role prompt task-board section rewrite + RoleVersionMarker v5; ArchMcpServer tool descriptions/schemas; TasksMcpServer description text

## 4. Client

- [x] 4.1 KanbanBoard: six lifecycle columns, branch/PR/warning/stale chips, drop handlers
- [x] 4.2 TaskGraphPanel: six statuses, cycle map, actionable via delivered; CSS for new statuses
- [x] 4.3 FleetStatus tab: stale task lines per machine; `GET /api/taskgraph` serves `staleHours`

## 5. Tests

- [x] 5.1 Status machine: no forward skip past verified; backward free; clamp note recorded
- [x] 5.2 Migration: done→committed+warning without evidence, →pr-merged with; idempotent on reload
- [x] 5.3 FromFacts transitions incl. never-demote; stale flagging
- [x] 5.4 DispatchMessage closing lines; Node JSON back-compat; MarkDispatched rank guard
