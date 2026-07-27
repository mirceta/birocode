# unify-loop-types — tasks

## 1. Backend: loop kinds + goal state machine

- [x] 1.1 `LoopConfigStore`: add `Kind` ("recipe" | "goal", default "recipe" on
  load), `Goal`, `VerifyPrompt`, `Phase` ("work" | "verify") to Entry +
  `LoopState`; `StartGoal(repoId, goal, cap)` composing and storing the work +
  verify prompts from template constants; `SetPhase`; keep old `Start` as the
  recipe path stamping kind.
- [x] 1.2 Goal prompt templates: work + verify template constants (with the
  `GOAL_VERIFIED` contract) next to `ContractParagraph`, exposed for the
  detail endpoint.
- [x] 1.3 `AutopilotService.HandleLoop`: fork sentinel handling by kind —
  recipe unchanged; goal work-phase done-claim → send stored verify prompt +
  phase=verify (audited, counts an iteration, capped first); goal verify-phase
  `GOAL_VERIFIED` → resolve done (reason "verified"); otherwise phase→work +
  resend work prompt. NEEDS_HUMAN/deny/cap order untouched.
- [x] 1.4 `AutopilotArming` coordinator (new service + DI): `ArmSuggestion`,
  `ArmRecipeLoop`, `ArmGoalLoop`, `Disarm` — each leaves at most one mode
  armed per repo; loop stops recorded as user-stopped with a
  displaced-by-arming detail.
- [x] 1.5 `LoopRecipeStore`: rename seeds to "Drive the OpenSpec change" /
  "Finish and ship the change"; one-time migration of planted seeds still
  byte-identical to the old name+prompt.

## 2. API

- [x] 2.1 `AutopilotController` loop action: `start` accepts `kind` ("goal"
  with `goal` text, otherwise recipe path); all arm/stop actions route through
  `AutopilotArming`; suggestion arming in `config` routes through it too.
- [x] 2.2 New gated `GET /api/autopilot/loops/detail`: full loop records
  (prompts, goal, phase), full recipe bodies, goal templates.
- [x] 2.3 Ungated `GET /api/autopilot/loops`: add `kind` + `phase` per loop
  (still no prompt/goal text).

## 3. Frontend: unified dock control

- [x] 3.1 Rewrite `DockLoopControl.jsx`: single control — armed-state header
  (mode, status, one Disarm), type picker 💡/📋/🎯 with one-line descriptions,
  per-type parameter panel (suggestion state/arm; recipe picker + cap; goal
  textarea + cap), replacement notice when another mode is armed, gate-closed
  hint preserved.
- [x] 3.2 Prompt inspection: on-open fetch of the gated detail endpoint;
  expandable byte-identical previews (recipe prompt; composed goal work +
  verify prompts via templates); 403 → gate hint in place of prompts.
- [x] 3.3 Badge: single armed-mode badge typed by kind (💡 / 📋 n/cap /
  🎯 n/cap with a verifying indication), terminal states + stop detail as
  before; wire `kind`/`phase` from the projection through `Dashboard.jsx` /
  `PinnedAgent.jsx`.
- [x] 3.4 Console: `LoopsView.jsx` renames (recipe loop / goal loop), show
  kind + phase + goal text (gated view); `AutopilotOverviewView.jsx` copy
  matches the new taxonomy; i18n keys + CSS for the picker and inspection.

## 4. Docs + honesty

- [x] 4.1 `docs/loop-driven-agent-convention.md`: add the goal-loop
  verification contract (`GOAL_VERIFIED` in a verification turn).
- [x] 4.2 Understanding app: three-loop-type model, XOR arming, unified dock
  control, verification flow.

## 6. Revision 2 — interface remodel (one interface, one store, one mode axis)

- [x] 6.1 `ILoop` + `LoopContext`/`LoopDecision`; `SuggestionLoop`, `RecipeLoop`,
  `GoalLoop` (driven kinds share the error → NEEDS_HUMAN → deny ladder in a
  `DrivenLoop` base); DI-registered, engine dispatches by kind.
- [x] 6.2 `LoopConfigStore` = the one per-agent loop registry: kind
  `suggestion|recipe|goal`, common `Mode` (suggest|drive), `PendingPrompt`,
  `ArmSuggestion`/`SetMode`/`SetPending`; arming replaces the slot (displaced
  active instance resolved user-stopped). Delete `AutopilotArming`.
- [x] 6.3 One-time drain of `autopilot.json` `ArmedRepoIds`+`AutoAdvance` into
  suggestion instances; `AutopilotConfigStore` keeps only kill switch,
  threshold, deny list.
- [x] 6.4 Engine rewrite: unified per-repo flow (instance → Decide → cap →
  mode dispatch: drive=send, suggest=pending), shared dedup guard; intercepts
  + agent states preserved for the suggestion kind.
- [x] 6.5 API: loop action arms any kind incl. suggestion + `mode` field +
  set-mode action; config keeps global settings only (legacy armed mapping
  retained); unified `/loops` projection (kind, mode, pendingPrompt while
  gate open, no more top-level suggestion fields).
- [x] 6.6 Dock control rewrite: typed header (type + armed + mode), expanded
  params + mode toggle + pending-suggestion chip that pre-fills the dock
  chat's composer (`setDraft`); Dashboard/PinnedAgent wiring; console views
  drop the global auto-advance story; i18n + CSS.
- [x] 6.7 Understanding app + docs honesty pass for the remodel.

## 5. Verify

- [x] 5.1 Backend e2e on an isolated port: goal branch (done-claim → verify
  send → `GOAL_VERIFIED` → done-verified), failed-verify branch (reply
  without token → work resend), XOR branch (arm loop displaces suggestion and
  vice versa; one disarm clears).
- [x] 5.2 Playwright: dock popover type picker, per-type params, inspection
  content, disarm; badge typing. Screenshot.
- [x] 5.3 `openspec validate unify-loop-types --strict` passes; builds green.
