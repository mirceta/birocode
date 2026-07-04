# github-pr-browser

## MODIFIED Requirements

### Requirement: Server-side PR endpoints
The Harness SHALL expose read-only `GET api/status-monitor/github/prs?repo=owner/name` (open-PR list) and `GET api/status-monitor/github/pr?repo=owner/name&number=N` (single PR detail), fetching from GitHub server-side via the same `gh`-on-PATH mechanism as the board's GitHub section so no GitHub credential ever reaches the browser. Responses SHALL be cached per key (order of 30s) with single-flight refresh. A `repo` value not in the board's derived repo list (repositories visible to the authenticated GitHub account unioned with the registered Repos' GitHub remotes) SHALL be rejected, so the endpoints cannot be used as an open proxy to arbitrary repositories.

#### Scenario: Credential stays server-side
- **WHEN** the page fetches a PR list or PR detail
- **THEN** the request carries no GitHub credential and the response contains none — authentication happens inside `gh` on the host

#### Scenario: Fleet repo is browsable
- **WHEN** the endpoint is called with a repo that is visible to the authenticated GitHub account but not registered locally
- **THEN** it serves the PR data exactly as for a registered repo

#### Scenario: Unknown repo rejected
- **WHEN** the endpoint is called with a repo that is neither visible to the authenticated account nor a registered Repo's GitHub remote
- **THEN** it responds 404 without contacting GitHub
