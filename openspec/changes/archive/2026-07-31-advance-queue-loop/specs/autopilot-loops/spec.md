# autopilot-loops — delta for advance-queue-loop

## ADDED Requirements

### Requirement: An operator stop resolves a driven loop as stopped, not errored

A driven loop SHALL resolve with status `stopped` and reason `by-operator`
when the run it is waiting on ends because the operator requested a stop, and
MUST NOT report that outcome as an agent error. The run layer SHALL record an
operator-cancelled run with a status distinct from `error`. Unsent queue
items remain in the stash (lossless stop).

#### Scenario: Stop during a queue-driven turn

- **WHEN** a queue loop's step send is in flight and the operator stops the agent's run
- **THEN** the loop resolves `stopped · by-operator` with the remainder still stashed, and no `error` status appears on the loop record

#### Scenario: Genuine run failure still reports error

- **WHEN** the agent's run ends with a CLI error that no operator stop caused
- **THEN** the loop resolves `error` exactly as before

### Requirement: Reply deny-list terms match as whole words

The driven-loop ladder's deny-list check SHALL match each term against the
reply with word-boundary semantics (case-insensitive), consistent with the
routine deny fence, and the escalate detail SHALL keep naming the matched
term. A term embedded inside a larger alphanumeric word is not a hit.

#### Scenario: Past-tense report no longer trips the bare verb

- **WHEN** the deny-list contains "push" and the reply contains "pushed" but never "push" as a whole word
- **THEN** the reply is not deny-escalated by that term

#### Scenario: Whole-word mention still escalates

- **WHEN** the deny-list contains "push" and the reply contains "commit and push"
- **THEN** the loop escalates naming "push" as the matched term

### Requirement: The effective deny-list is adjustable per arm

Arming a driven loop SHALL allow the operator to trim or disable deny terms
for that arm; the instance stores its effective list, the engine enforces it
for that instance only, and the global default list is unchanged for every
other arm. An instance without a per-arm list uses the global default. The
per-arm list SHALL be disclosed with the loop's gated detail.

#### Scenario: Commit-and-push repo drives past item one

- **WHEN** a queue loop is armed with "push" removed from its per-arm deny-list and a step reply honestly reports a push
- **THEN** the step proceeds to verification instead of deny-escalating

#### Scenario: Default fence untouched elsewhere

- **WHEN** another loop is armed later without touching the deny controls
- **THEN** its effective deny-list is the unmodified global default

### Requirement: A stopped queue loop with remainder offers one-step resume

A stopped queue instance SHALL offer a Resume action on its disclosure
surfaces (dock popover, console Queue tab) whenever it is inactive with a
terminal status and its bound tab still holds stash items. Resume is operator-gated like
arming, re-activates the same instance from the current stash head with a
fresh iteration budget, preserves the cumulative sent-history, and is
recorded in the audit trail with the remaining count.

#### Scenario: Resume after a deny escalate

- **WHEN** a queue loop stopped `escalate · deny-list` with 7 items remaining and the operator activates Resume
- **THEN** the same instance re-activates and its next decide proposes the current stash head, with prior sent-history intact

#### Scenario: Resume unavailable when drained or unbound

- **WHEN** the instance's stash is empty or its bound tab no longer exists
- **THEN** no Resume action is offered

### Requirement: Activation resets phase state

Every activation path of a driven loop (arm and resume) SHALL clear the
instance's phase and pending step text, so a dead instance's interrupted
phase (e.g. `verify-owed`) never carries a verification obligation into a
fresh activation.

#### Scenario: Stale verify-owed does not survive resume

- **WHEN** an instance stopped while `verify-owed` and the operator resumes it
- **THEN** the first decide unloads the stash head as a work step, not a verification of the previous drive's step

### Requirement: A queue arm names its binding before and after arming

The queue arming surfaces SHALL state the binding — repo name, tab, and
queued item count — and that the head item fires as soon as the bound agent
is next free; while armed, the loop's disclosure surfaces SHALL repeat the
binding. Gated-detail disclosure rules are unchanged.

#### Scenario: Binding visible at arm time

- **WHEN** the operator opens the queue arm control on a tab with 8 stashed items
- **THEN** the control names the repo and tab it will drive and shows the count, before any send happens

#### Scenario: Armed status names the driven repo

- **WHEN** a queue loop is armed and the operator inspects the dock popover or console row
- **THEN** the binding (repo + tab) is stated alongside the queue status
