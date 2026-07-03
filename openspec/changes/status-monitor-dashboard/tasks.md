## 1. Audit & wiring

- [ ] 1.1 Audit collector source records: confirm per-source status, last-successful-poll timestamp, and latest-activity data available for the board (design open question); note gaps
- [ ] 1.2 Add `StatusApp` service mirroring `EventsApp` (serve `status-app/` build-less, no-store, explicit empty state) and mount it in `LocalProxyController` under a fixed app id

## 2. Board endpoint

- [ ] 2.1 `GET api/status-monitor/board`: fleet section projected from collector sources (name, status taxonomy, last-seen, latest activity)
- [ ] 2.2 Attention derivation server-side: refusal-state sources + stale sources (threshold), ordered most-actionable-first; explicit all-clear representation
- [ ] 2.3 `GitHubStatusService`: configured repo list (settings), PRs + review state + latest default-branch workflow run via github-credentials PAT, ≥60s cache, PAT never leaves the server
- [ ] 2.4 Wire github section into the board response; degrade gracefully (github section carries its own error/staleness rather than failing the board)

## 3. Wallboard SPA (`status-app/`)

- [ ] 3.1 Layout: attention queue on top (largest), fleet cards mid, GitHub tiles bottom; dark high-contrast, readable from across a desk on a small monitor
- [ ] 3.2 Poll + diff-render loop (no flicker), last-updated clock, full-bleed staleness banner on consecutive poll failures over dimmed last-known content
- [ ] 3.3 Refusal labels match the events-app taxonomy (ip-blocked with rejected IP, needs-credential, bad-credential, throttled)

## 4. Verify & document

- [ ] 4.1 `openspec validate status-monitor-dashboard --strict` passes
- [ ] 4.2 Browser-verify (per docs/claude-web/browser-testing.md) through the proxy path: board renders, attention ordering correct, staleness banner appears when the harness is stopped
- [ ] 4.3 Live check against the real fleet: at least one refusal-state source and one dark machine render correctly on the third monitor
- [ ] 4.4 Update the Understanding app; note the deferred follow-ups (feed enrichment with awaiting-input/current-task/context %, burn-rate panel, acting from the board)
