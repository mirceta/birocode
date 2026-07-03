## 1. Audit & wiring

- [x] 1.1 Repo-list derivation: parse each registered Repo's `origin` remote to `owner/name`, dedupe, skip non-GitHub remotes (design decision 3)
- [x] 1.2 Confirm the events-app serving contract for sibling pages: `events-app/board.html` reachable through the proxy path, no-store honored, plain 404 when absent (no new serving code expected)

## 2. Board endpoint

- [x] 2.1 `GET api/status-monitor/board`: fleet section projected from collector sources (name, status taxonomy, state duration, latest activity); track state-transition times in the board service (collector `lastPolledAt` = last attempt, not last success — design decision 5)
- [x] 2.2 Attention derivation server-side: refusal-state sources + dark sources (threshold), ordered most-actionable-first; explicit all-clear representation; duration-unknown after harness restart
- [x] 2.3 `GitHubStatusService`: repo list from 1.1, PRs + review state + latest default-branch workflow run via github-credentials PAT, ≥60s cache, PAT never leaves the server
- [x] 2.4 Wire github section into the board response; degrade gracefully (github section carries its own error/staleness rather than failing the board)

## 3. Wallboard page (`events-app/board.html`)

- [x] 3.1 Self-contained `board.html` (no shared page-level code with `index.html`): attention queue on top (largest), fleet cards mid, GitHub tiles bottom; dark high-contrast, readable from across a desk on a small monitor
- [x] 3.2 Poll + diff-render loop (no flicker), last-updated clock, full-bleed staleness banner on consecutive poll failures over dimmed last-known content
- [x] 3.3 Refusal labels match the events-app taxonomy (ip-blocked with rejected IP, needs-credential, bad-credential, throttled)

## 4. Verify & document

- [x] 4.1 `openspec validate status-monitor-dashboard --strict` passes
- [x] 4.2 Browser-verify (per docs/claude-web/browser-testing.md) through the proxy path: board renders, attention ordering correct, staleness banner appears when the harness is stopped
- [ ] 4.3 Live check against the real fleet: at least one refusal-state source and one dark machine render correctly on the third monitor
- [x] 4.4 Update the Understanding app; note the deferred follow-ups (feed enrichment with awaiting-input/current-task/context %, burn-rate panel, acting from the board)
