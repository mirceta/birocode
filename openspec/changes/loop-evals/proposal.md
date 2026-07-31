# Loop Evals — golden human-driven runs as the objective function for loop tuning

## Why

We are building ever more capable autopilot loops (`autopilot-loops`: suggestion loops,
goal loops, queue loops), but we have no way to measure whether a loop actually drives an
agent through a long task as well as a human babysitter does. Today "does this loop
work?" is answered by anecdote. We want the same move that `discovery-eval` made for
discovery: capture ground truth once, then score loop configurations against it,
repeatedly and objectively — so loops can be developed, tuned, and regression-tested
against evidence instead of vibes.

## What Changes

- Define a **golden example** format: a self-contained, version-controlled bundle
  capturing one long task that was too hard to one-shot but was completed by a human
  driving the agent turn by turn. A bundle holds:
  - the **start state**: a full copy of a repository in the state the task began from;
  - the **plan**: a human-readable statement of the task — what a human would understand
    as "exactly what we want done";
  - the **golden conversation**: the finished human-babysat transcript, turn by turn;
  - the **per-turn repo states**: the state of the repository after each turn of that
    conversation, ending in the desired final state.
- Add an **eval runner**: restore a golden example's start state into a scratch working
  copy, hand the plan to one of our loops, let the loop drive the agent over several
  turns, and record the produced per-turn and final repo states.
- Add a **scorer**: compare a loop run against the golden run — did the loop reach the
  same final state, and how did its trajectory (per-turn states) compare to the human's —
  reported in a form a developer can read at a glance and a program can diff between
  runs.
- Support **repeated runs** (N > 1) of the same loop on the same example, because agent
  turns are non-deterministic — reliability is part of the score (mirrors
  `discovery-eval`).
- Support **curating** a golden example from a real human-driven session after the fact,
  through an Operator-facing UI: take a copy of the repository and its stored
  conversation, select the span of relevant turns, associate turns with commits in the
  repository's history, and hand-label each turn — so examples come from real work, not
  hand-assembly.
- This is an **offline, developer-facing harness** run on demand — no End-User dashboard
  surface, following the `discovery-eval` precedent. Where capture hooks touch the
  harness runtime, they are operator-facing at most.

## Capabilities

### New Capabilities

- `loop-evals`: the golden-example format (start state + plan + golden conversation +
  per-turn states), the capture of examples from human-driven sessions, the eval runner
  that replays a loop from the start state, and the scorer that compares loop runs to the
  golden run (final state, trajectory, reliability across N runs).

### Modified Capabilities

<!-- none — the eval exercises loops through their existing contracts; it does not change
     any requirement of autopilot-loops. If the runner ends up needing a new seam on the
     loop engine (e.g. headless drive), that will be proposed as a delta on
     autopilot-loops at design time. -->

## Impact

- **New code**: eval bundle store/format, runner, scorer — likely a new
  `ClaudeWeb.App/Services/Evals/` (or standalone tool) area; placement is an open design
  question (see design.md).
- **Existing code touched**: curation reads stored session conversations
  (`SessionService` store) and a repo copy's git history, plus an Operator-gated
  curation UI in the client; the runner needs to drive a loop headlessly against a
  scratch repo — integration point around `AutopilotService`/`ILoop` (first target:
  the queue-based loop).
- **Storage**: golden examples contain whole repo copies — size and location (in-repo
  fixtures vs. external directory registered like a normal Repo) is a design decision.
- **No End-User UI**, no new always-on service; `autopilot-loops` runtime behavior is
  unchanged.
