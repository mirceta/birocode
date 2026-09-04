## REMOVED Requirements

### Requirement: Deny-list terms match routines as whole words with a named reason

**Reason**: The deny-word fence was removed (operator decision 2026-09-03): it matched words, not intent, blocked explicitly ordered work, and the actions it named are guarded by real gates (GitHub main protection, the deploy auto-rollback, agent judgment).

**Migration**: Nothing to migrate; a `DenyList` key in an old `autopilot.json` is ignored.

### Requirement: Reply deny-list terms match as whole words

**Reason**: Same removal — a driven loop's reply is no longer scanned for risky words. The ladder still stops on operator stop, run error, `NEEDS_HUMAN:`, the sentinel/verification rules and the cap.

**Migration**: A loop instance persisted with a per-arm `DenyList` loads with the key ignored.

### Requirement: The effective deny-list is adjustable per arm

**Reason**: There is no deny list to adjust. The arm API ignores a `denyList` body field; the chips are gone from the console and the dock.

**Migration**: None.

## MODIFIED Requirements

### Requirement: Suggest-mode suggestion loops always pend the best candidate

The engine SHALL record the classifier's best-matching routine as a
suggest-mode SUGGESTION instance's pending prompt, with its confidence, for
every new trailing agent message — even when that confidence is below the
threshold. Only verdicts
with no candidate at all (no routines configured, no word overlap, empty
message) SHALL hold without pending. The
threshold SHALL continue to gate DRIVE-mode sends unchanged: a below-
threshold verdict in drive mode holds as an escalation and never sends.

#### Scenario: Below-threshold match pre-fills the composer

- **WHEN** a suggestion loop is armed in suggest mode and the agent's new trailing message matches a routine at confidence 0.40 with threshold 0.75
- **THEN** the routine becomes the instance's pending prompt with confidence 0.40, and nothing is sent

#### Scenario: Below-threshold match never auto-sends

- **WHEN** a suggestion loop is armed in drive mode and the best match is below the threshold
- **THEN** the engine holds as an escalation and sends nothing

#### Scenario: No candidate still holds

- **WHEN** a suggestion loop is armed in suggest mode and the trailing message shares no significant word with any routine
- **THEN** no pending prompt is recorded and the hold reason states that no routine matched

### Requirement: A CLI-backed classifier can replace the stub behind the same contract

The system SHALL support classifying the trailing agent message with a
one-shot Claude CLI call that selects one of the user's routine prompts or
abstains, returning the same verdict shape (escalate flag, label,
confidence, reason) the gate already consumes. Classification SHALL run off
the engine's tick path (single-flight per repo; ticks hold while a
classification is in flight and consume its cached result when done). On CLI
failure or timeout the stub classifier's verdict SHALL be used and the
reason SHALL note the fallback. The active classifier SHALL be selectable in
the autopilot configuration, and threshold, kill-switch, and
operator-gate fencing SHALL apply to CLI verdicts identically.

#### Scenario: CLI verdict drives a confident send

- **WHEN** the CLI classifier is selected, a drive-mode suggestion loop is armed, and the CLI returns a routine at confidence above the threshold
- **THEN** the engine sends that routine's prompt through the standard capped, audited send path

#### Scenario: Tick never blocks on the CLI

- **WHEN** a new trailing message arrives and the CLI classification is still running at the next tick
- **THEN** the tick holds with a classifying reason and no duplicate CLI call is started for that message

#### Scenario: CLI failure falls back to the stub

- **WHEN** the CLI call errors or times out
- **THEN** the stub verdict is used and its reason notes the CLI fallback

### Requirement: A stopped queue loop with remainder offers one-step resume

A stopped queue instance SHALL offer a Resume action on its disclosure
surfaces (dock popover, console Queue tab) whenever it is inactive with a
terminal status and its bound tab still holds stash items. Resume is operator-gated like
arming, re-activates the same instance from the current stash head with a
fresh iteration budget, preserves the cumulative sent-history, and is
recorded in the audit trail with the remaining count.

#### Scenario: Resume after an escalate

- **WHEN** a queue loop stopped `escalate · needs-human` with 7 items remaining and the operator activates Resume
- **THEN** the same instance re-activates and its next decide proposes the current stash head, with prior sent-history intact

#### Scenario: Resume unavailable when drained or unbound

- **WHEN** the instance's stash is empty or its bound tab no longer exists
- **THEN** no Resume action is offered
