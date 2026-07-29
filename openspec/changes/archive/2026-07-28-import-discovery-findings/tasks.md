# Tasks: import-discovery-findings

## 1. Backend — import endpoint + merge reuse

- [x] 1.1 Add `POST /api/local-apps/cache/import` to `LocalAppsController`: read the raw body (bounded ~1 MB), trim, wrap a bare `[...]` array as `{"apps": ...}` (design D1), validate via `LocalAppExposureReport.Parse`, return 400 with the parse message on any failure with the cache untouched (normalization extracted to `LocalAppExposureReport.ParseImport` for testability)
- [x] 1.2 On valid payload: merge via `_cache.Save(repo.Id, report, DateTimeOffset.UtcNow)` (design D2); if no scan is in flight, seed the in-memory job from the merged record so status/Run/Check see the union; if a scan is running, leave the job alone (design D3 — `SeedFromCache` already never clobbers a Running job)
- [x] 1.3 Return the updated `CacheBody` snapshot on success and emit a `cache` Event Console entry ("imported N findings — merged into cache (M total)")

## 2. Backend — tests

- [x] 2.1 Merge tests in `tests/ClaudeWeb.Tests`: import into empty cache, import unions with existing ports (add / replace / keep), imported findings stamped with import time, duplicate port within one payload keeps first (`LocalAppImportTests.cs`)
- [x] 2.2 Validation tests: malformed JSON, non-array/non-object payload, finding with missing name/folder or out-of-range port — each rejected whole with cache file unchanged
- [x] 2.3 Endpoint tests: bare array and `{apps:[...]}` both accepted; success returns snapshot containing the union; error paths return explicit messages (ParseImport unit tests + headless endpoint checks in 4.2)

## 3. Frontend — panel import UI

- [x] 3.1 Add `importFindings(json)` action to `useLocalAppDiscovery` posting to the new endpoint and applying the returned snapshot (same pattern as `deleteCached`; raw body via new `apiPostText` helper so the server stays the single validator)
- [x] 3.2 Import affordance in `DiscoverAppsPanel.jsx`: Import button toggling an inline area with a paste textarea, a `.json` file picker that fills the textarea via FileReader, submit + cancel; per-import error text inside the area, list stays actionable (design D5)
- [x] 3.3 Styles in `dashboard.css` following `phone__discover-*`; i18n strings in `en.json` + `tr.json`; stays under the existing `localAppDiscovery` Advanced capability

## 4. Verify + ship gates

- [x] 4.1 `npm --prefix client run build` and isolated `dotnet build` pass; `tests/ClaudeWeb.Tests` green (32/32)
- [x] 4.2 Headless Playwright pass per `docs/claude-web/browser-testing.md`: open panel, import a pasted array (new + overlapping port), rows appear with fresh age, invalid paste shows error and leaves list intact (`.preview-test/discover-import-check.mjs`, 16/16 PASS against an isolated :5200 instance)
- [x] 4.3 `openspec validate import-discovery-findings --strict` passes; update `understanding-app/` with the import flow
- [x] 4.4 Manual acceptance on live: user imports a real agent-produced JSON array and confirms the union (operator accepted on live 2026-07-28 — "keep it")
