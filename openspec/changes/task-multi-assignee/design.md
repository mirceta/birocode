# Design — multi-assignee tasks

## D1. The set lives on the node; the legacy fields mirror the primary

`Node.Assignees` (trailing, optional) holds `Assignee { SourceId, RepoId, Status,
AssignedBy, AssignedAt, DispatchedAt, DispatchCount, Branch, HeadCommit, Pushed, PrUrl,
PrNumber, MergeCommit, VerifiedStatus, VerifiedAt, Warning, UpdatedAt }`, keyed
`"sourceId|repoId"` ("" for this harness). Every write goes through `WithAssignees`,
which stores the list, copies the FIRST assignee into the node's legacy fields and sets
`Status` to the aggregate and `Warning` to the assignees' warnings joined. `AssigneesOf`
reads the list, or the legacy fields as one assignee when the list is missing — the
back-compat path for cards written before this change or by an older sync peer;
`Normalize` runs on load and after every sync merge and never stamps `UpdatedAt`.

The `Node` record overrides equality to compare the assignee list by value: a record
compares a `List` by reference, which would make every rebuilt node "changed" and churn
saves and sync.

## D2. The aggregate rule

```
AggregateStatus(assignees):
  none            → null (the card's own status stands — an unassigned card)
  all todo        → todo
  otherwise       → max(doing, min(rank over assignees))
```
The card is as far as its slowest assignee and leaves `todo` as soon as one assignee
has started. Consequences: `done` only when every assignee is done; `pr-merged` only
when every one is at least pr-merged; one assignee reads exactly as itself (so every
single-assignee card behaves as before). Chosen over "max" (which would show a card done
while a repo is untouched) and over plain "min" (which would keep a card in Todo while
an agent is already working).

## D3. Writes

- `UpdateNode(status)` (the Operator's drag, `update_task` without `assignee`) sets that
  status on every assignee; each keeps its own badge (`WarningFor(status, its verified,
  its pushed)`). A legacy `repoId` on PATCH replaces the set with that one agent on this
  harness (blank clears it).
- `Assign(sourceId, repoId)` (legacy) replaces the set with one agent and resets its
  dispatch record; `SetAssignees` replaces (agents already on the card keep their state,
  new ones start at the card's current status); `AddAssignee` / `RemoveAssignee`; the
  last one leaving unassigns the card, whose status stays.
- `SetAssigneeStatus(id, key, status)`, `MarkDispatched(id, key)`, `RecordClaim(id, key,
  …)`, `ApplyVerification(id, key, facts)` act on one assignee; the null-key overloads
  keep the old behaviour (the primary, or the card itself when unassigned).

## D4. Arch tools

`ResolveAssigneeRefs(machine, repoId, assignees)` turns the legacy single `repoId` plus a
comma-separated `assignees` list into distinct resolved agents (handles, ids or unique
names, `machine` disambiguating). `create_task` / `idea_to_task` create with the first
and then set the full list; `assign_task` applies `mode`; `dispatch_task` pings every
assignee with `DispatchedAt` null and not delivered — or the named subset (naming one
re-pings it) — each through `SendTask` with a brief that says which repo is its own and
who else is on the card, marks each sent assignee dispatched (→ doing) and answers
`sent` / `partial` / the first failure with per-assignee results; `update_task` with
`assignee` sets that assignee's status and records its claim, without it a status
broadcasts and a branch/PR claim on a multi-assignee card is refused (whose repo?).
`list_tasks` adds `assignees[]` (handle, machine, repo, status, dispatch, linkage,
verified, warning, unverified, stale, awaitingDispatch) and its filters match ANY
assignee.

## D5. Verification and stale, per assignee

`BoardVerifier` walks every assignee of every card: local facts for an assignee on a
repo of this machine with a recorded branch, PR facts on GitHub for any assignee that
names a PR (its URL, or its branch in its repo's remote), applied through
`ApplyVerification(id, key, …)`; a done assignee is skipped (a leftover badge is shed).
Moves are reported per assignee, plus the card's own aggregate move. `IsStale(node)` is
true when any assignee is parked in committed / pr-opened past the window, judged on
that assignee's own `UpdatedAt`.

## D6. UI

- Kanban: `assigneesOf(card)` renders one `👤` chip per assignee (with its status when
  there are several); the detail view lists assignees with × remove and an "add another
  assignee" picker (the assign endpoint's `mode`); Ping pings every not-yet-pinged
  assignee.
- Task graph: `assigneeKeys(node)` gives every assignee its machine/repo colour keys;
  the palette is assigned over all of them; the legends count a task once per distinct
  machine / repo; a node with several assignees gets a double border and an assignee row
  (each chip: border = its machine, background = its repo, its own status) in place of
  the single repo picker; the legend's repository entry toggles the handles of every
  assignee in that repo.
- Filters: `taskView` carries `machines[]` / `agents[]`; the machine and agent groups
  match when ANY assignee matches; facets count a task once per distinct key.

## D7. Tests

`TaskMultiAssigneeTests` (aggregate table; set / mirror / add / remove; single-assignee
parity incl. legacy PATCH repoId; old JSON reads back as one assignee and round-trips;
broadcast vs named status; per-assignee dispatch and claims; per-assignee verification
+ aggregate + never demote + badge; the verifier pass over both assignees; stale per
assignee; any-assignee `TaskMatches`; the brief's co-assignee lines), the client
`taskFilters.test.mjs` any-match case, and a browser check of the Kanban chips and the
graph's assignee row.
