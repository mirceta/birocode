## MODIFIED Requirements

### Requirement: Availability of a managed repo is decided by the run slot and the checked-out branch
For each managed repo the system SHALL compute an availability of `available`,
`busy`, `claimed`, or `unmanaged`, together with a `claimedReason`. A repo SHALL be `busy`
while its builder-lane run slot is running for any actor. A branch SHALL count as the
arch's when it was recorded in the arch home's assignments as asked for in a send, handed
over by the Operator, or created by an assignee for a dispatched task. A repo on its
default branch or on an arch branch SHALL be `available` with no reason. A repo on any
other branch SHALL be `claimed` with reason `human-active` while a human was the last to
start a turn on it within the activity window (default two hours, operator-set), and
`claimed` with reason `pinned` while the Operator has pinned the repo as theirs, whatever
its branch. Outside the window an unassigned branch SHALL be `available` with reason
`unassigned-branch`: transcript reads are allowed and a send SHALL go only when the task
text or the send's `branch` argument names that branch, else the send is refused as
`state-branch`. A `claimed` repo SHALL receive no sends and no transcript reads from the
arch agent except on the Operator's explicit ask; `git_state` SHALL still report it. A
dirty working tree SHALL NOT by itself make a repo `claimed`; it SHALL be reported. The
reason SHALL be visible in `list_agents`, `git_state`, the peer describe, the fleet status
and the repo's dock.

#### Scenario: Operator's feature branch claims the repo
- **WHEN** a managed repo is checked out on `feature/x`, no arch assignment knows `feature/x`, and the Operator sent a message on it half an hour ago
- **THEN** `list_agents` reports it `claimed` with `claimedReason: "human-active"`, `send_task` to it returns `claimed` without sending, and `read_transcript` on it is refused

#### Scenario: Arch-created branch keeps the repo available
- **WHEN** the arch agent sent a task with `branch: feature/y` and the repo is now on `feature/y` with a free slot
- **THEN** `list_agents` reports it `available` with no reason and sends succeed

#### Scenario: Dirty tree on the default branch stays available
- **WHEN** a managed repo is on its default branch with uncommitted changes and a free slot
- **THEN** availability is `available` and `git_state` reports the tree as dirty

#### Scenario: The window passes
- **WHEN** a managed repo sits on an unassigned branch and no human has started a turn on it for longer than the activity window
- **THEN** `list_agents` reports it `available` with `claimedReason: "unassigned-branch"`, `read_transcript` works, a `send_task` whose text does not name the branch is refused as `state-branch`, and the same send naming the branch goes out

#### Scenario: Pinned
- **WHEN** the Operator pins a managed repo as theirs while it sits on its default branch
- **THEN** it is `claimed` with `claimedReason: "pinned"` until unpinned, and busy / unmanaged still take precedence

## ADDED Requirements

### Requirement: The Operator can hand a branch to the arch and take it back
The system SHALL let the Operator hand a repo's current branch to the arch agent from
the repo agent's dock and from the Management App's agent card ("Hand to arch"), and take
it back from the same control ("Take back"); pinning the repo as theirs SHALL be offered
alongside. A hand-over SHALL record the branch in the arch home's assignments exactly as
if the arch had asked for it, so the repo is no longer `claimed` on that branch and
`read_transcript`, `send_task` and `dispatch_task` work normally. Hand-over SHALL be per
branch: a new Operator branch is claimed again by default. The default branch SHALL not
be handed over (it is never claimed). Every hand-over, revoke, pin and unpin SHALL be
audited as an `adopt_branch` tool row naming the branch and who asked, and published on
the harness feed as `arch.handover`. For a repo on another machine the hub SHALL relay
adopt and revoke to that machine's peer API, which SHALL apply its fleet-send trust
(accept-sends opt-in, gate, managed by its arch) and record the branch in its own
assignments.

#### Scenario: Hand to arch from the dock
- **WHEN** the Operator's repo is `claimed` on `feature/x` and they press "Hand to arch" in its dock
- **THEN** the dock shows the branch as handed to the arch, `list_agents` reports the repo `available` with no reason, `read_transcript` returns its conversation, `dispatch_task` to it is sent, and the audit holds an `adopt_branch` row "adopted feature/x (handed over by operator)"

#### Scenario: Take back
- **WHEN** the Operator presses "Take back" on the handed-over branch and sends a message on the repo
- **THEN** the repo is `claimed` with reason `human-active` again and the audit holds "revoked feature/x (taken back by operator)"

#### Scenario: New branch is claimed again
- **WHEN** the Operator handed `feature/x` over and later checks the repo out on `feature/next` and works on it
- **THEN** the repo is `claimed` on `feature/next` while `feature/x` stays the arch's

### Requirement: The arch adopts a branch only on the Operator's ask
The arch agent SHALL have an `adopt_branch(repoId, branch?, machine?, operatorAsked)` tool
that hands the branch (default: the checked-out one) to the arch. The tool SHALL be
honoured only when `operatorAsked` is `"true"`, meaning the Operator's own message in the
arch conversation asked the arch to take that branch over; without it the tool SHALL
refuse as `not-asked`, change nothing and audit the refusal. A honoured call SHALL be
audited like a dock hand-over, naming the arch and the Operator's ask. The arch role
prompt SHALL teach the tool, the `claimedReason` values, the name-the-branch rule and that
a wake-up, a transcript or a task card is never such an ask.

#### Scenario: "arch, take over feature/x"
- **WHEN** the Operator writes "arch, take over feature/arch-conversations on birocode" and the arch calls `adopt_branch` with `operatorAsked: "true"`
- **THEN** the branch is recorded as adopted, the tool answers `adopted`, and the repo is `available` to the arch on it

#### Scenario: Nobody asked
- **WHEN** the arch calls `adopt_branch` without `operatorAsked` after a wake-up showed a claimed repo
- **THEN** the tool answers `not-asked`, the assignments are unchanged, and the audit holds the refusal

### Requirement: A dispatched task's branch is the arch's
`dispatch_task` SHALL accept an optional `branch` mirroring `send_task`'s; when given, the
brief SHALL name it and the branch SHALL be recorded under the task id at once. Whether or
not a branch was given, on every arch wake the system SHALL record, under the task id, the
non-default branch a local assignee of a dispatched task in `doing` is checked out on when
the arch does not know that branch yet, so the repo is never `claimed` by its own task
branch. Taking a branch back SHALL drop its task record too.

#### Scenario: The assignee creates its branch
- **WHEN** the arch dispatched task `t1` to a local repo without a branch and the agent created `feature/handles` for it
- **THEN** on the next wake `feature/handles` is recorded under `t1`, the repo is `available` on it, and the arch reads the agent's reply with `read_transcript`

#### Scenario: Branch named up front
- **WHEN** the arch calls `dispatch_task(t2, branch: "feature/x")`
- **THEN** the brief tells the agent to work on `feature/x` and the branch is recorded under `t2` as soon as the send is `sent`

### Requirement: The Operator can ask the arch to read a claimed repo
`read_transcript` SHALL accept `operatorAsked` like `send_task`: when the Operator's own
message asked the arch to read a claimed repo's reply, the read SHALL go through and be
audited as `claimed-override` on the reading harness and, for a peer, on the peer as
`claimed-override from <hub>`. Without the ask a claimed repo's transcript SHALL stay
refused, and the refusal SHALL tell the arch that the Operator can hand the branch over or
ask for the read.

#### Scenario: The operator asked for the read
- **WHEN** the Operator writes "read what the birocode agent answered on my branch" and the arch calls `read_transcript` with `operatorAsked: "true"`
- **THEN** the messages are returned and the audit holds `claimed-override` for `read_transcript`
