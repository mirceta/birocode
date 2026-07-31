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

### D3 — Capture is retroactive curation over a repo copy + stored conversation

You don't know in advance which babysat session will turn out golden — you know it
when it's over. So capture is **after-the-fact curation**, done in an Operator-facing
UI over two artifacts that already exist: a **copy of the repository** (with its
`.git` history) and the session's **stored conversation** (the `SessionService`
store). The curation flow is:

1. **Select sources** — point the UI at a repo copy and one of that repo's stored
   session conversations.
2. **Set the span** — mark the first and last relevant turns of the conversation;
   everything outside the span is excluded from the example.
3. **Associate turns with commits** — join the in-span turns to commits in the repo
   copy's history. This association is **partial by nature**: a turn only has its own
   repo state if a commit was made after it. Turns with no commit (discussion,
   corrections, multi-turn stretches between commits) **carry forward** the previous
   state — the golden trajectory is really the associated commit chain, with turns
   grouped into spans between commits. `eval/start` is the state *before* the first
   associated commit; `eval/final` is the last associated commit.
4. **Hand-label each turn** — a short intent label per in-span turn (starter
   taxonomy: `instruct`, `course-correct`, `approve`, `verify-ask`, `unblock`; free
   text allowed). Labels ride in `conversation.jsonl` and feed the trajectory report;
   v1 uses them for reporting, not scoring.
5. **Author** `plan.md` and the acceptance checks in the same UI, then **export** the
   bundle: refs `eval/start` / `golden` / `eval/final` cut from the copied repo into
   `repo.bundle`, plus manifest and labeled transcript, into the examples root.

Curation is strictly **read-only** toward the source repo and the stored session —
it reads history and conversation, writes only the bundle. The UI is an
Operator-gated, Advanced-mode client surface (per the UI-modes convention) backed by
read-only endpoints (list sessions/turns, list commits) plus the export action.

The known trade-off: per-turn fidelity depends on the session's commit cadence. For
this repo that cadence is already good — the queue-loop convention commits every
tick, and babysat work here tends to commit per completed step. For sessions likely
to become golden, commit-per-turn discipline makes the example sharper.

*Alternative considered:* live "armed capture" that shadow-commits the working tree
after every turn — guarantees a state per turn, but requires deciding *before* the
session that it will be golden, and adds a hook to the live turn path. Rejected for
v1; it can be added later as a delta if carry-forward granularity proves too coarse.

### D4 — The runner drives the real loop in-process, `tests/loop-evals/LoopEvals`

A standalone console project `tests/loop-evals/LoopEvals/` (mirror of
`DiscoveryEval`) that, per run: clones `repo.bundle` at `eval/start` into a scratch
working copy, hosts the production loop services (`AutopilotService` / `ILoop`
implementations from `ClaudeWeb.App`, the same way `ClaudeWeb.Tests` references app
code) pointed at the scratch repo, seeds the loop from `plan.md` per the selected loop
kind, and lets it run under a hard **turn cap** and wall-clock timeout. The **first
supported kind is the queue-based loop**: the manifest's seed hints define how the
plan becomes the loop's queue (a single plan-sized item by default; optionally a
pre-split item list authored at curation time). After each loop-driven agent turn the runner commits the
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
- [Turn↔commit association is partial — turns without commits lose their own state] →
  carry-forward semantics are explicit in the format; the trajectory compares the
  associated commit chain, not imaginary per-turn states; commit-per-turn discipline
  (or a later live-capture delta) sharpens examples that need it.
- [Loops read `plan.md` differently per kind] → manifest carries per-loop-kind seed
  hints; first supported kind is the queue-based loop (D4).
- [Acceptance checks can be too weak (loop "passes" while wrong)] → checks are
  authored with the example and reviewed with it; diff-vs-golden evidence sits next to
  the verdict so a hollow pass is visible.
- [In-process hosting drifts from real harness wiring] → runner composes the same DI
  modules the app uses (`AutopilotModuleExtensions`), not hand-built copies.

## Open Questions

- Turn label taxonomy: is the starter set (`instruct`, `course-correct`, `approve`,
  `verify-ask`, `unblock`, free text) the right shape, and should labels ever feed
  scoring rather than just the report?
- Per-turn comparison granularity: is files-touched overlap enough, or do we want
  diff-hunk similarity per turn from day one?
- (Resolved: first eval target is the **queue-based loop**; first golden example is
  **curated from a real babysat session** via the D3 UI — the small synthetic example
  in tasks §1 remains only as the cheap fixture that unblocks runner/scorer
  development before the first real curation.)
