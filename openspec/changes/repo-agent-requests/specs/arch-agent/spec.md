## ADDED Requirements

### Requirement: The hub holds every managed agent's requests and the Operator's decisions
The hub SHALL pull the locally recorded requests of every active remote peer over the fleet
channel (`GET /api/arch/peer/requests`) on the engine tick at least every 30 s and when the
Operator's view reads them (at most every 10 s), keep those from repos in its fleet scope, and
hold them with its own agents' requests in one persisted store. A decision SHALL be final:
`approved` or `dismissed`, with when and by whom. The hub SHALL push its decision on a pulled
request back to the agent's harness (`POST /api/arch/peer/requests/decision`), which SHALL apply
it only behind its accept-fleet-sends opt-in and only to a request it recorded itself.

#### Scenario: A peer's request reaches the hub
- **WHEN** web#1 on MONSTER (in spacex's fleet scope) records a request and spacex's engine ticks
- **THEN** the request appears on spacex's store as pulled from MONSTER with the same id, and MONSTER's tab shows the decision once spacex's Operator decides

#### Scenario: A dark peer is named
- **WHEN** a peer does not answer the pull
- **THEN** the Operator's view names the peer with its status instead of hiding it

### Requirement: An approved request is posted into the Operator-facing arch conversation; a dismissed one never is
On approve, the hub SHALL post the request — the agent and machine, the title, the text, and a
sentence saying the Operator approved it and the arch may answer the agent with `send_task` —
into the default arch conversation as a user message tagged actor `request`, at once when the
conversation's slot is free, else on the next engine tick when it is (one per tick), and mark
when it was delivered. Approving SHALL be refused while the autopilot gate is closed, like a
send. A dismissed request SHALL never be posted.

#### Scenario: Approve while the arch is idle
- **WHEN** the Operator approves a pending request and the arch is not mid-turn
- **THEN** an arch turn starts on the message tagged `request` and the request shows delivered

#### Scenario: Approve while the arch is mid-turn
- **WHEN** the Operator approves while the arch's slot is busy
- **THEN** the request stays approved and undelivered, the view says it waits for the slot, and the engine tick posts it once the slot is free

#### Scenario: Dismiss
- **WHEN** the Operator dismisses a pending request
- **THEN** it is closed with when and by whom, the agent's harness learns the decision, and no arch message is ever posted for it
