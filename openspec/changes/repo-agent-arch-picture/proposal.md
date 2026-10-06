# Repo agents hold an accurate picture of the arch: request_arch rewritten, probe / handoff fields, my_peers, my_requests, the reverse role

## Why

Fleet task d528046d — an Operator-approved request from razvoj2016/prg (2026-10-06). On 6 Oct
the prg agent used `request_arch` to ask the arch for a virtual machine with SQL Express. The
arch cannot do that: it has no hands. The agent had only the tool text ("a decision, a resource,
another agent's help…") and the preamble; neither said what the arch is. The right request
would have been: ask the fleet whether a peer has a desktop Birokrat in LOCAL layout and can
safely change its machine, then hand that peer the branch. That knowledge sat in
`docs/agents.md`, which nothing pointed to at call time. Goal: awareness, not restriction.

## The picture

The arch is the management agent with no hands — no files, no shell, no machines, no
credentials. Its powers: list the fleet's repo agents (machine, repo, branch, availability),
read transcripts, send a task to one agent, keep its own memory. Two roles: (1) it takes tasks
from the Operator and dispatches them, so an agent may receive work from it unasked; (2) it is
the switchboard between agents on different machines — an agent asks, the arch puts the
question to peers, reads their answers, brings back who fits. Peers are agents like the asker,
with full control of their own machine, so "do you have SQL Server with these databases and is
it safe to change C:\Birokrat there" is answered by checking; the asker will receive such
probes too.

## What changes

1. **The `request_arch` tool text and the `claude-web` preamble** carry that picture: what the
   arch is, both roles, its exact powers, what it cannot do (provision, run, move files itself,
   answer within the turn), that a request is only RECORDED until the Operator approves it, and
   that the answer arrives later as a prompt tagged `arch@<machine>` in the agent's own dock —
   never as a tool result — so the agent leaves its work in a state a peer can pick up.
2. **Structured fields** beside the free text: `probe` (the question for peers, phrased for an
   agent with a disk and a shell), `ifFits` (the task for a fitting peer), `ifNone` (what to
   send back), `meanwhile`. Free text alone stays valid. The fields are persisted, travel with a
   pulled row, render on the Repo Agent Requests tab, and reach the arch in the relayed message
   and the goal text as "PROBE for peers (send_task … read_transcript) / IF A PEER FITS / IF NONE
   FITS / MEANWHILE".
3. **`my_peers`** landed first in its own change (openspec repo-agent-my-peers, PR #149) at the
   Operator's ask; this change builds on it and adds its one-line rule to the picture.
4. **`my_requests`**: the agent's own requests with status pending | approved | dismissed |
   **answered** (approved, and the arch has sent this agent a prompt since — the arch send stamp
   the harness already keeps), with a one-line meaning per status.
5. **The reverse role**: the preamble says an `arch@` prompt may be a PROBE about this machine
   and the expected answer is short, factual, checked now, with the risk named — not executed.
   `docs/agents.md` gains "The arch agent, seen from a repo agent" (and a proper `### Arch Agent`
   heading); `harness_help` answers "what is the arch agent" with that section.

## Acceptance (as checked)

- A fresh model given only the tool text + preamble + the scenario writes a request with a
  probe and a handoff, not a request for a machine; the same model given an `arch@` probe
  answers with checked facts and the risk, not by executing. Transcripts in the PR.
- `harness_help` answers the arch question with the new section (xunit over the embedded docs).
- Unchanged: record only, Operator approval, no wake, duplicate pending text deduplicated
  (xunit `RepoAgentRequestsTests`, 796 green).
