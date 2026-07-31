## 1. Operator stop attribution (D1)

- [ ] 1.1 `RunSessionService`: add `StopRequested` flag set on the stop path before `Cts.Cancel()`; finalize a cancelled run as new status `"stopped"` (`_sawDone ? done : (StopRequested ? stopped : error)`); update the status doc comment
- [ ] 1.2 Sweep every `run.Status` reader (`AutopilotService`, chat/dock projections, event feed) for the `done|error` assumption and handle `"stopped"` explicitly
- [ ] 1.3 `LoopContext`: add `RunStopped`; engine populates it from the run record alongside `RunErrored`
- [ ] 1.4 `DrivenLoop.Decide`: check `RunStopped` before `RunErrored` → `Stop("stopped", "by-operator", ...)`; remainder stays stashed (no consume happened)

## 2. Deny-list: whole-word + per-arm (D2)

- [ ] 2.1 `DrivenLoop`: replace the whole-reply `Contains` deny check with word-boundary matching (case-insensitive, alphanumeric-edge boundaries so multi-word terms like `reset --hard` still work); keep the named-term escalate detail
- [ ] 2.2 `LoopConfigStore.LoopState`: add nullable `DenyList`; arm payloads (dock + console arm endpoints in `AutopilotController`) accept an optional trimmed list, stored on the instance; null → global default
- [ ] 2.3 Engine (`AutopilotService`): pass the instance's effective deny-list into `LoopContext`; include the per-arm list in the gated detail projection
- [ ] 2.4 Arm forms (`DockLoopControl.jsx`, `LoopsView.jsx` Queue tab): render the default deny terms as removable chips on the queue arm settings; send the trimmed list; show the effective list in the gated inspection pane; i18n en/tr

## 3. Resume + phase reset (D3, D4)

- [ ] 3.1 `LoopConfigStore`: `Resume(repoId)` mutation — same instance re-activated (`Active`, `Status looping`, fresh `ArmedAt`, `IterationsDone = 0`, stop reason/detail cleared), `QueueSent`/`QueueSentTexts` preserved; `Arm` and `Resume` both clear `Phase` + `LastStepText`
- [ ] 3.2 `AutopilotController`: gated `POST /api/autopilot/loop/resume` — valid only for an inactive queue instance whose bound tab exists with a non-empty stash; audit `resume` with remaining count
- [ ] 3.3 Frontend: Resume button on the dock popover and console Queue tab wherever a stopped-with-remainder queue instance renders (eligibility from the projection); i18n en/tr
- [ ] 3.4 Verify against today's real stranded state: the busi-dec instance (`escalate / verify-owed`, 7 items) resumes cleanly from the head with no verification of the dead drive's step

## 4. Binding disclosure (D5)

- [ ] 4.1 Arm surfaces: binding line ("drives <repo> · tab <label> · N queued" + fires-when-free note) on the dock queue section and console Queue arm form
- [ ] 4.2 Armed surfaces: repeat the binding on the dock popover status and console row; echo `QueueTabId` in the gated detail if the client needs it

## 5. Validation + docs

- [ ] 5.1 Tests: whole-word deny matcher (pushed/push, prod/product, reset --hard), operator-stop attribution, resume eligibility + state reset, per-arm deny-list fallthrough to default
- [ ] 5.2 `docs/loop-driven-agent-convention.md`: "what stops a loop" gains operator-stop; deny-list note updated to whole-word matching
- [ ] 5.3 Understanding app + autopilot explainer honesty pass (queue card copy: resume, per-arm deny, binding line)
- [ ] 5.4 `openspec validate advance-queue-loop --strict`; build backend + frontend; headless Playwright pass per docs/claude-web/browser-testing.md on the arm form, Resume, and deny chips
- [ ] 5.5 End-to-end rehearsal of the busi-dec scenario on :5200 (isolated preview recipe): arm a queue on a commit-and-push repo with "push" trimmed, drive ≥2 items through STEP_VERIFIED, operator-stop mid-step, resume, drain
