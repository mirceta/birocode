## ADDED Requirements

### Requirement: Every repo agent is told what the arch is before it can ask it anything
The `claude-web` server's preamble SHALL open with the picture of the arch: a management agent
with no hands (no files, no shell, no machines, no credentials) that cannot provision, run,
move files itself or answer within the turn; its powers (list the fleet's repo agents with
machine, repo, branch and availability; read transcripts; send a task to one agent; keep its
memory); its two roles (dispatcher of the Operator's tasks, so work may arrive unasked;
switchboard between agents on different machines, which checks with peers that have full
control of their own machines); that a request is only recorded until the Operator approves
it and the answer arrives later as a prompt tagged `arch@<machine>` in the agent's own dock,
never as a tool result; and that an `arch@` prompt may be a probe about this machine to be
answered short, factual, checked now, with the risk named, not executed. The `request_arch`
description SHALL say the same and SHALL tell the agent to ask the arch to find and brief a
peer rather than to ask it for a machine or a resource.

#### Scenario: A fresh agent needs another machine
- **WHEN** an agent with only the tool text and the preamble needs a SQL Server its machine lacks
- **THEN** its request names a probe for peers and a handoff for a fitting peer, not a request for a machine

### Requirement: A request carries optional structured fields
`request_arch` SHALL accept, beside the required free text, optional `probe` (the question for
peers, phrased for an agent with a disk and a shell), `ifFits` (the task for a fitting peer),
`ifNone` (what to send back when none fits) and `meanwhile`. They SHALL be persisted with the
request, travel with a pulled copy, render on the Repo Agent Requests tab, and reach the arch
in the relayed message and the goal text as labelled lines. Free text alone SHALL stay valid
and duplicate detection SHALL stay on the text.

#### Scenario: The arch reads the probe as something to relay
- **WHEN** an approved request has a probe
- **THEN** the arch's message says to send_task it to candidate peers and read their answers with read_transcript, then the handoff

### Requirement: An agent can see what became of its requests
The server SHALL offer read-only `my_requests` — the agent's own requests with status
pending, approved, dismissed or answered (approved and the arch has sent the agent a prompt
since), each with its meaning — so silence and rejection read apart. (The fleet view itself,
`my_peers`, is openspec repo-agent-my-peers.)

#### Scenario: Silence and rejection read apart
- **WHEN** an agent's request was dismissed and another is still pending
- **THEN** `my_requests` shows `dismissed` with "do not resend the same text" and `pending` with "silence, not rejection"

### Requirement: harness_help answers "what is the arch agent"
`docs/agents.md` SHALL carry a section written for repo agents ("The arch agent, seen from a
repo agent") with the picture, what a good request looks like, what happens after the call,
and the reverse role; `harness_help` SHALL answer "what is the arch agent" with that section.

#### Scenario: The arch question
- **WHEN** an agent calls `harness_help` with the query "what is the arch agent"
- **THEN** the answer is that section of `docs/agents.md`
