## ADDED Requirements

### Requirement: The loop endpoint accepts the arch agent's reserved id
The loop endpoint SHALL accept `@arch` as the agent for the goal and recipe kinds,
pinning the arch agent's conversation as the driven session, and SHALL refuse the
suggestion and queue kinds for it with a clear error. Stopping or disarming a driven
`@arch` instance SHALL hand control back to the arch agent's standing-loop memory. The
ungated loop projection SHALL list a driven `@arch` instance like any other agent's,
while the arch wake kind stays on the Arch surface only.

#### Scenario: Goal armed on the arch agent
- **WHEN** a client posts a goal start for `@arch`
- **THEN** the instance is stored under `@arch` pinned to the arch session, and `GET /api/autopilot/loops` lists it with kind `goal`

#### Scenario: Suggestion refused
- **WHEN** a client posts a suggestion start for `@arch`
- **THEN** the request is refused and no instance changes
