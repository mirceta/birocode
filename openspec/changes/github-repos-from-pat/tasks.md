# Tasks: github-repos-from-pat

## 1. Implement

- [x] 1.1 `GitHubStatusService`: add the `viewer.repositories` GraphQL query (non-archived, PUSHED_AT desc, first 100, log when the cap is hit) via the existing `gh api graphql` stdin mechanism
- [x] 1.2 Replace `DeriveRepoList()` callers with a cached combined list (PAT-visible ∪ registry-derived, case-insensitive, 5 min TTL, stale-while-background-refresh, 60 s retry TTL on failure, fallback = registry-derived only)
- [x] 1.3 `IsKnownRepo` reads the same cached combined list (allow-list = tile list; no per-request `git config` runs)

## 2. Verify

- [x] 2.1 Build + run on an isolated :5200 instance; confirm the board shows PAT-visible repos that are not locally registered, and `api/status-monitor/github/prs` serves one of them
- [x] 2.2 Confirm 404 for a repo the PAT cannot see, and that panel behavior with `gh` broken (unauthenticated/missing) falls back to today's registry-only behavior
- [x] 2.3 Playwright: tile for a fleet-only repo expands to PR list and detail in the real UI

## 3. Ship

- [x] 3.1 `openspec validate github-repos-from-pat --strict` passes; update understanding-app if the explanation changes
- [ ] 3.2 Deploy via `swap.ps1` (auto-keep armed), operator confirms fleet-only repos visible on live
