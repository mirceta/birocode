# Design — task filters

## D1. One pure model, one live store

`client/src/components/taskgraph/taskFilters.js` is a pure module (no React, no DOM),
unit-tested with `node --test` like `graphColors.js`. It owns: the filter shape
(`{ q, machines, agents, states, flags, hide }`), URL parse/format, per-browser
persistence, the fleet-derived context (machine labels, agent handles), the task view a
filter matches on (`taskView`), the matching rule (`matchesTask`: OR within a group, AND
across groups, Unassigned = null machine/agent) and faceted counts (`facets`: a chip's
count is what it WOULD show given the other groups).

`taskFilterStore.js` is the live state: a module-level value with listeners, read
through `useSyncExternalStore`. Every mounted view (the Kanban pane, the Task graph
pane, the graph's legends) reads and writes the same object, which is what makes a chip
clicked in one pane narrow the other pane in the side-by-side layout.

## D2. Keys are human, so the URL is shareable

- machine → the machine label (`spacex`), `unassigned` for tasks without an agent;
- agent → the handle `<machine>/<slug>[#k]` from the fleet status (openspec
  stable-handles); an agent whose fleet entry lacks a handle gets `<machine>/<name>` with
  `#2`, `#3`… when the name repeats on that machine; an assignee the fleet no longer
  knows gets `<machine>/<first 8 of repoId>`, so it stays filterable;
- state → the Kanban column key (`backlog | assigned | doing | done`), read through
  `kanbanColumns.columnOf`, which both the board and the graph use — so "state" means
  the same thing in both, and a new column appears in the chips by itself;
- flag → `blocked` (waits on a prerequisite not done) and `stale` (shown only when some
  card carries a `stale` flag; none does today).

A key may repeat (`machine=a&machine=b`) or be a comma list. `hide=1` is the graph's
"hide filtered". Only the filter keys are touched in the URL; `tab`, `layout` etc. stay.

## D3. Load order: URL wins, else the browser's last filter

On first read the store parses `location.search`; if it carries any filter key that is
the filter (a shared link). Otherwise the last filter saved in `localStorage`
(`claudeweb_task_filters`) is used and written back to the URL, so the page is
shareable as seen. Every change writes both. `popstate` re-reads the URL.

## D4. The bar is pinned, not fixed

`TaskFilterBar` renders a `position: sticky; top: 0` block. In the Kanban it sits under
the head, above the columns; in the Task graph it and the two colour legends share one
sticky wrapper (`.tg-pinned`) so the legends never slide under the bar. Sticky follows
whatever scrolls (the Management pane body, the dashboard page), and the graph canvas
pans inside React Flow beneath it.

## D5. Graph: dim by default, hide on demand; legend = filter

A filtered-out step keeps its place and gets `is-dim` (the existing class) so edges and
the "why" trace still make sense. With `hide` on, `visibleNodes`/`visibleEdges` drop the
filtered-out steps and any edge touching them. The legends lose their private "focus":
a machine entry toggles the machine chip of its label, a repository entry toggles the
agent chips of every task in that repo (one repo on two machines = two handles), the
neutral entry toggles Unassigned; an entry shows active when the filter selects it.

## D6. `list_tasks` filters

`ToolListTasks(status, machine, repoId)`: `repoId` resolves like `assign_task`'s
(handle, id or unique name, `machine` disambiguates); `machine` alone resolves a
machine label or `self`, or the literal `unassigned`. An unknown machine or agent is a
refusal that names the known handles — the arch should learn the right handle, not
conclude "no tasks". The pure rule is `ArchAgentService.TaskMatches`.

## D7. Tests

- `taskFilters.test.mjs` (node): handles + suffix fallback, task views, OR/AND,
  Unassigned, search, faceted counts, dynamic state keys, chips, URL round trip (incl.
  the documented `?machine=spacex&agent=spacex/prg%232&state=doing`), `withFilterInUrl`
  keeps foreign params, saved-filter normalisation.
- `TaskBoardTests` (xunit): `TaskMatches` — status, machine, agent, unassigned, AND.
- `verify-task-filters.mjs` (detached Playwright): the bar renders and is sticky in
  both views, chips and counts, state/machine/agent/flag/search narrowing, URL round
  trip and per-browser memory, "shown of all" column heads, graph dim vs hide, legend →
  filter, shared state across side-by-side panes, `list_tasks` schema.
