# task-graph — delta for kanban-lifecycle-columns

## MODIFIED Requirements

### Requirement: Global task board
The harness SHALL maintain one global task graph — nodes with a title (required,
≤ 2 000 chars), an optional note (≤ 20 000 chars), an optional repo id label, an
optional machine (grouping box) id, a status in the delivery lifecycle
`todo | doing | committed | pr-opened | pr-merged | done`, an optional
branch/PR linkage (branch name, head commit, pushed flag, PR URL and number,
merge commit, verified status, warning), and a canvas position — plus edges
where `Source` depends on `Target`, plus a free-text scratch pad. It SHALL be
served over `/api/taskgraph` (read the board; create, patch and delete nodes;
create and delete edges; create, patch and delete machines; set the scratch)
and persisted locally with atomic writes, independent of which repo is
selected. Blocked SHALL remain a derived flag (an unfinished prerequisite),
not a status; a prerequisite counts as finished when its status is
`pr-merged` or `done`.

#### Scenario: Create and read a node
- **WHEN** a node is created with a title through the API
- **THEN** it appears in the board read with status `todo`, the given position, and
  creation and update timestamps

#### Scenario: Blank title is refused
- **WHEN** a node is created or patched with an empty title
- **THEN** the request is rejected and the board is unchanged

## ADDED Requirements

### Requirement: Harness-verified lifecycle transitions
The harness SHALL advance a card itself when it observes the fact in the
assignee repo's git state or its GitHub PRs: a recorded branch carrying
commits beyond the default branch → `committed`; the branch on origin with a
PR found → `pr-opened`; the PR merged → `pr-merged`; and `done` when the
merge commit is additionally live on the machine that did the work where the
repo is a deployed harness (a repo that is not a deployed harness is `done`
when merged). Observation SHALL only move a card forward. An agent's claim
(relayed through the arch's `update_task`) SHALL move the card no further
than the verified state supports: forward claims are clamped to
`max(doing, verified status)` and the clamp SHALL be recorded on the card
(e.g. "agent reported done, branch not on origin"); backward moves SHALL
stay free. The Operator's direct node PATCH SHALL NOT be clamped.

#### Scenario: Agent claims done with an unpushed branch
- **WHEN** an agent's closing line claims the task finished but the recorded branch is not on origin
- **THEN** the card lands in `committed` and its warning records that the agent reported done while the branch is not on origin

#### Scenario: Harness observes the merge
- **WHEN** the verifier finds the recorded branch's PR merged
- **THEN** the card moves to `pr-merged` without any agent or arch claim

#### Scenario: Observation never demotes
- **WHEN** a card is `pr-merged` and its branch is later deleted locally
- **THEN** the card keeps its status

### Requirement: Migration of pre-lifecycle boards
On first load of a board persisted before the lifecycle (schema version < 2),
`todo` and `doing` SHALL be kept; `done` SHALL become `pr-merged` when the
card carries merge evidence (a recorded merge commit or merged PR), otherwise
`committed` with a warning badge recording the migration. The migration SHALL
run once (schema-version stamped) and SHALL be idempotent across reloads.

#### Scenario: Legacy done card without evidence
- **WHEN** a schema-1 board with a `done` card and no recorded PR loads
- **THEN** the card reads `committed` with a migration warning, and a reload does not change it again

### Requirement: Stale delivery flag
A card in `committed` or `pr-opened` with no activity for a configurable
window (default 24 h, `TaskBoard:StaleHours`) SHALL be flagged stale: exposed
by `list_tasks`, shown on the Kanban card, and listed per machine in the
fleet Status tab as "stale: unpushed branch on <machine>" / "stale: PR open".

#### Scenario: Unpushed branch goes stale
- **WHEN** a card sits in `committed` for longer than the window with no updates
- **THEN** the board and the Status tab flag it stale on the assignee's machine

### Requirement: Lifecycle columns in Kanban and Task graph
The Kanban SHALL render the six lifecycle statuses as its columns (assignment
is shown on the card, not as a column) with the card's branch (marked when
not on origin), PR link, warning and stale badges; the Task graph SHALL cycle
nodes through all six statuses and highlight as actionable the nodes whose
prerequisites are all delivered (`pr-merged`/`done`).

#### Scenario: Six columns render
- **WHEN** the Kanban opens on a board with cards in every status
- **THEN** all six columns appear in lifecycle order with the cards in their status column
