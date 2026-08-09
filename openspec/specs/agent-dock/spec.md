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

### Requirement: Side-by-side view mode for an opened local app

The system SHALL offer, per agent dock, a **split** presentation for the dock's opened
local app alongside the existing **cover** presentation. In split, the dock's chrome
(header, lane switcher, local-apps switcher, git and discovery blocks) SHALL remain
visible in its normal full-dock-width placement and under its usual visibility rules —
exactly as with no app open — and the dock's screen area SHALL render as two
side-by-side panes: the **left pane** holding the chat with its full message list and
composer, the **right pane** holding the opened app's frame (the same same-origin
proxied frame as the cover presentation). In cover, behavior is unchanged:
the app takes the dock's surface and the chat collapses to its composer-only strip. The
operator SHALL be able to switch a dock between cover and split while an app is open,
via an explicit per-dock affordance. The mode SHALL be per-dock, device-local, and
ephemeral (like the dock's maximize-chat toggle): it SHALL NOT be shared between
devices and MAY reset on reload. Switching modes or opening/closing the app SHALL NOT
remount the dock's chat subtree and SHALL NOT reload the app frame: the frame keeps its
keep-alive identity, its per-frame zoom, and its in-app state across cover ↔ split
switches. Closing the app, or switching the dock to another full-surface view (files,
console), SHALL return the dock to its normal single-pane rendering. The split
affordance is an Advanced-mode affordance; the underlying ability to open a local app
remains governed by its existing gate.

#### Scenario: Split shows chat and app side by side

- **WHEN** the operator opens a local app in a dock and selects the split presentation
- **THEN** the dock keeps its normal chrome and shows the chat's full message list and composer in a left pane with the opened app in a right pane, all visible and interactive at the same time

#### Scenario: Cover remains the existing behavior

- **WHEN** an app is open in cover presentation
- **THEN** the app occupies the dock's surface with the composer-only chat strip, exactly as before this change

#### Scenario: Switching modes preserves app and chat state

- **WHEN** the operator switches an open app between cover and split (in either direction)
- **THEN** the app frame is not reloaded — its in-app state and per-frame zoom persist — and the chat subtree is not remounted

#### Scenario: Closing the app leaves split cleanly

- **WHEN** the operator closes the opened app (or switches the dock to the files or console view) while in split
- **THEN** the dock returns to its normal single-pane rendering with no leftover second pane

#### Scenario: Split mode is per-dock and ephemeral

- **WHEN** the operator puts one dock into split while other docks have apps open
- **THEN** only that dock renders side-by-side, and the choice does not propagate to other docks, other devices, or (necessarily) across a reload

#### Scenario: Split affordance honors the Advanced gate

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the split affordance is not offered, and opening a local app uses the cover presentation

### Requirement: Split fits the dock's existing cell

Entering or leaving split presentation SHALL NOT change the dock's dashboard
grid cell width. The per-dock wide (⤢) toggle SHALL keep working independently
of split — a dock manually widened stays wide through split transitions, and a
normal dock stays normal. The two panes SHALL fit the dock's actual width at
any cell size: the pane minimum-width floors SHALL adapt (shrinking
proportionally on narrow cells) so the split row never overflows the dock
horizontally, and the divider's drag clamp SHALL honor the same adapted floors.

#### Scenario: Entering split keeps the cell width

- **WHEN** a dock in a multi-column dashboard grid enters split with an app open
- **THEN** its grid cell keeps the width it had (no forced span), and other docks do not reflow

#### Scenario: Manual wide survives split transitions

- **WHEN** a dock marked wide via the ⤢ toggle enters and then leaves split
- **THEN** it remains wide throughout, and toggling ⤢ while split takes effect immediately

#### Scenario: Panes fit a normal-width cell

- **WHEN** a dock at normal (single-column) cell width is split
- **THEN** both panes and the divider render within the dock's width with no horizontal overflow, and dragging the divider clamps at floors scaled to that width

### Requirement: Adjustable split ratio via a draggable divider

While a dock is in split presentation, the system SHALL render a draggable
vertical divider between the chat pane and the app pane, and dragging it
horizontally SHALL reallocate width between the two panes without reloading
the app frame or remounting the chat. The ratio SHALL be clamped so both
panes remain usable, and SHALL be per-dock and session-ephemeral.

#### Scenario: Dragging reallocates width

- **WHEN** the operator drags the divider horizontally (mouse or touch)
- **THEN** the chat and app panes resize live to follow the pointer, and the
  app iframe is not reloaded and the chat subtree is not remounted

#### Scenario: Drag crosses the app iframe

- **WHEN** the pointer moves over the embedded app frame mid-drag
- **THEN** the drag keeps tracking (the frame does not capture the pointer)
  and ends only when the operator releases

#### Scenario: Ratio is clamped

- **WHEN** the operator drags the divider toward either edge
- **THEN** the divider stops at the pane's minimum usable width (chat ≥
  300px, app ≥ 260px at normal zoom) instead of collapsing a pane

#### Scenario: Double-click resets

- **WHEN** the operator double-clicks the divider
- **THEN** the panes return to the 50/50 split

#### Scenario: Ratio persists per dock while mounted

- **WHEN** the operator sets a ratio, leaves split (or switches the opened
  app), and re-enters split on the same dock in the same session
- **THEN** the previously chosen ratio is restored, and other docks are
  unaffected

#### Scenario: Ratio is ephemeral

- **WHEN** the page is reloaded or the dock is closed and reopened
- **THEN** the split ratio starts back at 50/50 (no server or cross-device
  persistence)

### Requirement: Alternate dock views keep the chat composer visible

The system SHALL keep the chat composer (the prompt text box and its Send/Stop control)
visible and usable at the bottom of the dock screen whenever the operator opens any of the
agent dock's alternate views — a local app from the app switcher, the Event Console, or the
Files browser — rendering that view over the dock screen's chat area (the chat bar and the
message list). The composer SHALL behave exactly as it does when the chat is fully shown: typing,
sending, stopping, and prompt queueing all work, and an in-flight agent turn keeps streaming in
the background while the alternate view is open. Sending a prompt SHALL NOT close the alternate
view. Closing the alternate view SHALL restore the full chat view (bar, message list, composer)
without losing chat state.

#### Scenario: Opening a local app leaves the composer

- **WHEN** the operator opens a local app from the dock's app switcher
- **THEN** the app frame covers the chat bar and message list, and the chat composer remains visible and focusable below the app frame

#### Scenario: Opening the Event Console leaves the composer

- **WHEN** the operator opens the dock's Event Console view
- **THEN** the console covers the chat bar and message list, and the chat composer remains visible and focusable below it

#### Scenario: Opening the Files browser leaves the composer

- **WHEN** the operator opens the dock's Files view
- **THEN** the files browser covers the chat bar and message list, and the chat composer remains visible and focusable below it

#### Scenario: Sending a prompt while an alternate view is open

- **WHEN** the operator types a prompt in the composer and presses Send while a local app, the Event Console, or the Files view is open in the dock
- **THEN** the prompt is sent to the agent exactly as from the normal chat view, and the alternate view stays open

#### Scenario: Closing the alternate view restores the full chat

- **WHEN** the operator closes the open alternate view (toggles it off)
- **THEN** the dock shows the full chat again — bar, message list, and composer — with its state preserved (including any turn that streamed while the view was open)

### Requirement: Composer-under-view applies only to the agent dock

The system SHALL apply the composer-visible behavior only within the agent dock. The standalone
Local tab SHALL keep its existing full-area behavior, and each dock view SHALL remain behind
the same UI-mode gate that governs it today.

#### Scenario: The Local tab is unchanged

- **WHEN** the operator opens a local app from the standalone Local tab
- **THEN** the app fills the tab's body as it does today

### Requirement: Copy loop context for debugging

The dock loop popover SHALL offer a copy-for-debugging action that fetches
the agent's loop debug bundle and places a paste-ready block — a one-line
human header plus the bundle as fenced JSON — on the clipboard, confirming
success inline. The action SHALL be available regardless of loop state
(none, armed, or terminal). Where the asynchronous clipboard API is
unavailable (non-secure context), the control SHALL fall back to a
synchronous copy, and if that also fails it SHALL present the block in an
inline read-only text area for manual copying instead of failing silently.

#### Scenario: Copy on a stopped loop

- **WHEN** the user opens the loop popover of an agent whose loop stopped unexpectedly and taps the copy action
- **THEN** the clipboard holds the header plus the bundle JSON and the control confirms the copy

#### Scenario: Clipboard unavailable

- **WHEN** both clipboard mechanisms fail in the user's browser context
- **THEN** the popover shows the same block in a read-only text area selected for manual copy

### Requirement: Dock loop control is grouped by loop type

The system SHALL present the dock card's loop popover as two labeled sections
matching the autopilot console's loop-type grouping — a suggestion-based loop
section and a goal-based loop section — each carrying a one-line description of
what that loop type does. The recipe picker SHALL sit inside the goal-based
section under a visible recipes label, so a recipe name is never shown without
its loop type. The queue-based loop SHALL NOT appear on the dock while it does
not exist.

#### Scenario: A recipe name is always framed by its loop type

- **WHEN** the user opens the dock card's loop popover
- **THEN** "Drive the feature" appears inside the goal-based loop section under a recipes label, with the section's one-line description visible

#### Scenario: No queue-based section

- **WHEN** the user opens the dock card's loop popover
- **THEN** no queue-based loop section is shown

### Requirement: The suggestion loop is armable from the dock card

The system SHALL let the user arm and disarm this agent for the
suggestion-based loop from the dock card's popover, acting through the existing
operator-gated autopilot config action, and SHALL show the agent's current
suggestion state (not armed, armed suggest-only, or armed with auto-advance).
When the operator gate is closed, attempting to arm SHALL show the existing
explicit gate-closed hint rather than failing silently.

#### Scenario: Arm suggestions where the work is

- **WHEN** the user opens the dock card's loop popover and arms the suggestion-based loop
- **THEN** that repo becomes suggestion-armed without navigating to the Autopilot console, and the popover reflects the armed state

#### Scenario: Gate closed teaches instead of failing mutely

- **WHEN** the user toggles suggestion arming from the dock while the operator gate is closed
- **THEN** the card shows the explicit gate-closed hint naming the host-side action needed

### Requirement: The dock loop badge is typed by loop type

The system SHALL type the dock card's loop indicators by loop type: the
goal-based loop badge carries the goal-loop marker (with iteration progress
while active and the terminal states as before), and a distinct
suggestion-loop marker SHALL show while the repo is suggestion-armed, drawn
from the read-only projection so it stays honest while the operator gate is
closed.

#### Scenario: Both loop types visible at a glance

- **WHEN** a dock card's repo is suggestion-armed and also has a goal loop on iteration 3 of 10
- **THEN** the card shows the suggestion marker and a goal-typed badge conveying 3/10

### Requirement: Prominent send-button-mirrored work indicator in the dock header

The system SHALL show a prominent work indicator in the top-left corner of each agent dock's
header (the `phone__bar`) whose color language mirrors the chat composer's send button: while
the agent is NOT processing (status `idle` or `done`) the indicator SHALL be accent orange
(`--color-accent`, the send button's at-rest color), and while the agent IS processing a turn
(status `running`) the indicator SHALL be near-black (`--color-text`, the send button's
Stop-state color). The indicator SHALL be substantially larger and higher-contrast than the
previous 9px status dot, so the busy/idle distinction is legible at a glance across a wall of
docks. This replaces the previous scheme (grey idle dot, small green pulse while running, blue
done dot).

#### Scenario: Agent is idle

- **WHEN** a dock's agent has status `idle`
- **THEN** the dock header's top-left indicator renders in accent orange (`--color-accent`)

#### Scenario: Agent starts processing

- **WHEN** a dock's agent transitions to status `running` (a turn is being sent or processed)
- **THEN** the indicator turns near-black (`--color-text`), matching the send button's busy/Stop color

#### Scenario: Turn completes

- **WHEN** the agent's turn finishes and status becomes `done`
- **THEN** the indicator returns to accent orange, the same at-rest color as `idle`

#### Scenario: Legible at a glance

- **WHEN** the operator views the dashboard's wall of docks
- **THEN** each dock's indicator is visibly larger than the former 9px dot and its busy (black) vs at-rest (orange) state can be distinguished without leaning in

### Requirement: Dock toolbar dots mirror the busy state for the full roster

The dashboard's dock toolbar SHALL reuse the same busy color language on each tab's dot. The
toolbar is the horizontal strip listing EVERY dock, including ones hidden from the grid: at
rest the dot
keeps the dock's assigned color (its existing behavior), and while that dock's agent is
processing a turn (status `running`) the dot SHALL turn near-black (`--color-text`). Because
the strip lists the full roster, this SHALL work for docks hidden from the dashboard grid —
the operator can tell a hidden agent is busy without re-showing it.

#### Scenario: Toolbar dot at rest keeps the assigned color

- **WHEN** a dock's agent is not processing (status `idle`, `done`, or `error`)
- **THEN** its toolbar tab's dot shows the dock's assigned color (or the neutral default when no color is assigned)

#### Scenario: Toolbar dot goes black while running

- **WHEN** a dock's agent transitions to status `running`
- **THEN** its toolbar tab's dot turns near-black (`--color-text`), regardless of the assigned color

#### Scenario: Hidden dock's busy state is visible in the strip

- **WHEN** a dock is hidden from the dashboard grid (`dashboard === false`) and a prompt is running on its agent
- **THEN** its toolbar dot still turns black, so the busy state is visible without re-showing the dock

### Requirement: Unseen-result exclamation on hidden docks' toolbar dots

The system SHALL latch a server-persisted unseen-result flag on a dock tab when a
builder-lane run reaches a genuine terminal status (`done` or `error`) while that dock is
HIDDEN from the dashboard grid (`dashboard === false`), and the toolbar SHALL render the
tab's dot as an exclamation point instead of the assigned color. The latch is an
operator-acknowledgement flag, not an agent status: it SHALL persist (through idleness,
page reloads, and browsers being closed at completion time) until the dock is shown on the
dashboard again, whereupon it SHALL clear — whichever route turned visibility on (the
toolbar tab or the Agents-page toggle). While a new prompt is running on a latched dock,
the running (near-black, pulsing) presentation SHALL take precedence; when that run
finishes while still hidden, the exclamation SHALL return. A dock that is visible on the
grid SHALL never show the exclamation — a finish that lands while the dock is shown needs
no latch. Runs ending `stopped` SHALL NOT latch (a stop is a deliberate operator action,
and app shutdown finalizes running sessions as `stopped`).

#### Scenario: Run finishes while the dock is hidden

- **WHEN** a prompt is running on an agent whose dock is hidden from the grid, and the run completes with status `done` or `error`
- **THEN** the dock tab's unseen-result flag is set on the server, and its toolbar dot renders as an exclamation point instead of the assigned color

#### Scenario: Showing the dock clears the exclamation

- **WHEN** a dock whose toolbar dot shows the exclamation is shown on the dashboard again (via the toolbar tab or the Agents-page toggle)
- **THEN** the unseen-result flag clears on the server and the dot returns to the dock's assigned color

#### Scenario: Finish lands while the dock is visible

- **WHEN** a run completes while its dock is visible on the dashboard grid
- **THEN** no unseen-result flag is latched and the toolbar dot returns to the assigned color

#### Scenario: Running outranks the exclamation

- **WHEN** a new prompt starts on a hidden dock whose unseen-result flag is latched
- **THEN** the toolbar dot shows the running presentation (near-black, pulsing) while the run is in flight, and the exclamation returns if the run finishes while the dock is still hidden

#### Scenario: Latch survives nobody watching

- **WHEN** a run completes while its dock is hidden and no browser has the dashboard open
- **THEN** the flag is still latched (it is set server-side at run completion), and any later dashboard load renders the exclamation until the dock is shown

### Requirement: Error state keeps a distinct red indicator

The system SHALL keep the error state visually distinct from the orange/black work scheme: a
dock whose agent has status `error` SHALL show a red indicator, taking precedence over the
at-rest orange.

#### Scenario: Agent errors

- **WHEN** a dock's agent has status `error`
- **THEN** the dock header's top-left indicator renders red, not orange or black

### Requirement: Dock toolbar tabs mark important docks with a star

The dashboard's dock toolbar SHALL render a star indicator on the right side
of a dock's tab when that dock's server-persisted `important` flag is set —
the same flag toggled by the dock panel's and grid cell's star control. The
star SHALL use the same gold "important" visual language as the existing
star controls, SHALL be display-only (clicking the tab keeps its existing
single action: toggling the dock's grid visibility), and SHALL appear for
hidden docks' tabs too. When the flag is cleared the star SHALL disappear
without a page reload. The tab's accessible label SHALL convey the important
state so the glyph never carries the meaning alone.

#### Scenario: Important dock shows a star on its tab

- **WHEN** a dock's `important` flag is set and the Dashboard is open
- **THEN** that dock's toolbar tab shows a gold star on its right side, whether or not the dock is currently rendered in the grid

#### Scenario: Toggling importance elsewhere updates the strip

- **WHEN** the operator toggles a dock's star in the dock panel or grid cell while the Dashboard is open
- **THEN** the toolbar tab's star appears or disappears to match, without a page reload

#### Scenario: The star is not a control

- **WHEN** the operator clicks anywhere on a tab that shows a star
- **THEN** the click performs the tab's existing hide/show toggle and the dock's `important` flag is unchanged

#### Scenario: Important state is accessible

- **WHEN** a tab's dock is marked important
- **THEN** the tab's accessible label (aria-label/title) includes the important state

### Requirement: Dock toolbar tabs show the dock's git branch

Each dock toolbar tab SHALL show the current git branch of the dock's repo
as a second row beneath the dock's name, reusing the branch the dashboard
already fetches per repo (`/git/status` → branch); the toolbar SHALL NOT
introduce its own git polling. When no branch is known for the repo (fetch
pending, repo unreadable, or branch reported as `unknown`), the tab SHALL
render without the branch row rather than showing a placeholder. Branch data
is per-repo: docks sharing a repo show the same branch. The tab's accessible
label SHALL include the branch when one is shown.

#### Scenario: Tab shows the repo's branch

- **WHEN** the Dashboard is open and the dashboard's git status for a dock's repo reports branch `feat/x`
- **THEN** that dock's toolbar tab shows `feat/x` on a second row beneath the dock's name, including when the dock is hidden from the grid

#### Scenario: No branch data, no row

- **WHEN** the git status for a dock's repo is not yet loaded, failed, or reports branch `unknown`
- **THEN** the tab renders single-line, with no branch row and no placeholder text

#### Scenario: Branch refresh propagates to the strip

- **WHEN** the dashboard's per-repo git status refreshes and the branch value changes
- **THEN** the toolbar tab's branch row updates to the new value without a page reload

#### Scenario: Branch is accessible

- **WHEN** a tab shows a branch row
- **THEN** the tab's accessible label (aria-label/title) includes the branch name

### Requirement: The dock roster order is operator-controlled and shared by strip and grid

The system SHALL treat the persisted dock roster's list order as the single
display order for agents: the dock toolbar SHALL render its tabs in exactly
that order, and the dashboard grid SHALL render the grid-visible docks in
that same relative order (the existing dependent-"together" grouping MAY
still place a dependent dock beneath its primary). The former automatic
ordering — important docks pinned first, remaining docks sorted by recency —
SHALL no longer apply; the `important` flag and recency SHALL keep their
other surfaces (star, borders, "show only important" filter) without moving
agents. The roster order SHALL be persisted server-side with the roster
itself, so it survives reloads and is shared across devices; newly opened
docks SHALL append at the end of the order.

#### Scenario: Strip order is grid order

- **WHEN** the Dashboard is open and the roster order places dock A before dock B, both grid-visible and neither in a dependent group
- **THEN** the strip shows A's tab before B's tab and the grid renders A's panel before B's panel

#### Scenario: Importance no longer repositions a dock

- **WHEN** the operator toggles a dock's `important` flag
- **THEN** the dock's position in the strip and the grid is unchanged (only star/border/filter surfaces react)

#### Scenario: Order survives reload and is shared across devices

- **WHEN** the operator reorders the roster and later reloads the Dashboard, or opens it signed in from another device
- **THEN** the strip and grid render the persisted order, not creation or recency order

### Requirement: The dock toolbar provides a click-based reorder mode

The dock toolbar SHALL provide a reorder mode, entered and exited via a
dedicated toggle control on the strip. While the mode is active, clicking a
tab SHALL pick it up (visibly marked), clicking a different tab SHALL move
the picked tab to the clicked tab's position — before it when moving toward
the front, after it when moving toward the back, so both ends of the order
are reachable — and clicking the picked tab again SHALL cancel the pick.
While the mode is active, tab clicks SHALL NOT toggle dock visibility;
exiting the mode SHALL restore the tabs' normal hide/show click. A completed
move SHALL update the strip and grid immediately and persist the new roster
order to the server. The toggle control and the picked state SHALL have
accessible labels.

#### Scenario: Reorder with two taps

- **WHEN** reorder mode is on and the operator taps dock B's tab and then dock A's tab (A ahead of B in the order)
- **THEN** B moves to A's position ahead of A, the strip and grid re-render in the new order immediately, and the order is persisted

#### Scenario: Both ends are reachable

- **WHEN** reorder mode is on and the operator taps the picked tab's target as the first tab, or as the last tab
- **THEN** the picked dock can land at the very front (before the first) or the very back (after the last) of the order

#### Scenario: Reorder mode suspends hide/show

- **WHEN** reorder mode is on and the operator taps any tab
- **THEN** no dock's grid visibility changes; after the mode is toggled off, tapping a tab hides/shows its dock as before

#### Scenario: Cancelling a pick

- **WHEN** reorder mode is on and the operator taps a tab and then taps the same tab again
- **THEN** the pick is cancelled and the order is unchanged

