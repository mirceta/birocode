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
- **WHEN** the Operator opens the dashboard in Advanced mode and presses the Arch chip on the panel rail
- **THEN** the Arch surface opens as a centered pop-up over the docks (same mechanism and persistence as the Ideas/Autopilot/Audit/Traffic pop-ups), the chip is pressed while it is open, Esc or × dismisses it, and "open dock" closes the dashboard onto that repo's dock; in Basic mode the chip is absent

## ADDED Requirements

### Requirement: The Arch tab's History lane shows every tool call of the conversation, readably
The Arch tab's History lane SHALL list every tool call the arch agent made in the
conversation the tab shows, reconstructed from the session transcript on disk so it is
complete after a reload, grouped under the user message that caused each call with that
message's actor (Operator or harness wake-up), time and call count. Each call SHALL be
shown as a card with: a plain-language sentence of what the call did (phrased per
harness tool from its arguments — the repo, machine, branch, tail or memory path it
named — and as name plus input summary for a built-in tool), the tool name and whether
it is a harness tool or a built-in, a status (ok, error, running, or no result), the
call time and elapsed time to its result. Opening a card SHALL show the complete
arguments as a key/value table, the result parsed from the harness tool envelope
(status, detail, data) or as text otherwise, a note when the result was clipped for
display with its real length, and the raw call on request. The lane SHALL offer
filtering by tool (with counts), errors only, free-text search over arguments and
results, newest-first or oldest-first order, and expand / collapse all. While an arch
turn runs, its tool calls from the live stream SHALL appear in the lane at once (a
running call marked as such) and settle into the durable list when the transcript
carries them. The endpoint behind the lane SHALL tolerate a malformed transcript line
by skipping it and SHALL list a call with no recorded result as such.

#### Scenario: A finished conversation is readable after a reload
- **WHEN** the arch agent has, in one turn, listed agents, read a transcript and sent a task, and the Operator reloads the tab and opens the History lane
- **THEN** the three calls are listed under that turn's message with the Operator as actor, each with its sentence ("Sent a task to `<repo>` on branch `<b>`" for the send), status ok and elapsed time, and opening the send shows the full task text among the arguments and the send status and detail from the result

#### Scenario: A failed call stands out
- **WHEN** a call's result is an error
- **THEN** its card is marked error, "errors only" narrows the lane to it, and its parsed result shows the failing status and detail

#### Scenario: A running call is visible before the transcript has it
- **WHEN** an arch turn is running and the stream has reported a tool call that has no result yet
- **THEN** the History lane shows that call as running under a "now" group, and once the turn ends and the transcript carries the call with its result, it is shown once with its result

#### Scenario: Turn actor matches the Chat lane
- **WHEN** a turn was started by a harness wake-up prompt
- **THEN** the History lane groups its calls under "harness wake-up", the same actor the Chat lane's bubble shows
