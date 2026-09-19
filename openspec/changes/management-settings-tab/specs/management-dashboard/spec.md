## ADDED Requirements

### Requirement: The Management view has a Settings tab holding configuration, and Status holds status
The Management view SHALL offer a **Settings** tab (`?tab=settings`, a pane like the others,
slotted after Status on devices that saved an order without it). The arch's **Managed
agents** scope card and **Fleet** posture card (allow sends per machine, accept fleet sends,
accept fleet upgrades, upgrade a peer) SHALL live on Settings with identical behaviour; the
Status tab SHALL keep Fleet Status, the arch's **Home repo** card and its **Goal
conversations** card. The Fleet lane beside an arch conversation SHALL keep showing all four.

#### Scenario: The settings moved
- **WHEN** the Operator opens Settings
- **THEN** it shows the "Where the Kanban badge links open" setting, then Managed agents and Fleet; Status shows Fleet Status, Home repo and Goal conversations and no longer Managed agents or Fleet

### Requirement: The Operator chooses where Kanban badge links open, and is told what a page cannot do
Settings SHALL carry a device-local choice for where a Kanban badge click opens the agent's
harness: **tabs** (default; one named tab per agent in the dashboard's Chrome window, focused
wherever it was dragged) or **window** (one dedicated named harness window, created with the
chosen screen's work-area position and size, navigated to the clicked agent and focused on
every click). In `window` mode Settings SHALL offer a screen picker (the Window Management
API: a Detect step that asks the browser's one-time permission and lists screens) when the
page is a secure context and the API exists, and otherwise SHALL say so and that the window
opens on the current screen to be dragged once; it SHALL offer "Open the harness window now".
Settings SHALL state that a web page cannot list Chrome's windows nor place a tab into a
window it did not open, and that per-agent tabs inside an existing window need a browser
extension.

#### Scenario: A badge click in window mode
- **WHEN** the placement is `window` with a chosen screen at (-1920, 0) 1920×1040 and the Operator clicks an agent badge
- **THEN** `window.open('', 'birocode-harness-window', 'popup=1,left=-1920,top=0,width=1920,height=1040')` is made, the handle is navigated to that agent's harness deep link and focused; a second click on another agent navigates the same window

#### Scenario: A badge click in tabs mode
- **WHEN** the placement is `tabs` (or was never set)
- **THEN** the click opens or focuses the per-agent named tab with no window features, exactly as before

#### Scenario: No screen picker on an insecure page
- **WHEN** the dashboard is reached over plain http on a LAN address
- **THEN** Settings shows "Screen picking is not available here" with the reason and the drag-once advice instead of a Detect button, and `window` mode still works
