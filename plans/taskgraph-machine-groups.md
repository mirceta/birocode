# Task-graph machine groups — boxes that hold step nodes, one box = one machine

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-18): BUILT + browser-verified on isolated :5210; awaiting deploy.** On
> `feature/taskgraph-machine-groups`, off `main`. Confirmed: **machine = manual box** (no live host
> telemetry yet); **deleting a box detaches its nodes** (work survives); **cross-machine edges =
> distinct colour + dash**. Verified (`check-machine-groups.mjs`): boxes render with names, a step
> persisted into a box renders as its child, a dependency across boxes is dashed orange,
> **drag drops a node into a box (reparent)**, "Add machine" works, and placement + the cross cue
> survive a reload. Not yet committed/merged/deployed.

## The problem

The [task graph](task-dependency-graph.md) is a single flat board of step nodes wired by
**"depends-on"** edges. But our agents don't run in one place — they run on **several machines**,
and a step on one machine often can't start until a step on **another** machine is done
(e.g. machine A publishes an artifact that machine B's agent consumes). Today nothing on the
board says *which machine a step runs on*, so the cross-machine hand-offs — the dependencies most
likely to stall the whole pipeline — are invisible. The `repoId` chip labels the *agent/repo*, not
the *host* it runs on.

## Goal

Add a **grouping box** (a rectangle) to the task graph that **contains** step nodes and represents
**one machine** on which agents run. Then a **cross-machine dependency** is simply a depends-on edge
between two nodes whose machine boxes differ — and the board makes that hand-off visually obvious.

Concretely:

1. **Machine box.** A draggable, resizable rectangle with a name (e.g. "build-box", "192.168.0.215").
   Dragging the box moves its contained nodes with it; nodes dropped inside it become its children.
2. **Membership.** A step node belongs to at most one machine box (or none = "unplaced"). Moving a
   node out of a box detaches it; moving it into another box re-parents it.
3. **Cross-machine edges stand out.** An edge whose endpoints sit in *different* machine boxes (or
   one inside / one outside) is styled distinctly (colour/dash/label) so the inter-machine
   hand-offs read at a glance — that's the whole point.

## How the existing board works (what we extend)

- **Frontend:** `client/src/components/taskgraph/TaskGraphPanel.jsx` — React Flow board. Nodes are
  `type: 'step'` (`StepNode`), edges are `Source→Target` = "Source waits on Target". Derived state:
  `actionableIds` (do-next) and `whyChain` (the trace). Positions persist on `onNodeDragStop` via
  `PATCH /api/taskgraph/nodes/{id}`.
- **Backend:** `ClaudeWeb.App/Services/TaskGraph/TaskGraphService.cs` — one global `Board`
  (`Nodes`, `Edges`, `Scratch`) atomically persisted to `%APPDATA%\ClaudeWeb\taskgraph.json`.
  `Node` = `{Id, Title, Note, RepoId, Status, X, Y, CreatedAt, UpdatedAt}`; `Edge` =
  `{Id, Source, Target}`. Edge add is guarded against self-loops, duplicates, and cycles.
- **Controller:** `TaskGraphController.cs` over `/api/taskgraph` (`GET` board; nodes
  POST/PATCH/DELETE; edges POST/DELETE).

React Flow already supports this natively: a **group node** plus child nodes that carry
`parentId` + `extent: 'parent'`. Dragging the parent moves children; `extent:'parent'` clamps
children inside. We lean on that rather than hand-rolling containment math.

## Design sketch (proposed — confirm before building)

### Backend (`TaskGraphService` + controller)

- **New `Machine` record** on the `Board`: `{Id, Name, X, Y, W, H, CreatedAt, UpdatedAt}` — its own
  position and size (boxes are resizable, unlike step nodes).
- **`Node` gains an optional `MachineId`** (nullable, no migration — same additive pattern as
  `RepoId`/`Priority`/`Active`; absent in old JSON → unplaced). This is the membership link.
- **Endpoints:** `POST/PATCH/DELETE /api/taskgraph/machines` (add / rename+move+resize / delete);
  node `PATCH` accepts `machineId` (empty string clears, like `repoId`). Deleting a machine box
  **detaches** its nodes (sets their `MachineId` null) rather than deleting them — a box is an
  organizing overlay, not an owner of the work.

### Frontend (`TaskGraphPanel.jsx` + `taskgraph.css`)

- **`MachineNode`** = a React Flow group node (`type: 'machine'`), rendered behind step nodes, with
  an inline-rename header and a resize control (React Flow's `<NodeResizer>`), styled as a labelled
  rectangle.
- Step nodes with a `machineId` are emitted with `parentId` + `extent: 'parent'`; positions become
  parent-relative (translate on attach/detach so the node doesn't jump).
- **Drag-to-reparent:** on `onNodeDragStop`, hit-test the node's centre against machine boxes; set/
  clear `machineId` accordingly and persist. (React Flow's `onNodeDragStop` + intersection helpers.)
- **Cross-machine edge styling:** in the existing `viewEdges` memo, mark an edge whose source and
  target resolve to different `machineId`s with a class (`tg-edge--cross`) + a distinct
  colour/dash; coexists with the existing `whyChain` dim/animate decoration.
- An **"Add machine"** control beside the existing "Add a step…" form.

## Decisions (locked 2026-06-18)

1. **Cross-machine cue** — distinct edge **colour + dash** (no per-edge label, keeps the board calm).
2. **Delete-a-box semantics** — **detach** the contained nodes (set `MachineId` null); the work
   survives, the box was only an organizing overlay.
3. **Scope of "machine"** — **manual box only** for now: a named rectangle the operator draws. No
   live host telemetry / auto-placement (same "label/colour, no live telemetry" philosophy as the
   rest of the board); host-binding is a possible later slice.

## Out of scope (for this branch)

- Live machine telemetry / auto-placing nodes onto boxes from agent host info.
- Nested boxes (a box inside a box).
- One-feature-per-branch: no unrelated task-graph changes ride along.

## Verification

Browser-verify on an isolated port (per `docs/claude-web/browser-testing.md` + the dock test-isolation
notes): create two machine boxes, drop a step in each, draw a depends-on edge across them, confirm the
edge renders with the cross-machine cue, dragging a box carries its nodes, and membership +
positions survive a reload (persisted to `taskgraph.json`). Then the usual playback → preview →
keep-it → deploy cycle.
