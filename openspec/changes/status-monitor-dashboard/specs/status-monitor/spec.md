## ADDED Requirements

### Requirement: Status monitor surface
The Harness SHALL serve a build-less status-monitor wallboard SPA from `status-app/` at the Harness repo root, through the same proxy mechanism as the events-app, under a fixed app id, full-screen capable in a plain browser window.

#### Scenario: Board loads on the third monitor
- **WHEN** the Operator opens the status monitor's proxy URL in a browser window on the status monitor
- **THEN** the wallboard renders full-screen from `status-app/index.html` with no build step required, and an overwrite of that file shows on next reload (no-store)

#### Scenario: Missing app is visibly missing
- **WHEN** `status-app/index.html` does not exist at the Harness repo root
- **THEN** the Harness serves an explicit empty state (not a fallback renderer) so a broken board is visibly broken

### Requirement: Single board endpoint
The Harness SHALL expose `GET api/status-monitor/board` returning one JSON document with three sections — fleet, attention, and github — so the SPA is a renderer and all derivation (ordering, staleness, attention membership) is computed server-side.

#### Scenario: One poll paints the whole board
- **WHEN** the SPA requests the board endpoint
- **THEN** the response contains per-machine fleet cards, the ordered attention queue, and the GitHub panel data in a single round-trip

### Requirement: Fleet panel
The board SHALL show one card per collector source (machine): its display name, reachability/status from the collector's existing taxonomy (alive, ip-blocked, needs-credential, bad-credential, throttled, unreachable), time since last successful poll, and the most recent agent activity the feed carries for that machine.

#### Scenario: Machine goes dark
- **WHEN** a source has had no successful poll for longer than the staleness threshold
- **THEN** its card visibly changes state and shows how long ago it was last seen

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
The Harness SHALL poll the GitHub API server-side, authenticated via the existing github-credentials capability, for an explicitly configured repo list, and the board SHALL show per repo: open PR count with review state (draft/ready/changes-requested), oldest-PR age, and latest default-branch CI status rendered red/green wallboard-style. Results SHALL be cached at least 60 seconds; the PAT SHALL never be sent to the browser.

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
