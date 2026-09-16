# Design — kanban-lifecycle-columns

## D1. Status model: one ordered array, one pure lifecycle class

`TaskGraphService.Statuses` stays the single canonical list, extended in
lifecycle order: `todo, doing, committed, pr-opened, pr-merged, done`. All
ordering/clamping/stale logic lives in a new pure static class
`TaskLifecycle` (Services/TaskGraph/TaskLifecycle.cs):

- `Rank(status)` — index in the lifecycle (unknown → 0), so "forward" and
  "backward" are well-defined.
- `IsDelivered(status)` — `pr-merged` or `done`. This is the new meaning of
  "a prerequisite is satisfied" and "nothing left to dispatch". The old code
  had three copies of `!= "done"`; they all become `!IsDelivered`.
- `Ceiling(node)` — the highest status a *claim* may set:
  `max(Rank("doing"), Rank(node.VerifiedStatus ?? "todo"))`. `todo → doing`
  is conversational (a ping, an agent picking work up) and needs no facts;
  everything from `committed` up requires harness-observed evidence.
- `ClampClaim(node, requested)` — backward moves always pass; forward moves
  land at `min(requested, Ceiling)`. Returns whether it clamped, so the
  caller can record "agent reported done, branch not on origin".
- `FromFacts(facts)` — maps observed git/PR facts to the highest supported
  status (see D3).
- `IsStale(status, updatedAt, now, staleAfterMs)` — `committed`/`pr-opened`
  with no activity for the window.

**Blocked stays derived** (a flag, not a column), exactly as today — only the
predicate changes from `p.Status != "done"` to `!IsDelivered(p.Status)`.

## D2. Card linkage: trailing optional Node fields

`Node` gains trailing optional fields (JSON/sync compatible — same contract as
the assignment fields): `Branch`, `HeadCommit`, `Pushed` (bool?), `PrUrl`,
`PrNumber` (int?), `MergeCommit`, `VerifiedStatus`, `VerifiedAt`, `Warning`.

Two writers:
- **Claims** (`RecordClaim`): the arch relays what an agent reported
  (`TASK COMMITTED <id> <branch> <commit>` / `TASK PR <id> <url>`) via new
  `update_task` args. Claims store linkage (branch/commit/prUrl) so the
  verifier knows *where to look*, but never advance status past the ceiling.
- **Facts** (`ApplyVerification`): the harness stores what it observed and
  advances `Status` forward-only (an observation never demotes a card — a
  deleted branch after merge must not un-merge the task). `VerifiedStatus`
  records the highest observed truth; `UpdatedAt` is bumped only when facts
  actually changed, so an idle card can go stale and sync doesn't churn.

`MarkDispatched` now only ever *raises* todo→doing (rank-guarded), so a
re-ping can no longer demote a `committed` card back to `doing`.

## D3. Verification: probe local git, then `gh`, then the deploy log

`TaskVerificationPoller` (BackgroundService, 60 s cadence) scans nodes that
are assigned to a repo **on this machine**, have a recorded `Branch`, and are
not yet `done`. Facts per node, via `ITaskFactsProbe` (test seam) with the
real `GitTaskFactsProbe` shelling `git`/`gh` in the repo dir:

| fact | source |
|---|---|
| branch exists + head commit | `git rev-parse --verify <branch>` (falls back to `origin/<branch>`) |
| has commits beyond default | `git rev-list --count <default>..<branch>` |
| on origin ("pushed") | `origin/<branch>` exists **and** local head is its ancestor |
| PR + merged + merge commit | `gh pr list --head <branch> --state all --json number,url,state,mergeCommit` |
| deployed (harness repos) | repo has `swap.ps1` ⇒ deployed-harness; live when the merge commit is an ancestor of the repo's default branch **and** `.claudeweb-deploy/deploy.log` shows a `deploy finished` after the merge commit's own commit time. Repos without `swap.ps1`: `done` = merged. |

`FromFacts`: commits-beyond-default → `committed`; + PR found → `pr-opened`;
+ merged → `pr-merged`; + deployed-or-not-a-harness → `done`. `gh` missing or
failing degrades to the git-only facts (never blocks `committed`).

## D4. Clamped claims in `update_task`; the human PATCH is the escape hatch

`ToolUpdateTask` gains `branch`, `commit`, `pr` args and clamps `status`
through `ClampClaim`. On clamp the card lands at the ceiling and `Warning`
records `agent reported <requested>; verified state is <applied> (branch not
on origin)`. Backward moves (e.g. → todo on blocked) stay free. The
operator's own `PATCH /api/taskgraph/nodes/{id}` is **not** clamped — the
Operator is the source of truth of last resort (and the way to resolve
migrated cards the verifier can't see).

## D5. Migration: schema-versioned, honest about what it can't prove

`Board` gains `SchemaVersion`. On load with version < 2: `todo`/`doing` keep;
`done` → `pr-merged` **only** when the card carries merge evidence
(`MergeCommit` or a merged PR recorded) — pre-lifecycle cards never do, so in
practice they land in `committed` with `Warning = "migrated: was done, no
merged PR recorded for this task"`. That is deliberate: an unverifiable
"done" is exactly the failure this change exists to surface. The badge shows
on the board; the Operator can hand-promote via the unclamped PATCH.

## D6. Stale and the fleet surfaces

- `TaskGraphService.StaleAfterMs` (default 24 h) configurable via
  `TaskBoard:StaleHours` in appsettings.
- `list_tasks` exposes `stale` (plus the full linkage) so the arch reports it.
- `list_agents` gains `unpushedTaskBranches` per local repo: branches recorded
  on board tasks at rank ≥ committed whose `Pushed != true`.
- `FleetStatus()` (Status tab payload) gains per-machine `staleTasks`
  (`stale: unpushed branch on <machine>` / `stale: PR open`), rendered in the
  Fleet Status tab.
- `GET /api/taskgraph` adds `staleHours` so the client draws the same badge.

## D7. Agent contract and the arch role prompt

`DispatchMessage` closing convention becomes: `TASK COMMITTED <id> <branch>
<commit>` (default — commit on a named branch, **no push**) | `TASK PR <id>
<url>` (only when the brief explicitly allowed pushing) | `TASK BLOCKED <id>:
<reason>`. The role prompt's task-board section teaches the six statuses, the
relay of claims through `update_task` (branch/commit/pr args), that the
harness verifies and the card lands where the facts are, and that the arch
never pushes or merges. `RoleVersionMarker` bumps to v5 so armed homes
regenerate `CLAUDE.md`.

## D8. Kanban / Task graph rendering

Kanban shows the six lifecycle columns keyed by status (assignment is a chip,
no longer a column split); cards show branch (`⚠ not on origin` until pushed),
a PR link, the migration/claim `Warning`, and `⏱ stale`. Drag-and-drop and the
detail buttons write status via the unclamped operator PATCH. The Task graph
cycles through all six statuses and its "actionable" set uses `IsDelivered`.

## Testing (all pure / temp-dir, per TaskBoardTests patterns)

Status machine (no forward skip without facts; backward free), migration
(v<2 done→committed+warning; with merge evidence → pr-merged; idempotent),
stale flagging, `FromFacts` transitions (incl. never-demote), claim-vs-fact
clamp with the recorded note, new closing lines in `DispatchMessage`, Node
JSON back-compat with the new fields, MarkDispatched rank guard.
