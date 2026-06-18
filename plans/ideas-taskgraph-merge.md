# Merge Ideas + Task graph — task graph becomes an Ideas tab, "send to graph" on active ideas

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-18): DECISIONS LOCKED — building.** On `feature/ideas-taskgraph-merge`, off
> `main`. Decisions: **#1 = Convert** (send creates the node, keeps the idea but clears its `active`
> flag — no data loss); **#2 = Remove** the standalone floating task-graph dock (graph lives only as
> the Ideas tab).

## The problem

**Ideas** (the global list with an **Active** section, [ideas-pinned-dashboard.md](ideas-pinned-dashboard.md),
[ideas-active-section.md](ideas-active-section.md)) and the **Task graph**
([task-dependency-graph.md](task-dependency-graph.md)) are two separate dashboard citizens that are
really two ends of one workflow: an **active idea** is "something I mean to do"; the **task graph**
is where I sequence *what to do and in what order*. Today they're disconnected — you re-type an
active idea by hand to turn it into a graph step, and the two surfaces compete for dashboard space.

## Goal

Fold the task graph **into the Ideas surface** and wire the two together:

1. **Task graph as a third tab inside Ideas.** `IdeasPanel` already hosts a tab strip
   (**Ideas | Plan**); add a **Task graph** tab that renders the existing `<TaskGraphPanel/>`. One
   home for "what I might do / the plan / how it's sequenced".
2. **"Send to graph" on active ideas.** Each **active** idea card gets a button that creates a task
   graph node from it (POST `/api/taskgraph/nodes`, `title = idea.text`), so promoting an idea into
   an actionable, sequence-able step is one click.

## Design sketch

### Frontend (this is frontend-only — reuses existing endpoints)
- **New tab** in `client/src/components/ideas/IdeasPanel.jsx`: extend the existing tab state
  (`TAB_KEY`, currently `'ideas' | 'plan'`) with `'graph'`, add a third `.ideas__tab` button, and
  render `<TaskGraphPanel/>` in its `.ideas__tabpanel`. Gate the tab on the existing `taskGraph`
  feature flag (`useFeature('taskGraph')`). Reuse `.ideas__tabs` / `.ideas__tab(--active)` styling.
- **"Send to graph" button** in `renderCard(n)`'s `.idea__foot`, shown only when `n.active`. Calls
  `POST /api/taskgraph/nodes { title: n.text, note: n.project || undefined }`, then (decision #1)
  handles the source idea. On success, optionally switch to the **Task graph** tab so the new node
  is visible.
- **Remove the standalone dashboard task-graph dock** (`Dashboard.jsx` `data-panel="taskgraph"` +
  its drag-layout key) — the graph now lives inside Ideas (which is itself a dashboard aside **and**
  the routed Ideas tab). (Decision #2.)

### Backend
- **No new endpoints.** Reuse `POST /api/taskgraph/nodes` and the existing `/api/notes` endpoints.
  If "send" means *move* (delete the idea), also `DELETE /api/notes/{id}`.

## Open decisions (need a call before building)

1. **"Send to graph" semantics — what happens to the source idea?**
   (a) **Move** = create node + delete the idea; (b) **Copy** = create node, leave the idea as-is;
   (c) **Convert** = create node + keep the idea but clear its `active` flag (drops out of the Active
   section, stays in the list).
2. **Standalone task-graph dashboard dock** — **remove it** (task graph lives only as an Ideas tab
   now) or **keep both** (tab *and* the floating dock)?
3. *(minor, sensible defaults)* carry the idea's `project` into the node `note`; place new nodes at
   a default fanned-out position; switch to the Task graph tab after sending.

## Considerations
- The task graph canvas wants room; inside the (narrow) Ideas dashboard **aside** it'll be tight, but
  it's pan/zoom + drag-resizable, and the **routed Ideas tab** is full-width. Acceptable.
- The `taskGraph` feature flag now gates the **Ideas tab** instead of the dock.

## Out of scope
- Reverse direction (graph node → idea), bulk-send, auto-linking a node back to its origin idea.
- The orphaned `/api/taskgraph/scratch` endpoint cleanup (tracked in task-dependency-graph.md).
