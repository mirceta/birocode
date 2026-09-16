# Proposal: goal-app — a per-agent Goal app mirroring "Ask for understanding"

> Investigated 2026-09-17 (fleet task f7224e55; the rendered understanding is in
> `understanding-app/`), decided by the Operator the same day ("follow all of your
> recommendations and build it end to end"), implemented on
> `feature/goal-app-understanding`.

## Why

Each repo agent has an Understanding app that a subagent rebuilds to explain the latest
turn — on demand (🧠 Ask for understanding) or after every completed builder turn (Auto).
The Operator wants the same shape for the **goal** of what is being built in that repo
agent: a Goal app per agent, an "Update goal" button beside 🧠, an Auto checkbox, and the
goal set from chat ("we want to create a goal …"). Today no surface holds a per-agent
goal: the board goal is one per Kanban (`PATCH /taskgraph/goal`) and an arch goal is what
one arch conversation drives.

## What changes

- **One pipeline, keyed by kind.** The understanding module's registry, turn-end
  trigger and controllers are generalised by `AppBuildKind` (`understanding` | `goal`)
  instead of copied: one `UnderstandingJobs` with per-(kind, repo) slots, one
  `AutoUnderstandingTrigger` reading two flags, one `ConversationAppBuild` for the
  transcript → prompt → ephemeral subagent step. Only the prompt (`GoalAsk`), the
  folder/static server (`GoalApp` over `goal-app/`), the endpoints (`/api/goal/*`) and
  the names (Console `op=goal`, audit `update-goal`) are goal-specific.
- **Dock:** 🎯 **Update goal** + **Auto** right next to 🧠 Ask for understanding + Auto,
  one row, behind a new `goalAgent` capability (Advanced). Both pairs share one client
  state machine (`useAppBuild`).
- **The goal is set from chat** by the subagent's judgement on the transcript; a message
  starting with `GOAL:` is authoritative. **`goal-app/goal.json`** is the record (text,
  updatedAt, setBy, source, history); the app renders the current goal and the history.
  A turn that did not change the goal costs one reply and touches nothing.
- **Convention:** a "The Goal app" section in `docs/understanding-app-convention.md`,
  resolved by the same absolute-path walk. **Self-development:** `goal-app/` is
  gitignored on birocode.
- **Independent** of the board goal and the arch goals; nothing reads `goal.json` yet.

## Decisions (the nine questions of the investigation, answered by "follow all recommendations")

| # | Decision |
|---|---|
| Q1 | `goal-app/goal.json` beside the app is the record |
| Q2 | current goal + append-only history, shown as a timeline |
| Q3 | model judgement on the transcript + the authoritative `GOAL:` marker |
| Q4 | "if unchanged, reply `GOAL UNCHANGED` and touch nothing" |
| Q5 | independent of board/arch goals; JSON shaped for upward reads later |
| Q6 | one section in the existing convention doc |
| Q7 | new `goalAgent` capability (Advanced); same Auto cadence (every done builder turn, coalesced) |
| Q8 | generalise the registry, the trigger and the build step by kind; only `GoalAsk` + `GoalApp` + `GoalController` are new |
| Q9 | `goal-app/` gitignored on birocode |

## Out of scope

Reading `goal.json` anywhere (dock chip, list_agents, Fleet Status), the arch setting an
agent's goal on dispatch, a dock text field to set the goal by hand, a read-only
pre-check run before the full build.
