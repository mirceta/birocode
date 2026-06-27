# discover-local-apps Specification

## Purpose
On demand from a repository's agent dock, discover every directory in that repository
that exposes itself as a local app (a self-serving HTTP server on a fixed loopback port,
per `docs/local-exposure-convention.md`) and return each one's name and port as a typed,
validated, source-audited result. Built on a reusable structured-output prompting
mechanism (typed report → rendered schema → send via the reused `ClaudeMonitor.Client` →
extract JSON → validating parse → retry), discovery is read-only, signature-based (names
no app), and single-repo per call.
## Requirements
### Requirement: Discover local-app exposures by signature, not by name

The system SHALL discover local-app exposures by sending an agent a prompt that
describes the *shape* of a local-app exposure — a directory containing its own HTTP
server that binds a fixed loopback port and follows `docs/local-exposure-convention.md`
(dual-stack `127.0.0.1`+`[::1]`, serves a page at `GET /`, relative-URL assets). The
prompt SHALL NOT name, enumerate, or assume the existence of any specific app or repo
layout, so discovery keeps working unchanged as apps are added or when scanning an
unfamiliar repository.

#### Scenario: Finds apps it was never told about

- **WHEN** a repository contains one or more directories that each run a server on a fixed loopback port per the convention
- **THEN** the discovery returns every such directory's name and port, even though the prompt never mentioned them

#### Scenario: Keeps working when more apps are added

- **WHEN** a repository that previously exposed two local apps later exposes five
- **THEN** the same unchanged prompt returns all five, with no code or prompt edit required

#### Scenario: No exposures found

- **WHEN** a repository contains no directory matching the local-app-exposure shape
- **THEN** the discovery returns an empty list of apps for that repository rather than an error or a fabricated entry

### Requirement: Return a typed, validated, source-audited result

The system SHALL define a typed report whose properties carry the field-name and
per-field description attributes, and SHALL deserialize the agent's reply into that
report through a validating parse. Each discovered app SHALL carry its `name`, its
`port`, the `folder` it lives in, `evidence` (the file and line where the port is
bound), and a `startCommand` (the command that launches the app, e.g.
`node serve.mjs`). The `startCommand` SHALL be OPTIONAL: an empty value is valid
(meaning "could not be determined") and SHALL NOT fail the parse. The parse SHALL
reject a reply in which any finding has an empty name or folder, or a port outside
1–65535; an empty list of findings SHALL be valid (meaning "none found").

#### Scenario: Valid findings deserialize

- **WHEN** the agent returns well-formed JSON with each finding carrying a name, a port in range, a folder, and evidence
- **THEN** the system produces the typed report and treats the discovery as successful

#### Scenario: Invalid finding is rejected

- **WHEN** the agent returns a finding whose port is 0 or out of range, or whose name or folder is empty
- **THEN** the validating parse fails for that reply rather than accepting the malformed finding

#### Scenario: Missing start command is accepted

- **WHEN** the agent returns a finding with a valid name, port, and folder but an empty `startCommand`
- **THEN** the parse succeeds and the finding is kept, with no start command available for it

### Requirement: The required-output schema is derived from the typed report

The system SHALL render the typed report into the prompt's required-output section
(an "Output format" footer with an output-format placeholder) by reflecting over the
report's field-name and description attributes, so the prompt's declared schema and the
deserialization target share a single source of truth and cannot drift.

#### Scenario: Schema and parser stay in sync

- **WHEN** a field is added, renamed, or re-described on the typed report
- **THEN** the prompt's rendered output schema reflects that change without any separate hand-edit to the prompt text

### Requirement: Isolate JSON and retry on malformed replies

The system SHALL extract the JSON object from the agent's raw reply by stripping
conversational prose and markdown code fences and balancing braces to the first complete
object. When the validating parse fails, the system SHALL retry up to a bounded number of
times, each retry feeding the previous (bad) reply and the validation error back to the
agent and requesting corrected JSON only.

#### Scenario: Reply wrapped in prose is still parsed

- **WHEN** the agent prefixes or wraps its JSON with explanatory text or fences
- **THEN** the system isolates and parses the embedded JSON object

#### Scenario: Bad JSON triggers a correction round

- **WHEN** a reply fails the validating parse and retries remain
- **THEN** the system re-prompts the agent with the bad reply and the error, and attempts to parse the corrected reply

#### Scenario: Retries exhausted

- **WHEN** the reply still fails to parse after the retry budget is exhausted
- **THEN** the system reports the discovery for that repository as failed rather than returning partial or fabricated findings

### Requirement: Run as a read-only scan

The system SHALL run the discovery agent under a read-only policy that permits reading and
searching a repository but structurally prevents modifying any file in it — enforced by
restricting the agent to non-mutating tools only (excluding write/edit/shell tools).

#### Scenario: Discovery never mutates a scanned repo

- **WHEN** the discovery agent runs against any repository
- **THEN** no file in that repository is created, edited, or deleted by the discovery

### Requirement: Discover one repository on demand

The system SHALL run discovery for a single, caller-specified repository on demand,
using that repository's own working directory as the agent's scan root, and return that
repository's discovered apps. Discovery SHALL NOT be triggered automatically and SHALL
NOT fan out across all registered repositories in one call. Because discovery is scoped
to one repository per call, apps that live in a different repository SHALL be
discoverable by running discovery against that repository.

#### Scenario: Discover the requested repository

- **WHEN** discovery is requested for a given repository
- **THEN** only that repository's working directory is scanned and its discovered apps are returned

#### Scenario: Apps in another repository are found via that repository

- **WHEN** discovery is run against a repository other than the harness's own repo
- **THEN** that repository's local apps are returned, without the call touching any other repository

#### Scenario: A failed discovery surfaces to the caller

- **WHEN** discovery for the requested repository fails (parse exhausted, gateway unavailable, or missing working directory)
- **THEN** the caller receives an explicit failure for that request rather than partial or fabricated findings

### Requirement: Triggered from the agent dock

The system SHALL let the operator trigger discovery for a repository from that
repository's agent dock in the dashboard, via an explicit "Discover local apps" action.
When invoked, the action SHALL run discovery for the dock's repository and present the
returned structured findings (name and port per app) to the operator. From the presented
findings, the operator SHALL be able to **register** a discovered app as a local app with
a single per-row action that submits that app's name and port to the existing
registered-apps endpoint; a discovered app whose port already matches a registered local
app SHALL instead be shown as already registered rather than offering the register action.
For each discovered app the dock SHALL show whether the app is currently running, SHALL
offer a per-row **Run** action that starts the app (enabled only when a start command is
known and the app is not already running), and SHALL offer a **Check** action that
refreshes the running state of the presented findings. The discovery scan itself remains
read-only — registration and run are separate, operator-initiated calls, not side effects
of discovery. The action is an Advanced-mode affordance.

#### Scenario: Click discovers the dock's repo

- **WHEN** the operator clicks "Discover local apps" in an agent dock pinned to a repository
- **THEN** discovery runs for that dock's repository and the structured list of discovered apps (with ports) is shown in that dock

#### Scenario: Per-dock scope

- **WHEN** the operator triggers discovery from a dock pinned to one repository while other docks are pinned to other repositories
- **THEN** only the triggering dock's repository is scanned for that action

#### Scenario: Register a discovered app from the dock

- **WHEN** the operator clicks the register action on a discovered app that is not yet registered
- **THEN** that app's name and port are submitted to the registered-apps endpoint, and once it is registered the dock's local-app list (and the discovered row's state) reflect the new app without a manual refresh

#### Scenario: Already-registered app shows its state

- **WHEN** a discovered app's port matches an app that is already registered for that repository
- **THEN** the dock shows that discovered row as already registered and does not offer the register action for it

#### Scenario: A failed registration is surfaced for that row

- **WHEN** registering a discovered app fails
- **THEN** the failure is shown for that discovered row and the rest of the discovered list remains actionable

#### Scenario: Run a discovered app from the dock

- **WHEN** the operator clicks Run on a discovered app that has a known start command and is not already running
- **THEN** the app's start command is launched for that repository and, after a short delay, the row's running state is re-checked and reflects whether the app came up

#### Scenario: Run is unavailable without a start command

- **WHEN** a discovered app has no known start command
- **THEN** the dock does not offer (or disables) the Run action for that row

#### Scenario: Check refreshes running state

- **WHEN** the operator clicks Check
- **THEN** the running state shown for each discovered app is recomputed from a live port check and updated in place

### Requirement: Read-only discovery endpoint

The system SHALL expose a read-only HTTP endpoint that, given the caller's repository,
runs discovery for that one repository and returns its structured findings. The endpoint
SHALL NOT create, modify, or register any local app, and SHALL NOT read the
registered-apps store as its source of discovery.

#### Scenario: Discover the caller's repository

- **WHEN** a client calls the discovery endpoint for a repository
- **THEN** it receives that repository's structured findings, and no local app is registered or modified as a result

#### Scenario: Endpoint does not fan out

- **WHEN** the discovery endpoint is called
- **THEN** it scans only the requested repository and does not iterate or scan other registered repositories

### Requirement: Report each app's live running state

The system SHALL report, for each discovered app, whether that app is currently
running, determined at the time the discovery state is read by checking the app's
loopback port for an active TCP listener — NOT a value frozen into the scan result.
This running flag SHALL be recomputed each time the discovery state is fetched, so
it reflects the present moment rather than the (potentially much earlier) time the
scan ran. Determining running state SHALL NOT require running the discovery agent
and SHALL NOT modify the repository.

#### Scenario: Running state reflects the present, not scan time

- **WHEN** a discovered app's server is started or stopped after the scan completed, and the dock then reads the discovery state
- **THEN** the reported running state reflects whether the port is accepting connections at read time, not what was true when the scan ran

#### Scenario: Running state for an app that is up

- **WHEN** a discovered app is listening on its port and the discovery state is fetched
- **THEN** that app is reported as running

#### Scenario: Running state for an app that is down

- **WHEN** a discovered app is not listening on its port and the discovery state is fetched
- **THEN** that app is reported as not running

### Requirement: Start a discovered app on demand

The system SHALL expose an action that starts a single discovered app for the
caller's repository, identified by its port. The system SHALL resolve the command
to run from that repository's own most recent discovery result (the stored
`startCommand` of the finding whose port matches), NOT from a command supplied by
the caller, and SHALL launch it in that app's folder as a detached process so it
keeps running after the request completes. The action SHALL fail with an explicit
error when there is no completed discovery for the repository, no discovered app
matches the given port, or the matching app has no known start command. Starting an
app SHALL NOT modify the repository's files.

#### Scenario: Start a discovered app

- **WHEN** the caller requests to run a discovered app by port and that app has a known start command in the repository's latest discovery result
- **THEN** the system launches that stored start command in the app's folder as a detached process and reports success

#### Scenario: Command comes from the scan, not the caller

- **WHEN** the caller requests to run an app by port
- **THEN** the command executed is the one discovery extracted and stored for that port, and any command-like value supplied by the caller is ignored

#### Scenario: Run without a runnable target is rejected

- **WHEN** the caller requests to run an app for which there is no completed discovery, no finding matches the port, or the matching finding has no start command
- **THEN** the system returns an explicit error rather than launching anything

