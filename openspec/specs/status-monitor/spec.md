# status-monitor Specification

## Purpose
TBD - created by archiving change status-monitor-dashboard. Update Purpose after archive.
## Requirements
### Requirement: Fleet status on the events-app primary page
The events-app primary page (`events-app/index.html`) SHALL render the fleet's status alongside its existing source administration and merged log: the attention queue above all other content, per-source status (including running agents) integrated with the Sources panel, and the GitHub panel. There SHALL be no separate board page — the Sources panel is the fleet, and status renders where the fleet is administered. (Supersedes the withdrawn separate-page rule; operator decision 2026-07-03.)

#### Scenario: One surface
- **WHEN** the Operator opens the events-app
- **THEN** source administration, the attention queue, per-machine agent status, and GitHub state are all present on that one page, with no second page to visit

#### Scenario: The old board page is gone
- **WHEN** `board.html` is requested under the events-app path
- **THEN** it yields a plain 404 (the wallboard experience is the display mode of the primary page, not a separate page)

### Requirement: Display mode
The primary page SHALL offer a display mode, entered via a visible control and addressable by URL (`?display=1`), that hides every interactive element (add-source form, source action buttons, sound controls, the merged event log) and enlarges the attention queue, fleet status, and GitHub panel for across-the-desk reading. Display mode SHALL require no interaction to stay current (poll + diff-render, no flicker), SHALL show a last-updated clock, and SHALL show a prominent staleness banner over dimmed last-known content when consecutive polls fail — it MUST never silently freeze while looking healthy. A visible control SHALL exit display mode.

#### Scenario: Entering display mode
- **WHEN** the Operator clicks the display-mode control (or opens the page with `?display=1`)
- **THEN** the same page re-renders with all interactive elements hidden and the status sections enlarged, suitable for fullscreen on the third monitor

#### Scenario: Display mode never silently freezes
- **WHEN** consecutive polls fail while in display mode
- **THEN** a prominent staleness banner with the time of the last good poll appears over the (dimmed) last-known content

### Requirement: Single board endpoint
The Harness SHALL expose `GET api/status-monitor/board` returning one JSON document with three sections — fleet, attention, and github — so the page is a renderer and all derivation (ordering, staleness, attention membership, running-agent pairing) is computed server-side.

#### Scenario: One poll paints the status sections
- **WHEN** the page requests the board endpoint
- **THEN** the response contains per-machine fleet status, the ordered attention queue, and the GitHub panel data in a single round-trip

### Requirement: Per-source status with running agents
For each collector source (machine) the board SHALL report: its display name, reachability/status from the collector's existing per-source state (alive, ip-blocked, needs-credential, bad-credential, throttled, unreachable), how long the source has been in that state, and the **agents currently running** on that machine — derived by pairing `turn.start` events with `turn.ended` events by `turnId` in the collector's retained aggregate, each running agent identified by its repository and elapsed time. An unmatched `turn.start` older than a max-age cutoff SHALL be dropped from the count (a trimmed or lost `turn.ended` must not pin a ghost agent). State duration SHALL be derived from observed state transitions (the collector's `lastPolledAt` marks poll attempts, not successes), with no change to the collector.

#### Scenario: An agent is running
- **WHEN** a source's feed carries a `turn.start` with no matching `turn.ended`
- **THEN** that source shows a running agent with its repository and elapsed time

#### Scenario: The agent finishes
- **WHEN** the matching `turn.ended` (same `turnId`) arrives
- **THEN** the running-agent entry disappears on the next poll

#### Scenario: A machine on an old harness build
- **WHEN** a source's harness predates `turn.start` and emits only `turn.ended`
- **THEN** its card shows no running agents and no error

#### Scenario: Machine goes dark
- **WHEN** a source has been unreachable for longer than the staleness threshold
- **THEN** its status visibly changes state and shows how long the machine has been dark

#### Scenario: Harness restarts while a machine is dark
- **WHEN** the Harness restarts and a source is unreachable with no observed transition yet
- **THEN** the status still shows unreachable, with duration marked unknown rather than a fabricated timestamp

### Requirement: Attention queue
The board SHALL derive an ordered "needs me" queue across all machines — sources in refusal states and stale sources — and the page SHALL render it above all other content, most visually salient, ordered most-actionable-first. An empty queue SHALL render as an explicit calm state.

#### Scenario: Blocked source enters the queue
- **WHEN** any source transitions into a refusal state
- **THEN** on the next poll an attention row appears at the top of the page naming the machine, the refusal, and the fix

#### Scenario: Nothing needs the operator
- **WHEN** no source is blocked or stale
- **THEN** the attention area shows an explicit all-clear state (not an empty gap)

### Requirement: GitHub panel
The Harness SHALL poll the GitHub API server-side, authenticated via the existing github-credentials capability, for a repo list derived from the repositories visible to the authenticated GitHub account (non-archived, most recently pushed first, capped at 100) unioned with the registered Repos' git remotes (each registered repo's `origin` parsed to `owner/name`, deduplicated), and the page SHALL show per repo: open PR count with review state (draft/ready/changes-requested), oldest-PR age, and latest default-branch CI status rendered red/green. The combined repo list SHALL be cached (order of 5 minutes) and on visibility-query failure SHALL fall back to the registry-derived list alone. Results SHALL be cached at least 60 seconds; the PAT SHALL never be sent to the browser; GitHub being unavailable SHALL degrade only this panel, never the page.

#### Scenario: CI goes red
- **WHEN** the latest default-branch workflow run of a derived repo fails
- **THEN** that repo's tile renders in the failure color with the workflow name, within one cache window

#### Scenario: Fleet repo without local registration
- **WHEN** a repository is visible to the authenticated GitHub account but not registered in this Harness's repo selector
- **THEN** it still gets a tile on the GitHub panel, without any local registration or configuration

#### Scenario: Repo list follows the registry
- **WHEN** a repo is registered in (or removed from) the Harness's repo selector and has a GitHub `origin` remote
- **THEN** its tile appears on the GitHub panel without separate configuration (removal hides the tile only if the repo is also not visible to the account)

#### Scenario: Registered repo without a GitHub remote
- **WHEN** a registered repo has no remote, or a remote that is not GitHub
- **THEN** it is skipped — no tile and no error

#### Scenario: Visibility query fails
- **WHEN** the account-visibility query fails (gh missing, unauthenticated, timeout)
- **THEN** the panel falls back to the registry-derived repo list and keeps rendering — fleet-only tiles may disappear after the cached list expires, but the panel never errors solely because of the visibility query

#### Scenario: Rate-limit friendliness
- **WHEN** the page polls the board more often than the GitHub cache TTL
- **THEN** the Harness serves the cached GitHub section without new GitHub API calls

