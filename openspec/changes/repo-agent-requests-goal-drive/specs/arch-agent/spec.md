## ADDED Requirements

### Requirement: An approved request can be driven by a goal conversation
Approving a repo-agent request with `drive` SHALL open a goal conversation on the requesting
agent whose goal is the request (the agent, the title, the text, and what done looks like:
the agent has what it asked for or a clear answer why not), armed by the Operator and bounded
by the given cap (default 20), and SHALL mark the request approved and delivered with mode
`goal`, the goal id and its conversation. The goal SHALL be started before the request is
decided: when it cannot be (the agent is not in the arch scope, is driven by another goal, or
the autopilot gate is closed) the request SHALL stay as it was and the answer SHALL say why
and what to do. A request already posted as a message or already driven by a goal SHALL be
refused. The Operator-facing conversation SHALL never have a loop armed on it by this.

#### Scenario: Approve as a goal
- **WHEN** the Operator approves pending request r from spacex/prg#1 with drive
- **THEN** a goal conversation named after the request runs with prg#1 as its agent, r shows approved, mode goal, that goal's id and conversation, and the Operator-facing conversation is untouched

#### Scenario: The agent is not managed
- **WHEN** the Operator approves with drive a request from an agent outside the arch scope
- **THEN** no goal starts, the request stays pending, and the answer says to put the agent in scope or approve as a message

### Requirement: The arch recognizes coordination and arms a goal for it off an approved request
The arch's role prompt SHALL explain that an approved repo-agent request arrives either as a
message tagged `request` or as a goal conversation opened for it; SHALL define coordination
as fulfilment that waits on agents across turns (upload → transfer → download, one agent after
another, a reply before the next step); and SHALL instruct the arch, when such a job arrives
as a `request` message, not to do step one and go idle but to open a goal conversation for it
itself with every agent involved, the approval being the authorization, and to answer a
one-step request in place. The `start_arch_goal` tool SHALL name an approved request needing
coordination as the second authorization besides the Operator's ask. The relayed `request`
message SHALL carry the same instruction.

#### Scenario: A coordination request arrives as a message
- **WHEN** the arch receives a `request` message asking for a file from another machine's agent
- **THEN** it starts a goal conversation with the agents involved, reports the goal id in the Operator-facing conversation, and the goal conversation carries the upload, the transfer and the download to completion
