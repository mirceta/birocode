## ADDED Requirements

### Requirement: Board verification never delays the harness coming up

The board verifier's background pass SHALL start only after the web host has finished
starting: its hosted service SHALL yield before running its first pass, so a slow pass
(GitHub traces, model questions per card) can never hold the harness off the network.
A harness restart SHALL answer health on loopback within seconds regardless of board
size, and the first verification pass SHALL still run right after start.

#### Scenario: Slow first pass, fast start

- **WHEN** the harness starts with a board whose first verification pass would take a minute
- **THEN** the harness answers `/api/auth/check` on loopback within seconds, and the pass completes afterwards and is journaled as the startup pass

#### Scenario: Deploy health check passes

- **WHEN** the guarded deploy restarts the harness on a large board
- **THEN** the health check succeeds within its window and the deploy is final, with no restore of last-good
