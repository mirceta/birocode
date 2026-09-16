## 1. Build

- [x] 1.1 `kanbanColumns.js`: the Kanban's columns + `columnOf` as one pure module both
      views and the bar read.
- [x] 1.2 `taskFilters.js`: filter model, URL parse/format, persistence, fleet context
      (machine labels, agent handles with the numeric-suffix fallback), task views,
      matching (OR within, AND across, Unassigned), faceted counts, chips, blocked ids.
- [x] 1.3 `taskFilterStore.js`: the shared live filter (URL wins, else last saved; writes
      both; popstate) + `useTaskFilter`.
- [x] 1.4 `TaskFilterBar.jsx` + `taskfilters.css`: search, machine / agent / state / flag
      chip groups with counts, × clear, "N of M tasks", sticky.
- [x] 1.5 Kanban: bar under the head; filtered-out cards hidden; column heads "shown of
      all"; empty text names the hidden count.
- [x] 1.6 Task graph: bar + legends in one pinned block; filtered-out steps dimmed;
      "hide filtered" toggle (`hide=1`) removes them and their edges; legend entries
      toggle the same filter (machine label / agent handles / Unassigned).
- [x] 1.7 `list_tasks`: optional `machine` and `repoId` beside `status` (schema +
      dispatcher); `ArchAgentService.TaskMatches` pure rule; unknown machine/agent refused.
- [x] 1.8 Tests: `taskFilters.test.mjs` (client `npm test` runs both suites);
      `TaskBoardTests` list_tasks filter facts.

## 2. Verify

- [x] 2.1 Detached browser check (`verify-task-filters.mjs`, `@@TASKFILTERS@@`) on an
      isolated :5200 instance with seeded tasks: bar present and sticky in both views;
      chips (machine + Unassigned, agent handles, column states, blocked flag) with counts;
      state / machine (AND, OR) / agent / flag / search narrowing; URL round trip, reload,
      plain-URL fallback to the saved filter, clear; shared link applies; graph dim vs
      hide; legend → filter; shared state across side-by-side panes; list_tasks schema.
      DONE 2026-09-06 11:59 — `@@TASKFILTERS@@ pass:true, 45 checks` (log
      `.claudeweb-preview/out-task-filters.log`, evidence stamp 2026-09-06T09-58-53);
      `npm --prefix client test` 20 pass; .NET suite 276 pass; `openspec validate
      task-filters --strict` valid.

## 3. Ship

- [ ] 3.1 Commit on `feature/task-filters`; no push, no deploy (task rules); merge on the
      Operator's word.
