## ADDED Requirements

### Requirement: Dock toolbar branch filter

The dashboard's dock toolbar SHALL offer a three-state branch filter over its tabs:
**All** (every roster dock's tab renders, the default), **on main** (only tabs whose
repo's current branch is `main` or `master`), and **not on main** (only tabs whose repo's
branch is known and is neither `main` nor `master`). Classification SHALL reuse the same
per-repo branch the strip's branch row already reads (the dashboard's git status map),
with no additional git polling; docks sharing a repo classify identically. A tab whose
branch is unknown (fetch pending, repo unreadable, or branch reported `unknown`) SHALL
render only in **All**. The filter SHALL affect only which tabs the strip renders: it
SHALL NOT change the dashboard grid, any dock's persisted dashboard-visibility state, the
roster order, or the Agents page. Tabs rendered under a filtered view SHALL keep their
full existing behavior (click-to-toggle visibility, dot states, star, branch row). The
filter control SHALL convey the active state accessibly, and when the git map refreshes
and a repo's branch changes, the filtered strip SHALL update without a page reload.

#### Scenario: Only mainline agents

- **WHEN** the operator selects the **on main** filter state
- **THEN** the strip renders only tabs whose repo's branch is `main` or `master`, and the dashboard grid keeps rendering exactly the docks it rendered before

#### Scenario: Only feature-branch agents

- **WHEN** the operator selects the **not on main** filter state
- **THEN** the strip renders only tabs whose repo's branch is known and is neither `main` nor `master`

#### Scenario: Unknown branch shows only in All

- **WHEN** a dock's repo has no known branch and the filter is in a non-All state
- **THEN** that dock's tab is not rendered in the strip, and selecting **All** renders it again

#### Scenario: Branch change re-buckets a tab live

- **WHEN** a filtered view is active and the dashboard's git status refresh reports a repo moved between a mainline and a non-mainline branch
- **THEN** the affected tabs enter or leave the filtered strip accordingly, without a page reload

#### Scenario: Filtering never touches grid visibility

- **WHEN** the operator switches between filter states while some docks are hidden from the grid
- **THEN** every dock's `dashboard` visibility state is unchanged, and the Agents-page toggles agree with the state from before the filtering

### Requirement: The strip conveys that a branch filter is active

The dock toolbar SHALL show how many tabs are filtered out (a hidden-tab count) whenever
a non-All filter state is selected and it excludes at least one tab, so a roster dock
never silently disappears from the strip. The count SHALL be exposed accessibly alongside
the filter control's own state.

#### Scenario: Hidden-tab count shows

- **WHEN** the **on main** state is selected and three roster docks are on feature branches or have unknown branches
- **THEN** the strip shows that three tabs are filtered out, and the control's accessible label reflects the active filter

#### Scenario: Nothing filtered, no count

- **WHEN** the selected filter state excludes no tabs (or **All** is selected)
- **THEN** no hidden-tab count is shown

### Requirement: The branch filter is ephemeral and yields to reorder mode

The branch filter selection SHALL be device-local, view-local, and ephemeral: it SHALL
reset to **All** when the web UI is reloaded and SHALL NOT be persisted server-side or
shared across devices. While the strip's reorder mode is active, the filter SHALL be
suspended — the full roster renders (so every position is reachable) and the filter
control is disabled — and the previous selection SHALL reapply when reorder mode exits.

#### Scenario: Reload resets to All

- **WHEN** the operator selects a non-All filter state and reloads the web UI
- **THEN** the strip comes back unfiltered with the control on **All**

#### Scenario: Reorder mode shows the full roster

- **WHEN** a non-All filter state is active and the operator enters reorder mode
- **THEN** every roster tab renders for reordering and the filter control is disabled; exiting reorder mode reapplies the previous filter state
