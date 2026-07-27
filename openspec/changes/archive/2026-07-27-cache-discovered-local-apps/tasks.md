## 1. Backend — cache store + write-through

- [x] 1.1 Add `LocalAppDiscoveryCache` service (harness data dir, one JSON file per repo id): `Save(repoId, report, finishedAt)` serializes the typed report + finish time; `Load(repoId)` returns the cached report + `cachedAt` or a miss; owns the file path so no other layer hard-codes it. Register it in the StructuredAsk module extensions.
- [x] 1.2 In `LocalAppDiscoveryJobs.StartNew` on success (`MarkDone`), write-through to the cache best-effort — a cache-write exception is caught and ignored so the discovery still reports success (Event Console "done" note now says "cached for reuse").
- [x] 1.3 `LocalAppsController`: add `GET /api/local-apps/cache` — resolve the caller's repo, `Load` its cache, and return the existing `JobBody` shape with `status: "done"`, `apps` (each `running` recomputed live via `_runner.IsListening`), and a `cachedAt`; on a miss return an explicit `status: "no-cache"`. No agent run, no repo mutation, no registration. Also `SeedFromCache` rehydrates a Done job so per-row Run/Check work after a load.

## 2. Frontend — Load cache button

- [x] 2.1 `PinnedAgent.jsx`: add a "Load cache" button next to `phone__discover-btn` that GETs `/local-apps/cache` and sets the same `discovery` state so register / Run / Check rows render identically; show the cache age, and the "no cache — run Discover first" hint on a miss.
- [x] 2.2 Keep "Discover local apps" unchanged as the agent rediscover path; a successful discover refreshes what a later Load returns (via write-through).
- [x] 2.3 i18n keys in `en.json` + `tr.json` (button label, cache-age label, no-cache hint); the button sits in the same Advanced-gated `phone__discover` block as the existing discover affordance.

## 3. Understanding app + verify

- [x] 3.1 Refresh `understanding-app/index.html` to show write-through-on-success + load-vs-rediscover (per repo convention) — interactive dock/disk simulator with a restart control.
- [~] 3.2 Build client + `dotnet build` (isolated self-dev dir) — DONE, both compile clean (0 errors). End-to-end runtime exercise (Discover → cache file written; restart → Load returns apps with live `running`; Load with no cache → no-cache) is left as the operator's acceptance test, per the no-untested-merge convention.
- [x] 3.3 `openspec validate cache-discovered-local-apps --strict`.
