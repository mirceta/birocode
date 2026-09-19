# Design: goal-app

## Context

"Ask for understanding" is one run, left to right: a trigger (dock button, or the
turn-end `RunSessionService.RunCompleted` event when the repo's `AutoUnderstanding`
flag is on) → a backend-owned per-repo job (`UnderstandingJobs`: latest-only, own token,
one pending slot that coalesces) → the builder transcript pasted into one prompt and
run once by `AgentHelperRunner` (ephemeral, write-capable, repo root) → a folder at the
repo root (`understanding-app/`) → served as a synthetic `kind:harness` local app by
`HarnessStaticApp`. Everything but the prompt and the folder is generic.

## Decisions

### 1. Generalise by kind, don't clone (Q8)

`AppBuildKind` (key, Console op, title, audit feature, event details) names a kind.
`IConversationAppBuilder { Kind; BuildAsync }` is what a kind runs; `UnderstandingAsk`
and `GoalAsk` implement it and DI registers both. `UnderstandingJobs` maps builders by
kind and keys its job and pending maps by `"{kind}:{repoId}"`, so the understanding and
the goal runs of one repo are independent slots. The original understanding-only
overloads stay as shorthands. `AutoUnderstandingTrigger` computes the kinds to run from
the two flags (`KindsToRun`, pure and unit-tested) and enqueues each. `AgenticAuditController`
resolves the live job by `AppBuildKind.ByAuditFeature`.

*Rejected:* four copies (GoalJobs, GoalController, AutoGoalTrigger, GoalApp) — the
coalescing logic and the audit boundary would drift.

### 2. The shared build step

`ConversationAppBuild.RunAsync` is the former body of `UnderstandingAsk.BuildAsync`:
session-id validation, transcript load + export, `ConversationHandoff.BuildPrompt`, the
helper run, and the legacy Claude Monitor snapshot-resume fallback. Both asks call it with
their own instruction, gateway app name and no-conversation hint.

### 3. The goal prompt (Q1–Q4, Q6)

`GoalAsk.BuildPrompt` points at the same convention doc (its "The Goal app" section,
resolved by `UnderstandingAsk.ConventionRef`) and directs: read `goal-app/goal.json`,
read the turns since it was recorded, decide (marker `GOAL:` authoritative, else
judgement), reply `GOAL UNCHANGED` and touch nothing when nothing changed, else write
`goal.json` (append the replaced entry to `history`) and `goal-app/index.html`, nothing
outside `goal-app/`.

*Rejected for now:* a read-only pre-check run before the full build (Q4 option 3) —
revisit if Auto proves expensive.

### 4. Storage (Q1, Q2, Q5, Q9)

`goal-app/goal.json` `{ text, updatedAt, setBy, source, history[] }` beside the app.
The harness does not read it in this change. `goal-app/` is gitignored on birocode.

### 5. Serving

`RepositoryRegistry.ToInfo` appends `LocalAppInfo("goal", "Goal", 0, "harness")` to every
repo after "understanding"; `LocalProxyController` dispatches id `goal` to `GoalApp.Serve`
(`HarnessStaticApp` over `goal-app/`, no-store, explicit empty state, no fallback). The
dock's app switcher and the Local tab pick it up with no client change.

### 6. Dock (Q7)

`useAppBuild({ repoId, base, enabled, sessionId, chatStatus, nudge })` holds the
start-or-join / poll / reattach / Auto / nudge state machine once; `PinnedAgent` calls
it for `/understanding` and `/goal`. One row holds two button+Auto pairs
(`.phone__understanding-pair`, wrapping as units). New capability `goalAgent`
(Advanced). `AgentAuditPanel` lists `update-goal` with 🎯.

## Risks

- Every repo now reports one more local app; the switcher grows a "Goal" button. The
  Local tab's default app stays the first `kind:repo` app, so nothing changes there.
- On birocode the goal folder must never be committed: `.gitignore` carries `goal-app/`.
- `AgenticAuditLog` is constructed with the live data dir; the registry unit test passes
  `null!` for it and only exercises the pre-start failure path.
