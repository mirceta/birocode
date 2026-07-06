## Context

`discover-local-apps` (see `openspec/specs/discover-local-apps/spec.md`) sends a
signature-based prompt to a read-only agent and parses the reply into
`LocalAppExposureReport` (`List<LocalAppFinding{name,port,folder,evidence,startCommand}>`).
The moving parts:

- **Prompt**: `ClaudeWeb.App/Services/StructuredAsk/LocalAppDiscoveryAsk.cs` (lines ~28-68),
  with a `{{OUTPUT_FORMAT}}` placeholder filled by `OutputFormatRenderer` from the typed
  report.
- **Runner**: `StructuredAskRunner.RunAsync` — sends the prompt + schema through
  `ClaudeMonitor.Client` (gateway on localhost:5123), read-only tools `[Read, Grep, Glob, LS]`,
  isolates JSON via `PromptUtils.ExtractJson`, validating-parses via
  `LocalAppExposureReport.Parse`, retries up to 2× on parse failure.
- **Result**: cached in-memory per repo in `LocalAppDiscoveryJobs`; not persisted.

There is no measurement of discovery *quality*. We cannot tell whether a prompt edit
improved or regressed the "find every app" objective. This design defines an offline
harness that turns discovery quality into a number against committed ground truth.

## Goals / Non-Goals

**Goals:**
- A committed golden fixture (hard cases + decoys) with a machine-readable expected answer.
- A scorer producing recall, precision, and explicit missing/extra lists on a folder+port
  identity.
- A runner that exercises the **real** discovery services against a fixture N times and
  aggregates reliability.
- A baseline-vs-candidate prompt comparison that reports a score delta, so prompt
  optimization is evidence-driven.
- Reuse the shipped discovery path — no parallel reimplementation that could drift.

**Non-Goals:**
- No changes to the `discover-local-apps` prompt, endpoints, dock UI, or spec.
- No new End-User surface and no new always-on runtime endpoint.
- No automatic prompt rewriting/search (human picks the winning prompt from deltas);
  automated search can be a later change.
- Not wired into default CI (it needs the ClaudeMonitor gateway + model calls); it is an
  on-demand dev tool.

## Decisions

### D1 — Reuse the production discovery services, don't reimplement
The runner calls the same `LocalAppDiscoveryAsk` / `StructuredAskRunner` path the dock
uses, pointed at the fixture directory as scan root. **Why:** a score is only meaningful
if it reflects the shipped feature; a reimplemented parser or hand-rolled prompt call
would let the eval and production drift, defeating the purpose. *Alternative considered:*
call the HTTP `/local-apps/discover` endpoint — rejected as the primary path because it
drags in job-registry/reattach concerns and a running harness; the eval wants the discovery
core, not the transport. (We may still add a thin end-to-end check later.)

### D2 — Prompt injection point for candidates
To compare a candidate prompt, the prompt text must be a parameter of the discovery call
rather than a hard-coded constant. Decision: make the discovery prompt template
**overridable for the eval** (e.g. the ask accepts an optional prompt-template argument,
defaulting to the shipped constant) so baseline and candidate runs differ only in that
string. **Why:** keeps a single code path; the baseline run uses the exact shipped text,
the candidate run swaps only the template. *Alternative:* copy the prompt into the eval
and maintain it there — rejected (drift, and the baseline would stop being the real prompt).
The minimal seam needed here is an implementation detail resolved during apply; it must not
change shipped behavior when no override is supplied.

### D3 — Fixture lives in-repo, expected answer as JSON
The fixture repo(s) live under the eval's own directory (e.g. `tests/discovery-eval/fixtures/<name>/`)
with a sibling `expected.json` — an array of `{folder, port}` (plus an optional human
`note`). **Why:** committed, reviewable, diffable ground truth; folder+port is the stable
identity from the convention (names are advisory and agent-chosen, ports are the real key).
*Alternative:* point the eval at real sibling repos on disk — rejected as the golden source
(non-portable, non-deterministic, not reviewable), though the harness may optionally accept
an ad-hoc external repo for spot checks.

### D4 — Scoring identity = folder + port
Match discovered→expected on normalized folder path + port. **Why:** the spec's own identity
for an exposure; tolerant of the agent naming an app differently than its directory.
Normalization (case, slashes, trailing separators) is defined in apply. Name/evidence are
reported for debugging but do not decide a match.

### D5 — N-run reliability, not a single pass
The runner repeats each (fixture, prompt) pair N times (configurable) and aggregates:
runs-with-perfect-recall, worst-case recall, and the per-run scores. **Why:** the agent is
non-deterministic; a single green run hides flakiness, and "reliably finds all apps" is the
actual objective. `Date.now()`/RNG constraints don't apply (this is C#/test code), but runs
must be independent (fresh unique ask name per call, as the runner already does).

### D6 — Harness shape
A standalone console/test runner under `tests/` (exact form — xUnit test vs. console app —
decided in apply; leaning console runner so it is explicitly on-demand and prints a report,
with an optional assert-mode for a smoke gate). It reads fixtures, runs discovery, scores,
and prints a per-fixture and aggregate report plus baseline/candidate deltas.

## Risks / Trade-offs

- **[Gateway dependency]** The eval needs the ClaudeMonitor gateway and consumes model
  calls, so it can't run in vanilla CI. → Keep it on-demand; document the prerequisite; make
  N small by default and configurable.
- **[Fixture realism vs. leakage]** A fixture that is too tidy won't be "hard"; one that
  mirrors this repo could let the agent pattern-match `docs/local-exposure-convention.md`
  from memory. → Deliberately include odd layouts and decoys; keep the convention doc's role
  honest (the fixture is a different repo with its own apps).
- **[Ground-truth error]** A wrong `expected.json` makes a correct discovery look wrong (or
  vice versa). → Keep it small, commented, and human-audited; the evidence field in findings
  helps verify each expected app during authoring.
- **[Prompt-seam scope creep]** Adding a prompt override could accidentally change shipped
  behavior. → Default must be byte-identical to today's prompt; add a test asserting the
  no-override path equals the shipped constant.
- **[Non-determinism masks small regressions]** N runs may still miss a rare failure. → Report
  worst-case, not just averages; allow raising N when optimizing.

## Open Questions

- Console runner vs. xUnit fact (or both — a library core with two thin front ends)?
- Default N, and whether to gate a minimal smoke assertion (e.g. baseline recall ≥ threshold
  on a tiny fixture) so at least a cheap check can run without full evals.
- One rich fixture vs. several small focused fixtures (one per hard case) — start with one
  hard fixture, leave room to add more.
