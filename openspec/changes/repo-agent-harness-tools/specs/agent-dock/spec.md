## ADDED Requirements

### Requirement: The Tools lane lists the harness's own tools
The agent dock's Tools lane SHALL list, above the configurable tool servers, the harness's
own `claude-web` MCP server as it reaches this repo's turns: the server (name, transport,
URL, whether the bearer token is minted) and every tool it serves, read from the server's
own `tools/list` so the list cannot differ from what the agent sees — one block per tool
with its name, description and parameters, marked always on with nothing to save.

#### Scenario: Every repo agent shows the same five tools
- **WHEN** the Operator opens the Tools lane of any repo agent
- **THEN** the harness block lists `my_effort`, `report_leg`, `harness_help`, `stash_prompt` and `arm_my_loop` with their parameters, and the Birokrat API section follows below
