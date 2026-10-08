## ADDED Requirements

### Requirement: A harness tab can be commanded from another device
The harness SHALL accept remote commands at `POST /api/remote/commands` as `{ type, args }` — the same shape the living-room daljinski remote uses — keep them in a short per-harness ring buffer with a sequence number readable at `GET /api/remote/commands?after=<seq>`, and publish each as `remote.command` on the harness event feed; the route SHALL sit behind the same IP and password gates as every other `/api` route. Supported types in M1 SHALL be `open-agent {repoId|handle}`, `open-view {view}`, `scroll {dir: up|down|latest}` and `zoom {dir: in|out|reset}`.

#### Scenario: The phone asks for an agent
- **WHEN** a device on the LAN posts `{type:"open-agent", args:{repoId:"<pers-dec>"}}`
- **THEN** the command is stored with a new `seq`, `GET /api/remote/commands?after=<previous seq>` returns it, and a `remote.command` event appears on the feed

### Requirement: A normal harness tab opts in as the big screen and executes the commands with its existing UI
The client SHALL offer a header pill "big screen" (Advanced capability `bigScreen`, remembered per browser, also enabled by `?screen=1`); while on, the tab SHALL poll the remote commands after its last seen `seq` and execute each one with the code the UI already uses — `open-agent` through `openAgentHarness` (what a Kanban card's agent chip does), `open-view` through the header-tab navigation, `scroll` on the active dock's message list, `zoom` on the document — and SHALL report what it shows (`url`, active agent, view) to `POST /api/remote/screens` every few seconds so `GET /api/remote/screens` lists the listening tabs. A tab with the pill off SHALL ignore the commands entirely.

#### Scenario: The projector opens the agent like the Kanban chip
- **WHEN** the listening tab on the projector shows the Kanban and sees `open-agent pers-dec`
- **THEN** it shows pers-dec's dock in the Agent tab exactly as a click on pers-dec's chip would, within two seconds, and its next heartbeat reports `activeAgent: pers-dec`

#### Scenario: Nothing is listening
- **WHEN** no tab has the pill on and the phone posts a command
- **THEN** the command is stored, `GET /api/remote/screens` is empty, and the phone shows "no screen is listening — open the harness on the projector and switch on big screen"

### Requirement: The Remote view drives the big screen from a phone
The client SHALL offer a `/remote` route (Advanced capability `remoteView`) laid out for a phone: the dock list from `GET /api/dock` with busy, waiting and unseen-result badges where a tap posts `open-agent`; a view row (Kanban, Status, Arch, Fleet) posting `open-view`; a composer that sends `POST /api/chat` to the opened agent's repo and lane (or to the arch's Operator conversation when the Arch view is open); Stop; Page up, Page down and Latest posting `scroll`; zoom in/out posting `zoom`; and a header line "projector is showing: …" from `GET /api/remote/screens`. A send while a run is live on that lane SHALL be shown as "busy" rather than fail silently.

#### Scenario: Pick, type, send
- **WHEN** the Operator taps pers-dec on the phone and sends "summarise what you did today"
- **THEN** `open-agent` is posted, the prompt is posted to pers-dec's builder lane with the correct `X-Repo-Id`, the projector's dock streams the reply as it does for any run, and the phone shows "running" until the run ends

#### Scenario: The agent is already running
- **WHEN** the Operator sends while the opened lane has a live run
- **THEN** the phone shows the 409 as "busy — wait or Stop", and nothing is lost from the composer
