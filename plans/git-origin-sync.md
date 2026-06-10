# Git origin sync — real local-vs-origin discrepancy on the Git tab

> **Status (2026-06-10):** Implemented on `feature/git-origin-sync` and
> browser-verified on an isolated preview instance on :5201
> (`.claudeweb-preview/playwright/verify-git-origin-sync.mjs`, 7/7 checks).
> Not yet deployed to :5099.

## Problem

The Git tab's ↑ahead/↓behind compares against the *locally cached*
remote-tracking ref, which is only as fresh as the last fetch — so the End
User can be looking at stale numbers. Branches with no upstream show nothing
at all, hiding the fact that local work was never pushed to origin.

## Scope

Backend (`GitService` / `GitController`):

- `Status(workingDir, fetch)` — when `fetch` is true, run `git fetch --quiet`
  first so ahead/behind reflects the real origin. A failed fetch (offline,
  auth) is tolerated and reported as `fetchError` instead of failing the
  whole status call.
- `GET /api/git/status?fetch=true` — passes the flag through; response gains
  `fetched` (bool) and `fetchError` (string|null).
- `RunGit` sets `GIT_TERMINAL_PROMPT=0` so a credential prompt fails fast
  instead of hanging the request.

Frontend (`pages/Git.jsx`):

- Initial load stays fast (no fetch). The Refresh button becomes
  "check origin": calls `?fetch=true` and shows a checking state.
- Branch header: explicit "Not published to origin" line when the branch has
  no upstream; small warning note when the fetch failed.
- i18n: `git.checkOrigin`, `git.checking`, `git.noUpstream`, `git.fetchError`
  (en/tr).
