# discover-local-apps — delta for local-app-lifecycle-controls

## ADDED Requirements

### Requirement: Stop a running cached app by port

The system SHALL expose an action that stops a running local app for the caller's
repository, identified by its port. Because launched apps are detached and no PID
is retained, the system SHALL resolve the owning process live at stop time — from
the port's active loopback TCP listener to its process — and SHALL terminate that
process together with its child processes. The action SHALL be bounded by the
repository's discovery result: a port that does not match a cached/discovered
finding for the caller's repository SHALL be rejected without touching any
process. The system SHALL structurally refuse to stop the harness's own process
(including when the resolved process is the harness itself or one of the
harness's ancestors), so that in Self-Development a cached finding on the
harness's port can never shoot down the harness. The action SHALL fail with an
explicit error when nothing is listening on the port. Stopping an app SHALL NOT
modify the repository's files and SHALL NOT remove the finding from the cache.

#### Scenario: Stop a running app

- **WHEN** the caller requests to stop a cached app whose port has an active listener owned by a normal product process
- **THEN** the owning process and its children are terminated, and a subsequent liveness check reports the app as not running

#### Scenario: Apps started outside the harness can still be stopped

- **WHEN** a cached app's server was started by hand on the host (never launched via Run)
- **THEN** stop still resolves the owning process from the port at stop time and terminates it

#### Scenario: Stop with nothing listening is rejected

- **WHEN** the caller requests to stop a cached app whose port has no active listener
- **THEN** the system returns an explicit error and no process is touched

#### Scenario: Port outside the repository's findings is rejected

- **WHEN** the caller requests to stop a port that matches no cached/discovered finding for the caller's repository
- **THEN** the system returns an explicit error and no process is touched, even if something is listening on that port

#### Scenario: The harness never stops itself

- **WHEN** the process resolved from the port is the harness's own process
- **THEN** the system refuses with an explicit error and the harness keeps running

#### Scenario: Stop leaves cache and repository intact

- **WHEN** a cached app is stopped
- **THEN** no file in the repository is changed and the finding remains in the cache with its commands, ready to be started again

### Requirement: Restart a cached app

The system SHALL expose an action that restarts a cached app for the caller's
repository, identified by its port: stop it when it is running (same resolution
and guards as the stop action), wait — bounded — until the port is actually free,
then launch the finding's stored `startCommand` detached in the app's folder
(same resolution and launch semantics as the run action). The action SHALL
require a known start command, and SHALL fail with an explicit error — without
launching — when the stop phase fails or the port does not free up within the
bound. When the app is not running, restart SHALL behave as a plain start.

#### Scenario: Restart a running app

- **WHEN** the caller requests a restart for a cached app that is running and has a known start command
- **THEN** the owning process is stopped, the system waits for the port to free, the stored start command is launched detached, and the outcome is reported

#### Scenario: Restart a stopped app just starts it

- **WHEN** the caller requests a restart for a cached app that is not running
- **THEN** the system skips the stop phase and launches the stored start command detached

#### Scenario: Restart without a start command is rejected

- **WHEN** the caller requests a restart for a cached app with no known start command
- **THEN** the system returns an explicit error and nothing is stopped or launched

#### Scenario: Port that never frees aborts the restart

- **WHEN** the stop phase completes but the port is still occupied when the bounded wait expires
- **THEN** the system reports an explicit error and does not launch a second instance on a busy port

### Requirement: Rebuild a cached app on demand

The system SHALL expose an action that rebuilds a cached app for the caller's
repository, identified by its port, by running the finding's stored
`buildCommand` in the app's folder. The rebuild SHALL run as a backend-owned job
whose lifetime is independent of the HTTP request (a client disconnect does not
cancel it), SHALL capture the build's output and exit code, and SHALL expose the
job's state (running, succeeded, failed) with that captured outcome so the panel
can present it. At most one rebuild per app SHALL run at a time: a rebuild
request while one is already running for that port SHALL join or report the
in-flight job rather than starting a second concurrent build. The action SHALL
fail with an explicit error when the finding has no known build command.
Rebuilding SHALL NOT stop or start the app's server process — restarting into
the new build is the operator's separate action.

#### Scenario: Successful rebuild

- **WHEN** the caller requests a rebuild for a cached app with a known build command and the command exits successfully
- **THEN** the job reports success with the captured output, and the app's process is neither stopped nor started by the rebuild

#### Scenario: Failing build is reported honestly

- **WHEN** the build command exits non-zero
- **THEN** the job reports failure with the exit code and captured output rather than a silent or fabricated success

#### Scenario: Rebuild without a build command is rejected

- **WHEN** the caller requests a rebuild for a finding whose build command is unknown (empty)
- **THEN** the system returns an explicit error and no command is run

#### Scenario: Rebuild survives client disconnect

- **WHEN** the operator triggers a rebuild and refreshes or closes the page before it finishes
- **THEN** the build runs to completion server-side and its outcome is observable when the panel loads again

#### Scenario: One rebuild per app at a time

- **WHEN** a rebuild is requested for a port whose rebuild job is still running
- **THEN** the system joins or reports the in-flight job instead of starting a second concurrent build

### Requirement: Backfill build commands for cached findings

The system SHALL let the operator backfill build commands into a repository's
existing discovery cache without a full re-discovery, so caches written before
`buildCommand` existed become rebuild-capable. The backfill SHALL send a
targeted agent ask through the same structured-output mechanism as discovery
(typed report → rendered schema → the reused agent gateway → JSON extraction →
validating parse → bounded retry): the prompt SHALL enumerate the cached
findings that lack a build command (their name, folder, port, and start
command) and ask the agent to inspect those folders only and return, per port,
the command that builds that app's servable artifacts — an empty value meaning
the app is build-less or the command could not be determined. The validating
parse SHALL reject a reply that reports a port outside the enumerated set. The
backfill SHALL run under the same read-only agent policy as discovery, and as a
backend-owned job that survives client disconnect. A successful backfill SHALL
merge into the cache by port, updating only each matched finding's
`buildCommand` (an empty returned value is recorded as empty) and leaving
every other field and every unmatched finding untouched. When the repository
has no cache, or no cached finding lacks a build command, the action SHALL
report an explicit nothing-to-do outcome rather than running the agent. The
affordance SHALL live in the Discover Local Apps panel as an Advanced-mode
action that reflects the job in flight and its outcome.

#### Scenario: Old cache becomes rebuild-capable

- **WHEN** the operator runs the backfill for a repository whose cache predates `buildCommand` and the agent determines build commands for some findings
- **THEN** those findings' `buildCommand` values are merged into the cache by port, Rebuild becomes available for them, and their name/folder/evidence/startCommand and discovery times are unchanged

#### Scenario: Build-less apps are recorded honestly

- **WHEN** the agent reports an empty build command for an enumerated finding
- **THEN** the cache records it as empty, Rebuild stays unavailable for that row, and the backfill still completes successfully

#### Scenario: Only enumerated ports are accepted

- **WHEN** the agent's reply includes a port that was not in the enumerated set
- **THEN** the validating parse rejects the reply and the bounded retry feeds the error back, rather than merging an un-requested port

#### Scenario: Nothing to backfill is an explicit no-op

- **WHEN** the operator runs the backfill for a repository with no cache, or whose cached findings all have build commands
- **THEN** the system reports there is nothing to backfill and does not run the agent

#### Scenario: Backfill is read-only and disconnect-proof

- **WHEN** a backfill runs and the operator refreshes or closes the page mid-run
- **THEN** the agent job continues to completion under the read-only policy, no repository file is changed, and the merged result is observable when the panel loads again

## MODIFIED Requirements

### Requirement: Return a typed, validated, source-audited result

The system SHALL define a typed report whose properties carry the field-name and
per-field description attributes, and SHALL deserialize the agent's reply into that
report through a validating parse. Each discovered app SHALL carry its `name`, its
`port`, the `folder` it lives in, `evidence` (the file and line where the port is
bound), a `startCommand` (the command that launches the app, e.g.
`node serve.mjs`), and a `buildCommand` (the command that builds the app's
servable artifacts, e.g. `npm run build`, run from its folder). The
`startCommand` and `buildCommand` SHALL be OPTIONAL: an empty value is valid
(meaning "could not be determined" — for `buildCommand` also covering build-less
apps) and SHALL NOT fail the parse. The parse SHALL reject a reply in which any
finding has an empty name or folder, or a port outside 1–65535; an empty list of
findings SHALL be valid (meaning "none found").

#### Scenario: Valid findings deserialize

- **WHEN** the agent returns well-formed JSON with each finding carrying a name, a port in range, a folder, and evidence
- **THEN** the system produces the typed report and treats the discovery as successful

#### Scenario: Invalid finding is rejected

- **WHEN** the agent returns a finding whose port is 0 or out of range, or whose name or folder is empty
- **THEN** the validating parse fails for that reply rather than accepting the malformed finding

#### Scenario: Missing start command is accepted

- **WHEN** the agent returns a finding with a valid name, port, and folder but an empty `startCommand`
- **THEN** the parse succeeds and the finding is kept, with no start command available for it

#### Scenario: Missing build command is accepted

- **WHEN** the agent returns a finding with a valid name, port, and folder but an empty or absent `buildCommand`
- **THEN** the parse succeeds and the finding is kept, with no build command available for it

### Requirement: Persist a completed discovery to a per-repo on-disk cache

When a discovery completes successfully, the system SHALL merge its typed result into
a durable, per-repository on-disk cache by **union on port**: findings from the new
scan SHALL be added, a cached finding whose port matches a new finding SHALL be
replaced by the newer finding, and cached findings whose ports the new scan did not
report SHALL be kept. Removal of a cached finding SHALL happen only through the
explicit cache-edit action, never as a side effect of a scan. Each cached finding
SHALL carry the discovered apps' fields (`name`, `port`, `folder`, `evidence`,
`startCommand`, `buildCommand`) plus the time that finding was last discovered; the
cache SHALL also record the time of the latest successful scan. A cache written
before per-finding times existed SHALL still load, with each finding's time
defaulting to the cache's recorded scan time; a cache written before
`buildCommand` existed SHALL still load, with each finding's build command
defaulting to empty (unknown). The cache SHALL be keyed by repository so one
repository's cache is never returned for another. Writing the cache is a
harness-side action on a separate artifact and SHALL NOT cause the discovery agent
to create, modify, or delete any file inside the scanned repository — the
read-only-scan guarantee is preserved. A failure to write the cache SHALL NOT fail
the discovery: the in-memory result is still returned. After a successful merge,
the discovery result the system reports for that repository (status reads,
Run-by-port resolution) SHALL be the merged set, not the raw single-scan result.

#### Scenario: Successful discovery is merged into the cache

- **WHEN** a discovery for a repository completes successfully
- **THEN** its findings are unioned by port into that repository's on-disk cache, and the merge result is what subsequent loads return

#### Scenario: A partial rescan does not erase earlier findings

- **WHEN** a repository's cache holds five apps and a new scan finds only three of them
- **THEN** after the merge the cache still holds all five, with the three rescanned entries refreshed to the newer scan

#### Scenario: A matching port is refreshed, not duplicated

- **WHEN** a new scan reports a port that already exists in the cache with different details (e.g. a changed start command)
- **THEN** the cache keeps exactly one finding for that port, carrying the newer scan's details and discovery time

#### Scenario: Cache survives a harness restart

- **WHEN** a discovery has been cached for a repository and the harness is restarted
- **THEN** that repository's cached discovery is still available on disk, even though the in-memory job registry was cleared

#### Scenario: Cache write does not mutate the scanned repository

- **WHEN** a discovery completes and its result is merged into the cache
- **THEN** no file inside the scanned repository is created, modified, or deleted as a result

#### Scenario: A cache-write failure does not fail the discovery

- **WHEN** the cache cannot be written (for example the cache location is not writable)
- **THEN** the discovery is still reported as successful with its result, and only the caching is skipped

#### Scenario: Pre-union cache files still load

- **WHEN** a cache file written before per-finding discovery times is loaded
- **THEN** it loads successfully and each finding's discovery time defaults to the file's recorded scan time

#### Scenario: Pre-buildCommand cache files still load

- **WHEN** a cache file written before `buildCommand` existed is loaded
- **THEN** it loads successfully and each finding's build command defaults to empty, so Rebuild is simply unavailable for those rows until a rescan, an import, or the build-command backfill supplies one

### Requirement: Load discovered apps from the cache without running an agent

The system SHALL expose a read-only path that returns a repository's cached
discovered apps **without** running the discovery agent. The returned findings
SHALL carry the same fields as a live discovery (`name`, `port`, `folder`,
`evidence`, `startCommand`, `buildCommand`) plus each finding's last-discovered
time, and each app's live `running` flag SHALL be recomputed at load time from a
port check rather than served from a value frozen in the cache. The load SHALL
surface how old the cached result is: the latest scan time for the cache as a
whole and the per-finding discovery times. When no cache exists for the
repository, the load SHALL return an explicit "no cache" outcome rather than an
empty success or an error, so the caller can prompt the operator to run
discovery. Loading from the cache SHALL NOT modify the repository and SHALL NOT
register any app.

#### Scenario: Load returns the cached apps without an agent scan

- **WHEN** a repository has a cached discovery and the operator loads from the cache
- **THEN** the cached discovered apps are returned without invoking the discovery agent

#### Scenario: Running state is live even when loaded from cache

- **WHEN** discovered apps are loaded from the cache and one of them has since started or stopped
- **THEN** each app's reported running state reflects a port check at load time, not the state captured when the discovery was cached

#### Scenario: Per-finding age is surfaced

- **WHEN** a cache holding findings from different scans is loaded
- **THEN** each finding carries its own last-discovered time alongside the cache's latest scan time

#### Scenario: No cache yet is reported explicitly

- **WHEN** the operator loads from the cache for a repository that has never had a discovery cached
- **THEN** the system returns an explicit "no cache" outcome, distinct from a successful empty discovery, so the caller can prompt for a fresh discovery

#### Scenario: Cache load never runs the agent or mutates the repo

- **WHEN** the cache-load path is used for any repository
- **THEN** no discovery agent is run, no repository file is changed, and no app is registered as a side effect

### Requirement: Import externally produced findings into the cache

The system SHALL let the operator import discovery findings produced outside the
harness — a JSON array of findings (`name`, `port`, `folder`, `evidence`,
`startCommand`, and optionally `buildCommand`), or the equivalent report object —
into the caller's repository's discovery cache, surfaced as an import action in
the Discover Local Apps panel (paste, or choose a `.json` file that fills the
same input) and backed by a harness endpoint. A successful import SHALL merge the
findings into the on-disk cache with the same union-by-port semantics as a
completed scan: new ports added, a cached finding whose port matches an imported
finding replaced by the imported one, unmatched cached ports kept. Each imported
finding's last-discovered time SHALL be the import time. After a successful
import (with no scan in flight) the merged set SHALL be what cache loads,
discovery-status reads, Run-by-port, and Check see, and the endpoint SHALL
return the updated snapshot. The import SHALL be validated all-or-nothing:
malformed JSON, a payload that is not an array/report object, or any finding
without a non-empty name and folder and a port in 1..65535 SHALL reject the
entire import with an explicit error and leave the cache and in-memory result
unchanged; a finding without `buildCommand` SHALL remain valid (build command
unknown). When a discovery scan for the repository is in flight, the import
SHALL merge into the on-disk cache without disturbing the running job, and the
scan's own completion merge SHALL surface the imported findings. Importing SHALL
NOT modify the repository's files, SHALL NOT run the discovery agent, and SHALL
NOT register or start any app. The import affordance is an Advanced-mode
affordance under the existing discovery capability.

#### Scenario: Imported findings are unioned into the cache

- **WHEN** the operator imports a JSON array of findings for a repository whose cache already holds other ports
- **THEN** the cache afterwards holds the union — imported ports added or replacing matching cached ports, other cached ports kept — and each imported finding's last-discovered time is the import time

#### Scenario: Imported findings are immediately actionable

- **WHEN** an import succeeds while no scan is in flight
- **THEN** the panel shows the merged findings from the returned snapshot, and register / Run / Check / delete work on imported rows exactly as on scanned rows

#### Scenario: Imported build commands are actionable

- **WHEN** an imported finding carries a non-empty `buildCommand`
- **THEN** the merged row offers Rebuild exactly as if a scan had discovered that build command

#### Scenario: Invalid payload rejects the whole import

- **WHEN** the operator submits malformed JSON, a non-array/non-report payload, or an array in which any finding lacks a valid name, folder, or port
- **THEN** the system returns an explicit error naming the problem, and the cache and any in-memory discovery result are unchanged — no finding from the payload is imported

#### Scenario: Import during a running scan does not disturb the scan

- **WHEN** the operator imports findings while a discovery scan for the repository is running
- **THEN** the import merges into the on-disk cache, the running scan continues unaffected, and when the scan completes its result is unioned with the imported findings

#### Scenario: Import is passive toward the repository

- **WHEN** findings are imported for a repository
- **THEN** no file inside the repository is created, modified, or deleted, no discovery agent runs, and no app is registered or started as a side effect

### Requirement: Export cache as import-compatible JSON

The Local apps panel SHALL provide an Export action that displays the current
discovered-apps cache as pretty-printed JSON in the exact shape accepted by the
cache import endpoint: `{ "apps": [ { "name", "port", "folder", "evidence",
"startCommand", "buildCommand" } ] }`. Machine-local projection fields
(`running`, `discoveredAt`) MUST NOT appear in the exported JSON.

#### Scenario: View cache as JSON

- **WHEN** the user opens the Local apps panel with cached findings present and activates Export
- **THEN** a read-only text area shows the findings serialized as `{ "apps": [...] }` with only the import-contract fields

#### Scenario: Export disabled with no cache

- **WHEN** the panel has no findings (no cache and no completed scan)
- **THEN** the Export action is disabled

#### Scenario: Round-trip to another machine

- **WHEN** the exported JSON is pasted into the Import action of a Local apps panel on another machine and submitted
- **THEN** the import succeeds without editing the payload and the findings are union-merged by port into that machine's cache

### Requirement: Discovery panel presents findings and cache state

The system SHALL provide a Discover Local Apps panel that opens as an overlay on a
repository's agent dock and hosts everything related to the feature for that dock's
repository: the discovered/cached apps with per-row affordances (register, Run,
Check, Stop, Restart, Rebuild, live running state), the state of any in-flight or
finished discovery job, and the cache state. Per-row availability SHALL follow
each action's own requirement: Run and Restart need a known start command, Stop
needs the app to be running, Rebuild needs a known build command; unavailable
actions SHALL be absent or disabled rather than failing on click. A rebuild in
flight SHALL be visible on its row, and its outcome (success, or failure with the
captured output) SHALL be observable from the panel. For each presented finding
the panel SHALL show when that finding was last discovered (its per-finding
discovery time), so the operator can judge staleness row by row. The panel SHALL
offer the load-from-cache action; when the repository has no cache, the panel
SHALL say so explicitly and direct the operator to run discovery. Opening the
panel SHALL NOT run the discovery agent, SHALL NOT modify the repository, and
SHALL NOT stop, start, or rebuild any app. The panel is an Advanced-mode
affordance.

#### Scenario: Panel shows findings with full affordances

- **WHEN** the operator opens the panel for a repository that has discovered or cached apps
- **THEN** the panel lists those apps with per-row register / Run / Check / Stop / Restart / Rebuild, live running state, and each row's last-discovered time

#### Scenario: Lifecycle affordances follow app state and known commands

- **WHEN** a row's app is not running, or its start or build command is unknown
- **THEN** Stop (not running), Run/Restart (no start command), or Rebuild (no build command) is absent or disabled for that row rather than failing on click

#### Scenario: Rebuild progress and outcome are visible on the row

- **WHEN** a rebuild is running or has finished for a row's app
- **THEN** the row shows the rebuild as in flight while it runs, and its success or failure (with captured output available) once it completes

#### Scenario: Panel reflects a running scan

- **WHEN** the operator opens the panel while a discovery scan for that repository is in flight
- **THEN** the panel shows the scan as running and presents its result when it completes, without the operator reopening the panel

#### Scenario: Panel with no cache guides the operator

- **WHEN** the operator opens the panel (or uses its load-from-cache action) for a repository with no cached discovery and no job result
- **THEN** the panel states there is nothing yet and directs the operator to run discovery, rather than showing an empty or errored list

#### Scenario: Opening the panel is passive

- **WHEN** the operator opens or closes the panel
- **THEN** no discovery agent is run, no repository file is changed, and no app is registered, started, stopped, or rebuilt as a side effect
