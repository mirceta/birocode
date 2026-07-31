# Design — loop-evals

## Context

`autopilot-loops` now has several loop kinds (suggestion, goal, queue) and a growing
config surface (recipes, thresholds, classifiers). There is no objective way to tell
whether a change to a loop makes it better or worse at its actual job: driving an agent
through a long task that a human previously had to babysit turn by turn.

The repo already contains the pattern to copy: `tests/discovery-eval/` — a standalone
console project (`DiscoveryEval.csproj`) plus committed fixtures with an
`expected.json`, scoring precision/recall over repeated runs, exercising the *real*
production path. `discovery-eval`'s spec is the archived contract for that shape.

What is new here is the ground truth: not a static expected-answer file, but a
**recorded human-driven run** — start state, plan, the finished conversation, and the
repo state after every turn.

## Goals / Non-Goals

**Goals:**

- A durable, auditable **golden example format** that packages one long task: start
  state + plan + golden conversation + per-turn repo states + an objective definition
  of "done".
- A **capture** path so golden examples come from real babysat sessions, not
  hand-assembly.
- A **runner** that replays a chosen loop configuration from the start state and
  records its own per-turn states the same way.
- A **scorer** that answers: did the loop reach the desired state, how did its
  trajectory compare to the human's, and how reliably over N runs.
- Developer-facing, offline, run on demand (the `discovery-eval` posture).

**Non-Goals:**

- No End-User dashboard surface and no always-on service.
- No automated prompt/loop *optimization* — the harness produces evidence; a human
  changes the loop config and re-runs.
- No CI gating in this change (a later change can wire the runner into CI once
  examples and costs are understood — each eval run spends real agent tokens).
- No change to `autopilot-loops` runtime behavior for normal users.

## Decisions

### D1 — A golden example's repo states are a git history, shipped as a `git bundle`

The per-turn states are exactly what git is for. An example's repository is a real git
repo in which:

- tag `eval/start` marks the start state;
- branch `golden` holds one commit per human turn (commit message carries the turn
  index; the transcript references the commit SHA);
- tag `eval/final` marks the desired final state (tip of `golden`).

The bundle directory then stores this repo as a single **`repo.bundle`** file
(`git bundle create`), because a nested working `.git` cannot be committed inside the
birocode repo (git refuses embedded repos) and N full copies would be enormous and
diff-blind. The runner and scorer `git clone repo.bundle` into scratch space; every
comparison ("what changed in turn 3", "loop final vs golden final") is a git diff.

*Alternatives considered:* plain per-turn directory copies (`turns/00…N/`) — trivially
authorable but explodes in size, loses history semantics, and still can't hold the
example's own `.git`; zip snapshots — same problems, plus opaque to review.

### D2 — Bundle layout and the "done" definition

```
<example-id>/
  manifest.json        # id, description, loop hints, turn→SHA map, checks
  plan.md              # the human-readable task statement given to the loop
  conversation.jsonl   # golden transcript: one turn per line {role, text, commitSha}
  repo.bundle          # the git-bundled example repository (D1)
```

`manifest.json` contains **acceptance checks**: an ordered list of commands (e.g.
`dotnet build`, `dotnet test`, a grep) that must succeed in a working copy for the
task to count as *done*. This is the primary, mechanical pass/fail — we do not require
byte-identical trees, because an agent can validly reach the desired state with
different formatting or naming. Tree/diff comparison against `eval/final` is reported
as evidence, not as the verdict.

Small synthetic examples are committed under `tests/loop-evals/examples/<id>/`
(discovery-eval precedent); a configurable external examples root is also honored for
large real-world captures that should not live in this repo.

### D3 — Capture is armed on a live session and piggybacks on git

To record a golden example the operator **arms capture** for a repo/dock before (or
during) the babysat session. While armed, after each completed agent turn the harness
commits the repo working tree to a dedicated **shadow branch**
(`eval-capture/<session-id>`) with the turn index in the message — using the same git
plumbing the harness already trusts. On "finish capture", an export assembles the
bundle: the shadow branch becomes `golden`, the arming-time commit becomes
`eval/start`, the session transcript (already stored by `SessionService`) is exported
to `conversation.jsonl` with SHAs joined by turn index, and the operator writes
`plan.md`.

This is the one place the harness runtime is touched: a turn-completion hook plus
operator-facing endpoints (arm / status / finish). It is operator-only, gated like
other operator surfaces, and inert when not armed.

*Alternative considered:* fully manual capture (human runs a commit-per-turn
discipline by hand and assembles the bundle) — remains possible since the format is
plain git + files, but is exactly the toil that would mean no examples ever get made.

### D4 — The runner drives the real loop in-process, `tests/loop-evals/LoopEvals`

A standalone console project `tests/loop-evals/LoopEvals/` (mirror of
`DiscoveryEval`) that, per run: clones `repo.bundle` at `eval/start` into a scratch
working copy, hosts the production loop services (`AutopilotService` / `ILoop`
implementations from `ClaudeWeb.App`, the same way `ClaudeWeb.Tests` references app
code) pointed at the scratch repo, seeds the loop with `plan.md` per the selected loop
kind (goal loop goal, queue loop queue, …), and lets it run under a hard **turn cap**
and wall-clock timeout. After each loop-driven agent turn the runner commits the
scratch tree to its own `run/<n>` branch — the same shape as the golden branch, so the
scorer compares like with like.

*Alternative considered:* boot an isolated harness instance (the
`CLAUDEWEB_DATADIR` recipe) and drive it over HTTP — highest fidelity including the
HTTP surface, but much heavier to orchestrate per run and adds nothing to what the
loop engine itself decides. In-process hosting still exercises the real engine, real
recipes, and real Claude CLI agent turns. If in-process hosting turns out to need a
new seam on the engine, that seam is proposed as an `autopilot-loops` delta rather
than smuggled in.

### D5 — Scoring: acceptance verdict first, trajectory as diagnosis, N runs for reliability

Per run the scorer reports, machine-comparable and human-readable (JSON + console
table, like `Scoring.cs` in discovery-eval):

1. **Outcome** — did the acceptance checks pass in the loop's final working copy
   (the verdict), plus the mechanical diff of loop-final vs `eval/final` (files
   added/removed/changed) as supporting evidence.
2. **Trajectory** — loop turn count vs golden turn count; per-turn files-touched
   overlap with the golden turns; where the loop stalled or diverged first.
3. **Reliability** — the runner supports N repeated runs of the same (example, loop
   config); the aggregate reports pass-rate, worst case, and turn-count spread —
   non-determinism is part of the measurement (discovery-eval precedent).

An LLM-judge comparison of loop-final vs golden-final ("same intent achieved?") is a
possible later refinement, deliberately **not** in this change: acceptance checks give
an objective verdict without a second model in the loop.

## Risks / Trade-offs

- [Whole-repo examples contain secrets or private code] → examples root is
  configurable and external by default for real captures; committed examples must be
  synthetic; capture export warns that the bundle contains the full repo history from
  `eval/start` forward.
- [Eval runs cost real agent tokens and minutes] → hard turn cap + timeout per run, N
  configurable, runner is on-demand only; cost surfaces in the report (turns used).
- [Capture shadow-commits could pollute the working repo] → shadow branch only, never
  touches the user's branch or index (commit via temporary index / `git stash
  create`-style plumbing); finish/abandon deletes the branch.
- [Loops read `plan.md` differently per kind] → manifest carries per-loop-kind seed
  hints; first supported kind is chosen at implementation start (open question below).
- [Acceptance checks can be too weak (loop "passes" while wrong)] → checks are
  authored with the example and reviewed with it; diff-vs-golden evidence sits next to
  the verdict so a hollow pass is visible.
- [In-process hosting drifts from real harness wiring] → runner composes the same DI
  modules the app uses (`AutopilotModuleExtensions`), not hand-built copies.

## Open Questions

- Which loop kind is the first eval target — the queue-based loop or the goal loop?
- Source of the first golden example: capture one from a real babysat session in a
  playground repo, or hand-author a small synthetic one to unblock the runner/scorer
  first?
- Should the capture arm/finish surface be dock UI (operator-gated) or
  endpoint/CLI-only in v1?
- Per-turn comparison granularity: is files-touched overlap enough, or do we want
  diff-hunk similarity per turn from day one?
