## ADDED Requirements

### Requirement: Embedded local apps have a zoom control

The system SHALL provide a zoom control on the embedded local-app frame on both
surfaces that embed a local app through the `/api/localview/<repoId>/app/<appId>/`
proxy — the dashboard agent dock's local-apps view and the Local tab. The control
SHALL offer zoom-in and zoom-out steps and a reset-to-100% affordance, and SHALL show
the current zoom level whenever it is not 100%. The control SHALL only be rendered
while an embedded app frame is showing (not on empty states or other dock views).

#### Scenario: Zooming in the dock's local-app view

- **WHEN** the operator has a local app open in an agent dock and presses zoom-in
- **THEN** the embedded app renders larger inside the dock's frame and the control shows the new zoom level

#### Scenario: Zooming out on the Local tab

- **WHEN** a user viewing a local app on the Local tab presses zoom-out
- **THEN** the embedded app renders smaller inside the tab's frame, showing more of the app at once

#### Scenario: Reset to 100%

- **WHEN** the zoom level is not 100% and the user presses the reset affordance
- **THEN** the embedded app returns to its natural size and the zoom-level indicator no longer shows

### Requirement: Zoom scales only the embedded app

Zooming SHALL visually scale only the embedded local app's content within its frame.
The harness UI around the frame — dock chrome, chat and composer, tab navigation,
headers, and every other harness surface — SHALL remain at its normal size. When
zoomed in past what the frame can show, the overflowing app content SHALL be
scrollable within the frame; the frame's own footprint in the harness layout SHALL
not change with the zoom level.

#### Scenario: Harness chrome is unaffected

- **WHEN** the user changes the embedded app's zoom on either surface
- **THEN** only the app content inside the frame changes size; the surrounding harness UI does not scale, move, or reflow

#### Scenario: Zoomed-in content is reachable

- **WHEN** the zoom level makes the app content larger than the frame
- **THEN** the content can be scrolled within the frame so every part of the app remains reachable

### Requirement: Zoom range is bounded in fixed steps

The zoom level SHALL move in fixed steps of 25 percentage points and SHALL be clamped
to the range 50%–200%. Zoom-in at the maximum and zoom-out at the minimum SHALL be
no-ops (the respective control disabled or inert).

#### Scenario: Clamped at the maximum

- **WHEN** the zoom level is 200% and the user presses zoom-in
- **THEN** the level stays 200%

#### Scenario: Clamped at the minimum

- **WHEN** the zoom level is 50% and the user presses zoom-out
- **THEN** the level stays 50%

### Requirement: Zoom is per-surface and ephemeral

The system SHALL track the zoom level independently per embedding surface — each
agent dock's local-app frame and the Local tab zoom on their own, so changing one
never affects another. The zoom level SHALL be ephemeral client-side UI state: not
persisted, and reset to 100% when the web UI is reloaded, consistent with the dock's
maximize-chat state. The dashboard's existing whole-dock content-zoom slider SHALL
keep its current behavior and remain independent of this per-frame zoom.

#### Scenario: Docks zoom independently

- **WHEN** the operator zooms the local app in one agent dock while another dock also shows a local app
- **THEN** only the first dock's embedded app changes size

#### Scenario: Reset on reload

- **WHEN** a surface's embedded app is zoomed and the web UI is reloaded
- **THEN** that surface's local app renders at 100% again

#### Scenario: Independent of the dashboard content-zoom slider

- **WHEN** the dashboard's whole-dock content zoom is set to a non-default value and the operator also zooms a dock's embedded local app
- **THEN** both apply (the frame zoom composes on top of the dock zoom) and changing one does not change the other's setting

### Requirement: Zoom follows each surface's existing mode gate

The Local tab's zoom control SHALL be available as a viewing control in both Basic and
Advanced modes, alongside the tab's other view-only controls. The dock's zoom control
SHALL appear only where the agent dock itself appears — behind the dashboard's
existing Advanced-mode gate. Surfaces that embed a product without the zoom control
today and are out of scope (the App tab preview and the Landing page) SHALL keep
their current, zoom-less behavior.

#### Scenario: Basic user can zoom on the Local tab

- **WHEN** a Basic-mode user views a local app on the Local tab
- **THEN** the zoom control is available and works

#### Scenario: Basic mode shows no dock zoom

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** no agent dock is shown, and therefore no dock zoom control

#### Scenario: App tab preview unchanged

- **WHEN** a user views the App tab preview or the Landing page
- **THEN** no zoom control is shown there and the embed behaves exactly as before
