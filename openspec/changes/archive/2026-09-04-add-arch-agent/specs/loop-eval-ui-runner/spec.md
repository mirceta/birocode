## ADDED Requirements

### Requirement: The arch scenario is listed and startable in the E2E eval section
The E2E eval section of the Autopilot console's Tests tab SHALL list the arch
scenario alongside the other atomic scenarios, with its manifest, cost copy
(expected repo turns, arch turns and minutes), and a Start control, and SHALL spawn
`tests/loop-eval/arch.mjs` in live mode against the running harness with the same
preflights, token minting, status streaming and verdict handling as the existing
scenarios. While the arch scenario runs, the section SHALL offer the watch control
for each `loopeval-arch-*-live` dock tab that exists and a control that opens the
Arch tab, so the Operator can follow both the arch agent and the driven repo agents.
The kept-agent behaviour SHALL apply to all three fixtures.

#### Scenario: Operator starts the arch scenario and watches both levels
- **WHEN** the Operator clicks Start on the arch scenario and confirms the cost note
- **THEN** the harness spawns the script live, the Tests tab shows preflight then running, the Arch tab shows the arch conversation and wake prompts as they happen, and each fixture's dock shows arch-tagged turns until the verdict

#### Scenario: Fixtures stay watchable after the verdict
- **WHEN** the arch scenario reaches its verdict
- **THEN** the three fixture cards, their dock tabs, and the arch conversation remain until the Operator finishes them
