# Design: goal-step-plan

## D1 — Data model: the plan rides on the goal record

`ArchStateStore.ConversationData` gains `GoalPlan: List<ArchGoalPlans.Step>`, `GoalPlanDerived`
and `GoalContinues`; `ArchGoal` gains `Plan`, `PlanDerived`, `ContinuesGoalId` (optional
positional parameters, so old callers and old `arch.json` files keep working — a file without
the fields loads an empty plan). One persisted type, the record itself:

```
Step(Title, Done, Kind, State, Note, Evidence?, Counter, UpdatedAt, AwaitsHuman)
Evidence(Text?, Url?, HubPath?, Size?, JobId?, ClosingLine?, Commit?)
states: pending | active | done | blocked | skipped
kinds:  send | wait | transfer | verify | relay-loop | human | other
```

`ArchGoalPlans` (pure, `ClaudeWeb.App/Services/Arch/ArchGoalPlans.cs`) owns every rule:
`Derive` (numbered / "STEP n —" lines, "— done: …" tails, a kind guessed from the words; two
lines or more make a plan), `ParseSteps` (array of objects, strings, a JSON string, or lines),
`ParseEvidence` (text, a bare URL, or the typed object), `FindIndex` (1-based number or a
unique title prefix / contains), `Mark` (the one-active rule, the relay-loop counter),
`BlockOnHuman` / `ClearHumanBlock` / `AwaitsHuman`, `CarryOver`, `Edit` (set | add | rename |
remove | move; `set` keeps the state and evidence of steps whose title matches), `WorkBlock` /
`VerifyBlock` / `SummaryLines` (the words the sends and the summary carry), `Views`.

## D2 — The arch tools and the calling conversation

The MCP URL the harness writes into a run's config already carries `?conv=<key>`; the endpoint
now hands it to `ArchMcpServer.Handle(body, conv)` → `Call(name, args, conv)`. `mark_step`
resolves the goal from `goalId` or the caller's own goal and refuses `not-owner` when the
caller is not the owning conversation; `edit_goal_plan` allows the owner and the
Operator-facing conversation (the Operator's ask). The Operator's API endpoints
(`POST /api/arch/goals/{id}/steps/{step}`, `…/plan`, `…/answer`, `…/continue`) call the same
service methods with a null caller (no owner rule). The catalogue grows to 37 tools; `steps`
and `evidence` are array / object properties (a string is accepted too, for models that send
JSON as text).

Example calls (the shape the arch sends):

```
start_arch_goal { goal: "…", repos: "spacex/prg, spacex/fluent", maxIterations: 12,
  steps: [ { title: "send brief A to prg", done: "prg's closing line", kind: "send" },
           { title: "wait for A, verify the export on the hub", done: "hub_files lists it", kind: "wait" },
           { title: "hub_transfer prg → fluent", done: "the job reports copied", kind: "transfer" },
           { title: "send brief B to fluent", done: "fluent's PR is open", kind: "send" } ] }
mark_step { step: 1, state: "active" }
mark_step { step: 1, state: "done", evidence: { closingLine: "TASK COMMITTED 4efba344 feat/x 9c1d2e7" } }
mark_step { step: 2, state: "done", evidence: { hubPath: "prg/exports/customers.csv", size: 48213 } }
mark_step { step: "relay fluent", state: "active" }           // a relay-loop step: +1 relayed
mark_step { step: 3, state: "blocked", note: "which DB may I drop?" }   // then end with NEEDS_HUMAN: …
edit_goal_plan { action: "add", title: "probe fluent's build first", kind: "verify", to: 3 }
edit_goal_plan { action: "set", steps: [ … ] }                 // the plan on a goal that had none
start_arch_goal { goal: "…", continuesGoalId: "4efba344" }     // the plan carries over, done stays done
```

## D3 — The sends carry the plan

`DecorateDrivenPrompt(convId, prompt, phase)` (called by the engine's one drive choke point
with the send's phase) prefixes, after the queued Operator messages, the plan block: the work
send gets the steps with states and evidence, the progress, the active step and the rules
(done is done — never re-send its brief; mark as you go; one active unless a relay loop;
declare a plan when there is none; a continued goal names the goal it continues); the
verification send gets the plan to verify against — a step without evidence is not done.

## D4 — NEEDS_HUMAN holds; the answer resumes

`OnDrivenResolved` now returns whether it HELD the goal: on `escalate` / `needs-human` the
plan's active step (else the first pending, else a new human step) is blocked awaiting the
human with the question as its note, an `arch.goal` feed event says `held`, and the goal is not
ended — nothing is released and no summary goes out. `ReconcileGoals` leaves a running goal
whose loop is escalated alone (and makes sure its plan says so after a restart). The goal is
not busy (the loop is inactive), so the conversation's composer sends the Operator's message
as a plain turn; `SendToArch` → `ResumeLoopIfStopped` → `ResumeHeldGoal`: the waiting steps
become active, `LoopConfigStore.ResumeGoal` re-activates the goal loop in place (fresh arming
generation, budget restarted, phase work). The engine's next tick then re-sends the work
prompt with the plan. The panel's answer box (`POST …/answer`) takes the same path; a busy goal
gets the answer queued instead. The Subagents row keeps Stop while the goal is held.

## D5 — Continue

`StartGoal(…, steps, continuesGoalId)`: the previous goal must have ended; its text, repos and
tasks are the defaults; the plan is `CarryOver(previous.Plan)` unless explicit steps are given;
`ContinuesGoalId` is recorded and named in the work block and the summary. The panel's
"Continue from the plan" button on a capped / errored / stopped goal is `POST …/continue`.

## D6 — The Subagents tab

`GoalPlanPanel.jsx` above the Arch chat view for the selected goal; `goalPlan.js` is the pure
half (progress, blocked / awaiting / active step, state and kind words, evidence lines, the
headline, the continue rule). `subagents.js`: a blocked step is amber attention named
`blocked` by the badge and counted on the toolbar; an armed goal's label names its active step.
The tab's 5 s poll of `/api/arch/conversations` (whose goal view now carries `plan`,
`planDerived`, `progress`, `activeStep`, `blockedSteps`, `awaitsHuman`, `held`,
`continuesGoalId`) is the live channel.
