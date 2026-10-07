## 1. Build

- [x] 1.1 `ArchGoalPlans.cs` (pure): states, kinds, derive, parse (steps + evidence), find,
      mark (one-active, relay-loop counter), block on human / clear, carry over, edit,
      the work / verify / summary words, views.
- [x] 1.2 `ArchStateStore`: `GoalPlan` / `GoalPlanDerived` / `GoalContinues` on the record,
      `StartGoal(…, plan, derived, continues)`, `SetGoalPlan`; old files load with defaults.
- [x] 1.3 `ArchAgentService.Goals.cs`: plan on the goal view, start with steps / derived /
      continuation, `MarkStep` / `EditGoalPlan` (owner rule for tool callers), `AnswerGoal`,
      `ContinueGoal`, `DecorateDrivenPrompt` by phase, `OnDrivenResolved` holds on
      NEEDS_HUMAN, `ReconcileGoals` respects the hold, `ResumeHeldGoal`, summary from the plan.
- [x] 1.4 `LoopConfigStore.ResumeGoal`; `ResumeLoopIfStopped` routes a goal conversation to
      the hold resume; `AutopilotService` passes the send phase and skips the standing-loop
      restore when the goal is held.
- [x] 1.5 MCP: `Handle(body, conv)`; `start_arch_goal` + `steps` / `continuesGoalId`;
      `mark_step`, `edit_goal_plan` (37 tools); `ArchController`: Mcp passes `conv`, goals
      POST takes steps / continuesGoalId, `steps/{step}`, `plan`, `answer`, `continue`.
- [x] 1.6 Role prompt v17: goals are orchestrations — declare steps, mark as you go, the
      kinds, evidence, one active / relay loop, edit the plan, done is done (continued goals),
      NEEDS_HUMAN holds, the summary from the plan.
- [x] 1.7 UI: `goalPlan.js` + `GoalPlanPanel.jsx` (stepper, mark menu, answer box, Continue),
      `subagents.js` (blocked attention, badge, label, toolbar count), `SubagentsPanel`
      (fraction on rows, Stop while held, the panel above the conversation), CSS; both
      bundles rebuilt.

## 2. Verify

- [x] 2.1 `ArchGoalPlanTests` (12): derive, parse, evidence, find, mark rules, the
      NEEDS_HUMAN block + clear, carry over, edit actions, the send words, the store, the loop
      resume, the catalogue + role prompt, the MCP conv parameter. Pins updated (37 tools,
      tool order, v17). Full suite: 901 green.
- [x] 2.2 `goalPlan.test.mjs` (6) + `subagents.test.mjs` (+1): 241 client tests green.
- [x] 2.3 `client/tests/ui/shot-goal-plan.mjs` (mocked board): 13 assertions — fractions on
      rows, amber blocked attention + the question, Stop while held, the toolbar count, the
      stepper with evidence, the live change on the poll, the Operator's mark path, the answer
      box and its post, derived + skipped, Continue on an ended goal, the no-plan case.
- [x] 2.4 REAL run on an isolated instance of this build (`.claudeweb-preview/goal-plan-live.ps1`
      → `client/tests/ui/e2e-goal-plan.mjs`, detached, log + marker): a goal with a declared
      3-step plan on the local `birokrat-ai-platform` agent — the arch marked step 1 active,
      sent the hello, marked it done with the send status as evidence, marked 2 active, read
      the transcript, marked 2 and 3 done with the agent's closing line, ended with LOOP_DONE,
      verified against the plan → GOAL_VERIFIED in 58 s / 3 turns; `mark_step` audited 5 times;
      the summary posted to the Operator conversation carried "Step plan (3/3 done)". Shots
      `docs/screenshots/goal-plan-live-*.png` show the stepper changing state.
- [ ] 2.5 Live after merge + deploy: a real multi-agent orchestration (send → wait → transfer
      → send) with a NEEDS_HUMAN hold answered from the panel, and a continued goal.

## 3. Ship

- [ ] 3.1 PR against main; the Operator merges and deploys.
