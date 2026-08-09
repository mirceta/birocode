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

The system SHALL keep the raw stored text as the display text of every
truncated list projection — the audit log's dashboard and console slices, the
queue sent-history, and the loop state snippets — and SHALL mark each such
record as sent-with-briefing together with the briefing rules revision used. The synthetic user event and the chat surface SHALL
carry the exact composed text handed to the CLI — briefing frame, enabled
rules, footer clauses, contract line, and stored text — so the live chat and
the transcript reload render the same verbatim record of what the agent was
told, with no affordance standing in for hidden text. The current briefing
composition (fixed frame plus enabled rules) SHALL remain disclosed at the
dock Briefing section, the gated loop detail, and the arm preview surfaces,
so that the exact sent text of any recorded send is deterministically
reconstructable from operator-inspectable parts.

#### Scenario: Sent-history shows the operator's text

- **WHEN** the operator opens the queue sent-history after two briefed sends
- **THEN** each entry shows the raw item text marked as briefed, not two copies of the briefing prefix

#### Scenario: Arm preview reveals the exact composition

- **WHEN** the operator opens the arm preview with the gate open
- **THEN** the current briefing composition (frame + enabled rules) is shown so the operator can read exactly what any queued item will be wrapped with before arming

#### Scenario: Chat shows exactly what was sent

- **WHEN** a driven queue loop unloads a stash item and the send fires
- **THEN** the chat's user bubble contains the full composed text the CLI received — briefing, rules, contract line, separator, and the item — byte-identical to the sent prompt, with no "briefing attached" affordance

#### Scenario: Live bubble matches the transcript reload

- **WHEN** the operator watches a driven send land live and later reloads the same conversation from the transcript
- **THEN** both renderings of that user turn show the same full composed text

### Requirement: An unaccomplished step still escalates under the briefing

The act-don't-ask briefing SHALL NOT weaken step or goal verification: a
verification reply that does not honestly confirm the work SHALL stop the
loop exactly as before the briefing existed.

#### Scenario: Briefed agent that skipped the work is still caught

- **WHEN** a briefed queue step lands but the verification reply states the request was not accomplished
- **THEN** the loop stops as escalate · step-unverified, unchanged by this feature

### Requirement: Queue arming surfaces preview the full unload order

Every surface that arms a queue loop SHALL show, before arming, the complete
ordered list of the bound tab's stash items — this covers the dock's unified
loop control and the autopilot console's Queue tab — numbered top-down in the order the queue
will unload them — not merely the head item and a count. The preview SHALL
reflect the live stash: reordering or editing the stash while the arm surface
is open updates the preview.

#### Scenario: Dock arm popover lists every queued item in order

- **WHEN** the operator opens the queue section of an agent's loop control while the tab's stash holds ["A", "B", "C"]
- **THEN** the popover lists A, B, C numbered 1–3 as the unload order, and arming is offered against exactly that list

#### Scenario: Reordering the strip updates the open preview

- **WHEN** the operator moves item C above item B in the stash strip while the arm preview is open
- **THEN** the preview shows A, C, B on its next refresh

### Requirement: A queue loop records a bounded, gated history of sent steps

The system SHALL append each landed queue-loop step's text (drive send
completed, or suggest pend consumed) to a bounded sent-history on the loop
record (newest last; oldest dropped beyond the bound), persisted with the
record and reset when a queue loop is armed. The sent-history SHALL be
disclosed only while the operator gate is open — via the gated loop detail and
the debug bundle (redacted while closed) — and SHALL NOT appear in the ungated
status projection. The dock loop control's queue inspection and the console's
Queue tab SHALL render the history as sent rows, labeled as partial when the
bound has dropped older items.

#### Scenario: Landed steps appear in the gated sent-history in order

- **WHEN** a drive-mode queue loop has sent "A" and then "B", both landed, and the operator gate is open
- **THEN** the gated loop detail lists the sent-history ["A", "B"], and the dock inspection and console Queue tab render A and B as sent rows in that order

#### Scenario: Gate closed hides the sent texts

- **WHEN** the operator gate is closed and a client reads loop detail or the debug bundle for a queue loop with sent steps
- **THEN** no sent-history text is disclosed (the debug bundle carries the redaction marker), while the ungated sent/remaining counts remain readable

#### Scenario: Re-arming starts a fresh history

- **WHEN** a queue loop that previously sent steps is armed again on the same tab
- **THEN** the sent-history starts empty for the new arm, and the previous run's sends remain available in the audit trail

### Requirement: A queue loop unloads the tab's live stash one prompt per turn

The system SHALL support arming an agent's one loop slot with a **queue loop**
bound to that agent's tab prompt stash — the stash itself is the queue, not a
copy. Each time the driven agent's turn ends (and verification, when enabled,
has passed), the engine SHALL take the stash's **head** item and dispatch it by
the instance's mode — sent in drive mode, pended into the agent's composer in
suggest mode — removing the item from the stash only once it lands (send
completed, or pend consumed by the human). The stash SHALL remain live while
armed: items added, removed, or reordered while the queue runs take effect on
the next unload. When the stash is empty at an unload point, the loop SHALL
resolve `done` with stop reason `drained`. A `LOOP_DONE` token in a step reply
SHALL NOT complete the queue.

#### Scenario: Drive-mode queue drains head-first in stash order

- **WHEN** a queue loop is armed in drive mode on a stash holding ["A", "B", "C"] and the agent finishes each turn without escalation
- **THEN** the engine sends A, then B, then C, one per unload point, each removed from the stash as it lands, and after C the loop resolves done with reason drained

#### Scenario: An item stashed while the queue runs gets unloaded

- **WHEN** the operator stashes a new prompt while the queue loop is armed and running
- **THEN** the new item joins the stash in order and is unloaded when its turn comes, without re-arming

#### Scenario: Suggest-mode queue pends instead of sending

- **WHEN** a queue loop is armed in suggest mode and an unload point is reached
- **THEN** the head item becomes the instance's pending prompt pre-filling the composer, nothing is sent, and the item leaves the stash only after the human sends it

#### Scenario: An agent's LOOP_DONE does not end the queue

- **WHEN** a step reply ends with LOOP_DONE while the stash still holds items
- **THEN** the queue proceeds to the next item at the next unload point instead of resolving done

### Requirement: Queue sends ride the standard driven-loop mechanics unchanged

Queue loop unloads SHALL pass through the driven kinds' shared safety ladder — a
run error stops as `error`; a `NEEDS_HUMAN:` marker stops as `escalate` naming
the question; a deny-listed term in the reply stops as `escalate` naming the
term — before any next item is unloaded. Drive-mode queue sends (verification
turns included) SHALL be bounded by the instance's iteration cap (resolving
`capped` when reached), recorded in the append-only audit trail, and fenced by
the operator gate and kill switch, identically to the recipe and goal kinds.

#### Scenario: NEEDS_HUMAN mid-queue stops and escalates

- **WHEN** a step reply contains NEEDS_HUMAN: with a question while the stash still holds items
- **THEN** the loop resolves escalate with reason needs-human quoting the question, and no further item is unloaded

#### Scenario: Cap bounds a runaway queue

- **WHEN** a drive-mode queue loop reaches its iteration cap with items remaining
- **THEN** the loop resolves capped and sends nothing further

### Requirement: Between-step verification is on by default and stops a broken ritual

A queue loop SHALL verify each step by default: unless the operator opts out at
arm time, after an unloaded step's turn ends the engine SHALL send a
verification prompt composed at send time from the stored verification template
and that step's text, asking whether the step's request was genuinely
accomplished. Only a verification reply whose final non-empty line contains
`STEP_VERIFIED` SHALL unload the next item. Any other verification reply — a
question, a blocker, a partial result — SHALL resolve the loop `escalate` with
stop reason `step-unverified` quoting the reply: the queue SHALL NOT unload the
next item into an unresolved step. The step text under verification SHALL be
stored on the loop record when it lands, so verification survives a restart.
When verification is opted out, no verification turn SHALL be sent.

#### Scenario: Verified step advances the queue

- **WHEN** verification is enabled and a step's verification reply ends with STEP_VERIFIED
- **THEN** the next stash item is unloaded at the following unload point

#### Scenario: Unverified step escalates instead of continuing

- **WHEN** verification is enabled and a step's verification reply does not end with STEP_VERIFIED
- **THEN** the loop resolves escalate with reason step-unverified quoting the reply, and the next item is never unloaded

#### Scenario: Verification defaults on

- **WHEN** the operator arms a queue loop without touching the verification setting
- **THEN** verification turns are sent between steps

#### Scenario: Opt-out means no verification turns

- **WHEN** the operator arms a queue loop with verification opted out and a step's turn ends
- **THEN** the next item is unloaded directly with no verification prompt in between

### Requirement: Stopping a queue is lossless and re-arm resumes it

Any queue stop SHALL leave all unsent items in the tab's stash unchanged —
escalation, cap, error, and operator disarm alike — because the stash only
loses items that actually landed. Re-arming a queue loop on the same tab SHALL resume
unloading from the stash head. This SHALL be the supported way to converse with
the agent between queue items: stop (or let verification stop), chat, re-arm.

#### Scenario: Disarm mid-queue keeps the remaining items

- **WHEN** the operator disarms a running queue loop with items still in the stash
- **THEN** the stash still holds every unsent item in order

#### Scenario: Re-arm continues where the queue left off

- **WHEN** a queue loop stopped mid-stash and the operator, after exchanging manual prompts with the agent, arms a new queue loop on the same tab
- **THEN** unloading resumes from the current stash head

### Requirement: The dock and the console arm and disclose the queue loop

The dock's unified loop control SHALL offer the queue kind beside the existing
kinds — settings (mode, cap, verification), a next-up preview, and the
remaining count; the stash strip remains the queue's editor. The autopilot
console's Loops section SHALL gain a Queue tab presenting per-agent queue
status, the same settings, and arm/disarm. Arming SHALL require a non-empty
stash, and exclusive-per-agent arming with one Disarm is unchanged. The ungated
loop status projection SHALL include the queue's progress as counts and phase
only (items remaining, items sent, verify phase); item texts, the last-sent
step text, and the verification template SHALL be disclosed only while the
operator gate is open, following the existing disclosure rule.

#### Scenario: Arm a queue from the dock

- **WHEN** the operator picks the queue kind in an agent's loop control and arms it over a non-empty stash
- **THEN** the agent's one loop slot holds the queue loop bound to that tab's stash, and the dock badge shows its typed armed state with remaining/sent progress

#### Scenario: Arming an empty stash is refused

- **WHEN** the operator attempts to arm a queue loop while the tab's stash is empty
- **THEN** the arm is rejected with a clear error and no loop is armed

#### Scenario: Gate closed discloses progress but not prompts

- **WHEN** the operator gate is closed and a client reads the loop status projection for an armed queue loop
- **THEN** the remaining and sent counts and phase are present but no item text is disclosed

### Requirement: A drive loop only judges replies newer than its last send

The engine SHALL, for a driven loop in drive mode that has sent at least once
this arming, treat the pinned session's trailing assistant message as the reply
to the last send only when its timestamp is newer than the loop's last-send
timestamp. Text that predates the send SHALL never reach the kind's decision as
the reply — in particular, a verify-phase judgment SHALL never fire against it.
Textual (snippet) comparison SHALL not be used to decide reply freshness.

#### Scenario: Stale step reply is not judged as the verification verdict

- **WHEN** a queue loop's verification send completes while the transcript's trailing assistant message is still the previous step's reply
- **THEN** the loop does not escalate `step-unverified` against that stale text; it proceeds via the witnessed reply or the no-reply path

### Requirement: The engine judges the streamed reply when the transcript loses it

The engine SHALL, when the transcript holds no assistant reply newer than the
loop's last send but the completed builder-lane run streamed visible reply
text after that send, use that streamed text as the agent's reply for the kind's
decision, logging that the transcript fallback was taken. The durable
transcript SHALL remain the preferred source whenever it holds a fresh reply.

#### Scenario: Unpersisted STEP_VERIFIED still advances the queue

- **WHEN** a queue verification run streams a reply ending `STEP_VERIFIED` but the CLI never writes it to the transcript
- **THEN** the loop treats the step as verified and unloads the next queue item instead of stalling or escalating

#### Scenario: Unpersisted failed verification escalates with the real text

- **WHEN** a queue verification run streams a reply that does not end `STEP_VERIFIED` and the CLI never persists it
- **THEN** the loop escalates `step-unverified` quoting the streamed verification reply, not older text

### Requirement: A missing reply re-sends the awaited prompt, never a judgment

The kind SHALL decide with no reply text when neither the transcript nor the
run buffer holds a reply newer than the last send. A queue or goal loop in
its verify phase SHALL then re-propose its verification prompt and remain in
the verify phase. The no-reply ladder is unchanged: one grace tick, bounded
retries that count as normal sends, and after the configured consecutive
misses the loop SHALL resolve `error` with stop reason `no-reply`.

#### Scenario: Reply-less verification run retries the verification prompt

- **WHEN** a verification send's run completes with no reply visible in either source
- **THEN** the next decide re-sends the verification prompt (verify phase kept) instead of judging absent text

#### Scenario: Persistent reply loss ends honestly

- **WHEN** consecutive runs beyond the retry bound produce no witnessed or persisted reply
- **THEN** the loop resolves `error` / `no-reply` rather than escalating with quoted stale text

### Requirement: Synthetic transcript repairs are not agent replies

The loop's pinned transcript read SHALL skip assistant messages whose model is
the CLI's synthetic marker (`<synthetic>`, e.g. the "No response requested."
resume repair) when selecting the trailing assistant message, so a repair line
SHALL never be judged as a reply regardless of its timestamp.

#### Scenario: Repair line cannot fail a verification

- **WHEN** a resume writes a synthetic "No response requested." line after a verification send whose real reply was only streamed
- **THEN** the loop judges the streamed verification reply and the synthetic line is ignored

### Requirement: A reply-less run does not stall a drive loop

The engine SHALL treat a drive-mode send whose run has completed while the
loop's pinned session still shows the same trailing assistant message the send
was issued against as having produced no reply: after one engine tick of grace
(to absorb transcript flush lag), it SHALL clear the drive dedup guard and
let the loop's kind decide again, surfacing the interim state in the
agent's autopilot status rather than idling silently. Each retry send SHALL
bump the iteration counter as a normal send, so the iteration cap bounds
retries.

#### Scenario: Empty completion retries instead of stalling

- **WHEN** a goal loop's send completes with no new assistant message in the pinned session
- **THEN** within two engine ticks the loop sends again as the next iteration instead of idling until disarm

#### Scenario: Errored run without a reply reaches the error stop

- **WHEN** a drive send's run ends in status error without writing an assistant reply
- **THEN** the guard is cleared and the kind's decision runs (instead of the guard swallowing every tick before it)

### Requirement: Consecutive reply-less runs stop the loop

The engine SHALL count consecutive reply-less runs per drive loop and, after
the third, resolve the loop with status `error` and stop reason `no-reply`
instead of retrying further. A run that does produce a new assistant reply
SHALL reset the counter, and re-arming SHALL clear both the counter and the
grace marker along with the other per-repo dedup guards.

#### Scenario: Third miss stops with no-reply

- **WHEN** three consecutive sends of a drive loop each complete without a new assistant reply
- **THEN** the loop resolves with status error and stop reason no-reply, visible in the loop readout

#### Scenario: A real reply resets the miss count

- **WHEN** a send finally produces a new assistant reply after an earlier miss
- **THEN** the miss counter resets and the loop continues judging replies normally

### Requirement: A loop send publishes its prompt into the run's event stream

Before starting the CLI for a drive-mode send, the engine SHALL emit the full
prompt text as a user-message event into the claimed run's seq-numbered event
buffer, so that it is broadcast to attached chat clients and replayed to
clients that attach after the send (same `?after=N` replay contract as every
other run event).

#### Scenario: Prompt precedes reply in the buffer

- **WHEN** a loop send claims the run slot and starts the CLI
- **THEN** the run's event buffer contains the user-message event with the sent prompt at a lower seq than any of the CLI's reply events

#### Scenario: Late attach replays the prompt

- **WHEN** a client attaches to the run stream after the send with `after=0`
- **THEN** the replay delivers the user-message event before the reply events

### Requirement: Pre-arm replies never resolve a driven loop

For DRIVEN loop kinds (recipe, goal), the engine SHALL treat an agent's
trailing assistant message as loop evidence only if it was produced at or
after the loop instance's arm time. When the trailing message predates the
arming, the kind SHALL decide as though the agent had not yet spoken — the
NEEDS_HUMAN marker, deny-list terms, the sentinel, and a pre-arm run error
in that stale context SHALL NOT stop or advance the loop — so a freshly
armed drive-mode loop's first action is sending its stored prompt. The
suggestion kind's act-on-current-trailing-message behavior is unchanged.

#### Scenario: Arming over a deploy conversation still sends

- **WHEN** a goal loop is armed in drive mode while the agent's last reply (from an earlier human conversation) contains a deny-listed term such as "deploy"
- **THEN** the loop does not escalate on that stale reply and its next tick sends the stored work prompt as iteration 1

#### Scenario: Stale sentinel does not complete a fresh loop

- **WHEN** a recipe loop is armed while the agent's trailing reply from before arming contains the loop's sentinel text
- **THEN** the loop does not resolve done and instead sends its stored prompt

#### Scenario: Fresh replies are still judged

- **WHEN** a driven loop has sent its prompt and the agent's reply produced after arming contains a deny-listed term
- **THEN** the safety ladder applies and the loop escalates with the deny-list stop reason

### Requirement: Loop parameters rehydrate from the persisted record

The dock loop control SHALL seed its parameter fields (goal text, iteration
cap, mode) from the agent's persisted loop record when the popover opens,
using the operator-gated detail read so prompt-text disclosure rules are
unchanged. A loop that resolved or survived a harness restart SHALL show the
parameters it was armed with rather than empty fields.

#### Scenario: Goal survives a restart in the UI

- **WHEN** a goal loop was armed, the harness restarts, and the user opens the agent's loop popover with the operator gate open
- **THEN** the goal textarea contains the stored goal and the cap field the stored iteration cap

#### Scenario: Gate closed still discloses nothing

- **WHEN** the operator gate is closed and the popover opens
- **THEN** the parameter fields stay unseeded and the gate-closed hint renders where prompt text would appear

### Requirement: Loops are armed only by explicit user action

The system SHALL NOT arm any loop instance except in direct response to a
user arming action. Startup migration of legacy armed-repo configuration
SHALL clear the legacy list without creating active loop instances, logging
what was dropped. A harness restart SHALL resume only loop instances that
were armed by the user and still active.

#### Scenario: Legacy armed repos do not resurrect as loops

- **WHEN** the harness starts with legacy autopilot ArmedRepoIds present and no active loop instances
- **THEN** no loop instance becomes active, and the legacy list is cleared with a log line noting the drop

### Requirement: Loop debug bundle read

The system SHALL provide a session-authenticated, non-operator-gated read
that, for one agent (repo), assembles a single self-describing debug bundle:
the operator gate and kill-switch state, the repo's identity and path, the
agent's full loop record, a live engine snapshot (busy flag, current
decision and hold reason, the per-repo dedup guards, repo-filtered intercept
and log entries), repo-filtered audit entries, the absolute on-disk paths of
the loop store, audit log, gate file, and the repo's transcript directory,
and an agent-facing hint naming the engine source files. While the operator
gate is closed, every prompt-bearing field in the bundle (loop prompts, goal
text, pending prompt, message snippets, deny list, audit prompt text) SHALL
be replaced by an explicit redaction marker that points at the on-disk files
— the closed-gate disclosure surface stays no wider than the status
projection.

#### Scenario: Bundle for an armed loop with the gate open

- **WHEN** the operator gate is open and the debug read is requested for a repo with a loop record
- **THEN** the bundle contains the full loop record including its prompts, the engine snapshot with its dedup guards, and the on-disk file paths

#### Scenario: Gate closed redacts prompt text but not structure

- **WHEN** the operator gate is closed and the debug read is requested
- **THEN** the response is still 200 with gate state, loop status fields, and file paths, and every prompt-bearing field carries the redaction marker instead of its text

#### Scenario: Repo without a loop is still debuggable

- **WHEN** the debug read is requested for a repo with no loop record
- **THEN** the bundle reports the null loop alongside the gate state and file paths instead of failing

### Requirement: Suggestion-arming status is readable without the operator gate

The system SHALL include in the read-only loop-status projection the
suggestion-based loop's arming status: which repos are armed, whether
auto-advance is on, and whether the engine's kill switch is on. This SHALL
remain status-only disclosure — no prompts, no confidence threshold, no
deny-list, and no action surface — and arming SHALL stay behind the operator
gate.

#### Scenario: Armed marker survives the gate closing

- **WHEN** a repo is suggestion-armed and the operator gate has since been closed
- **THEN** an authenticated client can still read that the repo is suggestion-armed and whether auto-advance is on

#### Scenario: Disclosure stays status-only

- **WHEN** an authenticated client reads the projection while the gate is closed
- **THEN** the response contains no prompt texts, threshold, or deny-list entries

### Requirement: Queue loop sends are durably auditable with the exact sent text

Every driven send's durable audit entry SHALL carry the loop kind and the
phase (work or verification) it was sent in, and — when the sent text differs
from the raw stored text — the exact composed text handed to the CLI. The
system SHALL offer an operator-gated Queue audit view on the dock loop card
listing the repo's queue-kind sends from the durable ledger, newest first,
surviving re-arms (unlike the per-arm sent-history), with each row expandable
to the exact sent text. Audit entries recorded before this capability SHALL
load unchanged and SHALL be excluded from the queue-filtered view rather than
misattributed.

#### Scenario: A queue send is attributed in the ledger

- **WHEN** an armed drive-mode queue loop sends a stash item and then its step-verification prompt
- **THEN** the ledger gains two entries attributed to the queue kind — one work-phase with the item's raw text, one verify-phase — each carrying the exact composed text that was sent

#### Scenario: The Queue audit survives a re-arm

- **WHEN** the operator disarms and re-arms the queue loop after several sends and opens the Queue audit view with the gate open
- **THEN** the sends from before the re-arm are still listed, even though the per-arm sent-history has reset

#### Scenario: Exact text is disclosed only behind the gate

- **WHEN** the operator gate is closed and a client requests the Queue audit view
- **THEN** the request is refused like other prompt disclosures, while the ungated audit slices keep showing only the raw stored text

#### Scenario: Pre-amendment entries stay honest

- **WHEN** the Queue audit view renders over a ledger containing entries recorded before kind attribution existed
- **THEN** those entries do not appear in the queue-filtered list, and the raw ledger remains the place to read them
