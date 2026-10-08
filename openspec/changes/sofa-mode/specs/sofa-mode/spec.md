## ADDED Requirements

### Requirement: A harness tab can be commanded from another device
The harness SHALL accept remote commands at `POST /api/remote/commands` as `{ type, args }` — the same shape the living-room daljinski remote uses — keep them in a short per-harness ring buffer with a sequence number readable at `GET /api/remote/commands?after=<seq>`, and publish each as `remote.command` on the harness event feed; the routes SHALL sit behind the same IP and password gates as every other `/api` route. Supported types SHALL be `open-agent {repoId|handle}`, `open-view {view}`, `scroll {dir: up|down|latest}`, `zoom {dir: in|out|reset}`, `lane {lane: builder|ask}` and `stop`.

#### Scenario: The phone asks for an agent
- **WHEN** a paired device posts `{type:"open-agent", args:{repoId:"<pers-dec>"}}`
- **THEN** the command is stored with a new `seq`, `GET /api/remote/commands?after=<previous seq>` returns it, and a `remote.command` event appears on the feed

### Requirement: A harness tab opts in as the big screen and executes the commands with its existing UI
The client SHALL expose one dispatch table for remote commands, reachable two ways: a header pill "big screen" (Advanced capability `bigScreen`, remembered per browser, also forced by `?screen=1`) that polls the remote commands after its last seen `seq`, and a `window.claudewebRemote(cmd)` hook an embedding host (the living-room WebView2 presenter) calls directly. Both SHALL execute each command with the code the UI already uses — `open-agent` through `openAgentHarness` (what a Kanban card's agent chip does), `open-view` through the tab registry's navigation, `scroll` on the active dock's message list, `zoom` on the document, `lane` and `stop` on the active dock — and the listening tab SHALL report what it shows (`name`, `url`, active agent, view) to `POST /api/remote/screens` every few seconds so `GET /api/remote/screens` lists the live screens (dropped after 20 s of silence). A tab with the pill off SHALL ignore polled commands entirely; the hook SHALL work regardless.

#### Scenario: The projector opens the agent like the Kanban chip
- **WHEN** the listening tab on the projector shows the Kanban and receives `open-agent pers-dec`
- **THEN** it shows pers-dec's dock in the Agent tab exactly as a click on pers-dec's chip would, within two seconds, and its next heartbeat reports the active agent

#### Scenario: Opened from the remote — the product beside the chat
- **WHEN** the big screen executes `open-agent` for a repo that has local apps
- **THEN** the dock it lands on opens the repo's first local app in split view with the chat at 30 % of the width and the app at 70 %; a repo without local apps shows the chat as before; a dock opened any other way keeps its remembered view

#### Scenario: Nothing is listening
- **WHEN** no screen has heartbeated for 20 s and the phone posts a command
- **THEN** the command is stored, `GET /api/remote/screens` is empty, and the phone shows "no screen is listening — show the harness on the projector"

### Requirement: A phone pairs with a short-lived PIN shown on the big screen
The harness SHALL mint a 6-digit pairing PIN at `POST /api/remote/pair/new` (session required; valid 5 minutes; single use; a new PIN replaces the old) and SHALL redeem it at `POST /api/remote/pair {pin}` — exempt from the password gate like `/api/auth/login`, still behind the IP gate — comparing constant-time, counting failures toward the same per-IP lockout as failed logins, and on success issuing the SAME session cookie `/api/auth/login` issues, so the paired phone needs no password and nothing on the LAN reaches the remote without pairing. The pairing SHALL be auditable (`pair-new`, `pair-ok`, `pair-fail` with the client IP).

#### Scenario: Pair from the sofa
- **WHEN** the Operator chooses "Pair a phone" on the big screen and enters the shown PIN on `/remote` within 5 minutes
- **THEN** the phone receives the session cookie and the remote loads; entering the same PIN again is refused

#### Scenario: Guessing
- **WHEN** a device posts five wrong PINs
- **THEN** the sixth attempt is answered 429 for the lockout period, exactly as five wrong passwords would be

### Requirement: The Remote view drives the big screen from a phone and works without one
The client SHALL offer a `/remote` route (Advanced capability `remoteView`) — a plain web page fitted for a phone, not a PWA — with: a pairing screen when unauthenticated; a header "projector is showing: …" or "no screen is listening" from `GET /api/remote/screens`; a view row (Kanban, Status, Arch, Fleet) posting `open-view`; the dock list from `GET /api/dock` with busy, waiting and unseen-result badges where a tap posts `open-agent` and selects the composer's target; a composer that sends `POST /api/chat` to the opened agent's repo and lane (or to the arch's Operator conversation when the Arch view is open); Stop; Page up, Page down and Latest posting `scroll`; zoom in/out posting `zoom`; a lane toggle; **peek** — the opened agent's last reply, collapsed; and the opened conversation's open `AskUserQuestion` options as buttons whose tap sends the option text as the next message. Every part except the big-screen commands SHALL work with no screen listening. A send while a run is live on that lane SHALL be shown as "busy" rather than fail silently.

#### Scenario: Pick, type, send
- **WHEN** the Operator taps pers-dec on the phone and sends "summarise what you did today"
- **THEN** `open-agent` is posted, the prompt is posted to pers-dec's builder lane with the correct `X-Repo-Id`, the projector's dock streams the reply as it does for any run, the phone shows "running" until the run ends and then the reply in peek

#### Scenario: Answer from the phone
- **WHEN** the opened agent's latest assistant message is an `AskUserQuestion` with three options
- **THEN** the phone shows the three options as buttons and a tap sends the chosen label as the next message, exactly as the card on the projector would

#### Scenario: The agent is already running
- **WHEN** the Operator sends while the opened lane has a live run
- **THEN** the phone shows the 409 as "busy — wait or Stop", and nothing is lost from the composer
