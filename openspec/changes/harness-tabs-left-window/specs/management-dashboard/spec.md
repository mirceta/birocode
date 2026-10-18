## ADDED Requirements

### Requirement: Harness tabs open in the other Chrome window through a harness host tab
By default every "open harness" click on the Management dashboard SHALL put the agent's tab into a Chrome window other than the dashboard's, by asking a same-origin harness host tab (the bundle at `?launcher=1`) over a BroadcastChannel to open the agent's named tab next to itself — never by a window name or a kept window handle, so a dashboard refresh, a reload through an error page, a dashboard in a new tab and a harness restart do not change where tabs land. A host whose window is the dashboard's (same screen rectangle) SHALL only queue agents and say to drag it into the other window, and SHALL open the queue once moved. With no host, the click SHALL open one beside the dashboard carrying the agent and announce a one-time setup; an older host answering from another window SHALL take the queue over and the new one SHALL close itself. On this path no agent tab SHALL ever be opened in the dashboard's window.

#### Scenario: Three agents, then a refresh
- **WHEN** a host sits in the left window and the Operator clicks three agents (local and remote), refreshes the dashboard and clicks again
- **THEN** every agent tab is in the left window, one per agent, and the re-click opens no new tab and reloads nothing

#### Scenario: No host yet
- **WHEN** no host answers and the Operator clicks an agent
- **THEN** a host tab opens beside the dashboard with the agent waiting in it and the toast explains the one-time drag; the agent opens in the left window as soon as the host is there

#### Scenario: The left window was closed
- **WHEN** the Operator closed the left window and clicks an agent
- **THEN** nothing opens in the dashboard's window except a new host asking to be placed

### Requirement: A re-click raises the agent tab where Chrome allows it and says so when it cannot
When the agent's tab already exists the host SHALL switch it to the agent without a reload, and the dashboard SHALL try to bring it to the front from its own click by opening the agent's name with an empty URL; a lookup that yields a blank tab SHALL be closed at once and SHALL not be retried for that host from that dashboard tab. The notice SHALL say "switched" when raised and that it could not be brought to the front otherwise. When Chrome blocks the host's pop-up, the agent SHALL wait in the host as a button and the notice SHALL say to allow pop-ups for the site once.

#### Scenario: Re-click with the host the dashboard created
- **WHEN** the Operator re-clicks an agent whose tab the host opened, after placing that host by dragging it
- **THEN** the agent's tab becomes the active tab of the left window without a reload

#### Scenario: Pop-ups blocked
- **WHEN** Chrome blocks the host from opening an agent
- **THEN** the agent waits as a button in the host and nothing opens in the dashboard's window

### Requirement: The placement setting shows where the host stands
The Settings tab SHALL offer "in my other Chrome window" (default) and "beside the dashboard", show the host's live state (none / in another window / in this window) with a button that opens it, list the one-time setup (place the host, allow pop-ups, keep the site awake), and state what a web page can and cannot control about Chrome windows.

#### Scenario: Host in the dashboard's window
- **WHEN** the only host is a tab of the dashboard's window
- **THEN** the Settings tab says so and asks to drag it into the left window
