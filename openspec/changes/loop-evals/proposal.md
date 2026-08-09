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
- Add the replay as a **scenario of the existing `loop-eval` suite**
  (`tests/loop-eval/golden.mjs`): restore a golden example's start state into a scratch
  working copy (golden answer stripped so the agent can't peek), hand the plan to the real
  queue loop **through the shipped operator surface** (login → register → dock stash →
  chat seed → arm → poll), let the loop drive real agent turns, and score the outcome.
  Because it follows that suite's scenario contract, it runs **as an automatic isolated
  test, live against the running harness, and startable+watchable from the Tests-tab eval
  runner** (with a bound dock tab) — for free, no per-scenario UI wiring. (This supersedes
  the earlier in-process console runner, now removed.)
- Add a **scorer**: acceptance checks are the pass/fail **verdict**; the run's own
  per-step commits are compared to the golden branch (fetched back from the bundle) as a
  **trajectory** report — turn counts and per-position files-touched overlap — surfaced as
  **evidence, never flipping the verdict** (a correct run may validly diverge from how the
  human drove it).
- Support **repeated runs** (N > 1) of the same loop on the same example, because agent
  turns are non-deterministic — reliability is part of the score (mirrors
  `discovery-eval`). Reliability sweeps are **isolated-mode only** (`--runs N`); live mode
  is a single watchable run.
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
  per-turn states), the capture of examples from human-driven sessions, the golden replay
  **scenario on the `loop-eval` suite** that drives a loop from the start state through the
  shipped surface, and the scorer that compares loop runs to the golden run (acceptance
  verdict, trajectory evidence, reliability across N isolated runs).

### Modified Capabilities

- `loop-eval`: gains a third scenario (`golden`) alongside `goal` and `queue`, registered
  in the runner's scenario catalog so the Tests-tab eval runner lists and streams it. No
  change to that suite's contract — the golden scenario conforms to the existing
  driver/verdict/`--describe`/dock-binding shape; the only additions are one shared
  bundle-materialization helper and the catalog entry.

## Impact

- **New code**: the golden-example format + curation endpoints + Operator curation UI
  (kept from the earlier design), plus `tests/loop-eval/golden.mjs` and a small set of
  shared helpers in `tests/loop-eval/lib.mjs` (bundle clone-and-strip, acceptance-check
  runner, trajectory diff, bundle-based provisioning).
- **Removed code**: the standalone in-process console runner
  (`tests/loop-evals/LoopEvals/`) and its offline scorer — superseded by the scenario,
  which exercises the real HTTP surface and is watchable.
- **Existing code touched**: curation reads stored session conversations
  (`SessionService` store) and a repo copy's git history, plus an Operator-gated curation
  UI; one line added to `LoopEvalRunnerService.Scenarios` and two arrays in `run-all.mjs`
  to register the scenario. The client Tests-tab list is dynamic — no client change.
- **Storage**: golden examples are git bundles — committed synthetic examples are tiny;
  real-world captures live outside the repo via a configurable examples root.
- **No End-User UI**, no new always-on service; `autopilot-loops` runtime behavior is
  unchanged. The eval spends real agent tokens on demand and is never CI.
