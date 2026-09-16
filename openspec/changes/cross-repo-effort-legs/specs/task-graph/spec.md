## ADDED Requirements

### Requirement: A cross-repo effort is one card with typed legs, done only when every leg is merged
A task's assignees SHALL be typed LEGS: each MAY carry a role (`driver` — the orchestrator;
`driven` — a product repo it drives) and MAY be AGENTLESS — a checkout path on its machine
with the synthetic repo id `path:<path>`, never resolvable to a managed agent. Every leg
SHALL keep its own branch, pull request and independently verified merge state. The card
SHALL be done only when EVERY leg is verified merged on GitHub; a card with some legs
verified merged and some not SHALL be reported as **partially merged**, a distinct state
(`effort.partiallyMerged`, the Legs section's "N of M legs merged — partially merged, not
done", a `partial-merge` filter flag), and one merged leg SHALL never advance the card past
its slowest leg. A column that claims pr-merged or done while a leg is not verified merged
SHALL be judged **dishonest** by the board check and flagged by the policeman at once, with
every leg and its merge state named. Legs SHALL be addable (`POST
/api/taskgraph/nodes/{id}/legs` with a repo agent or a path, a role, optional branch / PR),
typable (`POST …/legs/role`) and removable like assignees; a done claim SHALL stand (claims
are advisory) but never be verified.

#### Scenario: The Knjiga-pošte regression
- **WHEN** a card has a driver leg (web-flow-autodev, PR #21) and a driven agentless leg (`prgcopies\copy1\prg`, PR #166), GitHub reports #21 merged and #166 open, and a pass runs
- **THEN** the driver leg is verified merged, the driven leg PR open, the card is PR open (not merged, not done), the effort reads "1 of 2 legs merged — partially merged, not done", and moving the card to done makes the board check "Not verified yet — cross-repo effort: 1 of 2 legs merged on GitHub (…); not merged: copy1/prg — PR #166 open, not merged — the card is not done until every leg is merged" and the policeman flags it

#### Scenario: Every leg merged
- **WHEN** GitHub later reports #166 merged too
- **THEN** the effort reads "2 of 2 legs merged — every leg merged", no mismatch remains, and the card advances to merged by the facts

### Requirement: An agentless leg is verified at its checkout and never pinged
An agentless leg on this machine SHALL be probed by the verifier at its own checkout path
with its recorded branch, and its pull request SHALL be resolved from that checkout's
GitHub origin and the branch (or its recorded PR URL); a peer's agentless leg SHALL be
checked by PR URL only. An agentless leg SHALL never be dispatched, never have its
transcript read, and never be attributed to a managed agent; the Kanban SHALL name it by its
path tail with "no agent".

#### Scenario: The prg checkout is probed
- **WHEN** a driven leg is added by path `C:\prgcopies\copy1\prg` with branch `knjiga-poste` and a pass runs
- **THEN** the verifier probes that path, records the head commit, and — once GitHub has a PR for that branch in the checkout's origin — the leg's PR number and PR-open state, while the dispatch of the card pings only the agent legs

### Requirement: The Kanban shows the effort's legs, roles and per-leg merge state
A card that is an effort (several legs, or any leg typed or agentless) SHALL carry a
**Legs** section: one row per leg with its role, name (agent handle or path tail), "no
agent" when agentless, its status and its merge state linked to the PR ("merged (PR #21)",
"PR #166 open, not merged", "no PR recorded"), under the brief "N of M legs merged" — amber
when partially merged, green when every leg is merged. The detail SHALL let the Operator
type each leg (driver / driven / untyped) and add a leg (role, a repo agent or a checkout
path, branch, PR URL). A plain single-agent card SHALL show no Legs section.

#### Scenario: Reading the effort
- **WHEN** the Knjiga-pošte card sits in PR open with its two legs
- **THEN** the card shows "LEGS ⛓ 1 of 2 legs merged — partially merged, not done", a DRIVER row "spacex/web-flow-autodev#1 · Merged · merged (PR #21)" and a DRIVEN row "copy1/prg · no agent · PR open · PR #166 open, not merged", the `partially merged` filter chip exists, and the assignee chip reads "copy1/prg (no agent)"
