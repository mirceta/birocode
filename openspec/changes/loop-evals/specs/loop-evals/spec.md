# loop-evals — Delta Specification

## ADDED Requirements

### Requirement: Golden example bundle packages one human-driven task

The system SHALL define a golden example as a self-contained, version-controlled bundle
holding: a `manifest.json` (identity, description, loop seed hints, turn-to-commit map,
acceptance checks), a `plan.md` (the human-readable task statement), a
`conversation.jsonl` (the curated span of the human-babysat transcript, one turn per
line, each turn carrying its hand-authored intent label and referencing the commit
that captures the repo state after that turn), and a
`repo.bundle` (the example repository as a git bundle in which tag `eval/start` marks
the start state, branch `golden` holds one commit per human turn, and tag `eval/final`
marks the desired final state at the tip of `golden`).

#### Scenario: Bundle is self-contained and auditable

- **WHEN** a developer opens a golden example bundle
- **THEN** they find manifest, plan, transcript, and repo bundle in one directory, and can `git clone repo.bundle` to inspect the start state, every per-turn state, and the final state as ordinary git history

#### Scenario: Transcript turns join to repo states

- **WHEN** a tool reads turn N of `conversation.jsonl`
- **THEN** the turn carries the SHA of the `golden` commit representing the repo state after that turn, and that SHA exists in the cloned example repo

### Requirement: Acceptance checks define the desired state

Each golden example SHALL declare in its manifest an ordered list of acceptance check
commands that MUST all succeed in a working copy for the task to count as done. The
scorer SHALL use acceptance checks as the pass/fail verdict for a loop run, and SHALL
NOT require the loop's final tree to be byte-identical to `eval/final`.

#### Scenario: Checks pass means done

- **WHEN** a loop run's final working copy passes every acceptance check of the example
- **THEN** the run is scored as reaching the desired state, even if its tree differs textually from `eval/final`

#### Scenario: Checks fail means not done

- **WHEN** any acceptance check fails in the loop run's final working copy
- **THEN** the run is scored as not reaching the desired state, and the failing check is named in the report

### Requirement: Golden examples are curated from a repo copy and a stored conversation

The harness SHALL provide an Operator-facing curation flow that builds a golden example
after the fact from a copy of a repository (with its git history) and one of that
repository's stored session conversations. The flow SHALL let the Operator: select the
span of relevant turns; associate in-span turns with commits in the repo copy's history;
hand-label each in-span turn with an intent label; and author the plan and acceptance
checks. Turn-to-commit association SHALL be permitted to be partial: a turn with no
associated commit SHALL carry forward the previous state, so the golden trajectory is
the chain of associated commits with turns grouped between them. Export SHALL produce
the standard bundle — `eval/start` cut before the first associated commit, `golden` as
the associated commit chain, `eval/final` at its tip, plus manifest and labeled
transcript. The curation flow SHALL be read-only toward the source repository and the
stored session.

#### Scenario: Curated span exports a working bundle

- **WHEN** the Operator selects a repo copy and conversation, marks a turn span, associates turns with five commits, labels the turns, and exports
- **THEN** a bundle is produced whose cloned `golden` branch is exactly those five commits in order, with `eval/start` at the state before the first and `eval/final` at the fifth, and whose transcript carries the labels and associations

#### Scenario: A turn without a commit carries the previous state forward

- **WHEN** an in-span turn (e.g. a discussion or correction turn) has no associated commit
- **THEN** the exported transcript maps that turn to the same repo state as the preceding turn, and the golden branch gains no commit for it

#### Scenario: Curation never mutates its sources

- **WHEN** a curation session is performed and exported
- **THEN** the source repository copy's branches and the stored session conversation are byte-identical to before curation began

### Requirement: Runner replays the real loop from the start state

The eval runner SHALL clone a golden example's `repo.bundle` at `eval/start` into a
scratch working copy and drive the production loop engine (the same loop implementations
and composition the harness runs) against it, seeded from the example's `plan.md`
according to the selected loop kind and configuration. The runner SHALL enforce a hard
turn cap and wall-clock timeout, and SHALL commit the scratch tree after each
loop-driven agent turn to a per-run branch so the run's trajectory has the same shape as
the golden branch. The example's own repository SHALL never be mutated by a run.

#### Scenario: Score reflects the shipped loop engine

- **WHEN** the runner evaluates a loop configuration against an example
- **THEN** the production loop engine drives the turns, so a change to the shipped loop logic or recipe changes eval results

#### Scenario: Runaway loop is cut off

- **WHEN** a loop exceeds the configured turn cap or timeout without passing acceptance checks
- **THEN** the run ends, is scored as not done with the cap/timeout as the stated reason, and its partial trajectory is still recorded

#### Scenario: Runs are isolated

- **WHEN** two runs of the same example execute
- **THEN** each uses its own scratch clone, and the golden bundle's contents are unchanged afterward

### Requirement: Score a loop run against the golden run

The scorer SHALL produce, for each run, a machine-comparable and human-readable report
containing: the acceptance verdict with any failing check; the mechanical diff summary
of the run's final tree versus `eval/final` (files added, removed, changed) as
supporting evidence; and a trajectory comparison against the golden turns — at minimum
the run's turn count versus the golden turn count and the per-turn overlap of files
touched, identifying where the run first diverged or stalled.

#### Scenario: Verdict and evidence sit together

- **WHEN** a run passes acceptance checks but its final tree differs from `eval/final`
- **THEN** the report shows a passing verdict alongside the diff summary, so a hollow pass is visible to the reviewer

#### Scenario: Trajectory shows the divergence point

- **WHEN** a run stalls rewriting the same file while the golden run had moved on
- **THEN** the per-turn comparison shows the turn at which the run's touched files stopped overlapping the golden turns

### Requirement: Reliability is measured across repeated runs

The runner SHALL support executing the same (example, loop configuration) pair N times
(N configurable, N greater than 1 permitted) and SHALL report per-run results together
with an aggregate: at minimum the pass rate, the worst-case outcome, and the spread of
turn counts, so an occasionally-successful loop is distinguished from a reliably
successful one.

#### Scenario: Flaky loop is visible in the aggregate

- **WHEN** a loop passes an example on three of five runs
- **THEN** the report shows a 3/5 pass rate with per-run outcomes, not a single passing result

### Requirement: Offline, developer-facing harness

The eval runner and scorer SHALL be offline, developer-facing tools run on demand. The
change SHALL NOT add any End-User dashboard surface or always-on service, and SHALL NOT
alter the runtime behavior of `autopilot-loops` for normal sessions. The curation UI
SHALL be Operator-facing only. Committed example bundles SHALL be
synthetic; real-world captures SHALL be storable outside the repository via a
configurable examples root.

#### Scenario: No End-User surface is added

- **WHEN** this capability ships
- **THEN** End Users see no new dashboard affordance, and armed-off sessions and loops behave exactly as before

#### Scenario: External examples root is honored

- **WHEN** a developer points the runner at an examples root outside the repository
- **THEN** examples there are discovered and evaluated the same as committed ones
