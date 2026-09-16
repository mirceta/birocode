## MODIFIED Requirements

### Requirement: Global browser serialization

The system SHALL allow at most one browser-enabled run at a time across all repos and
lanes, rejecting a conflicting **browser-enabled** request immediately with a message
naming the current holder. A turn that does not request browser mode SHALL never be
gated by the browser, whatever other agents are doing with it.

#### Scenario: Second browser turn rejected

- **WHEN** a browser-enabled run is active for one repo and a browser-enabled turn is submitted for any repo
- **THEN** the request is rejected with HTTP 409 and an error naming the repo whose run holds the browser

#### Scenario: Gate released after the run

- **WHEN** a browser-enabled run finishes (success, error, or stop)
- **THEN** a subsequent browser-enabled turn is accepted

#### Scenario: Other agents keep working

- **WHEN** a browser-enabled run is active for agent A and a turn without browser mode is submitted to agent B
- **THEN** B's turn is accepted and runs; the browser gate is not consulted

## ADDED Requirements

### Requirement: Browser mode is a per-agent choice

The 🌐 browser-mode toggle SHALL belong to the agent it is flipped on — the dock tab,
or the main chat's repo — and SHALL be stored per agent. Only that agent's builder-lane
sends SHALL carry the browser request; every other agent's toggle and sends SHALL be
unaffected. A device still carrying the retired device-global flag SHALL have it
dropped on first load, never copied onto every agent.

#### Scenario: Two docks, one browser

- **WHEN** the Operator turns 🌐 on in agent A's dock and prompts agent B, whose toggle is off, while A's browser run is live
- **THEN** B's prompt is sent without browser mode and runs normally

#### Scenario: The busy case is explained on the agent that asked

- **WHEN** A holds the browser and the Operator turns 🌐 on for B and sends a prompt
- **THEN** B's toggle shows the browser is held by A and B's send is refused naming A; no other agent is affected

#### Scenario: Reload keeps each agent's own toggle

- **WHEN** the page reloads
- **THEN** A's toggle is still on and B's still off

#### Scenario: Old global flag retired

- **WHEN** a client with the old device-global browser flag loads this build
- **THEN** the flag is removed and no agent starts with browser mode on
