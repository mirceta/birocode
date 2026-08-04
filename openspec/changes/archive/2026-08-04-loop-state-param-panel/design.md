# Design: loop-state-param-panel

## D1 — One machine-metadata module drives every surface

`client/src/components/dashboard/loopMachines.js` is the single frontend
description of the two phased machines. Per kind it exports:

- `sections`: ordered parameter sections `[loopwide, work, verify]` with i18n
  keys for the section name (`WORKING_STATE`, `VERIFICATION_STATE` — the
  operator-facing state names) and its one-line dynamics description;
- `badges`: the literal sentinel token each state expects (`work: 'LOOP_DONE'`
  for goal; `verify: 'GOAL_VERIFIED'` / `'STEP_VERIFIED'`) — literal tokens,
  not translated. Queue `work` has **no badge** (its exit trigger is the step's
  turn finishing) and the metadata says so explicitly;
- `transitions`: per state, `{ preKey, to }` pairs where `preKey` is the i18n
  condition text and `to` names a state or terminal (`work`, `verify`,
  `done-verified`, `done-drained`, `escalate`) so the renderer can draw the
  arrow and a color-coded state reference;
- `strip`: the live-phase chip order for the armed strip (`work → verify` for
  goal, `work → verify-owed → verify` for queue) plus terminal pills mapped
  from `status`/`stopReason`, and `PHASE_KEY` for the collapsed summary word.

Rationale: the sections, the strip, and the summary word must never disagree
with each other; they all read this one module. The module mirrors
`GoalLoop.cs` / `QueueLoop.cs` — any engine change edits it in the same PR.

## D2 — Where every existing control lands

The restructure moves controls; it deletes none. Mapping (queue):

| Today (flat) | New home |
|---|---|
| binding line + fires note | LOOP-WIDE |
| verification toggle + hint | LOOP-WIDE |
| deny-list chips / effective list | LOOP-WIDE |
| turn cap (arm row) | LOOP-WIDE (phased kinds; recipe keeps the arm row cap) |
| unload-order preview | WORKING_STATE (it IS what this state sends) |
| sent history (armed) | WORKING_STATE |
| verification template (was behind Show prompts) | VERIFICATION_STATE |
| last step sent (armed) | VERIFICATION_STATE ("what verification checks") |

Goal: goal textarea (arming) / stored goal (armed) and cap in LOOP-WIDE; work
template in WORKING_STATE; verification template in VERIFICATION_STATE. The
Arm/Disarm/Resume rows, pending/decision readouts, debug-copy, and the
suggestion/recipe kinds are untouched; "Show prompts" survives for recipe only.

## D3 — Sections render in BOTH arming and armed views

Today the armed view hides parameters entirely ("an armed instance keeps its
own stored copies") — the incompleteness complaint. Now the same sections
render both ways: arming shows editable loop-wide controls and template
previews composed from the gated detail; armed shows the instance's stored
copies read-only (goal, effective deny list, stored `prompt`/`verifyPrompt`,
sent history, last step) with live state highlight. An empty queue stash keeps
its teaching hint, rendered inside WORKING_STATE rather than suppressing the
sections — the machine is visible before the first stash.

## D4 — Badges and templates are shown as parameters, not yet editable

The "agent emits badge" box renders the sentinel as a distinct control-styled
parameter, and templates render as read-only parameter boxes. Both are
compile-time constants server-side (`LoopConfigStore`), so true editability is
a backend feature (per-loop template storage + engine use) deliberately out of
scope here. The visual grammar (a control, not prose) is chosen so the later
editability change only swaps read-only for editable.

## D5 — Gating stays exactly two-tier

Section skeletons, state names, badges, and transition lines are static markup
— always rendered, no new endpoint. Template text and stored prompts need the
gated detail (fetched on popover open, as today): gate closed renders the
existing gate hint inside the affected parameter box only. Live phase/status
come from the ungated projection, so the highlight and strip stay honest after
the gate closes.

## D6 — `verify-owed` folds into VERIFICATION_STATE's entry

The queue engine's `verify-owed` phase (step landed, check not yet sent) owns
no parameters, so it gets no section; it appears as the transition line
"the step's turn finishes → transition into VERIFICATION_STATE" and lights the
VERIFICATION_STATE section while active. The armed strip still shows it as its
own chip (`work → verify owed → verifying`) — the strip tracks live phases,
the sections group parameters.

## D7 — Controls-only requirement amended, not violated

The dynamics lines ("when STEP_VERIFIED is emitted → …") state the consequence
of the parameters around them — the same category as the existing verification
hint and replace-warning, i.e. consequence disclosures, which the
`dock-loop-controls-declutter` requirement explicitly exempts. The requirement
text is MODIFIED to name per-state dynamics lines in that exemption so the two
requirements cannot be read as conflicting. Kind descriptions and mode
explanations stay banished to the console Loops tab.
