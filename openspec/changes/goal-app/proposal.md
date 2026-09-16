# Proposal: goal-app — a per-agent Goal app mirroring "Ask for understanding" (DRAFT)

> **Status: draft from the investigation pass (fleet task f7224e55, 2026-09-17).** Not yet
> specified, designed or validated. The open questions below must be answered by the
> Operator before `design.md` / `tasks.md` / the delta specs are written. The rendered
> understanding lives in `understanding-app/` on branch `feature/goal-app-understanding`.

## Why

Each repo agent has an Understanding app that a subagent rebuilds to explain the latest
turn — on demand (🧠 Ask for understanding) or after every completed builder turn (Auto).
The Operator wants the same shape for the **goal** of what is being built in that repo
agent: a Goal app per agent, an "Update goal" button beside 🧠, an Auto checkbox, and the
goal set from chat ("we want to create a goal …"). Today no surface holds a per-agent
goal: the board goal is one per Kanban (`PATCH /taskgraph/goal`) and an arch goal is what
one arch conversation drives.

## What exists today (the thing to mirror)

One run, left to right (see the Understanding app for the diagram and every file):

1. **Trigger** — the dock button (`PinnedAgent.jsx`, capability `understandingAgent`,
   Advanced, disabled without a builder `sessionId`) POSTs `/api/understanding/ask`; or the
   hosted `AutoUnderstandingTrigger` fires on `RunSessionService.RunCompleted` when
   lane=builder ∧ status=done ∧ sessionId ∧ `RepositoryConfig.AutoUnderstanding`
   (server-persisted, default off, `GET/POST /api/understanding/auto`).
2. **Ownership** — `UnderstandingJobs`: one backend-owned job per repo, latest-only, own
   cancellation token, one pending slot that coalesces turns finishing mid-run;
   `GET /api/understanding/status` reattaches; Console events `op=understanding`; agentic
   audit feature `ask-for-understanding`.
3. **Subagent** — `UnderstandingAsk.BuildAsync`: the builder transcript is loaded
   (`SessionService.GetMessages`), exported when long, and pasted into ONE prompt
   (`ConversationHandoff.BuildPrompt`, 12 000-char budget) with the build instruction;
   run once, ephemeral and write-capable, with the repo's own engine
   (`AgentHelperRunner`), never touching the live session. Legacy fallback: Claude Monitor
   snapshot-resume fork.
4. **The prompt is the visualization architecture** — "explain your most recent reply;
   read `docs/understanding-app-convention.md` (resolved by absolute path via the
   `playground/birocode` ancestor); overwrite `understanding-app/` at the repo root;
   build-less, self-contained, relative URLs; touch nothing else".
5. **Output + serving** — `understanding-app/` at the repo root (the app IS the store);
   `RepositoryRegistry.ToInfo` appends a synthetic `kind:harness` local app
   `"understanding"` to every repo; `LocalProxyController` dispatches it to
   `UnderstandingApp.Serve` (`HarnessStaticApp`, no-store, no fallback) under
   `/api/localview/{repo}/app/understanding/`; the dock's app switcher and the Local tab
   show it.

## What the Goal app would be (mirrored, tagged)

| Piece | Goal app | Tag |
|---|---|---|
| Dock button `🎯 Update goal` + `Auto` next to 🧠 | same row, same disabled rule, `/api/goal/*` | clone |
| `RepositoryConfig.AutoGoal` + `GET/POST /api/goal/auto` | second flag, default off | clone |
| Turn-end trigger | `AutoUnderstandingTrigger` reads both flags | reuse |
| Jobs registry, status, Console, audit | generalise `UnderstandingJobs` by kind (`understanding` / `goal`); `op=goal`, audit `update-goal` | reuse (generalised) |
| Subagent runner | `AgentHelperRunner`, unchanged | reuse |
| **The goal prompt** | "did the latest turn(s) set or change the goal? if yes rewrite `goal-app/`; if no, say so and touch nothing" — same convention text, new subject | **new** |
| **Storage of the goal** | `goal-app/` at the repo root (+ `goal.json`?) | **new** |
| **"Set a goal from chat"** | no parser exists; the subagent reads the transcript and decides | **new** |
| Serving | `GoalApp.Serve` over `goal-app/`; app id `"goal"` appended in the registry; one dispatch branch | clone |

## Open questions (must be answered before design)

- **Q1 Storage.** Only inside `goal-app/` (the app is the store, like understanding), or a
  machine-readable `goal-app/goal.json` `{ text, updatedAt, setBy, history[] }` beside it, or
  a registry field? *Recommendation: goal.json beside the app.*
- **Q2 History.** Current goal only, or current + append-only history the app shows as a
  timeline? *Recommendation: both, cheaply.*
- **Q3 Detection.** Model judgement on the transcript only (exactly like understanding), or
  also an optional deterministic marker (`GOAL: …`) the prompt treats as authoritative,
  and/or a dock text field? *Recommendation: judgement + the optional marker.*
- **Q4 No-change turns.** Always rebuild, or instruct "if unchanged, reply so and touch
  nothing", or a cheap read-only pre-check before the full build? *Recommendation: the
  instruction first; the pre-check if Auto proves expensive.*
- **Q5 Composition.** Independent of the board goal and the arch goals, or surfaced upward
  (list_agents / Fleet Status), or settable by the arch on dispatch? *Recommendation:
  independent now, JSON shaped for upward reads later.*
- **Q6 Convention.** A "Goal app" section in `docs/understanding-app-convention.md`, or a
  sibling doc? *Recommendation: one section in the existing doc.*
- **Q7 Gate and cadence.** Reuse `understandingAgent` or add `goalAgent` (Advanced)? Same
  Auto cadence (every done builder turn, coalesced)? *Recommendation: new gate, same cadence.*
- **Q8 Clone vs generalise.** Copy the module four times, or generalise the registry, the
  trigger and the static server by kind and add only `GoalAsk`? *Recommendation: generalise;
  one change that MODIFIES `ask-for-understanding` rather than a new capability.*
- **Q9 Self-development.** Commit `goal-app/` on birocode like `understanding-app/`, or
  gitignore it? *Recommendation: gitignore.*

## Out of scope for this draft

Any code. `design.md`, `tasks.md` and the delta specs (`ask-for-understanding` MODIFIED,
`agent-dock` MODIFIED, possibly a new `goal-app` capability) follow the answers.
