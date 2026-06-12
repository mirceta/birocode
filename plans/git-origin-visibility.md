# Git tab — full origin visibility

> **Status (2026-06-12):** Deployed and confirmed. Live on :5099 (hardened
> pipeline: health=True in 2s, first try), browser-verified
> (`verify-git-origin-visibility.mjs`, 14/14 incl. a manufactured-drift
> fixture repo) and confirmed by the End User.

## Problem

On a feature branch X the Git tab compares X against its upstream
(origin/X) and against the LOCAL base branch — but never against
**origin/main**, and never says whether local main itself is stale. On
2026-06-12 this hid real drift: the tab said "5 commits ahead of main"
while origin/main had moved on (files-tree-view was merged there); the
"ahead" claim was true only of a stale local main.

The tab stays **read-only** (re-affirmed by the user 2026-06-12, after
considering action buttons). Why: a button-triggered git mutation can fire
while Claude is mid-run in the same repo (rebase/commit/build in flight) —
the agent performs all mutations through chat, where that coordination is
visible. This time the reason is written down.

## Design

For branch X the branch card shows every position that matters:

- `origin/X` — existing upstream ahead/behind (unchanged).
- base (existing `baseBranch` row, local main/master — unchanged).
- **NEW** `origin/main` (or origin/master): X compared against the
  remote-tracking base directly (`originBaseBranch`/`Ahead`/`Behind`).
  Hidden when it would duplicate another row (== upstream, == baseBranch).
- **NEW drift warning**: when local base ≠ origin/base, a ⚠ row says
  "local main is N behind / M ahead of origin". Hidden on the base branch
  itself (the upstream row already covers it).
- **NEW staleness honesty**: "origin state as of HH:mm" from
  `.git/FETCH_HEAD`'s mtime ("not fetched yet" when absent), next to the
  existing Check origin button. Cheap loads keep using locally-known
  origin refs; Check origin remains the explicit fetch.

Base detection: local base = first existing of `main`, `master`; origin
base = first of `origin/main`, `origin/master` — detected independently
(a repo can have `master` locally and nothing pushed, etc.).

## Implementation

1. `GitService.Status` — new fields on `StatusResult`: `LocalBaseBranch`,
   `OriginBaseBranch`, `OriginBaseAhead/Behind` (HEAD vs origin base),
   `BaseDriftAhead/Behind` (local base vs origin base), `FetchedAt`
   (FETCH_HEAD mtime). Shared `CountLeftRight` helper replaces the inline
   rev-list parsing in `CompareToBase`.
2. `GitController.Status` — pass the new fields through. Read-only; no new
   endpoints.
3. `Git.jsx` — origin-base row (reuses the parameterized `git.baseAhead`/
   `baseBehind`/`baseInSync` keys with base="origin/main"), drift row,
   fetched-at label. `git.css`: drift + fetched-at styles.
4. i18n: `git.driftBehind`, `git.driftAhead`, `git.fetchedAt`,
   `git.neverFetched` (en + tr).

## Verification

`verify-git-origin-visibility.mjs` on :5201: the real repo's Git tab shows
the origin/main row and fetched-at label with numbers matching the API; a
THROWAWAY repo with a file:// origin manufactured to have local main 1
behind origin/main (registered via the projects API, cleaned up after)
proves the drift fields and the ⚠ row render. Screenshot read before
claiming success.
