## ADDED Requirements

### Requirement: Update goal control next to Ask for understanding

The system SHALL render a **"Update goal"** control with its own **Auto** toggle in the
agent dock, in the same row as and immediately after the "Ask for understanding" control
and its Auto toggle. The control SHALL be gated on a UI-mode capability of its own
(`goalAgent`) that defaults to Advanced, and SHALL follow the understanding control's
enablement rule: enabled only when the dock's builder lane has a conversation, otherwise
disabled with a hint to start one.

#### Scenario: Both pairs in one row

- **WHEN** the dock renders with both capabilities at their Advanced default
- **THEN** the row reads 🧠 Ask for understanding · Auto · 🎯 Update goal · Auto, and each
  Auto reflects its own persisted per-repo flag

#### Scenario: Goal control hidden alone

- **WHEN** the `goalAgent` capability is off and `understandingAgent` is on
- **THEN** only the understanding pair renders

### Requirement: The goal is set from chat and judged by the subagent

The system SHALL keep NO parser for goal statements. An Update goal run SHALL hand the
dock's builder conversation to one ephemeral subagent run (the same mechanism as the
understanding run) whose prompt directs it to read `goal-app/goal.json` if present, read
the turns since that goal was recorded, and decide whether they set or changed the goal:
a user message starting with `GOAL:` SHALL be treated as authoritative; otherwise the
subagent uses its judgement.

#### Scenario: Explicit marker

- **WHEN** the latest user message starts with `GOAL: ship the invoice export by Friday`
- **THEN** the run records that text as the goal with `setBy: "operator"`

#### Scenario: Inferred goal

- **WHEN** the Operator wrote "we want to create a per-agent goal app" and no marker
- **THEN** the run records the inferred goal with `setBy: "conversation"` and the message
  excerpt as `source`

### Requirement: goal.json is the record; unchanged means untouched

The run SHALL keep `goal-app/goal.json` at the repo root as the machine-readable record
`{ text, updatedAt, setBy, source, history[] }`, appending the replaced entry to
`history` and never dropping history, and SHALL (over)write `goal-app/index.html` to
show the current goal and the history. When the latest turns did not set or change the
goal, or no goal exists at all, the run SHALL reply `GOAL UNCHANGED` and modify no file.
The run SHALL modify nothing outside `goal-app/`.

#### Scenario: A turn about something else

- **WHEN** Auto is on and a builder turn completes that fixed a bug and said nothing about
  the goal
- **THEN** the goal run ends done, `goal-app/` is byte-identical to before, and the
  Console shows the run

#### Scenario: A redirected goal keeps its history

- **WHEN** the goal was "A" and the Operator says "change of plan: B"
- **THEN** `goal.json` reads text "B" with history `[A]`, and the app's timeline shows both

### Requirement: The Goal app is served like the Understanding app

The system SHALL append a synthetic `kind:harness` local app with id `goal` and name
"Goal" to every repository, served from `goal-app/` at the repo root under
`/api/localview/<repo>/app/goal/`, no-store, with an explicit empty state when
`goal-app/index.html` is missing and a plain 404 for any other missing asset (no
fallback).

#### Scenario: Empty state

- **WHEN** a repo has no `goal-app/index.html`
- **THEN** the Goal slot shows "No Goal app here yet" with how to set a goal

### Requirement: Per-repo auto-goal flag and turn-end trigger

The system SHALL keep a per-repo `AutoGoal` flag, persisted server-side, default off,
independent of `AutoUnderstanding`, exposed as `GET/POST /api/goal/auto`. When a
builder-lane turn completes as done with a session id, the turn-end trigger SHALL start
a goal run for every repo whose `AutoGoal` is on, with the same coalescing (one pending
newest session per repo, never a queue) as the understanding run, and independently of
whether an understanding run is also started.

#### Scenario: Both flags on

- **WHEN** a repo has `AutoUnderstanding` and `AutoGoal` on and a builder turn completes
  as done
- **THEN** one understanding run and one goal run start for that repo, and they can run
  at the same time

### Requirement: Endpoints, Console and audit

The system SHALL expose `POST /api/goal/ask` (start-or-join for the caller's repo and
the given builder session id), `GET /api/goal/status` (reattach only), with the same
body shape as the understanding endpoints; SHALL emit `op=goal` started/done/error events
to the repo's Console lane; and SHALL record each actual start in the agentic audit
trail as feature `update-goal`, live-resolved by the goal job of that repo.

#### Scenario: Ask without a conversation

- **WHEN** `POST /api/goal/ask` is called without a session id
- **THEN** it returns 400 with a friendly hint and starts nothing

### Requirement: Independent of the board goal and the arch goals

The agent goal SHALL be the repo agent's own reference only: nothing in the harness
reads `goal.json` in this change, and it SHALL NOT alter the board goal or any arch
goal. Its shape is fixed so later changes can surface it upward.

#### Scenario: Board goal untouched

- **WHEN** a goal run records a new agent goal
- **THEN** `GET /api/taskgraph` still returns the board goal as it was
