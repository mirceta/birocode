## 1. Operator stop attribution (D1)

- [x] 1.1 `RunSessionService`: add `StopRequested` flag set on the stop path before `Cts.Cancel()`; finalize a cancelled run as new status `"stopped"` (`_sawDone ? done : (StopRequested ? stopped : error)`); update the status doc comment
- [x] 1.2 Sweep every `run.Status` reader (`AutopilotService`, chat/dock projections, event feed) for the `done|error` assumption and handle `"stopped"` explicitly
- [x] 1.3 `LoopContext`: add `RunStopped`; engine populates it from the run record alongside `RunErrored`
- [x] 1.4 `DrivenLoop.Decide`: check `RunStopped` before `RunErrored` → `Stop("stopped", "by-operator", ...)`; remainder stays stashed (no consume happened)

## 2. Deny-list: whole-word + per-arm (D2)

- [x] 2.1 `DrivenLoop`: replace the whole-reply `Contains` deny check with word-boundary matching (reused `PromptClassifier.ContainsWholeWord` — the routine fence's matcher); keep the named-term escalate detail
- [x] 2.2 `LoopConfigStore.LoopState`: add nullable `DenyList`; arm payloads (dock + console arm endpoints in `AutopilotController`) accept an optional trimmed list, stored on the instance; null → global default
- [x] 2.3 Engine (`AutopilotService`): pass the instance's effective deny-list into `LoopContext`; include the per-arm list in the gated detail projection (LoopState serializes it; debug bundle discloses it gate-aware)
- [x] 2.4 Arm forms (`DockLoopControl.jsx`, `LoopsView.jsx` Queue tab): render the default deny terms as removable chips on the queue arm settings; send the trimmed list; show the effective list in the gated inspection pane; i18n en/tr

## 3. Resume + phase reset (D3, D4)

- [x] 3.1 `LoopConfigStore`: `Resume(repoId)` mutation — same instance re-activated (`Active`, `Status looping`, fresh `ArmedAt`, `IterationsDone = 0`, stop reason/detail cleared), `QueueSent`/`QueueSentTexts` preserved; `Arm` and `Resume` both clear `Phase` + `LastStepText`
- [x] 3.2 `AutopilotController`: gated resume — implemented as `action: "resume"` on the existing `POST /api/autopilot/loop` (consistent with the one-endpoint action switch); valid only for an inactive queue instance whose bound tab exists with a non-empty stash; audit `resume` with remaining count
- [x] 3.3 Frontend: Resume button on the dock popover and console Queue tab wherever a stopped-with-remainder queue instance renders (eligibility from the projection); i18n en/tr
- [x] 3.4 Verify against today's real stranded state: on an isolated :5200 instance seeded with the LIVE loops.json + dock.json, the busi-dec instance (`escalate / verify-owed`) resumed to `looping / work` with iterations reset, sent-history kept, audit `resume · 1 item(s) remaining`; the drained harness-tab instance was correctly refused (400 stash empty)

## 4. Binding disclosure (D5)

- [x] 4.1 Arm surfaces: binding line ("drives <repo> · N queued" + fires-when-free note; dock tabs carry no separate label — repo name IS the tab identity) on the dock queue section and console Queue arm form
- [x] 4.2 Armed surfaces: repeat the binding on the dock popover status + collapsed row and console row; `QueueTabId` already in gated detail (LoopState serializes it), per-arm denyList added to the ungated projection gate-aware

## 5. Validation + docs

- [x] 5.1 Tests: whole-word deny matcher (pushed/push, prod/product, reset --hard), operator-stop attribution, resume eligibility + state reset, per-arm deny-list fallthrough to default — 12 new xunit cases, 47/47 green
- [x] 5.2 `docs/loop-driven-agent-convention.md`: "what stops a loop" gains operator-stop; deny-list note updated to whole-word matching + per-arm trim + resume
- [x] 5.3 Understanding app + autopilot explainer honesty pass (queue card copy: resume, per-arm deny, binding line)
- [x] 5.4 `openspec validate advance-queue-loop --strict`; build backend + frontend; headless Playwright pass per docs/claude-web/browser-testing.md on the arm form, Resume, and deny chips — all green (binding line, fires-when-free note, per-arm chip drop + trimmed-terms note, dock Resume row, console binding/chips/Resume; screenshots taken)
- [x] 5.5 End-to-end rehearsal of the busi-dec scenario on :5200 (isolated preview recipe, scratch repo `qloop-lab` with commit-and-push CLAUDE.md + bare local origin, "push" trimmed per-arm): item 1 drove through STEP_VERIFIED; operator-stop mid-item-2 resolved `stopped · by-operator` with remainder kept; Resume drove the remainder to `done · drained` ("queue: 3 prompt(s) completed"); commits confirmed in the bare origin. Note: per the resume-from-stash-head spec, the mid-run-stopped item was consumed, not replayed — re-queueing it is the operator's call
