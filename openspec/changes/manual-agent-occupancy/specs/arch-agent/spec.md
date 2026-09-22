## ADDED Requirements

### Requirement: The Operator's occupancy setting overrides the branch rule

The Harness SHALL let the Operator declare any repo agent — on this machine or a fleet
peer, addressed by machine and repo id — **occupied**, **free**, or **automatic**, and SHALL
persist the declaration across restarts. When a declaration exists it SHALL override the
branch-based availability rule: an agent declared occupied SHALL be `claimed` with the reason
`operator-occupied` (no sends, no transcript reads, unless the Operator asks); an agent
declared free SHALL be `available`, keeping the `unassigned-branch` reason when it sits on a
branch nobody assigned so a send still has to name the branch. A running turn (`busy`), an
unmanaged repo and an unreachable peer SHALL NOT be overridden. With no declaration the branch
rule SHALL apply unchanged. The same verdict SHALL be what `list_agents`, `send_task`, the
fleet describe and the Status tab report.

#### Scenario: A linked agent is marked occupied

- **WHEN** `prg` sits on `main` and the Operator marks it occupied because `web-flow-autodev` is on a feature branch
- **THEN** `list_agents` reports `prg` as `claimed (operator-occupied)`, `send_task` to `prg` is refused as claimed, and the Status tab lists `prg` under Occupied with ✋

#### Scenario: Marked free on a feature branch

- **WHEN** the Operator marks an agent on `feature/x` free
- **THEN** it is `available` with the reason `unassigned-branch`, so the arch may send to it but must name `feature/x` in the send

#### Scenario: A running turn is not an opinion

- **WHEN** an agent the Operator marked free is in the middle of a turn
- **THEN** it is `busy` until the turn ends, and free afterwards
