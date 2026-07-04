# Tasks: github-pr-browser

## 1. Backend

- [x] 1.1 `GitHubPrService`: per-key (repo / repo#number) cache with ~30s TTL and single-flight refresh; `gh api graphql` invocation and owner/name parsing shared with or mirrored from `GitHubStatusService`; repo parameter validated against the derived registered-repo list
- [x] 1.2 PR-list query + DTO: open PRs for one repo — number, title, author, headRefName, isDraft, reviewDecision, per-PR statusCheckRollup state, createdAt (`first: 50`)
- [x] 1.3 PR-detail query + DTO: title, body, author, base/head refs, mergeable, checks (name+state, `first: 50`), files (path, additions, deletions, `first: 100`), reviews/comments counts, url
- [x] 1.4 `StatusMonitorController`: `GET github/prs?repo=` and `GET github/pr?repo=&number=` → DTOs; 404 for unknown repo; panel-level error payload (status + error) instead of HTTP 5xx for GitHub failures

## 2. Frontend (events-app/index.html)

- [x] 2.1 Make repo tiles clickable outside display mode (cursor, hover affordance, aria); click toggles the drill-down panel; no-op in display mode
- [x] 2.2 PR list panel: fetch `github/prs`, render rows (number, title, author, branch, draft/review badge, CI dot, age), inline error state, close affordance, diff-render like other sections
- [x] 2.3 PR detail view: fetch `github/pr`, render escaped body (paragraphs + autolinked http(s) URLs only), branches, mergeability, checks, files with +/- stats, review/comment counts, back affordance, "open on GitHub" external link
- [x] 2.4 Styles for panel/rows/badges consistent with the existing board look, including display-mode CSS guard

## 3. Verify & ship

- [x] 3.1 Browser-verify per `docs/claude-web/browser-testing.md`: tile click opens list, PR click opens detail, back works, hostile-body escape holds (inject a `<script>`/`<img onerror>` body in a fixture or a real PR), display mode non-interactive, panel error state on forced failure
- [ ] 3.2 `openspec validate github-pr-browser --strict`; update the Understanding app for the new drill-down flow; deploy via `swap.ps1` (auto-keep watcher per memory) and confirm on live
