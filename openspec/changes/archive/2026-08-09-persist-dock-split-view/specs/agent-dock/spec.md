## ADDED Requirements

### Requirement: Dock local-app view state survives hide and re-show

The system SHALL remember, per agent dock and per device, the dock's local-app
view state — which local app is open, whether the split presentation is active,
and the split ratio — across the dock being unmounted and remounted (hidden and
re-shown via the dock toolbar strip, filtered out and back by the
"show only important" filter, or a page reload). On remount, the dock SHALL
restore that view without operator action: the same app open, in the same
presentation, at the same ratio. Restoration SHALL be guarded: if the remembered
app is no longer in the repo's discovered-apps list once that list has loaded,
the dock SHALL fall back to plain chat and drop the stale memory; the split
presentation SHALL only be restored together with its app and subject to the
existing Advanced-mode gate. Explicitly closing the app (or switching the dock to
a view that closes it, such as files or console) SHALL be remembered as closed —
re-showing the dock then lands on plain chat. The remembered state SHALL be
device-local client state only: not shared between devices and not stored on the
backend.

#### Scenario: Hide and re-show restores app, split, and ratio

- **WHEN** the operator has a local app open in split presentation with a custom
  divider ratio, hides the dock via the dock toolbar strip, and later re-shows it
- **THEN** the dock renders with the same app open, split active, and the divider
  at the remembered ratio, with no re-setup clicks

#### Scenario: Cover presentation is restored as cover

- **WHEN** the operator has an app open in cover presentation, hides the dock, and re-shows it
- **THEN** the app is open in cover presentation, not split

#### Scenario: Vanished app degrades to chat and is forgotten

- **WHEN** a dock is re-shown but its remembered app is no longer in the repo's
  discovered-apps list once the list has loaded
- **THEN** the dock shows plain chat, and a subsequent hide/re-show does not
  attempt to restore that app again

#### Scenario: Explicit close is remembered

- **WHEN** the operator closes the opened app (or opens the files or console view,
  which closes it) and then hides and re-shows the dock
- **THEN** the dock renders plain chat — closed means closed

#### Scenario: Restore honors the Advanced gate

- **WHEN** a dock with remembered split state is re-shown while the UI is in
  Basic (Simple) mode
- **THEN** the app opens in cover presentation per the existing gate rules, and
  the remembered split choice is not erased for later Advanced-mode use

## MODIFIED Requirements

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
via an explicit per-dock affordance. The mode SHALL be per-dock and device-local:
it SHALL NOT be shared between devices, and it SHALL persist on the device across
the dock being hidden and re-shown and across page reloads (see "Dock local-app
view state survives hide and re-show"). Switching modes or opening/closing the app SHALL NOT
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

#### Scenario: Split mode is per-dock and device-local

- **WHEN** the operator puts one dock into split while other docks have apps open
- **THEN** only that dock renders side-by-side, and the choice does not propagate to other docks or other devices, though it does persist on this device across hide/re-show and reload

#### Scenario: Split affordance honors the Advanced gate

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the split affordance is not offered, and opening a local app uses the cover presentation

### Requirement: Adjustable split ratio via a draggable divider

While a dock is in split presentation, the system SHALL render a draggable
vertical divider between the chat pane and the app pane, and dragging it
horizontally SHALL reallocate width between the two panes without reloading
the app frame or remounting the chat. The ratio SHALL be clamped so both
panes remain usable, and SHALL be per-dock and device-local, persisting on
the device across the dock being hidden and re-shown and across page reloads
(see "Dock local-app view state survives hide and re-show"); it SHALL NOT be
stored on the backend or shared between devices.

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
- **THEN** the panes return to the 50/50 split, and 50/50 becomes the
  remembered ratio

#### Scenario: Ratio persists per dock

- **WHEN** the operator sets a ratio, leaves split (or switches the opened
  app), and re-enters split on the same dock on the same device — including
  after the dock was hidden and re-shown or the page reloaded
- **THEN** the previously chosen ratio is restored, and other docks are
  unaffected

#### Scenario: Ratio does not cross devices

- **WHEN** the operator sets a ratio on one device and opens the same dock in
  split on another device
- **THEN** the other device uses its own remembered ratio (or the 50/50
  default), because there is no server or cross-device persistence
