## ADDED Requirements

### Requirement: Dock toolbar status filter states

The dock toolbar's filter control SHALL offer, in addition to its branch states, two
status states: **running** (only tabs whose dot currently shows the running state — the
same liveness signal the strip's busy indicator reads) and **unseen** (only tabs
currently displaying the `!` unseen-result marker: hidden from the grid, not running,
with the server-owned `unseenResult` flag latched). All filter states SHALL remain
mutually exclusive selections of one control. Classification SHALL reuse the exact
conditions the tab's dot renders from — a tab SHALL match **running** or **unseen** if
and only if its dot currently shows that state — with no additional polling and no new
server state. The status states SHALL carry the same guarantees as the branch states:
they only affect which tabs the strip renders, rendered tabs keep their full behavior,
the excluded-tab count shows when tabs are filtered out, the selection is ephemeral, and
reorder mode suspends the filter.

#### Scenario: Only running agents

- **WHEN** the operator selects the **running** filter state
- **THEN** the strip renders only tabs whose dot currently shows the running state, and the dashboard grid keeps rendering exactly the docks it rendered before

#### Scenario: Only unseen-result agents

- **WHEN** the operator selects the **unseen** filter state
- **THEN** the strip renders only tabs currently showing the `!` marker, and tabs whose `unseenResult` flag is latched but whose dot does not show `!` (because the dock is grid-visible or running) are not rendered

#### Scenario: Run state changes re-bucket live

- **WHEN** a status filter state is active and a poll reports an agent started or finished a run
- **THEN** the affected tab enters or leaves the filtered strip on that update, without a page reload

#### Scenario: Showing an unseen dock clears it from the unseen view

- **WHEN** the **unseen** state is active and the operator clicks a rendered tab (showing that dock on the grid)
- **THEN** the dock's unseen-result latch clears, and the tab leaves the filtered strip on the next roster refresh

#### Scenario: Status states inherit the filter contract

- **WHEN** a status state excludes tabs, or the operator reloads, or reorder mode is entered while a status state is active
- **THEN** the excluded-tab count shows, the reload resets the control to **All**, and reorder mode renders the full roster with the control disabled, reapplying the selection on exit
