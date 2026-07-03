## 1. Golden fixture

- [x] 1.1 Create a hard fixture repo under `tests/discovery-eval/fixtures/<name>/` with true local apps spanning at least: Node `serve.mjs`, Node `server.js`, PowerShell `serve.ps1`, and an embedded server (e.g. `HttpListener`), using a non-trivial/nested folder layout.
- [x] 1.2 Add decoy directories that look app-like but are NOT valid exposures (no fixed-port listener, no root-served page, or non-served dev tooling) so false positives are catchable.
- [x] 1.3 Author `expected.json` next to the fixture: an array of `{folder, port}` (optional `note`) listing exactly the true apps; hand-audit each against its server file/port evidence.
- [x] 1.4 Add a short `README.md` in the fixture describing each true app and why each decoy is a decoy.

## 2. Scorer

- [x] 2.1 Implement folder+port normalization (case, slashes, trailing separators) and a match function between discovered findings and expected apps.
- [x] 2.2 Compute recall, precision, and explicit missing (expected-not-found) and extra (found-not-expected) lists.
- [x] 2.3 Produce a report object that is both human-readable and machine-comparable between runs.
- [x] 2.4 Unit-test the scorer with synthetic inputs: perfect match (1.0/1.0, empty lists), a miss (missing populated, recall < 1), and an invented app (extra populated, precision < 1).

## 3. Discovery runner (reuse the real path)

- [x] 3.1 Add an eval entry point (console runner under `tests/discovery-eval/`) that invokes the shipped discovery path (`LocalAppDiscoveryAsk` / `StructuredAskRunner`) with the fixture directory as scan root — no reimplemented prompt or parser.
- [x] 3.2 Add a prompt-template seam so discovery accepts an optional prompt override, defaulting to the shipped constant; add a test asserting the no-override path is byte-identical to today's prompt (no shipped behavior change).
- [x] 3.3 Support running a (fixture, prompt) pair N times (N configurable) with independent runs.
- [x] 3.4 Aggregate reliability: per-run scores, count of runs with perfect recall, and worst-case recall.

## 4. Prompt comparison

- [x] 4.1 Load the baseline prompt (shipped constant) and one or more candidate prompt files.
- [x] 4.2 Run each candidate and the baseline over the same fixture(s) and report the per-candidate score and delta vs. baseline, without adopting any candidate.

## 5. Report & invocation

- [x] 5.1 Print a per-fixture report (recall/precision, missing, extra) and an aggregate reliability summary; support an optional assert/smoke mode with a threshold.
- [x] 5.2 Document how to run the eval on demand (ClaudeMonitor gateway prerequisite, how to set N, how to add a candidate prompt) in the fixture/eval README.

## 6. Convention & validation

- [x] 6.1 Build/overwrite `understanding-app/index.html` to visualize the eval loop (fixture → real discovery → score → prompt delta), self-contained with relative URLs.
- [ ] 6.2 Run `openspec validate add-discovery-eval --strict` and fix any issues.
- [ ] 6.3 Run the eval against the baseline prompt to capture a first ground-truthed score as the optimization starting point.
