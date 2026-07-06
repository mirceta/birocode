# Tasks: auto-understanding-after-turn

## 1. Backend — turn-end hook (chat module)

- [x] 1.1 `RunSession`: completion callback installed at creation, invoked once inside
      `Complete()`'s single-transition guard with (repoId, lane, status, sessionId)
- [x] 1.2 `RunSessionService`: install the callback in `TryBeginRun` and surface it as a
      `RunCompleted` event; handler exceptions caught + logged, never block completion

## 2. Backend — setting + coalescing (understanding module)

- [x] 2.1 `RepositoryConfig.AutoUnderstanding` (bool, default false) + registry mutation,
      mirroring the `Visibility` pattern
- [x] 2.2 `UnderstandingController`: `GET /api/understanding/auto` → `{ enabled }` and
      `POST /api/understanding/auto { enabled }`, repo-scoped via X-Repo-Id
- [x] 2.3 `UnderstandingJobs.EnqueueLatest`: start now if idle/terminal, else overwrite the
      repo's single pending slot; chain the pending run when the in-flight one goes terminal
- [x] 2.4 `AutoUnderstandingTrigger` service subscribing to `RunCompleted` (builder lane +
      done + sessionId + flag on → EnqueueLatest); wire in `UnderstandingModuleExtensions`

## 3. Frontend — dock toggle

- [x] 3.1 `PinnedAgent.jsx`: auto toggle beside the Ask button (same `understandingAgent`
      gate), load on mount/repo-change via GET, flip via POST
- [x] 3.2 Nudge the existing understanding status poll when the builder chat stream reports
      `done` while auto is on, so auto-run progress appears without refresh
- [x] 3.3 CSS + i18n (en/tr) for the toggle and its hint

## 4. Verify + ship hygiene

- [x] 4.1 Backend E2E on isolated port: enable auto, complete a turn, observe understanding
      job start + Console events; disabled repo and error-turn cases stay silent
      (`.claudeweb-preview/playwright/verify-auto-understanding.mjs` on :5217)
- [x] 4.2 Coalescing check: two turns while a run is in flight → exactly one follow-up run
      for the newest session (2 started events total; host log shows run B = the new
      conversation's session, not the resumed one)
- [x] 4.3 Playwright on isolated port: toggle visible in Advanced only, persists across
      reload; restore any flipped flag in shared repositories.json (test-isolation rule)
      (`verify-auto-understanding-toggle.mjs` on :5218 with its own CLAUDEWEB_DATADIR,
      so no shared-file restore was needed)
- [x] 4.4 `openspec validate --strict` + update understanding-app if the explanation is due
