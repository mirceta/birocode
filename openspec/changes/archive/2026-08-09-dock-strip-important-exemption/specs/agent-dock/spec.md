## MODIFIED Requirements

### Requirement: Dock toolbar branch filter

The dashboard's dock toolbar SHALL offer a three-state branch filter over its tabs:
**All** (every roster dock's tab renders, the default), **on main** (only tabs whose
repo's current branch is `main` or `master`), and **not on main** (only tabs whose repo's
branch is known and is neither `main` nor `master`). A tab whose dock is currently
visible on the dashboard grid (`dashboard !== false`) **or** whose dock's
server-persisted `important` flag is set SHALL render under **every**
filter state regardless of its branch classification — filters only ever narrow the
tabs of hidden, non-important docks, so the strip always shows at least every
grid-visible dock and every important dock. Classification SHALL reuse the same
per-repo branch the strip's branch row already reads (the dashboard's git status map),
with no additional git polling; docks sharing a repo classify identically. A tab whose
branch is unknown (fetch pending, repo unreadable, or branch reported `unknown`) and
whose dock is hidden from the grid and not important SHALL
render only in **All**. The filter SHALL affect only which tabs the strip renders: it
SHALL NOT change the dashboard grid, any dock's persisted dashboard-visibility state, the
roster order, or the Agents page. Tabs rendered under a filtered view SHALL keep their
full existing behavior (click-to-toggle visibility, dot states, star, branch row). The
filter control SHALL convey the active state accessibly, and when the git map refreshes
and a repo's branch changes, the filtered strip SHALL update without a page reload.

#### Scenario: Only mainline agents

- **WHEN** the operator selects the **on main** filter state
- **THEN** the strip renders every grid-visible dock's tab, every important dock's tab, plus the remaining hidden docks' tabs whose repo's branch is `main` or `master`, and the dashboard grid keeps rendering exactly the docks it rendered before

#### Scenario: Only feature-branch agents

- **WHEN** the operator selects the **not on main** filter state
- **THEN** the strip renders every grid-visible dock's tab, every important dock's tab, plus the remaining hidden docks' tabs whose repo's branch is known and is neither `main` nor `master`

#### Scenario: Grid-visible dock always renders

- **WHEN** a dock is visible on the dashboard grid and the operator selects any filter state that its branch or status classification does not match
- **THEN** the dock's tab still renders in the strip, and hiding the dock (via its tab or the Agents page) makes it subject to the active filter like any other hidden, non-important dock

#### Scenario: Important dock always renders

- **WHEN** a dock's `important` flag is set — whether the dock is visible on the grid or hidden from it — and the operator selects any filter state its branch or status classification does not match
- **THEN** the dock's tab still renders in the strip and never counts toward the excluded-tab count, and clearing the flag makes the (hidden) dock subject to the active filter again without a page reload

#### Scenario: Unknown branch shows only in All

- **WHEN** a dock hidden from the grid and not marked important has no known branch and the filter is in a non-All state
- **THEN** that dock's tab is not rendered in the strip, and selecting **All** renders it again

#### Scenario: Branch change re-buckets a tab live

- **WHEN** a filtered view is active and the dashboard's git status refresh reports a repo moved between a mainline and a non-mainline branch
- **THEN** the affected hidden, non-important docks' tabs enter or leave the filtered strip accordingly, without a page reload

#### Scenario: Filtering never touches grid visibility

- **WHEN** the operator switches between filter states while some docks are hidden from the grid
- **THEN** every dock's `dashboard` visibility state is unchanged, and the Agents-page toggles agree with the state from before the filtering

### Requirement: Dock toolbar status filter states

The dock toolbar's filter control SHALL offer, in addition to its branch states, one
status state: **running**, which renders the tabs whose dot currently shows the running
state (the same liveness signal the strip's busy indicator reads) **or** the `!`
unseen-result marker (hidden from the grid, not running, with the server-owned
`unseenResult` flag latched) — a single "needs attention" view. There SHALL be no
separate **unseen** filter state. All filter states SHALL remain
mutually exclusive selections of one control. Classification SHALL reuse the exact
conditions the tab's dot renders from — a hidden, non-important dock's tab SHALL match
**running** if and only if its dot currently shows the running state or the `!` marker —
with no additional polling and no new server state; grid-visible and important docks'
tabs render under **running** via their exemptions regardless of their dot. The status
state SHALL carry the same guarantees as the branch states:
it only affects which tabs the strip renders, rendered tabs keep their full behavior,
the excluded-tab count shows when tabs are filtered out, the selection is ephemeral, and
reorder mode suspends the filter.

#### Scenario: Running shows running and unseen agents

- **WHEN** the operator selects the **running** filter state
- **THEN** the strip renders every grid-visible dock's tab, every important dock's tab, plus the remaining hidden docks' tabs whose dot currently shows the running state or the `!` unseen-result marker, and the dashboard grid keeps rendering exactly the docks it rendered before

#### Scenario: No unseen filter state

- **WHEN** the operator opens the strip's filter control
- **THEN** the control offers **All**, the two branch states, and **running** — no separate **unseen** state — and the **running** control conveys accessibly that it includes unseen results

#### Scenario: Idle hidden dock is filtered out

- **WHEN** the **running** state is active and a dock hidden from the grid, not marked important, is idle with no unseen-result latch
- **THEN** that dock's tab is not rendered, and it counts toward the excluded-tab count

#### Scenario: Idle hidden important dock stays on the strip

- **WHEN** the **running** state is active and a dock hidden from the grid is idle with no unseen-result latch but has its `important` flag set
- **THEN** that dock's tab renders (with its ★ indicator) and does not count toward the excluded-tab count

#### Scenario: Run state changes re-bucket live

- **WHEN** the **running** state is active and a poll reports an agent started or finished a run
- **THEN** the affected tab enters or leaves the filtered strip on that update, without a page reload

#### Scenario: Showing an unseen dock keeps it on the strip

- **WHEN** the **running** state is active and the operator clicks an unseen (hidden, `!`-marked) dock's rendered tab, showing that dock on the grid
- **THEN** the dock's unseen-result latch clears, and the tab stays rendered because the dock is now grid-visible

#### Scenario: Status state inherits the filter contract

- **WHEN** the **running** state excludes tabs, or the operator reloads, or reorder mode is entered while it is active
- **THEN** the excluded-tab count shows, the reload resets the control to **All**, and reorder mode renders the full roster with the control disabled, reapplying the selection on exit
