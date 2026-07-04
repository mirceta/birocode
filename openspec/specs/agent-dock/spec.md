# agent-dock Specification

## Purpose
TBD - created by archiving change add-queued-prompt-dock-border. Update Purpose after archive.
## Requirements
### Requirement: Thick black border on dock tiles with queued prompts

The system SHALL render an agent's dock tile with a thick black border whenever that agent has
one or more queued prompts (a non-empty per-agent prompt stash). The border SHALL be visibly
thicker than the tile's default border, and SHALL be applied on every dock surface that
represents an agent as a tile — the dashboard's live phones and its summary cards, and the
Agents list — so the operator can identify agents with queued work at a glance. When the
agent's queue returns to empty, the tile SHALL revert to its normal border.

#### Scenario: An agent gains a queued prompt

- **WHEN** an agent that had no queued prompts has a prompt added to its queue
- **THEN** that agent's dock tile is drawn with the thick black border on every surface where the tile appears

#### Scenario: The queue empties

- **WHEN** the last queued prompt for an agent is sent or removed
- **THEN** that agent's dock tile reverts to its normal (non-black, default-thickness) border

#### Scenario: An agent with no queued prompts is unaffected

- **WHEN** an agent has an empty queue
- **THEN** its dock tile keeps its normal border and shows no black border

### Requirement: Queued border takes precedence over other border states

The system SHALL give the queued-prompt black border visual precedence over the tile's other
color-coded border states (active, recency, colored-agent, and the important border) while
prompts are queued, so the queued signal is not hidden by another border state. A state drawn
by a different mechanism than the border (such as a layered glow) MAY remain visible alongside
the black border.

#### Scenario: Queued and important at once

- **WHEN** an agent is both marked important and has one or more queued prompts
- **THEN** its dock tile shows the thick black queued border (taking precedence over the important border)

### Requirement: The queued border honors the dock's Advanced gate

The system SHALL show the queued-prompt border only where the agent dock itself is shown —
behind the same Advanced-mode gate as the dashboard / agent dock and the prompt-stash feature —
so Basic mode is unaffected.

#### Scenario: Basic mode shows no dock and no border

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** neither the agent dock nor the queued-prompt border is shown

### Requirement: Maximize chat to fill the dock

The system SHALL let the operator collapse an agent dock's non-chat chrome — the phone
bar/header, the lane switcher (Builder/Ask/Files), the local-apps switcher, the git-status
block, and the discover-local-apps block — so that the chat (message list and composer) fills
the dock's full vertical space. This SHALL be controlled by a single toggle button placed in the
chat toolbar immediately next to the existing Tool Calls button. The same button SHALL both
maximize and restore: pressing it when the dock is in its normal layout maximizes the chat, and
pressing it again restores the dock to its previous (normal) layout. The button SHALL convey its
current state (pressed/active when maximized) and SHALL carry an accessible label.

#### Scenario: Maximize the chat

- **WHEN** the operator presses the maximize-chat button on a dock that is showing its normal layout
- **THEN** the dock hides its non-chat chrome and the chat fills the dock's full vertical space, and the button shows its active (pressed) state

#### Scenario: Restore the previous layout

- **WHEN** the operator presses the maximize-chat button on a dock whose chat is currently maximized
- **THEN** the dock restores its previous normal layout with the non-chat chrome shown again, and the button returns to its inactive state

#### Scenario: The composer and chat toolbar stay usable when maximized

- **WHEN** the chat is maximized
- **THEN** the chat toolbar (including the maximize-chat and Tool Calls buttons) and the composer remain visible and usable, so the operator can still type, open tool calls, and un-maximize

### Requirement: Maximize state is per-dock and ephemeral

The system SHALL track the maximized state independently for each agent dock, so maximizing one
dock does not affect any other dock. This state SHALL be ephemeral client-side UI state: it is
not persisted and SHALL reset to the normal layout when the web UI is reloaded.

#### Scenario: One dock maximized does not affect others

- **WHEN** the operator maximizes the chat in one agent dock while other docks are visible
- **THEN** only that dock collapses its chrome; the other docks keep their normal layout

#### Scenario: State resets on reload

- **WHEN** a dock's chat is maximized and the operator reloads the web UI
- **THEN** the dock comes back in its normal (non-maximized) layout

### Requirement: Maximize toggle respects the Advanced-mode gate

The system SHALL expose the maximize-chat toggle only in Advanced mode — behind the same gate as
the agent dock and the tool-call-history toggle it sits beside — so Basic (Simple) mode does not
show it.

#### Scenario: Hidden in Basic mode

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the maximize-chat toggle is not shown

#### Scenario: Available in Advanced mode

- **WHEN** the web UI is in Advanced mode
- **THEN** the maximize-chat toggle is available in the agent dock's chat toolbar next to the Tool Calls button

### Requirement: Dashboard dock toolbar lists every dock as a toggleable tab

The system SHALL show, at the top of the Dashboard, a dock toolbar containing one tab per
agent dock in the roster — **including docks that are currently hidden from the grid** — so the
operator can see the full set of docks in one place. Each tab SHALL be labeled and color-coded
from that dock's own identity (its display name and color), and SHALL convey whether the dock is
currently rendered in the grid (active) or hidden (inactive), with an accessible state. The
toolbar SHALL reflect live changes to the roster — docks added, removed, or renamed — without a
page reload, drawing from the same dock source the grid uses.

#### Scenario: The toolbar shows all docks, visible and hidden

- **WHEN** the Dashboard is open and the roster contains both docks that render in the grid and docks that are hidden from it
- **THEN** the toolbar shows one tab for every dock in the roster, with visible docks' tabs marked active and hidden docks' tabs marked inactive

#### Scenario: The toolbar tracks the live roster

- **WHEN** a dock is added to, removed from, or renamed in the roster while the Dashboard is open
- **THEN** the toolbar's tabs update to match without a page reload

### Requirement: Clicking a dock's tab toggles whether it renders in the grid

The system SHALL make each toolbar tab toggle its dock's rendered-on-dashboard state. Clicking
an **active** tab SHALL hide that dock — remove its tile from the Dashboard grid — and show the
tab as inactive; clicking an **inactive** tab SHALL show the dock again — its tile SHALL reappear
in the grid — and show the tab as active. This toggle SHALL drive the dock's existing
dashboard-visibility state (the `dashboard` field) through the existing dock update path, so the
grid, the toolbar, and any other surface that reads that state stay consistent. Hiding a dock
from the grid SHALL NOT close, stop, or delete the dock; it only affects whether its tile is
rendered.

#### Scenario: Hide a rendered dock from the toolbar

- **WHEN** the operator clicks an active tab for a dock whose tile is currently in the grid
- **THEN** that dock's tile is removed from the grid and the tab becomes inactive, and the dock itself is not closed or deleted

#### Scenario: Re-show a hidden dock from the toolbar

- **WHEN** the operator clicks an inactive tab for a dock that is currently hidden from the grid
- **THEN** that dock's tile reappears in the grid and the tab becomes active

#### Scenario: The toggle agrees with the Agents-page visibility control

- **WHEN** the operator toggles a dock's visibility from the toolbar
- **THEN** the same dock's visibility control on the Agents page reflects the new state, and vice-versa, because both act on the one shared dashboard-visibility state

#### Scenario: All docks hidden shows a recoverable empty grid

- **WHEN** the operator hides every dock so the grid has no tiles
- **THEN** the grid shows an empty-state hint and the toolbar still shows all docks' (inactive) tabs so any dock can be re-shown with one click

### Requirement: The dock toolbar honors the dashboard's Advanced gate

The system SHALL show the dock toolbar only where the agent dashboard / agent dock itself is
shown — behind the same Advanced-mode gate — so Basic (Simple) mode is unaffected.

#### Scenario: Basic mode shows no dashboard and no toolbar

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** neither the agent dashboard nor the dock toolbar is shown

### Requirement: Agent dock reconstructed from the collected feed
The events-app primary page SHALL offer an Agents tab rendering a dock — one card per collector source (machine), each containing one square per repository that `turn.*` events have been observed for on that source — reconstructed client-side from the already-polled collector feed, with no additional endpoint or request. Each square SHALL show the repository name, a running indicator while a `turn.start` has no matching `turn.ended` (dropped again after the board's running-max-age), and run count plus last-activity age. A source with no observed agent activity SHALL render its card with an explicit empty note. The tab SHALL state that it reconstructs from the recent retained trail.

#### Scenario: Seeing what runs where
- **WHEN** agents have produced turn events on several machines
- **THEN** the Agents tab shows each machine's card with a square per repository worked on, and squares with unfinished `turn.start` events show a running indicator

#### Scenario: Old harness without start events
- **WHEN** a source emits only `turn.ended` events (no `turn.start`)
- **THEN** its repo squares and trails render from finish events alone and the running indicator simply never lights

#### Scenario: Machine with no activity
- **WHEN** a registered source has produced no `turn.*` events within the retained feed
- **THEN** its card renders with an explicit "no agent activity observed" note, never blank

### Requirement: Trail drill-down per machine and repository
Clicking a repo square outside display mode SHALL open the reconstructed trail for that machine × repository — newest first: started rows for open runs, finished rows with status, duration when both ends were observed, and turns/cost when reported — with a close affordance. In display mode squares SHALL be inert and no trail SHALL render.

#### Scenario: Reading a repo's trail
- **WHEN** the Operator clicks a repo square outside display mode
- **THEN** the trail for that machine × repo opens in place, showing each run's start/finish, status, and duration where derivable

#### Scenario: Display mode stays glanceable
- **WHEN** the page is in display mode
- **THEN** dock cards and running indicators render, but squares have no click affordance and no trail opens

