## ADDED Requirements

### Requirement: The arch agent operates loops on repo agents on the Operator's ask
The arch agent SHALL have four harness tools over the managed repo agents in scope, on
any machine: `list_loops(machine?, repoId?)`, `start_loop(machine?, repoId, kind, …)`,
`update_loop(machine?, repoId, loopId?, …, rearm?)` and `stop_loop(machine?, repoId,
loopId?)`. The parameter set SHALL be exactly the dock Loop panel's — kind `suggestion |
recipe | goal | queue`, mode `suggest | drive`, goal, recipe (id or name) or raw prompt
with sentinel, `maxIterations` 1–100, the queue's dock tab and per-step verification, the
footer-clauses opt-in — with the panel's own refusals (a goal needs a goal, a recipe needs
a recipe or a prompt, a queue needs a non-empty stash) and no other kinds. One loop slot
per agent: the loop id SHALL be the agent's repo id. `start_loop` SHALL answer `armed`
with the loop id and the effective parameters; `update_loop` SHALL edit cap, sentinel,
prompt and mode in place, SHALL re-arm on a new goal or on `rearm`, and a stopped queue
SHALL resume its remainder; `stop_loop` SHALL stop and never delete, leaving the record
with reason `arch`. `list_loops` SHALL report per slot: id, kind, mode, goal or prompt
head, recipe, sentinel, cap, iterations done, state (`armed | active | escalate | capped
| stopped | done | error | none`), pacing (a drive loop fires when the agent is idle
after each turn; a suggest loop pends), last fire, next fire, created by, stop reason
and detail, and the recipes that may be named.

#### Scenario: The Operator asks for a goal loop
- **WHEN** the Operator writes "arch, set a goal loop on living room birocode: goal make the tests green, drive, cap 10" and the arch calls `start_loop(repoId: "living room/birocode#1", kind: "goal", goal: "make the tests green", mode: "drive", maxIterations: 10)`
- **THEN** a goal loop is armed on that agent pinned to its dock conversation, the tool answers `armed` with the loop id and the parameters, the arch reports them, and the audit holds a `start_loop` row naming kind, mode, cap and the goal's head

#### Scenario: A kind the panel does not have
- **WHEN** the arch calls `start_loop` with kind `cron`
- **THEN** the tool refuses with the four kinds the panel offers and nothing changes

#### Scenario: Stop keeps the record
- **WHEN** the arch calls `stop_loop` on an active recipe loop
- **THEN** the loop is `stopped` with reason `arch`, still listed by `list_loops` and on the dock's Loop panel, and the Operator can re-arm it there

### Requirement: Loop tools follow the send rules, are audited, and work across the fleet
`start_loop`, `update_loop` and `stop_loop` SHALL apply `send_task`'s rules in order: the
arch loop armed (else `disarmed` / `capped`), the autopilot gate open (else
`not-accepting`), the repo managed and in scope (else `unmanaged`), sends allowed to that
machine and the peer's posture (else the posture's status), and not `claimed` unless the
Operator asked (`operatorAsked: "true"`, audited as `claimed-override`). A busy agent MAY
be armed, as the panel allows. Every call SHALL be audited as an arch tool row with the
tool, the agent and what was asked (kind, mode, cap, the text's head). For an agent on
another machine the hub SHALL relay through that machine's peer API, which SHALL apply
its own accept-sends opt-in, gate, scope and claimed rule and record the loop as armed by
`arch@<hub>`; a peer whose build lacks the loop routes SHALL be reported as
`no-peer-api`. The arch role prompt SHALL teach: loops only when the Operator asks,
report the loop id, never start one on its own initiative, and check `list_loops` on a
wake that names a loop.

#### Scenario: Disarmed arch
- **WHEN** the arch loop is not armed and the arch calls `start_loop`
- **THEN** the tool answers `disarmed`, nothing is armed, and the audit holds the refusal

#### Scenario: Claimed repo, no ask
- **WHEN** the target repo is `claimed` and the arch calls `stop_loop` without `operatorAsked`
- **THEN** the tool answers `claimed` and the loop is unchanged

#### Scenario: Older peer
- **WHEN** the arch calls `start_loop` for an agent on a machine whose build predates the loop routes
- **THEN** the tool answers `no-peer-api` and the arch reports that the peer needs an upgrade

#### Scenario: A loop moves while the arch sleeps
- **WHEN** a goal loop the arch armed on a managed repo escalates with a `NEEDS_HUMAN:` question
- **THEN** the arch is woken with a line naming the repo, the kind, the iterations and the question, and its reply reports the escalation to the Operator instead of re-arming
