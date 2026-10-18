## ADDED Requirements

### Requirement: Agent pages on the big screen are kept like browser tabs
The Agent tab SHALL keep the agent docks it has shown mounted (hidden), up to a cap of the most recently shown ones. Returning to such an agent, from the strip or by the remote's open-agent, SHALL show the same dock with no page load and no remount. A hidden kept dock SHALL ignore the remote's commands that name no agent, and SHALL NOT report its layout to the big screen.

#### Scenario: Back to a previously opened agent
- **WHEN** the projector shows agent A, the remote opens agent B, then opens agent A again
- **THEN** A appears at once as it was (same chat, scroll and app frames) and the page did not reload

#### Scenario: A command for the shown agent
- **WHEN** the remote sends `lane ask` without naming an agent while A is shown and B is kept
- **THEN** only A switches to the Ask lane

### Requirement: Switching among one peer's agents happens in place
When the big screen shows a peer harness and the remote opens another agent of that same peer, the harness SHALL forward a plain open-agent to the peer instead of a navigate. No one-shot PIN SHALL be minted and the page SHALL not reload.

#### Scenario: Second agent on the same peer
- **WHEN** the screen shows the peer `living room` and the phone taps another `living room` agent
- **THEN** the command forwarded to that peer is `open-agent {repoId}` and the projector switches tabs in place
