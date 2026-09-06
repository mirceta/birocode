## ADDED Requirements

### Requirement: A task can be owned by several repo agents, each with its own state
A task SHALL carry a set of assignees, each a repo agent (machine + repoId) with its OWN
lifecycle status, dispatch record, branch, head commit, pushed flag, PR URL and number,
merge commit, verified status and warning. The task's legacy single-assignee fields
SHALL mirror the first assignee, so a single-assignee task reads and behaves exactly as
before and a task written before this change (or by an older peer) SHALL read back as
one assignee. Assignees SHALL be replaceable, addable and removable; the last one
leaving SHALL unassign the task without changing its status.

#### Scenario: Two repos on one card
- **WHEN** the operator adds skratek-projects on this hub to a card assigned to prg on spacex
- **THEN** the card lists both assignees, each at its own status, and its legacy fields still name prg on spacex

#### Scenario: A card from before this change
- **WHEN** the board loads a card with only the legacy repoId and sourceId
- **THEN** the card reads as one assignee with the card's status and linkage, and nothing is re-stamped

### Requirement: The task's status is the aggregate of its assignees
The task's status SHALL be derived from its assignees: as far as the slowest assignee,
and out of todo as soon as any assignee has started — done only when every assignee is
done, pr-merged only when every assignee is at least pr-merged. A status set on the task
SHALL be set on every assignee; a status set on one assignee SHALL move that assignee
only and re-aggregate. Each assignee SHALL carry its own verification badge; the task
SHALL be unverified when any assignee is.

#### Scenario: One done, one not started
- **WHEN** prg's assignee is done and skratek's is still todo
- **THEN** the card is doing

#### Scenario: Both merged
- **WHEN** every assignee is at least pr-merged
- **THEN** the card is pr-merged, and done once every assignee is done

### Requirement: Dispatch, claims and verification are per assignee
Dispatching a task SHALL ping every assignee not yet pinged (or a named subset), each
with the shared brief plus which repo is its own and who else is on the card, and SHALL
move each pinged assignee to doing. A relayed claim (branch, commit, PR) SHALL land on
the named assignee; on a task with several assignees a claim without a named assignee
SHALL be refused. The verifier SHALL check each assignee's own branch/PR — local facts
for this machine's repos, PR facts on GitHub for any machine — advance that assignee
forward only, and re-aggregate the task. The stale guard SHALL run per assignee.

#### Scenario: Only prg is pinged
- **WHEN** the arch dispatches the card naming prg on spacex
- **THEN** prg's assignee is doing with one ping recorded and skratek's is untouched

#### Scenario: prg's PR merges first
- **WHEN** the verifier finds prg's PR merged and live while skratek's branch is only committed
- **THEN** prg's assignee is done, skratek's is committed, and the card is committed

### Requirement: The views show every assignee and the filters match any of them
The Kanban card SHALL show a chip per assignee with its own status and SHALL let the
operator add and remove assignees; the Task graph node SHALL show every assignee with
its machine and repository colours and its own status, and the legends SHALL count a
task once per distinct machine / repository among its assignees. The task filters'
machine and agent chips SHALL match a task when ANY of its assignees matches.

#### Scenario: Filter by either machine
- **WHEN** the operator selects the machine chip MONSTER or the chip spacex
- **THEN** the two-repo card is shown either way
