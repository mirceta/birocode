# Loop Evals — golden human-driven runs as the objective function for loop tuning

This harness scores an autopilot loop configuration against a **golden example**: a
recorded human-babysat run of a long task. This directory holds the **golden-example
format** (the `git bundle` + manifest below) and the **committed synthetic examples**.
The eval itself is a scenario of the shipped `loop-eval` suite —
**`tests/loop-eval/golden.mjs`** — so it runs on demand as an automatic isolated test,
`--live` against the running harness, and startable+watchable from the **Tests-tab eval
runner**, exercising the *real* production loop through the shipped operator surface.

The OpenSpec capability is `loop-evals` (see `openspec/changes/loop-evals/` while
in flight, `openspec/specs/loop-evals/` once archived). The earlier standalone in-process
console runner was superseded by the scenario (design D6) and removed.

## Golden example bundle layout

One example = one directory:

```
<example-id>/
  manifest.json        # identity, loop seed hints, turn→commit map, acceptance checks
  plan.md              # the human-readable task statement handed to the loop
  conversation.jsonl   # curated golden transcript, one turn per line
  repo.bundle          # the example repository as a `git bundle` file
```

The bundle is **self-contained**: everything needed to replay and score the task is
in this directory. Nothing in it references the machine it was captured on.

### `repo.bundle` — the repo states are a git history

The example repository is a real git repo, shipped as a single `git bundle` file
(a nested working `.git` cannot be committed inside this repo, and per-turn
directory copies would explode in size). Its refs are the contract:

| Ref | Meaning |
|-----|---------|
| tag `eval/start` | the state the task began from — the runner clones and checks this out |
| branch `golden` | one commit per *associated* human turn, in conversation order |
| tag `eval/final` | the desired final state — always the tip of `golden` |

Inspect any example with:

```
git clone repo.bundle inspect-me
cd inspect-me
git log --oneline eval/start..eval/final
```

### `manifest.json` schema

```jsonc
{
  "id": "hello-notes",                  // must equal the directory name
  "description": "One line: what the task was and why it needed babysitting.",

  // How a loop should be seeded from plan.md. First supported kind: "queue".
  "loop": {
    "kind": "queue",
    "seed": {
      // "plan"  → the whole plan.md becomes ONE queue item (default)
      // "items" → a pre-split queue authored at curation time
      "mode": "plan",
      "items": []                       // used only when mode == "items"
    }
  },

  // Ordered turn→commit association for the curated span. One entry per turn of
  // conversation.jsonl, same order. "commitSha" is null for turns with no commit
  // of their own (discussion, corrections): such turns CARRY FORWARD the previous
  // state. Non-null SHAs must exist on the `golden` branch, in this exact order.
  "turns": [
    { "index": 0, "commitSha": null },
    { "index": 1, "commitSha": "<sha-on-golden>" }
  ],

  // Acceptance checks: ordered commands that must ALL succeed (exit code 0) in a
  // working copy for the task to count as done. This is the pass/fail verdict —
  // byte-identity with eval/final is never required. Commands run from the
  // working-copy root via the platform shell.
  "checks": [
    { "name": "build", "command": "dotnet build" },
    { "name": "greets", "command": "grep -q hello README.md" }
  ]
}
```

### `conversation.jsonl` — the labeled golden transcript

One JSON object per line, one line per curated turn, in order:

```jsonc
{
  "index": 0,               // matches manifest turns[].index
  "role": "user",           // "user" | "assistant"
  "text": "…the turn's message…",
  "label": "instruct",      // hand-authored intent label (user turns; free text allowed)
  "commitSha": "…|null"     // the golden commit capturing the repo state AFTER this
                            // turn; null = carry the previous turn's state forward
}
```

Starter label taxonomy: `instruct`, `course-correct`, `approve`, `verify-ask`,
`unblock` — free text is allowed. v1 uses labels in the trajectory report only,
not in scoring.

**Carry-forward semantics.** Turn↔commit association is partial by nature: a turn
only has its own repo state if a commit was made after it. A turn with
`commitSha: null` maps to the same repo state as the preceding turn. The golden
trajectory is therefore the *chain of associated commits*, with turns grouped
between them.

## Where examples live

- **Committed examples** live under `tests/loop-evals/examples/<id>/` and MUST be
  **synthetic** — a whole-repo bundle contains the full history from `eval/start`
  forward, so real repos may carry secrets or private code.
- **Real captures** go to an external examples root outside this repository,
  configured via the `LOOPEVAL_GOLDEN_EXAMPLES_ROOT` environment variable. Examples
  there are discovered and evaluated exactly like committed ones.

## Running

The eval is the `golden` scenario of the `loop-eval` suite. It spends **real Claude
tokens and minutes** — on demand only, never CI.

```
# Automatic isolated run (boots a throwaway harness, tears it down):
node tests/loop-eval/golden.mjs [--json out.json] [--runs N]

# Watchable run against the running live harness (needs LOOPEVAL_LIVE_PW + gate/kill
# switch on) — see tests/loop-eval for the live-mode contract:
node tests/loop-eval/golden.mjs --live

# Or start it from the harness Tests tab → E2E eval → "Golden-example replay".
```

Environment:

```
LOOPEVAL_GOLDEN_EXAMPLE        example id (default: hello-notes)
LOOPEVAL_GOLDEN_EXAMPLES_ROOT  examples directory (default: tests/loop-evals/examples)
LOOPEVAL_GOLDEN_RUNS  / --runs reliability sweep count, ISOLATED only (default 1)
LOOPEVAL_GOLDEN_MAXITER        hard loop iteration cap (default 18)
LOOPEVAL_GOLDEN_MINUTES        wall-clock deadline per run in minutes (default 30)
```

Each run clones `repo.bundle` at `eval/start` into a scratch working copy **with the
golden answer stripped**, registers it, seeds the real queue loop from `plan.md`
through the shipped surface, watches it drive real agent turns, then scores:

1. **Verdict** — every manifest acceptance check passes in the loop's final working
   copy (mechanical; byte-identity with `eval/final` is never required).
2. **Trajectory (evidence, never the verdict)** — the loop's own per-step commits vs
   the golden chain (fetched back from the bundle): turn counts, per-position
   files-touched overlap, first divergence.
3. **Reliability** — with `--runs N` (isolated): pass rate + iteration spread.

Verdicts stream as `@@LOOPEVAL@@` lines (and to the Tests-tab runner); the full
summary is written with `--json`. The example's own bundle is never mutated by a run.

## Authoring an example

Real examples are curated in the harness's Operator-facing **Loop Eval Curation**
UI (Advanced mode): pick a repo copy + stored conversation, mark the turn span,
associate turns with commits, label turns, author plan + checks, export. See the
`loop-evals` spec. Synthetic examples can also be built by hand: script a tiny
repo's history (commit per pretend-turn, tag `eval/start` / branch `golden` / tag
`eval/final`), `git bundle create repo.bundle --all`, and write the three text
files. `tests/loop-evals/examples/hello-notes/` is the reference — regenerate it
with `tools/make-hello-notes.ps1`.
