## Why

The `discover-local-apps` feature asks a read-only agent to find *every* local-app
exposure in a repository, but we have **no way to measure whether it actually does**.
When we edit the discovery prompt (`LocalAppDiscoveryAsk.cs`), we're flying blind — a
change might improve recall on one repo and silently regress another, and we'd never
know. To reliably optimize the prompt we need a ground-truthed, repeatable signal:
run discovery against a repo whose true set of apps is known, and score how close it got.

## What Changes

- Add an **offline, dev-facing eval harness** for `discover-local-apps`. It is a test
  tool, not an End-User web feature — no new dashboard UI, no new runtime endpoint.
- Add a **golden fixture**: one or more deliberately "hard" fixture repositories plus a
  committed **expected-answer file** listing the true local apps (keyed on
  **folder + port**, per `docs/local-exposure-convention.md`). Hard = apps that are easy
  to miss (mixed `serve.mjs` / `server.js` / `serve.ps1` / embedded `HttpListener`,
  non-standard layouts, nested folders) **plus decoys** that look app-like but are NOT
  valid exposures and MUST NOT be reported.
- Add a **scorer** that diffs discovery output against the golden answer and reports
  **recall** (found all true apps?), **precision** (invented none?), and the explicit
  **missing** and **extra** app lists, matching on the folder+port identity.
- Add a **repeatable runner** that invokes the **real discovery path** (reusing
  `LocalAppDiscoveryAsk` / `StructuredAskRunner`, not a reimplementation) **N times** over
  a fixture to measure reliability/flakiness, not just a single lucky pass — reporting
  aggregate and per-run scores.
- Add a **prompt-optimization loop**: the eval score is the objective function. The
  current prompt is the baseline; candidate prompts can be run against the same fixtures
  and the harness reports the **score delta** so we can pick the best-performing prompt.
- Build the **understanding-app** for this eval (repo convention).

## Capabilities

### New Capabilities
- `discovery-eval`: An offline harness that measures `discover-local-apps` quality
  against committed golden fixtures — golden fixture + expected answer, precision/recall
  scoring on a folder+port identity, an N-run reliability runner over the real discovery
  path, and a baseline-vs-candidate prompt comparison that yields a score delta for
  prompt optimization.

### Modified Capabilities
<!-- None. This change EVALUATES discover-local-apps; it does not change that
     capability's behavior or its spec. -->

## Impact

- **New code (test/dev only):** an eval runner + scorer that reuses the existing
  discovery services (`ClaudeWeb.App/Services/StructuredAsk/LocalAppDiscoveryAsk.cs`,
  `StructuredAskRunner.cs`, `LocalAppExposureReport.cs`). Likely a new test project or a
  standalone runner under `tests/` — decided in design.md.
- **New fixtures:** committed fixture repo(s) + `expected.json` golden answer, plus any
  candidate-prompt files.
- **Runtime dependency:** the eval invokes the real discovery path, which calls the
  ClaudeMonitor gateway (localhost:5123) and consumes model calls — so it is an
  on-demand dev tool, not part of CI-by-default unless the gateway is available.
- **No changes** to the `discover-local-apps` prompt behavior, endpoints, dock UI, or
  its spec as part of this change; prompt edits that the eval later motivates are
  separate changes.
- **Understanding-app** at `understanding-app/index.html` is overwritten to explain the
  eval loop.
