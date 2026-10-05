## ADDED Requirements

### Requirement: A polled request never spawns a process or waits for a background pass

The harness SHALL NOT start a child process (git, schtasks) on the request thread of an
endpoint the dashboards poll, and SHALL NOT make such a request wait for a background pass to
finish. The keep-alive watchdog's state SHALL be read from a cache that is at most fifteen
seconds old, renewed by one background probe at a time and forgotten when the installer runs.
The docks' claim posture and the arch's home commits SHALL be answered from the last known
state, with a background read when it is stale or missing. Before the first agent snapshot
exists, the endpoints that serve it SHALL answer with a provisional snapshot built without git
(branches "unknown", snapshot time 0) instead of waiting for the first pass.

#### Scenario: The board loads right after a restart

- **WHEN** the harness has just restarted and the first agent snapshot pass is still reading
  git for fifteen repos
- **THEN** the fleet status and the arch state answer in milliseconds with the agents listed
  and their branches "unknown", and the real branches appear once the pass completes

#### Scenario: Process spawns are slow

- **WHEN** a process spawn on the machine takes two seconds
- **THEN** the fleet status, the claim posture, the watchdog tile and the arch state still
  answer from their cached state without that delay

### Requirement: A git status costs at most five processes

A status computation SHALL resolve the local and origin base branches with one
`git for-each-ref` and the commit identity with one `git config --show-scope --get-regexp`,
falling back to the per-value reads only when git refuses the single call. The reported
identity scope SHALL be "local" when the repository's own config sets the name or the email,
"global" when only an outer config does, and "unset" when neither is set.

#### Scenario: Identity from an outer config

- **WHEN** only the global config sets user.name and user.email
- **THEN** the status reports that name and email with scope "global", from one git process

### Requirement: Responses are compressed and the Management App's bundle is cacheable

The harness SHALL compress JSON, JavaScript, CSS and HTML responses with Brotli or gzip when
the client accepts them, and SHALL NOT compress event streams. Content-hashed files of a
harness-served bundle (a file under an `assets/` folder whose name carries the bundler's hash)
SHALL be served `private, max-age=31536000, immutable`; the bundle's `index.html` and every
hand-written static app SHALL stay `no-store`.

#### Scenario: Opening the Management App a second time

- **WHEN** a browser that has loaded the Management App loads it again
- **THEN** only `index.html` and the API calls travel; the script and the stylesheet come from
  the browser's cache

#### Scenario: A rebuilt Management App

- **WHEN** the bundle is rebuilt and its files get new hashes
- **THEN** the next load fetches the new `index.html` (never cached) and, through it, the new
  files
