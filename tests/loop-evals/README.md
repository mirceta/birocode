# Loop Evals — golden human-driven runs as the objective function for loop tuning

This harness scores an autopilot loop configuration against a **golden example**: a
recorded human-babysat run of a long task. It follows the `tests/discovery-eval/`
posture — an offline, developer-facing console tool run on demand, exercising the
*real* production loop services.

The OpenSpec capability is `loop-evals` (see `openspec/changes/loop-evals/` while
in flight, `openspec/specs/loop-evals/` once archived).

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
  configured via `--examples-root <dir>` (or the `LOOPEVALS_EXAMPLES_ROOT`
  environment variable). Examples there are discovered and evaluated exactly like
  committed ones.

## Running

```
dotnet run --project tests/loop-evals/LoopEvals -- --example hello-notes [options]

  --examples-root <dir>   examples directory (default: tests/loop-evals/examples)
  --runs <N>              repeat the (example, config) pair N times (default 1)
  --turn-cap <N>          hard cap on loop-driven agent turns (default 12)
  --timeout-min <N>       wall-clock timeout per run in minutes (default 30)
  --out <dir>             where run reports land (default: .loop-evals/ scratch)
```

Each run clones `repo.bundle` at `eval/start` into its own scratch working copy,
drives the production queue loop seeded from `plan.md`, commits the scratch tree
after every completed agent turn to a `run/<n>` branch, then scores:

1. **Outcome** — acceptance checks in the final working copy (the verdict), plus
   the diff of loop-final vs `eval/final` as evidence.
2. **Trajectory** — turn counts and per-turn files-touched overlap vs the golden
   commit chain; first divergence point.
3. **Reliability** — with `--runs N`: pass rate, worst case, turn-count spread.

Reports are written as JSON per run plus an aggregate, and printed as a console
table. The example's own bundle is never mutated by a run.

## Authoring an example

Real examples are curated in the harness's Operator-facing **Loop Eval Curation**
UI (Advanced mode): pick a repo copy + stored conversation, mark the turn span,
associate turns with commits, label turns, author plan + checks, export. See the
`loop-evals` spec. Synthetic examples can also be built by hand: script a tiny
repo's history (commit per pretend-turn, tag `eval/start` / branch `golden` / tag
`eval/final`), `git bundle create repo.bundle --all`, and write the three text
files. `tests/loop-evals/examples/hello-notes/` is the reference — regenerate it
with `tools/make-hello-notes.ps1`.
