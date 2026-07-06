# status-monitor

## MODIFIED Requirements

### Requirement: Fleet status on the events-app primary page
The events-app primary page (`events-app/index.html`) SHALL render the fleet's status alongside its existing source administration and merged log, organized as a **pinned attention queue above a tabbed interactive view**: the attention queue SHALL appear above all other content and outside the tabs; an **Activity** tab SHALL hold per-source status (including running agents) integrated with the Sources panel and the merged event log; an **Agents** tab SHALL hold the agent dock (see the `agent-dock` capability); a **GitHub** tab SHALL hold the GitHub panel and its in-app PR browser. It SHALL remain a single page at a single URL — the tabs switch content client-side from one board poll, with no separate board page. (Refines the 2026-07-03 one-surface decision: still one page and one poll, with sibling tabs rather than one continuous scroll.)

#### Scenario: One page, attention pinned, tabs below
- **WHEN** the Operator opens the events-app
- **THEN** the attention queue is shown at the top outside the tabs, and below it the Activity, Agents, and GitHub tabs — with exactly one tab's content visible and no second page to visit

#### Scenario: The old board page is gone
- **WHEN** `board.html` is requested under the events-app path
- **THEN** it yields a plain 404 (the tabs are in-page navigation, not a separate page, and the wallboard experience is the display mode of the primary page)

### Requirement: Tabbed navigation state
The events-app primary page's tab selection SHALL be device-local and URL-addressable: the active tab SHALL persist across reloads on that device and SHALL be reflected in a `?tab=` query parameter so a tab is linkable. On load, an explicit `?tab=` value SHALL win, else the persisted value, else the Activity tab as default. Switching tabs SHALL NOT trigger a page reload or an extra board poll. In display mode (`?display=1`) the tab bar SHALL be hidden and every tab's content SHALL render together (the `?tab=` value is ignored), preserving the single-glance wallboard.

#### Scenario: Tab persists and is linkable
- **WHEN** the Operator selects the GitHub tab
- **THEN** the URL reflects `?tab=github`, reopening the page on that device restores the GitHub tab, and opening a `?tab=github` link lands directly on it

#### Scenario: Switching tabs does not re-poll
- **WHEN** the Operator switches between tabs
- **THEN** the visible content changes instantly from already-polled data, with no page reload and no additional board request

#### Scenario: Display mode ignores tabs
- **WHEN** the page is in display mode (`?display=1`)
- **THEN** no tab bar is shown and the attention queue, fleet, agent dock, and GitHub tiles all render enlarged in one glance, regardless of any `?tab=` value
