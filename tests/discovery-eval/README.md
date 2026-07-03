# discovery-eval — offline eval for `discover-local-apps`

Measures whether the dock's **Discover Local Apps** agent actually finds every
local-app exposure, against committed ground truth, so the discovery prompt can
be optimized with evidence. Spec: `openspec/changes/add-discovery-eval/`.

The harness reuses the **shipped** discovery path (`LocalAppDiscoveryAsk` →
`StructuredAskRunner` → ClaudeMonitor gateway) — same prompt plumbing, JSON
extraction, validating parse, and retry loop the dashboard uses. Only the scan
root (a fixture) and optionally the prompt template differ.

## Prerequisites

- The **ClaudeMonitor gateway** on `localhost:5123`
  (`birokrat-ai-platform\ClaudeMonitor\ClaudeMonitor.App`). Each discovery run
  is a real model call — this is an on-demand dev tool, not default CI.
- `selftest` needs nothing: it is fully offline.

## Run

```powershell
# offline sanity: scorer unit cases + prompt-seam identity (no gateway needed)
dotnet run --project tests/discovery-eval/DiscoveryEval -- selftest

# baseline eval: 3 runs of the shipped prompt against the hard-mix fixture
dotnet run --project tests/discovery-eval/DiscoveryEval -- run

# more runs, machine-readable report, smoke threshold
dotnet run --project tests/discovery-eval/DiscoveryEval -- run --n 5 --json out.json --assert-recall 1.0

# compare candidate prompts against the baseline
dotnet run --project tests/discovery-eval/DiscoveryEval -- run --candidates tests/discovery-eval/prompts
```

| Flag | Meaning | Default |
|---|---|---|
| `--fixture <dir>` | fixture repo to scan (needs `expected.json`) | `fixtures/hard-mix` |
| `--n <N>` | runs per prompt (reliability, not one lucky pass) | 3 |
| `--candidates <dir>` | each `*.txt`/`*.md` file = one candidate prompt template | none |
| `--json <file>` | write the aggregates as JSON | none |
| `--assert-recall <t>` | exit 1 if baseline worst-case recall < t (smoke gate) | off |

## Reading the report

Per run: `recall` (found / expected), `precision` (correct / reported), and the
explicit `missing` / `extra` lists — identity is **folder + port** (normalized;
names are agent-chosen and don't matter). Per prompt: perfect-run count,
worst-case recall (the reliability number that matters), means. With
candidates: a delta table vs. baseline. **Scoring a candidate never changes the
shipped prompt** — adopting a winner is a separate, explicit change to
`LocalAppDiscoveryAsk.cs`.

## Adding a candidate prompt

Drop a `.txt` file in `prompts/` containing the full template **with the
`{{OUTPUT_FORMAT}}` placeholder** (see `prompts/example-stricter.txt`). Files
without the placeholder are skipped with a warning.

## Fixtures

`fixtures/hard-mix/` — 4 true apps (serve.mjs / server.js / serve.ps1 /
embedded C# HttpListener; nested layouts) + 5 decoys (client-only code,
unserved static site, ephemeral-port proxy, IPv4-only bind, listen-calls in
markdown). Ground truth: `expected.json`, audited via each entry's `note`.
Details: `fixtures/hard-mix/README.md`.

**Side effect to know about:** the fixture apps are *genuine* exposures, so
running Discover on the birocode repo itself will legitimately find them under
`tests/`. That is correct behavior, not a bug.

## Adding a fixture

Create `fixtures/<name>/` with the apps/decoys and an `expected.json`
(`[{"folder": "...", "port": NNNN, "note": "evidence"}]`), plus a README table
like hard-mix's. Run with `--fixture tests/discovery-eval/fixtures/<name>`.
