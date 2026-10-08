## ADDED Requirements

### Requirement: One designated big screen follows a server-side Stage record
The harness SHALL keep one Stage record per harness — `{ dockId, lane, follow, fontScale, view, updatedAt, setBy }` — readable at `GET /api/stage` and changed by partial `PUT /api/stage`, behind the same IP and password gates as every other `/api` route; a change SHALL be published to the harness event feed as `stage.changed`. The Stage SHALL be independent of any browser's own active dock tab, so a desk browser keeps its tab while the big screen follows the Stage.

#### Scenario: The phone stages an agent
- **WHEN** a device on the LAN sends `PUT /api/stage {dockId: "<pers-dec dock>"}`
- **THEN** `GET /api/stage` returns that dock with `setBy` and a newer `updatedAt`, and a `stage.changed` event appears on the feed

#### Scenario: A desk browser is not moved
- **WHEN** the Stage changes while the Operator's desk browser shows another agent
- **THEN** the desk browser's active tab is unchanged (the Stage is read only by the `/stage` view)

### Requirement: The Stage view shows the staged agent's conversation at living-room distance
The client SHALL offer a `/stage` route (Advanced capability `stageView`) that renders the staged agent's conversation full-viewport with large type scaled by `fontScale`, a thin strip with the agent's name, colour, lane and run state, no dock chrome, and auto-follow of the streaming reply while `follow` is true; while no run is live it SHALL show the URL and a QR of the `/remote` route. The view SHALL switch agent, lane and follow mode within two seconds of a Stage change.

#### Scenario: A prompt streams on the projector
- **WHEN** the staged agent's builder lane starts a run
- **THEN** the `/stage` view shows the new user bubble and the streaming reply, scrolled to the latest chunk while `follow` is true

#### Scenario: Idle screen tells the phone where to go
- **WHEN** no run is live on the staged agent
- **THEN** the view shows `http://<lan-ip>:5099/remote` and its QR in a corner

### Requirement: The Remote view drives the Stage from a phone
The client SHALL offer a `/remote` route (Advanced capability `remoteView`) laid out for a phone: the dock list from `GET /api/dock` with busy, waiting and unseen-result badges where a tap stages that dock; a composer that sends `POST /api/chat` to the staged dock's repo and lane; Stop; Follow, Page up, Page down and Latest; and font size up/down — each writing the Stage. A send while a run is live on that lane SHALL be shown as "busy" rather than fail silently.

#### Scenario: Pick, type, send
- **WHEN** the Operator taps an agent on the phone and sends "summarise what you did today"
- **THEN** the Stage switches to that agent and the prompt is posted to its builder lane with the correct `X-Repo-Id`, and the phone shows "running" until the run ends

#### Scenario: The agent is already running
- **WHEN** the Operator sends while the staged lane has a live run
- **THEN** the phone shows the 409 as "busy — wait or Stop", and nothing is lost from the composer
