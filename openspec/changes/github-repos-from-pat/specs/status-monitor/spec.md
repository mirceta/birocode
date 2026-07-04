# status-monitor

## MODIFIED Requirements

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
