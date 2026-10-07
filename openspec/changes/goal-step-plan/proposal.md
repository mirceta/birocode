# Proposal: goal-step-plan — goal conversations as orchestrations

Fleet task `94c722e726414b85b5081a2768e8d3b6` (Operator, 2026-10-07). Extends openspec
`arch-goal-conversations` (PR #71) and `arch-subagents-tab` (PR #153).

## Why

Every arch goal conversation we have run is in fact an **orchestration**: an ordered list of
steps — STEP 1 send brief A → STEP 2 wait for A's closing line, verify with `hub_files` →
STEP 3 `hub_transfer`, poll the job → STEP 4 send brief B → done — each gated on an agent
reply, a transfer job or the Operator's answer; the goal loop is only the engine that advances
through them. Today the steps live only as prose in the goal text, progress is invisible until
the summary, and a continued goal relies on memory notes to know what was already done — which
failed twice on 2026-10-07 (a brief sent to an agent a second time).

## What changes

1. **A step plan on the goal.** `start_arch_goal` (and `POST /api/arch/goals`) take an optional
   `steps` list — `{ title, done (one line: what proves it), kind: send | wait | transfer |
   verify | relay-loop | human | other }` — stored on the goal record. Without it the harness
   derives a best-effort plan from numbered / "STEP n —" lines of the goal text and marks it
   derived. The plan stays editable mid-flight with the tool `edit_goal_plan(action: set | add
   | rename | remove | move)`.
2. **Step state, marked by the arch.** `mark_step(goalId?, step, state, note?, evidence?,
   counter?)` — usable only from the goal conversation that owns the goal (the MCP endpoint now
   hands the calling conversation to the tools); the Operator marks from the UI. One step is
   active at a time unless a relay-loop step runs; a relay-loop step carries a counter.
   Evidence is free text or a small object (hub path + size, transfer job id, the agent's
   closing line, a commit / PR URL). A NEEDS_HUMAN ending blocks the active step automatically
   (awaiting the human); the Operator's answer clears it. The role prompt (v17) and the work
   prompt teach the arch to declare steps at start and mark as it goes.
3. **Visualization in the Subagents tab.** A plan panel above the selected conversation: a
   vertical stepper (done = green check, active = pulsing accent, pending = grey, blocked =
   amber with the question inline and an answer box, skipped = struck through), each step with
   its kind, "done when", note and compact evidence (closing line monospace, PR / hub rows); a
   done/total fraction on the selector rows; the circle reflects the active step (a blocked
   step is amber attention); the toolbar badge counts goals with a blocked step. Live on the
   tab's existing poll.
4. **Resume from the plan.** `continuesGoalId` on `start_arch_goal` / the API, and the panel's
   "Continue from the plan" on an ended goal: the plan carries over (done and skipped steps
   stay done with their evidence; active and blocked ones go back to pending) and every work
   send says which steps are done, so no brief is sent twice. `list_arch_goals` returns the
   plan with states; `stop_arch_goal` keeps it for the record.
5. **NEEDS_HUMAN holds the goal instead of ending it.** Before this change a goal loop that
   escalated ended the goal as `stopped` and released its agents (the spec said "held", the
   code did not). Now the goal stays `running` with its loop escalated (`held`), keeps what it
   drives, the plan shows the question, and the Operator's answer — the composer, or the
   panel's answer box — resumes the same goal loop in place (`LoopConfigStore.ResumeGoal`).
6. **Summary from the plan.** The verification send carries the plan to verify against (a
   step without evidence is not done); the finished-goal summary posted to the Operator-facing
   conversation lists the steps with states and evidence plus the arch's closing line.

## Out of scope

Editing the plan from the panel (the API exists; the arch and the Operator's chat cover it);
a plan on repo-agent goal loops (the dock's goal kind) — this is the arch's orchestration only.
