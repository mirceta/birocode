## ADDED Requirements

### Requirement: Persist a completed discovery to a per-repo on-disk cache

When a discovery completes successfully, the system SHALL write its typed result
(the discovered apps with each app's `name`, `port`, `folder`, `evidence`, and
`startCommand`, plus the time the discovery finished) to a durable, per-repository
on-disk cache, so the result survives a harness restart and can be reused without
re-running the agent. The cache SHALL be keyed by repository so one repository's
cache is never returned for another. Writing the cache is a harness-side action on
a **separate** artifact and SHALL NOT cause the discovery agent to create, modify,
or delete any file inside the scanned repository — the read-only-scan guarantee is
preserved. A failure to write the cache SHALL NOT fail the discovery: the
in-memory result is still returned.

#### Scenario: Successful discovery is written to the cache

- **WHEN** a discovery for a repository completes successfully
- **THEN** its discovered-apps result and finish time are written to that repository's on-disk cache

#### Scenario: Cache survives a harness restart

- **WHEN** a discovery has been cached for a repository and the harness is restarted
- **THEN** that repository's cached discovery is still available on disk, even though the in-memory job registry was cleared

#### Scenario: Rediscovery refreshes the cache

- **WHEN** a repository already has a cached discovery and a new discovery for that repository completes successfully
- **THEN** the cache is overwritten with the newer result, so a later cache load returns the most recent discovery

#### Scenario: Cache write does not mutate the scanned repository

- **WHEN** a discovery completes and its result is written to the cache
- **THEN** no file inside the scanned repository is created, modified, or deleted as a result

#### Scenario: A cache-write failure does not fail the discovery

- **WHEN** the cache cannot be written (for example the cache location is not writable)
- **THEN** the discovery is still reported as successful with its result, and only the caching is skipped

### Requirement: Load discovered apps from the cache without running an agent

The system SHALL expose a read-only path that returns a repository's cached
discovered apps **without** running the discovery agent. The returned findings
SHALL carry the same fields as a live discovery (`name`, `port`, `folder`,
`evidence`, `startCommand`), and each app's live `running` flag SHALL be
recomputed at load time from a port check rather than served from a value frozen
in the cache. The load SHALL surface how old the cached result is (its discovery
finish time). When no cache exists for the repository, the load SHALL return an
explicit "no cache" outcome rather than an empty success or an error, so the
caller can prompt the operator to run discovery. Loading from the cache SHALL NOT
modify the repository and SHALL NOT register any app.

#### Scenario: Load returns the cached apps without an agent scan

- **WHEN** a repository has a cached discovery and the operator loads from the cache
- **THEN** the cached discovered apps are returned without invoking the discovery agent

#### Scenario: Running state is live even when loaded from cache

- **WHEN** discovered apps are loaded from the cache and one of them has since started or stopped
- **THEN** each app's reported running state reflects a port check at load time, not the state captured when the discovery was cached

#### Scenario: No cache yet is reported explicitly

- **WHEN** the operator loads from the cache for a repository that has never had a discovery cached
- **THEN** the system returns an explicit "no cache" outcome, distinct from a successful empty discovery, so the caller can prompt for a fresh discovery

#### Scenario: Cache load never runs the agent or mutates the repo

- **WHEN** the cache-load path is used for any repository
- **THEN** no discovery agent is run, no repository file is changed, and no app is registered as a side effect

### Requirement: Dock offers loading from cache alongside rediscovery

The system SHALL let the operator load a repository's cached discovered apps from
that repository's agent dock, via an explicit action shown alongside the existing
"Discover local apps" action. Loading from the cache SHALL present the cached
findings using the same per-app affordances as a live discovery (showing running
state, and offering register / Run / Check per row), and SHALL NOT run the agent.
The "Discover local apps" action SHALL remain available as the way to re-run the
agent scan so that newly added apps in the repository are found. When there is no
cache for the repository, the load action SHALL surface that explicitly and direct
the operator to run discovery. The load action is an Advanced-mode affordance.

#### Scenario: Load cache from the dock

- **WHEN** the operator clicks the load-from-cache action in an agent dock pinned to a repository that has a cached discovery
- **THEN** the dock shows that repository's cached discovered apps, with per-row register / Run / Check, without running the discovery agent

#### Scenario: Rediscover is still available for new apps

- **WHEN** a new app has been added to the repository since the last cached discovery and the operator clicks "Discover local apps"
- **THEN** a fresh agent scan runs and finds the new app, and its result replaces what a subsequent cache load returns

#### Scenario: Load with no cache guides the operator

- **WHEN** the operator clicks the load-from-cache action for a repository that has no cached discovery
- **THEN** the dock indicates there is no cache yet and that discovery must be run first, rather than showing an empty or errored list
