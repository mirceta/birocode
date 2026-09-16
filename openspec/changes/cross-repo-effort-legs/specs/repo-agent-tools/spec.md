## ADDED Requirements

### Requirement: Every repo agent's turn carries the harness's own tool server
The harness SHALL run an MCP tool server for repo agents at `POST /api/agents/mcp?repo=<id>`
— exempt from the password middleware, guarded by a per-process bearer token, the repo
named by the URL the harness itself writes — and SHALL inject its `claude-web` entry into
the MCP config of every repo agent turn (chat, loops, arch sends, either engine) alongside
any Tools-lane server. Identity SHALL come from the harness, never from the model.

#### Scenario: A turn starts
- **WHEN** a repo agent's turn is launched from the chat, a loop or an arch send
- **THEN** its MCP config names the `claude-web` server with the bearer header and `?repo=` its own repo id, and a call with a missing or wrong token answers 401

### Requirement: A repo agent can inspect the effort it is in and report the legs it drives
The server SHALL offer `my_effort` — for every card the agent is a leg of: its role, the
legs it drives or the driver it answers to, the shared goal (title + note), every leg's
branch / PR / verified merge state, how many legs are merged and whether the card is
partially merged — so the agent answers truthfully when the policeman or the Operator asks
what it is doing; and `report_leg` — record a leg's branch / commit / PR URL: its own leg
always, another leg only when the agent is the card's DRIVER and the target is not a
driver. Reporting SHALL record a claim only; the column moves by the verifier's facts.

#### Scenario: The driver reports the prg checkout's PR
- **WHEN** web-flow-autodev, the driver, calls `report_leg` with leg `copy1/prg`, branch `knjiga-poste` and PR #166
- **THEN** the driven leg records that branch and PR, the answer reads "0/2 legs merged", and the next verifier pass checks PR #166 on GitHub

#### Scenario: A driven agent may not report the driver's leg
- **WHEN** skratek, a driven leg, calls `report_leg` on the driver's leg
- **THEN** the answer is status `not-yours` and nothing changes
