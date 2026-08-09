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

> **Revision (rework onto `loop-eval`).** After `main` shipped the `loop-eval` suite (an
> end-to-end, watchable, Tests-tab eval runner), the execution/scoring decisions below
> (**D4 in-process runner**, and D5's per-turn `run/<n>` commit mechanic) are
> **superseded by [D6](#d6)**: the golden replay is now a *scenario of the `loop-eval`
> suite* driving the shipped HTTP surface, not a standalone in-process console. D1–D3
> (the bundle format and curation) and D5's *scoring intent* (acceptance verdict +
> trajectory evidence + N-run reliability) are unchanged — only *how* the run is driven
> and where trajectory data comes from changed. See the comparison table at the end of
> this doc for why.

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

<a id="d6"></a>
### D6 — The golden replay is a scenario of the `loop-eval` suite (supersedes D4)

The standalone in-process console runner (D4) worked but sat *outside* the product: it
booted its own DI host, could only be run from a terminal, and produced a console report
no one could watch. Meanwhile `main` shipped `loop-eval` — a suite that already boots an
isolated harness (or targets the live one), drives loops **only through the shipped
operator surface**, and is **startable and watchable from the Tests-tab eval runner**
with a bound dock tab. Rather than keep a parallel, weaker execution path, the golden
replay becomes a **third scenario** in that suite (`tests/loop-eval/golden.mjs`).

What this buys, for one small script + a few shared helpers:

- **Three run modes for free** — automatic isolated test, `--live` against the running
  harness, and startable from the Tests-tab runner (SSE state machine + results) — because
  the scenario conforms to the suite's existing contract (`@@LOOPEVAL@@` verdicts,
  `--describe` manifest, `loopeval-*-live` repo naming, dock create+bind).
- **Real run path** — the loop is armed and polled over HTTP exactly as an operator would,
  not hosted in-process, so the eval also exercises the wiring the product ships.
- **Watchable** — a human sees the driven conversation in the dock and the loop card tick,
  which was the whole reason for the rework.

Two mechanics changed as a consequence:

1. **Materialization.** `materializeGolden` clones `repo.bundle` at `eval/start` and
   **strips the answer** (deletes the `golden` branch, `eval/*` tags, and origin) so the
   agent can't diff to the goal. The bundle file stays on disk; the scorer fetches the
   golden chain back from it under a private `refs/goldeneval/*` namespace at scoring time.
2. **Trajectory source.** D4 committed the scratch tree after every turn via an in-process
   hook. Over the HTTP surface there is no such hook — but the queue loop already commits
   per step, so the run's *own* git history is the trajectory. `compareTrajectory` diffs
   `startSha..work` (the run) against `startSha..golden` (fetched from the bundle) by
   positional files-touched Jaccard overlap, reported as **evidence only** (never a
   pass/fail assert — a correct run may validly diverge).

Reliability (D5) stays, but as `--runs N` **isolated-only**: several materialize→arm→score
cycles against one booted instance, aggregated to a pass-rate + iteration spread. Live
mode is deliberately a single watchable run and refuses `N>1`.

*Trade-off:* trajectory fidelity now depends on the loop's own commit cadence rather than
a forced per-turn snapshot. For the queue loop (commits per tick) this is fine; if a
future loop kind commits coarsely, a per-turn snapshot hook could be reintroduced as a
`loop-eval` delta.

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

## Comparison to `loop-eval` (singular) — the approach shipped on `main`

While this change (`loop-evals`, plural) was in flight, a **separate, independently
shipped** capability landed on `main`: `loop-eval` (singular). They were built in
parallel with almost the same name; the merge keeps both side by side (distinct
namespaces `LoopEvals` vs `LoopEval`, distinct modules, distinct controllers). They
are not duplicates — they answer **different questions** and are worth comparing
before we decide how they should coexist.

### The two approaches in one line each

- **`loop-eval` (main) — an end-to-end acceptance gate.** Hand-authored synthetic
  fixture repos (`tests/loop-eval/fixtures/<s>/repo-template/` + a `goal-check.mjs`
  script or an `expected.json` of prompt→path→regex triples). External Node scripts
  drive the loop through the **real shipped HTTP operator surface** (login → register
  repo → seed chat → arm loop → poll), either against a throwaway isolated instance
  or, with `--live`, the operator's running harness. Scoring is a **binary
  hard-assertion ladder** (final loop status + the fixture's ground-truth check +
  engine bookkeeping), one run per scenario. Richly **watchable** (Tests-tab SSE
  runner, dock binding, `--describe` manifests). **Already shipped and green.**

- **`loop-evals` (ours) — a golden-trajectory measurement instrument.** Ground truth
  is **captured from a real human-babysat session**: start state + plan + full
  transcript + the repo state after every turn, packaged as a `git bundle` via a
  retroactive **curation UI** (span selection, turn↔commit association, per-turn
  labels). An **in-process** runner replays the real loop from the start state; the
  scorer reports an acceptance **verdict + trajectory** (per-turn overlap with the
  human's path) + **N-run reliability**. Built on this branch, preview-verified,
  **not yet on live**.

### Rating table

Convention: **⭐⭐⭐⭐⭐ = most favorable** on that row (highest fidelity, *easiest*,
*safest*, *lowest* burden, etc.). "Hybrid" = keep main's E2E run/observability skin
and feed it our captured golden examples + trajectory/reliability scorer.

| Dimension | `loop-eval` (main) | `loop-evals` (ours) | Hybrid |
|---|:---:|:---:|:---:|
| **Ground-truth fidelity** — how real is what we score against | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Scoring depth** — binary vs trajectory + reliability | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Run-path realism** — drives the real shipped surface | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Dev difficulty** — *easiest to build* | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Dev risk** — *lowest chance of not panning out* | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Authoring cost / new eval** — *cheapest to add one* | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Maintenance burden** — *lowest drift over time* | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Observability** — watchable while it runs | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Maturity** — *how shipped it is today* | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| **Run-cost efficiency** — *fewer tokens/minutes per run* | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Overall (mean)** | **3.8** | **3.3** | **3.6** |

### Reading the scores

- **`loop-eval` wins on maturity, safety, run-path realism, and observability** — it
  is a real, shipped, watchable end-to-end gate that touches only surfaces the product
  already exposes, so there was little to invent and little to break. Its ceiling is
  **what** it measures: synthetic tasks with binary "did the artifact appear" checks
  answer *"can the loop still finish a canned job?"*, not *"how close to a human did it
  drive?"*.
- **`loop-evals` wins on fidelity and scoring depth** — it measures the loop against
  *real work a human actually babysat*, turn by turn, and reports reliability across
  runs. That is the harder, riskier build (curation UX, git-bundle format, in-process
  hosting of a 15-dependency service that "may need a new engine seam") and it is not
  yet on live.
- **The scores are close on purpose** — these are not competing implementations of the
  same thing; they sit at **different points on the same ladder**. `loop-eval` is the
  cheap, fast, before-ship **regression gate**; `loop-evals` is the deeper **tuning /
  benchmarking instrument** you reach for when you want to know whether a loop change
  made trajectories *more human-like*, not just *still passing*.

### Recommendation

Keep both, and pursue the **Hybrid** as the eventual convergence: reuse `loop-eval`'s
proven E2E driver, isolated-instance harness, and watchable Tests-tab/dock skin as the
**execution + observability layer**, and plug in `loop-evals`' captured golden examples
and trajectory/reliability scorer as the **ground-truth + scoring layer**. That keeps
main's low-risk run path and operator UX while raising the fidelity ceiling to real
human trajectories. Near-term, the only naming debt to settle is the singular/plural
collision — see the merge notes.
