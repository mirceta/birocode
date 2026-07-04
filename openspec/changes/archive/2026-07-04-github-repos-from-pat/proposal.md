# Proposal: github-repos-from-pat

## Why

The status board's GitHub panel (and the PR browser's allow-list) derive the repo list from the **locally registered** Repos' `origin` remotes. But the board watches a fleet: other machines work on repositories that are never registered on this host, so those repos get no tile and their PRs cannot be viewed — the allow-list 404s them by design. The fleet event feed only carries a display `repoName`, not GitHub coordinates, so it cannot fill the gap. What *can* see the whole picture is the PAT itself: every fleet machine pushes as the same `mirceta-agents` account, so "every repository the PAT can see" is exactly the fleet-wide repo set.

## What Changes

- `GitHubStatusService` derives its repo list from **GitHub's own answer** — the repositories visible to the authenticated `gh` account (`viewer.repositories`, non-archived, most recently pushed first, capped at 100) — **unioned with** the existing local-registry derivation, so a local repo whose remote the PAT cannot see keeps its (inaccessible) tile exactly as today.
- The combined list is cached (~5 min) with the same stale-while-background-refresh pattern the section cache uses; if the viewer query fails, the list falls back to the local derivation only and the panel keeps working exactly as it does today.
- `IsKnownRepo` — the PR endpoints' allow-list — uses the same combined list, so PRs of fleet-only repos become browsable. The endpoints stay closed: still no proxying to arbitrary repos, only to what the PAT can already see.

## Impact

- Specs: `status-monitor` (GitHub panel requirement — repo list source), `github-pr-browser` (allow-list wording).
- Code: `ClaudeWeb.App/Services/StatusMonitor/GitHubStatusService.cs` only; the controller, `GitHubPrService`, and the frontend are untouched.
- Behavior: more tiles may appear (all PAT-visible repos). No config added; no new credential exposure (same `gh`-on-PATH mechanism).
