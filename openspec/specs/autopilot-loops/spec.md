# autopilot-loops Specification

## Purpose
TBD - created by archiving change fix-suggestion-loop-inert. Update Purpose after archive.
## Requirements
### Requirement: Suggest-mode suggestion loops always pend the best candidate

The engine SHALL record the classifier's best-matching routine as a
suggest-mode SUGGESTION instance's pending prompt, with its confidence, for
every new trailing agent message — even when that confidence is below the
threshold. Only verdicts
with no candidate at all (no routines configured, no word overlap, empty
message) or a deny-listed candidate SHALL hold without pending. The
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

### Requirement: The dock discloses the armed loop's live decision

The ungated loop status projection SHALL include the engine's current
decision word for each instance (off | running | idle | suggestion |
escalate | paused | sent). The decision's reason, matched label, and
confidence SHALL be included only while the operator gate is open, following
the same disclosure rule as the pending prompt. The dock loop control SHALL
render the live decision and, gate open, its reason for an armed instance.

#### Scenario: Held loop explains itself at the dock

- **WHEN** an armed suggestion loop's last tick escalated below threshold and the user opens the agent's loop popover with the gate open
- **THEN** the popover shows the escalate decision with the below-threshold reason and confidence

#### Scenario: Gate closed keeps reasons undisclosed

- **WHEN** the operator gate is closed and a client reads the loop status projection
- **THEN** the decision word is present but reason, label, and confidence are null

### Requirement: A loop on a missing repo resolves with an explicit error

The engine SHALL resolve an ACTIVE loop instance whose repo folder no
longer exists as status `error` with stop reason `repo-missing` naming the
missing path, exactly once. The engine SHALL NOT
silently skip armed instances on missing repos.

#### Scenario: Deleted repo folder ends the loop visibly

- **WHEN** a suggestion loop is armed and the repo's folder is deleted or moved
- **THEN** the next tick resolves the loop as error with reason repo-missing, and the dock shows the terminal state

### Requirement: Deny-list terms match routines as whole words with a named reason

The classifier's deny-list fence SHALL match a deny term against a routine's
prompt text with word-boundary semantics (case-insensitive), and the
escalate verdict's reason SHALL name the matched term. A deny-listed routine
SHALL never be pended or sent in any mode.

#### Scenario: Whole-word deny term still escalates

- **WHEN** the deny-list contains "deploy" and the best-matching routine's text contains the word "deploy"
- **THEN** the verdict escalates and its reason names "deploy" as the matched deny term

#### Scenario: Substring inside another word no longer blocks

- **WHEN** the deny-list contains "prod" and the best-matching routine's text contains "product" but not "prod" as a word
- **THEN** the routine is not deny-blocked by that term

### Requirement: A CLI-backed classifier can replace the stub behind the same contract

The system SHALL support classifying the trailing agent message with a
one-shot Claude CLI call that selects one of the user's routine prompts or
abstains, returning the same verdict shape (escalate flag, label,
confidence, reason) the gate already consumes. Classification SHALL run off
the engine's tick path (single-flight per repo; ticks hold while a
classification is in flight and consume its cached result when done). On CLI
failure or timeout the stub classifier's verdict SHALL be used and the
reason SHALL note the fallback. The active classifier SHALL be selectable in
the autopilot configuration, and threshold, deny-list, kill-switch, and
operator-gate fencing SHALL apply to CLI verdicts identically.

#### Scenario: CLI verdict drives a confident send

- **WHEN** the CLI classifier is selected, a drive-mode suggestion loop is armed, and the CLI returns a routine at confidence above the threshold whose text is not deny-listed
- **THEN** the engine sends that routine's prompt through the standard capped, audited send path

#### Scenario: Tick never blocks on the CLI

- **WHEN** a new trailing message arrives and the CLI classification is still running at the next tick
- **THEN** the tick holds with a classifying reason and no duplicate CLI call is started for that message

#### Scenario: CLI failure falls back to the stub

- **WHEN** the CLI call errors or times out
- **THEN** the stub verdict is used and its reason notes the CLI fallback

