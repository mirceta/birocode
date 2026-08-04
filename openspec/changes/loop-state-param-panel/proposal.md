# Proposal: loop-state-param-panel

## Why

The dock loop popover's parameter subsection for the phased kinds (🎯 goal,
🗒️ queue) is incomplete and unordered: parameters render as a flat list, the
prompt templates hide behind a "Show prompts" inspection toggle, the sentinel
badges the agent is expected to emit (`LOOP_DONE`, `GOAL_VERIFIED`,
`STEP_VERIFIED`) appear only buried inside template prose, and what the loop
system *does* when a badge is emitted — the state transition — is knowable only
by reading the C# engine. The loops ARE state machines; the parameter panel
should be structured as one: parameters grouped into sections named after the
states, each section stating its dynamics explicitly.

This supersedes the intent of the parked `loop-state-machine-transparency`
change (branch `feat/loop-state-machines`, never merged): that attempt built
console reference diagrams and a status strip but left the parameter panel —
the actual target — untouched.

## What Changes

- **The parameter subsection becomes the state machine.** For goal and queue,
  the popover's parameter area is restructured into ordered sections:
  - **LOOP-WIDE** — parameters belonging to no single state: goal text, turn
    cap, queue binding line, per-step verification toggle, deny-list chips.
  - **WORKING_STATE** — what the loop sends in that state (goal work-prompt
    template; the queue's unload-order list and sent history), the state's exit
    trigger, and explicit transition lines.
  - **VERIFICATION_STATE** — the verification prompt template, the last step
    under check (queue), an **"agent emits badge"** control showing the
    expected sentinel as a first-class parameter, and explicit "when the badge
    is emitted → transition into …" lines covering every outcome (including
    terminals `DONE · VERIFIED`, `DONE · DRAINED`, `ESCALATE ·
    STEP-UNVERIFIED`).
- **Prompts stop being an inspection afterthought.** Templates render inside
  their state sections as read-only parameter boxes (gated detail as today; a
  closed gate shows the gate hint in place). The "Show prompts" toggle remains
  only for the recipe kind. Badges and templates are *displayed as* parameters
  this release — making them editable is a separate backend change.
- **The machine, lit.** While the loop is armed, the current state's section is
  highlighted (`phase` from the ungated projection; `verify-owed` folds into
  VERIFICATION_STATE), the armed header shows a compact state strip with the
  current phase lit (`verify-owed` distinct), and the collapsed dock summary's
  phase word is state-accurate.
- **i18n**: new section/dynamics strings in `en.json` + `tr.json`.
- **No backend changes.** Templates come from the existing gated
  `GET /api/autopilot/loops/detail` (`goalTemplates`, `queueVerifyTemplate`);
  phase/status from the ungated loops projection.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `autopilot-loops`: the dock SHALL present phased loop parameters as
  state-machine sections (states as named sections owning their parameters,
  expected badge as an explicit control, transitions as explicit dynamics
  lines) and SHALL surface the armed loop's live state on the same panel; the
  controls-only popover requirement is amended so per-state dynamics lines
  count as consequence disclosures, not relocated reference prose.

## Impact

- **Frontend only**:
  `client/src/components/dashboard/DockLoopControl.jsx` (parameter region
  restructure), new `client/src/components/dashboard/DockLoopSections.jsx`,
  `client/src/components/dashboard/loopMachines.js`,
  `client/src/components/dashboard/LoopStateStrip.jsx`,
  `client/src/pages/dashboard.css`, `client/src/i18n/en.json`,
  `client/src/i18n/tr.json`.
- **Backend/API**: none.
- **Specs**: delta on `openspec/specs/autopilot-loops/spec.md` (two ADDED
  requirements, one MODIFIED).
