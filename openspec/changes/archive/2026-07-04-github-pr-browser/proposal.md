# Proposal: github-pr-browser

## Why

The events-app GitHub section (openspec change `status-monitor-dashboard`) shows per-repo summary tiles — CI state and open-PR counts — but acting on them still means opening Chrome with one tab per repository to reach each repo's PR list and PR pages. The operator wants that drill-down **inside** the application: click a repo tile, see its PRs, click a PR, read it — no browser tabs.

The operator's literal request was an **iframe of the GitHub PR page**. That is not buildable: github.com sends `X-Frame-Options: deny` on every page, so any iframe of it renders a refused blank frame. This change delivers the same outcome (no Chrome tabs) by rendering PR data **natively** from the GitHub API instead, with an "open on GitHub" link as the escape hatch for anything the native view doesn't cover.

## What Changes

- The GitHub section's repo tiles become clickable (outside display mode): clicking a tile expands an in-app **PR list panel** for that repo — number, title, author, head branch, draft/review-decision state, per-PR CI, age.
- Clicking a PR opens an in-app **PR detail view**: description (rendered markdown-ish, safely escaped), branches, mergeability, checks, changed files with per-file diff stats, review/comment counts, and an "open on GitHub" link.
- Two new read-only Harness endpoints under `api/status-monitor/github/` serve these panels, fetching server-side via `gh api graphql` exactly like `GitHubStatusService` (the PAT stays inside `gh`; the browser never sees a credential), with short-lived caching and section-level degradation (an error paints the panel, never breaks the page).
- Display mode (`?display=1`) is unchanged: tiles stay non-interactive summary-only there (the wallboard is glanceable, not a control surface).
- New UI behavior is Advanced-mode-only per the UI-modes convention if a capability-map entry applies (the events-app is a localview app, outside the client capability map — no entry needed).

## Capabilities

### New Capabilities

- `github-pr-browser`: in-app drill-down from the GitHub status tiles to a repo's open-PR list and a single PR's detail, served by read-only Harness endpoints that keep GitHub credentials server-side.

### Modified Capabilities

<!-- none: the status-monitor delta (in-flight change status-monitor-dashboard) is untouched;
     tiles gain a click affordance but every status-monitor requirement stands as written. -->

## Impact

- `ClaudeWeb.App/Services/StatusMonitor/` — new `GitHubPrService` (or extension of `GitHubStatusService`) for the two queries.
- `ClaudeWeb.App/Controllers/StatusMonitorController.cs` — two new GET routes.
- `events-app/index.html` — tile click handling, PR list panel, PR detail view, styles.
- No schema/config changes; no client/ (React) changes; no new dependencies (reuses `gh` on PATH).
