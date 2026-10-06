## ADDED Requirements

### Requirement: A repo agent can see the fleet the arch sees before it asks
The `claude-web` server SHALL offer read-only `my_peers(repo?, sameRepoOnly?)`, answered within
the agent's turn and never waking the arch. Per machine it SHALL give the label, whether the
harness answers, whether it accepts fleet sends and whether this hub may send to it, whether
its autopilot gate is open, its build (marking an older one), and every repo registered there
(name, handle, docked). Per agent it SHALL give machine, repo name and handle, branch, dirty
flag, availability (available, busy, claimed, claimed (operator-occupied), unmanaged,
unreachable), last actor and running since, SHALL mark the agents of the caller's own repo
(same remote URL, else the same handle base, else the name) and which of them the arch can
reach, and SHALL show a dark peer as a row with its status rather than dropping it. The source
SHALL be the arch's own agent view and the peers' cached describes, never a second directory.
The detail SHALL name the same-repo agents or say plainly that none exists and which machines
lack the repo. The `request_arch` description and the preamble SHALL say: a peer is an agent
bound to one repo on one machine; a branch or PR can only be handed to an agent of the same
repo; a question about a machine can go to any agent on it; read `my_peers` before writing a
request and name the recipient.

#### Scenario: A branch handoff names the right agent
- **WHEN** prg on RAZVOJ2016 must hand branch feature/local-mode-revival to another machine and `my_peers` shows prg#1 on MACHINE-B as a handoff target
- **THEN** its request names MACHINE-B/prg#1 and probes nobody else

#### Scenario: No other agent of the repo exists
- **WHEN** `my_peers` shows no other prg agent anywhere
- **THEN** the detail says so, names the reachable machines without prg, and the agent's request asks the Operator to register prg on a named machine instead of asking the arch to search
