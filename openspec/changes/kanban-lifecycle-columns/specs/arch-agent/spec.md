# arch-agent — delta for kanban-lifecycle-columns

## ADDED Requirements

### Requirement: Task lifecycle claims are relayed, verified transitions clamp them
The arch's `update_task` SHALL accept the delivery-lifecycle statuses plus
optional `branch`, `commit` and `pr` arguments for relaying an agent's
closing-line claim (`TASK COMMITTED <id> <branch> <commit>` — the default,
no push | `TASK PR <id> <url>` — only when the Operator's brief allowed
pushing | `TASK BLOCKED <id>: <reason>`). Relayed linkage SHALL be stored on
the card; a forward status claim SHALL be clamped to the harness-verified
state (never past it) with the clamp recorded on the card, while backward
moves (e.g. to `todo` on blocked) SHALL stay free. The dispatch brief SHALL
state this closing-line convention, and the arch SHALL never push, merge or
deploy on its own — the Operator (or an explicitly allowing brief) does.

#### Scenario: Arch relays an overreaching claim
- **WHEN** the arch calls `update_task` with status `done` for a card whose branch the harness has not seen on origin
- **THEN** the card lands at the verified state (at most `committed`) and the card's warning records the overreach

#### Scenario: Blocked claim moves the card back
- **WHEN** a repo agent ends with `TASK BLOCKED <id>: <reason>` and the arch relays it
- **THEN** `update_task` moves the card to `todo` with the reason in the note, unclamped

### Requirement: The arch surfaces abandonment
`list_tasks` SHALL expose each card's branch/PR linkage and a `stale` flag
(committed or pr-opened with no activity beyond the configured window) so the
arch reports stale work. `list_agents` SHALL list, per repo on the arch's own
machine, the branches recorded on board tasks that carry commits not on
origin (`unpushedTaskBranches`), so a forgotten local branch is visible on
every wake.

#### Scenario: Stale unpushed branch is reported
- **WHEN** a card sits in `committed` past the stale window and the arch wakes
- **THEN** `list_tasks` shows it `stale` and `list_agents` names the unpushed branch on that repo
