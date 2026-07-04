# github-pr-browser

## ADDED Requirements

### Requirement: In-app PR list per repo
Outside display mode, each GitHub repo tile on the events-app primary page SHALL be clickable, expanding an in-app panel that lists that repository's open pull requests — for each PR: number, title, author, head branch, draft state, review decision, CI state, and age. Clicking the tile again (or a close affordance) SHALL collapse the panel. In display mode (`?display=1`) tiles SHALL remain non-interactive summary-only.

#### Scenario: Drilling into a repo
- **WHEN** the Operator clicks a repo tile outside display mode
- **THEN** a panel expands in the page listing that repo's open PRs with number, title, author, branch, draft/review state, CI state, and age — no new tab or window

#### Scenario: Display mode stays glanceable
- **WHEN** the page is in display mode
- **THEN** clicking a repo tile does nothing and no drill-down affordance is shown

### Requirement: In-app PR detail
Clicking a PR row in the PR list panel SHALL render an in-app detail view of that pull request — description, base/head branches, mergeability, checks with per-check state, changed files with per-file additions/deletions, and review/comment counts — with a back affordance returning to the PR list and an external link to the PR on github.com. The PR body SHALL be rendered escaped (no raw HTML injection from third-party content).

#### Scenario: Reading a PR without Chrome
- **WHEN** the Operator clicks a PR row
- **THEN** the panel shows that PR's description, branches, checks, changed files with diff stats, and review/comment counts, plus an "open on GitHub" link

#### Scenario: Hostile PR body
- **WHEN** a PR description contains HTML or script markup
- **THEN** the markup renders as visible text, never as live DOM

### Requirement: Server-side PR endpoints
The Harness SHALL expose read-only `GET api/status-monitor/github/prs?repo=owner/name` (open-PR list) and `GET api/status-monitor/github/pr?repo=owner/name&number=N` (single PR detail), fetching from GitHub server-side via the same `gh`-on-PATH mechanism as the board's GitHub section so no GitHub credential ever reaches the browser. Responses SHALL be cached per key (order of 30s) with single-flight refresh. A `repo` value not in the board's derived registered-repo list SHALL be rejected, so the endpoints cannot be used as an open proxy to arbitrary repositories.

#### Scenario: Credential stays server-side
- **WHEN** the page fetches a PR list or PR detail
- **THEN** the request carries no GitHub credential and the response contains none — authentication happens inside `gh` on the host

#### Scenario: Unknown repo rejected
- **WHEN** the endpoint is called with a repo that is not one of the registered Repos' GitHub remotes
- **THEN** it responds 404 without contacting GitHub

### Requirement: Panel-level degradation
A failure fetching PR data (gh missing, unauthenticated, timeout, GraphQL error) SHALL degrade only the drill-down panel — an inline error with the reason — while the board sections, tiles, and the rest of the page keep rendering and polling normally.

#### Scenario: GitHub down mid-drill-down
- **WHEN** the PR list fetch fails
- **THEN** the expanded panel shows the error inline and the board (including the GitHub tiles) continues updating as before
