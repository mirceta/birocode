# discover-local-apps — delta for discover-apps-panel

## ADDED Requirements

### Requirement: Discovery panel presents findings and cache state

The system SHALL provide a Discover Local Apps panel that opens as an overlay on a
repository's agent dock and hosts everything related to the feature for that dock's
repository: the discovered/cached apps with the same per-row affordances as before
(register, Run, Check, live running state), the state of any in-flight or finished
discovery job, and the cache state. For each presented finding the panel SHALL show
when that finding was last discovered (its per-finding discovery time), so the
operator can judge staleness row by row. The panel SHALL offer the load-from-cache
action; when the repository has no cache, the panel SHALL say so explicitly and
direct the operator to run discovery. Opening the panel SHALL NOT run the discovery
agent and SHALL NOT modify the repository. The panel is an Advanced-mode affordance.

#### Scenario: Panel shows findings with full affordances

- **WHEN** the operator opens the panel for a repository that has discovered or cached apps
- **THEN** the panel lists those apps with per-row register / Run / Check, live running state, and each row's last-discovered time

#### Scenario: Panel reflects a running scan

- **WHEN** the operator opens the panel while a discovery scan for that repository is in flight
- **THEN** the panel shows the scan as running and presents its result when it completes, without the operator reopening the panel

#### Scenario: Panel with no cache guides the operator

- **WHEN** the operator opens the panel (or uses its load-from-cache action) for a repository with no cached discovery and no job result
- **THEN** the panel states there is nothing yet and directs the operator to run discovery, rather than showing an empty or errored list

#### Scenario: Opening the panel is passive

- **WHEN** the operator opens or closes the panel
- **THEN** no discovery agent is run, no repository file is changed, and no app is registered or started as a side effect

### Requirement: Delete a cached finding

The system SHALL let the operator delete a single cached finding, identified by its
port, for the caller's repository — surfaced as a per-row delete action in the
discovery panel and backed by a harness endpoint. Deleting SHALL remove that finding
from the repository's on-disk cache and from any in-memory discovery result held for
that repository, so the deleted record is not returned by later cache loads or status
reads and cannot be started via Run. Deleting the last finding SHALL leave a valid
cached empty result (distinct from "no cache"). The action SHALL fail with an explicit
error when the repository has no cache or no cached finding matches the port. Deleting
a cached finding SHALL NOT modify the repository's files and SHALL NOT stop a running
app.

#### Scenario: Delete removes the record everywhere

- **WHEN** the operator deletes a cached finding by port
- **THEN** subsequent cache loads and discovery-status reads for that repository no longer include it, and Run for that port is rejected

#### Scenario: Deleting the last record yields cached-empty, not no-cache

- **WHEN** the operator deletes the only cached finding
- **THEN** a later cache load returns a successful empty result rather than the "no cache" outcome

#### Scenario: Delete without a match is rejected

- **WHEN** a delete is requested for a repository with no cache, or for a port no cached finding matches
- **THEN** the system returns an explicit error and the cache is unchanged

#### Scenario: Delete never touches the repository or running processes

- **WHEN** a cached finding is deleted while its app is running
- **THEN** no file in the repository is changed and the app's process keeps running; only the cache record is removed

## MODIFIED Requirements

### Requirement: Persist a completed discovery to a per-repo on-disk cache

When a discovery completes successfully, the system SHALL merge its typed result into
a durable, per-repository on-disk cache by **union on port**: findings from the new
scan SHALL be added, a cached finding whose port matches a new finding SHALL be
replaced by the newer finding, and cached findings whose ports the new scan did not
report SHALL be kept. Removal of a cached finding SHALL happen only through the
explicit cache-edit action, never as a side effect of a scan. Each cached finding
SHALL carry the discovered apps' fields (`name`, `port`, `folder`, `evidence`,
`startCommand`) plus the time that finding was last discovered; the cache SHALL also
record the time of the latest successful scan. A cache written before per-finding
times existed SHALL still load, with each finding's time defaulting to the cache's
recorded scan time. The cache SHALL be keyed by repository so one repository's cache
is never returned for another. Writing the cache is a harness-side action on a
separate artifact and SHALL NOT cause the discovery agent to create, modify, or
delete any file inside the scanned repository — the read-only-scan guarantee is
preserved. A failure to write the cache SHALL NOT fail the discovery: the in-memory
result is still returned. After a successful merge, the discovery result the system
reports for that repository (status reads, Run-by-port resolution) SHALL be the
merged set, not the raw single-scan result.

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

### Requirement: Triggered from the agent dock

The system SHALL let the operator trigger discovery for a repository from that
repository's agent dock via an explicit run-discovery action, and SHALL let the
operator open the Discover Local Apps panel via a second, separate action. These two
actions SHALL be the dock's only Discover-Local-Apps affordances: the dock SHALL NOT
render the findings list, per-row actions, or a load-from-cache action inline —
findings presentation and all per-row affordances (register, Run, Check, delete) live
in the panel. The run-discovery action SHALL reflect a scan in progress. When
invoked, discovery runs for the dock's repository, and its structured findings are
presented in the panel. From the panel's presented findings, the operator SHALL be
able to **register** a discovered app as a local app with a single per-row action
that submits that app's name and port to the existing registered-apps endpoint; a
discovered app whose port already matches a registered local app SHALL instead be
shown as already registered rather than offering the register action. For each
discovered app the panel SHALL show whether the app is currently running, SHALL
offer a per-row **Run** action that starts the app (enabled only when a start
command is known and the app is not already running), and SHALL offer a **Check**
action that refreshes the running state of the presented findings. The discovery
scan itself remains read-only — registration and run are separate,
operator-initiated calls, not side effects of discovery. Both dock actions are
Advanced-mode affordances.

#### Scenario: Dock exposes exactly two discovery affordances

- **WHEN** the operator views an agent dock in Advanced mode
- **THEN** the dock shows a run-discovery action and an open-panel action for Discover Local Apps, and no inline findings list or load-from-cache button

#### Scenario: Click discovers the dock's repo

- **WHEN** the operator triggers run-discovery in an agent dock pinned to a repository
- **THEN** discovery runs for that dock's repository and the structured list of discovered apps (with ports) is available in that dock's panel

#### Scenario: Per-dock scope

- **WHEN** the operator triggers discovery from a dock pinned to one repository while other docks are pinned to other repositories
- **THEN** only the triggering dock's repository is scanned for that action

#### Scenario: Register a discovered app from the panel

- **WHEN** the operator clicks the register action on a discovered app that is not yet registered
- **THEN** that app's name and port are submitted to the registered-apps endpoint, and once it is registered the dock's local-app list (and the discovered row's state) reflect the new app without a manual refresh

#### Scenario: Already-registered app shows its state

- **WHEN** a discovered app's port matches an app that is already registered for that repository
- **THEN** the panel shows that discovered row as already registered and does not offer the register action for it

#### Scenario: A failed registration is surfaced for that row

- **WHEN** registering a discovered app fails
- **THEN** the failure is shown for that discovered row and the rest of the discovered list remains actionable

#### Scenario: Run a discovered app from the panel

- **WHEN** the operator clicks Run on a discovered app that has a known start command and is not already running
- **THEN** the app's start command is launched for that repository and, after a short delay, the row's running state is re-checked and reflects whether the app came up

#### Scenario: Run is unavailable without a start command

- **WHEN** a discovered app has no known start command
- **THEN** the panel does not offer (or disables) the Run action for that row

#### Scenario: Check refreshes running state

- **WHEN** the operator clicks Check
- **THEN** the running state shown for each discovered app is recomputed from a live port check and updated in place

### Requirement: Load discovered apps from the cache without running an agent

The system SHALL expose a read-only path that returns a repository's cached
discovered apps **without** running the discovery agent. The returned findings
SHALL carry the same fields as a live discovery (`name`, `port`, `folder`,
`evidence`, `startCommand`) plus each finding's last-discovered time, and each
app's live `running` flag SHALL be recomputed at load time from a port check rather
than served from a value frozen in the cache. The load SHALL surface how old the
cached result is: the latest scan time for the cache as a whole and the per-finding
discovery times. When no cache exists for the repository, the load SHALL return an
explicit "no cache" outcome rather than an empty success or an error, so the caller
can prompt the operator to run discovery. Loading from the cache SHALL NOT modify
the repository and SHALL NOT register any app.

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

## REMOVED Requirements

### Requirement: Dock offers loading from cache alongside rediscovery

**Reason**: Superseded by the Discover Local Apps panel — the dock no longer presents
findings or a load-from-cache button; those affordances (and the cache-state view)
move into the panel introduced by this change.

**Migration**: The load-from-cache action and cached-findings presentation live in the
panel (see "Discovery panel presents findings and cache state"); the dock retains only
the run-discovery and open-panel actions (see the modified "Triggered from the agent
dock").
