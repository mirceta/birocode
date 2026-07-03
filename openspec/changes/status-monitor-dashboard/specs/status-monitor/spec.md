## ADDED Requirements

### Requirement: Status monitor surface
The Harness SHALL serve the wallboard as a self-contained sibling page `board.html` inside the existing `events-app/` folder, delivered by the existing events-app serving mechanism (build-less, no-store, relative URLs), full-screen capable in a plain browser window. The wallboard MUST remain a separate page from the feed log page — the two are never merged into one UI.

#### Scenario: Board loads on the third monitor
- **WHEN** the Operator opens the events-app proxy URL with the `board.html` path in a browser window on the status monitor
- **THEN** the wallboard renders full-screen from `events-app/board.html` with no build step or new serving code required, and an overwrite of that file shows on next reload (no-store)

#### Scenario: Missing page is visibly missing
- **WHEN** `events-app/board.html` does not exist at the Harness repo root
- **THEN** the request yields a plain 404 (a missing asset is never masked by a fallback renderer), while the feed log page is unaffected

#### Scenario: Feed log stays independent
- **WHEN** the feed log page (`events-app/index.html`) is edited or broken
- **THEN** the board page still renders, because `board.html` is self-contained and shares only the folder and serving contract

### Requirement: Single board endpoint
The Harness SHALL expose `GET api/status-monitor/board` returning one JSON document with three sections — fleet, attention, and github — so the SPA is a renderer and all derivation (ordering, staleness, attention membership) is computed server-side.

#### Scenario: One poll paints the whole board
- **WHEN** the SPA requests the board endpoint
- **THEN** the response contains per-machine fleet cards, the ordered attention queue, and the GitHub panel data in a single round-trip

### Requirement: Fleet panel
The board SHALL show one card per collector source (machine): its display name, reachability/status from the collector's existing per-source state (alive, ip-blocked, needs-credential, bad-credential, throttled, unreachable), how long the source has been in that state, and the most recent agent activity the feed carries for that machine. State duration SHALL be derived by the board service from observed state transitions (the collector's `lastPolledAt` marks poll attempts, not successes), with no change to the collector.

#### Scenario: Machine goes dark
- **WHEN** a source has been unreachable for longer than the staleness threshold
- **THEN** its card visibly changes state and shows how long the machine has been dark

#### Scenario: Harness restarts while a machine is dark
- **WHEN** the Harness restarts and a source is unreachable with no observed transition yet
- **THEN** the card still shows the unreachable state, with duration marked unknown rather than a fabricated timestamp

#### Scenario: Machine is refused, not dead
- **WHEN** a source is in a refusal state (e.g. ip-blocked or bad-credential)
- **THEN** the card shows the specific refusal label (with the rejected IP when known), not a generic error

### Requirement: Attention queue
The board SHALL derive an ordered "needs me" queue across all machines — in v1: sources in refusal states and stale sources — and SHALL render it above all other content, largest and most visually salient, ordered most-actionable-first. An empty queue SHALL render as an explicit calm state.

#### Scenario: Blocked source enters the queue
- **WHEN** any source transitions into a refusal state
- **THEN** on the next board poll an attention row appears at the top of the board naming the machine, the refusal, and the fix

#### Scenario: Nothing needs the operator
- **WHEN** no source is blocked or stale
- **THEN** the attention area shows an explicit all-clear state (not an empty gap)

### Requirement: GitHub panel
The Harness SHALL poll the GitHub API server-side, authenticated via the existing github-credentials capability, for a repo list derived from the registered Repos' git remotes (each registered repo's `origin` parsed to `owner/name`, deduplicated), and the board SHALL show per repo: open PR count with review state (draft/ready/changes-requested), oldest-PR age, and latest default-branch CI status rendered red/green wallboard-style. Results SHALL be cached at least 60 seconds; the PAT SHALL never be sent to the browser.

#### Scenario: Repo list follows the registry
- **WHEN** a repo is registered in (or removed from) the Harness's repo selector and has a GitHub `origin` remote
- **THEN** its tile appears on (or disappears from) the GitHub panel without any separate configuration

#### Scenario: Registered repo without a GitHub remote
- **WHEN** a registered repo has no remote, or a remote that is not GitHub
- **THEN** it is skipped — no tile and no error on the board

#### Scenario: CI goes red
- **WHEN** the latest default-branch workflow run of a configured repo fails
- **THEN** that repo's tile renders in the failure color with the workflow name, within one cache window

#### Scenario: Rate-limit friendliness
- **WHEN** the SPA polls the board more often than the GitHub cache TTL
- **THEN** the Harness serves the cached GitHub section without new GitHub API calls

### Requirement: Wallboard presentation and self-honesty
The SPA SHALL be readable from across a desk (dark, high-contrast, large type for attention items), SHALL require no interaction to stay current (auto-refresh with diff-render, no flicker, no scroll for the primary panels), and SHALL display a last-updated clock plus a full-bleed staleness banner whenever board polls fail — the board MUST never silently freeze while looking healthy.

#### Scenario: Board loses its own data source
- **WHEN** consecutive board polls fail (harness unreachable from the browser)
- **THEN** the board shows a prominent staleness banner with the time of the last good poll, over the (dimmed) last-known content
