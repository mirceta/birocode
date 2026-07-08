# local-app-frame-persistence — delta spec

## ADDED Requirements

### Requirement: Embedded local-app frames keep their state across navigation

The system SHALL keep an opened local app's embedded frame alive — hidden, not
unmounted — when the user navigates away from its surface (the Local tab or an agent
dock), and SHALL re-show the same live frame when the user returns. Navigation alone SHALL NOT reload the embedded document: the app's frontend
state (in-app navigation, scroll, form input, in-memory data) is exactly as the user
left it. This covers all three navigation paths that currently destroy the frame:
leaving the Local tab for another studio tab, switching an agent dock from its app
view to another dock view (Builder/Ask/Files/Console) or closing the app overlay, and
a multi-pane layout scrolling the surface out of its visible window.

#### Scenario: Leave the Local tab and come back

- **WHEN** a user interacts with a local app in the Local tab, switches to another studio tab, and later returns to the Local tab
- **THEN** the same app is shown in the same live frame with its state intact, and the embedded document has not reloaded

#### Scenario: Flip a dock between its app view and chat

- **WHEN** a user viewing a local app in an agent dock switches that dock to Builder/Ask/Files/Console (or closes the app overlay) and then reopens the app view
- **THEN** the app appears exactly as it was left, without a reload

#### Scenario: Pane scrolls out of the multi-pane window

- **WHEN** a multi-pane layout scrolls the surface hosting an opened local app out of the visible pane window and later back in
- **THEN** the app's frame is re-shown with state intact

#### Scenario: Per-frame zoom survives with the frame

- **WHEN** a user has set a zoom level on a local-app frame and navigates away and back
- **THEN** the zoom level is still applied, because the same frame instance is re-shown

### Requirement: Each opened app keeps its own live frame within a surface

Within one surface, the system SHALL give each opened local app its own frame rather
than reusing a single frame whose URL is reassigned. Switching between local apps in
the same surface SHALL hide one live frame and show the other, so every opened app
retains its state independently. Frames SHALL be scoped per surface instance: the same
app opened in the Local tab and in a dock (or in two docks) is two independent frames.

#### Scenario: Switch between two apps and back

- **WHEN** a user opens app A, interacts with it, switches the same surface to app B, and then switches back to app A
- **THEN** app A is shown in its original live frame with its state intact, and app B's frame also stays alive for its own return

#### Scenario: Same app on two surfaces is independent

- **WHEN** the same local app is open in the Local tab and in an agent dock at the same time
- **THEN** each surface shows its own independent frame; interacting with one does not affect the other's state

### Requirement: Explicit per-frame refresh control

The system SHALL provide a refresh control on the embedded frame itself, presented
alongside the existing per-frame zoom control, on every surface that embeds local
apps (Local tab and agent docks). Activating it SHALL reload only that frame's
embedded document, discarding that app's state; other kept-alive frames SHALL be
unaffected. The control SHALL be available wherever the frame is shown, in both UI
modes, consistent with refresh being a viewing control. The Local tab's existing
toolbar refresh SHALL keep working and reloads the currently shown frame.

#### Scenario: Refresh one app only

- **WHEN** a user activates the frame's refresh control while two apps have kept-alive frames on the surface
- **THEN** only the visible app reloads from its URL; the other app's frame keeps its state

#### Scenario: Dock gains a refresh affordance

- **WHEN** a user views a local app inside an agent dock
- **THEN** a refresh control is available on the frame (the dock previously had none)

### Requirement: Kept-alive frames are ephemeral and bounded

Kept-alive frames SHALL be client-side, in-memory state only. A browser page reload
SHALL start with no kept-alive frames. The system SHALL release (fully unmount) a
frame when its owning context goes away: the surface's repo selection changes to a
different repo, the owning dock is removed from the roster, or the app is removed
from the repo's app list. The system SHALL bound the number of concurrently
kept-alive frames per client with a fixed cap, evicting the least-recently-visible
frame when the cap is exceeded; an evicted app simply reloads on next open.

#### Scenario: Page reload starts clean

- **WHEN** the user reloads the harness web UI
- **THEN** no kept-alive frames exist; opening a local app loads it fresh

#### Scenario: Switching the Local tab's repo releases its frames

- **WHEN** the user changes the selected repo while the Local tab holds kept-alive frames for the previous repo
- **THEN** those frames are released; returning to the previous repo later loads its apps fresh

#### Scenario: Cap eviction

- **WHEN** opening another local app would exceed the kept-alive frame cap
- **THEN** the least-recently-visible frame is released, and that app reloads fresh if opened again
