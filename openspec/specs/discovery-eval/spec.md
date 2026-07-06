# discovery-eval Specification

## Purpose
TBD - created by archiving change add-discovery-eval. Update Purpose after archive.
## Requirements
### Requirement: Golden fixture with a committed expected answer

The system SHALL provide at least one fixture repository together with a committed
expected-answer file that enumerates the true local-app exposures in that fixture. Each
expected app SHALL be identified by its **folder** and **port** (the identity used for
scoring, per `docs/local-exposure-convention.md`). The expected answer SHALL be the
authoritative ground truth for that fixture and SHALL be human-readable and version
controlled so a reviewer can audit it.

#### Scenario: Fixture ships with its ground truth

- **WHEN** the eval harness loads a fixture
- **THEN** it reads a committed expected-answer file listing every true app in that fixture as a folder+port pair, and uses it as the ground truth for scoring

#### Scenario: Expected answer is the identity source

- **WHEN** the scorer matches a discovered app to an expected app
- **THEN** the match is decided on folder+port equality, not on the app's display name or any other reported field

### Requirement: Fixture exercises hard cases and decoys

The fixture(s) SHALL include local-app exposures that are easy to miss — at minimum a
mix of server styles (Node `serve.mjs`, Node `server.js`, PowerShell `serve.ps1`, and an
embedded server such as `HttpListener`) and a non-trivial or nested folder layout — so
that recall is genuinely tested. The fixture(s) SHALL also include **decoys**:
directories that superficially look app-like but are NOT valid local-app exposures under
the convention (e.g. no fixed-port listener, no root-served page, or dev tooling that is
not a served app). Decoys SHALL NOT appear in the expected answer, so that reporting a
decoy counts against precision.

#### Scenario: Multiple server styles are represented

- **WHEN** the fixture is inspected
- **THEN** it contains true apps spanning at least the Node-serve, Node-server, PowerShell-serve, and embedded-server styles, each listed in the expected answer

#### Scenario: A decoy that is reported hurts precision

- **WHEN** discovery reports a directory that is a decoy (not in the expected answer)
- **THEN** the scorer counts it as a false positive that lowers precision, rather than ignoring it

### Requirement: Score discovery output against the expected answer

The system SHALL compare a discovery result for a fixture against that fixture's expected
answer and compute, on the folder+port identity: **recall** (fraction of expected apps
that were found), **precision** (fraction of reported apps that were correct), the
explicit list of **missing** apps (expected but not found), and the explicit list of
**extra** apps (reported but not expected). The score SHALL be reported in a form a
developer can read at a glance and that a program can compare between runs.

#### Scenario: Perfect discovery scores 100% with no missing or extra

- **WHEN** discovery returns exactly the expected set of apps (by folder+port) for a fixture
- **THEN** recall and precision are both reported as 1.0 (100%) with empty missing and extra lists

#### Scenario: A missed app is reported as missing and lowers recall

- **WHEN** discovery fails to report an app that is in the expected answer
- **THEN** that app appears in the missing list and recall is below 1.0

#### Scenario: An invented app is reported as extra and lowers precision

- **WHEN** discovery reports an app that is not in the expected answer
- **THEN** that app appears in the extra list and precision is below 1.0

### Requirement: Evaluate the real discovery path

The eval SHALL exercise the production discovery path — the same prompt, structured-ask
runner, JSON extraction, and validating parse used by `discover-local-apps` — rather than
a reimplementation or a stubbed parser, so that a score reflects what the shipped feature
would actually return. The eval SHALL point discovery at the fixture repository's own
directory as the scan root.

#### Scenario: Score reflects the shipped feature

- **WHEN** the eval runs discovery against a fixture
- **THEN** it invokes the same discovery service the dock uses, so a change to the shipped prompt or parser changes the eval score

#### Scenario: Scan root is the fixture

- **WHEN** discovery is invoked by the eval for a fixture
- **THEN** the fixture repository's own directory is used as the scan root and only that fixture is scanned for that run

### Requirement: Measure reliability across repeated runs

Because the discovery agent is non-deterministic, the harness SHALL support running the
same fixture **N times** (N configurable, N greater than 1 permitted) and SHALL report
per-run scores together with an aggregate — at minimum the number of runs that achieved
perfect recall and the worst-case recall observed — so that flaky, sometimes-complete
discovery is distinguished from reliably-complete discovery.

#### Scenario: Repeated runs surface flakiness

- **WHEN** the harness runs a fixture N times and discovery finds all apps on some runs but misses an app on others
- **THEN** the report shows the per-run variation and an aggregate that reflects less-than-perfect reliability, not just a single passing run

#### Scenario: A single reliable configuration is visible

- **WHEN** every one of the N runs returns the complete expected set
- **THEN** the aggregate reports full reliability (all runs perfect, worst-case recall 1.0)

### Requirement: Compare a candidate prompt against the baseline

The harness SHALL treat the eval score as the objective function for prompt optimization.
It SHALL evaluate the current (baseline) discovery prompt and one or more candidate
prompts against the same fixture(s) and report the **score delta** between each candidate
and the baseline, so the best-performing prompt can be chosen from evidence. Running a
candidate prompt through the eval SHALL NOT modify the shipped discovery prompt; adopting
a winning prompt is a separate, explicit change.

#### Scenario: Candidate that improves recall shows a positive delta

- **WHEN** a candidate prompt finds apps on the fixture that the baseline prompt misses
- **THEN** the harness reports the candidate's score and a positive delta versus the baseline on the same fixture

#### Scenario: Evaluating a candidate does not ship it

- **WHEN** a candidate prompt is evaluated
- **THEN** the shipped discovery prompt used by the dock is unchanged, and no candidate is adopted as a side effect of scoring it

### Requirement: Offline, dev-facing harness

The harness SHALL be an offline, developer-facing tool run on demand. It SHALL NOT add an
End-User dashboard affordance and SHALL NOT add a new harness runtime endpoint; it SHALL
NOT alter the behavior, prompt, endpoints, or dock UI of the `discover-local-apps`
capability. Its result is a report for the developer, not a product surface.

#### Scenario: No End-User surface is added

- **WHEN** the eval harness is added
- **THEN** no new dashboard control or runtime HTTP endpoint is exposed to End Users, and the discover-local-apps feature behaves exactly as before

#### Scenario: Run on demand by a developer

- **WHEN** a developer wants a discovery quality signal
- **THEN** they run the harness on demand and receive a precision/recall report, without any always-on service being introduced

