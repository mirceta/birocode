# Tasks: loop-state-param-panel

## 1. Machine metadata + shared pieces

- [x] 1.1 Create `client/src/components/dashboard/loopMachines.js`: per phased
      kind the section list, badge tokens (queue `work` explicitly badge-less),
      transition data `{preKey, to}`, strip chip order, terminal pill mapping,
      and `PHASE_KEY` — mirroring `GoalLoop.cs` / `QueueLoop.cs` (design D1)
- [x] 1.2 Create `client/src/components/dashboard/LoopStateStrip.jsx`: live
      phase chips in flow order with the current phase lit (`verify-owed`
      distinct), terminal instances lighting the matching outcome pill, unknown
      phase rendered raw
- [x] 1.3 Create `client/src/components/dashboard/DockLoopSections.jsx`:
      presentational `StateSection` (header: state name, dynamics one-liner,
      `● now` pill), `BadgeBox` ("agent emits badge:" / "exit trigger:"),
      `TransitionLine` (condition → color-coded state/terminal ref), and
      `ParamBox` (labeled read-only template box with gate-closed hint)

## 2. Restructure the goal/queue parameter region

- [x] 2.1 `DockLoopControl.jsx`: for `selected === 'goal' | 'queue'`, replace
      the flat parameter block AND the "Show prompts" inspection with the
      state-sectioned panel; keep recipe/suggestion paths and the arm/disarm/
      resume/pending/decision/debug rows untouched (design D2)
- [x] 2.2 LOOP-WIDE section: goal textarea (arming) / stored goal (armed),
      turn cap moved from the arm row for phased kinds, queue binding line +
      fires note, verification toggle + hint, deny chips (arming) / effective
      deny list (armed)
- [x] 2.3 WORKING_STATE section: goal work-template preview (`{0}` filled from
      the typed/stored goal); queue unload-order list (live stash), sent
      history when armed, empty-stash hint inside the section; exit-trigger
      box (goal: badge `LOOP_DONE`; queue: turn-finishes, no badge) and
      transition lines incl. the verify-off stay-in-work variant (design D6)
- [x] 2.4 VERIFICATION_STATE section: verification template box, queue last
      step sent, badge box (`GOAL_VERIFIED` / `STEP_VERIFIED`), transition
      lines covering return-to-work, `DONE · VERIFIED` / `DONE · DRAINED`,
      and `ESCALATE · STEP-UNVERIFIED`
- [x] 2.5 Armed view renders the same sections read-only from the instance's
      stored copies (`prompt`, `verifyPrompt`, `denyList`, `lastStepText`,
      `queueSentTexts`) — no more parameter-less armed popover (design D3)

## 3. The machine, lit

- [x] 3.1 Armed goal/queue: current `phase` highlights its section (`work` →
      WORKING_STATE; `verify-owed`/`verify` → VERIFICATION_STATE) with the
      `● now` pill; terminal status stops highlighting sections
- [x] 3.2 Armed popover header gains `LoopStateStrip`; collapsed dock summary
      word becomes phase-accurate (`work` silent, `verify owed` / `verifying`
      distinct, unknown phase raw)

## 4. Styling

- [x] 4.1 `dashboard.css`: section cards with per-state accent borders, state
      name typography, `● now` pill, dashed badge box, transition lines with
      color-coded state refs, strip chips + terminal pills — orderly in the
      dock's dark palette and at phone width

## 5. i18n

- [x] 5.1 `en.json`: section names, dynamics one-liners, badge/exit labels,
      transition condition strings, strip phase words (namespace
      `dashboard.loopSm.*`)
- [x] 5.2 `tr.json`: full Turkish translations of the same keys (sentinel
      tokens stay literal)

## 6. Validation

- [x] 6.1 `openspec validate --strict loop-state-param-panel` passes
- [x] 6.2 `npm --prefix client run build` passes
- [x] 6.3 Walk the four kinds in the popover markup-wise: recipe/suggestion
      unchanged; goal/queue show LOOP-WIDE → WORKING_STATE →
      VERIFICATION_STATE with badges + transitions; gate-closed shows hints in
      template boxes only
