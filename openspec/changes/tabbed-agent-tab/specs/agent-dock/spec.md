## ADDED Requirements

### Requirement: The tabbed view has a full-screen Agent tab that is the dashboard phone
The tabbed view SHALL offer an "Agent" tab (`/studio/agent`, Advanced UI mode) that shows the
active dock tab exactly as the Agent Dashboard shows it — the same component in a one-agent
mode, so the chat, the lanes, the git row, the loop control, the flags and the local-app views
are those of the dashboard phone — with a strip to switch the active agent. The tab SHALL
always occupy the whole content area, whatever the saved tab order, pane spans or hidden tabs:
it SHALL never be rendered as a pane beside other tabs and the pane strip SHALL not be used
while it is the route. The bottom navigation SHALL remain, with the Agent tab placed right
after Chat unless the saved order places it elsewhere.

#### Scenario: Full screen under any layout
- **WHEN** the saved layout orders Files first with wide spans and the Operator opens the Agent tab on a wide window
- **THEN** the phone fills the content area with no pane strip, while the Files tab under the same settings shows the pane strip

### Requirement: An "open harness" link lands on the Agent tab
The tabbed view SHALL, when opened with `?agent=<repoId|handle>` (the Management board's
"open harness" from Status → Agents or a Kanban badge), activate that agent's dock and land
on the Agent tab, independently of the device's saved layout; the parameter is consumed so
back and refresh do not re-steer. An ordinary open of the tabbed view SHALL behave as before.
The open-harness mechanics (the chosen harness window, one browser tab per agent, focus
without reload on a repeat click) SHALL be unchanged.

#### Scenario: From the Status tab
- **WHEN** the Operator clicks "open harness" on an agent's details on Status → Agents
- **THEN** a browser tab for that agent opens on the Agent tab showing that agent's phone, and a second click focuses that tab without reloading it
