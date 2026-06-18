# Task dependency graph — a first-class "what must I do first" board on the dashboard

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-18): SHIPPED.** Built with **React Flow**, a **single global board**, **repo
> label/colour only** (no live agent telemetry). The dashboard dock lets you add step nodes (with an
> agent), drag "waits-on" edges, cycle status (todo/doing/done), rename/delete, see **do-next**
> (green ring on unblocked steps) and trace **why** (click a step → highlights the chain up to its
> goal). Backend-synced via `/api/taskgraph` (`taskgraph.json`); dock is **drag-resizable** like
> Autopilot. Clicking a step opens a **detail/edit view on the bottom half** — its title, agent and
> status, plus a **per-node notes** box backend-synced (debounced) via `PATCH
> /api/taskgraph/nodes/{id}`. (The bottom half originally held a *global scratchpad* meant as a
> "foil" experiment; on 2026-06-18 it was **repurposed into per-node notes** at user request. The old
> `Board.Scratch` field + `PATCH /api/taskgraph/scratch` endpoint are now **orphaned** — harmless,
> pending a cleanup deploy.) Both the core board and the node-detail/per-node-notes enhancement are
> deployed to live `:5099` and **merged to main 2026-06-18** (branches `feature/task-dependency-graph`,
> `feature/taskgraph-node-detail`).

## The problem

Work across our agents (= the Claude Web **agents**, i.e. repositories on disk) is full of
**prerequisite chains that you discover as you go**, and today they live only in the operator's
head. A real example:

1. `web-flow-autodev` needs the **claude monitor gateway** open.
2. That gateway lives in the **`birokrat-ai-platform`** agent → so step 1 waits on starting it there.
3. But `birokrat-ai-platform` has **no local-app exposure** yet → so step 2 waits on adding that.
4. Do the exposure → unblocks the gateway → unblocks `web-flow-autodev`.

You keep climbing down to the deepest blocker, do it, then climb back up. The painful part isn't
doing the work — it's **remembering *why* you're doing a sub-task** and **what's now unblocked**.
This happens constantly and there is no place to record it.

## Goal

A **first-class dashboard section** — a sibling of **Ideas** and **Autopilot** — that lets you
build and read a **dependency graph of the steps to prepare for a primary task**: create step
nodes, attach each to an agent, draw "must happen before" edges, mark steps done, and at a glance
see **what's actionable now** and **trace any step up to the primary task it serves**.

Visually modeled on the on-disk viz apps the user named as templates
(`birokrat-architecture/viz`, `web-flow-autodev/plans/pipeline-graph.html`).

## Design sketch (to firm up after the open decisions)

### Data model
A **flow** = one primary task + its prerequisite DAG. Each **node** (step):
`{ id, title, note?, repoId?, status: todo|doing|done }`. Each **edge**: `from depends-on to`
(i.e. `to` must be done before `from`); the **primary task** is the root, leaves are the first
things to do. `repoId` links a step to one of the registered agents (the repo selector / dock).

- **Actionable now** = a node that is `!done` and whose dependencies are all `done` (or has none).
  The board highlights these — the answer to "what do I do next".
- **Why am I doing this** = the path from a node up to the primary task (highlight ancestors).

### Persistence + API (mirror Ideas/Autopilot)
A global, backend-synced store (a JSON file like `ideas.json` / `autopilot.json`) behind a small
controller — `GET` the flow(s), `POST/PATCH/DELETE` nodes and edges. Global (not per-repo): a flow
spans several agents by nature. Cross-device + durable, same pattern as Ideas.

### Dashboard section (reuse the dock platform)
A new dock that is a **citizen of the dashboard drag layout** exactly like the
[Autopilot dock](autopilot-to-harness.md) and Ideas: draggable/resizable/collapsible, gated on a
new **Advanced** capability flag (e.g. `taskGraph`), self-hiding when off. No new layout
machinery — it slots into `Dashboard.jsx`'s existing `dragKeys`/`positions` system.

### Visualization (template-faithful)
Render with **Cytoscape.js** + a **layered DAG layout computed from the dependency edges**, ported
from `web-flow-autodev/plans/pipeline-graph.html`'s `lvl()` longest-chain leveling — the templates
already prove this for prerequisite/`upstream` graphs. Node colour encodes status; the actionable
frontier and the ancestor "why" path get highlight styles; hover/click shows the node detail
(reusing the focus-on-hover pattern from both templates). Editing = simple add-node / link-edge /
mark-done controls writing back through the API.

## Decisions (locked 2026-06-18)

1. **Graph library: React Flow.** We need first-class in-canvas authoring — create nodes and draw
   edges between them — so React Flow (`@xyflow/react`) over Cytoscape, despite diverging from the
   read-only templates. We still borrow the templates' *look* (status colours, the layered sense of
   "first things at the leaves") and their dependency-edge data shape.
2. **One global board.** A single board to start (not multiple named flows). Simpler to ship; a
   flow-switcher can come later if needed.
3. **Repo label/colour only.** A node carries a `repoId` shown as a label/colour; **no** live agent
   telemetry on nodes (running/exposure) — explicitly kept simple.

## Relationship to existing work (reference, don't duplicate)

- Distinct from [dependent agents](plans/dependent-agents.md) (shipped): that links two **docks**
  structurally into a "together" group at the **agent** level. This is a graph of **task steps**
  (finer-grained, spanning agents) — a different unit. They can coexist.
- Reuses the dashboard dock/drag platform from [autopilot-to-harness](autopilot-to-harness.md) and
  the Ideas/Autopilot section pattern; no new layout system.

## Out of scope (for now)

- Auto-discovering dependencies for the user — the operator authors the graph; the app records and
  visualizes it.
- Driving agents from the graph (no "run this step" actions) — that's Autopilot's territory.
- Live per-node agent telemetry beyond a simple repo label (a possible later slice).
