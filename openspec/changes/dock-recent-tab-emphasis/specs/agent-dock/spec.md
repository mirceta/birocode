## ADDED Requirements

### Requirement: Dock tabs record when a prompt was last sent

The system SHALL record, on each dock tab, the time a prompt was last sent to that
tab's agent: whenever a **builder**-lane run begins for a repository — by any path
(operator send, autopilot auto-send, loop resend) — every dock tab of that repository,
visible or hidden, SHALL have its server-owned `lastPromptAt` (Unix milliseconds) set
to the start time. The value SHALL persist with the dock roster (surviving page
reloads and harness restarts), SHALL be exposed read-only to clients in the dock tab
DTO, and SHALL NOT be settable by clients. Ask-lane side conversations SHALL NOT
update it. A tab that has never had a prompt since this field was introduced has no
value.

#### Scenario: A prompt is sent to a hidden dock's agent

- **WHEN** a builder-lane run starts for a repository whose dock is hidden from the dashboard grid
- **THEN** that dock tab's `lastPromptAt` is set to the run's start time on the server, and the next dock roster read returns it

#### Scenario: Recording survives a restart

- **WHEN** a prompt was sent to an agent and the harness is later restarted
- **THEN** the tab's `lastPromptAt` still reports that send time

#### Scenario: Ask lane does not count

- **WHEN** only an ask-lane (read-only) side conversation runs on a repository
- **THEN** its dock tabs' `lastPromptAt` is unchanged

#### Scenario: Clients cannot write it

- **WHEN** a client PATCHes a dock tab with a `lastPromptAt` value
- **THEN** the server ignores that field and the stored value is unchanged

### Requirement: Dock toolbar recent filter state

The dock toolbar's filter control SHALL offer a **recent** state that renders, among
hidden non-important docks, only the tabs whose agent was sent a prompt within the last
**5 hours** (`lastPromptAt` within 5 h of the current time); tabs with no
`lastPromptAt` SHALL NOT match. It SHALL be one more mutually exclusive state of the
same control and SHALL carry every guarantee the other non-All states have:
grid-visible and important docks' tabs render regardless, the selection only affects
which tabs render (grid, persisted visibility and roster order untouched), the
excluded-tab count shows when tabs are filtered out, the selection is ephemeral, and
reorder mode suspends it. Membership SHALL be evaluated against the current time on
each render, so a tab leaves the view once its last prompt is more than 5 hours old
without a page reload. The control SHALL convey accessibly that **recent** means
"prompted in the last 5 hours".

#### Scenario: Only recently prompted agents

- **WHEN** the operator selects the **recent** filter state
- **THEN** the strip renders every grid-visible dock's tab, every important dock's tab, plus the remaining hidden docks' tabs whose `lastPromptAt` is within the last 5 hours; the dashboard grid keeps rendering exactly the docks it rendered before

#### Scenario: Never-prompted and stale agents are filtered out

- **WHEN** the **recent** state is active and a hidden, non-important dock has no `lastPromptAt` or one older than 5 hours
- **THEN** that dock's tab is not rendered and counts toward the excluded-tab count

#### Scenario: A new prompt enters the view live

- **WHEN** the **recent** state is active and a prompt is sent to a hidden, non-important dock's agent that was not in the view
- **THEN** its tab renders on the next dock roster refresh, without a page reload

#### Scenario: Aging out

- **WHEN** the **recent** state is active and a rendered tab's last prompt becomes more than 5 hours old
- **THEN** the tab leaves the view on the strip's next re-render and joins the excluded-tab count

#### Scenario: Recent state inherits the filter contract

- **WHEN** the **recent** state excludes tabs, or the operator reloads, or reorder mode is entered while it is active
- **THEN** the excluded-tab count shows, the reload resets the control to **All**, and reorder mode renders the full roster with the control disabled, reapplying **recent** on exit

### Requirement: Dock toolbar emphasizes running and unseen tabs

The dock toolbar SHALL render a tab **emphasized** — approximately 1.5× the size of a
normal tab in type, dot, padding and maximum width — whenever its dot currently shows
the running state or the `!` unseen-result marker, using the same classification the
dot renders from, so emphasis and dot can never disagree. Emphasis SHALL apply in
every filter state, SHALL change only the tab's size (its label, indicators, click
behavior and accessible name are unchanged), and SHALL end when the dot returns to its
at-rest presentation. Tabs of mixed sizes SHALL share the single strip row.

#### Scenario: A run starts

- **WHEN** a dock's agent transitions to status `running`
- **THEN** its toolbar tab renders emphasized (about 1.5× a normal tab) alongside normal-sized idle tabs, in whichever filter state is active

#### Scenario: An unseen result is latched

- **WHEN** a hidden dock's tab shows the `!` unseen-result marker
- **THEN** that tab renders emphasized until the dock is shown again (clearing the latch) or a new run starts on it (which keeps it emphasized as running)

#### Scenario: Back to rest

- **WHEN** an emphasized tab's run ends while its dock is grid-visible (no latch)
- **THEN** the tab returns to normal size on the next liveness update

#### Scenario: Emphasis does not change behavior

- **WHEN** the operator clicks an emphasized tab
- **THEN** the click has exactly the meaning it would have on a normal-sized tab (hide/show, or pick/place in reorder mode)

## MODIFIED Requirements

### Requirement: Dock toolbar status filter states

The dock toolbar's filter control SHALL offer, in addition to its branch states, one
status state: **running**, which renders the tabs whose dot currently shows the running
state (the same liveness signal the strip's busy indicator reads) **or** the `!`
unseen-result marker (hidden from the grid, not running, with the server-owned
`unseenResult` flag latched) — a single "needs attention" view. There SHALL be no
separate **unseen** filter state. All filter states SHALL remain
mutually exclusive selections of one control. Classification SHALL reuse the exact
conditions the tab's dot renders from — a hidden, non-important dock's tab SHALL match
**running** if and only if its dot currently shows the running state or the `!` marker
— with no additional polling and no new server state; grid-visible and important docks'
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
- **THEN** the control offers **All**, the two branch states, **running**, and **recent** — no separate **unseen** state — and the **running** control conveys accessibly that it includes unseen results

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
