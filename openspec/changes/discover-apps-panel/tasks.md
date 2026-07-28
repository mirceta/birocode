# Tasks: discover-apps-panel

## 1. Backend — cache union + per-finding age

- [ ] 1.1 Add `DiscoveredAt` to the cached finding model in `LocalAppDiscoveryCache.cs`, defaulting to the file's `CachedAt` when absent so pre-union cache files still load (design D4)
- [ ] 1.2 Rework `LocalAppDiscoveryCache.Save` to union-by-port: load existing cache, add new ports, replace matching ports with the newer finding (stamped with this scan's finish time), keep unmatched cached ports, write merged; return the merged report (design D3)
- [ ] 1.3 In `LocalAppDiscoveryJobs`, store the merged report returned by `Save` as the job result (`MarkDone(merged)`) so status reads, Run-by-port, and running checks see the union
- [ ] 1.4 Add `LocalAppDiscoveryCache.Delete(repoId, port)`: remove one finding; leave a valid cached-empty file when the last finding is deleted; report no-cache / port-not-found distinctly
- [ ] 1.5 Unit tests in `tests/ClaudeWeb.Tests`: partial rescan keeps earlier findings, matching port refreshed not duplicated, pre-union file loads with defaulted `DiscoveredAt`, delete removes one / leaves cached-empty / errors on no match

## 2. Backend — cache-edit endpoint

- [ ] 2.1 Add `DELETE /api/local-apps/cache/{port}` to `LocalAppsController`: resolve current repo, call cache delete, also remove the finding from any in-memory job result for that repo, return the updated snapshot (design D5)
- [ ] 2.2 Explicit error responses for no-cache and port-not-found; verify Run for a deleted port is rejected and a status poll no longer returns the deleted record
- [ ] 2.3 Unit/integration tests for the endpoint: happy path returns updated snapshot; delete-last yields cached-empty on next load; no-match errors; repo files untouched

## 3. Frontend — extract shared discovery state

- [ ] 3.1 Extract the discovery state, polling, and actions (discover, loadCache, check, run, register) from `PinnedAgent.jsx` into a `useLocalAppDiscovery` hook, preserving the existing mount/repo-change reattach and 5s poll cadence (design D1)
- [ ] 3.2 Add a `deleteCached(port)` action to the hook calling the new DELETE endpoint and applying the returned snapshot

## 4. Frontend — slim dock + overlay panel

- [ ] 4.1 Reduce the dock's discover section to two buttons: Discover (shows running state) and open-panel; remove the inline findings list, messages, and the Load cache button (design D2)
- [ ] 4.2 New `DiscoverAppsPanel.jsx` overlay on the dock container: findings list with per-row register / Run / Check / delete, live running dot, per-row `discoveredAt` age, cache-level latest-scan line, job state (running/error), no-cache guidance, and a load-from-cache action
- [ ] 4.3 Panel opened during an in-flight scan reflects it live via the shared hook's poll (no reopen needed)
- [ ] 4.4 Styles in `dashboard.css` following the existing `phone__discover-*` language; i18n strings in `en.json` + `tr.json`; panel + dock buttons stay under the existing `localAppDiscovery` Advanced capability in `UiModeContext.jsx`

## 5. Verify + ship gates

- [ ] 5.1 `npm --prefix client run build` and `dotnet build` (isolated per self-dev doc) pass; run `tests/ClaudeWeb.Tests`
- [ ] 5.2 Headless Playwright pass per `docs/claude-web/browser-testing.md`: two-button dock, panel opens/closes, rows render with age, delete removes a row, no-cache guidance
- [ ] 5.3 Manual end-to-end on this repo: run discovery (partial ok), confirm union with an older cache, delete a record, restart harness, load cache — union minus deleted record survives
- [ ] 5.4 `openspec validate discover-apps-panel --strict` passes; update `understanding-app/` with the new flow
