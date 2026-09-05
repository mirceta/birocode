## MODIFIED Requirements

### Requirement: The Arch tab has a Chat lane and a Tools lane
The Arch tab's main column SHALL offer three lanes in the style of a repo dock's lane
row: **Chat** (the arch conversation and composer, the default), **Tools**, and
**History**. The Tools lane SHALL list the harness-served tools exactly as the arch
session receives them from the MCP server's `tools/list` (name, description, parameters
with type and required-ness, and the call name the session uses), per-tool usage read
from the action audit (call count, last call time and outcome, target repo when any),
the built-in CLI tools the session is denied, and a preflight that checks the live
surface (MCP server answers `tools/list` with the full catalogue, the bearer token
validates, the home repo exists or is reported as created-on-arm, at least one managed
repo, autopilot gate and kill switch). The Tools lane SHALL have nothing to save: the
surface is fixed by the harness. The History lane is specified by the tool-call history
requirement below. The managed-agents strip and loop controls SHALL stay visible in
every lane.

#### Scenario: Tools lane mirrors the MCP catalogue
- **WHEN** the Operator opens the Tools lane
- **THEN** it shows one section per tool the MCP server lists, in the same order and with the same descriptions and parameters, plus the denied built-in tools as a separate section

#### Scenario: Usage comes from the audit
- **WHEN** the arch agent has called `list_agents` twice and `send_task` once on repo `a`
- **THEN** the Tools lane shows two calls on `list_agents`, one on `send_task` with its last outcome and `a` as the target, and "never called" on the rest

#### Scenario: Preflight before the first arm
- **WHEN** the Operator runs the Tools preflight with a scoped repo, an open gate and no home repo yet
- **THEN** the MCP, token, scope and gate checks pass, the home check is reported as skipped with "created on first arm", and the surface reads as ready

#### Scenario: Switching lanes keeps the conversation
- **WHEN** the Operator switches to Tools or History and back to Chat
- **THEN** the conversation, the composer draft and the managed-agents strip are as they were

#### Scenario: Desktop reaches the same surface from the dashboard
- **WHEN** the Operator opens the dashboard in Advanced mode and switches to the Management view
- **THEN** the full Arch surface renders there as the view's primary column (spec `management-dashboard`) — the same component and behaviour as the studio Arch tab — and "open dock" closes the dashboard onto that repo's dock; the Execution view's panel rail offers no Arch chip, and in Basic mode neither view exists
