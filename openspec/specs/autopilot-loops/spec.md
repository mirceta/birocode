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

### Requirement: The dock mode control is a single drive checkbox on the loop header row

The agent dock's loop section SHALL expose the suggest/drive mode as one
compact Drive checkbox on the section's header row, right-aligned next to the
summary button that expands the section, visible in both collapsed and
expanded states. Checked SHALL mean drive mode (the loop sends its own
prompts, capped and audited); unchecked SHALL mean suggest-only (the loop's
next prompt pre-fills the composer). Toggling SHALL flip a live armed
instance's mode in place via the existing mode action when the selection is
the armed kind, and otherwise SHALL set the mode the next arm request carries.
Mode defaults are unchanged (suggestion kind defaults to suggest, driven kinds
to drive). The popover SHALL NOT render a separate full-row mode radiogroup.

#### Scenario: Flip a live loop without opening the popover

- **WHEN** a queue loop is armed in drive mode and the operator unchecks the Drive checkbox on the collapsed header row
- **THEN** the instance's mode flips to suggest in place via the mode action, without disarming and without the popover opening

#### Scenario: Checkbox seeds the next arm

- **WHEN** no loop of the selected kind is armed and the operator unchecks Drive, then arms a goal loop
- **THEN** the arm request carries suggest mode and the instance arms suggest-only

#### Scenario: Gate-closed flip fails visibly on the collapsed row

- **WHEN** the operator gate is closed and the operator toggles the checkbox while the popover is collapsed
- **THEN** the gate-closed hint renders under the header row (not only inside the popover) and the mode is unchanged

### Requirement: The dock loop popover is controls-only; reference copy lives in the console

The dock loop popover SHALL contain controls and consequence disclosures only:
the kind picker, the selected kind's parameters (for phased kinds, the
state-sectioned parameter panel), prompt inspection for the recipe kind, the
pending/decision readouts, and Arm/Disarm/Resume. It SHALL NOT render per-kind
description paragraphs or per-mode explanation paragraphs; at most one short
pointer line MAY name where the full explanations live. Consequence
disclosures are exempt and SHALL remain (queue binding line, deny-list chips
and trims, verification hints, replace-warning, gate/error hints, and the
state sections' badge controls, one-line dynamics descriptions, and transition
lines — these state what the surrounding parameters do, they are not relocated
reference copy). The autopilot console's Loops tab SHALL render the relocated
reference copy — each loop kind with its description and the suggest-vs-drive
contrast — as static content requiring no backend call.

#### Scenario: Popover shows controls without prose

- **WHEN** the operator expands an agent's loop section and cycles through the four kinds
- **THEN** no kind-description or mode-explanation paragraph renders, while the kind picker, parameters (state-sectioned for goal/queue), inspection (recipe), and arm controls render

#### Scenario: Consequence disclosures survive the declutter

- **WHEN** the operator selects the queue kind with items stashed
- **THEN** the binding line, unload-order preview, verification toggle with its hint, deny-list chips, and the sections' badge and transition lines still render

#### Scenario: Console carries the explanations

- **WHEN** the End User opens the autopilot console's Loops tab
- **THEN** a reference block describes every loop kind and the suggest-vs-drive modes, rendered without any backend call

### Requirement: Phased loop parameters are presented as state-machine sections

The dock loop popover SHALL present the parameters of the phased driven kinds
(goal, queue) grouped into ordered sections that mirror the engine's state
machine: a LOOP-WIDE section for parameters belonging to no single state (goal
text, turn cap, queue binding, per-step verification toggle, deny-list), then
one section per parameter-bearing state named with its state name
(WORKING_STATE, VERIFICATION_STATE). Each state section SHALL contain: the
parameters that state uses (prompt templates rendered as labeled read-only
parameter boxes — no longer behind an inspection toggle), an explicit
badge/exit control ("agent emits badge: <token>" where the engine expects a
sentinel — `LOOP_DONE`, `GOAL_VERIFIED`, `STEP_VERIFIED` — or the stated
badge-less exit trigger for the queue's working state), and explicit
transition lines stating what the loop system does for every outcome of that
state, including the terminal outcomes (`DONE · VERIFIED`, `DONE · DRAINED`,
`ESCALATE · STEP-UNVERIFIED`) and the queue's verification-off
stay-in-work variant. The sections SHALL render in both the arming view
(composed from the gated detail templates) and the armed view (the instance's
stored copies); a closed operator gate SHALL replace only the gated template
text with the gate hint, never the section structure, badges, or transition
lines. The recipe and suggestion kinds are unaffected. All non-token labels
SHALL be localized (en, tr).

#### Scenario: Queue sections make the dynamics knowable from the panel

- **WHEN** the operator selects the queue kind with items stashed and the gate open
- **THEN** the panel shows LOOP-WIDE (binding, verification toggle, deny chips,
  cap), WORKING_STATE holding the unload-order list with a badge-less exit
  trigger ("the step's turn finishes") and a transition line into
  VERIFICATION_STATE, and VERIFICATION_STATE holding the verification template
  box, a control reading "agent emits badge: STEP_VERIFIED", and transition
  lines for next-step, `DONE · DRAINED`, and `ESCALATE · STEP-UNVERIFIED`

#### Scenario: Goal sections pair each template with its badge and transition

- **WHEN** the operator selects the goal kind and types a goal with the gate open
- **THEN** WORKING_STATE shows the work-prompt template composed with that goal
  plus "agent emits badge: LOOP_DONE" transitioning into VERIFICATION_STATE,
  and VERIFICATION_STATE shows the verification template plus
  "agent emits badge: GOAL_VERIFIED" ending in `DONE · VERIFIED`, with the
  gaps-found line returning to WORKING_STATE

#### Scenario: Armed view keeps the full parameter panel

- **WHEN** a goal loop is armed and the operator opens the popover
- **THEN** the same sections render read-only from the instance's stored goal
  and prompts — the armed popover is no longer parameter-less

#### Scenario: Closed gate degrades template boxes only

- **WHEN** the operator gate is closed and the popover is opened on the queue kind
- **THEN** the sections, state names, badge control, and transition lines still
  render, and only the template/stored-prompt boxes show the gate hint

### Requirement: The parameter panel surfaces the armed loop's live state

While a goal/queue loop is armed and active, the dock SHALL light the section
of the machine's current state (`work` → WORKING_STATE; `verify-owed` and
`verify` → VERIFICATION_STATE) with a "now" marker, SHALL render a compact
state strip in the armed popover header showing every live phase chip in flow
order with the current phase lit (`verify-owed` distinct from `verify`) and
terminal instances lighting the matching outcome pill, and the collapsed dock
summary's phase word SHALL name the actual phase (`work` stays silent,
unknown phase values render raw, never blank). Phase and status SHALL come
from the ungated loops projection so these readouts survive a closed gate.

#### Scenario: Verify-owed is visible and lights the verification section

- **WHEN** an armed queue loop's step lands and its phase is `verify-owed`
- **THEN** the header strip lights the `verify owed` chip, the
  VERIFICATION_STATE section carries the "now" marker, and the collapsed
  summary shows the verify-owed word

#### Scenario: Terminal outcome lights its pill, not a section

- **WHEN** a queue loop ends with status `escalate` and a step-unverified stop reason
- **THEN** no section carries the "now" marker and the strip lights the
  `ESCALATE · STEP-UNVERIFIED` pill

### Requirement: Every driven send carries the situational briefing

The engine SHALL prepend a situational briefing to every drive-mode
loop send — queue item, queue step-verification, goal work, goal
verification, and recipe sends alike — composed at send time from a fixed
frame and the enabled entries of the operator-editable briefing rules list.
The briefing SHALL state that the
agent is being driven by an autopilot loop with no human reading replies in
real time, that it must act on the prompt rather than answer with a plan or
a counter-question, that it should answer its own clarifying questions and
follow its own advice when confident, that it should apply sensible defaults
to open questions, and that `NEEDS_HUMAN:` is reserved for decisions only
the human can make. Work-phase briefings SHALL include the kind-appropriate
marker line (the loop's configured sentinel for recipe and goal work sends;
the no-marker-needed note for queue items); verification-phase briefings
SHALL carry only a short honesty-first situational note — no act-don't-ask
posture — leaving the marker instruction to the verification template. Suggest-mode pending prompts SHALL NOT be
briefed.

#### Scenario: Queue item is sent briefed

- **WHEN** an armed drive-mode queue loop unloads a stash item
- **THEN** the text sent to the agent is the briefing composition followed by the item's stored text, and the briefing names the autopilot situation and the act-don't-ask posture

#### Scenario: Recipe send uses the loop's own sentinel

- **WHEN** a recipe loop with a custom sentinel phrase sends its stored prompt
- **THEN** the briefing's marker line cites that custom sentinel, not the default

#### Scenario: Verification send is briefed without a second marker line

- **WHEN** a queue loop sends the step-verification prompt
- **THEN** the sent text carries the situational briefing core and exactly one marker instruction — the verification template's own

#### Scenario: Suggest mode pre-fills raw text

- **WHEN** a suggest-mode loop records a pending prompt for the composer
- **THEN** the pending text is the stored text with no briefing attached

### Requirement: The briefing rules are an operator-editable stored list

The behavioral rules of the work-phase briefing SHALL live in a stored,
global, revisioned list — seeded with the draft rules, editable without a
deploy — while the situational frame, the `NEEDS_HUMAN:` and sentinel marker
lines, and the verify-phase honesty note SHALL remain fixed in code. Each
rule SHALL be individually enable/disable-able; disabled rules SHALL be
retained but never composed into a send. Every save SHALL produce a new
monotonic revision with the prior state retained, and every briefed send
SHALL record the revision it composed with. The rules SHALL compose into
work-phase sends only, never into verification sends. A **Briefing** section
beside the loop section on each agent dock card SHALL show the rules and
accept a new one at any time, and SHALL disclose that the list is global.

#### Scenario: A new rule reaches the very next send

- **WHEN** the operator adds an enabled rule from the dock Briefing section and the armed queue loop then sends its next item
- **THEN** that send's briefing contains the new rule as a bullet line

#### Scenario: A parked idea is remembered but not sent

- **WHEN** the operator adds a rule and disables it
- **THEN** the rule stays listed in the Briefing section and subsequent briefed sends do not contain it

#### Scenario: Rules never touch a verification turn

- **WHEN** a queue step-verification prompt is sent while the rules list has enabled entries
- **THEN** the sent text carries only the fixed verify-phase note and the verification template — no rule lines

#### Scenario: An emptied list still briefs the situation

- **WHEN** every rule is disabled or deleted and a driven work send fires
- **THEN** the sent briefing still states the autopilot situation, the `NEEDS_HUMAN:` escalation line, and the contract line

#### Scenario: A recorded send survives later edits

- **WHEN** the operator edits the rules after a briefed send was recorded
- **THEN** the recorded send's rules revision still resolves to the rules text it was actually composed with

### Requirement: Briefed sends stay honestly disclosed without per-send noise

The system SHALL record the raw stored text (not the briefed composition)
in the audit log, the queue sent-history, and the synthetic user event, and
SHALL mark each such record as sent-with-briefing together with the briefing
rules revision used. The current briefing composition (fixed frame plus
enabled rules) SHALL be disclosed at the dock Briefing section, the gated
loop detail, and the arm preview surfaces, so that the exact sent text is
deterministically reconstructable from operator-inspectable parts. The chat
surface SHALL distinguish a briefed loop send from a human-typed message.

#### Scenario: Sent-history shows the operator's text

- **WHEN** the operator opens the queue sent-history after two briefed sends
- **THEN** each entry shows the raw item text marked as briefed, not two copies of the briefing prefix

#### Scenario: Arm preview reveals the exact composition

- **WHEN** the operator opens the arm preview with the gate open
- **THEN** the current briefing composition (frame + enabled rules) is shown so the operator can read exactly what any queued item will be wrapped with before arming

#### Scenario: Chat bubble marks the briefing

- **WHEN** a briefed loop send renders in the agent's chat
- **THEN** the bubble shows the stored text with an affordance indicating it was sent with the autopilot briefing

### Requirement: An unaccomplished step still escalates under the briefing

The act-don't-ask briefing SHALL NOT weaken step or goal verification: a
verification reply that does not honestly confirm the work SHALL stop the
loop exactly as before the briefing existed.

#### Scenario: Briefed agent that skipped the work is still caught

- **WHEN** a briefed queue step lands but the verification reply states the request was not accomplished
- **THEN** the loop stops as escalate · step-unverified, unchanged by this feature

