## 1. Backend — cache store + write-through

- [ ] 1.1 Add `LocalAppDiscoveryCache` service (harness data dir, one JSON file per repo id): `Save(repoId, report, finishedAt)` serializes the typed report + finish time; `Load(repoId)` returns the cached report + `cachedAt` or a miss; owns the file path so no other layer hard-codes it. Register it in the StructuredAsk module extensions.
- [ ] 1.2 In `LocalAppDiscoveryJobs.StartNew` on success (`MarkDone`), write-through to the cache best-effort — a cache-write exception is caught and ignored so the discovery still reports success (add an Event Console note on write vs skip if it fits the existing boundary emits).
- [ ] 1.3 `LocalAppsController`: add `GET /api/local-apps/cache` — resolve the caller's repo, `Load` its cache, and return the existing `JobBody` shape with `status: "done"`, `apps` (each `running` recomputed live via `_runner.IsListening`), and a `cachedAt`; on a miss return an explicit `status: "no-cache"`. No agent run, no repo mutation, no registration.

## 2. Frontend — Load cache button

- [ ] 2.1 `PinnedAgent.jsx`: add a "Load cache" button next to `phone__discover-btn` that GETs `/local-apps/cache` and sets the same `discovery` state so register / Run / Check rows render identically; show the cache age, and the "no cache — run Discover first" hint on a miss.
- [ ] 2.2 Keep "Discover local apps" unchanged as the agent rediscover path; ensure a successful discover refreshes what a later Load returns (already true via write-through).
- [ ] 2.3 i18n keys in `en.json` + `tr.json` (button label, cache-age label, no-cache hint); gate the button Advanced-mode consistent with the existing discover affordance.

## 3. Understanding app + verify

- [ ] 3.1 Refresh `understanding-app/index.html` to show write-through-on-success + load-vs-rediscover (per repo convention).
- [ ] 3.2 Build client + `dotnet build` (isolated self-dev dir); exercise: Discover → confirm cache file written; restart harness → Load cache returns the apps with live `running`; Load with no cache → explicit no-cache state.
- [ ] 3.3 `openspec validate cache-discovered-local-apps --strict`.
